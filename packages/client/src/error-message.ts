import type { TFunction } from "i18next";

import { errorMessageKey, type ApiError } from "./orpc-error";

/** The translated text for a failed API call. */
export function errorMessage(t: TFunction, error: ApiError): string {
  return t(errorMessageKey(error));
}
