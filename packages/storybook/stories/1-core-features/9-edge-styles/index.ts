/**
 * This example demonstrates edge styles using the composable edge program system.
 *
 * It uses:
 * - A single multi-shape node program (supports diamond and triangle shapes)
 * - A single multi-path edge program (supports all path types via per-edge selection)
 *
 * This is more efficient than using separate programs for each shape/path type.
 */
import Graph from "graphology";
import Sigma from "sigma";
import {
  createEdgeProgram,
  createNodeProgram,
  extremityArrow,
  layerFill,
  layerPlain,
  pathCurved,
  pathCurvedS,
  pathLine,
  pathStepCurved,
  sdfDiamond,
  sdfTriangle,
} from "sigma/rendering";

export default () => {
  const container = document.getElementById("sigma-container") as HTMLElement;

  const graph = new Graph();

  // Grid configuration
  const COL_SPACING = 120;
  const ROW_SPACING = 80;
  const NODE_SPACING = 60;
  const NODE_SIZE = 12;
  const EDGE_SIZE = 6;

  // Colors
  const EDGE_COLOR = "#999999";
  const NODE_COLOR = "#5B8FF9";

  // Create a single multi-shape node program
  // Nodes select their shape via the 'shape' attribute
  const NodeProgram = createNodeProgram({
    shapes: [sdfDiamond(), sdfTriangle()],
    layers: [layerFill()],
    rotateWithCamera: false,
  });

  // Create a single multi-path edge program that supports all path types
  const EdgeProgram = createEdgeProgram({
    // Multiple paths - each edge can select which one to use via "path" attribute
    paths: [
      pathLine(),
      pathCurved(),
      pathStepCurved({ orientation: "automatic" }),
      pathCurvedS({ orientation: "automatic" }),
    ],
    // Extremity pool - "none" is always implicit, edges select via "head"/"tail" attributes
    extremities: [extremityArrow()],
    // Layers apply to all edges in this program
    layers: [layerPlain()],
  });

  // Path names for the demo (must match the names from path factories)
  const PATH_NAMES = ["line", "curved", "stepCurved", "curvedS"];
  const EXTREMITY_CONFIGS = [
    { head: "none", tail: "none" },
    { head: "arrow", tail: "none" },
    { head: "arrow", tail: "arrow" },
  ];

  // Create nodes and edges
  for (let rowIdx = 0; rowIdx < PATH_NAMES.length; rowIdx++) {
    const pathName = PATH_NAMES[rowIdx];

    for (let colIdx = 0; colIdx < EXTREMITY_CONFIGS.length; colIdx++) {
      const extConfig = EXTREMITY_CONFIGS[colIdx];

      const cellX = colIdx * COL_SPACING;
      const cellY = -rowIdx * ROW_SPACING;

      const sourceId = `${pathName}-${colIdx}-source`;
      graph.addNode(sourceId, {
        x: cellX - NODE_SPACING / 2,
        y: cellY,
        size: NODE_SIZE,
        color: NODE_COLOR,
        shape: "diamond", // Source nodes are diamonds
      });

      const targetId = `${pathName}-${colIdx}-target`;
      graph.addNode(targetId, {
        x: cellX + NODE_SPACING / 2,
        y: cellY + NODE_SPACING / 2,
        size: NODE_SIZE,
        color: NODE_COLOR,
        shape: "triangle", // Target nodes are triangles
      });

      // Edges use per-edge path and extremity selection
      graph.addEdge(sourceId, targetId, {
        size: EDGE_SIZE,
        color: EDGE_COLOR,
        curvature: pathName === "curved" ? 0.3 : 0,
        path: pathName,
        head: extConfig.head,
        tail: extConfig.tail,
      });
    }
  }

  const renderer = new Sigma(graph, container, {
    edgeLabelColor: { color: "#000" },
    edgeProgramClasses: {
      edge: EdgeProgram,
    },
    nodeProgramClasses: {
      node: NodeProgram,
    },
    defaultEdgeType: "edge",
    defaultNodeType: "node",
    renderEdgeLabels: true,
    edgeLabelSize: 12,
    itemSizesReference: "positions",
    autoRescale: true,
  });

  setInterval(() => {
    renderer.getCamera().updateState(({ angle }) => ({ angle: angle + 0.005 }));
  }, 30);

  return () => {
    renderer.kill();
  };
};
