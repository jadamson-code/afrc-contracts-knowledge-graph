/**
 * Regression test: swapping the camera via `setCamera` must schedule a
 * render, so the viewport reflects the new camera state on the next frame
 * without waiting for an external trigger (user interaction, graph mutation,
 * etc.).
 */
import Graph from "graphology";
import Sigma, { Camera } from "sigma";
import { createElement } from "sigma/utils";
import { describe, expect, test } from "vitest";

describe("Sigma #setCamera", () => {
  test("it should schedule a render when the camera is swapped", async () => {
    const graph = new Graph();
    graph.addNode("a", { x: 0, y: 0, size: 10 });
    graph.addNode("b", { x: 1, y: 1, size: 10 });
    graph.addEdge("a", "b");
    const container = createElement("div", { width: "100px", height: "100px" });
    document.body.append(container);

    const sigma = new Sigma(graph, container);

    // Let the initial render flush.
    await new Promise((r) => requestAnimationFrame(r));

    let renderCount = 0;
    sigma.on("beforeRender", () => renderCount++);

    // Swap to a camera whose state differs from the current one: the viewport
    // should re-render to reflect this within the next frame.
    const newCamera = new Camera();
    newCamera.setState({ x: 0.1, y: 0.9, ratio: 2, angle: 0 });
    sigma.setCamera(newCamera);

    await new Promise((r) => requestAnimationFrame(r));

    expect(renderCount).toBeGreaterThan(0);

    sigma.kill();
    container.remove();
  });
});
