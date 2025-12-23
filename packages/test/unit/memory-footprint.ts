/**
 * Tests that verify memory footprint behavior for different style configurations.
 *
 * Key insights:
 * - When a layer uses constant values, they're baked into shader code
 * - When a layer uses attribute bindings, per-item storage is needed
 * - The layer attribute texture is always created but may have fewer floats per item
 * - Texture size grows when more attributes require more texels (>4 floats)
 */
import Graph from "graphology";
import Sigma from "sigma";
import { createElement } from "sigma/utils";
import { afterEach, describe, expect, it } from "vitest";

// Helper to create a sigma instance with given primitives
function createSigma(
  primitives: NonNullable<ConstructorParameters<typeof Sigma>[2]>["primitives"],
): { sigma: Sigma; graph: Graph; cleanup: () => void } {
  const graph = new Graph();
  const container = createElement("div", { width: "100px", height: "100px" });
  document.body.append(container);

  const sigma = new Sigma(graph, container, { primitives });

  return {
    sigma,
    graph,
    cleanup: () => {
      sigma.kill();
      container.remove();
    },
  };
}

// Helper to find a texture by name pattern
function findTexture(sigma: Sigma, pattern: string) {
  const stats = sigma.getMemoryStats();
  return stats.textures.find((t) => t.name.includes(pattern));
}

describe("Style memory footprint", () => {
  const instances: { cleanup: () => void }[] = [];

  afterEach(() => {
    instances.forEach((i) => i.cleanup());
    instances.length = 0;
  });

  describe("Node layers", () => {
    it("layer attribute texture exists and tracks nodes", () => {
      const instance = createSigma({
        nodes: {
          variables: { myColor: { type: "color", default: "#ff0000" } },
          shapes: ["circle"],
          layers: [{ type: "fill", color: { attribute: "myColor" } }],
        },
      });
      instances.push(instance);

      // Add nodes and refresh
      for (let i = 0; i < 10; i++) {
        instance.graph.addNode(`n${i}`, { x: i, y: i, size: 10 });
      }
      instance.sigma.refresh();

      const texture = findTexture(instance.sigma, "layerAttributes");
      expect(texture).toBeDefined();
      expect(texture!.itemCount).toBe(10);
    });

    it("constant fill layer still creates texture (for uniform indexing)", () => {
      const instance = createSigma({
        nodes: {
          shapes: ["circle"],
          layers: [{ type: "fill", color: "#ff0000" }], // Constant
        },
      });
      instances.push(instance);

      for (let i = 0; i < 10; i++) {
        instance.graph.addNode(`n${i}`, { x: i, y: i, size: 10 });
      }
      instance.sigma.refresh();

      // Texture exists (always created for consistent node indexing)
      const texture = findTexture(instance.sigma, "layerAttributes");
      expect(texture).toBeDefined();
      // Items are allocated for indexing purposes
      expect(texture!.itemCount).toBe(10);
    });
  });

  describe("Edge paths and layers", () => {
    it("straight path creates path attribute texture", () => {
      const instance = createSigma({
        edges: {
          paths: [{ type: "straight" }],
          layers: ["plain"],
        },
      });
      instances.push(instance);

      // Add nodes and edges
      for (let i = 0; i < 5; i++) {
        instance.graph.addNode(`n${i}`, { x: i * 10, y: i * 10, size: 5 });
      }
      for (let i = 0; i < 4; i++) {
        instance.graph.addEdge(`n${i}`, `n${i + 1}`);
      }
      instance.sigma.refresh();

      const texture = findTexture(instance.sigma, "pathAttributes");
      expect(texture).toBeDefined();
    });

    it("curved path tracks edge count in attribute texture", () => {
      const instance = createSigma({
        edges: {
          paths: [{ type: "curved" }],
          layers: ["plain"],
        },
      });
      instances.push(instance);

      // Add nodes and edges
      for (let i = 0; i < 10; i++) {
        instance.graph.addNode(`n${i}`, { x: i * 10, y: i * 10, size: 5 });
      }
      for (let i = 0; i < 9; i++) {
        instance.graph.addEdge(`n${i}`, `n${i + 1}`);
      }
      instance.sigma.refresh();

      const texture = findTexture(instance.sigma, "pathAttributes");
      expect(texture).toBeDefined();
      expect(texture!.itemCount).toBe(9);
    });
  });

  describe("Memory scales with item count", () => {
    it("node layer texture item count grows with nodes", () => {
      const instance = createSigma({
        nodes: {
          variables: { myColor: { type: "color", default: "#ff0000" } },
          shapes: ["circle"],
          layers: [{ type: "fill", color: { attribute: "myColor" } }],
        },
      });
      instances.push(instance);

      // Add 10 nodes
      for (let i = 0; i < 10; i++) {
        instance.graph.addNode(`n${i}`, { x: i, y: i, size: 10 });
      }
      instance.sigma.refresh();

      const texture10 = findTexture(instance.sigma, "layerAttributes");
      expect(texture10!.itemCount).toBe(10);

      // Add 90 more nodes (total 100)
      for (let i = 10; i < 100; i++) {
        instance.graph.addNode(`n${i}`, { x: i, y: i, size: 10 });
      }
      instance.sigma.refresh();

      const texture100 = findTexture(instance.sigma, "layerAttributes");
      expect(texture100!.itemCount).toBe(100);
    });

    it("edge path texture item count grows with edges", () => {
      const instance = createSigma({
        edges: {
          paths: [{ type: "curved" }],
          layers: ["plain"],
        },
      });
      instances.push(instance);

      // Add nodes
      for (let i = 0; i < 50; i++) {
        instance.graph.addNode(`n${i}`, { x: i, y: i, size: 5 });
      }

      // Add 10 edges
      for (let i = 0; i < 10; i++) {
        instance.graph.addEdge(`n${i}`, `n${i + 1}`);
      }
      instance.sigma.refresh();

      const texture10 = findTexture(instance.sigma, "pathAttributes");
      expect(texture10!.itemCount).toBe(10);

      // Add 40 more edges
      for (let i = 10; i < 49; i++) {
        instance.graph.addEdge(`n${i}`, `n${i + 1}`);
      }
      instance.sigma.refresh();

      const texture49 = findTexture(instance.sigma, "pathAttributes");
      expect(texture49!.itemCount).toBe(49);
    });
  });

  describe("Memory stats accuracy", () => {
    it("reports correct texture dimensions and byte counts", () => {
      const instance = createSigma({
        nodes: {
          variables: { myColor: { type: "color", default: "#ff0000" } },
          shapes: ["circle"],
          layers: [{ type: "fill", color: { attribute: "myColor" } }],
        },
      });
      instances.push(instance);

      for (let i = 0; i < 10; i++) {
        instance.graph.addNode(`n${i}`, { x: i, y: i, size: 10 });
      }
      instance.sigma.refresh();

      const texture = findTexture(instance.sigma, "layerAttributes");
      expect(texture).toBeDefined();

      // Verify stats structure
      expect(texture!.width).toBeGreaterThan(0);
      expect(texture!.height).toBeGreaterThan(0);
      expect(texture!.bytesPerTexel).toBe(16); // RGBA32F = 4 floats * 4 bytes
      expect(texture!.totalBytes).toBe(texture!.width * texture!.height * 16);
      expect(texture!.capacity).toBeGreaterThanOrEqual(texture!.itemCount);
    });
  });
});
