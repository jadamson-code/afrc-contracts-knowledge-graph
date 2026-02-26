/**
 * This example renders the diseasome bipartite network (disease–gene)
 * and showcases per-node label features:
 * - Disease nodes: circles with large bold sans-serif labels rendered over them
 * - Gene nodes: diamonds with small monospace labels at 15° angle, on the right
 * - Zoom-dependent label size scaling via zoomToLabelSizeRatioFunction
 * - Configurable backdrops and margins
 */
import Graph from "graphology";
import { parse } from "graphology-gexf/browser";
import Sigma from "sigma";
import { DEFAULT_STYLES } from "sigma/types";

export interface StoryArgs {
  labelScaling: "fixed" | "sqrt" | "linear";
  showBackdrops: "none" | "all" | "hover";
  backdropPadding: number;
  labelMargin: number;
}

export default (args: StoryArgs) => {
  const container = document.getElementById("sigma-container") as HTMLElement;
  let renderer: Sigma | null = null;

  fetch("./diseasome.gexf")
    .then((res) => res.text())
    .then((gexf) => {
      const graph = parse(Graph, gexf);

      // Map label scaling option to a function
      const zoomToLabelSizeRatioFunction =
        args.labelScaling === "sqrt" ? Math.sqrt : args.labelScaling === "linear" ? (x: number) => x : undefined;

      // Build backdrop styles based on showBackdrops arg
      const backdropStyles =
        args.showBackdrops === "all"
          ? {
              backdropColor: "#ffffff" as const,
              backdropShadowColor: "rgba(0, 0, 0, 0.5)" as const,
              backdropShadowBlur: 12,
              backdropPadding: args.backdropPadding,
            }
          : args.showBackdrops === "hover"
            ? {
                backdropColor: { when: "isHovered" as const, then: "#ffffff", else: "transparent" },
                backdropShadowColor: { when: "isHovered" as const, then: "rgba(0, 0, 0, 0.5)", else: "transparent" },
                backdropShadowBlur: { when: "isHovered" as const, then: 12, else: 0 },
                backdropPadding: { when: "isHovered" as const, then: args.backdropPadding, else: 0 },
              }
            : {};

      const GENE_LABEL_ANGLE = (15 * Math.PI) / 180;

      renderer = new Sigma(graph, container, {
        primitives: {
          nodes: {
            shapes: ["circle", "diamond"],
            layers: [{ type: "fill" }],
            label: {
              margin: args.labelMargin,
              zoomToLabelSizeRatioFunction,
            },
          },
        },
        styles: {
          nodes: [
            DEFAULT_STYLES.nodes,
            {
              // Disease: circles with large bold sans-serif labels over the node
              // Gene: diamonds with small monospace labels on the right at 15°
              shape: (attrs) => (attrs.type === "disease" ? "circle" : "diamond"),
              labelFont: (attrs) =>
                attrs.type === "disease" ? "bold Arial, sans-serif" : "'Courier New', monospace",
              labelSize: (attrs) => (attrs.type === "disease" ? 16 : 10),
              labelPosition: (attrs) => (attrs.type === "disease" ? "over" : "right"),
              labelAngle: (attrs) => (attrs.type === "disease" ? 0 : GENE_LABEL_ANGLE),
              ...backdropStyles,
            },
          ],
        },
        settings: {
          itemSizesReference: "positions",
          zoomToSizeRatioFunction: (x: number) => x,
          autoRescale: true,
        },
      });
    });

  return () => {
    renderer?.kill();
  };
};
