/**
 * Unit tests for analyzeStyleDeclaration.
 */
import { analyzeStyleDeclaration } from "sigma/types";
import { describe, expect, test } from "vitest";

describe("analyzeStyleDeclaration", () => {
  describe("dependency analysis", () => {
    describe("static styles", () => {
      test("returns 'static' for undefined", () => {
        expect(analyzeStyleDeclaration(undefined).dependency).toBe("static");
      });

      test("returns 'static' for literal values only", () => {
        expect(analyzeStyleDeclaration({ color: "#f00", size: 10 }).dependency).toBe("static");
      });

      test("returns 'static' for attribute bindings", () => {
        expect(analyzeStyleDeclaration({ color: { attribute: "color" } }).dependency).toBe("static");
      });

      test("returns 'static' for numerical attribute bindings", () => {
        expect(
          analyzeStyleDeclaration({
            size: { attribute: "score", min: 2, max: 20, minValue: 0, maxValue: 100 },
          }).dependency,
        ).toBe("static");
      });

      test("returns 'static' for categorical attribute bindings", () => {
        expect(
          analyzeStyleDeclaration({
            color: { attribute: "category", dict: { A: "#f00", B: "#0f0" } },
          }).dependency,
        ).toBe("static");
      });

      test("returns 'static' for array of static rules", () => {
        expect(analyzeStyleDeclaration([{ color: "#f00" }, { size: { attribute: "size" } }]).dependency).toBe("static");
      });
    });

    describe("item-state styles", () => {
      test("returns 'item-state' for string predicate in rule", () => {
        expect(analyzeStyleDeclaration([{ when: "isHovered", then: { color: "#f00" } }]).dependency).toBe("item-state");
      });

      test("returns 'item-state' for array predicate in rule", () => {
        expect(
          analyzeStyleDeclaration([{ when: ["isHovered", "isHighlighted"], then: { color: "#f00" } }]).dependency,
        ).toBe("item-state");
      });

      test("returns 'item-state' for object predicate in rule", () => {
        expect(analyzeStyleDeclaration([{ when: { isHovered: true }, then: { color: "#f00" } }]).dependency).toBe(
          "item-state",
        );
      });

      test("returns 'item-state' for inline conditional with string predicate", () => {
        expect(
          analyzeStyleDeclaration({
            color: { when: "isHovered", then: "#f00", else: "#ccc" },
          }).dependency,
        ).toBe("item-state");
      });

      test("returns 'item-state' for inline conditional with object predicate", () => {
        expect(
          analyzeStyleDeclaration({
            color: { when: { isHovered: true }, then: "#f00", else: "#ccc" },
          }).dependency,
        ).toBe("item-state");
      });

      test("returns 'item-state' when mixed with static rules", () => {
        expect(
          analyzeStyleDeclaration([
            { size: 10, color: { attribute: "color" } },
            { when: "isHovered", then: { size: 20 } },
          ]).dependency,
        ).toBe("item-state");
      });
    });

    describe("graph-state styles", () => {
      test("returns 'graph-state' for function predicate in rule", () => {
        expect(analyzeStyleDeclaration([{ when: () => true, then: { color: "#f00" } }]).dependency).toBe("graph-state");
      });

      test("returns 'graph-state' for value function in rule", () => {
        expect(analyzeStyleDeclaration({ color: () => "#f00" }).dependency).toBe("graph-state");
      });

      test("returns 'graph-state' for inline conditional with function predicate", () => {
        expect(
          analyzeStyleDeclaration({
            color: { when: () => true, then: "#f00", else: "#ccc" },
          }).dependency,
        ).toBe("graph-state");
      });

      test("returns 'graph-state' for value function inside inline conditional then", () => {
        expect(
          analyzeStyleDeclaration({
            color: { when: "isHovered", then: () => "#f00", else: "#ccc" },
          }).dependency,
        ).toBe("graph-state");
      });

      test("returns 'graph-state' for value function inside inline conditional else", () => {
        expect(
          analyzeStyleDeclaration({
            color: { when: "isHovered", then: "#f00", else: () => "#ccc" },
          }).dependency,
        ).toBe("graph-state");
      });

      test("returns 'graph-state' for value function inside conditional rule then branch", () => {
        expect(analyzeStyleDeclaration([{ when: "isHovered", then: { color: () => "#f00" } }]).dependency).toBe(
          "graph-state",
        );
      });

      test("returns 'graph-state' even when mixed with item-state rules", () => {
        expect(
          analyzeStyleDeclaration([{ when: "isHovered", then: { size: 20 } }, { color: () => "#f00" }]).dependency,
        ).toBe("graph-state");
      });
    });
  });

  describe("position attribute extraction", () => {
    test("returns null for undefined declaration", () => {
      const { xAttribute, yAttribute } = analyzeStyleDeclaration(undefined);
      expect(xAttribute).toBeNull();
      expect(yAttribute).toBeNull();
    });

    test("returns null when x/y are not set", () => {
      const { xAttribute, yAttribute } = analyzeStyleDeclaration({ color: "#f00" });
      expect(xAttribute).toBeNull();
      expect(yAttribute).toBeNull();
    });

    test("extracts attribute names from direct bindings", () => {
      const { xAttribute, yAttribute } = analyzeStyleDeclaration({
        x: { attribute: "lng" },
        y: { attribute: "lat" },
      });
      expect(xAttribute).toBe("lng");
      expect(yAttribute).toBe("lat");
    });

    test("extracts from array of rules", () => {
      const { xAttribute, yAttribute } = analyzeStyleDeclaration([
        { x: { attribute: "lng" } },
        { y: { attribute: "lat" } },
      ]);
      expect(xAttribute).toBe("lng");
      expect(yAttribute).toBe("lat");
    });

    test("uses first binding found", () => {
      const { xAttribute } = analyzeStyleDeclaration([{ x: { attribute: "lng" } }, { x: { attribute: "longitude" } }]);
      expect(xAttribute).toBe("lng");
    });

    test("returns null for function values", () => {
      const { xAttribute } = analyzeStyleDeclaration({ x: () => 0 });
      expect(xAttribute).toBeNull();
    });

    test("ignores x/y inside conditional rules", () => {
      const { xAttribute } = analyzeStyleDeclaration([{ when: "isDragged", then: { x: { attribute: "lng" } } }]);
      expect(xAttribute).toBeNull();
    });
  });
});
