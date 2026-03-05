import Graph from "graphology";
import Sigma from "sigma";
import { createElement } from "sigma/utils";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

interface SigmaTestContext {
  sigma: Sigma;
  graph: Graph;
}

beforeEach<SigmaTestContext>(async (context) => {
  context.graph = new Graph();
  const container = createElement("div", { width: "100px", height: "100px" });
  document.body.append(container);
  context.sigma = new Sigma(context.graph, container);
});

afterEach<SigmaTestContext>(async ({ sigma }) => {
  sigma.kill();
  sigma.getContainer().remove();
});

describe("Memory Stats API", () => {
  describe("getMemoryStats()", () => {
    test<SigmaTestContext>("returns stats object with expected structure", ({ sigma }) => {
      const stats = sigma.getMemoryStats();

      expect(stats).toHaveProperty("textures");
      expect(stats).toHaveProperty("buffers");
      expect(stats).toHaveProperty("buckets");
      expect(stats).toHaveProperty("picking");
      expect(stats).toHaveProperty("summary");

      expect(Array.isArray(stats.textures)).toBe(true);
      expect(Array.isArray(stats.buffers)).toBe(true);
      expect(Array.isArray(stats.buckets)).toBe(true);
    });

    test<SigmaTestContext>("returns nodeData texture stats", ({ sigma, graph }) => {
      graph.addNode("n1", { x: 0, y: 0, size: 10 });
      sigma.refresh();

      const stats = sigma.getMemoryStats();
      const nodeDataTexture = stats.textures.find((t) => t.name === "nodeData");

      expect(nodeDataTexture).toBeDefined();
      expect(nodeDataTexture!.itemCount).toBe(1);
      expect(nodeDataTexture!.bytesPerTexel).toBe(16);
      expect(nodeDataTexture!.totalBytes).toBeGreaterThan(0);
    });

    test<SigmaTestContext>("returns edgeData texture stats", ({ sigma, graph }) => {
      graph.addNode("n1", { x: 0, y: 0, size: 10 });
      graph.addNode("n2", { x: 1, y: 1, size: 10 });
      graph.addEdge("n1", "n2");
      sigma.refresh();

      const stats = sigma.getMemoryStats();
      const edgeDataTexture = stats.textures.find((t) => t.name === "edgeData");

      expect(edgeDataTexture).toBeDefined();
      expect(edgeDataTexture!.itemCount).toBe(1);
    });

    test<SigmaTestContext>("returns buffer stats for node programs", ({ sigma, graph }) => {
      graph.addNode("n1", { x: 0, y: 0, size: 10 });
      sigma.refresh();

      const stats = sigma.getMemoryStats();
      const nodeBuffer = stats.buffers.find((b) => b.program === "nodes");

      expect(nodeBuffer).toBeDefined();
      expect(nodeBuffer!.capacity).toBeGreaterThan(0);
      expect(nodeBuffer!.totalBytes).toBeGreaterThan(0);
    });

    test<SigmaTestContext>("returns bucket stats for non-empty buckets", ({ sigma, graph }) => {
      graph.addNode("n1", { x: 0, y: 0, size: 10 });
      sigma.refresh();

      const stats = sigma.getMemoryStats();
      const nodeBucket = stats.buckets.find((b) => b.type === "nodes");

      expect(nodeBucket).toBeDefined();
      expect(nodeBucket!.itemCount).toBe(1);
    });

    test<SigmaTestContext>("returns picking stats based on canvas size", ({ sigma }) => {
      const stats = sigma.getMemoryStats();

      expect(stats.picking.width).toBeGreaterThan(0);
      expect(stats.picking.height).toBeGreaterThan(0);
      expect(stats.picking.textureBytes).toBeGreaterThan(0);
      expect(stats.picking.depthBufferBytes).toBeGreaterThan(0);
    });

    test<SigmaTestContext>("computes correct summary totals", ({ sigma, graph }) => {
      graph.addNode("n1", { x: 0, y: 0, size: 10 });
      sigma.refresh();

      const stats = sigma.getMemoryStats();

      const texturesTotal = stats.textures.reduce((sum, t) => sum + t.totalBytes, 0);
      const buffersTotal = stats.buffers.reduce((sum, b) => sum + b.totalBytes, 0);
      const bucketsTotal = stats.buckets.reduce((sum, b) => sum + b.totalBytes, 0);
      const pickingTotal = stats.picking.textureBytes + stats.picking.depthBufferBytes;

      expect(stats.summary.texturesBytes).toBe(texturesTotal);
      expect(stats.summary.buffersBytes).toBe(buffersTotal);
      expect(stats.summary.bucketsBytes).toBe(bucketsTotal);
      expect(stats.summary.pickingBytes).toBe(pickingTotal);
      expect(stats.summary.totalBytes).toBe(texturesTotal + buffersTotal + bucketsTotal + pickingTotal);
    });
  });

  describe("getWriteStats() / resetWriteStats()", () => {
    test<SigmaTestContext>("returns zero stats initially after reset", ({ sigma }) => {
      sigma.resetWriteStats();
      const stats = sigma.getWriteStats();

      expect(stats.summary.totalBytesWritten).toBe(0);
      expect(stats.summary.textureWrites).toBe(0);
      expect(stats.summary.bufferWrites).toBe(0);
    });

    test<SigmaTestContext>("tracks texture writes after data changes", ({ sigma, graph }) => {
      sigma.resetWriteStats();

      graph.addNode("n1", { x: 0, y: 0, size: 10 });
      sigma.refresh();

      const stats = sigma.getWriteStats();
      expect(stats.summary.textureWrites).toBeGreaterThan(0);
      expect(stats.summary.totalBytesWritten).toBeGreaterThan(0);
    });

    test<SigmaTestContext>("tracks buffer writes after render", ({ sigma, graph }) => {
      graph.addNode("n1", { x: 0, y: 0, size: 10 });
      sigma.refresh();
      sigma.resetWriteStats();

      // Trigger a re-render
      sigma.refresh({ skipIndexation: true });

      const stats = sigma.getWriteStats();
      expect(stats.summary.bufferWrites).toBeGreaterThan(0);
    });

    test<SigmaTestContext>("resets counters when resetWriteStats() called", ({ sigma, graph }) => {
      graph.addNode("n1", { x: 0, y: 0, size: 10 });
      sigma.refresh();

      const beforeReset = sigma.getWriteStats();
      expect(beforeReset.summary.totalBytesWritten).toBeGreaterThan(0);

      sigma.resetWriteStats();

      const afterReset = sigma.getWriteStats();
      expect(afterReset.summary.totalBytesWritten).toBe(0);
    });
  });
});
