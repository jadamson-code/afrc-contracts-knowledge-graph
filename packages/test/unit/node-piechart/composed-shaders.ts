/**
 * Unit tests for @sigma/node-piechart shader generation.
 * These tests verify that piechart layer shaders compile correctly.
 */
import { layerPiechart } from "@sigma/node-piechart";
import { generateShaders, sdfCircle, sdfDiamond, sdfSquare, sdfTriangle } from "sigma/rendering";
import { describe, expect, test } from "vitest";

import { expectShadersToCompile } from "../_helpers";

describe("Piechart layer from @sigma/node-piechart", () => {
  describe("Basic piechart configurations", () => {
    test("generates compilable shaders with fixed color slices", () => {
      const generated = generateShaders({
        shape: sdfCircle(),
        layers: [
          layerPiechart({
            slices: [
              { color: { value: "#ff0000" }, value: { value: 1 } },
              { color: { value: "#00ff00" }, value: { value: 1 } },
              { color: { value: "#0000ff" }, value: { value: 1 } },
            ],
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });

    test("generates compilable shaders with attribute-based colors", () => {
      const generated = generateShaders({
        shape: sdfCircle(),
        layers: [
          layerPiechart({
            slices: [
              { color: { attribute: "color1" }, value: { value: 1 } },
              { color: { attribute: "color2" }, value: { value: 1 } },
            ],
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });

    test("generates compilable shaders with attribute-based values", () => {
      const generated = generateShaders({
        shape: sdfCircle(),
        layers: [
          layerPiechart({
            slices: [
              { color: { value: "#ff0000" }, value: { attribute: "value1" } },
              { color: { value: "#00ff00" }, value: { attribute: "value2" } },
              { color: { value: "#0000ff" }, value: { attribute: "value3" } },
            ],
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });

    test("generates compilable shaders with transparent slices", () => {
      const generated = generateShaders({
        shape: sdfCircle(),
        layers: [
          layerPiechart({
            slices: [
              { color: { value: "#ff0000" }, value: { value: 1 } },
              { color: { transparent: true }, value: { value: 1 } },
              { color: { value: "#0000ff" }, value: { value: 1 } },
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
        shape: sdfCircle(),
        layers: [
          layerPiechart({
            offset: { value: Math.PI / 4 },
            slices: [
              { color: { value: "#ff0000" }, value: { value: 1 } },
              { color: { value: "#00ff00" }, value: { value: 1 } },
            ],
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });

    test("generates compilable shaders with attribute-based offset", () => {
      const generated = generateShaders({
        shape: sdfCircle(),
        layers: [
          layerPiechart({
            offset: { attribute: "offset" },
            slices: [
              { color: { value: "#ff0000" }, value: { value: 1 } },
              { color: { value: "#00ff00" }, value: { value: 1 } },
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
        shape: sdfCircle(),
        layers: [
          layerPiechart({
            slices: [{ color: { value: "#ff0000" }, value: { value: 1 } }],
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });

    test("generates compilable shaders with two slices", () => {
      const generated = generateShaders({
        shape: sdfCircle(),
        layers: [
          layerPiechart({
            slices: [
              { color: { value: "#ff0000" }, value: { value: 1 } },
              { color: { value: "#00ff00" }, value: { value: 1 } },
            ],
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });

    test("generates compilable shaders with many slices", () => {
      const generated = generateShaders({
        shape: sdfCircle(),
        layers: [
          layerPiechart({
            slices: [
              { color: { value: "#ff0000" }, value: { value: 1 } },
              { color: { value: "#00ff00" }, value: { value: 1 } },
              { color: { value: "#0000ff" }, value: { value: 1 } },
              { color: { value: "#ffff00" }, value: { value: 1 } },
              { color: { value: "#ff00ff" }, value: { value: 1 } },
              { color: { value: "#00ffff" }, value: { value: 1 } },
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
        shape: sdfCircle(),
        layers: [
          layerPiechart({
            slices: [
              { color: { value: "#ff0000" }, value: { value: 1 } },
              { color: { attribute: "color2" }, value: { value: 1 } },
              { color: { transparent: true }, value: { value: 1 } },
            ],
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });

    test("generates compilable shaders with mixed values (fixed and attribute)", () => {
      const generated = generateShaders({
        shape: sdfCircle(),
        layers: [
          layerPiechart({
            slices: [
              { color: { value: "#ff0000" }, value: { value: 2 } },
              { color: { value: "#00ff00" }, value: { attribute: "value2" } },
              { color: { value: "#0000ff" }, value: { value: 1 } },
            ],
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });

    test("generates compilable shaders with all attribute-based", () => {
      const generated = generateShaders({
        shape: sdfCircle(),
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
        shape: sdfCircle(),
        layers: [
          layerPiechart({
            slices: [
              { color: { value: "#ff0000" }, value: { attribute: "value1" } },
              { color: { value: "#00ff00" }, value: { attribute: "value2" } },
            ],
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });

    test("generates compilable shaders with square shape", () => {
      const generated = generateShaders({
        shape: sdfSquare({ cornerRadius: 0.1 }),
        layers: [
          layerPiechart({
            slices: [
              { color: { value: "#ff0000" }, value: { attribute: "value1" } },
              { color: { value: "#00ff00" }, value: { attribute: "value2" } },
            ],
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });

    test("generates compilable shaders with triangle shape", () => {
      const generated = generateShaders({
        shape: sdfTriangle({ cornerRadius: 0.05 }),
        layers: [
          layerPiechart({
            slices: [
              { color: { value: "#ff0000" }, value: { attribute: "value1" } },
              { color: { value: "#00ff00" }, value: { attribute: "value2" } },
              { color: { value: "#0000ff" }, value: { attribute: "value3" } },
            ],
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });

    test("generates compilable shaders with diamond shape", () => {
      const generated = generateShaders({
        shape: sdfDiamond({ rotation: Math.PI / 4 }),
        layers: [
          layerPiechart({
            slices: [
              { color: { attribute: "color" }, value: { value: 1 } },
              { color: { value: "#ffffff" }, value: { value: 2 } },
            ],
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });
  });

  describe("Piechart layer metadata", () => {
    test("collects piechart-specific uniforms for fixed colors", () => {
      const generated = generateShaders({
        shape: sdfCircle(),
        layers: [
          layerPiechart({
            slices: [
              { color: { value: "#ff0000" }, value: { value: 1 } },
              { color: { value: "#00ff00" }, value: { value: 1 } },
            ],
          }),
        ],
      });

      expect(generated.uniforms).toContain("u_sliceColor_1");
      expect(generated.uniforms).toContain("u_sliceColor_2");
      expect(generated.uniforms).toContain("u_defaultColor");
    });

    test("collects piechart-specific uniforms for fixed offset", () => {
      const generated = generateShaders({
        shape: sdfCircle(),
        layers: [
          layerPiechart({
            offset: { value: Math.PI / 2 },
            slices: [{ color: { value: "#ff0000" }, value: { value: 1 } }],
          }),
        ],
      });

      expect(generated.uniforms).toContain("u_offset");
    });

    test("collects piechart-specific attributes for attribute-based colors", () => {
      const generated = generateShaders({
        shape: sdfCircle(),
        layers: [
          layerPiechart({
            slices: [
              { color: { attribute: "color1" }, value: { value: 1 } },
              { color: { attribute: "color2" }, value: { value: 1 } },
            ],
          }),
        ],
      });

      const attrNames = generated.attributes.map((a) => a.name);
      expect(attrNames).toContain("a_sliceColor_1");
      expect(attrNames).toContain("a_sliceColor_2");
    });

    test("collects piechart-specific attributes for attribute-based values", () => {
      const generated = generateShaders({
        shape: sdfCircle(),
        layers: [
          layerPiechart({
            slices: [
              { color: { value: "#ff0000" }, value: { attribute: "value1" } },
              { color: { value: "#00ff00" }, value: { attribute: "value2" } },
            ],
          }),
        ],
      });

      const attrNames = generated.attributes.map((a) => a.name);
      expect(attrNames).toContain("a_sliceValue_1");
      expect(attrNames).toContain("a_sliceValue_2");
    });

    test("collects piechart offset attribute when attribute-based", () => {
      const generated = generateShaders({
        shape: sdfCircle(),
        layers: [
          layerPiechart({
            offset: { attribute: "offset" },
            slices: [{ color: { value: "#ff0000" }, value: { value: 1 } }],
          }),
        ],
      });

      const attrNames = generated.attributes.map((a) => a.name);
      expect(attrNames).toContain("a_offset");
    });
  });

  describe("Default color configuration", () => {
    test("generates compilable shaders with custom default color", () => {
      const generated = generateShaders({
        shape: sdfCircle(),
        layers: [
          layerPiechart({
            defaultColor: "#808080",
            slices: [
              { color: { value: "#ff0000" }, value: { attribute: "value1" } },
              { color: { value: "#00ff00" }, value: { attribute: "value2" } },
            ],
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });
  });
});
