import { describe, expect, test } from "vitest";

import { Easing, easings } from "./easings";

// Exhaustive list of built-in easing names. The `satisfies` clause ensures
// every entry is a valid `Easing` name, if a name is removed from the union,
// this file fails to compile.
const NAMED_EASINGS = [
  "linear",
  "quadraticIn",
  "quadraticOut",
  "quadraticInOut",
  "cubicIn",
  "cubicOut",
  "cubicInOut",
  "exponentialIn",
  "exponentialOut",
  "exponentialInOut",
] as const satisfies readonly Exclude<Easing, (k: number) => number>[];

describe("easings", () => {
  test("every named easing resolves to a function and maps endpoints to [0, 1]", () => {
    for (const name of NAMED_EASINGS) {
      const fn = easings[name];
      expect(typeof fn).toBe("function");
      expect(fn(0)).toBeCloseTo(0);
      expect(fn(1)).toBeCloseTo(1);
    }
  });

  test("easings record keys match the documented set exactly", () => {
    expect(Object.keys(easings).sort()).toEqual([...NAMED_EASINGS].sort());
  });

  test("in-out variants are symmetric around 0.5", () => {
    const pairs: [Exclude<Easing, (k: number) => number>, number][] = [
      ["quadraticInOut", 0.5],
      ["cubicInOut", 0.5],
      ["exponentialInOut", 0.5],
    ];
    for (const [name, mid] of pairs) {
      expect(easings[name](0.5)).toBeCloseTo(mid);
    }
  });
});
