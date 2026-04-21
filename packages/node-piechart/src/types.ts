/**
 * Sigma.js Node Piechart Types
 * ============================
 *
 * Type definitions for the node piechart layer and program.
 *
 * @module
 */
import { FactoryOptionsFromSchema, arrayProp, colorProp, numberProp } from "sigma/primitives";

/**
 * Schema for the piechart layer.
 *
 * Properties:
 * - slices: Array of slice definitions (color and value)
 * - offset: Offset angle in radians (can be variable)
 * - defaultColor: Color when no slices are visible
 */
export const piechartSchema = {
  slices: arrayProp({
    color: colorProp("#000000", { variable: true }),
    value: numberProp(1, { variable: true }),
  }),
  offset: numberProp(0, { variable: true }),
  defaultColor: colorProp("#000000"),
} as const;

/**
 * Options for the layerPiechart() function.
 * Derived from the piechartSchema.
 */
export type LayerPiechartOptions = FactoryOptionsFromSchema<typeof piechartSchema>;

/**
 * Options for creating a node piechart program.
 */
export interface CreateNodePiechartProgramOptions {
  /**
   * Array of slice definitions.
   */
  slices: NonNullable<LayerPiechartOptions["slices"]>;

  /**
   * Offset angle for the piechart in radians.
   * Default: 0
   */
  offset?: LayerPiechartOptions["offset"];

  /**
   * Default color to use when no slices are visible.
   * Default: "#000000"
   */
  defaultColor?: string;
}

/**
 * Default color when no slices are visible or attribute is not found.
 */
export const DEFAULT_COLOR = "#000000";

/**
 * Default piechart program options.
 */
export const DEFAULT_CREATE_NODE_PIECHART_OPTIONS: Omit<CreateNodePiechartProgramOptions, "slices"> = {
  defaultColor: DEFAULT_COLOR,
  offset: 0,
};
