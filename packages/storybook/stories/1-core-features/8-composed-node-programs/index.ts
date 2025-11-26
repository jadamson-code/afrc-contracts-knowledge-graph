/**
 * This example demonstrates the composed node program system.
 * It shows a 4x3 grid of nodes where:
 * - Each column uses a different shape (circle, square, triangle, diamond)
 * - Each row uses different layers:
 *   - Row 1: Simple fill (layerFill)
 *   - Row 2: Border with external relative (%) mode and internal pixel mode
 *   - Row 3: Image layer (TODO: using fill for now)
 */
import { layerBorder } from "@sigma/node-border";
import Graph from "graphology";
import Sigma from "sigma";
import {
  createComposedNodeProgram,
  layerFill,
  sdfCircle,
  sdfDiamond,
  sdfSquare,
  sdfTriangle,
} from "sigma/rendering";

export default () => {
  const container = document.getElementById("sigma-container") as HTMLElement;

  const graph = new Graph();

  // Grid configuration
  const COLS = 4; // circle, square, triangle, diamond
  const ROWS = 3; // fill, border, image (TODO)
  const SPACING = 50;
  const NODE_SIZE = 15;

  // Colors for each row
  const ROW_COLORS = ["#5B8FF9", "#5AD8A6", "#F6BD16"];

  // Shape names for node types
  const SHAPES = ["circle", "square", "triangle", "diamond"];

  // Row names for labels
  const ROW_LABELS = ["fill", "border", "image"];

  // Create nodes in a grid
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const nodeId = `${SHAPES[col]}-${ROW_LABELS[row]}`;
      graph.addNode(nodeId, {
        x: col * SPACING,
        y: row * SPACING,
        size: NODE_SIZE,
        color: ROW_COLORS[row],
        label: `${SHAPES[col]} / ${ROW_LABELS[row]}`,
        type: nodeId,
        // Border-specific attributes (for row 2)
        borderColor: "#333333",
        borderSize: 5, // 5 pixels for the inner border
      });
    }
  }

  // Create node programs for each combination
  const nodeProgramClasses: Record<string, ReturnType<typeof createComposedNodeProgram>> = {};

  // Helper to get shape SDF
  const getShape = (shapeName: string) => {
    switch (shapeName) {
      case "circle":
        return sdfCircle();
      case "square":
        return sdfSquare();
      case "triangle":
        return sdfTriangle();
      case "diamond":
        return sdfDiamond();
      default:
        return sdfCircle();
    }
  };

  // Helper to get layers for each row type
  const getLayers = (rowType: string) => {
    switch (rowType) {
      case "fill":
        return [layerFill()];
      case "border":
        // External border (10% of shape) + internal border (20px) + fill
        return [
          layerBorder({
            borders: [
              { size: { value: 0.1 }, color: { attribute: "borderColor" } },
              { size: { fill: true }, color: { attribute: "color" } },
              { size: { value: 40, mode: "pixels" }, color: { value: "#ffffff" } },
            ],
          }),
        ];
      case "image":
        // TODO: Use image layer when available
        return [layerFill()];
      default:
        return [layerFill()];
    }
  };

  // Create all program combinations
  for (const shape of SHAPES) {
    for (const rowType of ROW_LABELS) {
      const nodeType = `${shape}-${rowType}`;
      nodeProgramClasses[nodeType] = createComposedNodeProgram({
        shape: getShape(shape),
        layers: getLayers(rowType),
      });
    }
  }

  const renderer = new Sigma(graph, container, {
    nodeProgramClasses,
    defaultNodeType: "circle-fill",
    // Use positions-based sizing for a clean grid appearance
    itemSizesReference: "positions",
    zoomToSizeRatioFunction: (x) => x,
    autoRescale: true,
  });

  return () => {
    renderer.kill();
  };
};
