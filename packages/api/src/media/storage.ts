import { createHash } from "node:crypto";

import { AwsClient, AwsV4Signer } from "aws4fetch";

export type ObjectStoreConfig = {
  /** S3 API origin: `https://<account>.r2.cloudflarestorage.com`, or the MinIO of development. */
  endpoint: string;
  /** `auto` for R2. */
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

/** A presigned request: the client sends `headers` with the body to `url`. */
export type SignedUpload = {
  url: string;
  /** Signed with the URL: the store refuses a request whose type or length differs. */
  headers: { "Content-Type": string; "Content-Length": string };
  expiresAt: Date;
};

export type SignedDownload = { url: string; expiresAt: Date };

/**
 * The private bucket of user media (ADR 0040), over the S3 API. Bytes never pass through the
 * server: it signs URLs and deletes objects. One interface, so tests run against the real
 * MinIO and production against R2.
 */
export type ObjectStore = {
  signPut(
    key: string,
    options: { contentType: string; contentLength: number; expiresInSeconds: number },
  ): Promise<SignedUpload>;
  signGet(key: string, options: { expiresInSeconds: number }): Promise<SignedDownload>;
  /** Whether the object exists (a HEAD request). */
  exists(key: string): Promise<boolean>;
  /** Deleting an object that is not there succeeds. */
  deleteObject(key: string): Promise<void>;
  /** Deletes every object whose key starts with `prefix` and returns how many it deleted. */
  deletePrefix(prefix: string): Promise<number>;
};

/** A failed call to the bucket. Carries the status only: bodies can echo keys and credentials. */
export class ObjectStoreError extends Error {
  readonly status: number;
  constructor(action: string, status: number) {
    super(`Object store ${action} failed with status ${status}`);
    this.name = "ObjectStoreError";
    this.status = status;
  }
}

const LIST_PAGE = 1000;

/** The text between `<tag>` and `</tag>` for every occurrence. */
function xmlValues(xml: string, tag: string): string[] {
  return [...xml.matchAll(new RegExp(`<${tag}>([^<]*)</${tag}>`, "g"))].map((match) =>
    decodeXml(match[1] ?? ""),
  );
}

function decodeXml(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function encodeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export type ObjectStoreOptions = {
  /** Replaces `fetch` for the HEAD check (tests fake the store there). */
  fetch?: typeof fetch;
};

export function createObjectStore(
  config: ObjectStoreConfig,
  options: ObjectStoreOptions = {},
): ObjectStore {
  const base = config.endpoint.replace(/\/+$/, "");
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: "s3",
    region: config.region,
    // Retrying a delete or a list is safe; uploads are signed URLs the device calls itself.
    retries: 2,
  });

  // Path-style addressing: R2, MinIO and AWS all accept `endpoint/bucket/key`.
  const objectUrl = (key: string) =>
    `${base}/${config.bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
  const bucketUrl = (query: Record<string, string>) => {
    const url = new URL(`${base}/${config.bucket}`);
    for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);
    return url.toString();
  };

  async function presign(
    method: "PUT" | "GET" | "HEAD",
    key: string,
    expiresInSeconds: number,
    headers: Record<string, string>,
  ) {
    const url = new URL(objectUrl(key));
    url.searchParams.set("X-Amz-Expires", String(expiresInSeconds));
    const signer = new AwsV4Signer({
      method,
      url: url.toString(),
      headers,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      service: "s3",
      region: config.region,
      signQuery: true,
      // Content-Type and Content-Length are normally left out of the signature; signing them is
      // what makes the store refuse an upload of another type or length.
      allHeaders: true,
    });
    const signed = await signer.sign();
    return {
      url: signed.url.toString(),
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
    };
  }

  return {
    async signPut(key, { contentType, contentLength, expiresInSeconds }) {
      const headers = {
        "Content-Type": contentType,
        "Content-Length": String(contentLength),
      };
      const signed = await presign("PUT", key, expiresInSeconds, headers);
      return { ...signed, headers };
    },

    signGet: (key, { expiresInSeconds }) => presign("GET", key, expiresInSeconds, {}),

    async exists(key) {
      const { url } = await presign("HEAD", key, 60, {});
      const response = await (options.fetch ?? fetch)(url, {
        method: "HEAD",
        signal: AbortSignal.timeout(10_000),
      });
      if (response.status === 404) return false;
      if (!response.ok) throw new ObjectStoreError("head", response.status);
      return true;
    },

    async deleteObject(key) {
      const response = await client.fetch(objectUrl(key), { method: "DELETE" });
      // S3 answers 204 for a missing key; a 404 (some stores) is the same outcome.
      if (!response.ok && response.status !== 404) {
        throw new ObjectStoreError("delete", response.status);
      }
    },

    async deletePrefix(prefix) {
      let deleted = 0;
      let token: string | undefined;
      do {
        const listing = await client.fetch(
          bucketUrl({
            "list-type": "2",
            prefix,
            "max-keys": String(LIST_PAGE),
            ...(token ? { "continuation-token": token } : {}),
          }),
        );
        if (!listing.ok) throw new ObjectStoreError("list", listing.status);
        const xml = await listing.text();
        const keys = xmlValues(xml, "Key");
        if (keys.length > 0) {
          const body = `<?xml version="1.0" encoding="UTF-8"?><Delete><Quiet>true</Quiet>${keys
            .map((key) => `<Object><Key>${encodeXml(key)}</Key></Object>`)
            .join("")}</Delete>`;
          const response = await client.fetch(bucketUrl({ delete: "" }), {
            method: "POST",
            body,
            // S3 requires an integrity header on a multi-object delete.
            headers: {
              "Content-Type": "application/xml",
              "Content-MD5": createHash("md5").update(body).digest("base64"),
            },
          });
          if (!response.ok) throw new ObjectStoreError("delete-batch", response.status);
          // Quiet mode lists only failures.
          if ((await response.text()).includes("<Error>")) {
            throw new ObjectStoreError("delete-batch", 200);
          }
          deleted += keys.length;
        }
        token =
          xmlValues(xml, "IsTruncated")[0] === "true"
            ? xmlValues(xml, "NextContinuationToken")[0]
            : undefined;
      } while (token);
      return deleted;
    },
  };
}
