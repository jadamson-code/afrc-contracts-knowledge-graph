/**
 * Type tests for Sigma.js primitives WITHOUT satellite package imports.
 *
 * These tests verify that WITHOUT importing satellite packages, their layer
 * types are NOT recognized, causing TypeScript errors.
 *
 * Run with: npx vitest typecheck
 */
import { defineSigmaOptions } from "sigma/types";
import { describe, test } from "vitest";

// NOTE: We intentionally DO NOT import satellite packages here.
// This file tests that the type system correctly rejects unknown layers.

// =============================================================================
// TYPE TESTS: Satellite layers are NOT recognized without imports
// =============================================================================

describe("Without satellite imports", () => {
  test("border layer is NOT recognized without import", () => {
    defineSigmaOptions({
      primitives: {
        nodes: {
          shapes: ["circle"],
          layers: [
            "fill",
            // @ts-expect-error - "border" is not a recognized layer type without importing @sigma/node-border
            { type: "border", borders: [{ size: 0.1, color: "#000" }] },
            // @ts-expect-error - "shadow" is not an existing primitive at all
            { type: "shadow", color: "#ccc", blur: 5 },
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
  });

  test("image layer is NOT recognized without import", () => {
    defineSigmaOptions({
      primitives: {
        nodes: {
          shapes: ["circle"],
          layers: [
            "fill",
            // @ts-expect-error - "image" is not a recognized layer type without importing @sigma/node-image
            { type: "image", name: "myImage" },
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
  });

  test("piechart layer is NOT recognized without import", () => {
    defineSigmaOptions({
      primitives: {
        nodes: {
          shapes: ["circle"],
          layers: [
            // @ts-expect-error - "piechart" is not a recognized layer type without importing @sigma/node-piechart
            { type: "piechart", slices: [{ color: "#f00", value: 1 }] },
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
  });

  test("built-in layers still work without satellite imports", () => {
    // This should compile without errors - built-in layers like "fill" should always work
    defineSigmaOptions({
      primitives: {
        nodes: {
          shapes: ["circle"],
          layers: ["fill"],
        },
      },
      styles: {
        nodes: {
          color: "#666",
          size: 10,
        },
      },
    });
  });
});
