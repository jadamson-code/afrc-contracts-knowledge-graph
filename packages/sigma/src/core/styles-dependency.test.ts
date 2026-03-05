/**
 * Unit tests for analyzeStyleDependency.
 */
import { analyzeStyleDependency } from "sigma/types";
import { describe, expect, test } from "vitest";

describe("analyzeStyleDependency", () => {
  describe("static styles", () => {
    test("returns 'static' for undefined", () => {
      expect(analyzeStyleDependency(undefined)).toBe("static");
    });

    test("returns 'static' for literal values only", () => {
      expect(analyzeStyleDependency({ color: "#f00", size: 10 })).toBe("static");
    });

    test("returns 'static' for attribute bindings", () => {
      expect(analyzeStyleDependency({ color: { attribute: "color" } })).toBe("static");
    });

    test("returns 'static' for numerical attribute bindings", () => {
      expect(
        analyzeStyleDependency({
          size: { attribute: "score", min: 2, max: 20, minValue: 0, maxValue: 100 },
        }),
      ).toBe("static");
    });

    test("returns 'static' for categorical attribute bindings", () => {
      expect(
        analyzeStyleDependency({
          color: { attribute: "category", dict: { A: "#f00", B: "#0f0" } },
        }),
      ).toBe("static");
    });

    test("returns 'static' for array of static rules", () => {
      expect(
        analyzeStyleDependency([{ color: "#f00" }, { size: { attribute: "size" } }]),
      ).toBe("static");
    });
  });

  describe("item-state styles", () => {
    test("returns 'item-state' for string predicate in rule", () => {
      expect(
        analyzeStyleDependency([{ when: "isHovered", then: { color: "#f00" } }]),
      ).toBe("item-state");
    });

    test("returns 'item-state' for array predicate in rule", () => {
      expect(
        analyzeStyleDependency([{ when: ["isHovered", "isHighlighted"], then: { color: "#f00" } }]),
      ).toBe("item-state");
    });

    test("returns 'item-state' for object predicate in rule", () => {
      expect(
        analyzeStyleDependency([{ when: { isHovered: true }, then: { color: "#f00" } }]),
      ).toBe("item-state");
    });

    test("returns 'item-state' for inline conditional with string predicate", () => {
      expect(
        analyzeStyleDependency({
          color: { when: "isHovered", then: "#f00", else: "#ccc" },
        }),
      ).toBe("item-state");
    });

    test("returns 'item-state' for inline conditional with object predicate", () => {
      expect(
        analyzeStyleDependency({
          color: { when: { isHovered: true }, then: "#f00", else: "#ccc" },
        }),
      ).toBe("item-state");
    });

    test("returns 'item-state' when mixed with static rules", () => {
      expect(
        analyzeStyleDependency([
          { size: 10, color: { attribute: "color" } },
          { when: "isHovered", then: { size: 20 } },
        ]),
      ).toBe("item-state");
    });
  });

  describe("graph-state styles", () => {
    test("returns 'graph-state' for function predicate in rule", () => {
      expect(
        analyzeStyleDependency([{ when: () => true, then: { color: "#f00" } }]),
      ).toBe("graph-state");
    });

    test("returns 'graph-state' for value function in rule", () => {
      expect(
        analyzeStyleDependency({ color: () => "#f00" }),
      ).toBe("graph-state");
    });

    test("returns 'graph-state' for inline conditional with function predicate", () => {
      expect(
        analyzeStyleDependency({
          color: { when: () => true, then: "#f00", else: "#ccc" },
        }),
      ).toBe("graph-state");
    });

    test("returns 'graph-state' for value function inside inline conditional then", () => {
      expect(
        analyzeStyleDependency({
          color: { when: "isHovered", then: () => "#f00", else: "#ccc" },
        }),
      ).toBe("graph-state");
    });

    test("returns 'graph-state' for value function inside inline conditional else", () => {
      expect(
        analyzeStyleDependency({
          color: { when: "isHovered", then: "#f00", else: () => "#ccc" },
        }),
      ).toBe("graph-state");
    });

    test("returns 'graph-state' for value function inside conditional rule then branch", () => {
      expect(
        analyzeStyleDependency([{ when: "isHovered", then: { color: () => "#f00" } }]),
      ).toBe("graph-state");
    });

    test("returns 'graph-state' even when mixed with item-state rules", () => {
      expect(
        analyzeStyleDependency([
          { when: "isHovered", then: { size: 20 } },
          { color: () => "#f00" },
        ]),
      ).toBe("graph-state");
    });
  });
});
