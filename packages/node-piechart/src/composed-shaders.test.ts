/**
 * Unit tests for @sigma/node-piechart shader generation.
 * These tests verify that piechart layer shaders compile correctly.
 */
import { layerPiechart } from "@sigma/node-piechart";
import { generateShaders, sdfCircle, sdfDiamond, sdfSquare, sdfTriangle } from "sigma/rendering";
import { describe, expect, test } from "vitest";

import { expectShadersToCompile } from "../../sigma/src/_test-helpers";

describe("Piechart layer from @sigma/node-piechart", () => {
  describe("Basic piechart configurations", () => {
    test("generates compilable shaders with fixed color slices", () => {
      const generated = generateShaders({
        shapes: [sdfCircle()],
        layers: [
          layerPiechart({
            slices: [
              { color: "#ff0000", value: 1 },
              { color: "#00ff00", value: 1 },
              { color: "#0000ff", value: 1 },
            ],
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });

    test("generates compilable shaders with attribute-based colors", () => {
      const generated = generateShaders({
        shapes: [sdfCircle()],
        layers: [
          layerPiechart({
            slices: [
              { color: { attribute: "color1" }, value: 1 },
              { color: { attribute: "color2" }, value: 1 },
            ],
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });

    test("generates compilable shaders with attribute-based values", () => {
      const generated = generateShaders({
        shapes: [sdfCircle()],
        layers: [
          layerPiechart({
            slices: [
              { color: "#ff0000", value: { attribute: "value1" } },
              { color: "#00ff00", value: { attribute: "value2" } },
              { color: "#0000ff", value: { attribute: "value3" } },
            ],
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });

    test("generates compilable shaders with transparent slices", () => {
      const generated = generateShaders({
        shapes: [sdfCircle()],
        layers: [
          layerPiechart({
            slices: [
              { color: "#ff0000", value: 1 },
              { color: "transparent", value: 1 },
              { color: "#0000ff", value: 1 },
            ],
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });
  });

  describe("Offset configurations", () => {
    test("generates compilable shaders with fixed offset", () => {
      const generated = generateShaders({
        shapes: [sdfCircle()],
        layers: [
          layerPiechart({
            offset: Math.PI / 4,
            slices: [
              { color: "#ff0000", value: 1 },
              { color: "#00ff00", value: 1 },
            ],
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });

    test("generates compilable shaders with attribute-based offset", () => {
      const generated = generateShaders({
        shapes: [sdfCircle()],
        layers: [
          layerPiechart({
            offset: { attribute: "offset" },
            slices: [
              { color: "#ff0000", value: 1 },
              { color: "#00ff00", value: 1 },
            ],
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });
  });

  describe("Various slice counts", () => {
    test("generates compilable shaders with single slice", () => {
      const generated = generateShaders({
        shapes: [sdfCircle()],
        layers: [
          layerPiechart({
            slices: [{ color: "#ff0000", value: 1 }],
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });

    test("generates compilable shaders with two slices", () => {
      const generated = generateShaders({
        shapes: [sdfCircle()],
        layers: [
          layerPiechart({
            slices: [
              { color: "#ff0000", value: 1 },
              { color: "#00ff00", value: 1 },
            ],
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });

    test("generates compilable shaders with many slices", () => {
      const generated = generateShaders({
        shapes: [sdfCircle()],
        layers: [
          layerPiechart({
            slices: [
              { color: "#ff0000", value: 1 },
              { color: "#00ff00", value: 1 },
              { color: "#0000ff", value: 1 },
              { color: "#ffff00", value: 1 },
              { color: "#ff00ff", value: 1 },
              { color: "#00ffff", value: 1 },
            ],
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });
  });

  describe("Mixed attribute and value configurations", () => {
    test("generates compilable shaders with mixed colors (fixed and attribute)", () => {
      const generated = generateShaders({
        shapes: [sdfCircle()],
        layers: [
          layerPiechart({
            slices: [
              { color: "#ff0000", value: 1 },
              { color: { attribute: "color2" }, value: 1 },
              { color: "transparent", value: 1 },
            ],
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });

    test("generates compilable shaders with mixed values (fixed and attribute)", () => {
      const generated = generateShaders({
        shapes: [sdfCircle()],
        layers: [
          layerPiechart({
            slices: [
              { color: "#ff0000", value: 2 },
              { color: "#00ff00", value: { attribute: "value2" } },
              { color: "#0000ff", value: 1 },
            ],
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });

    test("generates compilable shaders with all attribute-based", () => {
      const generated = generateShaders({
        shapes: [sdfCircle()],
        layers: [
          layerPiechart({
            offset: { attribute: "offset" },
            slices: [
              { color: { attribute: "color1" }, value: { attribute: "value1" } },
              { color: { attribute: "color2" }, value: { attribute: "value2" } },
              { color: { attribute: "color3" }, value: { attribute: "value3" } },
            ],
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });
  });

  describe("Piechart layer with different shapes", () => {
    test("generates compilable shaders with circle shape", () => {
      const generated = generateShaders({
        shapes: [sdfCircle()],
        layers: [
          layerPiechart({
            slices: [
              { color: "#ff0000", value: { attribute: "value1" } },
              { color: "#00ff00", value: { attribute: "value2" } },
            ],
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });

    test("generates compilable shaders with square shape", () => {
      const generated = generateShaders({
        shapes: [sdfSquare({ cornerRadius: 0.1 })],
        layers: [
          layerPiechart({
            slices: [
              { color: "#ff0000", value: { attribute: "value1" } },
              { color: "#00ff00", value: { attribute: "value2" } },
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
          layerPiechart({
            slices: [
              { color: "#ff0000", value: { attribute: "value1" } },
              { color: "#00ff00", value: { attribute: "value2" } },
              { color: "#0000ff", value: { attribute: "value3" } },
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
          layerPiechart({
            slices: [
              { color: { attribute: "color" }, value: 1 },
              { color: "#ffffff", value: 2 },
            ],
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });
  });

  describe("Piechart layer metadata", () => {
    test("layer definition contains piechart-specific uniforms for fixed colors", () => {
      // In the new architecture, check the layer definition for uniforms
      const layer = layerPiechart({
        slices: [
          { color: "#ff0000", value: 1 },
          { color: "#00ff00", value: 1 },
        ],
      });

      const uniformNames = layer.uniforms.map((u) => u.name);
      expect(uniformNames).toContain("u_sliceColor_1");
      expect(uniformNames).toContain("u_sliceColor_2");
      expect(uniformNames).toContain("u_defaultColor");
    });

    test("layer definition contains piechart-specific uniforms for fixed offset", () => {
      const layer = layerPiechart({
        offset: Math.PI / 2,
        slices: [{ color: "#ff0000", value: 1 }],
      });

      const uniformNames = layer.uniforms.map((u) => u.name);
      expect(uniformNames).toContain("u_offset");
    });

    test("layer definition contains piechart-specific attributes for attribute-based colors", () => {
      // In the new architecture, layer attributes go into texture, not buffer
      // Attribute names don't have the 'a_' prefix in layer definition (generator adds it)
      const layer = layerPiechart({
        slices: [
          { color: { attribute: "color1" }, value: 1 },
          { color: { attribute: "color2" }, value: 1 },
        ],
      });

      const attrNames = layer.attributes.map((a) => a.name);
      expect(attrNames).toContain("sliceColor_1");
      expect(attrNames).toContain("sliceColor_2");
    });

    test("layer definition contains piechart-specific attributes for attribute-based values", () => {
      const layer = layerPiechart({
        slices: [
          { color: "#ff0000", value: { attribute: "value1" } },
          { color: "#00ff00", value: { attribute: "value2" } },
        ],
      });

      const attrNames = layer.attributes.map((a) => a.name);
      expect(attrNames).toContain("sliceValue_1");
      expect(attrNames).toContain("sliceValue_2");
    });

    test("layer definition contains piechart offset attribute when attribute-based", () => {
      const layer = layerPiechart({
        offset: { attribute: "offset" },
        slices: [{ color: "#ff0000", value: 1 }],
      });

      const attrNames = layer.attributes.map((a) => a.name);
      expect(attrNames).toContain("offset");
    });
  });

  describe("Default color configuration", () => {
    test("generates compilable shaders with custom default color", () => {
      const generated = generateShaders({
        shapes: [sdfCircle()],
        layers: [
          layerPiechart({
            defaultColor: "#808080",
            slices: [
              { color: "#ff0000", value: { attribute: "value1" } },
              { color: "#00ff00", value: { attribute: "value2" } },
            ],
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });
  });
});
