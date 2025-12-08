/**
 * This example demonstrates edge label styles using the composable edge program system.
 * All labels use "auto" position mode by default, which places labels above or below
 * the edge based on edge direction (left-to-right = above, right-to-left = below).
 *
 * The last two columns show what "over" mode would look like (labels centered on path).
 * Per-program position mode is set via the `label: { position: "over" }` option.
 */
import Graph from "graphology";
import Sigma from "sigma";
import {
  createEdgeProgram,
  createNodeProgram,
  extremityArrow,
  extremityNone,
  fillingPlain,
  layerFill,
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

  // Row types (path types)
  const ROWS = [
    { name: "line", path: pathLine() },
    { name: "curved", path: pathCurved() },
    {
      name: "step",
      path: pathStep({
        orientation: "automatic",
        rotateWithCamera: false,
      }),
    },
    {
      name: "step-2",
      path: pathStep({
        orientation: "horizontal",
        rotateWithCamera: true,
      }),
    },
    {
      name: "stepCurved",
      path: pathStepCurved({
        orientation: "automatic",
        rotateWithCamera: false,
      }),
    },
    {
      name: "stepCurved-2",
      path: pathStepCurved({
        orientation: "horizontal",
        rotateWithCamera: true,
      }),
    },
    {
      name: "curvedS",
      path: pathCurvedS({
        orientation: "automatic",
        rotateWithCamera: false,
      }),
    },
    {
      name: "curvedS-2",
      path: pathCurvedS({
        orientation: "horizontal",
        rotateWithCamera: true,
        curveOffset: 0.8,
      }),
    },
  ];

  // Column types (extremity and filling configurations)
  // The first three columns use the default "auto" label position from settings.
  // The last two columns override with "over" position via the `label` option.
  const COLS = [
    {
      name: "above",
      displayLabel: "Above",
      head: extremityNone(),
      tail: extremityNone(),
      filling: fillingPlain(),
      labelPosition: "above" as const, // Used to set label.position in the program
    },
    {
      name: "below",
      displayLabel: "Below",
      head: extremityNone(),
      tail: extremityNone(),
      filling: fillingPlain(),
      labelPosition: "below" as const, // Used to set label.position in the program
    },
    {
      name: "arrow-head",
      displayLabel: "Auto + arrow",
      head: extremityArrow(),
      tail: extremityNone(),
      filling: fillingPlain(),
    },
    {
      name: "double-arrow",
      displayLabel: "Auto + both arrows",
      head: extremityArrow(),
      tail: extremityArrow(),
      filling: fillingPlain(),
    },
    {
      name: "over-arrow",
      displayLabel: "Over + arrow",
      head: extremityArrow(),
      tail: extremityNone(),
      filling: fillingPlain(),
      labelPosition: "over" as const,
      textBorder: { width: 5, color: "#ffffff" },
    },
    {
      name: "over-double",
      displayLabel: "Over + both",
      head: extremityArrow(),
      tail: extremityArrow(),
      filling: fillingPlain(),
      labelPosition: "over" as const,
      textBorder: { width: 5, color: "#ffffff" },
    },
  ];

  // Colors
  const EDGE_COLOR = "#999999";
  const NODE_COLOR = "#5B8FF9";

  // Create edge programs for each combination
  const edgeProgramClasses: Record<string, ReturnType<typeof createEdgeProgram>> = {};

  for (const row of ROWS) {
    for (const col of COLS) {
      const edgeType = `${row.name}-${col.name}`;

      // Build label options conditionally
      const colWithOptions = col as {
        labelPosition?: "over" | "above" | "below";
        textBorder?: { width: number; color: { color: string } };
      };
      const labelOptions =
        colWithOptions.labelPosition || colWithOptions.textBorder
          ? {
              ...(colWithOptions.labelPosition ? { position: colWithOptions.labelPosition } : {}),
              ...(colWithOptions.textBorder ? { textBorder: colWithOptions.textBorder } : {}),
            }
          : undefined;

      edgeProgramClasses[edgeType] = createEdgeProgram({
        path: row.path,
        head: col.head,
        tail: col.tail,
        filling: col.filling,
        label: labelOptions,
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
      });
    }
  }

  const renderer = new Sigma(graph, container, {
    edgeLabelColor: { color: "#000" },
    edgeLabelPosition: "auto",
    edgeProgramClasses,
    nodeProgramClasses: {
      diamond: createNodeProgram({
        shape: sdfDiamond(),
        layers: [layerFill()],
        rotateWithCamera: false,
      }),
      triangle: createNodeProgram({
        shape: sdfTriangle(),
        layers: [layerFill()],
        rotateWithCamera: false,
      }),
    },
    defaultEdgeType: "line-no-extremity",
    // Enable edge labels
    renderEdgeLabels: true,
    edgeLabelSize: 12,
    // Use positions-based sizing for a clean grid appearance
    itemSizesReference: "positions",
    autoRescale: true,
  });

  return () => {
    renderer.kill();
  };
};
