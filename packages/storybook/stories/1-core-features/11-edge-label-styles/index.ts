/**
 * This example demonstrates edge label styles using the v4 primitives + styles API.
 * It shows a grid of edges with different path types, where label options
 * (position, font size mode, text border) are controlled via Storybook controls.
 *
 * The primitives API generates a single multi-path program with all path types.
 * Use the Storybook controls to change label position, font size mode, and extremities.
 */
import Graph from "graphology";
import Sigma from "sigma";
import { DEFAULT_STYLES, EdgeLabelFontSizeMode, EdgeLabelPosition } from "sigma/types";

export interface StoryArgs {
  labelPosition: EdgeLabelPosition;
  fontSizeMode: EdgeLabelFontSizeMode;
  showBorder: boolean;
  headType: string;
  tailType: string;
}

export default (args: StoryArgs) => {
  const container = document.getElementById("sigma-container") as HTMLElement;

  // Grid configuration
  const COL_SPACING = 100;
  const ROW_SPACING = 80;
  const NODE_SPACING = 50;
  const NODE_SIZE = 10;
  const EDGE_SIZE = 5;

  // Colors
  const EDGE_COLOR = "#999999";
  const NODE_COLORS = ["#5B8FF9", "#5AD8A6", "#F6BD16", "#E8684A"];

  // Path types to display (one per row)
  const PATHS = [
    { name: "straight", label: "Straight" },
    { name: "curved", label: "Curved" },
    { name: "step", label: "Step" },
    { name: "stepCurved", label: "Step Curved" },
  ] as const;

  // Create graph with a grid showing all path types
  const graph = new Graph();
  const COLS = 4;

  for (let row = 0; row < PATHS.length; row++) {
    for (let col = 0; col < COLS; col++) {
      const pathInfo = PATHS[row];
      const cellX = col * COL_SPACING;
      const cellY = -row * ROW_SPACING;

      // Source node (diamond)
      const sourceId = `${pathInfo.name}-${col}-source`;
      graph.addNode(sourceId, {
        x: cellX - NODE_SPACING / 2,
        y: cellY,
        size: NODE_SIZE,
        color: NODE_COLORS[row % NODE_COLORS.length],
        label: "",
        shape: "diamond",
      });

      // Target node (triangle)
      const targetId = `${pathInfo.name}-${col}-target`;
      graph.addNode(targetId, {
        x: cellX + NODE_SPACING / 2,
        y: cellY + NODE_SPACING / 2,
        size: NODE_SIZE,
        color: NODE_COLORS[row % NODE_COLORS.length],
        label: "",
        shape: "triangle",
      });

      // Edge
      graph.addEdge(sourceId, targetId, {
        size: EDGE_SIZE,
        color: EDGE_COLOR,
        label: pathInfo.label,
        forceLabel: true,
        path: pathInfo.name,
        curvature: pathInfo.name === "curved" ? 0.3 : 0,
      });
    }
  }

  // Create Sigma instance with primitives configured from args
  const renderer = new Sigma(graph, container, {
    primitives: {
      nodes: {
        shapes: ["diamond", "triangle"],
        layers: [{ type: "fill" }],
      },
      edges: {
        paths: ["straight", "curved", "step", "stepCurved"],
        extremities: ["arrow"],
        layers: [{ type: "plain" }],
        defaultHead: args.headType === "none" ? undefined : args.headType,
        defaultTail: args.tailType === "none" ? undefined : args.tailType,
        label: {
          position: args.labelPosition,
          fontSizeMode: args.fontSizeMode,
          color: args.showBorder ? "#000" : "#333",
          ...(args.showBorder ? { textBorder: { width: 8, color: "#ffffff" } } : {}),
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
      edges: [
        DEFAULT_STYLES.edges,
        {
          path: { attribute: "path" },
        },
      ],
    },
    settings: {
      renderEdgeLabels: true,
      itemSizesReference: "positions",
      autoRescale: true,
    },
  });

  return () => {
    renderer.kill();
  };
};
