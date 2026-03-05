/**
 * Unit tests for @sigma/node-border shader generation.
 * These tests verify that border layer shaders compile correctly.
 */
import { layerBorder } from "@sigma/node-border";
import { generateShaders, sdfCircle, sdfDiamond, sdfSquare, sdfTriangle } from "sigma/rendering";
import { describe, expect, test } from "vitest";

import { expectShadersToCompile } from "../../sigma/src/_test-helpers";

describe("Border layer from @sigma/node-border", () => {
  describe("Basic border configurations", () => {
    test("generates compilable shaders with fixed color border", () => {
      const generated = generateShaders({
        shapes: [sdfCircle()],
        layers: [
          layerBorder({
            borders: [
              { size: 0.1, color: "#ff0000" },
              { fill: true, color: "#0000ff" },
            ],
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });

    test("generates compilable shaders with attribute-based color", () => {
      const generated = generateShaders({
        shapes: [sdfCircle()],
        layers: [
          layerBorder({
            borders: [
              { size: 0.1, color: { attribute: "borderColor" } },
              { fill: true, color: { attribute: "color" } },
            ],
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });

    test("generates compilable shaders with transparent color", () => {
      const generated = generateShaders({
        shapes: [sdfCircle()],
        layers: [
          layerBorder({
            borders: [
              { size: 0.2, color: "transparent" },
              { fill: true, color: "#00ff00" },
            ],
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });
  });

  describe("Border size modes", () => {
    test("generates compilable shaders with relative size mode", () => {
      const generated = generateShaders({
        shapes: [sdfCircle()],
        layers: [
          layerBorder({
            borders: [
              { size: 0.15, mode: "relative", color: "#ff0000" },
              { fill: true, color: "#ffffff" },
            ],
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });

    test("generates compilable shaders with pixels size mode", () => {
      const generated = generateShaders({
        shapes: [sdfCircle()],
        layers: [
          layerBorder({
            borders: [
              { size: 5, mode: "pixels", color: "#ff0000" },
              { fill: true, color: "#ffffff" },
            ],
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });

    test("generates compilable shaders with attribute-based size", () => {
      const generated = generateShaders({
        shapes: [sdfCircle()],
        layers: [
          layerBorder({
            borders: [
              { size: { attribute: "borderSize", default: 0.1 }, color: "#ff0000" },
              { fill: true, color: { attribute: "color" } },
            ],
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });
  });

  describe("Multiple borders", () => {
    test("generates compilable shaders with three borders", () => {
      const generated = generateShaders({
        shapes: [sdfCircle()],
        layers: [
          layerBorder({
            borders: [
              { size: 0.1, color: "#ff0000" },
              { size: 0.1, color: "#00ff00" },
              { fill: true, color: "#0000ff" },
            ],
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });

    test("generates compilable shaders with multiple fill borders", () => {
      const generated = generateShaders({
        shapes: [sdfCircle()],
        layers: [
          layerBorder({
            borders: [
              { size: 0.1, color: "#ff0000" },
              { fill: true, color: "#00ff00" },
              { fill: true, color: "#0000ff" },
            ],
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });
  });

  describe("Border layer with different shapes", () => {
    test("generates compilable shaders with square shape", () => {
      const generated = generateShaders({
        shapes: [sdfSquare({ cornerRadius: 0.1 })],
        layers: [
          layerBorder({
            borders: [
              { size: 0.1, color: "#ff0000" },
              { fill: true, color: { attribute: "color" } },
            ],
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });

    test("generates compilable shaders with triangle shape", () => {
      const generated = generateShaders({
        shapes: [sdfTriangle({ cornerRadius: 0.05 })],
        layers: [
          layerBorder({
            borders: [
              { size: 0.15, color: { attribute: "borderColor" } },
              { fill: true, color: { attribute: "color" } },
            ],
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });

    test("generates compilable shaders with diamond shape", () => {
      const generated = generateShaders({
        shapes: [sdfDiamond({ rotation: Math.PI / 4 })],
        layers: [
          layerBorder({
            borders: [
              { size: 0.2, color: "#ffff00" },
              { fill: true, color: "#000000" },
            ],
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });
  });

  describe("Border layer metadata", () => {
    test("layer definition contains border-specific uniforms for fixed colors", () => {
      // In the new architecture, check the layer definition for uniforms
      const layer = layerBorder({
        borders: [
          { size: 0.1, color: "#ff0000" },
          { fill: true, color: "#0000ff" },
        ],
      });

      const uniformNames = layer.uniforms.map((u) => u.name);
      expect(uniformNames).toContain("u_borderColor_1");
      expect(uniformNames).toContain("u_borderColor_2");
    });

    test("layer definition contains border-specific attributes for attribute-based values", () => {
      // In the new architecture, layer attributes go into texture, not buffer
      // Attribute names don't have the 'a_' prefix in layer definition (generator adds it)
      const layer = layerBorder({
        borders: [
          { size: { attribute: "borderSize", default: 0.1 }, color: { attribute: "borderColor" } },
          { fill: true, color: { attribute: "color" } },
        ],
      });

      const attrNames = layer.attributes.map((a) => a.name);
      expect(attrNames).toContain("borderSize_1");
      expect(attrNames).toContain("borderColor_1");
      expect(attrNames).toContain("borderColor_2");
    });
  });
});
