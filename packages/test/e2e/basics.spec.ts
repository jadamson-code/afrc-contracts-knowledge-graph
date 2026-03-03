import { expect, test } from "@playwright/test";
import { EdgeDisplayData, NodeDisplayData } from "sigma/types";

import { BrowserTestDependencies } from "../helpers";

/* global dependencies */
declare global {
  const dependencies: BrowserTestDependencies;
}

const suite = [
  {
    name: "single-node",
    run: () => {
      const { Graph, Sigma, container } = dependencies;

      const graph = new Graph();
      graph.addNode("test", { x: 0, y: 0, size: 10, color: "#1E90FF" });

      new Sigma(graph, container);
    },
  },
  {
    name: "square",
    run: () => {
      const { Graph, Sigma, container } = dependencies;

      const graph = new Graph();
      graph.addNode("upper-left", { x: 0, y: 0, size: 10, label: "upper left" });
      graph.addNode("upper-right", { x: 10, y: 0, size: 10, label: "upper right" });
      graph.addNode("lower-left", { x: 0, y: 10, size: 10, label: "lower left" });
      graph.addNode("lower-right", { x: 10, y: 10, size: 10, label: "lower right" });

      graph.addEdge("upper-left", "upper-right", { type: "arrow", size: 5, label: "right" });
      graph.addEdge("upper-right", "lower-right", { type: "arrow", size: 5, label: "down" });
      graph.addEdge("lower-right", "lower-left", { type: "arrow", size: 5, label: "left" });
      graph.addEdge("lower-left", "upper-left", { type: "arrow", size: 5, label: "up" });

      graph.addEdge("upper-left", "lower-right", { color: "#f00" });
      graph.addEdge("upper-right", "lower-left", { color: "#f00" });

      new Sigma(graph, container, { settings: { renderEdgeLabels: true, labelRenderedSizeThreshold: -Infinity } });
    },
  },
  {
    name: "aspect-ratio-vertical-graph-horizontal-container",
    run: () => {
      const { Graph, Sigma, container } = dependencies;

      const graph = new Graph();
      graph.addNode("upper-left", { x: 0, y: 0, size: 10 });
      graph.addNode("upper-right", { x: 5, y: 0, size: 10 });
      graph.addNode("lower-left", { x: 0, y: 10, size: 10 });
      graph.addNode("lower-right", { x: 5, y: 10, size: 10 });

      graph.addEdge("upper-left", "lower-right", { size: 5, color: "#F00" });
      graph.addEdge("upper-right", "lower-left", { size: 5, color: "#F00" });

      new Sigma(graph, container);
    },
    dimensions: { width: 800, height: 400 },
  },
  {
    name: "aspect-ratio-horizontal-graph-horizontal-container",
    run: () => {
      const { Graph, Sigma, container } = dependencies;

      const graph = new Graph();
      graph.addNode("upper-left", { x: 0, y: 0, size: 10 });
      graph.addNode("upper-right", { x: 10, y: 0, size: 10 });
      graph.addNode("lower-left", { x: 0, y: 5, size: 10 });
      graph.addNode("lower-right", { x: 10, y: 5, size: 10 });

      graph.addEdge("upper-left", "lower-right", { size: 5, color: "#F00" });
      graph.addEdge("upper-right", "lower-left", { size: 5, color: "#F00" });

      new Sigma(graph, container);
    },
    dimensions: { width: 800, height: 400 },
  },
  {
    name: "aspect-ratio-horizontal-graph-vertical-container",
    run: () => {
      const { Graph, Sigma, container } = dependencies;

      const graph = new Graph();
      graph.addNode("upper-left", { x: 0, y: 0, size: 10 });
      graph.addNode("upper-right", { x: 10, y: 0, size: 10 });
      graph.addNode("lower-left", { x: 0, y: 5, size: 10 });
      graph.addNode("lower-right", { x: 10, y: 5, size: 10 });

      graph.addEdge("upper-left", "lower-right", { size: 5, color: "#F00" });
      graph.addEdge("upper-right", "lower-left", { size: 5, color: "#F00" });

      new Sigma(graph, container);
    },
    dimensions: { width: 400, height: 800 },
  },
  {
    name: "aspect-ratio-vertical-graph-vertical-container",
    run: () => {
      const { Graph, Sigma, container } = dependencies;

      const graph = new Graph();
      graph.addNode("upper-left", { x: 0, y: 0, size: 10 });
      graph.addNode("upper-right", { x: 5, y: 0, size: 10 });
      graph.addNode("lower-left", { x: 0, y: 10, size: 10 });
      graph.addNode("lower-right", { x: 5, y: 10, size: 10 });

      graph.addEdge("upper-left", "lower-right", { size: 5, color: "#F00" });
      graph.addEdge("upper-right", "lower-left", { size: 5, color: "#F00" });

      new Sigma(graph, container);
    },
    dimensions: { width: 400, height: 800 },
  },
  {
    name: "settings",
    run: () => {
      const { Graph, Sigma, container } = dependencies;

      const graph = new Graph();

      graph.addNode("John", { x: 6, y: 4, size: 10 });
      graph.addNode("Mary", { x: 4, y: 2, size: 10 });
      graph.addNode("Sue", { x: 4, y: 6, size: 10 });

      graph.addEdge("John", "Mary", { size: 5 });
      graph.addEdge("Mary", "Sue", { size: 5 });
      graph.addEdge("Sue", "John", { size: 5 });

      new Sigma(graph, container, { styles: { nodes: { color: "#7FFFD4" }, edges: { color: "#AA4A44" } } });
    },
  },
  {
    name: "les-miserables",
    run: () => {
      const {
        data: { lesMiserables },
        Sigma,
        container,
      } = dependencies;

      new Sigma(lesMiserables, container);
    },
  },
  {
    name: "arctic",
    run: () => {
      const {
        data: { arctic },
        Sigma,
        container,
      } = dependencies;

      new Sigma(arctic, container);
    },
  },
  {
    name: "camera-state-unzoom-pan",
    run: () => {
      const {
        data: { lesMiserables },
        Sigma,
        container,
      } = dependencies;

      const renderer = new Sigma(lesMiserables, container);
      renderer.getCamera().setState({ ratio: 3, x: 0.8, y: 0.7 });
    },
  },
  {
    name: "camera-state-zoom-pan",
    run: () => {
      const {
        data: { lesMiserables },
        Sigma,
        container,
      } = dependencies;

      const renderer = new Sigma(lesMiserables, container);
      renderer.getCamera().setState({ ratio: 1 / 3, x: 0.8, y: 0.7 });
    },
  },
  {
    name: "custom-zoomToSizeRatioFunction",
    run: () => {
      const {
        data: { lesMiserables },
        Sigma,
        container,
      } = dependencies;

      const renderer = new Sigma(lesMiserables, container, {
        settings: { zoomToSizeRatioFunction: (x: number) => x },
      });
      renderer.getCamera().setState({ ratio: 3, x: 0.8, y: 0.7 });
    },
  },
  {
    name: "camera-state-rotation",
    run: () => {
      const {
        data: { arctic },
        Sigma,
        container,
      } = dependencies;

      const renderer = new Sigma(arctic, container);
      renderer.getCamera().setState({ angle: 30 });
    },
  },
  {
    name: "reducers",
    run: () => {
      const {
        data: { lesMiserables },
        Sigma,
        container,
      } = dependencies;

      const nodeReducer = (_key: string, attr: Partial<NodeDisplayData>) => {
        const data = attr as NodeDisplayData;
        return Object.assign({}, data, { color: (data.label || "").charCodeAt(0) % 2 === 0 ? "#1E90FF" : "#FF0000" });
      };

      const edgeReducer = (key: string, attr: Partial<EdgeDisplayData>) => {
        const data = attr as EdgeDisplayData;
        return Object.assign({}, data, { color: +key % 2 === 0 ? "#FFFF00" : "#008000" });
      };

      new Sigma(lesMiserables, container, { nodeReducer, edgeReducer });
    },
  },
  // {
  //   name: "les-miserables-mouse-wheel",
  //   waitFor: 2000,
  //   scenario: async (page: Page): Promise<void> => {

  //       const {
  //         data: { lesMiserables },
  //         Sigma,
  //         container,
  //       } = dependencies;

  //       new Sigma(lesMiserables, container);

  //       const element = document.getElementsByClassName("sigma-mouse")[0];
  //       const cEvent: Event & { clientX?: number; clientY?: number; deltaY?: number } = new Event("wheel");
  //       cEvent.clientX = 0;
  //       cEvent.clientY = 0;
  //       cEvent.deltaY = -100;
  //       element.dispatchEvent(cEvent);
  //     });
  //   },
  // },
  // TODO: Re-enable once hovered nodes rendering layer is fixed
  // {
  //   name: "node-edge-state",
  //   waitFor: 2000,
  //   run: () => {
  //     const { Graph, Sigma, container } = dependencies;
  //
  //     const graph = new Graph({ type: "directed" });
  //
  //     graph.addNode("Alice", {
  //       label: "Alice",
  //       x: -2,
  //       y: 1,
  //       color: "#FF0",
  //       size: 10,
  //     });
  //
  //     graph.addNode("Bob", {
  //       label: "Bob",
  //       x: 1,
  //       y: 2,
  //       color: "#00F",
  //       size: 5,
  //     });
  //
  //     graph.addNode("Charles", {
  //       label: "Charles",
  //       x: 2,
  //       y: -1,
  //       color: "#00F",
  //       size: 5,
  //     });
  //
  //     graph.addNode("Deborah", {
  //       label: "Deborah",
  //       x: -1,
  //       y: -2,
  //       color: "#00F",
  //       size: 5,
  //     });
  //
  //     graph.addEdge("Alice", "Bob", {
  //       label: "likes to play with",
  //       size: 1,
  //     });
  //
  //     graph.addEdge("Bob", "Charles", {
  //       label: "likes to be with",
  //       color: "#fc0",
  //       size: 2,
  //     });
  //
  //     graph.addEdge("Charles", "Deborah", {
  //       label: "likes to talk with",
  //       color: "#CCC",
  //       size: 3,
  //     });
  //
  //     graph.addEdge("Deborah", "Alice", {
  //       label: "likes to talk with",
  //       color: "#000",
  //       size: 20,
  //     });
  //
  //     new Sigma(graph, container, {
  //       defaultEdgeType: "arrow",
  //       defaultEdgeColor: "#888",
  //       renderEdgeLabels: true,
  //     });
  //
  //     graph.setNodeAttribute("Alice", "highlighted", true);
  //     graph.setNodeAttribute("Bob", "size", 50);
  //     graph.setNodeAttribute("Bob", "color", "#FF0000");
  //     graph.setNodeAttribute("Deborah", "hidden", true);
  //     graph.setEdgeAttribute("Alice", "Bob", "hidden", true);
  //   },
  // },
  {
    name: "force-labels",
    run: () => {
      const { Graph, Sigma, container } = dependencies;

      const graph = new Graph();
      graph.addNode("upper-left", { x: 0, y: 0, size: 5, label: "upper left", forceLabel: true });
      graph.addNode("upper-right", { x: 10, y: 0, size: 5, label: "upper right", forceLabel: true });
      graph.addNode("lower-left", { x: 0, y: 10, size: 5, label: "lower left" });
      graph.addNode("lower-right", { x: 10, y: 10, size: 15, label: "lower right" });

      graph.addEdge("upper-left", "upper-right", { type: "arrow", size: 5, label: "right" });
      graph.addEdge("upper-right", "lower-right", { type: "arrow", size: 5, label: "down" });
      graph.addEdge("lower-right", "lower-left", { type: "arrow", size: 5, label: "left", forceLabel: true });
      graph.addEdge("lower-left", "upper-left", { type: "arrow", size: 5, label: "up", forceLabel: true });

      new Sigma(graph, container, { settings: { renderEdgeLabels: true, labelRenderedSizeThreshold: 10 } });
    },
  },
  {
    name: "kill",
    run: () => {
      const { Graph, Sigma, container } = dependencies;

      const graph = new Graph();
      graph.addNode("test", { x: 0, y: 0, size: 10, color: "#1E90FF" });

      const sigma = new Sigma(graph, container);
      sigma.kill();
    },
  },
];

suite.forEach((scenario) => {
  test(`Screenshots for "${scenario.name}" should be the same`, async ({ page }) => {
    await page.goto("http://localhost:5173/");
    await page.evaluate(scenario.run);
    await expect(page).toHaveScreenshot(`${scenario.name}.png`, {
      maxDiffPixelRatio: 0,
    });
  });
});
