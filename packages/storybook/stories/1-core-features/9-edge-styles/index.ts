/**
 * This example demonstrates edge styles using the composable edge program system.
 * It shows a 6x6 grid where:
 * - Each row uses a different path type (straight, curved, taxi, cubic)
 * - Each column uses a different extremity/filling configuration:
 *   - Column 1: No extremity (simple line)
 *   - Column 2: Arrow head at target
 *   - Column 3: Arrow heads at both ends (double arrow)
 *   - Column 4: Arrow head with 5px margin from node
 *   - Column 5: Dashed filling (transparent gaps, centered)
 *   - Column 6: Dashed filling with faded gaps, start-aligned, arrow head
 *
 * Each edge displays its label.
 */
import Graph from "graphology";
import Sigma from "sigma";
import {
  createEdgeProgram,
  createNodeProgram,
  extremityArrow,
  extremityNone,
  fillingDashed,
  fillingPlain,
  layerFill,
  pathCubic,
  pathQuadratic,
  pathStraight,
  pathTaxi,
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
    { name: "line", path: pathStraight() },
    { name: "curve", path: pathQuadratic() },
    {
      name: "taxi",
      path: pathTaxi({
        orientation: "automatic",
        rotateWithCamera: false,
      }),
    },
    {
      name: "taxi-2",
      path: pathTaxi({
        orientation: "horizontal",
        rotateWithCamera: true,
      }),
    },
    {
      name: "cubic",
      path: pathCubic({
        orientation: "automatic",
        rotateWithCamera: false,
      }),
    },
    {
      name: "cubic-2",
      path: pathCubic({
        orientation: "horizontal",
        rotateWithCamera: true,
        curveOffset: 0.8,
      }),
    },
  ];

  // Column types (extremity and filling configurations)
  const COLS = [
    {
      name: "no-extremity",
      label: "No extremity",
      head: extremityNone(),
      tail: extremityNone(),
      filling: fillingPlain(),
    },
    {
      name: "arrow-head",
      label: "Arrow head",
      head: extremityArrow(),
      tail: extremityNone(),
      filling: fillingPlain(),
    },
    {
      name: "double-arrow",
      label: "Both arrows",
      head: extremityArrow(),
      tail: extremityArrow(),
      filling: fillingPlain(),
    },
    {
      name: "arrow-margin",
      label: "5px margin",
      head: extremityArrow({ margin: 5 }),
      tail: extremityNone(),
      filling: fillingPlain(),
    },
    {
      name: "dashed",
      label: "Dashed",
      head: extremityNone(),
      tail: extremityNone(),
      filling: fillingDashed({
        dashSize: { thicknessRelative: 1 },
        gapSize: { thicknessRelative: 1 },
        gap: "#ffcbd1",
      }),
    },
    {
      name: "dashed-arrow",
      label: "Dashed faded",
      head: extremityArrow(),
      tail: extremityNone(),
      filling: fillingDashed({
        dashSize: { thicknessRelative: 3 },
        gapSize: { thicknessRelative: 1.5 },
        solidExtremities: true,
        solidMargin: { head: 10 },
        gap: 0.3,
        align: 1,
      }),
    },
  ];

  // Colors
  const EDGE_COLOR = "#666666";
  const NODE_COLOR = "#5B8FF9";

  // Create edge programs for each combination
  const edgeProgramClasses: Record<string, ReturnType<typeof createEdgeProgram>> = {};

  for (const row of ROWS) {
    for (const col of COLS) {
      const edgeType = `${row.name}-${col.name}`;
      edgeProgramClasses[edgeType] = createEdgeProgram({
        path: row.path,
        head: col.head,
        tail: col.tail,
        filling: col.filling,
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
      const edgeLabel = `${row.name} / ${col.label}`;
      graph.addEdge(sourceId, targetId, {
        type: edgeType,
        size: EDGE_SIZE,
        color: EDGE_COLOR,
        label: edgeLabel,
        forceLabel: true,
        // Curvature for curved edges
        curvature: row.name === "curve" ? 0.3 : 0,
      });
    }
  }

  const renderer = new Sigma(graph, container, {
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

  renderer.getCamera().setState({ angle: 0.2 });

  return () => {
    renderer.kill();
  };
};
