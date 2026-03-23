/**
 * Unit tests for the style resolution system.
 */
import Graph from "graphology";
import {
  BaseEdgeState,
  BaseGraphState,
  BaseNodeState,
  type DirectAttributeBinding,
  type GraphicValue,
  type NumericalAttributeBinding,
  evaluateEdgeStyle,
  evaluateNodeStyle,
  evaluateStatePredicate,
  resolveGraphicValue,
} from "sigma/types";
import { describe, expect, test } from "vitest";

import { DEFAULT_EDGE_STATE } from "../types/styles";

// Test fixtures
const createTestGraph = () => {
  const graph = new Graph();
  graph.addNode("n1", { x: 0, y: 0, size: 10, color: "#f00", category: "A", score: 50 });
  graph.addNode("n2", { x: 1, y: 1, size: 20, color: "#0f0", category: "B", score: 100 });
  return graph;
};

const defaultNodeState: BaseNodeState = {
  isHovered: false,
  isHidden: false,
  isHighlighted: false,
  isDragged: false,
};

const defaultGraphState: BaseGraphState = {
  isIdle: true,
  isPanning: false,
  isZooming: false,
  isDragging: false,
  hasHovered: false,
  hasHighlighted: false,
};

describe("Style evaluation system", () => {
  describe("evaluateStatePredicate", () => {
    const graph = createTestGraph();
    const attrs = { x: 0, y: 0 };

    test("string predicate returns true when flag is true", () => {
      const state = { ...defaultNodeState, isHovered: true };
      expect(evaluateStatePredicate("isHovered", attrs, state, defaultGraphState, graph)).toBe(true);
    });

    test("string predicate returns false when flag is false", () => {
      expect(evaluateStatePredicate("isHovered", attrs, defaultNodeState, defaultGraphState, graph)).toBe(false);
    });

    test("array predicate returns true when ALL flags are true", () => {
      const state = { ...defaultNodeState, isHovered: true, isHighlighted: true };
      expect(evaluateStatePredicate(["isHovered", "isHighlighted"], attrs, state, defaultGraphState, graph)).toBe(true);
    });

    test("array predicate returns false when any flag is false", () => {
      const state = { ...defaultNodeState, isHovered: true, isHighlighted: false };
      expect(evaluateStatePredicate(["isHovered", "isHighlighted"], attrs, state, defaultGraphState, graph)).toBe(
        false,
      );
    });

    test("object predicate matches all specified values", () => {
      const state = { ...defaultNodeState, isHovered: true, isHidden: false };
      expect(evaluateStatePredicate({ isHovered: true, isHidden: false }, attrs, state, defaultGraphState, graph)).toBe(
        true,
      );
    });

    test("object predicate returns false when values don't match", () => {
      const state = { ...defaultNodeState, isHovered: true, isHidden: true };
      expect(evaluateStatePredicate({ isHovered: true, isHidden: false }, attrs, state, defaultGraphState, graph)).toBe(
        false,
      );
    });

    test("function predicate receives all arguments", () => {
      const state = { ...defaultNodeState, isHovered: true };
      const predicate = (a: typeof attrs, s: typeof state, gs: typeof defaultGraphState, g: typeof graph) => {
        return a.x === 0 && s.isHovered && gs.isIdle && g.order === 2;
      };
      expect(evaluateStatePredicate(predicate, attrs, state, defaultGraphState, graph)).toBe(true);
    });
  });

  describe("resolveGraphicValue - literal values", () => {
    const graph = createTestGraph();
    const attrs = { x: 0, y: 0 };

    test("returns literal string value", () => {
      expect(resolveGraphicValue("#ff0000", attrs, defaultNodeState, defaultGraphState, graph, "#000")).toBe("#ff0000");
    });

    test("returns literal number value", () => {
      expect(resolveGraphicValue(42, attrs, defaultNodeState, defaultGraphState, graph, 0)).toBe(42);
    });

    test("returns default for null value", () => {
      expect(
        resolveGraphicValue(null as unknown as string, attrs, defaultNodeState, defaultGraphState, graph, "#000"),
      ).toBe("#000");
    });

    test("returns default for undefined value", () => {
      expect(
        resolveGraphicValue(undefined as unknown as string, attrs, defaultNodeState, defaultGraphState, graph, "#000"),
      ).toBe("#000");
    });
  });

  describe("resolveGraphicValue - attribute binding", () => {
    const graph = createTestGraph();
    const attrs = { x: 10, y: 20, color: "#f00", category: "A", score: 75 };

    test("direct binding reads attribute value", () => {
      const binding: DirectAttributeBinding<string> = { attribute: "color" };
      expect(resolveGraphicValue(binding, attrs, defaultNodeState, defaultGraphState, graph, "#000")).toBe("#f00");
    });

    test("direct binding uses default for missing attribute", () => {
      const binding = { attribute: "missing", defaultValue: "#999" };
      expect(resolveGraphicValue(binding, attrs, defaultNodeState, defaultGraphState, graph, "#000")).toBe("#999");
    });

    test("categorical binding maps via dictionary", () => {
      const binding = {
        attribute: "category",
        dict: { A: "#f00", B: "#0f0", C: "#00f" },
        defaultValue: "#999",
      };
      expect(resolveGraphicValue(binding, attrs, defaultNodeState, defaultGraphState, graph, "#000")).toBe("#f00");
    });

    test("categorical binding uses default for unknown category", () => {
      const binding = {
        attribute: "category",
        dict: { X: "#f00", Y: "#0f0" },
        defaultValue: "#999",
      };
      expect(resolveGraphicValue(binding, attrs, defaultNodeState, defaultGraphState, graph, "#000")).toBe("#999");
    });

    test("numerical binding with range maps value", () => {
      const binding: NumericalAttributeBinding = {
        attribute: "score",
        min: 5,
        max: 50,
        minValue: 0,
        maxValue: 100,
      };
      // score = 75, normalized to 0.75, mapped to 5 + 0.75 * (50-5) = 5 + 33.75 = 38.75
      expect(resolveGraphicValue(binding, attrs, defaultNodeState, defaultGraphState, graph, 0)).toBe(38.75);
    });

    test("numerical binding clamps to range", () => {
      const binding: NumericalAttributeBinding = {
        attribute: "score",
        min: 10,
        max: 20,
        minValue: 0,
        maxValue: 50,
      };
      // score = 75, exceeds maxValue, clamped to 1, mapped to 20
      expect(resolveGraphicValue(binding, attrs, defaultNodeState, defaultGraphState, graph, 0)).toBe(20);
    });

    test("numerical binding with easing function", () => {
      const binding: NumericalAttributeBinding = {
        attribute: "score",
        min: 0,
        max: 100,
        minValue: 0,
        maxValue: 100,
        easing: "quadraticIn",
      };
      // score = 75, normalized to 0.75, quadraticIn = 0.75^2 = 0.5625, mapped to 56.25
      expect(resolveGraphicValue(binding, attrs, defaultNodeState, defaultGraphState, graph, 0)).toBe(56.25);
    });

    test("numerical binding with custom easing function", () => {
      const binding: NumericalAttributeBinding = {
        attribute: "score",
        min: 0,
        max: 100,
        minValue: 0,
        maxValue: 100,
        easing: (t: number) => t * t * t, // cubic
      };
      // score = 75, normalized to 0.75, cubic = 0.75^3 = 0.421875, mapped to 42.1875
      expect(resolveGraphicValue(binding, attrs, defaultNodeState, defaultGraphState, graph, 0)).toBeCloseTo(42.1875);
    });
  });

  describe("resolveGraphicValue - function values", () => {
    const graph = createTestGraph();
    const attrs = { x: 10, y: 20, size: 15 };

    test("function receives all arguments", () => {
      const fn = (a: typeof attrs, s: BaseNodeState, gs: BaseGraphState, g: Graph) => {
        return a.size * 2 + (s.isHovered ? 5 : 0) + (gs.isIdle ? 1 : 0) + g.order;
      };
      // size=15, *2=30, +0 (not hovered), +1 (idle), +2 (graph order) = 33
      expect(resolveGraphicValue(fn, attrs, defaultNodeState, defaultGraphState, graph, 0)).toBe(33);
    });

    test("function with hovered state", () => {
      const state = { ...defaultNodeState, isHovered: true };
      const fn = (a: typeof attrs, s: BaseNodeState) => (s.isHovered ? a.size * 1.5 : a.size);
      expect(resolveGraphicValue(fn, attrs, state, defaultGraphState, graph, 0)).toBe(22.5);
    });
  });

  describe("resolveGraphicValue - inline conditionals", () => {
    const graph = createTestGraph();
    const attrs = { x: 10, y: 20, size: 15 };

    test("when true returns then value", () => {
      const state = { ...defaultNodeState, isHovered: true };
      const conditional = {
        when: "isHovered" as const,
        then: "#f00",
        else: "#666",
      };
      expect(resolveGraphicValue(conditional, attrs, state, defaultGraphState, graph, "#000")).toBe("#f00");
    });

    test("when false returns else value", () => {
      const conditional = {
        when: "isHovered" as const,
        then: "#f00",
        else: "#666",
      };
      expect(resolveGraphicValue(conditional, attrs, defaultNodeState, defaultGraphState, graph, "#000")).toBe("#666");
    });

    test("when false with no else returns default", () => {
      const conditional = {
        when: "isHovered" as const,
        then: "#f00",
      };
      expect(resolveGraphicValue(conditional, attrs, defaultNodeState, defaultGraphState, graph, "#000")).toBe("#000");
    });

    test("nested conditionals", () => {
      const state = { ...defaultNodeState, isHighlighted: true };
      const conditional = {
        when: "isHovered" as const,
        then: "#f00",
        else: {
          when: "isHighlighted" as const,
          then: "#ff0",
          else: "#666",
        },
      };
      expect(resolveGraphicValue(conditional, attrs, state, defaultGraphState, graph, "#000")).toBe("#ff0");
    });

    test("conditional with attribute binding in then", () => {
      const state = { ...defaultNodeState, isHovered: true };
      const attrsWithColor = { ...attrs, hoverColor: "#f00" };
      const conditional: GraphicValue<typeof attrsWithColor, typeof state, BaseGraphState, string> = {
        when: "isHovered",
        then: { attribute: "hoverColor" },
        else: "#666",
      };
      expect(resolveGraphicValue(conditional, attrsWithColor, state, defaultGraphState, graph, "#000")).toBe("#f00");
    });

    test("conditional with function in then", () => {
      const state = { ...defaultNodeState, isHovered: true };
      const conditional = {
        when: "isHovered" as const,
        then: (a: typeof attrs) => a.size * 1.5,
        else: (a: typeof attrs) => a.size,
      };
      expect(resolveGraphicValue(conditional, attrs, state, defaultGraphState, graph, 0)).toBe(22.5);
    });

    test("conditional with array predicate", () => {
      const state = { ...defaultNodeState, isHovered: true, isHighlighted: true };
      const conditional = {
        when: ["isHovered", "isHighlighted"] as const,
        then: "#f00",
        else: "#666",
      };
      expect(resolveGraphicValue(conditional, attrs, state, defaultGraphState, graph, "#000")).toBe("#f00");
    });

    test("conditional with object predicate", () => {
      const state = { ...defaultNodeState, isHovered: true, isHidden: false };
      const conditional = {
        when: { isHovered: true, isHidden: false },
        then: "#f00",
        else: "#666",
      };
      expect(resolveGraphicValue(conditional, attrs, state, defaultGraphState, graph, "#000")).toBe("#f00");
    });

    test("conditional with function predicate", () => {
      const conditional = {
        when: (a: typeof attrs) => a.size > 10,
        then: "#f00",
        else: "#666",
      };
      expect(resolveGraphicValue(conditional, attrs, defaultNodeState, defaultGraphState, graph, "#000")).toBe("#f00");
    });
  });

  describe("evaluateNodeStyle", () => {
    const graph = createTestGraph();

    test("returns defaults when no style declaration", () => {
      const attrs = { x: 5, y: 10, size: 15, color: "#f00", label: "test" };
      const result = evaluateNodeStyle(undefined, attrs, defaultNodeState, defaultGraphState, graph);

      expect(result.x).toBe(5);
      expect(result.y).toBe(10);
      expect(result.size).toBe(15);
      expect(result.color).toBe("#f00");
      expect(result.label).toBe("test");
      expect(result.opacity).toBe(1);
      expect(result.shape).toBe("circle");
    });

    test("resolves object-form style declaration", () => {
      const attrs = { x: 0, y: 0, size: 10 };
      const styles = {
        color: "#0f0",
        size: 20,
        opacity: 0.8,
      };
      const result = evaluateNodeStyle(styles, attrs, defaultNodeState, defaultGraphState, graph);

      expect(result.color).toBe("#0f0");
      expect(result.size).toBe(20);
      expect(result.opacity).toBe(0.8);
    });

    test("resolves attribute bindings in styles", () => {
      const attrs = { x: 0, y: 0, nodeColor: "#00f", nodeSize: 25 };
      const styles = {
        color: { attribute: "nodeColor" },
        size: { attribute: "nodeSize" },
      };
      const result = evaluateNodeStyle(styles, attrs, defaultNodeState, defaultGraphState, graph);

      expect(result.color).toBe("#00f");
      expect(result.size).toBe(25);
    });

    test("resolves array-form style rules in order", () => {
      const attrs = { x: 0, y: 0 };
      const styles = [{ color: "#f00", size: 10 }, { color: "#0f0" }]; // Second rule overwrites color
      const result = evaluateNodeStyle(styles, attrs, defaultNodeState, defaultGraphState, graph);

      expect(result.color).toBe("#0f0");
      expect(result.size).toBe(10);
    });

    test("applies conditional rules only when predicate matches", () => {
      const attrs = { x: 0, y: 0 };
      const hoveredState = { ...defaultNodeState, isHovered: true };

      const styles = [
        { color: "#666", size: 10 },
        { when: "isHovered" as const, then: { color: "#f00", size: 15 } },
      ];

      // Not hovered - should use base style
      const resultNormal = evaluateNodeStyle(styles, attrs, defaultNodeState, defaultGraphState, graph);
      expect(resultNormal.color).toBe("#666");
      expect(resultNormal.size).toBe(10);

      // Hovered - should apply conditional
      const resultHovered = evaluateNodeStyle(styles, attrs, hoveredState, defaultGraphState, graph);
      expect(resultHovered.color).toBe("#f00");
      expect(resultHovered.size).toBe(15);
    });

    test("applies multiple conditional rules in order", () => {
      const attrs = { x: 0, y: 0 };
      const state = { ...defaultNodeState, isHovered: true, isHighlighted: true };

      const styles = [
        { color: "#666" },
        { when: "isHighlighted" as const, then: { color: "#ff0" } },
        { when: "isHovered" as const, then: { color: "#f00" } }, // This one wins (last)
      ];

      const result = evaluateNodeStyle(styles, attrs, state, defaultGraphState, graph);
      expect(result.color).toBe("#f00");
    });
  });

  describe("match/cases rules", () => {
    const graph = createTestGraph();

    test("applies matching case for nodes", () => {
      const attrs = { x: 0, y: 0, type: "person" };
      const styles = [
        { color: "#666" },
        { match: "type", cases: { person: { color: "#f00" }, company: { color: "#0f0" } } },
      ];
      const result = evaluateNodeStyle(styles, attrs, defaultNodeState, defaultGraphState, graph);
      expect(result.color).toBe("#f00");
    });

    test("skips when no case matches", () => {
      const attrs = { x: 0, y: 0, type: "unknown" };
      const styles = [{ color: "#666" }, { match: "type", cases: { person: { color: "#f00" } } }];
      const result = evaluateNodeStyle(styles, attrs, defaultNodeState, defaultGraphState, graph);
      expect(result.color).toBe("#666");
    });

    test("skips when attribute is missing", () => {
      const attrs = { x: 0, y: 0 };
      const styles = [{ color: "#666" }, { match: "type", cases: { person: { color: "#f00" } } }];
      const result = evaluateNodeStyle(styles, attrs, defaultNodeState, defaultGraphState, graph);
      expect(result.color).toBe("#666");
    });

    test("applies multiple properties from matched case", () => {
      const attrs = { x: 0, y: 0, type: "person" };
      const styles = [{ match: "type", cases: { person: { color: "#f00", size: 20, opacity: 0.5 } } }];
      const result = evaluateNodeStyle(styles, attrs, defaultNodeState, defaultGraphState, graph);
      expect(result.color).toBe("#f00");
      expect(result.size).toBe(20);
      expect(result.opacity).toBe(0.5);
    });

    test("later rules override match/cases", () => {
      const attrs = { x: 0, y: 0, type: "person" };
      const styles = [{ match: "type", cases: { person: { color: "#f00" } } }, { color: "#000" }];
      const result = evaluateNodeStyle(styles, attrs, defaultNodeState, defaultGraphState, graph);
      expect(result.color).toBe("#000");
    });

    test("coerces numeric attribute values to strings for case lookup", () => {
      const attrs = { x: 0, y: 0, cluster: 2 };
      const styles = [{ match: "cluster", cases: { "1": { color: "#f00" }, "2": { color: "#0f0" } } }];
      const result = evaluateNodeStyle(styles, attrs, defaultNodeState, defaultGraphState, graph);
      expect(result.color).toBe("#0f0");
    });
  });

  describe("evaluateEdgeStyle", () => {
    const graph = createTestGraph();
    const defaultEdgeState: BaseEdgeState = {
      ...DEFAULT_EDGE_STATE,
    };

    test("returns defaults when no style declaration", () => {
      const attrs = { size: 2, color: "#f00", label: "edge1" };
      const result = evaluateEdgeStyle(undefined, attrs, defaultEdgeState, defaultGraphState, graph);

      expect(result.size).toBe(2);
      expect(result.color).toBe("#f00");
      expect(result.label).toBe("edge1");
      expect(result.path).toBe("straight");
      expect(result.opacity).toBe(1);
    });

    test("resolves object-form style declaration", () => {
      const attrs = {};
      const styles = {
        color: "#0f0",
        size: 3,
        path: "curved",
        head: "arrow",
      };
      const result = evaluateEdgeStyle(styles, attrs, defaultEdgeState, defaultGraphState, graph);

      expect(result.color).toBe("#0f0");
      expect(result.size).toBe(3);
      expect(result.path).toBe("curved");
      expect(result.head).toBe("arrow");
    });

    test("applies conditional rules based on edge state", () => {
      const attrs = {};
      const hoveredState = { ...defaultEdgeState, isHovered: true };

      const styles = [
        { color: "#ccc", size: 1 },
        { when: "isHovered" as const, then: { color: "#f00", size: 3 } },
      ];

      // Not hovered
      const resultNormal = evaluateEdgeStyle(styles, attrs, defaultEdgeState, defaultGraphState, graph);
      expect(resultNormal.color).toBe("#ccc");
      expect(resultNormal.size).toBe(1);

      // Hovered
      const resultHovered = evaluateEdgeStyle(styles, attrs, hoveredState, defaultGraphState, graph);
      expect(resultHovered.color).toBe("#f00");
      expect(resultHovered.size).toBe(3);
    });

    test("applies match/cases rules for edges", () => {
      const attrs = { type: "coauthored" };
      const styles = [
        { color: "#ccc" },
        {
          match: "type",
          cases: {
            cites: { color: "#0f0", size: 1 },
            coauthored: { color: "#f00", size: 3 },
          },
        },
      ];
      const result = evaluateEdgeStyle(styles, attrs, defaultEdgeState, defaultGraphState, graph);
      expect(result.color).toBe("#f00");
      expect(result.size).toBe(3);
    });
  });
});
