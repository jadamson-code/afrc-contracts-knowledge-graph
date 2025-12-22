/**
 * This example demonstrates edge styles using the v4 primitives + styles API,
 * including multi-layer support.
 *
 * It uses:
 * - A single multi-shape node program (supports diamond and triangle shapes)
 * - A single multi-path, multi-layer edge program showcasing composed layers
 *
 * All edges use the same program with plain + dashed layers composited together.
 */
import Graph from "graphology";
import Sigma from "sigma";
import { EdgeLayerSpec } from "sigma/primitives";

export default () => {
  const container = document.getElementById("sigma-container") as HTMLElement;

  const graph = new Graph();

  // Grid configuration
  const COL_SPACING = 120;
  const ROW_SPACING = 80;
  const NODE_SPACING = 60;
  const NODE_SIZE = 12;
  const EDGE_SIZE = 6;

  // Row colors (one per path type)
  const ROW_COLORS = ["#5B8FF9", "#61DDAA", "#F6903D", "#E8684A"];
  const NODE_COLOR = "#5B8FF9";

  // Path names for the demo
  const PATH_NAMES = ["straight", "curved", "stepCurved", "curvedS"] as const;

  // Column configurations: extremity settings
  const COLUMN_CONFIGS = [
    {},
    { head: "arrow" },
    { head: "arrow", tail: "arrow" },
    { dashSize: 5, backgroundColor: "white" },
    { head: "arrow", dashSize: 10, dashColor: "blue" },
  ];

  // Create nodes and edges
  for (let rowIdx = 0; rowIdx < PATH_NAMES.length; rowIdx++) {
    const pathName = PATH_NAMES[rowIdx];
    const rowColor = ROW_COLORS[rowIdx];

    for (let colIdx = 0; colIdx < COLUMN_CONFIGS.length; colIdx++) {
      const colConfig = COLUMN_CONFIGS[colIdx];

      const cellX = colIdx * COL_SPACING;
      const cellY = -rowIdx * ROW_SPACING;

      const sourceId = `${pathName}-${colIdx}-source`;
      graph.addNode(sourceId, {
        x: cellX - NODE_SPACING / 2,
        y: cellY,
        size: NODE_SIZE,
        color: NODE_COLOR,
        shape: "diamond",
      });

      const targetId = `${pathName}-${colIdx}-target`;
      graph.addNode(targetId, {
        x: cellX + NODE_SPACING / 2,
        y: cellY + NODE_SPACING / 2,
        size: NODE_SIZE,
        color: NODE_COLOR,
        shape: "triangle",
      });

      graph.addEdge(sourceId, targetId, {
        size: EDGE_SIZE,
        color: colConfig.backgroundColor || rowColor,
        dashColor: colConfig.dashColor || rowColor,
        dashSize: colConfig.dashSize || 0,
        curvature: pathName === "curved" ? 0.3 : 0,
        path: pathName,
        head: colConfig.head,
        tail: colConfig.tail,
      });
    }
  }

  const renderer = new Sigma(graph, container, {
    primitives: {
      nodes: {
        shapes: ["diamond", "triangle"],
        layers: ["fill"],
      },
      edges: {
        paths: ["straight", "curved", "stepCurved", "curvedS"],
        extremities: ["arrow"],
        layers: [
          "plain",
          // Note: dashed layer options aren't fully typed in the schema yet,
          // so we use a type assertion. The parser handles these at runtime.
          {
            type: "dashed",
            dashColor: { attribute: "dashColor" },
            dashSize: { attribute: "dashSize", default: 0, mode: "pixels" },
            gapColor: 0,
            gapSize: { value: 10, mode: "pixels" },
          } as EdgeLayerSpec,
        ],
      },
    },
    styles: {
      nodes: {
        size: { attribute: "size" },
        color: { attribute: "color" },
        shape: { attribute: "shape" },
      },
      edges: {
        size: { attribute: "size" },
        color: { attribute: "color" },
        path: { attribute: "path" },
        head: { attribute: "head" },
        tail: { attribute: "tail" },
      },
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
