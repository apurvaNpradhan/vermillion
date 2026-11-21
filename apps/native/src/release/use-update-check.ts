import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";

import { appConfig } from "@/platform/app-config";
import { client } from "@/platform/orpc";
import { deviceStorage } from "@/platform/storage";

import {
  isCheckDue,
  parseStoredCheck,
  recordAnswer,
  serializeCheck,
  updateView,
  type StoredCheck,
} from "./update-check";

const STORAGE_KEY = "release.check";

/** The newest GitHub release, where the Android APK is attached (the site has no download page). */
export const DOWNLOAD_URL = `https://github.com/${appConfig.releases.owner}/${appConfig.releases.repo}/releases/latest`;

function readStored() {
  return parseStoredCheck(deviceStorage.get(STORAGE_KEY));
}

function writeStored(check: StoredCheck) {
  deviceStorage.set(STORAGE_KEY, serializeCheck(check));
}

/**
 * Whether this build must or may be updated. Asks the server on start and on returning to the
 * foreground, at most once an hour, and keeps the last answer on the device. A failed check
 * changes nothing: the last known answer stands.
 */
export function useUpdateCheck() {
  const [stored, setStored] = useState<StoredCheck | null>(readStored);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (!isCheckDue(readStored(), Date.now())) return;
      try {
        const status = await client.release.status();
        const next = recordAnswer(readStored(), status, Date.now());
        writeStored(next);
        if (!cancelled) setStored(next);
      } catch {
        // Offline or the server is down: keep the last answer.
      }
    };
    void check();
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void check();
    });
    return () => {
      cancelled = true;
      listener.remove();
    };
  }, []);

  const dismiss = useCallback(() => {
    setStored((current) => {
      const version = current?.status.latest?.version;
      if (!current || !version) return current;
      const next = { ...current, dismissed: version };
      writeStored(next);
      return next;
    });
  }, []);

  return { view: updateView(appConfig.version, stored), dismiss };
}
