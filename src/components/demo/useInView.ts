import { useEffect, useState, type RefObject } from "react";

/**
 * Whether an element is on screen, at least `threshold` of it. A piece that
 * moves (the replay, the question cards) moves only while it can be seen.
 * Without IntersectionObserver it counts as seen.
 */
export function useInView(ref: RefObject<Element | null>, threshold = 0.25): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => setInView(entries[entries.length - 1]?.isIntersecting ?? false),
      { threshold }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, threshold]);
  return inView;
}
