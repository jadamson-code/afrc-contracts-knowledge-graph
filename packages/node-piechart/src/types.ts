/**
 * Sigma.js Node Piechart Types
 * ============================
 *
 * Type definitions for the node piechart layer and program.
 *
 * @module
 */
import { ValueSource } from "sigma/rendering";
import { NonEmptyArray } from "sigma/types";

/**
 * Specifies the color of a piechart slice.
 * - string: Fixed CSS color value (e.g., "#ff0000")
 * - { attribute, default? }: Read from node attribute
 * - { transparent: true }: Fully transparent
 */
export type PiechartSliceColor = ValueSource<string> | { transparent: true };

/**
 * Specifies the value (size) of a piechart slice.
 * - number: Fixed value
 * - { attribute, default? }: Read from node attribute
 */
export type PiechartSliceValue = ValueSource<number>;

/**
 * Specifies the offset angle of the piechart.
 * - number: Fixed offset in radians
 * - { attribute, default? }: Read from node attribute
 */
export type PiechartOffset = ValueSource<number>;

/**
 * @deprecated Use PiechartSliceColor instead.
 */
export type NodeSliceColor = PiechartSliceColor;

/**
 * @deprecated Use PiechartSliceValue instead.
 */
export type NodeSliceValue = PiechartSliceValue;

/**
 * Options for the layerPiechart() function.
 */
export interface LayerPiechartOptions {
  /**
   * Array of slice definitions, in order around the piechart.
   * Each slice has a color and a value (size).
   */
  slices: NonEmptyArray<{
    color: PiechartSliceColor;
    value: PiechartSliceValue;
  }>;

  /**
   * Offset angle for the piechart in radians.
   * Allows rotating the starting position of the first slice.
   * Default: 0
   */
  offset?: PiechartOffset;

  /**
   * Default color to use when no slices are visible.
   * Default: "#000000"
   */
  defaultColor?: string;
}

/**
 * Options for the createNodePiechartProgram() function.
 */
export interface CreateNodePiechartProgramOptions {
  /**
   * Array of slice definitions.
   */
  slices: NonEmptyArray<{
    color: PiechartSliceColor;
    value: PiechartSliceValue;
  }>;

  /**
   * Offset angle for the piechart in radians.
   * Default: 0
   */
  offset: PiechartOffset;

  /**
   * Default color to use when no slices are visible.
   * Default: "#000000"
   */
  defaultColor: string;
}

/**
 * Default color when no slices are visible or attribute is not found.
 */
export const DEFAULT_COLOR = "#000000";

/**
 * Default options for createNodePiechartProgram.
 */
export const DEFAULT_CREATE_NODE_PIECHART_OPTIONS: Omit<CreateNodePiechartProgramOptions, "slices"> = {
  defaultColor: DEFAULT_COLOR,
  offset: 0,
};
