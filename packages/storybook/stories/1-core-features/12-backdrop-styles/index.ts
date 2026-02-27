/**
 * This example demonstrates the backdrop styles API.
 * Use the Storybook controls to interactively test all backdrop properties:
 * fill, shadow, border, corner radius, label padding, and area coverage.
 */
import Graph from "graphology";
import Sigma from "sigma";
import { DEFAULT_STYLES } from "sigma/types";

export interface StoryArgs {
  backdropDisplay: "always" | "hover" | "hidden";
  backdropColor: string;
  backdropShadowColor: string;
  backdropShadowBlur: number;
  backdropPadding: number;
  backdropBorderColor: string;
  backdropBorderWidth: number;
  backdropCornerRadius: number;
  backdropLabelPadding: number;
  backdropArea: "both" | "node" | "label";
}

export default (args: StoryArgs) => {
  const container = document.getElementById("sigma-container") as HTMLElement;

  const graph = new Graph();

  // A few nodes with various shapes and label positions
  const nodes = [
    { id: "a", x: 0, y: 0, size: 12, shape: "circle", labelPosition: "right", label: "Circle / right" },
    { id: "b", x: 200, y: 0, size: 16, shape: "square", labelPosition: "above", label: "Square / above" },
    { id: "c", x: 400, y: 0, size: 14, shape: "diamond", labelPosition: "below", label: "Diamond / below" },
    { id: "d", x: 600, y: 0, size: 14, shape: "triangle", labelPosition: "over", label: "Triangle / over" },
    { id: "e", x: 100, y: -120, size: 10, shape: "circle", labelPosition: "left", label: "Circle / left" },
    { id: "f", x: 300, y: -120, size: 18, shape: "square", labelPosition: "right", label: "Square / right" },
    { id: "g", x: 500, y: -120, size: 12, shape: "diamond", labelPosition: "above", label: "Diamond / above" },
  ] as const;

  for (const node of nodes) {
    graph.addNode(node.id, node);
  }

  // Build backdrop visibility based on display mode
  const backdropVisibility =
    args.backdropDisplay === "hover"
      ? { when: "isHovered" as const, then: "visible" as const, else: "hidden" as const }
      : args.backdropDisplay === "hidden"
        ? ("hidden" as const)
        : ("visible" as const);

  const renderer = new Sigma(graph, container, {
    primitives: {
      nodes: {
        shapes: ["circle", "square", "diamond", "triangle"],
        layers: [{ type: "fill" }],
      },
    },
    styles: {
      nodes: [
        DEFAULT_STYLES.nodes,
        {
          size: { attribute: "size", defaultValue: 10 },
          shape: { attribute: "shape", defaultValue: "circle" },
          labelPosition: { attribute: "labelPosition", defaultValue: "right" },
        },
        {
          backdropVisibility,
          backdropColor: args.backdropColor,
          backdropShadowColor: args.backdropShadowColor,
          backdropShadowBlur: args.backdropShadowBlur,
          backdropPadding: args.backdropPadding,
          backdropBorderColor: args.backdropBorderColor,
          backdropBorderWidth: args.backdropBorderWidth,
          backdropCornerRadius: args.backdropCornerRadius,
          backdropLabelPadding: args.backdropLabelPadding,
          backdropArea: args.backdropArea,
          zIndex: 1,
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
