import { describe, expect, test } from "vitest";

import { hasNewPartialProps } from "./data";

describe("hasNewPartialProps", () => {
  test("returns false when partial is empty", () => {
    expect(hasNewPartialProps({ a: 1, b: 2 }, {})).toBe(false);
  });

  test("returns false when all partial values match", () => {
    expect(hasNewPartialProps({ a: 1, b: "hello", c: true }, { a: 1, c: true })).toBe(false);
  });

  test("returns true when a value differs", () => {
    expect(hasNewPartialProps({ a: 1, b: 2 }, { a: 1, b: 3 })).toBe(true);
  });

  test("returns true when partial has a key not in current", () => {
    expect(hasNewPartialProps({ a: 1 }, { b: 2 })).toBe(true);
  });

  test("returns true on first differing key (short-circuits)", () => {
    let accessCount = 0;
    const partial = new Proxy(
      { a: 999, b: 1 },
      {
        get(target, prop) {
          accessCount++;
          return target[prop as keyof typeof target];
        },
        ownKeys(target) {
          return Object.keys(target);
        },
        getOwnPropertyDescriptor(target, prop) {
          return Object.getOwnPropertyDescriptor(target, prop);
        },
      },
    );
    hasNewPartialProps({ a: 1, b: 1 }, partial);
    // Should access "a" and return true immediately, not check "b"
    expect(accessCount).toBe(1);
  });

  test("distinguishes null, undefined, and missing keys", () => {
    expect(hasNewPartialProps({ a: null }, { a: null })).toBe(false);
    expect(hasNewPartialProps({ a: undefined }, { a: undefined })).toBe(false);
    expect(hasNewPartialProps({ a: null }, { a: undefined })).toBe(true);
    expect(hasNewPartialProps({}, { a: undefined })).toBe(false);
  });

  test("uses strict equality (no coercion)", () => {
    expect(hasNewPartialProps({ a: 0 }, { a: false as unknown as number })).toBe(true);
    expect(hasNewPartialProps({ a: "" }, { a: 0 as unknown as string })).toBe(true);
  });
});
