import { useCallback, useState } from "react";

import { deviceStorage } from "@/platform/storage";

import { choiceKey, readChoice, writeChoice, type ShareChoice } from "./choice";
import type { ShareKind, ShareTemplate, ShareToggle } from "./types";

/**
 * The composer's template, background and toggles, remembered per kind on this device. A choice
 * that cannot be read starts from the defaults, and a device that cannot persist keeps the choice
 * for this visit only.
 */
export function useShareChoice<Id extends string>(
  kind: ShareKind,
  templates: readonly Pick<ShareTemplate<Id>, "id">[],
  toggles: readonly ShareToggle<Id>[],
) {
  const [choice, setChoice] = useState(() =>
    readChoice(deviceStorage.get(choiceKey(kind)), templates, toggles),
  );
  const update = useCallback(
    (patch: Partial<ShareChoice<Id>>) => {
      setChoice((current) => {
        const next = { ...current, ...patch };
        deviceStorage.set(choiceKey(kind), writeChoice(next, toggles));
        return next;
      });
    },
    [kind, toggles],
  );
  return { choice, update };
}
