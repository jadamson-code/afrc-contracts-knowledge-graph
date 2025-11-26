/**
 * Unit tests for @sigma/node-border shader generation.
 * These tests verify that border layer shaders compile correctly.
 */
import { layerBorder } from "@sigma/node-border";
import { generateShaders, sdfCircle, sdfDiamond, sdfSquare, sdfTriangle } from "sigma/rendering";
import { describe, expect, test } from "vitest";

import { expectShadersToCompile } from "../_helpers";

describe("Border layer from @sigma/node-border", () => {
  describe("Basic border configurations", () => {
    test("generates compilable shaders with fixed color border", () => {
      const generated = generateShaders({
        shape: sdfCircle(),
        layers: [
          layerBorder({
            borders: [
              { size: { value: 0.1 }, color: { value: "#ff0000" } },
              { size: { fill: true }, color: { value: "#0000ff" } },
            ],
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });

    test("generates compilable shaders with attribute-based color", () => {
      const generated = generateShaders({
        shape: sdfCircle(),
        layers: [
          layerBorder({
            borders: [
              { size: { value: 0.1 }, color: { attribute: "borderColor" } },
              { size: { fill: true }, color: { attribute: "color" } },
            ],
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });

    test("generates compilable shaders with transparent color", () => {
      const generated = generateShaders({
        shape: sdfCircle(),
        layers: [
          layerBorder({
            borders: [
              { size: { value: 0.2 }, color: { transparent: true } },
              { size: { fill: true }, color: { value: "#00ff00" } },
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
        shape: sdfCircle(),
        layers: [
          layerBorder({
            borders: [
              { size: { value: 0.15, mode: "relative" }, color: { value: "#ff0000" } },
              { size: { fill: true }, color: { value: "#ffffff" } },
            ],
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });

    test("generates compilable shaders with pixels size mode", () => {
      const generated = generateShaders({
        shape: sdfCircle(),
        layers: [
          layerBorder({
            borders: [
              { size: { value: 5, mode: "pixels" }, color: { value: "#ff0000" } },
              { size: { fill: true }, color: { value: "#ffffff" } },
            ],
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });

    test("generates compilable shaders with attribute-based size", () => {
      const generated = generateShaders({
        shape: sdfCircle(),
        layers: [
          layerBorder({
            borders: [
              { size: { attribute: "borderSize", defaultValue: 0.1 }, color: { value: "#ff0000" } },
              { size: { fill: true }, color: { attribute: "color" } },
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
        shape: sdfCircle(),
        layers: [
          layerBorder({
            borders: [
              { size: { value: 0.1 }, color: { value: "#ff0000" } },
              { size: { value: 0.1 }, color: { value: "#00ff00" } },
              { size: { fill: true }, color: { value: "#0000ff" } },
            ],
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });

    test("generates compilable shaders with multiple fill borders", () => {
      const generated = generateShaders({
        shape: sdfCircle(),
        layers: [
          layerBorder({
            borders: [
              { size: { value: 0.1 }, color: { value: "#ff0000" } },
              { size: { fill: true }, color: { value: "#00ff00" } },
              { size: { fill: true }, color: { value: "#0000ff" } },
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
        shape: sdfSquare({ cornerRadius: 0.1 }),
        layers: [
          layerBorder({
            borders: [
              { size: { value: 0.1 }, color: { value: "#ff0000" } },
              { size: { fill: true }, color: { attribute: "color" } },
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
          layerBorder({
            borders: [
              { size: { value: 0.15 }, color: { attribute: "borderColor" } },
              { size: { fill: true }, color: { attribute: "color" } },
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
          layerBorder({
            borders: [
              { size: { value: 0.2 }, color: { value: "#ffff00" } },
              { size: { fill: true }, color: { value: "#000000" } },
            ],
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });
  });

  describe("Border layer metadata", () => {
    test("collects border-specific uniforms for fixed colors", () => {
      const generated = generateShaders({
        shape: sdfCircle(),
        layers: [
          layerBorder({
            borders: [
              { size: { value: 0.1 }, color: { value: "#ff0000" } },
              { size: { fill: true }, color: { value: "#0000ff" } },
            ],
          }),
        ],
      });

      expect(generated.uniforms).toContain("u_borderColor_1");
      expect(generated.uniforms).toContain("u_borderColor_2");
    });

    test("collects border-specific attributes for attribute-based values", () => {
      const generated = generateShaders({
        shape: sdfCircle(),
        layers: [
          layerBorder({
            borders: [
              { size: { attribute: "borderSize", defaultValue: 0.1 }, color: { attribute: "borderColor" } },
              { size: { fill: true }, color: { attribute: "color" } },
            ],
          }),
        ],
      });

      const attrNames = generated.attributes.map((a) => a.name);
      expect(attrNames).toContain("a_borderSize_1");
      expect(attrNames).toContain("a_borderColor_1");
      expect(attrNames).toContain("a_borderColor_2");
    });
  });
});
