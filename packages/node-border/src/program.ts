/**
 * Sigma.js Node Border Program Factory
 * =====================================
 *
 * Factory function for creating node border programs.
 * Provides backward compatibility with the original API while using
 * the new composable node program system internally.
 *
 * @module
 */
import { Attributes } from "graphology-types";
import { createComposedNodeProgram, NodeProgramType, sdfCircle } from "sigma/rendering";

import { layerBorder } from "./layer";
import { CreateNodeBorderProgramOptions, DEFAULT_CREATE_NODE_BORDER_OPTIONS } from "./types";

/**
 * Creates a node program that renders nodes with configurable borders.
 * Uses the composable node program system with circle shapes by default.
 *
 * For non-circle shapes, use createComposedNodeProgram directly with layerBorder().
 *
 * @param inputOptions - Border configuration options
 * @returns A NodeProgram class for rendering bordered nodes
 *
 * @example
 * ```typescript
 * // Default: 10% border with attribute-based colors
 * const BorderedProgram = createNodeBorderProgram();
 *
 * // Custom borders
 * const CustomProgram = createNodeBorderProgram({
 *   borders: [
 *     { size: { value: 0.15 }, color: { value: "#ff0000" } },
 *     { size: { fill: true }, color: { attribute: "color" } },
 *   ],
 * });
 *
 * // Use with Sigma
 * const sigma = new Sigma(graph, container, {
 *   nodeProgramClasses: {
 *     bordered: BorderedProgram,
 *   },
 * });
 * ```
 */
export function createNodeBorderProgram<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
>(inputOptions?: Partial<CreateNodeBorderProgramOptions<N, E, G>>): NodeProgramType<N, E, G> {
  const options: CreateNodeBorderProgramOptions<N, E, G> = {
    ...(DEFAULT_CREATE_NODE_BORDER_OPTIONS as CreateNodeBorderProgramOptions<N, E, G>),
    ...(inputOptions || {}),
  };

  const { borders, drawLabel, drawHover } = options;

  // Create the composed program with circle shape and border layer
  const BaseProgram = createComposedNodeProgram<N, E, G>({
    shape: sdfCircle(),
    layers: [layerBorder({ borders })],
  });

  // If custom drawLabel/drawHover are provided, create a subclass with those overrides
  if (drawLabel || drawHover) {
    return class NodeBorderProgram extends BaseProgram {
      drawLabel = drawLabel;
      drawHover = drawHover;
    };
  }

  return BaseProgram;
}
