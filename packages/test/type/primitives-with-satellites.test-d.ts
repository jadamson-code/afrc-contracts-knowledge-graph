/**
 * Type tests for Sigma.js primitives WITH satellite package imports.
 *
 * These tests verify that importing satellite packages (like @sigma/node-border)
 * correctly augments the type system, making their layer types available in
 * defineSigmaOptions.
 *
 * Run with: npx vitest typecheck
 */
// Import satellite packages - this should augment the types
import "@sigma/node-border";
import "@sigma/node-image";
import "@sigma/node-piechart";
import { defineSigmaOptions } from "sigma/types";
import { describe, expectTypeOf, test } from "vitest";

// =============================================================================
// TYPE TESTS: Undeclared primitives should error
// =============================================================================

describe("Undeclared primitives", () => {
  test("unknown layer type is rejected", () => {
    defineSigmaOptions({
      primitives: {
        nodes: {
          shapes: ["circle"],
          layers: [
            "fill",
            // @ts-expect-error - "unknownLayer" is not a recognized layer type
            { type: "unknownLayer", foo: "bar" },
          ],
        },
      },
    });
  });

  test("unknown shape type is rejected", () => {
    defineSigmaOptions({
      primitives: {
        nodes: {
          // @ts-expect-error - "hexagon" is not a recognized shape type
          shapes: ["circle", "hexagon"],
          layers: ["fill"],
        },
      },
    });
  });
});

// =============================================================================
// TYPE TESTS: Invalid options for declared primitives should error
// =============================================================================

describe("Invalid options for declared primitives", () => {
  test("fill layer with wrong property type is rejected", () => {
    defineSigmaOptions({
      primitives: {
        nodes: {
          shapes: ["circle"],
          variables: {
            nodeColor: { type: "color", default: "#fc0" },
          },
          // @ts-expect-error - color should be a string, not a number
          layers: [{ type: "fill", color: 123 }],
        },
      },
    });

    // Note: Color variable references cannot be validated at compile time because
    // both colors and variable names are strings. The type `AllowedVars | string`
    // simplifies to `string`, so any string is accepted. Runtime validation is needed.
    defineSigmaOptions({
      primitives: {
        nodes: {
          shapes: ["circle"],
          variables: {
            nodeColor: { type: "color", default: "#fc0" },
          },
          layers: [
            // These are all valid at compile time (all strings)
            { type: "fill", color: "nodeFrontColor" }, // Would fail at runtime
            { type: "fill", color: "nodeColor" }, // Valid variable reference
            { type: "fill", color: "#ff0000" }, // Valid color literal
          ],
        },
      },
    });
  });

  test("border layer with wrong property type is rejected", () => {
    defineSigmaOptions({
      primitives: {
        nodes: {
          shapes: ["circle"],
          // @ts-expect-error - borders should be an array, not a string
          layers: ["fill", { type: "border", borders: "wrong" }],
        },
      },
    });
  });

  test("border layer with invalid border item is rejected", () => {
    // Test that invalid variable references in number properties are rejected
    defineSigmaOptions({
      primitives: {
        nodes: {
          shapes: ["circle"],
          // @ts-expect-error - size "big" is not a valid variable name or number
          layers: ["fill", { type: "border", borders: [{ size: "big", color: "#000" }] }],
        },
      },
    });

    // Excess properties are also caught by the validated intersection type
    defineSigmaOptions({
      primitives: {
        nodes: {
          shapes: ["circle"],
          // @ts-expect-error - 'opacity' does not exist in border item schema
          layers: ["fill", { type: "border", borders: [{ size: 2, color: "#fff", opacity: 0.5 }] }],
        },
      },
    });
  });

  test("piechart layer with invalid slice is rejected", () => {
    defineSigmaOptions({
      primitives: {
        nodes: {
          shapes: ["circle"],
          // @ts-expect-error - value "half" is not a valid variable name or number
          layers: [{ type: "piechart", slices: [{ color: "#f00", value: "half" }] }],
        },
      },
    });
  });
});

// =============================================================================
// TYPE TESTS: Satellite layers ARE recognized after imports
// =============================================================================

describe("With satellite imports", () => {
  test("border layer is recognized in primitives", () => {
    const options = defineSigmaOptions({
      primitives: {
        nodes: {
          shapes: ["circle"],
          layers: ["fill", { type: "border", borders: [{ size: 0.1, color: "#000" }] }],
        },
      },
      styles: {
        nodes: {
          color: "#666",
          size: 10,
        },
      },
    });

    expectTypeOf(options).toHaveProperty("primitives");
  });

  test("image layer is recognized in primitives", () => {
    const options = defineSigmaOptions({
      primitives: {
        nodes: {
          shapes: ["circle"],
          layers: ["fill", { type: "image", name: "myImage" }],
        },
      },
      styles: {
        nodes: {
          color: "#666",
          size: 10,
        },
      },
    });

    expectTypeOf(options).toHaveProperty("primitives");
  });

  test("piechart layer is recognized in primitives", () => {
    const options = defineSigmaOptions({
      primitives: {
        nodes: {
          shapes: ["circle"],
          layers: [{ type: "piechart", slices: [{ color: "#f00", value: 1 }] }],
        },
      },
      styles: {
        nodes: {
          color: "#666",
          size: 10,
        },
      },
    });

    expectTypeOf(options).toHaveProperty("primitives");
  });

  test("multiple satellite layers can be combined", () => {
    const options = defineSigmaOptions({
      primitives: {
        nodes: {
          shapes: ["circle"],
          layers: [
            { type: "image", name: "background" },
            { type: "piechart", slices: [{ color: "#f00", value: 1 }] },
            { type: "border", borders: [{ size: 0.1, color: "#000" }] },
          ],
        },
      },
      styles: {
        nodes: {
          color: "#666",
          size: 10,
        },
      },
    });

    expectTypeOf(options).toHaveProperty("primitives");
  });
});
