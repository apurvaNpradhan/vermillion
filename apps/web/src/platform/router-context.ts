import type { QueryClient } from "@tanstack/react-query";
import type { i18n } from "i18next";

/** Available to every route's `beforeLoad`, `loader` and `head`. */
export type RouterContext = { queryClient: QueryClient; i18n: i18n };
