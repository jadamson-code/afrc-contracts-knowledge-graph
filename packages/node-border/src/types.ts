/**
 * Sigma.js Node Border Types
 * ==========================
 *
 * Type definitions for the node border layer and program.
 *
 * @module
 */

/**
 * Mode for border size specification.
 * - "relative": Size is a fraction of the shape size (0.0 to 1.0)
 * - "pixels": Size is in screen pixels
 */
export type BorderSizeMode = "relative" | "pixels";
export const DEFAULT_BORDER_SIZE_MODE: BorderSizeMode = "relative";

/**
 * Specifies the color of a border.
 */
export type BorderColor =
  | { value: string } // Fixed color value
  | { attribute: string; defaultValue?: string } // Read from node attribute
  | { transparent: true }; // Transparent

/**
 * Specifies the size of a border.
 */
export type BorderSize =
  | { value: number; mode?: BorderSizeMode } // Fixed size
  | { attribute: string; defaultValue: number; mode?: BorderSizeMode } // Read from node attribute
  | { fill: true }; // Fill remaining space

/**
 * Options for the layerBorder() function.
 */
export interface LayerBorderOptions {
  /**
   * Array of border definitions, from outermost to innermost.
   * Each border has a size and a color.
   */
  borders: {
    color: BorderColor;
    size: BorderSize;
  }[];
}

/**
 * Options for the createNodeBorderProgram() function.
 * Maintains backward compatibility with the original API.
 */
export interface CreateNodeBorderProgramOptions {
  /**
   * Array of border definitions, from outermost to innermost.
   */
  borders: {
    color: BorderColor;
    size: BorderSize;
  }[];
}

/**
 * Default border configuration: 10% outer border with fill.
 */
export const DEFAULT_BORDERS: LayerBorderOptions["borders"] = [
  { size: { value: 0.1 }, color: { attribute: "borderColor" } },
  { size: { fill: true }, color: { attribute: "color" } },
];

/**
 * Default options for createNodeBorderProgram.
 */
export const DEFAULT_CREATE_NODE_BORDER_OPTIONS: CreateNodeBorderProgramOptions = {
  borders: DEFAULT_BORDERS,
};

/**
 * Default color when attribute is not found.
 */
export const DEFAULT_COLOR = "#000000";
