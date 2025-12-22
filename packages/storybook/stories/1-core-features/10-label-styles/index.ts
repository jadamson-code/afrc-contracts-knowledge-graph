/**
 * This example demonstrates label styles using the v4 primitives + styles API.
 * It shows a grid of nodes with different shapes, where labels are positioned
 * according to the selected position (right, left, above, below, over).
 *
 * The primitives API generates a single multi-shape program, and label options
 * (position, angle, margin) are configured declaratively.
 *
 * Use the controls to change label position, angle, margin, and node rotation.
 */
import Graph from "graphology";
import Sigma from "sigma";
import { NodePrimitives } from "sigma/primitives";
import { LabelPosition } from "sigma/types";

export default () => {
  const container = document.getElementById("sigma-container") as HTMLElement;

  // Grid configuration
  const SPACING = 50;
  const NODE_SIZE = 15;
  const COLS = 4;
  const ROWS = 4;

  // Shape names and colors
  const SHAPES = ["circle", "square", "triangle", "diamond"] as const;
  const COLORS = ["#5B8FF9", "#5AD8A6", "#F6BD16", "#E8684A"];

  // Create graph with grid of nodes
  const createGraph = () => {
    const graph = new Graph();

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const shape = SHAPES[col];
        const nodeId = `node-${row}-${col}`;
        graph.addNode(nodeId, {
          x: col * SPACING,
          y: -row * SPACING,
          size: NODE_SIZE,
          color: COLORS[row % COLORS.length],
          label: shape,
          shape,
        });
      }
    }

    return graph;
  };

  // Get current settings from controls
  const getSettings = () => ({
    position: (document.getElementById("label-position") as HTMLSelectElement).value as LabelPosition,
    angle: (parseFloat((document.getElementById("label-angle") as HTMLInputElement).value) * Math.PI) / 180,
    margin: parseFloat((document.getElementById("label-margin") as HTMLInputElement).value),
    rotateWithCamera: (document.getElementById("rotate-with-camera") as HTMLInputElement).checked,
  });

  // Create primitives declaration from current settings
  const createPrimitives = (): { nodes: NodePrimitives } => {
    const settings = getSettings();
    return {
      nodes: {
        shapes: ["circle", "square", "triangle", "diamond"],
        layers: ["fill"],
        rotateWithCamera: settings.rotateWithCamera,
        label: {
          position: settings.position,
          angle: settings.angle,
          margin: settings.margin,
        },
      },
    };
  };

  // Create Sigma instance
  let graph = createGraph();
  let renderer = new Sigma(graph, container, {
    primitives: createPrimitives(),
    styles: {
      nodes: {
        size: { attribute: "size" },
        color: { attribute: "color" },
        shape: { attribute: "shape" },
        label: { attribute: "label" },
      },
    },
    settings: {
      itemSizesReference: "positions",
      zoomToSizeRatioFunction: (x) => x,
      autoRescale: true,
    },
  });

  // Set a slight camera rotation to demonstrate the feature
  renderer.getCamera().setState({ angle: 0.1 });

  // Recreate renderer when settings change
  const recreateRenderer = () => {
    const camera = renderer.getCamera().getState();
    renderer.kill();
    graph = createGraph();
    renderer = new Sigma(graph, container, {
      primitives: createPrimitives(),
      styles: {
        nodes: {
          size: { attribute: "size" },
          color: { attribute: "color" },
          shape: { attribute: "shape" },
          label: { attribute: "label" },
        },
      },
      settings: {
        itemSizesReference: "positions",
        zoomToSizeRatioFunction: (x) => x,
        autoRescale: true,
      },
    });
    renderer.getCamera().setState(camera);
  };

  // Bind controls
  document.getElementById("label-position")?.addEventListener("change", recreateRenderer);
  document.getElementById("label-angle")?.addEventListener("input", recreateRenderer);
  document.getElementById("label-margin")?.addEventListener("input", recreateRenderer);
  document.getElementById("rotate-with-camera")?.addEventListener("change", recreateRenderer);

  return () => {
    renderer.kill();
  };
};
