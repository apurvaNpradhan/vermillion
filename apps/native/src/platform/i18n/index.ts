import { createI18n } from "@workspace/i18n";

import { resolveDeviceLocale } from "./device-locale";

export { I18nextProvider, useTranslation } from "react-i18next";
export { resolveDeviceLocale } from "./device-locale";
export { useLocale } from "./use-locale";

/** One instance for the app, started in the device's language. */
export const i18n = createI18n(resolveDeviceLocale());
