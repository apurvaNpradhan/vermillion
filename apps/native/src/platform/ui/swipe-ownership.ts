export function releaseSwipeRow(owner: string | null, row: string): string | null {
  "worklet";
  return owner === row ? null : owner;
}

export function dismissSwipeRow(
  open: string | null,
  dragging: string | null,
  except?: string,
): string | null {
  "worklet";
  return open === dragging || open === except ? open : null;
}
