import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

/*
 * Decorative React Bits enhancements. The prerendered page and the first client render always
 * show `fallback`; the browser then swaps in the animated component, unless the visitor prefers
 * reduced motion, in which case the component is never even downloaded. The animation libraries
 * call timers and random numbers when imported, which Workers forbid outside a request, so the
 * server never imports them.
 */

const reducedMotion = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(reducedMotion);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** True on the server and during hydration, so both render the static fallback. */
function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(reducedMotion).matches,
    () => true,
  );
}

/** Keeps the static fallback when an enhancement's chunk fails to load or throws. */
class FallbackOnError extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Renders `fallback`, then `children` in the browser when motion is allowed. With `nearView`, the
 * swap waits until the block is within a screen of the viewport, so below-the-fold effects load late.
 */
export function Enhance({
  children,
  fallback,
  nearView,
}: {
  children: ReactNode;
  fallback: ReactNode;
  nearView: boolean;
}) {
  const reduced = usePrefersReducedMotion();
  const [visible, setVisible] = useState(!nearView);
  const anchor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = anchor.current;
    if (!nearView || !element) return;
    // Old browsers without IntersectionObserver keep the static fallback.
    if (!("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "100% 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [nearView]);

  const content =
    reduced || !visible ? (
      fallback
    ) : (
      <FallbackOnError fallback={fallback}>
        <Suspense fallback={fallback}>{children}</Suspense>
      </FallbackOnError>
    );
  return nearView ? (
    <div ref={anchor} className="enhance">
      {content}
    </div>
  ) : (
    content
  );
}

export const CircularText = lazy(() => import("../vendor/react-bits/CircularText.tsx"));
export const Noise = lazy(() => import("../vendor/react-bits/Noise.tsx"));
export const SplitText = lazy(() => import("../vendor/react-bits/SplitText.tsx"));
export const SpotlightCard = lazy(() => import("../vendor/react-bits/SpotlightCard.tsx"));
