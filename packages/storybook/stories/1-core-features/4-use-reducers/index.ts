/**
 * This example showcases sigma's v4 API with:
 * - Internal state management (replaces external state objects)
 * - Styles with conditional rules (replaces reducers for simple cases)
 * - Reducers as escape hatches (for complex logic like neighbor lookups)
 *
 * Features demonstrated:
 * 1. Custom state types extending BaseNodeState/BaseEdgeState
 * 2. Styles with "when" conditions based on state
 * 3. Graph state for shared data (e.g., whether there's an active search)
 * 4. Reducers receiving full context (key, computed, attrs, state, graphState, graph)
 */
import Graph from "graphology";
import Sigma from "sigma";
import { BaseEdgeState, BaseGraphState, BaseNodeState, Coordinates } from "sigma/types";

import data from "../../_data/data.json";

// Custom state types extending the base state interfaces
interface CustomNodeState extends BaseNodeState {
  isSuggestion: boolean; // Node matches the search query
  isNeighborOfHovered: boolean; // Node is a neighbor of the hovered node
}

interface CustomEdgeState extends BaseEdgeState {
  connectsSuggestions: boolean; // Edge connects two suggestion nodes
  connectsHoveredNeighbor: boolean; // Edge connects to hovered node or its neighbors
}

interface CustomGraphState extends BaseGraphState {
  hasActiveSearch: boolean; // Whether there's an active search query
  hoveredNode: string | null; // Currently hovered node
}

export default () => {
  // Retrieve some useful DOM elements:
  const container = document.getElementById("sigma-container") as HTMLElement;
  const searchInput = document.getElementById("search-input") as HTMLInputElement;
  const searchSuggestions = document.getElementById("suggestions") as HTMLDataListElement;

  // Instantiate sigma with v4 API:
  const graph = new Graph();
  graph.import(data);

  const renderer = new Sigma<object, object, object, CustomNodeState, CustomEdgeState, CustomGraphState>(
    graph,
    container,
    {
      // Styles use conditional rules based on state
      styles: {
        nodes: [
          // Base style: use graph attributes
          {
            color: { attribute: "color" },
            size: { attribute: "size" },
            label: { attribute: "label" },
          },
          // When node is highlighted (selected), show it prominently
          {
            when: "isHighlighted",
            then: { labelVisibility: "visible" },
          },
          // When node is a search suggestion, force its label visible
          {
            when: "isSuggestion",
            then: { labelVisibility: "visible" },
          },
        ],
        edges: [
          // Base style
          {
            color: { attribute: "color", defaultValue: "#ccc" },
            size: { attribute: "size", defaultValue: 1 },
          },
        ],
      },

      // Reducers handle complex logic that can't be expressed in styles
      // (e.g., neighbor lookups, conditional hiding based on graph structure)
      nodeReducer: (_key, computed, _attrs, state, graphState) => {
        // Type assertions for custom state properties
        const nodeState = state as CustomNodeState;
        const gState = graphState as CustomGraphState;

        // If there's a hovered node but this isn't it or its neighbor, grey it out
        if (gState.hoveredNode && !nodeState.isHovered && !nodeState.isNeighborOfHovered) {
          return { ...computed, label: "", color: "#f6f6f6" };
        }

        // If there's an active search but this node isn't a suggestion, grey it out
        if (gState.hasActiveSearch && !nodeState.isSuggestion && !nodeState.isHighlighted) {
          return { ...computed, label: "", color: "#f6f6f6" };
        }

        return computed;
      },

      edgeReducer: (_key, computed, _attrs, state, graphState) => {
        // Type assertions for custom state properties
        const edgeState = state as CustomEdgeState;
        const gState = graphState as CustomGraphState;

        // If there's a hovered node, hide edges not connected to it or its neighbors
        if (gState.hoveredNode && !edgeState.connectsHoveredNeighbor) {
          return { ...computed, hidden: true };
        }

        // If there's an active search, hide edges not connecting suggestions
        if (gState.hasActiveSearch && !edgeState.connectsSuggestions) {
          return { ...computed, hidden: true };
        }

        return computed;
      },
    },
  );

  // Feed the datalist autocomplete values:
  searchSuggestions.innerHTML = graph
    .nodes()
    .map((node) => `<option value="${graph.getNodeAttribute(node, "label")}"></option>`)
    .join("\n");

  // Helper to update neighbor states when a node is hovered
  function updateHoverNeighborStates(hoveredNode: string | null) {
    if (hoveredNode) {
      const neighbors = new Set(graph.neighbors(hoveredNode));

      // Update all nodes' isNeighborOfHovered state
      graph.forEachNode((node) => {
        renderer.setNodeState(node, { isNeighborOfHovered: neighbors.has(node) });
      });

      // Update all edges' connectsHoveredNeighbor state
      graph.forEachEdge((edge) => {
        const [source, target] = graph.extremities(edge);
        const connects =
          source === hoveredNode ||
          target === hoveredNode ||
          (neighbors.has(source) && neighbors.has(target)) ||
          neighbors.has(source) ||
          neighbors.has(target);
        renderer.setEdgeState(edge, { connectsHoveredNeighbor: connects });
      });
    } else {
      // Clear all neighbor states
      graph.forEachNode((node) => {
        renderer.setNodeState(node, { isNeighborOfHovered: false });
      });
      graph.forEachEdge((edge) => {
        renderer.setEdgeState(edge, { connectsHoveredNeighbor: false });
      });
    }
  }

  // Actions:
  function setSearchQuery(query: string) {
    if (searchInput.value !== query) searchInput.value = query;

    if (query) {
      const lcQuery = query.toLowerCase();
      const suggestions = graph
        .nodes()
        .map((n) => ({ id: n, label: graph.getNodeAttribute(n, "label") as string }))
        .filter(({ label }) => label.toLowerCase().includes(lcQuery));

      // If we have a single perfect match, select that node
      if (suggestions.length === 1 && suggestions[0].label === query) {
        const selectedNode = suggestions[0].id;

        // Clear all suggestion states and highlight the selected node
        graph.forEachNode((node) => {
          renderer.setNodeState(node, {
            isSuggestion: false,
            isHighlighted: node === selectedNode,
          });
        });

        // Update graph state
        renderer.setGraphState({ hasActiveSearch: false });

        // Move the camera to center it on the selected node
        const nodePosition = renderer.getNodeDisplayData(selectedNode) as Coordinates;
        renderer.getCamera().animate(nodePosition, { duration: 500 });
      } else {
        // Update suggestion states for all nodes
        const suggestionSet = new Set(suggestions.map(({ id }) => id));

        graph.forEachNode((node) => {
          renderer.setNodeState(node, {
            isSuggestion: suggestionSet.has(node),
            isHighlighted: false,
          });
        });

        // Update edge states
        graph.forEachEdge((edge) => {
          const [source, target] = graph.extremities(edge);
          renderer.setEdgeState(edge, {
            connectsSuggestions: suggestionSet.has(source) && suggestionSet.has(target),
          });
        });

        // Update graph state
        renderer.setGraphState({ hasActiveSearch: true });
      }
    } else {
      // Clear all search-related states
      graph.forEachNode((node) => {
        renderer.setNodeState(node, { isSuggestion: false, isHighlighted: false });
      });
      graph.forEachEdge((edge) => {
        renderer.setEdgeState(edge, { connectsSuggestions: false });
      });
      renderer.setGraphState({ hasActiveSearch: false });
    }

    // Refresh rendering (state changes auto-trigger refresh, but we want skipIndexation)
    renderer.refresh({ skipIndexation: true });
  }

  // Bind search input interactions:
  searchInput.addEventListener("input", () => {
    setSearchQuery(searchInput.value || "");
  });
  searchInput.addEventListener("blur", () => {
    setSearchQuery("");
  });

  // Bind graph interactions using Sigma's built-in hover state
  renderer.on("enterNode", ({ node }) => {
    // Sigma automatically sets isHovered state, but we need to update neighbors
    updateHoverNeighborStates(node);
    renderer.setGraphState({ hoveredNode: node });
    renderer.refresh({ skipIndexation: true });
  });

  renderer.on("leaveNode", () => {
    updateHoverNeighborStates(null);
    renderer.setGraphState({ hoveredNode: null });
    renderer.refresh({ skipIndexation: true });
  });

  return () => {
    renderer.kill();
  };
};
