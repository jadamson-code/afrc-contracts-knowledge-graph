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
>(inputOptions?: Partial<CreateNodeBorderProgramOptions>): NodeProgramType<N, E, G> {
  const options: CreateNodeBorderProgramOptions = {
    ...DEFAULT_CREATE_NODE_BORDER_OPTIONS,
    ...(inputOptions || {}),
  };

  const { borders } = options;

  // Create the node program with circle shape and border layer
  return createNodeProgram<N, E, G>({
    shape: sdfCircle(),
    layers: [layerBorder({ borders })],
  });
}
