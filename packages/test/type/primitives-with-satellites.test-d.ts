/**
 * Type tests for Sigma.js primitives WITH satellite package imports.
 *
 * These tests verify that satellite package factory functions can be used
 * in the layers array of defineSigmaOptions.
 *
 * Run with: npx vitest typecheck
 */
import { layerBorder } from "@sigma/node-border";
import { layerImage } from "@sigma/node-image";
import { layerPiechart } from "@sigma/node-piechart";
import { sdfCircle, layerFill } from "sigma/rendering";
import { defineSigmaOptions } from "sigma/types";
import { describe, expectTypeOf, test } from "vitest";

// =============================================================================
// TYPE TESTS: Satellite layers work via factory functions
// =============================================================================

describe("With satellite factory functions", () => {
  test("layerBorder() is accepted in layers", () => {
    const options = defineSigmaOptions({
      primitives: {
        nodes: {
          shapes: [sdfCircle()],
          layers: [layerFill(), layerBorder({ borders: [{ size: 0.1, color: "#000" }] })],
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

  test("layerImage() is accepted in layers", () => {
    const options = defineSigmaOptions({
      primitives: {
        nodes: {
          shapes: [sdfCircle()],
          layers: [layerFill(), layerImage({ name: "myImage" })],
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

  test("layerPiechart() is accepted in layers", () => {
    const options = defineSigmaOptions({
      primitives: {
        nodes: {
          shapes: [sdfCircle()],
          layers: [layerPiechart({ slices: [{ color: "#f00", value: 1 }] })],
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
          shapes: [sdfCircle()],
          layers: [
            layerImage({ name: "background" }),
            layerPiechart({ slices: [{ color: "#f00", value: 1 }] }),
            layerBorder({ borders: [{ size: 0.1, color: "#000" }] }),
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
