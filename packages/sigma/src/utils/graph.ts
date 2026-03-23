import Graph from "graphology-types";
import isGraph from "graphology-utils/is-graph";

/**
 * Check if the graph variable is a valid graph, and if sigma can render it.
 */
export function validateGraph(graph: Graph): void {
  // check if it's a valid graphology instance
  if (!isGraph(graph)) throw new Error("Sigma: invalid graph instance.");
}
