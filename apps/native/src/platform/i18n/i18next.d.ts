import type { resources } from "@workspace/i18n";

// Typed keys: `t("auth__typo")` fails to compile.
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: (typeof resources)["en"];
  }
}
