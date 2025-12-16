/**
 * This example demonstrates edge label styles using the composable edge program system.
 * All labels use "auto" position mode by default, which places labels above or below
 * the edge based on edge direction (left-to-right = above, right-to-left = below).
 *
 * The last two columns show what "over" mode would look like (labels centered on path).
 * Per-program position mode is set via the `label: { position: "over" }` option.
 *
 * The final columns demonstrate font size modes:
 * - "fixed": Labels stay constant size regardless of zoom level
 * - "scaled": Labels scale with zoom level using zoomToSizeRatioFunction
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
  pathStep,
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
  const NODE_SPACING = 60; // Horizontal distance between source and target nodes
  const NODE_SIZE = 12;
  const EDGE_SIZE = 6;

  // Colors
  const EDGE_COLOR = "#999999";
  const NODE_COLOR = "#5B8FF9";

  // Row types (path types)
  const ROWS = [
    { name: "Line", path: pathLine() },
    { name: "Curved", path: pathCurved() },
    {
      name: "Steps (auto)",
      path: pathStep({
        orientation: "automatic",
        rotateWithCamera: false,
      }),
    },
    {
      name: "Steps (horizontal)",
      path: pathStep({
        orientation: "horizontal",
        rotateWithCamera: true,
      }),
    },
    {
      name: "Curved steps (auto)",
      path: pathStepCurved({
        orientation: "automatic",
        rotateWithCamera: false,
      }),
    },
    {
      name: "Curved steps (horizontal)",
      path: pathStepCurved({
        orientation: "horizontal",
        rotateWithCamera: true,
      }),
    },
    {
      name: "S-curved (auto)",
      path: pathCurvedS({
        orientation: "automatic",
        rotateWithCamera: false,
      }),
    },
    {
      name: "S-curved (horizontal)",
      path: pathCurvedS({
        orientation: "horizontal",
        rotateWithCamera: true,
        curveOffset: 0.8,
      }),
    },
  ];

  // Column types (extremity and layer configurations)
  // The first three columns use the default "auto" label position from settings.
  // The last two columns override with "over" position via the `label` option.
  const COLS = [
    {
      name: "above",
      displayLabel: "Above",
      head: "none" as const,
      tail: "none" as const,
      labelPosition: "above" as const, // Used to set label.position in the program
    },
    {
      name: "below",
      displayLabel: "Below",
      head: "none" as const,
      tail: "none" as const,
      labelPosition: "below" as const, // Used to set label.position in the program
    },
    {
      name: "arrow-head",
      displayLabel: "Auto + arrow",
      head: "arrow" as const,
      tail: "none" as const,
    },
    {
      name: "double-arrow",
      displayLabel: "Auto + both arrows",
      head: "arrow" as const,
      tail: "arrow" as const,
    },
    {
      name: "over-arrow",
      displayLabel: "Over + arrow",
      head: "arrow" as const,
      tail: "none" as const,
      labelPosition: "over" as const,
      textBorder: { width: 10, color: "#fff" },
      textColor: "#000",
    },
    {
      name: "over-double",
      displayLabel: "Over + both arrows",
      head: "arrow" as const,
      tail: "arrow" as const,
      labelPosition: "over" as const,
      textBorder: { width: 10, color: "#fff" },
      textColor: "#000",
    },
    {
      name: "scaled-above",
      displayLabel: "Scaled size + above",
      head: "none" as const,
      tail: "none" as const,
      labelPosition: "above" as const,
      fontSizeMode: "scaled" as const,
    },
    {
      name: "scaled-over",
      displayLabel: "Scaled size + over",
      head: "arrow" as const,
      tail: "none" as const,
      labelPosition: "over" as const,
      fontSizeMode: "scaled" as const,
      textBorder: { width: 10, color: "#fff" },
      textColor: "#000",
    },
  ];

  // Create edge programs for each combination
  const edgeProgramClasses: Record<string, ReturnType<typeof createEdgeProgram>> = {};

  for (const row of ROWS) {
    for (const col of COLS) {
      const edgeType = `${row.name}-${col.name}`;

      // Build label options conditionally
      const colWithOptions = col as {
        labelPosition?: "over" | "above" | "below";
        textBorder?: { width: number; color: string };
        fontSizeMode?: "fixed" | "scaled";
        textColor?: string;
      };
      const labelOptions =
        colWithOptions.labelPosition || colWithOptions.textBorder || colWithOptions.fontSizeMode
          ? {
              ...(colWithOptions.labelPosition ? { position: colWithOptions.labelPosition } : {}),
              ...(colWithOptions.textBorder ? { textBorder: colWithOptions.textBorder } : {}),
              ...(colWithOptions.fontSizeMode ? { fontSizeMode: colWithOptions.fontSizeMode } : {}),
              ...(colWithOptions.textColor
                ? { color: { color: colWithOptions.textColor } }
                : { color: { color: "#000" } }),
            }
          : undefined;

      // Only include extremityArrow() if head or tail uses it
      const needsArrow = col.head === "arrow" || col.tail === "arrow";

      edgeProgramClasses[edgeType] = createEdgeProgram({
        paths: [row.path],
        extremities: needsArrow ? [extremityArrow()] : [],
        defaultHead: col.head,
        defaultTail: col.tail,
        label: labelOptions,
        layers: [layerPlain()],
      });
    }
  }

  // Create nodes and edges in a grid
  for (let rowIdx = 0; rowIdx < ROWS.length; rowIdx++) {
    const row = ROWS[rowIdx];

    for (let colIdx = 0; colIdx < COLS.length; colIdx++) {
      const col = COLS[colIdx];
      const edgeType = `${row.name}-${col.name}`;

      // Calculate positions for this cell
      const cellX = colIdx * COL_SPACING;
      const cellY = -rowIdx * ROW_SPACING;

      // Source node (left side of cell)
      const sourceId = `${edgeType}-source`;
      graph.addNode(sourceId, {
        x: cellX - NODE_SPACING / 2,
        y: cellY,
        size: NODE_SIZE,
        color: NODE_COLOR,
        label: "",
        type: "diamond",
      });

      // Target node (right side of cell)
      const targetId = `${edgeType}-target`;
      graph.addNode(targetId, {
        x: cellX + NODE_SPACING / 2,
        y: cellY + NODE_SPACING / 2,
        size: NODE_SIZE,
        color: NODE_COLOR,
        label: "",
        type: "triangle",
      });

      // Edge connecting them
      const edgeLabel = `${row.name} / ${col.displayLabel}`;
      graph.addEdge(sourceId, targetId, {
        type: edgeType,
        size: EDGE_SIZE,
        color: EDGE_COLOR,
        label: edgeLabel,
        forceLabel: true,
        // Curvature for curved edges
        curvature: row.name === "curved" ? 0.3 : 0,
        // Select extremities from the shared pool
        head: col.head,
        tail: col.tail,
      });
    }
  }

  const renderer = new Sigma(graph, container, {
    edgeProgramClasses,
    nodeProgramClasses: {
      diamond: createNodeProgram({
        shapes: [sdfDiamond()],
        layers: [layerFill()],
        rotateWithCamera: false,
      }),
      triangle: createNodeProgram({
        shapes: [sdfTriangle()],
        layers: [layerFill()],
        rotateWithCamera: false,
      }),
    },
    defaultEdgeType: "line-no-extremity",
    // Enable edge labels
    renderEdgeLabels: true,
    edgeLabelSize: 16,
    edgeLabelPosition: "auto",
    // Use positions-based sizing for a clean grid appearance
    itemSizesReference: "positions",
    autoRescale: true,
  });

  return () => {
    renderer.kill();
  };
};
