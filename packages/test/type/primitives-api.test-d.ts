/**
 * Type tests for the Sigma.js v4 Primitives API.
 *
 * These tests verify compile-time type safety of the primitives and styles APIs.
 * Tests marked with @ts-expect-error validate that TypeScript catches invalid configs.
 *
 * NOTE: Type test files (*.test-d.ts) are statically analyzed only - they don't execute.
 * Run with: npx vitest typecheck
 */
import { FragmentLayer } from "sigma/rendering";
import { defineExtension } from "sigma/types";
import { describe, expectTypeOf, test } from "vitest";

// =============================================================================
// MOCK SCHEMA HELPERS
// =============================================================================
// These mirror the helpers from sigma/primitives/schema.ts
// Once primitives are exported publicly, these can be replaced with real imports.

interface PropertySchema<T = unknown, PT = unknown, V extends boolean = boolean> {
  type: PT;
  default: T;
  variable?: V;
}

interface EnumPropertyType<T extends string = string> {
  enum: readonly T[];
}

function numberProp(defaultValue: number, options?: { variable?: boolean }): PropertySchema<number, "number", boolean> {
  return { type: "number", default: defaultValue, variable: options?.variable };
}

function colorProp(defaultValue: string, options?: { variable?: boolean }): PropertySchema<string, "color", boolean> {
  return { type: "color", default: defaultValue, variable: options?.variable };
}

function stringProp(defaultValue: string, options?: { variable?: boolean }): PropertySchema<string, "string", boolean> {
  return { type: "string", default: defaultValue, variable: options?.variable };
}

function enumProp<T extends string>(values: readonly T[], defaultValue: T): PropertySchema<T, EnumPropertyType<T>> {
  return { type: { enum: values }, default: defaultValue, variable: false };
}

// =============================================================================
// MOCK EXTENSIONS
// =============================================================================
// In real usage, these would be imported from @sigma/node-border, @sigma/node-image, etc.
// Once packages export their extension definitions, these can be replaced.

const borderSchema = {
  size: numberProp(0, { variable: true }),
  color: colorProp("#000000", { variable: true }),
  mode: enumProp(["pixels", "relative"] as const, "pixels"),
} as const;

const nodeBorder = defineExtension({
  kind: "nodeLayer",
  primitives: {
    border: {
      schema: borderSchema,
      factory: (): FragmentLayer => ({
        name: "border",
        glsl: "",
        uniforms: [],
        attributes: [],
      }),
    },
  },
});

const imageSchema = {
  url: stringProp("", { variable: true }),
  drawingMode: enumProp(["image", "background"] as const, "image"),
  padding: numberProp(0),
} as const;

const nodeImage = defineExtension({
  kind: "nodeLayer",
  primitives: {
    image: {
      schema: imageSchema,
      factory: (): FragmentLayer => ({
        name: "image",
        glsl: "",
        uniforms: [],
        attributes: [],
      }),
    },
  },
});

// =============================================================================
// TYPE TESTS: defineExtension
// =============================================================================

describe("defineExtension", () => {
  test("returns correctly typed PrimitiveExtension", () => {
    const ext = defineExtension({
      kind: "nodeLayer",
      primitives: {
        myLayer: {
          schema: { size: numberProp(1) },
          factory: (): FragmentLayer => ({ name: "myLayer", glsl: "", uniforms: [], attributes: [] }),
        },
      },
    });

    // Verify the extension has the expected structure
    expectTypeOf(ext).toHaveProperty("kind");
    expectTypeOf(ext).toHaveProperty("primitives");
    expectTypeOf(ext.primitives).toHaveProperty("myLayer");
  });

  test("accepts valid built-in kinds", () => {
    // All these should compile without error - if they don't, TypeScript will fail
    const layerExt = defineExtension({
      kind: "nodeLayer",
      primitives: {
        test: { schema: {}, factory: (): FragmentLayer => ({ name: "test", glsl: "", uniforms: [], attributes: [] }) },
      },
    });
    expectTypeOf(layerExt).toHaveProperty("kind");

    const shapeExt = defineExtension({
      kind: "nodeShape",
      primitives: {
        test: {
          schema: {},
          factory: () => ({ name: "test", glsl: "", sdf: "", inradiusFactor: 1 }),
        },
      },
    });
    expectTypeOf(shapeExt).toHaveProperty("kind");
  });
});

// =============================================================================
// TYPE TESTS: Mock extension structure
// =============================================================================

describe("Extension structure", () => {
  test("nodeBorder extension has correct structure", () => {
    expectTypeOf(nodeBorder).toHaveProperty("kind");
    expectTypeOf(nodeBorder).toHaveProperty("primitives");
    expectTypeOf(nodeBorder.primitives.border).toHaveProperty("schema");
    expectTypeOf(nodeBorder.primitives.border).toHaveProperty("factory");
  });

  test("nodeImage extension has correct structure", () => {
    expectTypeOf(nodeImage).toHaveProperty("kind");
    expectTypeOf(nodeImage).toHaveProperty("primitives");
    expectTypeOf(nodeImage.primitives.image).toHaveProperty("schema");
    expectTypeOf(nodeImage.primitives.image).toHaveProperty("factory");
  });
});

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

    expectTypeOf(withVar.variable).toEqualTypeOf<boolean | undefined>();
    expectTypeOf(withoutVar.variable).toEqualTypeOf<boolean | undefined>();
  });
});

// =============================================================================
// PLACEHOLDER: defineSigmaOptions tests
// =============================================================================
// These tests are commented out because defineSigmaOptions doesn't yet support
// the extensions property. Uncomment when the API is complete.

/*
import { defineSigmaOptions } from "sigma/types";
import { BaseEdgeState, BaseGraphState, BaseNodeState } from "sigma/types";

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

describe("defineSigmaOptions - With Extensions", () => {
  test("shapes with border example compiles", () => {
    const options = defineSigmaOptions({
      extensions: [nodeBorder],
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
          layers: ["fill", { type: "border", size: "borderSize", color: "borderColor", mode: "pixels" }],
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
*/
