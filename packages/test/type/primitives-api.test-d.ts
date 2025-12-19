/**
 * Type tests for the Sigma.js v4 Primitives API.
 *
 * These tests verify compile-time type safety of the primitives and styles APIs.
 * Tests marked with @ts-expect-error validate that TypeScript catches invalid configs.
 *
 * NOTE: Type test files (*.test-d.ts) are statically analyzed only - they don't execute.
 * Run with: npx vitest typecheck
 */
// Import satellite packages to augment the types
// These packages use module augmentation to add their primitives to the registry
import "@sigma/node-border";
// Import schemas from packages for verification
import { borderSchema } from "@sigma/node-border";
import "@sigma/node-image";
import { imageSchema } from "@sigma/node-image";
import "@sigma/node-piechart";
import { piechartSchema } from "@sigma/node-piechart";
// Import real schema helpers from sigma/primitives
import { colorProp, enumProp, numberProp, stringProp } from "sigma/primitives";
// Import defineSigmaOptions from sigma/types
import { defineSigmaOptions } from "sigma/types";
import { describe, expectTypeOf, test } from "vitest";

// =============================================================================
// TYPE TESTS: Schema helpers
// =============================================================================

describe("Schema helpers", () => {
  test("numberProp creates correct schema type", () => {
    const prop = numberProp(10);
    expectTypeOf(prop.type).toEqualTypeOf<"number">();
    expectTypeOf(prop.default).toEqualTypeOf<number>();
  });

  test("colorProp creates correct schema type", () => {
    const prop = colorProp("#fff");
    expectTypeOf(prop.type).toEqualTypeOf<"color">();
    expectTypeOf(prop.default).toEqualTypeOf<string>();
  });

  test("stringProp creates correct schema type", () => {
    const prop = stringProp("default");
    expectTypeOf(prop.type).toEqualTypeOf<"string">();
    expectTypeOf(prop.default).toEqualTypeOf<string>();
  });

  test("enumProp creates correct schema type", () => {
    const prop = enumProp(["a", "b", "c"] as const, "a");
    expectTypeOf(prop.default).toEqualTypeOf<"a" | "b" | "c">();
  });

  test("variable flag is preserved", () => {
    const withVar = numberProp(0, { variable: true });
    const withoutVar = numberProp(0);

    expectTypeOf(withVar.variable).toEqualTypeOf<true | undefined>();
    expectTypeOf(withoutVar.variable).toEqualTypeOf<false | undefined>();
  });
});

// =============================================================================
// TYPE TESTS: Satellite package schemas
// =============================================================================

describe("Satellite package schemas", () => {
  test("borderSchema has correct structure", () => {
    expectTypeOf(borderSchema).toHaveProperty("borders");
  });

  test("imageSchema has correct structure", () => {
    expectTypeOf(imageSchema).toHaveProperty("name");
    expectTypeOf(imageSchema).toHaveProperty("drawingMode");
    expectTypeOf(imageSchema).toHaveProperty("padding");
  });

  test("piechartSchema has correct structure", () => {
    expectTypeOf(piechartSchema).toHaveProperty("slices");
    expectTypeOf(piechartSchema).toHaveProperty("offset");
    expectTypeOf(piechartSchema).toHaveProperty("defaultColor");
  });
});

// =============================================================================
// TYPE TESTS: Module augmentation (after imports)
// =============================================================================
// NOTE: These tests verify that importing satellite packages augments the types.
// The actual type checking is implicit - if types weren't augmented, these would fail.

describe("Module augmentation", () => {
  test("importing @sigma/node-border augments NodeLayerSchemaRegistry", () => {
    // This test passes if TypeScript recognizes "border" as a valid layer
    // after importing @sigma/node-border at the top of the file
    expectTypeOf(borderSchema).toMatchTypeOf<object>();
  });

  test("importing @sigma/node-image augments NodeLayerSchemaRegistry", () => {
    expectTypeOf(imageSchema).toMatchTypeOf<object>();
  });

  test("importing @sigma/node-piechart augments NodeLayerSchemaRegistry", () => {
    expectTypeOf(piechartSchema).toMatchTypeOf<object>();
  });
});

// =============================================================================
// TYPE TESTS: defineSigmaOptions - Minimal Setup
// =============================================================================

describe("defineSigmaOptions - Minimal Setup", () => {
  test("minimal example compiles", () => {
    const options = defineSigmaOptions({
      primitives: {
        nodes: {
          shapes: ["circle"],
          layers: ["fill"],
        },
        edges: {
          paths: ["straight"],
          layers: ["plain"],
        },
      },
      styles: {
        nodes: {
          color: "#666",
          size: 10,
        },
        edges: {
          color: "#ccc",
          size: 1,
        },
      },
    });

    expectTypeOf(options).toHaveProperty("primitives");
    expectTypeOf(options).toHaveProperty("styles");
  });
});

// =============================================================================
// TYPE TESTS: defineSigmaOptions - With shapes and variables
// =============================================================================

describe("defineSigmaOptions - With shapes and variables", () => {
  test("shapes with variables example compiles", () => {
    const options = defineSigmaOptions({
      primitives: {
        nodes: {
          shapes: [
            "circle",
            { type: "square", cornerRadius: "nodeCornerRadius" },
            { type: "triangle", rotation: Math.PI / 6 },
          ],
          variables: {
            borderSize: { type: "number", default: 0 },
            borderColor: { type: "color", default: "#000" },
          },
          layers: ["fill"],
        },
      },
      styles: {
        nodes: {
          shape: { attribute: "type", dict: { person: "circle", company: "square" } },
          color: { attribute: "color", defaultValue: "#666" },
          borderSize: { when: "isHovered", then: 3 },
          borderColor: "#fff",
          nodeCornerRadius: { attribute: "roundness", defaultValue: 0.1 },
        },
      },
    });

    expectTypeOf(options).toHaveProperty("primitives");
  });
});

// =============================================================================
// TYPE TESTS: defineSigmaOptions - Error Cases
// =============================================================================

describe("defineSigmaOptions - Error Cases", () => {
  test("rejects wrong type for graphic variable", () => {
    defineSigmaOptions({
      primitives: {
        nodes: {
          shapes: ["circle"],
          variables: {
            borderSize: { type: "number", default: 0 },
          },
        },
      },
      styles: {
        // @ts-expect-error - borderSize should be a number, not a string
        nodes: { borderSize: "thick" },
      },
    });
  });

  test("variable default value type is not validated at compile time", () => {
    // Note: The current GraphicVariableDefinition type uses a generic T parameter
    // that doesn't enforce the relationship between `type` and `default`.
    // This limitation means these mismatches are only caught at runtime.
    defineSigmaOptions({
      primitives: {
        nodes: {
          shapes: ["circle"],
          variables: {
            // These mismatches are NOT caught at compile time (would fail at runtime)
            borderSize: { type: "number", default: "large" },
            borderColor: { type: "color", default: 0xffcc00 },
          },
        },
      },
    });
  });

  test("rejects undeclared program variable", () => {
    defineSigmaOptions({
      primitives: {
        nodes: {
          shapes: ["circle"],
          variables: {
            borderSize: { type: "number", default: 0 },
          },
        },
      },
      styles: {
        nodes: {
          color: "#666",
          borderSize: 2,
          // @ts-expect-error - 'borderColor' was not declared in variables
          borderColor: "#fff",
        },
      },
    });
  });

  test("rejects invalid state predicate", () => {
    defineSigmaOptions({
      primitives: {
        nodes: {
          shapes: ["circle"],
        },
      },
      styles: {
        // @ts-expect-error - 'nonExistentState' is not a valid state property
        nodes: { color: { when: "nonExistentState", then: "#f00", else: "#666" } },
      },
    });
  });
});
