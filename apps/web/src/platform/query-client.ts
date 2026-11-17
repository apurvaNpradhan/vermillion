import { errorMessage } from "@workspace/client/error-message";
import { createQueryClient } from "@workspace/client/query-client";

import { i18n } from "./i18n";
import { toastManager } from "./ui/toast";

/** One query client for the site; failures toast in the visitor's language. */
export const queryClient = createQueryClient({
  onError: (error) => {
    toastManager.add({ type: "error", title: errorMessage(i18n.t, error) });
  },
});
