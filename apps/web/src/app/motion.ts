/**
 * Keeps Angular lifecycle animation classes out of reconnect recovery and out
 * of reduced-motion sessions. CSS retains the matching media-query safeguard.
 */
export function motionClass(enabled: boolean, className: string): string {
  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  return enabled && !reducedMotion ? className : '';
}
