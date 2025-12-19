/**
 * Sigma.js Node Border Types
 * ==========================
 *
 * Type definitions for the node border layer and program.
 *
 * @module
 */
import { SDFShape, sdfCircle } from "sigma/rendering";
import {
  arrayProp,
  booleanProp,
  colorProp,
  enumProp,
  FactoryOptionsFromSchema,
  numberProp,
} from "sigma/primitives";

/**
 * Mode for border size specification.
 * - "relative": Size is a fraction of the shape size (0.0 to 1.0)
 * - "pixels": Size is in screen pixels
 */
export type BorderSizeMode = "relative" | "pixels";
export const DEFAULT_BORDER_SIZE_MODE: BorderSizeMode = "relative";

/**
 * Schema for the border layer.
 *
 * Each border in the array specifies:
 * - size: Border thickness (number or attribute reference)
 * - color: Border color (CSS color or attribute reference)
 * - mode: How to interpret size ("relative" = fraction of shape, "pixels" = screen pixels)
 * - fill: If true, this border fills remaining space (size is ignored)
 */
export const borderSchema = {
  borders: arrayProp({
    size: numberProp(0.1, { variable: true }),
    color: colorProp("#000000", { variable: true }),
    mode: enumProp(["relative", "pixels"] as const, "relative"),
    fill: booleanProp(false),
  }),
} as const;

/**
 * Options for the layerBorder() function.
 * Derived from the borderSchema.
 */
export type LayerBorderOptions = FactoryOptionsFromSchema<typeof borderSchema>;

/**
 * Options for the createNodeBorderProgram() function.
 */
export interface CreateNodeBorderProgramOptions {
  /**
   * Array of border definitions, from outermost to innermost.
   */
  borders?: LayerBorderOptions["borders"];

  /**
   * A function that generates an SDF shape.
   * @default sdfCircle
   */
  shapeFactory?: () => SDFShape;
}

/**
 * Default border configuration: 10% outer border with fill.
 */
export const DEFAULT_BORDERS: NonNullable<LayerBorderOptions["borders"]> = [
  { size: { attribute: "borderSize", default: 0.1 }, color: { attribute: "borderColor" }, mode: "relative" },
  { size: 0, color: { attribute: "color" }, fill: true },
];

/**
 * Default options for createNodeBorderProgram.
 */
export const DEFAULT_CREATE_NODE_BORDER_OPTIONS: CreateNodeBorderProgramOptions = {
  borders: DEFAULT_BORDERS,
  shapeFactory: sdfCircle,
};

/**
 * Default color when attribute is not found.
 */
export const DEFAULT_COLOR = "#000000";
