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
              backdropVisibility: "visible" as const,
              backdropColor: "#ffffff" as const,
              backdropShadowColor: "rgba(0, 0, 0, 0.5)" as const,
              backdropShadowBlur: 12,
              backdropPadding: args.backdropPadding,
            }
          : args.showBackdrops === "hover"
            ? {
                backdropVisibility: { when: "isHovered" as const, then: "visible" as const, else: "hidden" as const },
                backdropColor: "#ffffff" as const,
                backdropShadowColor: "rgba(0, 0, 0, 0.5)" as const,
                backdropShadowBlur: 12,
                backdropPadding: args.backdropPadding,
              }
            : {};

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
            backdropStyles,
            // "disease" nodes:
            {
              when: (attrs) => attrs.type === "disease",
              then: {
                shape: "circle",
                labelFont: "bold Arial, sans-serif",
                labelSize: 16,
                labelPosition: "over",
              },
            },
            // "gene" nodes:
            {
              when: (attrs) => attrs.type === "gene",
              then: {
                shape: "diamond",
                labelFont: "'Courier New', monospace",
                labelSize: 10,
                labelPosition: "right",
                labelAngle: Math.PI / 4,
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
    });

  return () => {
    renderer?.kill();
  };
};
