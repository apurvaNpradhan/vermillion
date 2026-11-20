import { deviceStorage } from "@/platform/storage";

import { parseReceipt, type ImportReceipt } from "./import-receipt";

const KEY = "history-import-last";

export const readReceipt = (): ImportReceipt | null => parseReceipt(deviceStorage.get(KEY));

export function saveReceipt(receipt: ImportReceipt) {
  deviceStorage.set(KEY, JSON.stringify(receipt));
}

export function clearReceipt() {
  deviceStorage.set(KEY, null);
}
