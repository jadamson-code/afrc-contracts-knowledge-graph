/**
 * Type tests for Sigma.js v4 Custom State Generics.
 *
 * These tests verify compile-time type safety when using custom state types
 * with the Sigma class.
 *
 * NOTE: Type test files (*.test-d.ts) are statically analyzed only - they don't execute.
 * Run with: npx vitest typecheck
 */
import Graph from "graphology";
import Sigma from "sigma";
import type { BaseEdgeState, BaseGraphState, BaseNodeState } from "sigma/types";
import { describe, expectTypeOf, test } from "vitest";

// =============================================================================
// CUSTOM STATE TYPE DEFINITIONS
// =============================================================================

/**
 * Extended node state with custom properties.
 */
interface CustomNodeState extends BaseNodeState {
  isSelected: boolean;
  isPinned: boolean;
  customScore: number;
}

/**
 * Extended edge state with custom properties.
 */
interface CustomEdgeState extends BaseEdgeState {
  isSelected: boolean;
  weight: number;
}

/**
 * Extended graph state with custom properties.
 */
interface CustomGraphState extends BaseGraphState {
  isFiltered: boolean;
  searchQuery: string;
}

// =============================================================================
// TYPE TESTS: Default State Types
// =============================================================================

describe("Default state types", () => {
  test("Sigma with default types has correct state methods", () => {
    const graph = new Graph();
    const sigma = new Sigma(graph, document.createElement("div"));

    // getNodeState returns BaseNodeState
    const nodeState = sigma.getNodeState("n1");
    expectTypeOf(nodeState).toMatchTypeOf<BaseNodeState>();
    expectTypeOf(nodeState.isHovered).toBeBoolean();
    expectTypeOf(nodeState.isHidden).toBeBoolean();
    expectTypeOf(nodeState.isHighlighted).toBeBoolean();

    // getEdgeState returns BaseEdgeState
    const edgeState = sigma.getEdgeState("e1");
    expectTypeOf(edgeState).toMatchTypeOf<BaseEdgeState>();
    expectTypeOf(edgeState.isHovered).toBeBoolean();
    expectTypeOf(edgeState.isHidden).toBeBoolean();
    expectTypeOf(edgeState.isHighlighted).toBeBoolean();

    // getGraphState returns BaseGraphState
    const graphState = sigma.getGraphState();
    expectTypeOf(graphState).toMatchTypeOf<BaseGraphState>();
    expectTypeOf(graphState.isIdle).toBeBoolean();
    expectTypeOf(graphState.isPanning).toBeBoolean();
    expectTypeOf(graphState.hasHovered).toBeBoolean();
  });

  test("setNodeState accepts partial BaseNodeState", () => {
    const graph = new Graph();
    const sigma = new Sigma(graph, document.createElement("div"));

    // Valid partial state
    sigma.setNodeState("n1", { isHovered: true });
    sigma.setNodeState("n1", { isHidden: false, isHighlighted: true });

    // Returns this for chaining
    expectTypeOf(sigma.setNodeState("n1", {})).toEqualTypeOf<typeof sigma>();
  });
});

// =============================================================================
// TYPE TESTS: Custom State Types
// =============================================================================

describe("Custom state types", () => {
  test("Sigma with custom node state has correctly typed methods", () => {
    const graph = new Graph();
    const sigma = new Sigma<
      Record<string, unknown>,
      Record<string, unknown>,
      Record<string, unknown>,
      CustomNodeState,
      BaseEdgeState,
      BaseGraphState
    >(graph, document.createElement("div"));

    // getNodeState returns CustomNodeState
    const nodeState = sigma.getNodeState("n1");
    expectTypeOf(nodeState).toMatchTypeOf<CustomNodeState>();
    expectTypeOf(nodeState.isSelected).toBeBoolean();
    expectTypeOf(nodeState.isPinned).toBeBoolean();
    expectTypeOf(nodeState.customScore).toBeNumber();

    // Base properties still available
    expectTypeOf(nodeState.isHovered).toBeBoolean();
    expectTypeOf(nodeState.isHidden).toBeBoolean();
  });

  test("Sigma with custom edge state has correctly typed methods", () => {
    const graph = new Graph();
    const sigma = new Sigma<
      Record<string, unknown>,
      Record<string, unknown>,
      Record<string, unknown>,
      BaseNodeState,
      CustomEdgeState,
      BaseGraphState
    >(graph, document.createElement("div"));

    // getEdgeState returns CustomEdgeState
    const edgeState = sigma.getEdgeState("e1");
    expectTypeOf(edgeState).toMatchTypeOf<CustomEdgeState>();
    expectTypeOf(edgeState.isSelected).toBeBoolean();
    expectTypeOf(edgeState.weight).toBeNumber();

    // Base properties still available
    expectTypeOf(edgeState.isHovered).toBeBoolean();
  });

  test("Sigma with custom graph state has correctly typed methods", () => {
    const graph = new Graph();
    const sigma = new Sigma<
      Record<string, unknown>,
      Record<string, unknown>,
      Record<string, unknown>,
      BaseNodeState,
      BaseEdgeState,
      CustomGraphState
    >(graph, document.createElement("div"));

    // getGraphState returns CustomGraphState
    const graphState = sigma.getGraphState();
    expectTypeOf(graphState).toMatchTypeOf<CustomGraphState>();
    expectTypeOf(graphState.isFiltered).toBeBoolean();
    expectTypeOf(graphState.searchQuery).toBeString();

    // Base properties still available
    expectTypeOf(graphState.isIdle).toBeBoolean();
    expectTypeOf(graphState.hasHovered).toBeBoolean();
  });

  test("Sigma with all custom states has correctly typed methods", () => {
    const graph = new Graph();
    const sigma = new Sigma<
      Record<string, unknown>,
      Record<string, unknown>,
      Record<string, unknown>,
      CustomNodeState,
      CustomEdgeState,
      CustomGraphState
    >(graph, document.createElement("div"));

    // All custom types are correctly inferred
    expectTypeOf(sigma.getNodeState("n1")).toMatchTypeOf<CustomNodeState>();
    expectTypeOf(sigma.getEdgeState("e1")).toMatchTypeOf<CustomEdgeState>();
    expectTypeOf(sigma.getGraphState()).toMatchTypeOf<CustomGraphState>();
  });
});

// =============================================================================
// TYPE TESTS: State Mutation with Custom Types
// =============================================================================

describe("State mutation with custom types", () => {
  test("setNodeState accepts custom state properties", () => {
    const graph = new Graph();
    const sigma = new Sigma<
      Record<string, unknown>,
      Record<string, unknown>,
      Record<string, unknown>,
      CustomNodeState,
      BaseEdgeState,
      BaseGraphState
    >(graph, document.createElement("div"));

    // Valid custom properties
    sigma.setNodeState("n1", { isSelected: true });
    sigma.setNodeState("n1", { isPinned: true, customScore: 42 });
    sigma.setNodeState("n1", { isHovered: true, isSelected: false });
  });

  test("setEdgeState accepts custom state properties", () => {
    const graph = new Graph();
    const sigma = new Sigma<
      Record<string, unknown>,
      Record<string, unknown>,
      Record<string, unknown>,
      BaseNodeState,
      CustomEdgeState,
      BaseGraphState
    >(graph, document.createElement("div"));

    // Valid custom properties
    sigma.setEdgeState("e1", { isSelected: true });
    sigma.setEdgeState("e1", { weight: 0.5 });
  });

  test("setGraphState accepts custom state properties", () => {
    const graph = new Graph();
    const sigma = new Sigma<
      Record<string, unknown>,
      Record<string, unknown>,
      Record<string, unknown>,
      BaseNodeState,
      BaseEdgeState,
      CustomGraphState
    >(graph, document.createElement("div"));

    // Valid custom properties
    sigma.setGraphState({ isFiltered: true });
    sigma.setGraphState({ searchQuery: "test" });
    sigma.setGraphState({ isIdle: false, isFiltered: true });
  });

  test("setNodesState batch updates with custom state", () => {
    const graph = new Graph();
    const sigma = new Sigma<
      Record<string, unknown>,
      Record<string, unknown>,
      Record<string, unknown>,
      CustomNodeState,
      BaseEdgeState,
      BaseGraphState
    >(graph, document.createElement("div"));

    // Batch update with custom properties
    sigma.setNodesState(["n1", "n2"], { isSelected: true });
    sigma.setNodesState(["n1", "n2"], { isPinned: false, customScore: 0 });
  });
});

// =============================================================================
// TYPE TESTS: Error Cases
// =============================================================================

describe("Custom state error cases", () => {
  test("rejects invalid property types on custom node state", () => {
    const graph = new Graph();
    const sigma = new Sigma<
      Record<string, unknown>,
      Record<string, unknown>,
      Record<string, unknown>,
      CustomNodeState,
      BaseEdgeState,
      BaseGraphState
    >(graph, document.createElement("div"));

    // @ts-expect-error - customScore should be number, not string
    sigma.setNodeState("n1", { customScore: "high" });

    // @ts-expect-error - isSelected should be boolean, not number
    sigma.setNodeState("n1", { isSelected: 1 });
  });

  test("rejects invalid property types on custom edge state", () => {
    const graph = new Graph();
    const sigma = new Sigma<
      Record<string, unknown>,
      Record<string, unknown>,
      Record<string, unknown>,
      BaseNodeState,
      CustomEdgeState,
      BaseGraphState
    >(graph, document.createElement("div"));

    // @ts-expect-error - weight should be number, not string
    sigma.setEdgeState("e1", { weight: "heavy" });
  });

  test("rejects invalid property types on custom graph state", () => {
    const graph = new Graph();
    const sigma = new Sigma<
      Record<string, unknown>,
      Record<string, unknown>,
      Record<string, unknown>,
      BaseNodeState,
      BaseEdgeState,
      CustomGraphState
    >(graph, document.createElement("div"));

    // @ts-expect-error - searchQuery should be string, not number
    sigma.setGraphState({ searchQuery: 123 });
  });

  test("state types that do not extend base types are rejected", () => {
    const graph = new Graph();

    // This should fail because InvalidNodeState doesn't extend BaseNodeState
    interface InvalidNodeState {
      customOnly: boolean;
    }

    new Sigma<
      Record<string, unknown>,
      Record<string, unknown>,
      Record<string, unknown>,
      // @ts-expect-error - InvalidNodeState does not extend BaseNodeState
      InvalidNodeState,
      BaseEdgeState,
      BaseGraphState
    >(graph, document.createElement("div"));
  });
});
