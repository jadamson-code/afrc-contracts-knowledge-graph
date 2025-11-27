/**
 * Sigma.js Node Piechart Program Factory
 * ======================================
 *
 * Factory function for creating node piechart programs.
 * Provides backward compatibility with the original API while using
 * the new composable node program system internally.
 *
 * @module
 */
import { Attributes } from "graphology-types";
import { createComposedNodeProgram, NodeProgramType, sdfCircle } from "sigma/rendering";
import { PartialButFor } from "sigma/types";

import { layerPiechart } from "./layer";
import { CreateNodePiechartProgramOptions, DEFAULT_CREATE_NODE_PIECHART_OPTIONS } from "./types";

/**
 * Creates a node program that renders nodes as piecharts.
 * Uses the composable node program system with circle shapes by default.
 *
 * For non-circle shapes, use createComposedNodeProgram directly with layerPiechart().
 *
 * @param inputOptions - Piechart configuration options
 * @returns A NodeProgram class for rendering piechart nodes
 *
 * @example
 * ```typescript
 * // Simple piechart with attribute-based values
 * const PiechartProgram = createNodePiechartProgram({
 *   slices: [
 *     { color: { value: "#ff0000" }, value: { attribute: "value1" } },
 *     { color: { value: "#00ff00" }, value: { attribute: "value2" } },
 *     { color: { value: "#0000ff" }, value: { attribute: "value3" } },
 *   ],
 * });
 *
 * // Use with Sigma
 * const sigma = new Sigma(graph, container, {
 *   nodeProgramClasses: {
 *     piechart: PiechartProgram,
 *   },
 * });
 * ```
 */
export function createNodePiechartProgram<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
>(inputOptions: PartialButFor<CreateNodePiechartProgramOptions<N, E, G>, "slices">): NodeProgramType<N, E, G> {
  const options: CreateNodePiechartProgramOptions<N, E, G> = {
    ...(DEFAULT_CREATE_NODE_PIECHART_OPTIONS as Omit<CreateNodePiechartProgramOptions<N, E, G>, "slices">),
    ...inputOptions,
  };

  const { slices, offset, defaultColor, drawLabel, drawHover } = options;

  // Create the composed program with circle shape and piechart layer
  const BaseProgram = createComposedNodeProgram<N, E, G>({
    shape: sdfCircle(),
    layers: [layerPiechart({ slices, offset, defaultColor })],
  });

  // If custom drawLabel/drawHover are provided, create a subclass with those overrides
  if (drawLabel || drawHover) {
    return class NodePiechartProgram extends BaseProgram {
      drawLabel = drawLabel;
      drawHover = drawHover;
    };
  }

  return BaseProgram;
}
