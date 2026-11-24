import { useEffect, useState, type ComponentType } from "react";

/**
 * Mounts a sheet on its first open instead of with its screen, and keeps it mounted after that so
 * its closing animation still plays. A bottom sheet sets up gesture handlers, animated values and
 * a portal when it mounts, and a screen with a dozen of them paid for all of that on the JS thread
 * before its first draw.
 *
 * A bottom sheet that mounts already open shows nothing, so the first open mounts it closed and
 * opens it one render later: render the sheet only while `mounted`, with `open` as its `isOpen`.
 */
export function useMountOnOpen(isOpen: boolean) {
  const [mounted, setMounted] = useState(false);
  const [settled, setSettled] = useState(false);
  if (isOpen && !mounted) setMounted(true);
  useEffect(() => {
    if (!mounted) return;
    // After the closed sheet has laid out, so the change to open is a change the sheet sees.
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setSettled(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [mounted]);
  return { mounted, open: isOpen && settled };
}

/** {@link useMountOnOpen} around a whole sheet component that takes `isOpen`. */
export function mountOnOpen<P extends { isOpen: boolean }>(Sheet: ComponentType<P>) {
  function Wrapped(props: P) {
    const { mounted, open } = useMountOnOpen(props.isOpen);
    return mounted ? <Sheet {...props} isOpen={open} /> : null;
  }
  Wrapped.displayName = `MountOnOpen(${Sheet.displayName ?? Sheet.name})`;
  return Wrapped;
}
