/**
 * Sigma.js Node Piechart Types
 * ============================
 *
 * Type definitions for the node piechart layer and program.
 *
 * @module
 */
import { NonEmptyArray } from "sigma/types";

/**
 * Specifies the color of a piechart slice.
 */
export type PiechartSliceColor =
  | { value: string } // Fixed color value
  | { attribute: string; defaultValue?: string } // Read from node attribute
  | { transparent: true }; // Transparent

/**
 * Specifies the value (size) of a piechart slice.
 */
export type PiechartSliceValue =
  | { value: number } // Fixed value
  | { attribute: string }; // Read from node attribute

/**
 * Specifies the offset angle of the piechart.
 */
export type PiechartOffset =
  | { value: number } // Fixed offset in radians
  | { attribute: string }; // Read from node attribute

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
   * Default: { value: 0 }
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
 * Maintains backward compatibility with the original API.
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
   * Default: { value: 0 }
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
  offset: { value: 0 },
};
