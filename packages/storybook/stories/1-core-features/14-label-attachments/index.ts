/**
 * This example demonstrates the label attachments API using the sigma demo dataset
 * (a network of data visualization tools, concepts, and fields).
 * Hover over nodes to see an info card with the node's tag and cluster rendered
 * as an HTML attachment below the label.
 */
import Graph from "graphology";
import Sigma from "sigma";
import { DEFAULT_STYLES } from "sigma/types";
import { LabelAttachmentContent, LabelAttachmentContext } from "sigma/types";

export interface StoryArgs {
  backdropPadding: number;
}

// language=CSS
const INFO_CARD_CSS = /*css*/ `
.info {
  font: 11px sans-serif;
  color: #868e96;
  line-height: 1.6;
}`;

function drawInfoCard(ctx: LabelAttachmentContext): LabelAttachmentContent {
  const { attributes } = ctx;
  return {
    type: "html",
    css: INFO_CARD_CSS,
    html: `<div class="info">
      <div>${attributes.tag as string}</div>
      <div style="color:${attributes.color}">${attributes.clusterLabel as string}</div>
    </div>`,
  };
}

interface Cluster {
  key: string;
  color: string;
  clusterLabel: string;
}

interface Dataset {
  nodes: { key: string; label: string; tag: string; cluster: string; x: number; y: number; score: number }[];
  edges: [string, string][];
  clusters: Cluster[];
}

export default (args: StoryArgs) => {
  const container = document.getElementById("sigma-container") as HTMLElement;
  let renderer: Sigma | null = null;

  fetch("./wikipedia.json")
    .then((res) => res.json())
    .then((dataset: Dataset) => {
      const clustersByKey = Object.fromEntries(dataset.clusters.map((c) => [c.key, c]));

      const graph = new Graph();

      dataset.nodes.forEach((node) => {
        const cluster = clustersByKey[node.cluster];
        graph.addNode(node.key, {
          label: node.label,
          tag: node.tag,
          clusterLabel: cluster?.clusterLabel ?? node.cluster,
          color: cluster?.color ?? "#999",
          x: node.x,
          y: node.y,
          score: node.score,
        });
      });

      dataset.edges.forEach(([source, target]) => {
        if (graph.hasNode(source) && graph.hasNode(target) && !graph.hasEdge(source, target))
          graph.addEdge(source, target);
      });

      // Normalize score to a [3, 20] size range
      const scores = graph.nodes().map((n) => graph.getNodeAttribute(n, "score") as number);
      const minScore = Math.min(...scores);
      const maxScore = Math.max(...scores);
      graph.forEachNode((node) => {
        const score = graph.getNodeAttribute(node, "score") as number;
        graph.setNodeAttribute(node, "size", 3 + ((score - minScore) / (maxScore - minScore)) * 17);
      });

      renderer = new Sigma(graph, container, {
        primitives: {
          nodes: {
            shapes: ["circle"],
            layers: [{ type: "fill" }],
            labelAttachments: {
              hoverInfo: drawInfoCard,
            },
          },
        },
        styles: {
          nodes: [
            DEFAULT_STYLES.nodes,
            {
              color: { attribute: "color", defaultValue: "#999" },
              size: { attribute: "size", defaultValue: 5 },
              labelAttachment: {
                when: "isHovered",
                then: "hoverInfo",
              },
              backdropColor: "#ffffff",
              backdropShadowColor: "rgba(0, 0, 0, 0.2)",
              backdropShadowBlur: 8,
              backdropPadding: args.backdropPadding,
            },
          ],
        },
        settings: {
          labelRenderedSizeThreshold: 6,
        },
      });
    });

  return () => {
    renderer?.kill();
  };
};
