import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

import { createImageGate, type ImageGate } from "./image-gate";

const ImageGateContext = createContext<ImageGate | null>(null);

/** Cards inside report their pictures here; the composer waits on it before it captures. */
export function ImageGateProvider({ gate, children }: { gate: ImageGate; children: ReactNode }) {
  return <ImageGateContext.Provider value={gate}>{children}</ImageGateContext.Provider>;
}

/** One gate for a composer's lifetime. */
export function useCreateImageGate(): ImageGate {
  return useMemo(() => createImageGate(), []);
}

/**
 * For a card picture: mount-time registration with the composer's gate, and the callback to call
 * when the picture has loaded or failed. Outside a composer it does nothing.
 */
export function useImageSettle(): () => void {
  const gate = useContext(ImageGateContext);
  const done = useRef<(() => void) | null>(null);
  // A child's effect can report before this one registers (children's effects run first).
  const settledEarly = useRef(false);
  useEffect(() => {
    if (!gate) return;
    const settle = gate.begin();
    done.current = settle;
    if (settledEarly.current) settle();
    return () => {
      settle();
      done.current = null;
    };
  }, [gate]);
  return useCallback(() => {
    settledEarly.current = true;
    done.current?.();
  }, []);
}
