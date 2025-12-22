/**
 * This example demonstrates label styles using the v4 primitives + styles API.
 * It shows a grid of nodes with different shapes, where labels are positioned
 * according to the selected position (right, left, above, below, over).
 *
 * The primitives API generates a single multi-shape program, and label options
 * (position, angle, margin) are configured declaratively.
 *
 * Use the Storybook controls to change label position, angle, margin, and node rotation.
 */
import Graph from "graphology";
import Sigma from "sigma";
import { DEFAULT_STYLES, LabelPosition } from "sigma/types";

export interface StoryArgs {
  labelPosition: LabelPosition;
  labelAngle: number;
  labelMargin: number;
  rotateWithCamera: boolean;
}

export default (args: StoryArgs) => {
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

  // Create Sigma instance with primitives configured from args
  const renderer = new Sigma(graph, container, {
    primitives: {
      nodes: {
        shapes: ["circle", "square", "triangle", "diamond"],
        layers: [{ type: "fill" }],
        rotateWithCamera: args.rotateWithCamera,
        label: {
          position: args.labelPosition,
          angle: (args.labelAngle * Math.PI) / 180,
          margin: args.labelMargin,
        },
      },
    },
    styles: {
      nodes: [
        DEFAULT_STYLES.nodes,
        {
          shape: { attribute: "shape" },
        },
      ],
    },
    settings: {
      itemSizesReference: "positions",
      zoomToSizeRatioFunction: (x: number) => x,
      autoRescale: true,
    },
  });

  // Set a slight camera rotation to demonstrate the feature
  renderer.getCamera().setState({ angle: 0.1 });

  return () => {
    renderer.kill();
  };
};
