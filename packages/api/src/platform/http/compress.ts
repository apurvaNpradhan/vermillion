import type { MiddlewareHandler } from "hono";
import { compress } from "hono/compress";

/** Compresses responses; every response here is finite, so none is excluded. */
export const compressResponses: MiddlewareHandler = compress();
