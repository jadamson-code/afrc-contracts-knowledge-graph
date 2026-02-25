/**
 * This example showcases sigma's v4 state management:
 * - Custom state types for nodes, edges, and graph
 * - Style rules with function predicates (no reducers)
 * - Custom depth layers to render the highlighted subgraph on top
 *
 * All visual logic is expressed through styles. Nodes and edges share the same
 * custom state shape (isActive), making state updates uniform.
 */
import Graph from "graphology";
import Sigma from "sigma";
import { BaseEdgeState, BaseGraphState, BaseNodeState, Coordinates } from "sigma/types";

import data from "../../_data/data.json";

interface CustomNodeState extends BaseNodeState {
  isActive: boolean;
}

interface CustomEdgeState extends BaseEdgeState {
  isActive: boolean;
}

interface CustomGraphState extends BaseGraphState {
  hasActiveSubgraph: boolean;
}

export default () => {
  const container = document.getElementById("sigma-container") as HTMLElement;
  const searchInput = document.getElementById("search-input") as HTMLInputElement;
  const searchSuggestions = document.getElementById("suggestions") as HTMLDataListElement;

  const graph = new Graph();
  graph.import(data);

  const GREY = "#f6f6f6";

  const renderer = new Sigma<object, object, object, CustomNodeState, CustomEdgeState, CustomGraphState>(
    graph,
    container,
    {
      // Custom depth layers: topEdges sits above non-active nodes,
      // so the highlighted subgraph renders fully on top of the rest.
      primitives: {
        depthLayers: ["edges", "nodes", "nodeLabels", "topEdges", "topNodes", "topNodeLabels"],
      },
      styles: {
        nodes: [
          {
            color: { attribute: "color" },
            size: { attribute: "size" },
            label: { attribute: "label" },
          },
          {
            when: "isHighlighted",
            then: { labelVisibility: "visible" },
          },
          {
            when: (_attrs, state, graphState) =>
              graphState.hasActiveSubgraph && !state.isActive && !state.isHighlighted,
            then: { color: GREY, label: "" },
          },
          {
            when: "isActive",
            then: { depth: "topNodes", labelDepth: "topNodeLabels", labelVisibility: "visible" },
          },
        ],
        edges: [
          {
            color: { attribute: "color", defaultValue: "#ccc" },
            size: { attribute: "size", defaultValue: 1 },
          },
          {
            when: (_attrs, state, graphState) => graphState.hasActiveSubgraph && !state.isActive,
            then: { color: GREY },
          },
          {
            when: "isActive",
            then: { depth: "topEdges" },
          },
        ],
      },
    },
  );

  searchSuggestions.innerHTML = graph
    .nodes()
    .map((node) => `<option value="${graph.getNodeAttribute(node, "label")}"></option>`)
    .join("\n");

  let hoveredNode: string | null = null;
  let activeSearchNodes: Set<string> | null = null;

  function setActiveSubgraph(activeNodes: Set<string> | null) {
    graph.forEachNode((node) => {
      renderer.setNodeState(node, { isActive: !!activeNodes && activeNodes.has(node) });
    });
    graph.forEachEdge((edge) => {
      const [source, target] = graph.extremities(edge);
      renderer.setEdgeState(edge, {
        isActive: !!activeNodes && activeNodes.has(source) && activeNodes.has(target),
      });
    });
    renderer.setGraphState({ hasActiveSubgraph: !!activeNodes && activeNodes.size > 0 });
  }

  function refreshActiveSubgraph() {
    if (hoveredNode) {
      const neighbors = new Set(graph.neighbors(hoveredNode));
      neighbors.add(hoveredNode);
      setActiveSubgraph(neighbors);
    } else {
      setActiveSubgraph(activeSearchNodes);
    }
    renderer.refresh({ skipIndexation: true });
  }

  function setSearchQuery(query: string) {
    if (searchInput.value !== query) searchInput.value = query;

    let selectedNode: string | null = null;

    if (query) {
      const lcQuery = query.toLowerCase();
      const suggestions = graph
        .nodes()
        .map((n) => ({ id: n, label: graph.getNodeAttribute(n, "label") as string }))
        .filter(({ label }) => label.toLowerCase().includes(lcQuery));

      if (suggestions.length === 1 && suggestions[0].label === query) {
        selectedNode = suggestions[0].id;
        activeSearchNodes = null;
      } else {
        activeSearchNodes = new Set(suggestions.map(({ id }) => id));
      }
    } else {
      activeSearchNodes = null;
    }

    graph.forEachNode((node) => renderer.setNodeState(node, { isHighlighted: node === selectedNode }));
    refreshActiveSubgraph();

    if (selectedNode) {
      const nodePosition = renderer.getNodeDisplayData(selectedNode) as Coordinates;
      renderer.getCamera().animate(nodePosition, { duration: 500 });
    }
  }

  searchInput.addEventListener("input", () => setSearchQuery(searchInput.value || ""));
  searchInput.addEventListener("blur", () => setSearchQuery(""));

  renderer.on("enterNode", ({ node }) => {
    hoveredNode = node;
    refreshActiveSubgraph();
  });
  renderer.on("leaveNode", () => {
    hoveredNode = null;
    refreshActiveSubgraph();
  });

  return () => {
    renderer.kill();
  };
};
