/**
 * Sigma.js Node Border Program Factory
 * =====================================
 *
 * Factory function for creating node border programs.
 * Uses the node program system with SDF shapes and layers.
 *
 * @module
 */
import { Attributes } from "graphology-types";
import { createNodeProgram, NodeProgramType, sdfCircle } from "sigma/rendering";

import { layerBorder } from "./layer";
import { CreateNodeBorderProgramOptions, DEFAULT_CREATE_NODE_BORDER_OPTIONS } from "./types";

/**
 * Creates a node program that renders nodes with configurable borders.
 * Uses the node program system with circle shapes by default.
 *
 * For non-circle shapes, use createNodeProgram directly with layerBorder().
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
 *   labelProgramClasses: {
 *     bordered: BorderedProgram.LabelProgram,
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

  // Create the node program with circle shape and border layer
  const BaseProgram = createNodeProgram<N, E, G>({
    shape: sdfCircle(),
    layers: [layerBorder({ borders })],
  });

  // If custom drawLabel/drawHover are provided, create a subclass with those overrides
  if (drawLabel || drawHover) {
    const CustomProgram = class NodeBorderProgram extends BaseProgram {
      drawLabel = drawLabel;
      drawHover = drawHover;
    };
    // Copy the static LabelProgram reference
    CustomProgram.LabelProgram = BaseProgram.LabelProgram;
    return CustomProgram;
  }

  return BaseProgram;
}
