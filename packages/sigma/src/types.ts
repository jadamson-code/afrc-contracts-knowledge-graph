/**
 * Sigma.js Types
 * ===============
 *
 * Various type declarations used throughout the library.
 * @module
 */
import { EventEmitter } from "events";

/**
 * Util type to represent maps of typed elements, but implemented with
 * JavaScript objects.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PlainObject<T = any> = { [k: string]: T };

/**
 * Returns a type similar to T, but with the K set of properties of the type
 * T *required*, and the rest optional.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PartialButFor<T, K extends keyof T> = Pick<T, K> & Partial<Omit<T, K>> & { [others: string]: any };

/**
 * Returns a type similar to Partial<T>, but with at least one key set.
 */
export type AtLeastOne<T, U = { [K in keyof T]: Pick<T, K> }> = Partial<T> & U[keyof U];

export type NonEmptyArray<T> = [T, ...T[]];

export interface Coordinates {
  x: number;
  y: number;
}

export interface CameraState extends Coordinates {
  angle: number;
  ratio: number;
}

export type MouseInteraction = "click" | "doubleClick" | "rightClick" | "wheel" | "down" | "up" | "leave" | "enter";

export interface MouseCoords extends Coordinates {
  sigmaDefaultPrevented: boolean;
  preventSigmaDefault(): void;
  original: MouseEvent | TouchEvent;
}

export interface WheelCoords extends MouseCoords {
  delta: number; // This will store the delta actually used by sigma
}

export interface TouchCoords {
  touches: Coordinates[];
  previousTouches: Coordinates[];
  sigmaDefaultPrevented: boolean;
  preventSigmaDefault(): void;
  original: TouchEvent;
}

export interface Dimensions {
  width: number;
  height: number;
}

export type Extent = [number, number];

export interface DisplayData {
  label: string | null;
  size: number;
  color: string;
  hidden: boolean;
  forceLabel: boolean;
  zIndex: number;
  type: string;
}

export interface NodeDisplayData extends Coordinates, DisplayData {
  highlighted: boolean;
  shape?: string; // Shape name for edge clamping (e.g., "circle", "square")
}
export type EdgeDisplayData = DisplayData;

export type CoordinateConversionOverride = {
  cameraState?: CameraState;
  matrix?: Float32Array;
  viewportDimensions?: Dimensions;
  graphDimensions?: Dimensions;
  padding?: number;
};

export interface RenderParams {
  width: number;
  height: number;
  sizeRatio: number;
  zoomRatio: number;
  pixelRatio: number;
  cameraAngle: number;
  correctionRatio: number;
  matrix: Float32Array;
  invMatrix: Float32Array;
  downSizingRatio: number;
  minEdgeThickness: number;
  antiAliasingFeather: number;
  nodeDataTextureUnit: number;
  nodeDataTextureWidth: number;
  pickingFrameBuffer: WebGLFramebuffer | null;
}

/**
 * Custom event emitter types.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Listener = (...args: any[]) => void;
export type EventsMapping = Record<string, Listener>;

interface ITypedEventEmitter<Events extends EventsMapping> {
  rawEmitter: EventEmitter;

  eventNames<Event extends keyof Events>(): Array<Event>;
  setMaxListeners(n: number): this;
  getMaxListeners(): number;
  emit<Event extends keyof Events>(type: Event, ...args: Parameters<Events[Event]>): boolean;
  addListener<Event extends keyof Events>(type: Event, listener: Events[Event]): this;
  on<Event extends keyof Events>(type: Event, listener: Events[Event]): this;
  once<Event extends keyof Events>(type: Event, listener: Events[Event]): this;
  prependListener<Event extends keyof Events>(type: Event, listener: Events[Event]): this;
  prependOnceListener<Event extends keyof Events>(type: Event, listener: Events[Event]): this;
  removeListener<Event extends keyof Events>(type: Event, listener: Events[Event]): this;
  off<Event extends keyof Events>(type: Event, listener: Events[Event]): this;
  removeAllListeners<Event extends keyof Events>(type?: Event): this;
  listeners<Event extends keyof Events>(type: Event): Events[Event][];
  listenerCount<Event extends keyof Events>(type: Event): number;
  rawListeners<Event extends keyof Events>(type: Event): Events[Event][];
}

export class TypedEventEmitter<Events extends EventsMapping> extends (EventEmitter as unknown as {
  new <T extends EventsMapping>(): ITypedEventEmitter<T>;
})<Events> {
  constructor() {
    super();
    this.rawEmitter = this as EventEmitter;
  }
}

/**
 * Event types.
 */
export interface SigmaEventPayload {
  event: MouseCoords;
  preventSigmaDefault(): void;
}

export type SigmaStageEventPayload = SigmaEventPayload;
export interface SigmaNodeEventPayload extends SigmaEventPayload {
  node: string;
}
export interface SigmaEdgeEventPayload extends SigmaEventPayload {
  edge: string;
}

export type SigmaStageEvents = {
  [E in MouseInteraction as `${E}Stage`]: (payload: SigmaStageEventPayload) => void;
};

export type SigmaNodeEvents = {
  [E in MouseInteraction as `${E}Node`]: (payload: SigmaNodeEventPayload) => void;
};

export type SigmaEdgeEvents = {
  [E in MouseInteraction as `${E}Edge`]: (payload: SigmaEdgeEventPayload) => void;
};

export type SigmaAdditionalEvents = {
  // Lifecycle events
  beforeClear(): void;
  afterClear(): void;
  beforeProcess(): void;
  afterProcess(): void;
  beforeRender(): void;
  afterRender(): void;
  resize(): void;
  kill(): void;
  // Body events
  moveBody(payload: SigmaStageEventPayload): void;
};

export type SigmaEvents = SigmaStageEvents & SigmaNodeEvents & SigmaEdgeEvents & SigmaAdditionalEvents;
export type SigmaEventType = keyof SigmaEvents;

/**
 * Label types:
 */

/**
 * Position of a label relative to its parent node.
 */
export type LabelPosition = "right" | "left" | "above" | "below" | "over";

/**
 * Position of an edge label relative to the edge path.
 * - "over": Centered on the path centerline
 * - "above": Above the edge (perpendicular offset)
 * - "below": Below the edge (perpendicular offset)
 * - "auto": GPU determines above/below based on which node is leftmost on screen
 */
export type EdgeLabelPosition = "over" | "above" | "below" | "auto";

/**
 * Font size mode for edge labels.
 * - "fixed": Constant pixel size regardless of zoom (default)
 * - "scaled": Scales with zoom level using zoomToSizeRatioFunction from settings
 */
export type EdgeLabelFontSizeMode = "fixed" | "scaled";

/**
 * Display data for a label, computed during processing.
 */
export interface LabelDisplayData {
  /** The label text content */
  text: string;
  /** X position in graph coordinates (node center) */
  x: number;
  /** Y position in graph coordinates (node center) */
  y: number;
  /** Font size in pixels */
  size: number;
  /** Label color (CSS color string) */
  color: string;
  /** Whether the label is hidden */
  hidden: boolean;
  /** Force display even if culled by LabelGrid */
  forceLabel: boolean;
  /** Label type (for program selection) */
  type: string;
  /** Z-index for depth ordering */
  zIndex: number;
  /** Reference to parent node/edge key */
  parentKey: string;
  /** Parent type: 'node' or 'edge' */
  parentType: "node" | "edge";
  /** Where label appears relative to node */
  position: LabelPosition;
  /** Node size (for offset calculation) */
  nodeSize: number;
  /** Gap between node boundary and label (pixels) */
  margin: number;
  /** Font key for multi-font support (references registered font in atlas) */
  fontKey: string;
  /** Node index in node data texture (for GPU-side lookup) */
  nodeIndex: number;
}

/**
 * Display data for an edge label, computed during processing.
 * Extends LabelDisplayData with edge-specific positioning info.
 */
export interface EdgeLabelDisplayData extends Omit<LabelDisplayData, "position"> {
  /** Position of edge label relative to path (overrides LabelDisplayData.position) */
  position: EdgeLabelPosition;
  /** Source node X position in graph coordinates */
  sourceX: number;
  /** Source node Y position in graph coordinates */
  sourceY: number;
  /** Target node X position in graph coordinates */
  targetX: number;
  /** Target node Y position in graph coordinates */
  targetY: number;
  /** Source node size in graph coordinates */
  sourceSize: number;
  /** Target node size in graph coordinates */
  targetSize: number;
  /** Source node shape slug (e.g., "circle", "square") */
  sourceShape: string;
  /** Target node shape slug (e.g., "circle", "square") */
  targetShape: string;
  /** Edge thickness/size in pixels */
  edgeSize: number;
  /** Perpendicular offset from path centerline (pixels) */
  offset: number;
  /** Path curvature for curved edges (0 for straight) */
  curvature: number;
  /** Source node index in node data texture */
  sourceNodeIndex: number;
  /** Target node index in node data texture */
  targetNodeIndex: number;
}

/**
 * Label event types.
 */
export interface SigmaLabelEventPayload extends SigmaEventPayload {
  /** The label text */
  label: string;
  /** Type of parent element */
  parentType: "node" | "edge";
  /** Key of the parent element */
  parentKey: string;
}

export type SigmaLabelEvents = {
  clickLabel: (payload: SigmaLabelEventPayload) => void;
  rightClickLabel: (payload: SigmaLabelEventPayload) => void;
  doubleClickLabel: (payload: SigmaLabelEventPayload) => void;
  enterLabel: (payload: SigmaLabelEventPayload) => void;
  leaveLabel: (payload: SigmaLabelEventPayload) => void;
};

/**
 * Export various other types:
 */
export type { CameraEvents } from "./core/camera";
export type { MouseCaptorEvents } from "./core/captors/mouse";
export type { TouchCaptorEvents } from "./core/captors/touch";
export type { FontKey, FontDescriptor, GlyphMetrics, SDFAtlasOptions } from "./core/sdf-atlas";
