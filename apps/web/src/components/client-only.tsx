import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";

/**
 * Renders `fallback` during prerendering and the first paint, then `children` once mounted.
 * Pair it with the lazy components below: the animation libraries behind them call timers and
 * random numbers when imported, which the Workers runtime forbids outside a request, so the
 * prerendered pages carry the plain version and only the browser loads the animated one.
 */
export function ClientOnly({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <Suspense fallback={fallback}>{children}</Suspense> : fallback;
}

export const CircularText = lazy(() => import("../vendor/react-bits/CircularText.tsx"));
export const Magnet = lazy(() => import("../vendor/react-bits/Magnet.tsx"));
export const Noise = lazy(() => import("../vendor/react-bits/Noise.tsx"));
export const ScrollReveal = lazy(() => import("../vendor/react-bits/ScrollReveal.tsx"));
export const SplitText = lazy(() => import("../vendor/react-bits/SplitText.tsx"));
export const SpotlightCard = lazy(() => import("../vendor/react-bits/SpotlightCard.tsx"));
