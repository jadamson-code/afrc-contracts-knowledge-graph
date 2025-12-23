/**
 * This example demonstrates the backdrop styles API.
 * Backdrops are shapes rendered behind nodes and their labels, typically used
 * for hover/highlight effects.
 *
 * Grid layout:
 * - Rows: Different backdrop behaviors (default hover, custom colors, always-visible, disabled)
 * - Columns: Different shapes, label positions, and node sizes
 */
import Graph from "graphology";
import Sigma from "sigma";
import { DEFAULT_STYLES } from "sigma/types";

export default () => {
  const container = document.getElementById("sigma-container") as HTMLElement;

  const graph = new Graph();

  const COL_SPACING = 120;
  const ROW_SPACING = 80;

  // Column configurations: shape, labelPosition, nodeSize
  const columns = [
    { shape: "circle", labelPosition: "right", nodeSize: 10 },
    { shape: "square", labelPosition: "above", nodeSize: 14 },
    { shape: "diamond", labelPosition: "below", nodeSize: 18 },
    { shape: "triangle", labelPosition: "over", nodeSize: 14 },
  ] as const;

  // Row configurations: backdrop behavior with distinct styling
  const rows = [
    {
      id: "default",
      color: "#5B8FF9",
      backdropLabel: "default hover",
    },
    {
      id: "custom",
      color: "#E8684A",
      backdropLabel: "custom colors",
      backdropColor: "#FFE4E1",
      backdropShadowColor: "rgba(232, 104, 74, 0.6)",
      backdropShadowBlur: 16,
      backdropPadding: 8,
    },
    {
      id: "always",
      color: "#9270CA",
      backdropLabel: "always visible",
      important: true,
    },
    {
      id: "none",
      color: "#708090",
      backdropLabel: "no backdrop",
      noBackdrop: true,
    },
  ];

  // Create grid of nodes
  rows.forEach((row, rowIndex) => {
    columns.forEach((col, colIndex) => {
      const nodeId = `${row.id}-${col.shape}`;
      const label = `${col.shape} / ${col.labelPosition} / ${row.backdropLabel}`;

      graph.addNode(nodeId, {
        x: colIndex * COL_SPACING,
        y: -rowIndex * ROW_SPACING,
        size: col.nodeSize,
        color: row.color,
        label,
        shape: col.shape,
        labelPosition: col.labelPosition,
        // Row-specific backdrop attributes
        ...("backdropColor" in row && { backdropColor: row.backdropColor }),
        ...("backdropShadowColor" in row && { backdropShadowColor: row.backdropShadowColor }),
        ...("backdropShadowBlur" in row && { backdropShadowBlur: row.backdropShadowBlur }),
        ...("backdropPadding" in row && { backdropPadding: row.backdropPadding }),
        ...("important" in row && { important: row.important }),
        ...("noBackdrop" in row && { noBackdrop: row.noBackdrop }),
      });
    });
  });

  const renderer = new Sigma(graph, container, {
    primitives: {
      nodes: {
        shapes: ["circle", "square", "diamond", "triangle"],
        layers: [{ type: "fill", color: { attribute: "color" } }],
        backdrop: {
          color: { attribute: "backdropColor" },
          shadowColor: { attribute: "backdropShadowColor" },
          shadowBlur: { attribute: "backdropShadowBlur" },
          padding: { attribute: "backdropPadding" },
        },
      },
    },
    styles: {
      nodes: [
        DEFAULT_STYLES.nodes,
        {
          size: { attribute: "size", defaultValue: 10 },
          color: { attribute: "color", defaultValue: "#999" },
          shape: { attribute: "shape", defaultValue: "circle" },
          labelPosition: { attribute: "labelPosition", defaultValue: "right" },
        },
        // Custom backdrop from node attributes (row 2: custom colors)
        {
          when: "isHovered",
          then: {
            backdropColor: (attrs) => (attrs.backdropColor as string) || "#ffffff",
            backdropShadowColor: (attrs) => (attrs.backdropShadowColor as string) || "rgba(0, 0, 0, 0.5)",
            backdropShadowBlur: (attrs) => (attrs.backdropShadowBlur as number) || 12,
            backdropPadding: (attrs) => (attrs.backdropPadding as number) || 6,
          },
        },
        // Always-visible backdrops (row 3: important nodes)
        {
          when: (attrs) => attrs.important === true,
          then: {
            backdropColor: "#ffffff",
            backdropShadowColor: "rgba(0, 0, 0, 0.6)",
            backdropShadowBlur: 14,
            backdropPadding: 6,
            zIndex: 1,
          },
        },
        // Disable backdrop entirely (row 4: no backdrop)
        {
          when: (attrs) => attrs.noBackdrop === true,
          then: {
            backdropColor: "transparent",
            backdropShadowColor: "transparent",
            backdropShadowBlur: 0,
            backdropPadding: 0,
          },
        },
      ],
    },
    settings: {
      itemSizesReference: "positions",
      zoomToSizeRatioFunction: (x: number) => x,
      autoRescale: true,
    },
  });

  return () => {
    renderer.kill();
  };
};
