/**
 * Sigma.js Settings
 * =================================
 *
 * The list of settings and some handy functions.
 * @module
 */
import { Attributes } from "graphology-types";

import {
  EdgeArrowProgram,
  EdgeLineProgram,
  EdgeProgramType,
  LabelProgramType,
  NodeCircleProgram,
  NodeProgramType,
} from "./rendering";
import {
  AtLeastOne,
  EdgeDisplayData,
  EdgeLabelFontSizeMode,
  EdgeLabelPosition,
  LabelPosition,
  NodeDisplayData,
} from "./types";
import { assign } from "./utils";

/**
 * Sigma.js settings
 * =================================
 */
export interface Settings<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
> {
  // Performance
  hideEdgesOnMove: boolean;
  hideLabelsOnMove: boolean;
  renderLabels: boolean;
  renderEdgeLabels: boolean;
  enableEdgeEvents: boolean;

  // Component rendering
  defaultNodeColor: string;
  defaultNodeType: string;
  defaultEdgeColor: string;
  defaultEdgeType: string;
  labelFont: string;
  labelSize: number;
  labelWeight: string;
  labelColor: { attribute: string; color?: string } | { color: string; attribute?: undefined };
  edgeLabelFont: string;
  edgeLabelSize: number;
  edgeLabelWeight: string;
  edgeLabelColor: { attribute: string; color?: string } | { color: string; attribute?: undefined };
  edgeLabelPosition: EdgeLabelPosition;
  edgeLabelMargin: number;
  edgeLabelFontSizeMode: EdgeLabelFontSizeMode;
  stagePadding: number;
  minEdgeThickness: number;
  antiAliasingFeather: number;

  // Mouse and touch settings
  dragTimeout: number;
  draggedEventsTolerance: number;
  inertiaDuration: number;
  inertiaRatio: number;
  zoomDuration: number;
  zoomingRatio: number;
  doubleClickTimeout: number;
  doubleClickZoomingRatio: number;
  doubleClickZoomingDuration: number;
  tapMoveTolerance: number;

  // Size and scaling
  zoomToSizeRatioFunction: (ratio: number) => number;
  itemSizesReference: "screen" | "positions";
  autoRescale: boolean;
  autoCenter: boolean;

  // Labels
  labelDensity: number;
  labelGridCellSize: number;
  labelRenderedSizeThreshold: number;

  // Reducers
  nodeReducer: null | ((node: string, data: N) => Partial<NodeDisplayData>);
  edgeReducer: null | ((edge: string, data: E) => Partial<EdgeDisplayData>);

  // Features
  maxDepthLevels: number;
  minCameraRatio: null | number;
  maxCameraRatio: null | number;
  enableCameraZooming: boolean;
  enableCameraPanning: boolean;
  enableCameraRotation: boolean;
  cameraPanBoundaries:
    | null
    | true
    | AtLeastOne<{ tolerance: number; boundaries: { x: [number, number]; y: [number, number] } }>;

  // Lifecycle
  allowInvalidContainer: boolean;

  // Program classes
  nodeProgramClasses: { [type: string]: NodeProgramType<N, E, G> };
  edgeProgramClasses: { [type: string]: EdgeProgramType<N, E, G> };
  labelProgramClasses: { [type: string]: LabelProgramType<N, E, G> };

  // WebGL Label Settings (for SDF-based rendering)
  defaultLabelType: string;
  defaultLabelPosition: LabelPosition;
  labelMargin: number;
  labelStyle: string;

  // Debug
  DEBUG_displayPickingLayer: boolean;
}

export const DEFAULT_SETTINGS: Settings<Attributes, Attributes, Attributes> = {
  // Performance
  hideEdgesOnMove: false,
  hideLabelsOnMove: false,
  renderLabels: true,
  renderEdgeLabels: false,
  enableEdgeEvents: false,

  // Component rendering
  defaultNodeColor: "#999",
  defaultNodeType: "circle",
  defaultEdgeColor: "#ccc",
  defaultEdgeType: "line",
  labelFont: "Arial",
  labelSize: 14,
  labelWeight: "normal",
  labelColor: { color: "#000" },
  edgeLabelFont: "Arial",
  edgeLabelSize: 14,
  edgeLabelWeight: "normal",
  edgeLabelColor: { color: "#000" },
  edgeLabelPosition: "over",
  edgeLabelMargin: 3,
  edgeLabelFontSizeMode: "fixed",
  stagePadding: 30,
  minEdgeThickness: 1.7,
  antiAliasingFeather: 1,

  // Mouse and touch settings
  dragTimeout: 100,
  draggedEventsTolerance: 3,
  inertiaDuration: 200,
  inertiaRatio: 3,
  zoomDuration: 250,
  zoomingRatio: 1.7,
  doubleClickTimeout: 300,
  doubleClickZoomingRatio: 2.2,
  doubleClickZoomingDuration: 200,
  tapMoveTolerance: 10,

  // Size and scaling
  zoomToSizeRatioFunction: Math.sqrt,
  itemSizesReference: "screen",
  autoRescale: true,
  autoCenter: true,

  // Labels
  labelDensity: 1,
  labelGridCellSize: 100,
  labelRenderedSizeThreshold: 6,

  // Reducers
  nodeReducer: null,
  edgeReducer: null,

  // Features
  maxDepthLevels: 20,
  minCameraRatio: null,
  maxCameraRatio: null,
  enableCameraZooming: true,
  enableCameraPanning: true,
  enableCameraRotation: true,
  cameraPanBoundaries: null,

  // Lifecycle
  allowInvalidContainer: false,

  // Program classes
  nodeProgramClasses: {},
  edgeProgramClasses: {},
  labelProgramClasses: {},

  // WebGL Label Settings (for SDF-based rendering)
  defaultLabelType: "sdf",
  defaultLabelPosition: "right",
  labelMargin: 3,
  labelStyle: "normal",

  // Debug
  DEBUG_displayPickingLayer: false,
};

export const DEFAULT_NODE_PROGRAM_CLASSES: Record<string, NodeProgramType> = {
  circle: NodeCircleProgram,
};

export const DEFAULT_EDGE_PROGRAM_CLASSES: Record<string, EdgeProgramType> = {
  arrow: EdgeArrowProgram,
  line: EdgeLineProgram,
};

// Default label program classes for WebGL SDF-based rendering
export const DEFAULT_LABEL_PROGRAM_CLASSES: Record<string, LabelProgramType> = {};

export function validateSettings<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
>(settings: Settings<N, E, G>): void {
  if (typeof settings.labelDensity !== "number" || settings.labelDensity < 0) {
    throw new Error("Settings: invalid `labelDensity`. Expecting a positive number.");
  }

  const { minCameraRatio, maxCameraRatio } = settings;
  if (typeof minCameraRatio === "number" && typeof maxCameraRatio === "number" && maxCameraRatio < minCameraRatio) {
    throw new Error(
      "Settings: invalid camera ratio boundaries. Expecting `maxCameraRatio` to be greater than `minCameraRatio`.",
    );
  }
}

export function resolveSettings<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
>(settings: Partial<Settings<N, E, G>>): Settings<N, E, G> {
  const resolvedSettings = assign({}, DEFAULT_SETTINGS as Settings<N, E, G>, settings);

  resolvedSettings.nodeProgramClasses = assign({}, DEFAULT_NODE_PROGRAM_CLASSES, resolvedSettings.nodeProgramClasses);
  resolvedSettings.edgeProgramClasses = assign({}, DEFAULT_EDGE_PROGRAM_CLASSES, resolvedSettings.edgeProgramClasses);
  resolvedSettings.labelProgramClasses = assign(
    {},
    DEFAULT_LABEL_PROGRAM_CLASSES,
    resolvedSettings.labelProgramClasses,
  );

  return resolvedSettings;
}
