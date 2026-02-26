/**
 * This example demonstrates per-node label positioning using the v4 styles API.
 * It shows a grid of nodes with different shapes, where each row has a different
 * label position (right, left, above, below).
 *
 * The label text shows both the shape and position for clarity.
 * Use the Storybook controls to adjust label angle, margin, and node rotation.
 */
import Graph from "graphology";
import Sigma from "sigma";
import { DEFAULT_STYLES, LabelPosition } from "sigma/types";

export interface StoryArgs {
  labelAngle: number;
  labelMargin: number;
  rotateWithCamera: boolean;
}

// Label positions for each row
const ROW_POSITIONS: LabelPosition[] = ["right", "left", "above", "below", "over"];
const COLORS = ["#9242D5", "#5B8FF9", "#5AD8A6", "#F6BD16", "#E8684A"];
const SHAPES = ["circle", "square", "triangle", "diamond"] as const;

export default (args: StoryArgs) => {
  const container = document.getElementById("sigma-container") as HTMLElement;

  // Grid configuration
  const SPACING = 50;
  const NODE_SIZE = 15;
  const COLS = SHAPES.length;
  const ROWS = ROW_POSITIONS.length;

  // Shape names and colors

  // Create graph with grid of nodes
  const graph = new Graph();

  for (let row = 0; row < ROWS; row++) {
    const position = ROW_POSITIONS[row % ROW_POSITIONS.length];
    for (let col = 0; col < COLS; col++) {
      const shape = SHAPES[col];
      const nodeId = `node-${row}-${col}`;
      graph.addNode(nodeId, {
        x: col * SPACING,
        y: -row * SPACING,
        size: NODE_SIZE,
        color: COLORS[row % COLORS.length],
        label: `${shape} / ${position}`,
        shape,
        labelPosition: position,
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
          labelPosition: { attribute: "labelPosition", defaultValue: "right" },
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
