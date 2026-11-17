import type { ReactNode } from "react";

import { Sheet, SheetHeader, SheetPanel, SheetPopup, SheetTitle } from "@/platform/ui/sheet";

/** Edit forms open in a side sheet over the list. */
export function EditSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <SheetPopup className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <SheetPanel>{children}</SheetPanel>
      </SheetPopup>
    </Sheet>
  );
}
