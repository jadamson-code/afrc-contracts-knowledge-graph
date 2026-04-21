export const linear = (k: number): number => k;

export const quadraticIn = (k: number): number => k * k;

export const quadraticOut = (k: number): number => k * (2 - k);

export const quadraticInOut = (k: number): number => {
  if ((k *= 2) < 1) return 0.5 * k * k;
  return -0.5 * (--k * (k - 2) - 1);
};

export const cubicIn = (k: number): number => k * k * k;

export const cubicOut = (k: number): number => --k * k * k + 1;

export const cubicInOut = (k: number): number => {
  if ((k *= 2) < 1) return 0.5 * k * k * k;
  return 0.5 * ((k -= 2) * k * k + 2);
};

export const exponentialIn = (k: number): number => (k === 0 ? 0 : Math.pow(2, 10 * (k - 1)));

export const exponentialOut = (k: number): number => (k === 1 ? 1 : 1 - Math.pow(2, -10 * k));

export const exponentialInOut = (k: number): number => {
  if (k === 0) return 0;
  if (k === 1) return 1;
  if (k < 0.5) return Math.pow(2, 10 * (2 * k - 1)) / 2;
  return (2 - Math.pow(2, -10 * (2 * k - 1))) / 2;
};

/**
 * Registry of built-in named easing functions.
 * Typed with `satisfies` so that `keyof typeof easings` yields the literal
 * union of names — the `Easing` type below can't drift from this record.
 */
export const easings = {
  linear,
  quadraticIn,
  quadraticOut,
  quadraticInOut,
  cubicIn,
  cubicOut,
  cubicInOut,
  exponentialIn,
  exponentialOut,
  exponentialInOut,
} satisfies Record<string, (k: number) => number>;

/**
 * An easing is either the name of a built-in function or a custom function
 * mapping a progress value in [0, 1] to an eased value (typically in [0, 1]).
 */
export type Easing = keyof typeof easings | ((k: number) => number);

/**
 * Resolves an `Easing` (name or function) to a concrete function.
 * Falls back to `linear` when the easing is missing.
 */
export function resolveEasing(easing: Easing | undefined): (k: number) => number {
  if (!easing) return easings.linear;
  if (typeof easing === "function") return easing;
  return easings[easing];
}
