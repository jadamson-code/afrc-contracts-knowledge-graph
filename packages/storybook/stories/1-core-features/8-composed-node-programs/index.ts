/**
 * This example demonstrates the composed node program system.
 * It shows a 5x4 grid of nodes where:
 * - Each column uses a different shape (circle, square, triangle, diamond)
 * - Each row uses different layers:
 *   - Row 1: Simple fill (layerFill)
 *   - Row 2: Border with external relative (%) mode and internal pixel mode
 *   - Row 3: Image (using createNodeImageProgram)
 *   - Row 4: Image with blackish 10px border outside
 *   - Row 5: Piechart with three slices
 */
import { layerBorder } from "@sigma/node-border";
import { layerImage } from "@sigma/node-image";
import { layerPiechart } from "@sigma/node-piechart";
import Graph from "graphology";
import Sigma from "sigma";
import {
  NodeProgramType,
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
  const ROWS = 5; // fill, border, image, image+border, piechart
  const SPACING = 50;
  const NODE_SIZE = 15;

  // Colors for each row
  const ROW_COLORS = ["#5B8FF9", "#5AD8A6", "#F6BD16", "#E8684A", "#9270CA"];

  // Shape names for node types
  const SHAPES = ["circle", "square", "triangle", "diamond"];

  // Row names for labels
  const ROW_LABELS = ["fill", "border", "image", "image-border", "piechart"];

  // Sample images for each column
  const IMAGES = [
    "https://upload.wikimedia.org/wikipedia/commons/7/7f/Jim_Morrison_1969.JPG",
    "https://upload.wikimedia.org/wikipedia/commons/a/a8/Johnny_Hallyday_%E2%80%94_Milan%2C_1973.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/6/6c/Jimi-Hendrix-1967-Helsinki-d.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/c/c5/Bob-Dylan-arrived-at-Arlanda-surrounded-by-twenty-bodyguards-and-assistants-391770740297_%28cropped%29.jpg",
  ];
  const PICTOGRAMS = [
    "https://icons.getbootstrap.com/assets/icons/chat.svg",
    "https://icons.getbootstrap.com/assets/icons/building.svg",
    "https://icons.getbootstrap.com/assets/icons/person.svg",
    "https://icons.getbootstrap.com/assets/icons/database.svg",
  ];

  // Create nodes in a grid
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const nodeId = `${SHAPES[col]}-${ROW_LABELS[row]}`;
      graph.addNode(nodeId, {
        x: col * SPACING,
        y: -row * SPACING,
        size: NODE_SIZE,
        color: ROW_COLORS[row],
        label: `${SHAPES[col]} / ${ROW_LABELS[row]}`,
        type: nodeId,
        // Border-specific attributes (for row 2 and 4)
        borderColor: "#333333",
        borderSize: 5, // 5 pixels for the inner border
        // Image-specific attributes (for rows 3 and 4)
        image: IMAGES[col],
        pictogram: PICTOGRAMS[col],
        // Piechart-specific attributes (for row 5)
        slice1: 1 + col,
        slice2: 2 + col,
        slice3: 3 - col * 0.5,
      });
    }
  }

  // Create node programs for each combination
  const nodeProgramClasses: Record<string, NodeProgramType> = {};

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

  // Helper to get layers for each row type (for composed programs)
  const getLayers = (rowType: string) => {
    switch (rowType) {
      case "image":
        return [
          layerFill(),
          layerImage({
            drawingMode: "image",
            imageAttribute: "image",
          }),
        ];
      case "image-border":
        return [
          layerFill({ value: "#ffffff" }),
          layerImage({
            drawingMode: "color",
            imageAttribute: "pictogram",
            colorAttribute: "color",
            padding: 0.4,
            textureManagerOptions: {
              size: {
                mode: "force",
                value: 512,
              },
            },
          }),
          layerBorder({
            borders: [
              { size: { value: 0.2 }, color: { attribute: "color" } },
              { size: { fill: true }, color: { value: "#ffffff00" } },
            ],
          }),
        ];
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
      case "piechart":
        return [
          layerPiechart({
            slices: [
              { color: { value: "#E74C3C" }, value: { attribute: "slice1" } },
              { color: { value: "#3498DB" }, value: { attribute: "slice2" } },
              { color: { value: "#2ECC71" }, value: { attribute: "slice3" } },
            ],
          }),
        ];
      default:
        return [layerFill()];
    }
  };

  // Create all program combinations
  for (const shape of SHAPES) {
    for (const rowType of ROW_LABELS) {
      const nodeType = `${shape}-${rowType}`;

      // Use composed node program for fill and border rows
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

  renderer.getCamera().setState({ angle: 0.1 });

  return () => {
    renderer.kill();
  };
};
