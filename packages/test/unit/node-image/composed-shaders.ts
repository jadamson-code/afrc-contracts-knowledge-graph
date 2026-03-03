/**
 * Unit tests for @sigma/node-image shader generation.
 * These tests verify that image layer shaders compile correctly.
 */
import { layerImage } from "@sigma/node-image";
import { generateShaders, sdfCircle, sdfDiamond, sdfSquare, sdfTriangle } from "sigma/rendering";
import { describe, expect, test } from "vitest";

import { expectShadersToCompile } from "../_helpers";

describe("Image layer from @sigma/node-image", () => {
  describe("Basic image configurations", () => {
    test("generates compilable shaders with default options", () => {
      const generated = generateShaders({
        shapes: [sdfCircle()],
        layers: [layerImage()],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });

    test("generates compilable shaders with image drawing mode", () => {
      const generated = generateShaders({
        shapes: [sdfCircle()],
        layers: [
          layerImage({
            drawingMode: "image",
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });

    test("generates compilable shaders with color drawing mode (pictogram)", () => {
      const generated = generateShaders({
        shapes: [sdfCircle()],
        layers: [
          layerImage({
            drawingMode: "color",
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });
  });

  describe("Padding options", () => {
    test("generates compilable shaders with no padding", () => {
      const generated = generateShaders({
        shapes: [sdfCircle()],
        layers: [
          layerImage({
            padding: 0,
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });

    test("generates compilable shaders with 5% padding", () => {
      const generated = generateShaders({
        shapes: [sdfCircle()],
        layers: [
          layerImage({
            padding: 0.05,
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });

    test("generates compilable shaders with 20% padding", () => {
      const generated = generateShaders({
        shapes: [sdfCircle()],
        layers: [
          layerImage({
            padding: 0.2,
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });
  });

  describe("Multiple texture atlases", () => {
    test("generates compilable shaders with single texture", () => {
      const generated = generateShaders({
        shapes: [sdfCircle()],
        layers: [layerImage()],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });

    test("generates compilable shaders with multiple textures", () => {
      const generated = generateShaders({
        shapes: [sdfCircle()],
        layers: [layerImage()],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });

    test("generates compilable shaders with many textures", () => {
      const generated = generateShaders({
        shapes: [sdfCircle()],
        layers: [layerImage()],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });
  });

  describe("Image layer with different shapes", () => {
    test("generates compilable shaders with circle shape", () => {
      const generated = generateShaders({
        shapes: [sdfCircle()],
        layers: [
          layerImage({
            drawingMode: "image",
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });

    test("generates compilable shaders with square shape", () => {
      const generated = generateShaders({
        shapes: [sdfSquare({ cornerRadius: 0.1 })],
        layers: [
          layerImage({
            drawingMode: "image",
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });

    test("generates compilable shaders with triangle shape", () => {
      const generated = generateShaders({
        shapes: [sdfTriangle({ cornerRadius: 0.05 })],
        layers: [
          layerImage({
            drawingMode: "color",
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });

    test("generates compilable shaders with diamond shape", () => {
      const generated = generateShaders({
        shapes: [sdfDiamond({ rotation: Math.PI / 4 })],
        layers: [
          layerImage({
            drawingMode: "image",
            padding: 0.1,
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });
  });

  describe("Image layer metadata", () => {
    test("collects image-specific uniforms", () => {
      const generated = generateShaders({
        shapes: [sdfCircle()],
        layers: [layerImage()],
      });

      // Should have u_cameraAngle uniform
      expect(generated.uniforms).toContain("u_cameraAngle");
    });

    test("layer definition contains image-specific attributes", () => {
      // In the new architecture, layer attributes go into texture, not buffer
      // Attribute names include the layer name suffix (default: "image")
      const layer = layerImage();

      const attrNames = layer.attributes.map((a) => a.name);
      expect(attrNames).toContain("texture_image");
      expect(attrNames).toContain("textureIndex_image");
    });

    test("texture attribute has size 4 for UV coordinates", () => {
      const layer = layerImage();

      const textureAttr = layer.attributes.find((a) => a.name === "texture_image");
      expect(textureAttr).toBeDefined();
      expect(textureAttr?.size).toBe(4);
    });

    test("textureIndex attribute has size 1", () => {
      const layer = layerImage();

      const textureIndexAttr = layer.attributes.find((a) => a.name === "textureIndex_image");
      expect(textureIndexAttr).toBeDefined();
      expect(textureIndexAttr?.size).toBe(1);
    });
  });

  describe("Combined configurations", () => {
    test("generates compilable shaders with all options configured", () => {
      const generated = generateShaders({
        shapes: [sdfCircle()],
        layers: [
          layerImage({
            drawingMode: "image",
            padding: 0.1,
            colorAttribute: "color",
            imageAttribute: "image",
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });

    test("generates compilable shaders for pictogram mode", () => {
      const generated = generateShaders({
        shapes: [sdfCircle()],
        layers: [
          layerImage({
            drawingMode: "color",
            padding: 0,
          }),
        ],
      });

      expectShadersToCompile(generated.vertexShader, generated.fragmentShader);
    });
  });
});
