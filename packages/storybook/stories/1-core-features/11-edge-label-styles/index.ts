/**
 * This example demonstrates edge label styles using the v4 primitives + styles API.
 * It shows a grid of edges with different path types, where label options
 * (position, font size mode, text border) are controlled via UI.
 *
 * The primitives API generates a single multi-path program with all path types.
 * Use the controls to change label position, font size mode, and extremities.
 */
import Graph from "graphology";
import Sigma from "sigma";
import { EdgeLabelPosition, EdgeLabelFontSizeMode } from "sigma/types";
import { EdgePrimitives, NodePrimitives } from "sigma/primitives";

export default () => {
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
  const createGraph = () => {
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

    return graph;
  };

  // Get current settings from controls
  const getSettings = () => ({
    labelPosition: (document.getElementById("label-position") as HTMLSelectElement).value as EdgeLabelPosition,
    fontSizeMode: (document.getElementById("font-size-mode") as HTMLSelectElement).value as EdgeLabelFontSizeMode,
    showBorder: (document.getElementById("show-border") as HTMLInputElement).checked,
    headType: (document.getElementById("head-type") as HTMLSelectElement).value,
    tailType: (document.getElementById("tail-type") as HTMLSelectElement).value,
  });

  // Create primitives from current settings
  const createPrimitives = (): { nodes: NodePrimitives; edges: EdgePrimitives } => {
    const settings = getSettings();

    return {
      nodes: {
        shapes: ["diamond", "triangle"],
        layers: ["fill"],
      },
      edges: {
        paths: ["straight", "curved", "step", "stepCurved"],
        extremities: ["arrow"],
        layers: ["plain"],
        defaultHead: settings.headType,
        defaultTail: settings.tailType,
        label: {
          position: settings.labelPosition,
          fontSizeMode: settings.fontSizeMode,
          color: settings.showBorder ? "#000" : "#333",
          ...(settings.showBorder ? { textBorder: { width: 8, color: "#ffffff" } } : {}),
        },
      },
    };
  };

  // Create Sigma instance
  let graph = createGraph();
  let renderer = new Sigma(graph, container, {
    primitives: createPrimitives(),
    styles: {
      nodes: {
        size: { attribute: "size" },
        color: { attribute: "color" },
        shape: { attribute: "shape" },
      },
      edges: {
        size: { attribute: "size" },
        color: { attribute: "color" },
        label: { attribute: "label" },
        path: { attribute: "path" },
      },
    },
    settings: {
      renderEdgeLabels: true,
      itemSizesReference: "positions",
      autoRescale: true,
    },
  });

  // Recreate renderer when settings change
  const recreateRenderer = () => {
    const camera = renderer.getCamera().getState();
    renderer.kill();
    graph = createGraph();
    renderer = new Sigma(graph, container, {
      primitives: createPrimitives(),
      styles: {
        nodes: {
          size: { attribute: "size" },
          color: { attribute: "color" },
          shape: { attribute: "shape" },
        },
        edges: {
          size: { attribute: "size" },
          color: { attribute: "color" },
          label: { attribute: "label" },
          path: { attribute: "path" },
        },
      },
      settings: {
        renderEdgeLabels: true,
        itemSizesReference: "positions",
        autoRescale: true,
      },
    });
    renderer.getCamera().setState(camera);
  };

  // Bind controls
  document.getElementById("label-position")?.addEventListener("change", recreateRenderer);
  document.getElementById("font-size-mode")?.addEventListener("change", recreateRenderer);
  document.getElementById("show-border")?.addEventListener("change", recreateRenderer);
  document.getElementById("head-type")?.addEventListener("change", recreateRenderer);
  document.getElementById("tail-type")?.addEventListener("change", recreateRenderer);

  return () => {
    renderer.kill();
  };
};
