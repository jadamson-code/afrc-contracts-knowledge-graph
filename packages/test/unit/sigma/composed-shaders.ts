/**
 * Unit tests for composed node program shader generation.
 * These tests verify that generated shaders compile correctly.
 */
import { generateShaders, layerFill, sdfCircle, sdfDiamond, sdfSquare, sdfTriangle } from "sigma/rendering";
import { describe, expect, test } from "vitest";

import { expectShadersToCompile } from "../_helpers";

describe("Composed node program shader generation", () => {
  describe("Circle shape", () => {
    test("generates compilable shaders with fill layer", () => {
      const generated = generateShaders({
        shape: sdfCircle(),
        layers: [layerFill()],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });
  });

  describe("Square shape", () => {
    test("generates compilable shaders with default options", () => {
      const generated = generateShaders({
        shape: sdfSquare(),
        layers: [layerFill()],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });

    test("generates compilable shaders with cornerRadius", () => {
      const generated = generateShaders({
        shape: sdfSquare({ cornerRadius: 0.2 }),
        layers: [layerFill()],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });

    test("generates compilable shaders with rotation", () => {
      const generated = generateShaders({
        shape: sdfSquare({ rotation: Math.PI / 4 }),
        layers: [layerFill()],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });

    test("generates compilable shaders with both options", () => {
      const generated = generateShaders({
        shape: sdfSquare({ cornerRadius: 0.1, rotation: Math.PI / 6 }),
        layers: [layerFill()],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });
  });

  describe("Triangle shape", () => {
    test("generates compilable shaders with default options", () => {
      const generated = generateShaders({
        shape: sdfTriangle(),
        layers: [layerFill()],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });

    test("generates compilable shaders with cornerRadius", () => {
      const generated = generateShaders({
        shape: sdfTriangle({ cornerRadius: 0.1 }),
        layers: [layerFill()],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });

    test("generates compilable shaders with rotation", () => {
      const generated = generateShaders({
        shape: sdfTriangle({ rotation: Math.PI }),
        layers: [layerFill()],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });
  });

  describe("Diamond shape", () => {
    test("generates compilable shaders with default options", () => {
      const generated = generateShaders({
        shape: sdfDiamond(),
        layers: [layerFill()],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });

    test("generates compilable shaders with cornerRadius", () => {
      const generated = generateShaders({
        shape: sdfDiamond({ cornerRadius: 0.15 }),
        layers: [layerFill()],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });

    test("generates compilable shaders with rotation", () => {
      const generated = generateShaders({
        shape: sdfDiamond({ rotation: Math.PI / 4 }),
        layers: [layerFill()],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });
  });

  describe("Shader metadata", () => {
    test("collects correct uniforms for circle + fill", () => {
      const generated = generateShaders({
        shape: sdfCircle(),
        layers: [layerFill()],
      });

      expect(generated.uniforms).toContain("u_matrix");
      expect(generated.uniforms).toContain("u_sizeRatio");
      expect(generated.uniforms).toContain("u_correctionRatio");
    });

    test("collects shape-specific uniforms for square", () => {
      const generated = generateShaders({
        shape: sdfSquare({ cornerRadius: 0.2, rotation: Math.PI / 4 }),
        layers: [layerFill()],
      });

      expect(generated.uniforms).toContain("u_cornerRadius");
      expect(generated.uniforms).toContain("u_rotation");
    });

    test("collects standard attributes", () => {
      const generated = generateShaders({
        shape: sdfCircle(),
        layers: [layerFill()],
      });

      const attrNames = generated.attributes.map((a) => a.name);
      expect(attrNames).toContain("a_position");
      expect(attrNames).toContain("a_size");
      expect(attrNames).toContain("a_color");
      expect(attrNames).toContain("a_id");
    });
  });

  describe("Edge cases", () => {
    test("handles no layers gracefully", () => {
      const generated = generateShaders({
        shape: sdfCircle(),
        layers: [],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });

    test("handles multiple layers (when available)", () => {
      // For now we only have layerFill, but this tests the composition logic
      const generated = generateShaders({
        shape: sdfCircle(),
        layers: [layerFill()],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });
  });
});
