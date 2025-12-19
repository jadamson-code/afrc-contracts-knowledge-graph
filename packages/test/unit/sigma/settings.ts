import Graph from "graphology";
import Sigma from "sigma";
import { createElement } from "sigma/utils";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

interface SigmaTestContext {
  sigma: Sigma;
}

beforeEach<SigmaTestContext>(async (context) => {
  const graph = new Graph();
  graph.addNode("a", { x: 0, y: 0 });
  graph.addNode("b", { x: 10, y: 10 });
  graph.addEdge("a", "b");
  const container = createElement("div", { width: "100px", height: "100px" });
  document.body.append(container);
  context.sigma = new Sigma(graph, container);
});

afterEach<SigmaTestContext>(async ({ sigma }) => {
  sigma.kill();
  sigma.getContainer().remove();
});

describe("Sigma settings management", () => {
  test<SigmaTestContext>("it should refresh when settings are updated", async ({ sigma }) => {
    let count = 0;
    sigma.on("beforeRender", () => count++);

    expect(count).toEqual(0);
    sigma.setSetting("minEdgeThickness", 10);
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(count).toEqual(1);
  });
});
