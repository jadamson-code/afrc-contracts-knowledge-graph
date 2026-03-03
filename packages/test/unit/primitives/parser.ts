/**
 * Unit tests for the primitives parser module.
 */
import { describe, it, expect } from "vitest";
import {
  parseNodeShape,
  parseNodeLayer,
  parseEdgePath,
  parseEdgeLayer,
  parseEdgeExtremity,
  parseNodePrimitives,
  parseEdgePrimitives,
} from "sigma/primitives";
import { sdfCircle, sdfSquare, layerFill, pathLine, pathCurved, layerPlain, extremityArrow } from "sigma/rendering";

// =============================================================================
// NODE SHAPE PARSING
// =============================================================================

describe("Primitives Parser", () => {
  describe("parseNodeShape", () => {
    it("should parse pre-parsed SDFShape", () => {
      const shape = sdfCircle();
      const parsed = parseNodeShape(shape);
      expect(parsed.name).toBe("circle");
      expect(parsed.glsl).toContain("sdf_circle");
    });

    it("should parse custom form", () => {
      const customShape = parseNodeShape({
        name: "custom",
        glsl: "float sdf_custom(vec2 uv, float size) { return 1.0; }",
        inradiusFactor: 0.8,
      });
      expect(customShape.name).toBe("custom");
      expect(customShape.glsl).toContain("sdf_custom");
      expect(customShape.inradiusFactor).toBe(0.8);
    });
  });

  // ===========================================================================
  // NODE LAYER PARSING
  // ===========================================================================

  describe("parseNodeLayer", () => {
    it("should parse pre-parsed FragmentLayer", () => {
      const layer = layerFill();
      const parsed = parseNodeLayer(layer);
      expect(parsed.name).toBe("fill");
    });

    it("should parse pre-parsed FragmentLayer with attribute source", () => {
      const layer = layerFill({ color: { attribute: "myColorVar" } });
      const parsed = parseNodeLayer(layer);
      expect(parsed.name).toBe("fill");
      expect(parsed.attributes.length).toBe(1);
      expect(parsed.attributes[0].source).toBe("myColorVar");
    });

    it("should parse custom form", () => {
      const customLayer = parseNodeLayer({
        name: "customLayer",
        glsl: "vec4 layer_custom() { return vec4(1.0); }",
        graphicVariables: [],
      });
      expect(customLayer.name).toBe("customLayer");
    });
  });

  // ===========================================================================
  // EDGE PATH PARSING
  // ===========================================================================

  describe("parseEdgePath", () => {
    it("should parse pre-parsed EdgePath", () => {
      const path = pathLine();
      const parsed = parseEdgePath(path);
      expect(parsed.name).toBe("straight");
      expect(parsed.segments).toBe(1);
    });

    it("should parse pre-parsed EdgePath with options", () => {
      const path = pathCurved({ segments: 20 });
      const parsed = parseEdgePath(path);
      expect(parsed.name).toBe("curved");
      expect(parsed.segments).toBe(20);
    });

    it("should parse custom form", () => {
      const customPath = parseEdgePath({
        name: "customPath",
        glsl: "vec2 path_custom_position(float t, vec2 s, vec2 e) { return mix(s, e, t); }",
        segments: 5,
      });
      expect(customPath.name).toBe("customPath");
      expect(customPath.segments).toBe(5);
    });
  });

  // ===========================================================================
  // EDGE LAYER PARSING
  // ===========================================================================

  describe("parseEdgeLayer", () => {
    it("should parse pre-parsed EdgeLayer", () => {
      const layer = layerPlain();
      const parsed = parseEdgeLayer(layer);
      expect(parsed.name).toBe("plain");
    });

    it("should parse custom form", () => {
      const customLayer = parseEdgeLayer({
        name: "customEdgeLayer",
        glsl: "vec4 layer_custom() { return vec4(1.0); }",
        graphicVariables: [],
      });
      expect(customLayer.name).toBe("customEdgeLayer");
    });
  });

  // ===========================================================================
  // EDGE EXTREMITY PARSING
  // ===========================================================================

  describe("parseEdgeExtremity", () => {
    it("should parse pre-parsed EdgeExtremity", () => {
      const arrow = extremityArrow();
      const parsed = parseEdgeExtremity(arrow);
      expect(parsed).not.toBeNull();
      expect(parsed!.name).toBe("arrow");
      expect(parsed!.length).toBe(5);
      expect(parsed!.widthFactor).toBe(4);
    });

    it("should parse custom form", () => {
      const customExtremity = parseEdgeExtremity({
        name: "customArrow",
        glsl: "float extremity_custom(vec2 uv, float l, float w) { return 0.0; }",
        length: 3,
        widthFactor: 2,
      });
      expect(customExtremity).not.toBeNull();
      expect(customExtremity!.name).toBe("customArrow");
      expect(customExtremity!.length).toBe(3);
      expect(customExtremity!.widthFactor).toBe(2);
    });
  });

  // ===========================================================================
  // FULL PRIMITIVES PARSING
  // ===========================================================================

  describe("parseNodePrimitives", () => {
    it("should parse node primitives with shapes and layers", () => {
      const result = parseNodePrimitives({
        shapes: [sdfCircle(), sdfSquare()],
        layers: [layerFill()],
      });

      expect(result.shapes).toHaveLength(2);
      expect(result.shapes[0].name).toBe("circle");
      expect(result.shapes[1].name).toBe("square");
      expect(result.layers).toHaveLength(1);
      expect(result.layers[0].name).toBe("fill");
    });

    it("should use default primitives when undefined", () => {
      const result = parseNodePrimitives(undefined);
      expect(result.shapes).toHaveLength(1);
      expect(result.shapes[0].name).toBe("circle");
      expect(result.layers).toHaveLength(1);
      expect(result.layers[0].name).toBe("fill");
    });
  });

  describe("parseEdgePrimitives", () => {
    it("should parse edge primitives with paths, extremities, and layers", () => {
      const result = parseEdgePrimitives({
        paths: [pathLine(), pathCurved()],
        extremities: [extremityArrow()],
        layers: [layerPlain()],
      });

      expect(result.paths).toHaveLength(2);
      expect(result.paths[0].name).toBe("straight");
      expect(result.paths[1].name).toBe("curved");
      expect(result.extremities).toHaveLength(1);
      expect(result.extremities[0].name).toBe("arrow");
      expect(result.layers).toHaveLength(1);
      expect(result.layers[0].name).toBe("plain");
    });

    it("should use default primitives when undefined", () => {
      const result = parseEdgePrimitives(undefined);
      expect(result.paths).toHaveLength(1);
      expect(result.paths[0].name).toBe("straight");
      expect(result.extremities).toHaveLength(0);
      expect(result.layers).toHaveLength(1);
      expect(result.layers[0].name).toBe("plain");
    });
  });
});
