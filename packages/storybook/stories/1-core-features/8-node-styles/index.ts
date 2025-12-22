/**
 * This example demonstrates the v4 primitives and styles API.
 * It shows a 5x4 grid of nodes where:
 * - Each column uses a different shape (circle, square, triangle, diamond)
 * - Each row uses different layer configurations, all rendered by ONE program
 * - Layers auto-disable based on node attributes (borderSize=0, slices=0, no image)
 * - Styles define hover effects (size increase + highlight color)
 *
 * This demonstrates:
 * 1. Multi-shape programs: One program renders 4 different shapes
 * 2. Dynamic layer enable/disable: Layers return transparent when not needed
 * 3. Single program architecture: 20 visual styles with 1 WebGL program
 * 4. Styles API: Declarative hover/highlight effects
 *
 * Use the checkbox to toggle whether nodes rotate with the camera.
 */
import "@sigma/node-border";
import { layerImage } from "@sigma/node-image";
import "@sigma/node-piechart";
import Graph from "graphology";
import Sigma from "sigma";
import { DEFAULT_STYLES } from "sigma/types";

export default () => {
  const container = document.getElementById("sigma-container") as HTMLElement;

  const graph = new Graph();

  // Grid configuration
  const SPACING = 50;
  const NODE_SIZE = 15;

  // Colors for each row
  const ROW_COLORS = ["#5B8FF9", "#5AD8A6", "#F6BD16", "#E8684A", "#9270CA"];

  // Shape names for node types
  const SHAPES = ["circle", "square", "triangle", "diamond"] as const;

  // Row names for labels
  const ROW_LABELS = ["fill", "border", "image", "pictogram-border", "piechart"] as const;

  const COLS = SHAPES.length;
  const ROWS = ROW_LABELS.length;

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

  // Create nodes in a grid with attributes that control layer visibility
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const nodeId = `${SHAPES[col]}-${ROW_LABELS[row]}`;
      const rowType = ROW_LABELS[row];

      // Base attributes for all nodes
      const nodeAttrs: Record<string, unknown> = {
        x: col * SPACING,
        y: -row * SPACING,
        size: NODE_SIZE,
        backgroundColor: ROW_COLORS[row],
        label: `${SHAPES[col]} / ${rowType}`,
        // Shape selection for multi-shape program
        shape: SHAPES[col],
        // Default: all optional layers disabled
        borderColor: "transparent",
        innerColor: "transparent",
        // Piechart slices:
        slice1: 0,
        slice2: 0,
        slice3: 0,
      };

      // Configure layers based on row type
      switch (rowType) {
        case "fill":
          // Nothing extra - just fill
          break;
        case "border":
          // Enable border with attribute-based size
          nodeAttrs.borderSize = 0.1; // 10% of shape size
          nodeAttrs.borderColor = "#333333";
          nodeAttrs.innerSize = 20;
          nodeAttrs.innerColor = "white";
          break;
        case "image":
          // Image with colored border frame
          nodeAttrs.image = IMAGES[col];
          break;
        case "pictogram-border":
          // Pictogram with color and border
          nodeAttrs.pictogram = PICTOGRAMS[col];
          nodeAttrs.borderSize = 0.2;
          nodeAttrs.borderColor = ROW_COLORS[row];
          nodeAttrs.backgroundColor = "white";
          break;
        case "piechart":
          // Enable piechart slices
          nodeAttrs.slice1 = 1 + col;
          nodeAttrs.slice2 = 2 + col;
          nodeAttrs.slice3 = 3 - col * 0.5;
          break;
      }

      graph.addNode(nodeId, nodeAttrs);
    }
  }

  // Create Sigma with primitives and styles
  const renderer = new Sigma(graph, container, {
    primitives: {
      nodes: {
        // Declare custom variables that layers will read from node attributes
        variables: {
          backgroundColor: { type: "color", default: "#fc0" },
          borderSize: { type: "number", default: 0 },
          borderColor: { type: "color", default: "transparent" },
          innerSize: { type: "number", default: 0 },
          innerColor: { type: "color", default: "transparent" },
          slice1: { type: "number", default: 0 },
          slice2: { type: "number", default: 0 },
          slice3: { type: "number", default: 0 },
          image: { type: "string", default: "" },
          pictogram: { type: "string", default: "" },
        },
        // Multi-shape: supports all 4 shapes in one program
        shapes: ["circle", "square", "triangle", "diamond"],
        layers: [
          // Base fill layer (always visible)
          { type: "fill", color: { attribute: "backgroundColor" } },

          // Image layer for photo images (row 3)
          // Disabled when no 'image' attribute
          {
            type: "image",
            name: "photo",
            drawingMode: "image",
            imageAttribute: "image",
          },

          // Image layer for pictograms (row 4)
          // Disabled when no 'pictogram' attribute
          layerImage({
            name: "pictogram",
            drawingMode: "color",
            imageAttribute: "pictogram",
            colorAttribute: "borderColor",
            padding: 0.4,
            textureManagerOptions: {
              size: { mode: "force", value: 512 },
            },
          }),

          // Border layer - disabled when borderSize=0
          {
            type: "border",
            borders: [
              { size: { attribute: "borderSize", default: 0 }, color: { attribute: "borderColor" } },
              { size: 0, color: "transparent", fill: true },
              { size: { attribute: "innerSize", default: 0 }, color: { attribute: "innerColor" }, mode: "pixels" },
            ],
          },

          // Piechart layer - disabled when all slices=0
          {
            type: "piechart",
            slices: [
              { color: "#E74C3C", value: { attribute: "slice1" } },
              { color: "#3498DB", value: { attribute: "slice2" } },
              { color: "#2ECC71", value: { attribute: "slice3" } },
            ],
          },
        ],
        rotateWithCamera: false,
      },
    },
    styles: {
      nodes: [
        DEFAULT_STYLES.nodes,
        // Base styles from graph attributes
        {
          shape: { attribute: "shape" },
          size: { attribute: "size", defaultValue: 10 },
          color: { attribute: "backgroundColor", defaultValue: "#fc0" },
        },
        // Hover effect: increase size
        {
          when: "isHovered",
          then: {
            size: (attrs) => ((attrs.size as number) || 10) * 1.3,
          },
        },
      ],
    },
    settings: {
      // Use positions-based sizing for a clean grid appearance
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
