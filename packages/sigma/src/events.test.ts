import { userEvent } from "@vitest/browser/context";
import Graph from "graphology";
import { SerializedGraph } from "graphology-types";
import Sigma from "sigma";
import { Coordinates, SigmaEventType } from "sigma/types";
import { createElement } from "sigma/utils";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { add, simulateTouchEvent, wait } from "./_test-helpers";

interface SigmaTestContext {
  sigma: Sigma;
  graph: Graph;
  target: HTMLElement;
  container: HTMLDivElement;
}

const STAGE_WIDTH = 300;
const STAGE_HEIGHT = 600;

const GRAPH: Pick<SerializedGraph, "nodes" | "edges"> = {
  nodes: [
    { key: "n1", attributes: { x: 0, y: 0, size: 10, color: "blue" } },
    { key: "n2", attributes: { x: 50, y: 50, size: 10, color: "red" } },
  ],
  edges: [{ source: "n1", target: "n2" }],
};

beforeEach<SigmaTestContext>(async (context) => {
  const graph = new Graph();
  graph.import(GRAPH);
  const container = createElement("div", { width: `${STAGE_WIDTH}px`, height: `${STAGE_HEIGHT}px` }) as HTMLDivElement;
  document.body.append(container);

  context.sigma = new Sigma(graph, container, {
    settings: {
      zoomDuration: 30,
      inertiaDuration: 30,
      doubleClickZoomingDuration: 30,
      doubleClickTimeout: 5000,
    },
  });
  context.graph = graph;
  context.container = container;
  context.target = context.sigma.getMouseLayer();
});

afterEach<SigmaTestContext>(async ({ sigma }) => {
  sigma.kill();
  sigma.getContainer().remove();
});

describe("Sigma interaction events", () => {
  test<SigmaTestContext>('it should trigger the events "downNode", "upNode", "clickNode", "downNode", "upNode" and finally "doubleClickNode" when double clicking a node with the mouse', async ({
    sigma,
    graph,
    container,
  }) => {
    const triggeredEvents: SigmaEventType[] = [];
    const observedEvents: SigmaEventType[] = ["clickNode", "downNode", "upNode", "doubleClickNode"];
    observedEvents.forEach((type: SigmaEventType) => {
      sigma.addListener(type, () => {
        triggeredEvents.push(type);
      });
    });

    const position = sigma.graphToViewport(graph.getNodeAttributes("n1") as Coordinates);
    await userEvent.dblClick(container, { position });
    await wait(10);

    expect(triggeredEvents).toEqual(["downNode", "upNode", "clickNode", "downNode", "upNode", "doubleClickNode"]);
  });

  test<SigmaTestContext>('it should trigger the events "downNode", "upNode", "clickNode", "downNode", "upNode" and finally "doubleClickNode" when double clicking a node with a touch gesture', async ({
    sigma,
    graph,
    target,
  }) => {
    const triggeredEvents: SigmaEventType[] = [];
    const observedEvents: SigmaEventType[] = ["clickNode", "downNode", "upNode", "doubleClickNode"];
    observedEvents.forEach((type: SigmaEventType) => {
      sigma.addListener(type, () => {
        triggeredEvents.push(type);
      });
    });

    const touch = { ...sigma.graphToViewport(graph.getNodeAttributes("n1") as Coordinates), id: 1 };
    await simulateTouchEvent(target, "touchstart", [touch]);
    await simulateTouchEvent(target, "touchend", []);
    await simulateTouchEvent(target, "touchstart", [touch]);
    await simulateTouchEvent(target, "touchend", []);

    expect(triggeredEvents).toEqual(["downNode", "upNode", "clickNode", "downNode", "upNode", "doubleClickNode"]);
  });

  test<SigmaTestContext>("hovering a node should hover it and cancel other nodes hovering", async ({
    sigma,
    graph,
    container,
  }) => {
    const hoveredNodes = new Set<string>();
    sigma.on("enterNode", ({ node }) => {
      hoveredNodes.add(node);
    });
    sigma.on("leaveNode", ({ node }) => {
      hoveredNodes.delete(node);
    });

    await userEvent.hover(container, {
      position: sigma.graphToViewport(graph.getNodeAttributes("n1") as Coordinates),
      timeout: 5000,
    });

    expect.soft(Array.from(hoveredNodes)).toEqual(["n1"]);

    await userEvent.hover(container, {
      position: sigma.graphToViewport(graph.getNodeAttributes("n2") as Coordinates),
      timeout: 5000,
    });

    expect.soft(Array.from(hoveredNodes)).toEqual(["n2"]);
  });

  test<SigmaTestContext>("touching a node should hover it and cancel other nodes hovering", async ({
    sigma,
    graph,
    target,
  }) => {
    const hoveredNodes = new Set<string>();
    sigma.on("enterNode", ({ node }) => {
      hoveredNodes.add(node);
    });
    sigma.on("leaveNode", ({ node }) => {
      hoveredNodes.delete(node);
    });

    const touch1 = { ...sigma.graphToViewport(graph.getNodeAttributes("n1") as Coordinates), id: 1 };
    await simulateTouchEvent(target, "touchstart", [touch1]);
    await simulateTouchEvent(target, "touchmove", [touch1]);
    await simulateTouchEvent(target, "touchend", []);

    expect.soft(Array.from(hoveredNodes)).toEqual(["n1"]);

    const touch2 = { ...sigma.graphToViewport(graph.getNodeAttributes("n2") as Coordinates), id: 1 };
    await simulateTouchEvent(target, "touchstart", [touch2]);
    await simulateTouchEvent(target, "touchmove", [touch2]);
    await simulateTouchEvent(target, "touchend", []);

    expect.soft(Array.from(hoveredNodes)).toEqual(["n2"]);
  });

  test<SigmaTestContext>("touching the stage then releasing it should trigger a clickStage", async ({
    sigma,
    target,
  }) => {
    let eventsCount = 0;
    sigma.on("clickStage", () => {
      eventsCount++;
    });

    const touch = { id: 1, x: STAGE_WIDTH / 2, y: STAGE_HEIGHT / 2 };
    await simulateTouchEvent(target, "touchstart", [touch]);
    await wait(100);
    await simulateTouchEvent(target, "touchend", []);

    expect(eventsCount).toEqual(1);
  });

  test<SigmaTestContext>("touching the stage, moving the touch a bit, then releasing it should trigger a clickStage", async ({
    sigma,
    target,
  }) => {
    let eventsCount = 0;
    sigma.on("clickStage", () => {
      eventsCount++;
    });

    const touch = { id: 1, x: STAGE_WIDTH / 2, y: STAGE_HEIGHT / 2 };
    await simulateTouchEvent(target, "touchstart", [touch]);
    await simulateTouchEvent(target, "touchmove", [add(touch, { x: 2, y: 2 })]);
    await simulateTouchEvent(target, "touchmove", [add(touch, { x: 2, y: -2 })]);
    await simulateTouchEvent(target, "touchend", []);

    expect(eventsCount).toEqual(1);
  });

  test<SigmaTestContext>('touching the stage, moving the touch "enough", then releasing it should not trigger a clickStage', async ({
    sigma,
    target,
  }) => {
    let eventsCount = 0;
    sigma.on("clickStage", () => {
      eventsCount++;
    });

    const touch = { id: 1, x: STAGE_WIDTH / 3, y: STAGE_HEIGHT / 3 };
    await simulateTouchEvent(target, "touchstart", [touch]);
    await simulateTouchEvent(target, "touchmove", [add(touch, touch)]);
    await simulateTouchEvent(target, "touchend", []);

    expect(eventsCount).toEqual(0);
  });
});

// -----------------------------------------------------------------------------
// Label events
// -----------------------------------------------------------------------------
//
// These cover the `labelEvents: "separate"` path for both nodes and edges:
// clicking a label ribbon/rect must fire `clickLabel` with the correct
// `parentType`. Node and edge labels share LABEL_ID_OFFSET in the picking
// buffer; disjointness comes from their distinct index ranges.

describe("Sigma label events", () => {
  interface LabelEventContext {
    sigma: Sigma;
    container: HTMLDivElement;
    graph: Graph;
  }

  beforeEach<LabelEventContext>(async (context) => {
    const graph = new Graph();
    graph.addNode("n1", { x: 0, y: 0, size: 15, label: "N1", color: "blue" });
    graph.addNode("n2", { x: 100, y: 0, size: 15, label: "N2", color: "red" });
    graph.addEdge("n1", "n2", { label: "MID", size: 6 });

    const container = createElement("div", {
      width: `${STAGE_WIDTH}px`,
      height: `${STAGE_HEIGHT}px`,
    }) as HTMLDivElement;
    document.body.append(container);

    context.sigma = new Sigma(graph, container, {
      settings: {
        renderLabels: true,
        renderEdgeLabels: true,
        labelEvents: "separate",
      },
      nodeReducer: (_key, data) => ({
        ...data,
        labelVisibility: "visible",
        labelBackgroundColor: "#eee",
      }),
      edgeReducer: (_key, data) => ({
        ...data,
        labelVisibility: "visible",
        labelBackgroundColor: "#eee",
      }),
    });
    context.graph = graph;
    context.container = container;
    // Let the first frame paint so the picking framebuffer is populated.
    await wait(50);
  });

  afterEach<LabelEventContext>(async ({ sigma }) => {
    sigma.kill();
    sigma.getContainer().remove();
  });

  test<LabelEventContext>("clicking a node label fires clickLabel with parentType 'node'", async ({
    sigma,
    graph,
    container,
  }) => {
    const labelEvents: { parentType: string; parentKey: string }[] = [];
    sigma.on("clickLabel", ({ parentType, parentKey }) => {
      labelEvents.push({ parentType, parentKey });
    });

    // Node labels sit to the right of the node by default. The rendered label
    // size depends on pixel ratio, so scan a few offsets past the node edge.
    const nodePos = sigma.graphToViewport(graph.getNodeAttributes("n1") as Coordinates);
    for (const dx of [30, 40, 50, 60]) {
      await userEvent.click(container, { position: { x: nodePos.x + dx, y: nodePos.y } });
      await wait(10);
      if (labelEvents.length) break;
    }

    expect(labelEvents).toEqual([{ parentType: "node", parentKey: "n1" }]);
  });

  test<LabelEventContext>("clicking an edge label fires clickLabel with parentType 'edge'", async ({
    sigma,
    graph,
    container,
  }) => {
    const labelEvents: { parentType: string; parentKey: string }[] = [];
    sigma.on("clickLabel", ({ parentType, parentKey }) => {
      labelEvents.push({ parentType, parentKey });
    });

    const n1 = graph.getNodeAttributes("n1") as Coordinates;
    const n2 = graph.getNodeAttributes("n2") as Coordinates;
    const midViewport = sigma.graphToViewport({ x: (n1.x + n2.x) / 2, y: (n1.y + n2.y) / 2 });
    // Scan ±8 px around the midpoint to tolerate ribbon-width / pixel-rounding.
    for (const dy of [0, -4, 4, -8, 8]) {
      for (const dx of [0, -4, 4, -8, 8]) {
        await userEvent.click(container, { position: { x: midViewport.x + dx, y: midViewport.y + dy } });
        await wait(10);
        if (labelEvents.length) break;
      }
      if (labelEvents.length) break;
    }

    expect(labelEvents).toEqual([{ parentType: "edge", parentKey: graph.edges()[0] }]);
  });
});
