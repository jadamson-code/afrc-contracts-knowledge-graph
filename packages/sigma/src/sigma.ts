/**
 * Sigma.js
 * ========
 * @module
 */
import Graph, { Attributes } from "graphology-types";

import Camera from "./core/camera";
import { cleanMouseCoords } from "./core/captors/captor";
import MouseCaptor from "./core/captors/mouse";
import TouchCaptor from "./core/captors/touch";
import { LabelGrid, edgeLabelsToDisplayFromNodes } from "./core/labels";
import { SDFAtlasManager } from "./core/sdf-atlas";
import { evaluateEdgeStyle, evaluateNodeStyle } from "./core/styles";
import { PrimitivesDeclaration, VariablesDefinition, generateEdgeProgram, generateNodeProgram } from "./primitives";
import { DEFAULT_DEPTH_LAYERS } from "./primitives/types";
import {
  BackdropProgram,
  BucketCollection,
  EdgeDataTexture,
  EdgeLabelProgram,
  EdgeProgram,
  EdgeProgramType,
  BackdropDisplayData,
  BackdropProgramType,
  LabelProgram,
  LabelProgramType,
  NodeDataTexture,
  NodeProgram,
  NodeProgramType,
  getShapeId,
} from "./rendering";
import { Settings, resolveSettings, validateSettings } from "./settings";
import { DepthRanges, addPositionToDepthRanges, removePositionFromDepthRanges } from "./utils/fragments";
import {
  BucketStats,
  BufferStats,
  CameraState,
  CoordinateConversionOverride,
  Coordinates,
  DEFAULT_PRIMITIVES,
  Dimensions,
  EdgeDisplayData,
  EdgeLabelPosition,
  Extent,
  LabelDisplayData,
  Listener,
  MemoryStats,
  MouseCoords,
  MouseInteraction,
  NodeDisplayData,
  PlainObject,
  RenderParams,
  SigmaEvents,
  TextureStats,
  TouchCoords,
  TypedEventEmitter,
  WriteStats,
} from "./types";
import { DEFAULT_STYLES } from "./types/styles";
import {
  BaseEdgeState,
  BaseGraphState,
  BaseNodeState,
  StylesDeclaration,
  createEdgeState,
  createGraphState,
  createNodeState,
} from "./types/styles";
import {
  NormalizationFunction,
  colorToIndex,
  createElement,
  createNormalizationFunction,
  extend,
  getMatrixImpact,
  getPixelColor,
  colorToArray,
  getPixelRatio,
  graphExtent,
  identity,
  matrixFromCamera,
  multiplyVec2,
  validateGraph,
} from "./utils";

/**
 * Constants.
 */
const X_LABEL_MARGIN = 150;
const Y_LABEL_MARGIN = 50;
const hasOwnProperty = Object.prototype.hasOwnProperty;
// Texture unit for the shared node data texture (position, size, shapeId)
const NODE_DATA_TEXTURE_UNIT = 3;
// Texture unit for the shared edge data texture (source/target indices, thickness, curvature, etc.)
const EDGE_DATA_TEXTURE_UNIT = 4;

/**
 * Reducer types for the new API.
 */
export type NodeReducer<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
  NS extends BaseNodeState = BaseNodeState,
  GS extends BaseGraphState = BaseGraphState,
> = (
  key: string,
  data: NodeDisplayData,
  attrs: N,
  state: NS,
  graphState: GS,
  graph: Graph<N, E, G>,
) => Partial<NodeDisplayData>;

export type EdgeReducer<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
  ES extends BaseEdgeState = BaseEdgeState,
  GS extends BaseGraphState = BaseGraphState,
> = (
  key: string,
  data: EdgeDisplayData,
  attrs: E,
  state: ES,
  graphState: GS,
  graph: Graph<N, E, G>,
) => Partial<EdgeDisplayData>;

/**
 * Main class.
 *
 * @constructor
 * @param {Graph}       graph     - Graph to render.
 * @param {HTMLElement} container - DOM container in which to render.
 * @param {object}      settings  - Optional settings.
 */
export default class Sigma<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
  NS extends BaseNodeState = BaseNodeState,
  ES extends BaseEdgeState = BaseEdgeState,
  GS extends BaseGraphState = BaseGraphState,
> extends TypedEventEmitter<SigmaEvents> {
  private settings: Settings;
  private graph: Graph<N, E, G>;

  // Reducers (optional escape hatches for complex styling logic)
  private nodeReducer: NodeReducer<N, E, G, NS, GS> | null = null;
  private edgeReducer: EdgeReducer<N, E, G, ES, GS> | null = null;
  private mouseCaptor: MouseCaptor<N, E, G>;
  private touchCaptor: TouchCaptor<N, E, G>;
  private container: HTMLElement;
  private elements: PlainObject<HTMLElement> = {};
  private canvasContexts: PlainObject<CanvasRenderingContext2D> = {};
  private webGLContext: WebGL2RenderingContext | null = null;
  private pickingFrameBuffer: WebGLFramebuffer | null = null;
  private pickingTexture: WebGLTexture | null = null;
  private pickingDepthBuffer: WebGLRenderbuffer | null = null;
  private activeListeners: PlainObject<Listener> = {};
  private labelGrid: LabelGrid = new LabelGrid();
  private nodeDataCache: Record<string, NodeDisplayData> = {};
  private edgeDataCache: Record<string, EdgeDisplayData> = {};

  // Variables declared in primitives (for custom layer attributes)
  private nodeVariables: VariablesDefinition = {};
  private edgeVariables: VariablesDefinition = {};

  // Indices to keep track of the index of the item inside programs
  private nodeProgramIndex: Record<string, number> = {};
  private edgeProgramIndex: Record<string, number> = {};
  private nodesWithForcedLabels: Set<string> = new Set<string>();
  private edgesWithForcedLabels: Set<string> = new Set<string>();
  private nodesWithBackdrop: Set<string> = new Set<string>();
  private nodeExtent: { x: Extent; y: Extent } = { x: [0, 1], y: [0, 1] };

  private matrix: Float32Array = identity();
  private invMatrix: Float32Array = identity();
  private correctionRatio = 1;
  private customBBox: { x: Extent; y: Extent } | null = null;
  private normalizationFunction: NormalizationFunction = createNormalizationFunction({
    x: [0, 1],
    y: [0, 1],
  });

  // Cache:
  private graphToViewportRatio = 1;
  private itemIDsIndex: Record<number, { type: "node" | "edge"; id: string }> = {};
  private nodeIndices: Record<string, number> = {};
  private edgeIndices: Record<string, number> = {};

  // Starting dimensions and pixel ratio
  private width = 0;
  private height = 0;
  private pixelRatio = getPixelRatio();

  // Graph State
  private displayedNodeLabels: Set<string> = new Set();
  private displayedEdgeLabels: Set<string> = new Set();

  // State management (new API)
  private nodeStates: Map<string, NS> = new Map();
  private edgeStates: Map<string, ES> = new Map();
  private graphState: GS = createGraphState<GS>();

  // Tracking for event system (which node/edge is currently hovered for enter/leave events)
  private hoveredNode: string | null = null;
  private hoveredEdge: string | null = null;

  // New v4 API: primitives and styles declarations
  private primitives: PrimitivesDeclaration | null = null;
  private stylesDeclaration: StylesDeclaration<N, E, NS, ES, GS> | null = null;

  // Internal states
  private renderFrame: number | null = null;
  private needToProcess = false;
  private needToRefreshState = false;
  private checkEdgesEventsFrame: number | null = null;

  // Programs
  private nodePrograms: { [key: string]: NodeProgram<string, N, E, G> } = {};
  private backdropPrograms: { [key: string]: BackdropProgram<string, N, E, G> } = {};
  private edgePrograms: { [key: string]: EdgeProgram<string, N, E, G> } = {};
  private labelPrograms: { [key: string]: LabelProgram<string, N, E, G> } = {};
  private edgeLabelPrograms: { [key: string]: EdgeLabelProgram<string, N, E, G> } = {};

  // Cache mapping node type to shape slug (for edge clamping)
  // The slug encodes shape name, params, and rotateWithCamera flag
  private nodeTypeShapeCache: { [type: string]: string } = {};

  // For multi-shape programs: maps node type to { shapeName -> localIndex }
  // Used to look up the local shape index for nodes that specify a 'shape' attribute
  private nodeTypeShapeMap: { [type: string]: Record<string, number> } = {};

  // For multi-shape programs: maps node type to array of global shape IDs
  // Used to convert local shape index to global ID for edge clamping
  private nodeTypeGlobalShapeIds: { [type: string]: number[] } = {};

  // WebGL Labels (SDF-based rendering)
  private sdfAtlas: SDFAtlasManager | null = null;
  private defaultFontKey: string = "";

  // Shared texture storing node position, size, and shapeId for GPU programs
  private nodeDataTexture: NodeDataTexture | null = null;
  // Shared texture storing edge data (source/target indices, thickness, curvature, etc.)
  private edgeDataTexture: EdgeDataTexture | null = null;

  // Bucket collections for depth management (supports future item types like labels)
  private itemBuckets: Record<"nodes" | "edges", BucketCollection>;
  // Track previous zIndex to detect changes
  private zIndexCache: Record<"nodes" | "edges", Record<string, number>> = {
    nodes: {},
    edges: {},
  };
  // Track {offset, count} fragment ranges per [depth][programType] for range-rendering
  private depthRanges: { nodes: DepthRanges; edges: DepthRanges } = { nodes: {}, edges: {} };
  // Depth assigned to each item during the last process() call
  private nodeBaseDepth: Record<string, string> = {};
  private edgeBaseDepth: Record<string, string> = {};

  private camera: Camera;

  constructor(
    graph: Graph<N, E, G>,
    container: HTMLElement,
    options: {
      primitives?: PrimitivesDeclaration;
      styles?: StylesDeclaration<N, E, NS, ES, GS>;
      settings?: Partial<Settings>;
      nodeReducer?: NodeReducer<N, E, G, NS, GS>;
      edgeReducer?: EdgeReducer<N, E, G, ES, GS>;
    } = {},
  ) {
    super();

    // Extract options
    const { primitives, styles, settings = {}, nodeReducer, edgeReducer } = options;

    // Store primitives and styles declarations for v4 API
    // Use DEFAULT_STYLES when styles not provided
    this.primitives = primitives ?? DEFAULT_PRIMITIVES;
    this.stylesDeclaration = styles ?? (DEFAULT_STYLES as unknown as StylesDeclaration<N, E, NS, ES, GS>);

    // Store reducers
    this.nodeReducer = nodeReducer ?? null;
    this.edgeReducer = edgeReducer ?? null;

    // Resolving settings
    this.settings = resolveSettings(settings);

    // Validating
    validateSettings(this.settings);
    validateGraph(graph);
    if (!(container instanceof HTMLElement)) throw new Error("Sigma: container should be an html element.");

    // Properties
    this.graph = graph;
    this.container = container;

    // Initialize bucket collections with numDepthLayers * maxDepthLevels
    const numDepthLayers = (this.primitives?.depthLayers ?? [...DEFAULT_DEPTH_LAYERS]).length;
    this.itemBuckets = {
      nodes: new BucketCollection(numDepthLayers * this.settings.maxDepthLevels),
      edges: new BucketCollection(numDepthLayers * this.settings.maxDepthLevels),
    };

    // Initializing contexts
    this.createWebGLContext("stage", { picking: true });
    this.createCanvasContext("edgeLabels");
    this.createCanvasContext("labels");
    this.createCanvasContext("mouse", { style: { touchAction: "none", userSelect: "none" } });

    // Initial resize
    this.resize();

    // Initialize node data texture for sharing position/size/shape data between node and edge programs
    this.nodeDataTexture = new NodeDataTexture(this.webGLContext!);

    // Initialize edge data texture for sharing edge data between edge and edge label programs
    this.edgeDataTexture = new EdgeDataTexture(this.webGLContext!);

    // Generate and register programs from primitives (uses defaults when not provided)
    const { program: NodeProgram, variables: nodeVariables } = generateNodeProgram<N, E, G>(this.primitives?.nodes);
    this.nodeVariables = nodeVariables;
    this.registerNodeProgram("default", NodeProgram);

    const { program: EdgeProgram, variables: edgeVariables } = generateEdgeProgram<N, E, G>(this.primitives?.edges);
    this.edgeVariables = edgeVariables;
    this.registerEdgeProgram("default", EdgeProgram);

    // Initialize WebGL labels
    this.initializeWebGLLabels();

    // Initializing the camera
    this.camera = new Camera();

    // Binding camera events
    this.bindCameraHandlers();

    // Initializing captors
    // Cast to Sigma<N, E, G> since captors don't use state generics
    this.mouseCaptor = new MouseCaptor(this.elements.mouse, this as unknown as Sigma<N, E, G>);
    this.mouseCaptor.setSettings(this.settings);
    this.touchCaptor = new TouchCaptor(this.elements.mouse, this as unknown as Sigma<N, E, G>);
    this.touchCaptor.setSettings(this.settings);

    // Binding event handlers
    this.bindEventHandlers();

    // Binding graph handlers
    this.bindGraphHandlers();

    // Trigger eventual settings-related things
    this.handleSettingsUpdate();

    // Processing data for the first time & render
    this.refresh();
  }

  /**---------------------------------------------------------------------------
   * Internal methods.
   **---------------------------------------------------------------------------
   */

  /**
   * Internal function used to register a node program
   *
   * @param  {string}           key              - The program's key, matching the related nodes "type" values.
   * @param  {NodeProgramType}  NodeProgramClass - A nodes program class.
   * @return {Sigma}
   */
  private registerNodeProgram(key: string, NodeProgramClass: NodeProgramType<N, E, G>): this {
    if (this.nodePrograms[key]) this.nodePrograms[key].kill();
    // Cast this since programs don't use state generics
    const sigma = this as unknown as Sigma<N, E, G>;
    this.nodePrograms[key] = new NodeProgramClass(this.webGLContext!, null, sigma);
    // Register program type with bucket collection (stride will be set properly when used)
    this.itemBuckets.nodes.registerProgram(key, 1);

    // Cache shape information for this node type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const programOptions = (NodeProgramClass as any).programOptions;
    if (programOptions?.shapeSlug) {
      // Primary shape slug for edge clamping (uses first shape for multi-shape programs)
      this.nodeTypeShapeCache[key] = programOptions.shapeSlug;
    }
    if (programOptions?.shapeNameToIndex) {
      // Multi-shape program: store the shape name -> local index mapping
      this.nodeTypeShapeMap[key] = programOptions.shapeNameToIndex;
    } else {
      // Single-shape program: clear any previous mapping
      delete this.nodeTypeShapeMap[key];
    }
    if (programOptions?.shapeGlobalIds) {
      // Multi-shape program: store the local index -> global shape ID mapping
      this.nodeTypeGlobalShapeIds[key] = programOptions.shapeGlobalIds;
    } else {
      // Single-shape program: clear any previous mapping
      delete this.nodeTypeGlobalShapeIds[key];
    }

    // Register the associated label program if the node program has one
    const LabelProgramClass = NodeProgramClass.LabelProgram as LabelProgramType<N, E, G> | undefined;
    if (LabelProgramClass) {
      this.registerLabelProgram(key, LabelProgramClass);
    }

    // Register the associated backdrop program if the node program has one
    const BackdropProgramClass = NodeProgramClass.BackdropProgram as BackdropProgramType<N, E, G> | undefined;
    if (BackdropProgramClass) {
      this.registerBackdropProgram(key, BackdropProgramClass);
    }

    return this;
  }

  /**
   * Internal function used to register an edge program
   *
   * @param  {string}          key              - The program's key, matching the related edges "type" values.
   * @param  {EdgeProgramType} EdgeProgramClass - An edges program class.
   * @return {Sigma}
   */
  private registerEdgeProgram(key: string, EdgeProgramClass: EdgeProgramType<N, E, G>): this {
    if (this.edgePrograms[key]) this.edgePrograms[key].kill();
    // Cast this since programs don't use state generics
    const sigma = this as unknown as Sigma<N, E, G>;
    this.edgePrograms[key] = new EdgeProgramClass(this.webGLContext!, null, sigma);
    // Register program type with bucket collection (stride will be set properly when used)
    this.itemBuckets.edges.registerProgram(key, 1);

    // Register edge label program if the edge program has one
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const LabelProgram = (EdgeProgramClass as any).LabelProgram;
    if (LabelProgram) {
      if (this.edgeLabelPrograms[key]) this.edgeLabelPrograms[key].kill();
      this.edgeLabelPrograms[key] = new LabelProgram(this.webGLContext!, null, sigma);
    }

    return this;
  }

  /**
   * Internal function used to initialize WebGL labels.
   * Sets up the SDF atlas and registers the default label program.
   */
  private initializeWebGLLabels(): void {
    // Create SDF Atlas Manager
    this.sdfAtlas = new SDFAtlasManager();

    // Register default font
    this.defaultFontKey = this.sdfAtlas.registerFont({
      family: "sans-serif",
      weight: "normal",
      style: "normal",
    });
  }

  /**
   * Internal function used to register a label program
   *
   * @param  {string}           key               - The program's key, matching the related labels "type" values.
   * @param  {LabelProgramType} LabelProgramClass - A labels program class.
   * @return {Sigma}
   */
  private registerLabelProgram(key: string, LabelProgramClass: LabelProgramType<N, E, G>): this {
    if (this.labelPrograms[key]) this.labelPrograms[key].kill();
    // Cast this since programs don't use state generics
    const sigma = this as unknown as Sigma<N, E, G>;
    this.labelPrograms[key] = new LabelProgramClass(this.webGLContext!, null, sigma);
    return this;
  }

  /**
   * Internal function used to register a backdrop program
   *
   * @param  {string}              key                  - The program's key, matching the related node "type" values.
   * @param  {BackdropProgramType} BackdropProgramClass - A backdrop program class.
   * @return {Sigma}
   */
  private registerBackdropProgram(key: string, BackdropProgramClass: BackdropProgramType<N, E, G>): this {
    if (this.backdropPrograms[key]) this.backdropPrograms[key].kill();
    // Cast this since programs don't use state generics
    const sigma = this as unknown as Sigma<N, E, G>;
    this.backdropPrograms[key] = new BackdropProgramClass(this.webGLContext!, null, sigma);
    return this;
  }

  /**
   * Method (re)binding WebGL textures and buffers for the picking framebuffer.
   * The picking framebuffer can be at reduced resolution for performance.
   *
   * @return {Sigma}
   */
  private resetWebGLTexture(): this {
    const gl = this.webGLContext!;

    if (!this.pickingFrameBuffer) return this;

    // Calculate picking texture size (can be reduced for performance)
    const pickingWidth = Math.ceil((this.width * this.pixelRatio) / this.settings.pickingDownSizingRatio);
    const pickingHeight = Math.ceil((this.height * this.pixelRatio) / this.settings.pickingDownSizingRatio);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.pickingFrameBuffer);

    // Update picking texture
    if (this.pickingTexture) gl.deleteTexture(this.pickingTexture);
    const pickingTexture = gl.createTexture();
    if (pickingTexture) {
      gl.bindTexture(gl.TEXTURE_2D, pickingTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, pickingWidth, pickingHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, pickingTexture, 0);
      this.pickingTexture = pickingTexture;
    }

    // Update depth buffer
    if (this.pickingDepthBuffer) gl.deleteRenderbuffer(this.pickingDepthBuffer);
    const depthBuffer = gl.createRenderbuffer();
    if (depthBuffer) {
      gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, pickingWidth, pickingHeight);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuffer);
      this.pickingDepthBuffer = depthBuffer;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return this;
  }

  /**
   * Method binding camera handlers.
   *
   * @return {Sigma}
   */
  private bindCameraHandlers(): this {
    this.activeListeners.camera = () => {
      this.scheduleRender();
    };

    this.camera.on("updated", this.activeListeners.camera);

    return this;
  }

  /**
   * Method unbinding camera handlers.
   *
   * @return {Sigma}
   */
  private unbindCameraHandlers(): this {
    this.camera.removeListener("updated", this.activeListeners.camera);
    return this;
  }

  /**
   * Method that returns the closest node to a given position.
   */
  private getNodeAtPosition(position: Coordinates): string | null {
    const { x, y } = position;
    const gl = this.webGLContext!;

    // Read from picking framebuffer (scaled by downSizingRatio)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.pickingFrameBuffer);

    const color = getPixelColor(
      gl,
      this.pickingFrameBuffer,
      x,
      y,
      this.pixelRatio,
      this.settings.pickingDownSizingRatio,
    );
    const index = colorToIndex(...color);
    const itemAt = this.itemIDsIndex[index];

    return itemAt && itemAt.type === "node" ? itemAt.id : null;
  }

  /**
   * Method binding event handlers.
   *
   * @return {Sigma}
   */
  private bindEventHandlers(): this {
    // Handling window resize
    this.activeListeners.handleResize = () => {
      // need to call a refresh to rebuild the labelgrid
      this.scheduleRefresh();
    };

    window.addEventListener("resize", this.activeListeners.handleResize);

    // Handling mouse move
    this.activeListeners.handleMove = (e: MouseCoords | TouchCoords): void => {
      const event = cleanMouseCoords(e);

      const baseEvent = {
        event,
        preventSigmaDefault(): void {
          event.preventSigmaDefault();
        },
      };

      const nodeToHover = this.getNodeAtPosition(event);
      if (nodeToHover && this.hoveredNode !== nodeToHover && !this.nodeDataCache[nodeToHover].hidden) {
        // Handling passing from one node to the other directly
        if (this.hoveredNode) {
          const previousNode = this.hoveredNode;
          this.hoveredNode = nodeToHover;
          this.setNodeState(previousNode, { isHovered: false } as Partial<NS>);
          this.emit("leaveNode", { ...baseEvent, node: previousNode });
        } else {
          this.hoveredNode = nodeToHover;
        }

        this.setNodeState(nodeToHover, { isHovered: true } as Partial<NS>);
        this.emit("enterNode", { ...baseEvent, node: nodeToHover });
        return;
      }

      // Checking if the hovered node is still hovered
      if (this.hoveredNode) {
        if (this.getNodeAtPosition(event) !== this.hoveredNode) {
          const node = this.hoveredNode;
          this.hoveredNode = null;
          this.setNodeState(node, { isHovered: false } as Partial<NS>);
          this.emit("leaveNode", { ...baseEvent, node });
          return;
        }
      }

      if (this.settings.enableEdgeEvents) {
        const edgeToHover = this.hoveredNode ? null : this.getEdgeAtPoint(baseEvent.event.x, baseEvent.event.y);

        if (edgeToHover !== this.hoveredEdge) {
          if (this.hoveredEdge) {
            this.setEdgeState(this.hoveredEdge, { isHovered: false } as Partial<ES>);
            this.emit("leaveEdge", { ...baseEvent, edge: this.hoveredEdge });
          }
          this.hoveredEdge = edgeToHover;
          if (edgeToHover) {
            this.setEdgeState(edgeToHover, { isHovered: true } as Partial<ES>);
            this.emit("enterEdge", { ...baseEvent, edge: edgeToHover });
          }
        }
      }
    };

    // Handling mouse move over body (only to dispatch the proper event):
    this.activeListeners.handleMoveBody = (e: MouseCoords | TouchCoords): void => {
      const event = cleanMouseCoords(e);

      this.emit("moveBody", {
        event,
        preventSigmaDefault(): void {
          event.preventSigmaDefault();
        },
      });
    };

    // Handling mouse leave stage:
    this.activeListeners.handleLeave = (e: MouseCoords | TouchCoords): void => {
      const event = cleanMouseCoords(e);

      const baseEvent = {
        event,
        preventSigmaDefault(): void {
          event.preventSigmaDefault();
        },
      };

      if (this.hoveredNode) {
        const node = this.hoveredNode;
        this.hoveredNode = null;
        this.setNodeState(node, { isHovered: false } as Partial<NS>);
        this.emit("leaveNode", { ...baseEvent, node });
      }

      if (this.settings.enableEdgeEvents && this.hoveredEdge) {
        const edge = this.hoveredEdge;
        this.hoveredEdge = null;
        this.setEdgeState(edge, { isHovered: false } as Partial<ES>);
        this.emit("leaveEdge", { ...baseEvent, edge });
      }

      this.emit("leaveStage", { ...baseEvent });
    };

    // Handling mouse enter stage:
    this.activeListeners.handleEnter = (e: MouseCoords | TouchCoords): void => {
      const event = cleanMouseCoords(e);

      const baseEvent = {
        event,
        preventSigmaDefault(): void {
          event.preventSigmaDefault();
        },
      };

      this.emit("enterStage", { ...baseEvent });
    };

    // Handling click
    const createInteractionListener = (eventType: MouseInteraction): ((e: MouseCoords | TouchCoords) => void) => {
      return (e) => {
        const event = cleanMouseCoords(e);

        const baseEvent = {
          event,
          preventSigmaDefault: () => {
            event.preventSigmaDefault();
          },
        };

        const nodeAtPosition = this.getNodeAtPosition(event);

        if (nodeAtPosition)
          return this.emit(`${eventType}Node`, {
            ...baseEvent,
            node: nodeAtPosition,
          });

        if (this.settings.enableEdgeEvents) {
          const edge = this.getEdgeAtPoint(event.x, event.y);
          if (edge) return this.emit(`${eventType}Edge`, { ...baseEvent, edge });
        }

        return this.emit(`${eventType}Stage`, baseEvent);
      };
    };

    this.activeListeners.handleClick = createInteractionListener("click");
    this.activeListeners.handleRightClick = createInteractionListener("rightClick");
    this.activeListeners.handleDoubleClick = createInteractionListener("doubleClick");
    this.activeListeners.handleWheel = createInteractionListener("wheel");
    this.activeListeners.handleDown = createInteractionListener("down");
    this.activeListeners.handleUp = createInteractionListener("up");

    this.mouseCaptor.on("mousemove", this.activeListeners.handleMove);
    this.mouseCaptor.on("mousemovebody", this.activeListeners.handleMoveBody);
    this.mouseCaptor.on("click", this.activeListeners.handleClick);
    this.mouseCaptor.on("rightClick", this.activeListeners.handleRightClick);
    this.mouseCaptor.on("doubleClick", this.activeListeners.handleDoubleClick);
    this.mouseCaptor.on("wheel", this.activeListeners.handleWheel);
    this.mouseCaptor.on("mousedown", this.activeListeners.handleDown);
    this.mouseCaptor.on("mouseup", this.activeListeners.handleUp);
    this.mouseCaptor.on("mouseleave", this.activeListeners.handleLeave);
    this.mouseCaptor.on("mouseenter", this.activeListeners.handleEnter);

    this.touchCaptor.on("touchdown", this.activeListeners.handleDown);
    this.touchCaptor.on("touchdown", this.activeListeners.handleMove);
    this.touchCaptor.on("touchup", this.activeListeners.handleUp);
    this.touchCaptor.on("touchmove", this.activeListeners.handleMove);
    this.touchCaptor.on("tap", this.activeListeners.handleClick);
    this.touchCaptor.on("doubletap", this.activeListeners.handleDoubleClick);
    this.touchCaptor.on("touchmove", this.activeListeners.handleMoveBody);

    return this;
  }

  /**
   * Method binding graph handlers
   *
   * @return {Sigma}
   */
  private bindGraphHandlers(): this {
    const graph = this.graph;

    const LAYOUT_IMPACTING_FIELDS = new Set(["x", "y", "zIndex", "type"]);
    this.activeListeners.eachNodeAttributesUpdatedGraphUpdate = (e: { hints?: { attributes?: string[] } }) => {
      const updatedFields = e.hints?.attributes;
      // we process all nodes
      this.graph.forEachNode((node) => this.updateNode(node));

      // if coord, type or zIndex have changed, we need to schedule a render
      // (zIndex for the programIndex)
      const layoutChanged = !updatedFields || updatedFields.some((f) => LAYOUT_IMPACTING_FIELDS.has(f));
      this.refresh({ partialGraph: { nodes: graph.nodes() }, skipIndexation: !layoutChanged, schedule: true });
    };

    this.activeListeners.eachEdgeAttributesUpdatedGraphUpdate = (e: { hints?: { attributes?: string[] } }) => {
      const updatedFields = e.hints?.attributes;
      // we process all edges
      this.graph.forEachEdge((edge) => this.updateEdge(edge));
      const layoutChanged = updatedFields && ["zIndex", "type"].some((f) => updatedFields?.includes(f));
      this.refresh({ partialGraph: { edges: graph.edges() }, skipIndexation: !layoutChanged, schedule: true });
    };

    // On add node, we add the node in indices and then call for a render
    this.activeListeners.addNodeGraphUpdate = (payload: { key: string }): void => {
      const node = payload.key;
      // we process the node
      this.addNode(node);
      // schedule a render for the node
      this.refresh({ partialGraph: { nodes: [node] }, skipIndexation: false, schedule: true });
    };

    // On update node, we update indices and then call for a render
    this.activeListeners.updateNodeGraphUpdate = (payload: { key: string }): void => {
      const node = payload.key;
      // schedule a render for the node
      this.refresh({ partialGraph: { nodes: [node] }, skipIndexation: false, schedule: true });
    };

    // On drop node, we remove the node from indices and then call for a refresh
    this.activeListeners.dropNodeGraphUpdate = (payload: { key: string }): void => {
      const node = payload.key;
      // we process the node
      this.removeNode(node);
      // schedule a render for everything
      this.refresh({ schedule: true });
    };

    // On add edge, we remove the edge from indices and then call for a refresh
    this.activeListeners.addEdgeGraphUpdate = (payload: { key: string }): void => {
      const edge = payload.key;
      // we process the edge
      this.addEdge(edge);
      // schedule a render for the edge
      this.refresh({ partialGraph: { edges: [edge] }, schedule: true });
    };

    // On update edge, we update indices and then call for a refresh
    this.activeListeners.updateEdgeGraphUpdate = (payload: { key: string }): void => {
      const edge = payload.key;
      // schedule a repaint for the edge
      this.refresh({ partialGraph: { edges: [edge] }, skipIndexation: false, schedule: true });
    };

    // On drop edge, we remove the edge from indices and then call for a refresh
    this.activeListeners.dropEdgeGraphUpdate = (payload: { key: string }): void => {
      const edge = payload.key;
      // we process the edge
      this.removeEdge(edge);
      // schedule a render for all edges
      this.refresh({ schedule: true });
    };

    // On clear edges, we clear the edge indices and then call for a refresh
    this.activeListeners.clearEdgesGraphUpdate = (): void => {
      // we clear the edge data structures
      this.clearEdgeState();
      this.clearEdgeIndices();
      // schedule a render for all edges
      this.refresh({ schedule: true });
    };

    // On graph clear, we clear indices and then call for a refresh
    this.activeListeners.clearGraphUpdate = (): void => {
      // clear graph state
      this.clearEdgeState();
      this.clearNodeState();

      // clear graph indices
      this.clearEdgeIndices();
      this.clearNodeIndices();

      // schedule a render for all
      this.refresh({ schedule: true });
    };

    graph.on("nodeAdded", this.activeListeners.addNodeGraphUpdate);
    graph.on("nodeDropped", this.activeListeners.dropNodeGraphUpdate);
    graph.on("nodeAttributesUpdated", this.activeListeners.updateNodeGraphUpdate);
    graph.on("eachNodeAttributesUpdated", this.activeListeners.eachNodeAttributesUpdatedGraphUpdate);
    graph.on("edgeAdded", this.activeListeners.addEdgeGraphUpdate);
    graph.on("edgeDropped", this.activeListeners.dropEdgeGraphUpdate);
    graph.on("edgeAttributesUpdated", this.activeListeners.updateEdgeGraphUpdate);
    graph.on("eachEdgeAttributesUpdated", this.activeListeners.eachEdgeAttributesUpdatedGraphUpdate);
    graph.on("edgesCleared", this.activeListeners.clearEdgesGraphUpdate);
    graph.on("cleared", this.activeListeners.clearGraphUpdate);

    return this;
  }

  /**
   * Method used to unbind handlers from the graph.
   *
   * @return {undefined}
   */
  private unbindGraphHandlers() {
    const graph = this.graph;

    graph.removeListener("nodeAdded", this.activeListeners.addNodeGraphUpdate);
    graph.removeListener("nodeDropped", this.activeListeners.dropNodeGraphUpdate);
    graph.removeListener("nodeAttributesUpdated", this.activeListeners.updateNodeGraphUpdate);
    graph.removeListener("eachNodeAttributesUpdated", this.activeListeners.eachNodeAttributesUpdatedGraphUpdate);
    graph.removeListener("edgeAdded", this.activeListeners.addEdgeGraphUpdate);
    graph.removeListener("edgeDropped", this.activeListeners.dropEdgeGraphUpdate);
    graph.removeListener("edgeAttributesUpdated", this.activeListeners.updateEdgeGraphUpdate);
    graph.removeListener("eachEdgeAttributesUpdated", this.activeListeners.eachEdgeAttributesUpdatedGraphUpdate);
    graph.removeListener("edgesCleared", this.activeListeners.clearEdgesGraphUpdate);
    graph.removeListener("cleared", this.activeListeners.clearGraphUpdate);
  }

  /**
   * Method looking for an edge colliding with a given point at (x, y). Returns
   * the key of the edge if any, or null else.
   */
  private getEdgeAtPoint(x: number, y: number): string | null {
    const gl = this.webGLContext!;

    // Read from picking framebuffer (scaled by downSizingRatio)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.pickingFrameBuffer);

    const color = getPixelColor(
      gl,
      this.pickingFrameBuffer,
      x,
      y,
      this.pixelRatio,
      this.settings.pickingDownSizingRatio,
    );
    const index = colorToIndex(...color);
    const itemAt = this.itemIDsIndex[index];

    return itemAt && itemAt.type === "edge" ? itemAt.id : null;
  }

  /**
   * Method used to process the whole graph's data.
   *  - extent
   *  - normalizationFunction
   *  - compute node's coordinate
   *  - labelgrid
   *  - program data allocation
   * @return {Sigma}
   */
  private process(): this {
    this.emit("beforeProcess");

    const graph = this.graph;
    const settings = this.settings;
    const dimensions = this.getDimensions();

    //
    // NODES
    //
    this.nodeExtent = graphExtent(this.graph);
    if (!this.settings.autoRescale) {
      const { width, height } = dimensions;
      const { x, y } = this.nodeExtent;

      this.nodeExtent = {
        x: [(x[0] + x[1]) / 2 - width / 2, (x[0] + x[1]) / 2 + width / 2],
        y: [(y[0] + y[1]) / 2 - height / 2, (y[0] + y[1]) / 2 + height / 2],
      };
    }

    this.normalizationFunction = createNormalizationFunction(this.customBBox || this.nodeExtent);

    // NOTE: it is important to compute this matrix after computing the node's extent
    // because #.getGraphDimensions relies on it
    const nullCamera = new Camera();
    const nullCameraMatrix = matrixFromCamera(
      nullCamera.getState(),
      dimensions,
      this.getGraphDimensions(),
      this.getStagePadding(),
    );
    // Resetting the label grid
    // TODO: it's probably better to do this explicitly or on resizes for layout and anims
    this.labelGrid.resizeAndClear(dimensions, settings.labelGridCellSize);

    const nodesPerPrograms: Record<string, number> = {};
    const nodeIndices: typeof this.nodeIndices = {};
    const edgeIndices: typeof this.edgeIndices = {};
    const itemIDsIndex: typeof this.itemIDsIndex = {};
    let incrID = 1;

    const nodes = graph.nodes();

    // Do some indexation on the whole graph
    for (let i = 0, l = nodes.length; i < l; i++) {
      const node = nodes[i];
      const data = this.nodeDataCache[node];

      // Get initial coordinates
      const attrs = graph.getNodeAttributes(node);
      data.x = attrs.x;
      data.y = attrs.y;
      this.normalizationFunction.applyTo(data);

      // labelgrid
      if (typeof data.label === "string" && !data.hidden)
        this.labelGrid.add(node, data.size, this.framedGraphToViewport(data, { matrix: nullCameraMatrix }));

      // update count per program
      nodesPerPrograms[data.type] = (nodesPerPrograms[data.type] || 0) + 1;
    }
    this.labelGrid.organize();

    // Allocate memory to programs
    for (const type in this.nodePrograms) {
      if (!hasOwnProperty.call(this.nodePrograms, type)) {
        throw new Error(`Sigma: could not find a suitable program for node type "${type}"!`);
      }
      this.nodePrograms[type].reallocate(nodesPerPrograms[type] || 0);
      // We reset that count here, so that we can reuse it while calling the Program#process methods:
      nodesPerPrograms[type] = 0;
    }

    // Update node data texture with position, size, and shape data
    // This must happen before addNodeToProgram so texture indices are available
    for (let i = 0, l = nodes.length; i < l; i++) {
      const node = nodes[i];
      const data = this.nodeDataCache[node];
      // Allocate texture index for this node (or get existing)
      this.nodeDataTexture!.allocateNode(node);

      // Get shape ID:
      // - For multi-shape programs: convert local index to global ID for edge clamping
      // - For single-shape programs: use global registry ID from slug
      let shapeId: number;
      const shapeMap = this.nodeTypeShapeMap[data.type];
      const globalIds = this.nodeTypeGlobalShapeIds[data.type];
      if (shapeMap && globalIds && data.shape && data.shape in shapeMap) {
        // Multi-shape program: convert local index to global ID
        const localIndex = shapeMap[data.shape];
        shapeId = globalIds[localIndex];
      } else {
        // Single-shape program or fallback: use global registry
        shapeId = getShapeId(data.shape || "circle");
      }

      // Update texture data (x, y, size, shapeId)
      this.nodeDataTexture!.updateNode(node, data.x, data.y, data.size, shapeId);
    }

    // Add data to programs using buckets (preserves zIndex ordering)
    const depthLayers = this.primitives?.depthLayers ?? [...DEFAULT_DEPTH_LAYERS];
    const maxDepthLevels = this.settings.maxDepthLevels;
    this.depthRanges.nodes = {};
    this.nodeBaseDepth = {};
    this.itemBuckets.nodes.forEachBucketByZIndex((programType, zIndex, bucket) => {
      const items = bucket.getItems();
      const nodeProgram = this.nodePrograms[programType];
      const depthIndex = Math.floor(zIndex / maxDepthLevels);
      const depth = depthLayers[depthIndex] ?? depthLayers[0];
      if (!this.depthRanges.nodes[depth]) this.depthRanges.nodes[depth] = {};
      if (!this.depthRanges.nodes[depth][programType])
        this.depthRanges.nodes[depth][programType] = [{ offset: nodesPerPrograms[programType], count: 0 }];
      const fragments = this.depthRanges.nodes[depth][programType];
      fragments[fragments.length - 1].count += items.size;
      for (const node of items) {
        this.nodeBaseDepth[node] = depth;
        nodeIndices[node] = incrID;
        itemIDsIndex[nodeIndices[node]] = { type: "node", id: node };
        incrID++;

        // Allocate node in the program's layer attribute texture
        nodeProgram.allocateNode?.(node);

        this.addNodeToProgram(node, nodeIndices[node], nodesPerPrograms[programType]++);
      }
    });

    //
    // EDGES
    //

    const edgesPerPrograms: Record<string, number> = {};
    const edges = graph.edges();

    // Allocate memory to programs
    for (let i = 0, l = edges.length; i < l; i++) {
      const edge = edges[i];
      const data = this.edgeDataCache[edge];
      edgesPerPrograms[data.type] = (edgesPerPrograms[data.type] || 0) + 1;
    }

    // Allocate memory to edge programs
    for (const type in this.edgePrograms) {
      if (!hasOwnProperty.call(this.edgePrograms, type)) {
        throw new Error(`Sigma: could not find a suitable program for edge type "${type}"!`);
      }
      this.edgePrograms[type].reallocate(edgesPerPrograms[type] || 0);
      // We reset that count here, so that we can reuse it while calling the Program#process methods:
      edgesPerPrograms[type] = 0;
    }

    // Add data to programs using buckets (preserves zIndex ordering)
    this.depthRanges.edges = {};
    this.edgeBaseDepth = {};
    this.itemBuckets.edges.forEachBucketByZIndex((programType, zIndex, bucket) => {
      const items = bucket.getItems();
      const depthIndex = Math.floor(zIndex / maxDepthLevels);
      const depth = depthLayers[depthIndex] ?? depthLayers[0];
      if (!this.depthRanges.edges[depth]) this.depthRanges.edges[depth] = {};
      if (!this.depthRanges.edges[depth][programType])
        this.depthRanges.edges[depth][programType] = [{ offset: edgesPerPrograms[programType], count: 0 }];
      const fragments = this.depthRanges.edges[depth][programType];
      fragments[fragments.length - 1].count += items.size;
      for (const edge of items) {
        this.edgeBaseDepth[edge] = depth;
        edgeIndices[edge] = incrID;
        itemIDsIndex[edgeIndices[edge]] = { type: "edge", id: edge };
        incrID++;

        this.addEdgeToProgram(edge, edgeIndices[edge], edgesPerPrograms[programType]++);
      }
    });

    this.itemIDsIndex = itemIDsIndex;
    this.nodeIndices = nodeIndices;
    this.edgeIndices = edgeIndices;

    //
    // WEBGL LABELS
    //
    this.processWebGLLabels(nodes);

    this.emit("afterProcess");
    return this;
  }

  /**
   * Pre-generate glyphs for all labels.
   * Actual label processing happens per-frame in renderWebGLLabels.
   * @private
   */
  private processWebGLLabels(nodes: string[]): void {
    // Collect all label texts for glyph pre-generation
    const labelTexts: string[] = [];
    for (let i = 0, l = nodes.length; i < l; i++) {
      const node = nodes[i];
      const data = this.nodeDataCache[node];

      if (data.hidden || !data.label) continue;
      labelTexts.push(data.label);
    }

    // Ensure all glyphs are generated (this is the expensive part we want to do once)
    for (const type in this.labelPrograms) {
      const program = this.labelPrograms[type];
      if (program.ensureGlyphsReady) {
        program.ensureGlyphsReady(labelTexts);
      }
    }
  }

  /**
   * Get the label color for a node.
   * TODO: This should be integrated into the styles system.
   * @private
   */
  private getLabelColor(_data: NodeDisplayData): string {
    return "#000";
  }

  private getDepthOffset(depth: string): number {
    const depthLayers = this.primitives?.depthLayers ?? [...DEFAULT_DEPTH_LAYERS];
    const idx = depthLayers.indexOf(depth);
    return (idx >= 0 ? idx : 0) * this.settings.maxDepthLevels;
  }

  /**
   * Update depth ranges when a node moves between depth layers without
   * reprocessing the program array.
   */
  private updateNodeDepthRanges(key: string, oldDepth: string, newDepth: string): void {
    const programType = this.nodeDataCache[key].type;
    const position = this.nodeProgramIndex[key];
    if (position === undefined) return;
    removePositionFromDepthRanges(this.depthRanges.nodes, oldDepth, programType, position);
    addPositionToDepthRanges(this.depthRanges.nodes, newDepth, programType, position);
  }

  /**
   * Update depth ranges when an edge moves between depth layers without
   * reprocessing the program array.
   */
  private updateEdgeDepthRanges(key: string, oldDepth: string, newDepth: string): void {
    const programType = this.edgeDataCache[key].type;
    const position = this.edgeProgramIndex[key];
    if (position === undefined) return;
    removePositionFromDepthRanges(this.depthRanges.edges, oldDepth, programType, position);
    addPositionToDepthRanges(this.depthRanges.edges, newDepth, programType, position);
  }

  /**
   * Method that backports potential settings updates where it's needed.
   * @private
   */
  private handleSettingsUpdate(oldSettings?: Settings): this {
    const settings = this.settings;

    this.camera.minRatio = settings.minCameraRatio;
    this.camera.maxRatio = settings.maxCameraRatio;
    this.camera.enabledZooming = settings.enableCameraZooming;
    this.camera.enabledPanning = settings.enableCameraPanning;
    this.camera.enabledRotation = settings.enableCameraRotation;
    if (settings.cameraPanBoundaries) {
      this.camera.clean = (state) =>
        this.cleanCameraState(
          state,
          settings.cameraPanBoundaries && typeof settings.cameraPanBoundaries === "object"
            ? settings.cameraPanBoundaries
            : {},
        );
    } else {
      this.camera.clean = null;
    }
    this.camera.setState(this.camera.validateState(this.camera.getState()));

    if (oldSettings) {
      // Check maxDepthLevels:
      if (oldSettings.maxDepthLevels !== settings.maxDepthLevels) {
        const numDepthLayers = (this.primitives?.depthLayers ?? [...DEFAULT_DEPTH_LAYERS]).length;
        this.itemBuckets.nodes.setMaxDepthLevels(numDepthLayers * settings.maxDepthLevels);
        this.itemBuckets.edges.setMaxDepthLevels(numDepthLayers * settings.maxDepthLevels);
        // Mark need to reprocess since bucket structure changed
        this.needToProcess = true;
      }
    }

    // Update captors settings:
    this.mouseCaptor.setSettings(this.settings);
    this.touchCaptor.setSettings(this.settings);

    return this;
  }

  private cleanCameraState(
    state: CameraState,
    { tolerance = 0, boundaries }: { tolerance?: number; boundaries?: Record<"x" | "y", [number, number]> } = {},
  ): CameraState {
    const newState = { ...state };

    // Extract necessary properties
    const {
      x: [xMinGraph, xMaxGraph],
      y: [yMinGraph, yMaxGraph],
    } = boundaries || this.nodeExtent;

    // Transform the four corners of the graph rectangle using the provided camera state
    const corners = [
      this.graphToViewport({ x: xMinGraph, y: yMinGraph }, { cameraState: state }),
      this.graphToViewport({ x: xMaxGraph, y: yMinGraph }, { cameraState: state }),
      this.graphToViewport({ x: xMinGraph, y: yMaxGraph }, { cameraState: state }),
      this.graphToViewport({ x: xMaxGraph, y: yMaxGraph }, { cameraState: state }),
    ];

    // Look for new extents, based on these four corners
    let xMin = Infinity,
      xMax = -Infinity,
      yMin = Infinity,
      yMax = -Infinity;
    corners.forEach(({ x, y }) => {
      xMin = Math.min(xMin, x);
      xMax = Math.max(xMax, x);
      yMin = Math.min(yMin, y);
      yMax = Math.max(yMax, y);
    });

    // For each dimension, constraint the smaller element (camera or graph) to fit in the larger one:
    const graphWidth = xMax - xMin;
    const graphHeight = yMax - yMin;
    const { width, height } = this.getDimensions();
    let dx = 0;
    let dy = 0;

    if (graphWidth >= width) {
      if (xMax < width - tolerance) dx = xMax - (width - tolerance);
      else if (xMin > tolerance) dx = xMin - tolerance;
    } else {
      if (xMax > width + tolerance) dx = xMax - (width + tolerance);
      else if (xMin < -tolerance) dx = xMin + tolerance;
    }
    if (graphHeight >= height) {
      if (yMax < height - tolerance) dy = yMax - (height - tolerance);
      else if (yMin > tolerance) dy = yMin - tolerance;
    } else {
      if (yMax > height + tolerance) dy = yMax - (height + tolerance);
      else if (yMin < -tolerance) dy = yMin + tolerance;
    }

    if (dx || dy) {
      // Transform [dx, dy] from viewport to graph (using two different point to transform that vector):
      const origin = this.viewportToFramedGraph({ x: 0, y: 0 }, { cameraState: state });
      const delta = this.viewportToFramedGraph({ x: dx, y: dy }, { cameraState: state });
      dx = delta.x - origin.x;
      dy = delta.y - origin.y;
      newState.x += dx;
      newState.y += dy;
    }

    return newState;
  }

  /**
   * Method used to render labels.
   * WebGL labels are now forced on - they are rendered before the blit in render().
   *
   * @return {Sigma}
   */
  private renderLabels(): this {
    // WebGL labels are rendered before the blit in render(), so nothing to do here
    return this;
  }

  /**
   * Method used to render WebGL labels to the MRT framebuffer.
   * Called from render() before the blit, so labels are included in the single blit.
   *
   * This method processes only visible labels each frame, using LabelGrid for
   * density-based selection. Only visible labels are written to GPU buffers.
   *
   * @param params - Render parameters
   */
  private renderWebGLLabels(params: RenderParams, depth?: string): void {
    const cameraState = this.camera.getState();

    // Compute viewport bounds in framed graph coordinates for early rejection
    // We add margins and compute min/max for axis-aligned bounds
    const topLeft = this.viewportToFramedGraph({ x: -X_LABEL_MARGIN, y: -Y_LABEL_MARGIN });
    const topRight = this.viewportToFramedGraph({ x: this.width + X_LABEL_MARGIN, y: -Y_LABEL_MARGIN });
    const bottomLeft = this.viewportToFramedGraph({ x: -X_LABEL_MARGIN, y: this.height + Y_LABEL_MARGIN });
    const bottomRight = this.viewportToFramedGraph({ x: this.width + X_LABEL_MARGIN, y: this.height + Y_LABEL_MARGIN });

    // Get axis-aligned bounding box in framed graph space (handles rotation)
    const graphMinX = Math.min(topLeft.x, topRight.x, bottomLeft.x, bottomRight.x);
    const graphMaxX = Math.max(topLeft.x, topRight.x, bottomLeft.x, bottomRight.x);
    const graphMinY = Math.min(topLeft.y, topRight.y, bottomLeft.y, bottomRight.y);
    const graphMaxY = Math.max(topLeft.y, topRight.y, bottomLeft.y, bottomRight.y);

    // Compute viewport bounds in "null camera space" for LabelGrid query
    // LabelGrid stores positions using framedGraphToViewport with nullCameraMatrix
    // We need to transform current viewport corners: viewport -> framedGraph -> nullCameraViewport
    const nullCameraMatrix = matrixFromCamera(
      { x: 0.5, y: 0.5, ratio: 1, angle: 0 },
      this.getDimensions(),
      this.getGraphDimensions(),
      this.getStagePadding(),
    );
    const toNullCameraViewport = (framedGraphPos: Coordinates): Coordinates => {
      const viewportPos = multiplyVec2(nullCameraMatrix, framedGraphPos);
      return {
        x: ((1 + viewportPos.x) * this.width) / 2,
        y: ((1 - viewportPos.y) * this.height) / 2,
      };
    };

    // Transform the framed graph bounds to null camera viewport space
    const nc1 = toNullCameraViewport({ x: graphMinX, y: graphMinY });
    const nc2 = toNullCameraViewport({ x: graphMaxX, y: graphMinY });
    const nc3 = toNullCameraViewport({ x: graphMinX, y: graphMaxY });
    const nc4 = toNullCameraViewport({ x: graphMaxX, y: graphMaxY });

    const gridViewport = {
      x1: Math.min(nc1.x, nc2.x, nc3.x, nc4.x),
      y1: Math.min(nc1.y, nc2.y, nc3.y, nc4.y),
      x2: Math.max(nc1.x, nc2.x, nc3.x, nc4.x),
      y2: Math.max(nc1.y, nc2.y, nc3.y, nc4.y),
    };

    // Selecting labels to draw using LabelGrid with viewport culling
    const labelsToDisplay = this.labelGrid.getLabelsToDisplay(
      cameraState.ratio,
      this.settings.labelDensity,
      gridViewport,
    );
    extend(labelsToDisplay, this.nodesWithForcedLabels);

    // Collect visible nodes after viewport/threshold culling
    const visibleNodes: string[] = [];

    for (let i = 0, l = labelsToDisplay.length; i < l; i++) {
      const node = labelsToDisplay[i];
      const data = this.nodeDataCache[node];

      if (this.displayedNodeLabels.has(node)) continue;
      if (depth && data.labelDepth !== depth) continue;
      if (data.hidden) continue;
      if (!data.label) continue;

      // Early rejection in framed graph coordinates (cheap - no matrix multiply)
      // data.x and data.y are already in framed graph space after normalization
      if (data.x < graphMinX || data.x > graphMaxX || data.y < graphMinY || data.y > graphMaxY) continue;

      const { x, y } = this.framedGraphToViewport(data);
      const size = this.scaleSize(data.size);

      if (!data.forceLabel && size < this.settings.labelRenderedSizeThreshold) continue;

      if (
        x < -X_LABEL_MARGIN ||
        x > this.width + X_LABEL_MARGIN ||
        y < -Y_LABEL_MARGIN ||
        y > this.height + Y_LABEL_MARGIN
      )
        continue;

      this.displayedNodeLabels.add(node);
      visibleNodes.push(node);
    }

    // Count characters per label program type
    const charactersPerProgram: Record<string, number> = {};
    for (let i = 0, l = visibleNodes.length; i < l; i++) {
      const node = visibleNodes[i];
      const data = this.nodeDataCache[node];
      const labelType = this.labelPrograms[data.type] ? data.type : "default";
      charactersPerProgram[labelType] = (charactersPerProgram[labelType] || 0) + data.label!.length;
    }

    // Reallocate label programs based on visible character counts
    for (const type in this.labelPrograms) {
      this.labelPrograms[type].reallocate(charactersPerProgram[type] || 0);
    }

    // Process each visible label into its matching program's buffer
    // TODO: These defaults should come from the styles system
    const defaultLabelSize = 14;
    const defaultLabelMargin = this.primitives?.nodes?.label?.margin ?? 5;
    const defaultLabelPosition = "right" as const;

    const characterOffsets: Record<string, number> = {};
    for (let i = 0, l = visibleNodes.length; i < l; i++) {
      const node = visibleNodes[i];
      const data = this.nodeDataCache[node];

      const labelType = this.labelPrograms[data.type] ? data.type : "default";
      const labelProgram = this.labelPrograms[labelType];
      if (!labelProgram) continue;

      // Build label display data
      const labelData: LabelDisplayData = {
        text: data.label!,
        x: data.x,
        y: data.y,
        size: data.labelSize ?? defaultLabelSize,
        color: this.getLabelColor(data),
        nodeSize: data.size,
        margin: defaultLabelMargin,
        position: data.labelPosition ?? defaultLabelPosition,
        hidden: false,
        forceLabel: data.forceLabel ?? false,
        type: labelType,
        zIndex: data.zIndex ?? 0,
        parentType: "node",
        parentKey: node,
        fontKey: "", // Empty means default font
        nodeIndex: this.nodeDataTexture!.getNodeIndex(node),
      };

      // Process label in its matching program
      const offset = characterOffsets[labelType] || 0;
      const charsProcessed = labelProgram.processLabel(node, offset, labelData);
      characterOffsets[labelType] = offset + charsProcessed;
    }

    // Render WebGL labels (programs handle two-pass rendering internally)
    for (const type in this.labelPrograms) {
      this.labelPrograms[type].render(params);
    }
  }

  /**
   * Method used to render backdrops (background + shadow) behind nodes with labels.
   * Called from render() before nodes are drawn, so backdrops appear behind.
   *
   * @private
   */
  private renderBackdrops(params: RenderParams, depth?: string): void {
    // Group nodes by their program type
    const nodesByType: Record<string, string[]> = {};

    for (const key of this.nodesWithBackdrop) {
      const data = this.nodeDataCache[key];
      if (!data || data.hidden) continue;
      if (depth && data.depth !== depth) continue;

      const type = data.type || "default";
      if (!nodesByType[type]) nodesByType[type] = [];
      nodesByType[type].push(key);
    }

    // Render backdrops for each program type
    for (const type in nodesByType) {
      const program = this.backdropPrograms[type];
      if (!program) continue;

      const nodes = nodesByType[type];
      program.reallocate(nodes.length);

      for (let i = 0; i < nodes.length; i++) {
        const key = nodes[i];
        const data = this.nodeDataCache[key];

        // Get label dimensions using canvas context (matches label rendering)
        const labelSize = data.labelSize ?? 14;
        const labelFont = "sans-serif";
        let labelWidth = 0;
        let labelHeight = 0;
        if (data.label) {
          const context = this.canvasContexts.labels;
          context.font = `normal ${labelSize}px ${labelFont}`;
          const textWidth = context.measureText(data.label).width;
          // Match original canvas hover: boxWidth = textWidth + 5, boxHeight = labelSize + 4
          labelWidth = Math.round(textWidth + 5);
          labelHeight = Math.round(labelSize + 4);
        }

        // Get shapeId
        const shapeMap = this.nodeTypeShapeMap[type];
        const globalIds = this.nodeTypeGlobalShapeIds[type];
        let shapeId: number;
        if (shapeMap && globalIds) {
          const localIndex = shapeMap[data.shape || Object.keys(shapeMap)[0]];
          shapeId = globalIds[localIndex];
        } else {
          shapeId = getShapeId(data.shape || "circle");
        }

        // Compute backdrop values only when the program uses per-node attributes
        // When useBackdropAttributes is false, the shader uses uniforms and ignores these values
        const ProgramClass = program.constructor as { useBackdropAttributes?: boolean };
        let backdropColor: [number, number, number, number] = [0, 0, 0, 0];
        let backdropShadowColor: [number, number, number, number] = [0, 0, 0, 0];
        let backdropShadowBlur = 0;
        let backdropPadding = 0;

        if (ProgramClass.useBackdropAttributes) {
          const rawBgColor = data.backdropColor ? colorToArray(data.backdropColor) : [255, 255, 255, 255];
          const rawShadowColor = data.backdropShadowColor
            ? colorToArray(data.backdropShadowColor)
            : [0, 0, 0, 128];
          backdropColor = rawBgColor.map((c) => c / 255) as [number, number, number, number];
          backdropShadowColor = rawShadowColor.map((c) => c / 255) as [number, number, number, number];
          backdropShadowBlur = data.backdropShadowBlur ?? 12;
          backdropPadding = data.backdropPadding ?? 6;
        }

        const backdropData: BackdropDisplayData = {
          key,
          x: data.x,
          y: data.y,
          size: data.size,
          label: data.label,
          labelWidth,
          labelHeight,
          type,
          shapeId,
          position: data.labelPosition || "right",
          backdropColor,
          backdropShadowColor,
          backdropShadowBlur,
          backdropPadding,
        };

        program.processBackdrop(i, backdropData);
      }

      program.render(params);
    }
  }

  /**
   * Method used to render edge labels using WebGL.
   * Called from render() before nodes are drawn, so edge labels appear under nodes.
   *
   * @private
   */
  private renderEdgeLabelsWebGL(params: RenderParams, depth?: string): void {
    this.renderEdgeLabelsInternal(params, depth);
  }

  /**
   * Method used to render edge labels using WebGL (SDF-based),
   * based on which node labels were rendered.
   * Now just a no-op since edge labels are rendered in renderEdgeLabelsWebGL.
   *
   * @return {Sigma}
   */
  private renderEdgeLabels(): this {
    // Edge labels are now rendered in renderEdgeLabelsWebGL() in the render loop
    return this;
  }

  /**
   * Internal method that does the actual edge label rendering.
   * Called by renderEdgeLabelsWebGL.
   *
   * @private
   */
  private renderEdgeLabelsInternal(params: RenderParams, depth?: string): void {
    if (!this.settings.renderEdgeLabels) return;

    // Build highlighted nodes set from state
    const highlightedNodes = new Set<string>();
    for (const [key, state] of this.nodeStates) {
      if (state.isHighlighted) highlightedNodes.add(key);
    }

    const edgeLabelsToDisplay = edgeLabelsToDisplayFromNodes({
      graph: this.graph,
      hoveredNode: this.hoveredNode,
      displayedNodeLabels: this.displayedNodeLabels,
      highlightedNodes,
    });
    extend(edgeLabelsToDisplay, this.edgesWithForcedLabels);
    // Clear the canvas layer (we're using WebGL instead)
    const context = this.canvasContexts.edgeLabels;
    context.clearRect(0, 0, this.width, this.height);

    const displayedLabels = new Set<string>();

    // Count characters per edge label program type
    const charactersPerProgram: Record<string, number> = {};
    const edgesToProcess: Array<{
      edge: string;
      type: string;
      sourceData: NodeDisplayData;
      targetData: NodeDisplayData;
      edgeData: EdgeDisplayData;
      sourceKey: string;
      targetKey: string;
    }> = [];

    for (let i = 0, l = edgeLabelsToDisplay.length; i < l; i++) {
      const edge = edgeLabelsToDisplay[i];
      if (displayedLabels.has(edge)) continue;

      const extremities = this.graph.extremities(edge),
        sourceData = this.nodeDataCache[extremities[0]],
        targetData = this.nodeDataCache[extremities[1]],
        edgeData = this.edgeDataCache[edge];

      if (edgeData.hidden || sourceData.hidden || targetData.hidden) {
        continue;
      }

      if (depth && edgeData.labelDepth !== depth) continue;
      if (!edgeData.label) continue;

      // Use the edge's type to find the matching label program
      const labelType = this.edgeLabelPrograms[edgeData.type] ? edgeData.type : "default";
      if (!this.edgeLabelPrograms[labelType]) continue;

      charactersPerProgram[labelType] = (charactersPerProgram[labelType] || 0) + edgeData.label.length;
      edgesToProcess.push({
        edge,
        type: labelType,
        sourceData,
        targetData,
        edgeData,
        sourceKey: extremities[0],
        targetKey: extremities[1],
      });
      displayedLabels.add(edge);
    }

    // Reallocate edge label programs based on visible character counts
    for (const type in this.edgeLabelPrograms) {
      this.edgeLabelPrograms[type].reallocate(charactersPerProgram[type] || 0);
    }

    // Process each visible edge label into its matching program's buffer
    // TODO: These defaults should come from the styles system
    const defaultEdgeLabelSize = 12;
    const defaultEdgeLabelMargin = this.primitives?.edges?.label?.margin ?? 5;
    const defaultEdgeLabelPosition = "over" as const;
    const defaultEdgeLabelColor = "#000";

    const characterOffsets: Record<string, number> = {};
    for (const { edge, type, sourceData, targetData, edgeData, sourceKey, targetKey } of edgesToProcess) {
      const labelProgram = this.edgeLabelPrograms[type];
      if (!labelProgram) continue;

      // Get node texture indices for source and target nodes
      const sourceNodeIndex = this.nodeDataTexture!.getNodeIndex(sourceKey);
      const targetNodeIndex = this.nodeDataTexture!.getNodeIndex(targetKey);

      // Get edge texture index (already allocated in addEdgeToProgram)
      const edgeIndex = this.edgeDataTexture!.getEdgeIndex(edge);

      // Build edge label display data
      const labelData: import("./types").EdgeLabelDisplayData = {
        text: edgeData.label!,
        x: (sourceData.x + targetData.x) / 2,
        y: (sourceData.y + targetData.y) / 2,
        size: defaultEdgeLabelSize,
        color: defaultEdgeLabelColor,
        nodeSize: 0, // Not applicable for edge labels (use sourceSize/targetSize instead)
        nodeIndex: -1, // Not applicable for edge labels (use sourceNodeIndex/targetNodeIndex instead)
        margin: defaultEdgeLabelMargin,
        position: edgeData.labelPosition ?? defaultEdgeLabelPosition,
        hidden: false,
        forceLabel: edgeData.forceLabel ?? false,
        type,
        zIndex: edgeData.zIndex ?? 0,
        parentType: "edge",
        parentKey: edge,
        fontKey: "", // Empty means default font
        // Edge-specific fields
        sourceX: sourceData.x,
        sourceY: sourceData.y,
        targetX: targetData.x,
        targetY: targetData.y,
        sourceSize: sourceData.size,
        targetSize: targetData.size,
        sourceShape: sourceData.shape || "circle",
        targetShape: targetData.shape || "circle",
        edgeSize: edgeData.size,
        offset: 0, // Computed by GPU based on position mode
        curvature: (edgeData as unknown as { curvature?: number }).curvature || 0,
        // Node texture indices for GPU-side lookup
        sourceNodeIndex,
        targetNodeIndex,
        // Edge texture index for GPU-side lookup (shared data: thickness, curvature, head/tail ratios)
        edgeIndex,
      };

      // Process label in its matching program
      const offset = characterOffsets[type] || 0;
      const charsProcessed = labelProgram.processEdgeLabel(edge, offset, labelData);
      characterOffsets[type] = offset + charsProcessed;
    }

    // Render WebGL edge labels
    for (const type in this.edgeLabelPrograms) {
      this.edgeLabelPrograms[type].render(params);
    }

    this.displayedEdgeLabels = displayedLabels;
  }

  /**
   * Method used to render.
   *
   * @return {Sigma}
   */
  private render(): this {
    this.emit("beforeRender");

    const exitRender = () => {
      this.emit("afterRender");
      return this;
    };

    // If a render was scheduled, we cancel it
    if (this.renderFrame) {
      cancelAnimationFrame(this.renderFrame);
      this.renderFrame = null;
    }

    // First we need to resize
    this.resize();

    // Do we need to reprocess data?
    if (this.needToProcess) {
      this.process();
      this.needToRefreshState = false;
    }
    this.needToProcess = false;

    // Do we need to refresh state (styles in-place, no reprocess)?
    if (this.needToRefreshState) this.refreshState();
    this.needToRefreshState = false;

    // Clearing the canvases
    this.clear();

    // Prepare the picking texture
    this.resetWebGLTexture();

    // If we have no nodes we can stop right there
    if (!this.graph.order) return exitRender();

    // TODO: improve this heuristic or move to the captor itself?
    // TODO: deal with the touch captor here as well
    const mouseCaptor = this.mouseCaptor;
    const moving =
      this.camera.isAnimated() ||
      mouseCaptor.isMoving ||
      mouseCaptor.draggedEvents ||
      mouseCaptor.currentWheelDirection;

    // Then we need to extract a matrix from the camera
    const cameraState = this.camera.getState();
    const viewportDimensions = this.getDimensions();
    const graphDimensions = this.getGraphDimensions();
    const padding = this.getStagePadding();
    this.matrix = matrixFromCamera(cameraState, viewportDimensions, graphDimensions, padding);
    this.invMatrix = matrixFromCamera(cameraState, viewportDimensions, graphDimensions, padding, true);
    this.correctionRatio = getMatrixImpact(this.matrix, cameraState, viewportDimensions);
    this.graphToViewportRatio = this.getGraphToViewportRatio();

    // [jacomyal]
    // This comment is related to the one above the `getMatrixImpact` definition:
    // - `this.correctionRatio` is somehow not completely explained
    // - `this.graphToViewportRatio` is the ratio of a distance in the viewport divided by the same distance in the
    //   graph
    // - `this.normalizationFunction.ratio` is basically `Math.max(graphDX, graphDY)`
    // And now, I observe that if I multiply these three ratios, I have something constant, which value remains 2, even
    // when I change the graph, the viewport or the camera. It might be useful later, so I prefer to let this comment:
    // console.log(this.graphToViewportRatio * this.correctionRatio * this.normalizationFunction.ratio * 2);

    const params: RenderParams = this.getRenderParams();

    const gl = this.webGLContext!;

    // Clear the picking framebuffer (two-pass rendering: programs render to picking first, then to screen)
    const pickingWidth = Math.ceil((this.width * this.pixelRatio) / this.settings.pickingDownSizingRatio);
    const pickingHeight = Math.ceil((this.height * this.pixelRatio) / this.settings.pickingDownSizingRatio);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.pickingFrameBuffer);
    gl.viewport(0, 0, pickingWidth, pickingHeight);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Clear the main canvas
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width * this.pixelRatio, this.height * this.pixelRatio);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Upload data textures (must upload both before binding to avoid texture unit conflicts)
    this.nodeDataTexture!.upload();
    this.edgeDataTexture!.upload();

    // Upload layer attribute textures for all node programs
    for (const type in this.nodePrograms) {
      this.nodePrograms[type].uploadLayerTexture?.();
    }

    // Upload path attribute textures for all edge programs
    for (const type in this.edgePrograms) {
      (this.edgePrograms[type] as unknown as { uploadAttributeTexture?: () => void }).uploadAttributeTexture?.();
    }

    // Bind data textures to their respective texture units
    this.nodeDataTexture!.bind(NODE_DATA_TEXTURE_UNIT);
    this.edgeDataTexture!.bind(EDGE_DATA_TEXTURE_UNIT);

    // Render all items depth by depth (depth layers control draw order)
    this.displayedNodeLabels = new Set();
    const depthLayers = this.primitives?.depthLayers ?? [...DEFAULT_DEPTH_LAYERS];
    for (const depth of depthLayers) {
      // Edge programs in this depth
      const edgeRanges = this.depthRanges.edges[depth];
      if (edgeRanges && (!this.settings.hideEdgesOnMove || !moving)) {
        for (const type in edgeRanges) {
          for (const { offset, count } of edgeRanges[type]) {
            if (count > 0) this.edgePrograms[type].render(params, offset, count);
          }
        }
      }

      // Edge labels for this depth
      if (this.settings.renderEdgeLabels && (!this.settings.hideLabelsOnMove || !moving)) {
        this.renderEdgeLabelsWebGL(params, depth);
      }

      // Backdrops for nodes in this depth (before node programs so they appear behind)
      this.renderBackdrops(params, depth);

      // Node programs in this depth
      const nodeRanges = this.depthRanges.nodes[depth];
      if (nodeRanges) {
        for (const type in nodeRanges) {
          for (const { offset, count } of nodeRanges[type]) {
            if (count > 0) this.nodePrograms[type].render(params, offset, count);
          }
        }
      }

      // Node labels for this depth
      if (this.settings.renderLabels) {
        this.renderWebGLLabels(params, depth);
      }
    }

    // If DEBUG_displayPickingLayer is enabled, blit picking framebuffer to screen
    if (this.settings.DEBUG_displayPickingLayer) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.pickingFrameBuffer);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      gl.blitFramebuffer(
        0,
        0,
        pickingWidth,
        pickingHeight,
        0,
        0,
        this.width * this.pixelRatio,
        this.height * this.pixelRatio,
        gl.COLOR_BUFFER_BIT,
        gl.NEAREST,
      );
    }

    // Do not display labels on move per setting
    if (this.settings.hideLabelsOnMove && moving) return exitRender();

    this.renderLabels();
    this.renderEdgeLabels();

    return exitRender();
  }

  /**
   * Add a node in the internal data structures.
   * @private
   * @param key The node's graphology ID
   */
  private addNode(key: string): void {
    const attrs = this.graph.getNodeAttributes(key);
    const nodeState = this.getNodeState(key);

    // Compute display data from styles (always defined, defaults to DEFAULT_STYLES)
    const resolvedStyle = evaluateNodeStyle(
      this.stylesDeclaration!.nodes as Record<string, unknown>,
      attrs,
      nodeState,
      this.graphState,
      this.graph,
    );

    let data: NodeDisplayData = {
      x: resolvedStyle.x ?? (attrs.x as number),
      y: resolvedStyle.y ?? (attrs.y as number),
      size: resolvedStyle.size ?? 2,
      color: resolvedStyle.color ?? "#666",
      label: resolvedStyle.label ?? null,
      hidden: resolvedStyle.visibility === "hidden",
      forceLabel: resolvedStyle.labelVisibility === "visible",
      highlighted: nodeState.isHighlighted,
      zIndex: resolvedStyle.zIndex ?? 0,
      type: "default",
      depth: resolvedStyle.depth ?? "nodes",
      labelDepth: resolvedStyle.labelDepth ?? "nodeLabels",
      shape: resolvedStyle.shape,
      labelPosition: resolvedStyle.labelPosition,
      labelSize: resolvedStyle.labelSize,
      backdropColor: resolvedStyle.backdropColor,
      backdropShadowColor: resolvedStyle.backdropShadowColor,
      backdropShadowBlur: resolvedStyle.backdropShadowBlur,
      backdropPadding: resolvedStyle.backdropPadding,
    };

    // Validate position
    if (typeof data.x !== "number" || typeof data.y !== "number") {
      throw new Error(
        `Sigma: could not find a valid position (x, y) for node "${key}". All your nodes must have a number "x" and "y".`,
      );
    }

    // Apply reducer if provided
    if (this.nodeReducer) {
      const reduced = this.nodeReducer(key, data, attrs, nodeState, this.graphState, this.graph);
      data = { ...data, ...reduced };
    }

    // Set shape for edge clamping and multi-shape program selection
    // For multi-shape programs: preserve user-specified shape attribute if it's valid
    // For single-shape programs: set to the program's shape slug
    const shapeMap = this.nodeTypeShapeMap[data.type];
    if (shapeMap) {
      // Multi-shape program: use user-specified shape if valid, otherwise use first shape
      if (!data.shape || !(data.shape in shapeMap)) {
        // Default to first shape name (the first key in shapeNameToIndex)
        data.shape = Object.keys(shapeMap)[0];
      }
      // For edge clamping, we also need the slug for the shape registry lookup
      // Use the primary slug (first shape) for now - edges will use this for clamping
    } else if (this.nodeTypeShapeCache[data.type]) {
      // Single-shape program: use the program's shape slug
      data.shape = this.nodeTypeShapeCache[data.type];
    }

    // Inject declared variables from primitives into display data
    // Variables can come from: styles > graph attributes > default value
    const mutableData = data as unknown as Record<string, unknown>;
    for (const [varName, varDef] of Object.entries(this.nodeVariables)) {
      mutableData[varName] = resolvedStyle[varName] ?? attrs[varName] ?? varDef.default;
    }

    this.nodeDataCache[key] = data;

    // Label:
    // We delete and add if needed because this function is also used from
    // update
    this.nodesWithForcedLabels.delete(key);
    if (data.forceLabel && !data.hidden) this.nodesWithForcedLabels.add(key);

    // Backdrop visibility tracking:
    // Check if backdrop is visible by parsing colors and checking alpha
    this.nodesWithBackdrop.delete(key);
    if (!data.hidden) {
      const bgAlpha = data.backdropColor ? colorToArray(data.backdropColor)[3] : 0;
      const shadowAlpha = data.backdropShadowColor ? colorToArray(data.backdropShadowColor)[3] : 0;
      const hasVisibleBackdrop = bgAlpha > 0 || (shadowAlpha > 0 && (data.backdropShadowBlur ?? 0) > 0);
      if (hasVisibleBackdrop) this.nodesWithBackdrop.add(key);
    }

    // Bucket management for depth ordering (depth encoded into zIndex range)
    const newZIndex = this.getDepthOffset(data.depth) +
      Math.max(0, Math.min(this.settings.maxDepthLevels - 1, Math.floor(data.zIndex)));
    const oldZIndex = this.zIndexCache.nodes[key];

    if (oldZIndex !== undefined && oldZIndex !== newZIndex) {
      this.itemBuckets.nodes.moveItem(data.type, oldZIndex, data.type, newZIndex, key);
    } else if (oldZIndex === undefined) {
      this.itemBuckets.nodes.addItem(data.type, newZIndex, key);
    } else {
      this.itemBuckets.nodes.updateItem(data.type, newZIndex, key);
    }
    this.zIndexCache.nodes[key] = newZIndex;
  }

  /**
   * Update a node the internal data structures.
   * @private
   * @param key The node's graphology ID
   */
  private updateNode(key: string): void {
    this.addNode(key);

    // Re-apply normalization on the node
    const data = this.nodeDataCache[key];
    this.normalizationFunction.applyTo(data);
  }

  /**
   * Remove a node from the internal data structures.
   * @private
   * @param key The node's graphology ID
   */
  private removeNode(key: string): void {
    // Remove from bucket
    const data = this.nodeDataCache[key];
    if (data) {
      const zIndex = this.zIndexCache.nodes[key];
      if (zIndex !== undefined) {
        this.itemBuckets.nodes.removeItem(data.type, zIndex, key);
        delete this.zIndexCache.nodes[key];
      }
    }
    // Remove from node cache
    delete this.nodeDataCache[key];
    // Remove from node program index
    delete this.nodeProgramIndex[key];
    // Remove from node state
    this.nodeStates.delete(key);
    // Remove from hovered
    if (this.hoveredNode === key) this.hoveredNode = null;
    // Remove from forced label
    this.nodesWithForcedLabels.delete(key);
    // Remove from backdrop tracking
    this.nodesWithBackdrop.delete(key);
  }

  /**
   * Add an edge into the internal data structures.
   * @private
   * @param key The edge's graphology ID
   */
  private addEdge(key: string): void {
    const attrs = this.graph.getEdgeAttributes(key);
    const edgeState = this.getEdgeState(key);

    // Compute display data from styles (always defined, defaults to DEFAULT_STYLES)
    const resolvedStyle = evaluateEdgeStyle(
      this.stylesDeclaration!.edges as Record<string, unknown>,
      attrs,
      edgeState,
      this.graphState,
      this.graph,
    );

    let data: EdgeDisplayData = {
      size: resolvedStyle.size ?? 0.5,
      color: resolvedStyle.color ?? "#ccc",
      label: resolvedStyle.label ?? "",
      hidden: resolvedStyle.visibility === "hidden",
      forceLabel: resolvedStyle.labelVisibility === "visible",
      zIndex: resolvedStyle.zIndex ?? 0,
      type: "default",
      depth: resolvedStyle.depth ?? "edges",
      labelDepth: resolvedStyle.labelDepth ?? "edgeLabels",
      path: resolvedStyle.path,
      head: resolvedStyle.head,
      tail: resolvedStyle.tail,
      labelPosition:
        typeof resolvedStyle.labelPosition === "string"
          ? (resolvedStyle.labelPosition as EdgeLabelPosition)
          : undefined,
    };

    // Apply reducer if provided
    if (this.edgeReducer) {
      const reduced = this.edgeReducer(key, data, attrs, edgeState, this.graphState, this.graph);
      data = { ...data, ...reduced };
    }

    // Inject declared variables from primitives into display data
    // Variables can come from: styles > graph attributes > default value
    for (const [varName, varDef] of Object.entries(this.edgeVariables)) {
      (data as unknown as Record<string, unknown>)[varName] =
        resolvedStyle[varName] ?? attrs[varName] ?? varDef.default;
    }

    this.edgeDataCache[key] = data;

    // Forced label
    // we filter and re push if needed because this function is also used from
    // update
    this.edgesWithForcedLabels.delete(key);
    if (data.forceLabel && !data.hidden) this.edgesWithForcedLabels.add(key);

    // Bucket management for depth ordering (depth encoded into zIndex range)
    const newZIndex = this.getDepthOffset(data.depth) +
      Math.max(0, Math.min(this.settings.maxDepthLevels - 1, Math.floor(data.zIndex)));
    const oldZIndex = this.zIndexCache.edges[key];

    if (oldZIndex !== undefined && oldZIndex !== newZIndex) {
      this.itemBuckets.edges.moveItem(data.type, oldZIndex, data.type, newZIndex, key);
    } else if (oldZIndex === undefined) {
      this.itemBuckets.edges.addItem(data.type, newZIndex, key);
    } else {
      this.itemBuckets.edges.updateItem(data.type, newZIndex, key);
    }
    this.zIndexCache.edges[key] = newZIndex;
  }

  /**
   * Update an edge in the internal data structures.
   * @private
   * @param key The edge's graphology ID
   */
  private updateEdge(key: string): void {
    this.addEdge(key);
  }

  /**
   * Remove an edge from the internal data structures.
   * @private
   * @param key The edge's graphology ID
   */
  private removeEdge(key: string): void {
    // Remove from bucket
    const data = this.edgeDataCache[key];
    if (data) {
      const zIndex = this.zIndexCache.edges[key];
      if (zIndex !== undefined) {
        this.itemBuckets.edges.removeItem(data.type, zIndex, key);
        delete this.zIndexCache.edges[key];
      }
    }
    // Remove from edge cache
    delete this.edgeDataCache[key];
    // Remove from programId index
    delete this.edgeProgramIndex[key];
    // Free edge from edge data texture
    this.edgeDataTexture!.freeEdge(key);
    // Remove from edge state
    this.edgeStates.delete(key);
    // Remove from hovered
    if (this.hoveredEdge === key) this.hoveredEdge = null;
    // Remove from forced label
    this.edgesWithForcedLabels.delete(key);
  }

  /**
   * Clear all indices related to nodes.
   * @private
   */
  private clearNodeIndices(): void {
    // LabelGrid & nodeExtent are only manage/populated in the process function
    this.labelGrid = new LabelGrid();
    this.nodeExtent = { x: [0, 1], y: [0, 1] };
    this.nodeDataCache = {};
    this.edgeProgramIndex = {};
    this.nodesWithForcedLabels = new Set<string>();
    this.nodesWithBackdrop = new Set<string>();
    // Clear bucket data
    this.itemBuckets.nodes.clearAll();
    this.zIndexCache.nodes = {};
    this.depthRanges.nodes = {};
    this.nodeBaseDepth = {};
  }

  /**
   * Clear all indices related to edges.
   * @private
   */
  private clearEdgeIndices(): void {
    this.edgeDataCache = {};
    this.edgeProgramIndex = {};
    this.edgesWithForcedLabels = new Set<string>();
    // Clear bucket data
    this.itemBuckets.edges.clearAll();
    this.zIndexCache.edges = {};
    this.depthRanges.edges = {};
    this.edgeBaseDepth = {};
  }

  /**
   * Clear all indices.
   * @private
   */
  private clearIndices(): void {
    this.clearEdgeIndices();
    this.clearNodeIndices();
  }

  /**
   * Clear all graph state related to nodes.
   * @private
   */
  private clearNodeState(): void {
    this.displayedNodeLabels = new Set();
    this.nodeStates.clear();
    this.hoveredNode = null;
    this.nodesWithBackdrop.clear();
  }

  /**
   * Clear all graph state related to edges.
   * @private
   */
  private clearEdgeState(): void {
    this.displayedEdgeLabels = new Set();
    this.edgeStates.clear();
    this.hoveredEdge = null;
  }

  /**
   * Clear all graph state.
   * @private
   */
  private clearState(): void {
    this.clearEdgeState();
    this.clearNodeState();
    this.graphState = createGraphState<GS>();
  }

  /**
   * Add the node data to its program.
   * @private
   * @param node The node's graphology ID
   * @param fingerprint A fingerprint used to identity the node with picking
   * @param position The index where to place the node in the program
   */
  private addNodeToProgram(node: string, fingerprint: number, position: number): void {
    const data = this.nodeDataCache[node];
    const nodeProgram = this.nodePrograms[data.type];
    if (!nodeProgram) throw new Error(`Sigma: could not find a suitable program for node type "${data.type}"!`);
    // Get the node's texture index (already allocated during processing)
    const textureIndex = this.nodeDataTexture!.getNodeIndex(node);
    nodeProgram.process(fingerprint, position, data, textureIndex, node);
    // Saving program index
    this.nodeProgramIndex[node] = position;
  }

  /**
   * Add the edge data to its program.
   * @private
   * @param edge The edge's graphology ID
   * @param fingerprint A fingerprint used to identity the edge with picking
   * @param position The index where to place the edge in the program
   */
  private addEdgeToProgram(edge: string, fingerprint: number, position: number): void {
    const data = this.edgeDataCache[edge];
    const edgeProgram = this.edgePrograms[data.type];
    if (!edgeProgram) throw new Error(`Sigma: could not find a suitable program for edge type "${data.type}"!`);
    const extremities = this.graph.extremities(edge),
      sourceData = this.nodeDataCache[extremities[0]],
      targetData = this.nodeDataCache[extremities[1]];

    // Get node texture indices for source and target
    const sourceNodeIndex = this.nodeDataTexture!.getNodeIndex(extremities[0]);
    const targetNodeIndex = this.nodeDataTexture!.getNodeIndex(extremities[1]);

    // Allocate edge in edge data texture (or get existing allocation)
    const edgeTextureIndex = this.edgeDataTexture!.allocateEdge(edge);

    // Get program class static properties from registered program instance
    const edgeProgramInstance = this.edgePrograms[data.type];
    const programStatic = edgeProgramInstance?.constructor as unknown as {
      programOptions?: { extremities?: Array<{ name: string; length: number }> };
      pathNameToIndex?: Record<string, number>;
      extremityNameToIndex?: Record<string, number>;
      defaultHeadIndex?: number;
      defaultTailIndex?: number;
    };

    const pathNameToIndex = programStatic.pathNameToIndex;
    const extremityNameToIndex = programStatic.extremityNameToIndex;
    const extremitiesPool = programStatic.programOptions?.extremities;

    // Start with program defaults
    let pathId = 0;
    let headId = programStatic.defaultHeadIndex ?? 0;
    let tailId = programStatic.defaultTailIndex ?? 0;

    // Get edge-specified path/head/tail names
    const edgeData = data as unknown as { path?: string; head?: string; tail?: string };

    // Override path index if edge specifies one
    if (edgeData.path && pathNameToIndex?.[edgeData.path] !== undefined) {
      pathId = pathNameToIndex[edgeData.path];
    }

    // Override head index if edge specifies one
    if (edgeData.head && extremityNameToIndex?.[edgeData.head] !== undefined) {
      headId = extremityNameToIndex[edgeData.head];
    }

    // Override tail index if edge specifies one
    if (edgeData.tail && extremityNameToIndex?.[edgeData.tail] !== undefined) {
      tailId = extremityNameToIndex[edgeData.tail];
    }

    // Get length ratios from the resolved extremities
    const headLengthRatio = extremitiesPool?.[headId]?.length ?? 0;
    const tailLengthRatio = extremitiesPool?.[tailId]?.length ?? 0;

    // Update edge data texture with core edge data
    // Path-specific attributes (curvature, etc.) are stored in EdgePathAttributeTexture
    this.edgeDataTexture!.updateEdge(
      edge,
      sourceNodeIndex,
      targetNodeIndex,
      data.size,
      headLengthRatio,
      tailLengthRatio,
      pathId,
      headId,
      tailId,
    );

    edgeProgram.process(fingerprint, position, sourceData, targetData, data, edgeTextureIndex);
    // Saving program index
    this.edgeProgramIndex[edge] = position;
  }

  /**---------------------------------------------------------------------------
   * Public API.
   **---------------------------------------------------------------------------
   */

  /**
   * Function used to get the render params.
   *
   * @return {RenderParams}
   */
  getRenderParams(): RenderParams {
    return {
      matrix: this.matrix,
      invMatrix: this.invMatrix,
      width: this.width,
      height: this.height,
      pixelRatio: this.pixelRatio,
      zoomRatio: this.camera.ratio,
      cameraAngle: this.camera.angle,
      sizeRatio: 1 / this.scaleSize(),
      correctionRatio: this.correctionRatio,
      downSizingRatio: this.settings.pickingDownSizingRatio,
      minEdgeThickness: this.settings.minEdgeThickness,
      antiAliasingFeather: this.settings.antiAliasingFeather,
      nodeDataTextureUnit: NODE_DATA_TEXTURE_UNIT,
      nodeDataTextureWidth: this.nodeDataTexture!.getTextureWidth(),
      edgeDataTextureUnit: EDGE_DATA_TEXTURE_UNIT,
      edgeDataTextureWidth: this.edgeDataTexture!.getTextureWidth(),
      pickingFrameBuffer: this.pickingFrameBuffer,
    };
  }

  /**
   * Function used to retrieve the actual stage padding value.
   *
   * @return {number}
   */
  getStagePadding(): number {
    const { stagePadding, autoRescale } = this.settings;
    return autoRescale ? stagePadding || 0 : 0;
  }

  /**
   * Function used to create a layer element.
   *
   * @param {string} id - Context's id.
   * @param {string} tag - The HTML tag to use.
   * @param options
   * @return {Sigma}
   */
  createLayer<T extends HTMLElement>(
    id: string,
    tag: string,
    options: { style?: Partial<CSSStyleDeclaration> } & ({ beforeLayer?: string } | { afterLayer?: string }) = {},
  ): T {
    if (this.elements[id]) throw new Error(`Sigma: a layer named "${id}" already exists`);

    const element = createElement<T>(
      tag,
      {
        position: "absolute",
      },
      {
        class: `sigma-${id}`,
      },
    );

    if (options.style) Object.assign(element.style, options.style);

    this.elements[id] = element;

    if ("beforeLayer" in options && options.beforeLayer) {
      this.elements[options.beforeLayer].before(element);
    } else if ("afterLayer" in options && options.afterLayer) {
      this.elements[options.afterLayer].after(element);
    } else {
      this.container.appendChild(element);
    }

    return element;
  }

  /**
   * Function used to create a canvas element.
   *
   * @param {string} id - Context's id.
   * @param options
   * @return {Sigma}
   */
  createCanvas(
    id: string,
    options: { style?: Partial<CSSStyleDeclaration> } & ({ beforeLayer?: string } | { afterLayer?: string }) = {},
  ): HTMLCanvasElement {
    return this.createLayer(id, "canvas", options);
  }

  /**
   * Function used to create a canvas context and add the relevant DOM elements.
   *
   * @param  {string} id - Context's id.
   * @param  options
   * @return {Sigma}
   */
  createCanvasContext(id: string, options: { style?: Partial<CSSStyleDeclaration> } = {}): this {
    const canvas = this.createCanvas(id, options);

    const contextOptions = {
      preserveDrawingBuffer: false,
      antialias: false,
    };

    this.canvasContexts[id] = canvas.getContext("2d", contextOptions) as CanvasRenderingContext2D;

    return this;
  }

  /**
   * Function used to create a WebGL 2 context and add the relevant DOM
   * elements.
   *
   * @param  {string}  id      - Context's id.
   * @param  {object?} options - #getContext params to override (optional)
   * @return {WebGL2RenderingContext}
   */
  createWebGLContext(
    id: string,
    options: {
      preserveDrawingBuffer?: boolean;
      antialias?: boolean;
      hidden?: boolean;
      picking?: boolean;
    } & ({ canvas?: HTMLCanvasElement; style?: undefined } | { style?: CSSStyleDeclaration; canvas?: undefined }) = {},
  ): WebGL2RenderingContext {
    const canvas = options?.canvas || this.createCanvas(id, options);
    if (options.hidden) canvas.remove();

    const contextOptions = {
      preserveDrawingBuffer: false,
      antialias: false,
      depth: true,
      ...options,
    };

    // Request WebGL 2 context
    const context = canvas.getContext("webgl2", contextOptions);

    if (!context) {
      throw new Error(
        "Sigma: WebGL 2 is not supported by your browser. " +
          "Please use a modern browser (Chrome 56+, Firefox 51+, Safari 15+, Edge 79+).",
      );
    }

    const gl = context as WebGL2RenderingContext;

    // Store as main WebGL context if this is the stage
    if (id === "stage") {
      this.webGLContext = gl;
    }

    // Blending:
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    // Create picking framebuffer for two-pass rendering
    if (options.picking) {
      const frameBuffer = gl.createFramebuffer();
      if (!frameBuffer) throw new Error(`Sigma: cannot create picking frame buffer`);

      gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer);

      // Create picking texture for IDs (single attachment, no blending needed)
      const pickingTexture = gl.createTexture();
      if (!pickingTexture) throw new Error(`Sigma: cannot create picking texture`);
      gl.bindTexture(gl.TEXTURE_2D, pickingTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      // NEAREST filtering for exact pixel reads (no interpolation)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, pickingTexture, 0);

      // Create depth buffer for proper depth testing during picking
      const depthBuffer = gl.createRenderbuffer();
      if (!depthBuffer) throw new Error(`Sigma: cannot create picking depth buffer`);
      gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, 1, 1);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuffer);

      // Verify framebuffer is complete
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error(`Sigma: picking framebuffer is not complete`);
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      this.pickingFrameBuffer = frameBuffer;
      this.pickingTexture = pickingTexture;
      this.pickingDepthBuffer = depthBuffer;
    }

    return gl;
  }

  /**
   * Function used to properly kill a layer.
   *
   * @param  {string} id - Layer id.
   * @return {Sigma}
   */
  killLayer(id: string): this {
    const element = this.elements[id];

    if (!element) throw new Error(`Sigma: cannot kill layer ${id}, which does not exist`);

    if (id === "stage" && this.webGLContext) {
      this.webGLContext.getExtension("WEBGL_lose_context")?.loseContext();
      this.webGLContext = null;
    } else if (this.canvasContexts[id]) {
      delete this.canvasContexts[id];
    }

    // Delete layer element
    element.remove();
    delete this.elements[id];

    return this;
  }

  /**
   * Method returning the renderer's camera.
   *
   * @return {Camera}
   */
  getCamera(): Camera {
    return this.camera;
  }

  /**
   * Method setting the renderer's camera.
   *
   * @param  {Camera} camera - New camera.
   * @return {Sigma}
   */
  setCamera(camera: Camera): void {
    this.unbindCameraHandlers();
    this.camera = camera;
    this.bindCameraHandlers();
  }

  /**
   * Method returning the container DOM element.
   *
   * @return {HTMLElement}
   */
  getContainer(): HTMLElement {
    return this.container;
  }

  /**
   * Method returning the renderer's graph.
   *
   * @return {Graph}
   */
  getGraph(): Graph<N, E, G> {
    return this.graph;
  }

  /**
   * Method used to set the renderer's graph.
   *
   * @return {Graph}
   */
  setGraph(graph: Graph<N, E, G>): void {
    if (graph === this.graph) return;

    // Check hoveredNode and hoveredEdge
    if (this.hoveredNode && !graph.hasNode(this.hoveredNode)) this.hoveredNode = null;
    if (this.hoveredEdge && !graph.hasEdge(this.hoveredEdge)) this.hoveredEdge = null;

    // Unbinding handlers on the current graph
    this.unbindGraphHandlers();

    if (this.checkEdgesEventsFrame !== null) {
      cancelAnimationFrame(this.checkEdgesEventsFrame);
      this.checkEdgesEventsFrame = null;
    }

    // Installing new graph
    this.graph = graph;

    // Binding new handlers
    this.bindGraphHandlers();

    // Re-rendering now to avoid discrepancies from now to next frame
    this.refresh();
  }

  /**
   * Method returning the mouse captor.
   *
   * @return {MouseCaptor}
   */
  getMouseCaptor(): MouseCaptor<N, E, G> {
    return this.mouseCaptor;
  }

  /**
   * Method returning the touch captor.
   *
   * @return {TouchCaptor}
   */
  getTouchCaptor(): TouchCaptor<N, E, G> {
    return this.touchCaptor;
  }

  /**
   * Method returning the current renderer's dimensions.
   *
   * @return {Dimensions}
   */
  getDimensions(): Dimensions {
    return { width: this.width, height: this.height };
  }

  /**
   * Method returning the current graph's dimensions.
   *
   * @return {Dimensions}
   */
  getGraphDimensions(): Dimensions {
    const extent = this.customBBox || this.nodeExtent;

    return {
      width: extent.x[1] - extent.x[0] || 1,
      height: extent.y[1] - extent.y[0] || 1,
    };
  }

  /**
   * Method used to get all the sigma node attributes.
   * It's useful for example to get the position of a node
   * and to get values that are set by the nodeReducer
   *
   * @param  {string} key - The node's key.
   * @return {NodeDisplayData | undefined} A copy of the desired node's attribute or undefined if not found
   */
  getNodeDisplayData(key: unknown): NodeDisplayData | undefined {
    const node = this.nodeDataCache[key as string];
    return node ? Object.assign({}, node) : undefined;
  }

  /**
   * Method used to get all the sigma edge attributes.
   * It's useful for example to get values that are set by the edgeReducer.
   *
   * @param  {string} key - The edge's key.
   * @return {EdgeDisplayData | undefined} A copy of the desired edge's attribute or undefined if not found
   */
  getEdgeDisplayData(key: unknown): EdgeDisplayData | undefined {
    const edge = this.edgeDataCache[key as string];
    return edge ? Object.assign({}, edge) : undefined;
  }

  /**
   * =========================================================================
   * STATE MANAGEMENT API
   * =========================================================================
   */

  /**
   * Method returning a node's state.
   *
   * @param  {string} key - The node's key.
   * @return {NS} The node's state.
   */
  getNodeState(key: string): NS {
    let state = this.nodeStates.get(key);
    if (!state) {
      state = createNodeState<NS>();
      this.nodeStates.set(key, state);
    }
    return state;
  }

  /**
   * Method returning an edge's state.
   *
   * @param  {string} key - The edge's key.
   * @return {ES} The edge's state.
   */
  getEdgeState(key: string): ES {
    let state = this.edgeStates.get(key);
    if (!state) {
      state = createEdgeState<ES>();
      this.edgeStates.set(key, state);
    }
    return state;
  }

  /**
   * Method returning the graph's state.
   *
   * @return {GS} The graph's state.
   */
  getGraphState(): GS {
    return this.graphState;
  }

  /**
   * Method to update a node's state.
   *
   * @param  {string} key - The node's key.
   * @param  {Partial<NS>} state - Partial state to merge.
   * @return {this}
   */
  setNodeState(key: string, state: Partial<NS>): this {
    const currentState = this.getNodeState(key);
    const newState = { ...currentState, ...state } as NS;
    this.nodeStates.set(key, newState);

    // Update hovered node tracking for event system
    this.updateHoveredNodeTracking(key, currentState, newState);

    // Update graph state flags
    this.updateGraphStateFromNodes();

    // Re-evaluate styles in-place (no reprocess)
    this.scheduleStateRefresh();

    return this;
  }

  /**
   * Method to update an edge's state.
   *
   * @param  {string} key - The edge's key.
   * @param  {Partial<ES>} state - Partial state to merge.
   * @return {this}
   */
  setEdgeState(key: string, state: Partial<ES>): this {
    const currentState = this.getEdgeState(key);
    const newState = { ...currentState, ...state } as ES;
    this.edgeStates.set(key, newState);

    // Update hovered edge tracking for event system
    this.updateHoveredEdgeTracking(key, currentState, newState);

    // Update graph state flags
    this.updateGraphStateFromEdges();

    // Re-evaluate styles in-place (no reprocess)
    this.scheduleStateRefresh();

    return this;
  }

  /**
   * Method to update the graph's state.
   *
   * @param  {Partial<GS>} state - Partial state to merge.
   * @return {this}
   */
  setGraphState(state: Partial<GS>): this {
    this.graphState = { ...this.graphState, ...state } as GS;

    // Re-evaluate styles in-place (no reprocess)
    this.scheduleStateRefresh();

    return this;
  }

  /**
   * Method to update multiple nodes' states at once.
   *
   * @param  {string[]} keys - The nodes' keys.
   * @param  {Partial<NS>} state - Partial state to merge.
   * @return {this}
   */
  setNodesState(keys: string[], state: Partial<NS>): this {
    for (const key of keys) {
      const currentState = this.getNodeState(key);
      const newState = { ...currentState, ...state } as NS;
      this.nodeStates.set(key, newState);
      this.updateHoveredNodeTracking(key, currentState, newState);
    }

    // Update graph state flags once
    this.updateGraphStateFromNodes();

    // Re-evaluate styles in-place (no reprocess)
    this.scheduleStateRefresh();

    return this;
  }

  /**
   * Method to update multiple edges' states at once.
   *
   * @param  {string[]} keys - The edges' keys.
   * @param  {Partial<ES>} state - Partial state to merge.
   * @return {this}
   */
  setEdgesState(keys: string[], state: Partial<ES>): this {
    for (const key of keys) {
      const currentState = this.getEdgeState(key);
      const newState = { ...currentState, ...state } as ES;
      this.edgeStates.set(key, newState);
      this.updateHoveredEdgeTracking(key, currentState, newState);
    }

    // Update graph state flags once
    this.updateGraphStateFromEdges();

    // Re-evaluate styles in-place (no reprocess)
    this.scheduleStateRefresh();

    return this;
  }

  /**
   * Update hovered node tracking for event system (enter/leave events).
   */
  private updateHoveredNodeTracking(key: string, oldState: NS, newState: NS): void {
    if (oldState.isHovered !== newState.isHovered) {
      if (newState.isHovered) {
        // Clear previous hovered node if any
        if (this.hoveredNode && this.hoveredNode !== key) {
          const prevState = this.getNodeState(this.hoveredNode);
          this.nodeStates.set(this.hoveredNode, { ...prevState, isHovered: false } as NS);
        }
        this.hoveredNode = key;
      } else if (this.hoveredNode === key) {
        this.hoveredNode = null;
      }
    }
  }

  /**
   * Update hovered edge tracking for event system (enter/leave events).
   */
  private updateHoveredEdgeTracking(key: string, oldState: ES, newState: ES): void {
    if (oldState.isHovered !== newState.isHovered) {
      if (newState.isHovered) {
        // Clear previous hovered edge if any
        if (this.hoveredEdge && this.hoveredEdge !== key) {
          const prevState = this.getEdgeState(this.hoveredEdge);
          this.edgeStates.set(this.hoveredEdge, { ...prevState, isHovered: false } as ES);
        }
        this.hoveredEdge = key;
      } else if (this.hoveredEdge === key) {
        this.hoveredEdge = null;
      }
    }
  }

  /**
   * Update graph state flags based on node states.
   */
  private updateGraphStateFromNodes(): void {
    let hasHovered = false;
    let hasHighlighted = false;

    for (const [, state] of this.nodeStates) {
      if (state.isHovered) hasHovered = true;
      if (state.isHighlighted) hasHighlighted = true;
      if (hasHovered && hasHighlighted) break;
    }

    // Also check edges for hover
    if (!hasHovered && this.hoveredEdge) hasHovered = true;

    this.graphState = {
      ...this.graphState,
      hasHovered,
      hasHighlighted,
    } as GS;
  }

  /**
   * Update graph state flags based on edge states.
   */
  private updateGraphStateFromEdges(): void {
    let hasHovered = this.hoveredNode !== null;

    if (!hasHovered) {
      for (const [, state] of this.edgeStates) {
        if (state.isHovered) {
          hasHovered = true;
          break;
        }
      }
    }

    this.graphState = {
      ...this.graphState,
      hasHovered,
    } as GS;
  }

  /**
   * Method used to get the set of currently displayed node labels.
   *
   * @return {Set<string>} A set of node keys whose label is displayed.
   */
  getNodeDisplayedLabels(): Set<string> {
    return new Set(this.displayedNodeLabels);
  }

  /**
   * Method used to get the set of currently displayed edge labels.
   *
   * @return {Set<string>} A set of edge keys whose label is displayed.
   */
  getEdgeDisplayedLabels(): Set<string> {
    return new Set(this.displayedEdgeLabels);
  }

  /**
   * Method returning a copy of the settings collection.
   *
   * @return {Settings} A copy of the settings collection.
   */
  getSettings(): Settings {
    return { ...this.settings };
  }

  /**
   * Method returning the current value for a given setting key.
   *
   * @param  {string} key - The setting key to get.
   * @return {any} The value attached to this setting key or undefined if not found
   */
  getSetting<K extends keyof Settings>(key: K): Settings[K] {
    return this.settings[key];
  }

  /**
   * Method setting the value of a given setting key. Note that this will schedule
   * a new render next frame.
   *
   * @param  {string} key - The setting key to set.
   * @param  {any}    value - The value to set.
   * @return {Sigma}
   */
  setSetting<K extends keyof Settings>(key: K, value: Settings[K]): this {
    const oldValues = { ...this.settings };
    this.settings[key] = value;
    validateSettings(this.settings);
    this.handleSettingsUpdate(oldValues);
    this.scheduleRefresh();
    return this;
  }

  /**
   * Method updating the value of a given setting key using the provided function.
   * Note that this will schedule a new render next frame.
   *
   * @param  {string}   key     - The setting key to set.
   * @param  {function} updater - The update function.
   * @return {Sigma}
   */
  updateSetting<K extends keyof Settings>(key: K, updater: (value: Settings[K]) => Settings[K]): this {
    this.setSetting(key, updater(this.settings[key]));
    return this;
  }

  /**
   * Method setting multiple settings at once.
   *
   * @param  {Partial<Settings>} settings - The settings to set.
   * @return {Sigma}
   */
  setSettings(settings: Partial<Settings>): this {
    const oldValues = { ...this.settings };
    this.settings = { ...this.settings, ...settings };
    validateSettings(this.settings);
    this.handleSettingsUpdate(oldValues);
    this.scheduleRefresh();
    return this;
  }

  /**
   * Method used to resize the renderer.
   *
   * @param  {boolean} force - If true, then resize is processed even if size is unchanged (optional).
   * @return {Sigma}
   */
  resize(force?: boolean): this {
    const previousWidth = this.width,
      previousHeight = this.height;

    this.width = this.container.offsetWidth;
    this.height = this.container.offsetHeight;
    this.pixelRatio = getPixelRatio();

    if (this.width === 0) {
      if (this.settings.allowInvalidContainer) this.width = 1;
      else
        throw new Error(
          "Sigma: Container has no width. You can set the allowInvalidContainer setting to true to stop seeing this error.",
        );
    }

    if (this.height === 0) {
      if (this.settings.allowInvalidContainer) this.height = 1;
      else
        throw new Error(
          "Sigma: Container has no height. You can set the allowInvalidContainer setting to true to stop seeing this error.",
        );
    }

    // If nothing has changed, we can stop right here
    if (!force && previousWidth === this.width && previousHeight === this.height) return this;

    // Sizing dom elements
    for (const id in this.elements) {
      const element = this.elements[id];

      element.style.width = this.width + "px";
      element.style.height = this.height + "px";
    }

    // Sizing canvas contexts
    for (const id in this.canvasContexts) {
      this.elements[id].setAttribute("width", this.width * this.pixelRatio + "px");
      this.elements[id].setAttribute("height", this.height * this.pixelRatio + "px");

      if (this.pixelRatio !== 1) this.canvasContexts[id].scale(this.pixelRatio, this.pixelRatio);
    }

    // Sizing WebGL context
    if (this.webGLContext) {
      this.elements.stage.setAttribute("width", this.width * this.pixelRatio + "px");
      this.elements.stage.setAttribute("height", this.height * this.pixelRatio + "px");

      this.webGLContext.viewport(0, 0, this.width * this.pixelRatio, this.height * this.pixelRatio);
    }

    this.emit("resize");

    return this;
  }

  /**
   * Method used to clear all the canvases.
   *
   * @return {Sigma}
   */
  clear(): this {
    this.emit("beforeClear");

    this.webGLContext!.bindFramebuffer(WebGLRenderingContext.FRAMEBUFFER, null);
    this.webGLContext!.clear(WebGLRenderingContext.COLOR_BUFFER_BIT);
    this.canvasContexts.labels.clearRect(0, 0, this.width, this.height);
    this.canvasContexts.edgeLabels.clearRect(0, 0, this.width, this.height);

    this.emit("afterClear");
    return this;
  }

  /**
   * Schedule a state-only refresh: re-evaluate all styles in-place without
   * rebuilding program arrays. Depth changes are handled via fragmented ranges.
   */
  private scheduleStateRefresh(): void {
    this.needToRefreshState = true;
    this.scheduleRender();
  }

  /**
   * Re-evaluate all item styles in-place. Called from render() when
   * needToRefreshState is set.
   */
  private refreshState(): void {
    const graph = this.graph;

    // Re-evaluate all nodes
    graph.forEachNode((node) => {
      const oldDepth = this.nodeDataCache[node]?.depth;
      this.updateNode(node);
      const data = this.nodeDataCache[node];

      // Update node data texture (size may change on hover)
      let shapeId: number;
      const shapeMap = this.nodeTypeShapeMap[data.type];
      const globalIds = this.nodeTypeGlobalShapeIds[data.type];
      if (shapeMap && globalIds && data.shape && data.shape in shapeMap) {
        shapeId = globalIds[shapeMap[data.shape]];
      } else {
        shapeId = getShapeId(data.shape || "circle");
      }
      this.nodeDataTexture!.updateNode(node, data.x, data.y, data.size, shapeId);

      // Update fragmented depth ranges if depth changed
      if (oldDepth && data.depth !== oldDepth) {
        this.updateNodeDepthRanges(node, oldDepth, data.depth);
      }

      // Rewrite data at existing position
      const programIndex = this.nodeProgramIndex[node];
      if (programIndex !== undefined) {
        this.addNodeToProgram(node, this.nodeIndices[node], programIndex);
      }
    });

    // Re-evaluate all edges
    graph.forEachEdge((edge) => {
      const oldDepth = this.edgeDataCache[edge]?.depth;
      this.updateEdge(edge);
      const newDepth = this.edgeDataCache[edge].depth;

      // Update fragmented depth ranges if depth changed
      if (oldDepth && newDepth !== oldDepth) {
        this.updateEdgeDepthRanges(edge, oldDepth, newDepth);
      }

      // Rewrite data at existing position
      const programIndex = this.edgeProgramIndex[edge];
      if (programIndex !== undefined) {
        this.addEdgeToProgram(edge, this.edgeIndices[edge], programIndex);
      }
    });
  }

  /**
   * Method used to refresh, i.e. force the renderer to reprocess graph
   * data and render, but keep the state.
   * - if a partialGraph is provided, we only reprocess those nodes & edges.
   * - if schedule is TRUE, we schedule a render instead of sync render
   * - if skipIndexation is TRUE, then labelGrid & program indexation are skipped (can be used if you haven't modify x, y, zIndex & size)
   *
   * @return {Sigma}
   */
  refresh(opts?: {
    partialGraph?: { nodes?: string[]; edges?: string[] };
    schedule?: boolean;
    skipIndexation?: boolean;
  }): this {
    const skipIndexation = opts?.skipIndexation !== undefined ? opts?.skipIndexation : false;
    const schedule = opts?.schedule !== undefined ? opts.schedule : false;
    const fullRefresh = !opts || !opts.partialGraph;

    if (fullRefresh) {
      // Re-index graph data
      this.clearEdgeIndices();
      this.clearNodeIndices();
      this.graph.forEachNode((node) => this.addNode(node));
      this.graph.forEachEdge((edge) => this.addEdge(edge));
    } else {
      const nodes = opts.partialGraph?.nodes || [];
      for (let i = 0, l = nodes?.length || 0; i < l; i++) {
        const node = nodes[i];
        // Recompute node's data (ie. apply reducer)
        this.updateNode(node);
        // Add node to the program if layout is unchanged.
        // otherwise it will be done in the process function
        if (skipIndexation) {
          const programIndex = this.nodeProgramIndex[node];
          if (programIndex === undefined) throw new Error(`Sigma: node "${node}" can't be repaint`);
          this.addNodeToProgram(node, this.nodeIndices[node], programIndex);
        }
      }

      const edges = opts?.partialGraph?.edges || [];
      for (let i = 0, l = edges.length; i < l; i++) {
        const edge = edges[i];
        // Recompute edge's data (ie. apply reducer)
        this.updateEdge(edge);
        // Add edge to the program
        // otherwise it will be done in the process function
        if (skipIndexation) {
          const programIndex = this.edgeProgramIndex[edge];
          if (programIndex === undefined) throw new Error(`Sigma: edge "${edge}" can't be repaint`);
          this.addEdgeToProgram(edge, this.edgeIndices[edge], programIndex);
        }
      }
    }

    // Do we need to call the process function ?
    if (fullRefresh || !skipIndexation) this.needToProcess = true;

    if (schedule) this.scheduleRender();
    else this.render();

    return this;
  }

  /**
   * Method used to schedule a render at the next available frame.
   * This method can be safely called on a same frame because it basically
   * debounces refresh to the next frame.
   *
   * @return {Sigma}
   */
  scheduleRender(): this {
    if (!this.renderFrame) {
      this.renderFrame = requestAnimationFrame(() => {
        this.render();
      });
    }

    return this;
  }

  /**
   * Method used to schedule a refresh (i.e. fully reprocess graph data and render)
   * at the next available frame.
   * This method can be safely called on a same frame because it basically
   * debounces refresh to the next frame.
   *
   * @return {Sigma}
   */
  scheduleRefresh(opts?: { partialGraph?: { nodes?: string[]; edges?: string[] }; layoutUnchange?: boolean }): this {
    return this.refresh({ ...opts, schedule: true });
  }

  /**
   * Method used to (un)zoom, while preserving the position of a viewport point.
   * Used for instance to zoom "on the mouse cursor".
   *
   * @param viewportTarget
   * @param newRatio
   * @return {CameraState}
   */
  getViewportZoomedState(viewportTarget: Coordinates, newRatio: number): CameraState {
    const { ratio, angle, x, y } = this.camera.getState();

    const { minCameraRatio, maxCameraRatio } = this.settings;
    if (typeof maxCameraRatio === "number") newRatio = Math.min(newRatio, maxCameraRatio);
    if (typeof minCameraRatio === "number") newRatio = Math.max(newRatio, minCameraRatio);
    const ratioDiff = newRatio / ratio;

    const center = {
      x: this.width / 2,
      y: this.height / 2,
    };

    const graphMousePosition = this.viewportToFramedGraph(viewportTarget);
    const graphCenterPosition = this.viewportToFramedGraph(center);

    return {
      angle,
      x: (graphMousePosition.x - graphCenterPosition.x) * (1 - ratioDiff) + x,
      y: (graphMousePosition.y - graphCenterPosition.y) * (1 - ratioDiff) + y,
      ratio: newRatio,
    };
  }

  /**
   * Method returning the abstract rectangle containing the graph according
   * to the camera's state.
   *
   * @return {object} - The view's rectangle.
   */
  viewRectangle(): {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    height: number;
  } {
    const p1 = this.viewportToFramedGraph({ x: 0, y: 0 }),
      p2 = this.viewportToFramedGraph({ x: this.width, y: 0 }),
      h = this.viewportToFramedGraph({ x: 0, y: this.height });

    return {
      x1: p1.x,
      y1: p1.y,
      x2: p2.x,
      y2: p2.y,
      height: p2.y - h.y,
    };
  }

  /**
   * Method returning the coordinates of a point from the framed graph system to the viewport system. It allows
   * overriding anything that is used to get the translation matrix, or even the matrix itself.
   *
   * Be careful if overriding dimensions, padding or cameraState, as the computation of the matrix is not the lightest
   * of computations.
   */
  framedGraphToViewport(coordinates: Coordinates, override: CoordinateConversionOverride = {}): Coordinates {
    const recomputeMatrix = !!override.cameraState || !!override.viewportDimensions || !!override.graphDimensions;
    const matrix = override.matrix
      ? override.matrix
      : recomputeMatrix
        ? matrixFromCamera(
            override.cameraState || this.camera.getState(),
            override.viewportDimensions || this.getDimensions(),
            override.graphDimensions || this.getGraphDimensions(),
            override.padding || this.getStagePadding(),
          )
        : this.matrix;

    const viewportPos = multiplyVec2(matrix, coordinates);

    return {
      x: ((1 + viewportPos.x) * this.width) / 2,
      y: ((1 - viewportPos.y) * this.height) / 2,
    };
  }

  /**
   * Method returning the coordinates of a point from the viewport system to the framed graph system. It allows
   * overriding anything that is used to get the translation matrix, or even the matrix itself.
   *
   * Be careful if overriding dimensions, padding or cameraState, as the computation of the matrix is not the lightest
   * of computations.
   */
  viewportToFramedGraph(coordinates: Coordinates, override: CoordinateConversionOverride = {}): Coordinates {
    const recomputeMatrix = !!override.cameraState || !!override.viewportDimensions || !override.graphDimensions;
    const invMatrix = override.matrix
      ? override.matrix
      : recomputeMatrix
        ? matrixFromCamera(
            override.cameraState || this.camera.getState(),
            override.viewportDimensions || this.getDimensions(),
            override.graphDimensions || this.getGraphDimensions(),
            override.padding || this.getStagePadding(),
            true,
          )
        : this.invMatrix;

    const res = multiplyVec2(invMatrix, {
      x: (coordinates.x / this.width) * 2 - 1,
      y: 1 - (coordinates.y / this.height) * 2,
    });

    if (isNaN(res.x)) res.x = 0;
    if (isNaN(res.y)) res.y = 0;

    return res;
  }

  /**
   * Method used to translate a point's coordinates from the viewport system (pixel distance from the top-left of the
   * stage) to the graph system (the reference system of data as they are in the given graph instance).
   *
   * This method accepts an optional camera which can be useful if you need to translate coordinates
   * based on a different view than the one being currently being displayed on screen.
   *
   * @param {Coordinates}                  viewportPoint
   * @param {CoordinateConversionOverride} override
   */
  viewportToGraph(viewportPoint: Coordinates, override: CoordinateConversionOverride = {}): Coordinates {
    return this.normalizationFunction.inverse(this.viewportToFramedGraph(viewportPoint, override));
  }

  /**
   * Method used to translate a point's coordinates from the graph system (the reference system of data as they are in
   * the given graph instance) to the viewport system (pixel distance from the top-left of the stage).
   *
   * This method accepts an optional camera which can be useful if you need to translate coordinates
   * based on a different view than the one being currently being displayed on screen.
   *
   * @param {Coordinates}                  graphPoint
   * @param {CoordinateConversionOverride} override
   */
  graphToViewport(graphPoint: Coordinates, override: CoordinateConversionOverride = {}): Coordinates {
    return this.framedGraphToViewport(this.normalizationFunction(graphPoint), override);
  }

  /**
   * Method returning the distance multiplier between the graph system and the
   * viewport system.
   */
  getGraphToViewportRatio(): number {
    const graphP1 = { x: 0, y: 0 };
    const graphP2 = { x: 1, y: 1 };
    const graphD = Math.sqrt(Math.pow(graphP1.x - graphP2.x, 2) + Math.pow(graphP1.y - graphP2.y, 2));

    const viewportP1 = this.graphToViewport(graphP1);
    const viewportP2 = this.graphToViewport(graphP2);
    const viewportD = Math.sqrt(Math.pow(viewportP1.x - viewportP2.x, 2) + Math.pow(viewportP1.y - viewportP2.y, 2));

    return viewportD / graphD;
  }

  /**
   * Method returning the graph's bounding box.
   *
   * @return {{ x: Extent, y: Extent }}
   */
  getBBox(): { x: Extent; y: Extent } {
    return this.nodeExtent;
  }

  /**
   * Method returning the graph's custom bounding box, if any.
   *
   * @return {{ x: Extent, y: Extent } | null}
   */
  getCustomBBox(): { x: Extent; y: Extent } | null {
    return this.customBBox;
  }

  /**
   * Method used to override the graph's bounding box with a custom one. Give `null` as the argument to stop overriding.
   *
   * @return {Sigma}
   */
  setCustomBBox(customBBox: { x: Extent; y: Extent } | null): this {
    this.customBBox = customBBox;
    this.scheduleRender();
    return this;
  }

  /**
   * Method used to shut the container & release event listeners.
   *
   * @return {undefined}
   */
  kill(): void {
    // Emitting "kill" events so that plugins and such can cleanup
    this.emit("kill");

    // Releasing events
    this.removeAllListeners();

    // Releasing camera handlers
    this.unbindCameraHandlers();

    // Releasing DOM events & captors
    window.removeEventListener("resize", this.activeListeners.handleResize);
    this.mouseCaptor.kill();
    this.touchCaptor.kill();

    // Releasing graph handlers
    this.unbindGraphHandlers();

    // Releasing cache & state
    this.clearIndices();
    this.clearState();

    this.nodeDataCache = {};
    this.edgeDataCache = {};

    // Clearing frames
    if (this.renderFrame) {
      cancelAnimationFrame(this.renderFrame);
      this.renderFrame = null;
    }

    // Destroying canvases
    const container = this.container;

    while (container.firstChild) container.removeChild(container.firstChild);

    // Kill programs:
    for (const type in this.nodePrograms) {
      this.nodePrograms[type].kill();
    }
    for (const type in this.edgePrograms) {
      this.edgePrograms[type].kill();
    }
    for (const type in this.labelPrograms) {
      this.labelPrograms[type].kill();
    }
    for (const type in this.edgeLabelPrograms) {
      this.edgeLabelPrograms[type].kill();
    }
    for (const type in this.backdropPrograms) {
      this.backdropPrograms[type].kill();
    }
    this.nodePrograms = {};
    this.backdropPrograms = {};
    this.edgePrograms = {};
    this.labelPrograms = {};
    this.edgeLabelPrograms = {};

    // Cleanup SDF atlas
    if (this.sdfAtlas) {
      this.sdfAtlas = null;
    }

    // Cleanup node data texture
    if (this.nodeDataTexture) {
      this.nodeDataTexture.kill();
      this.nodeDataTexture = null;
    }

    // Cleanup edge data texture
    if (this.edgeDataTexture) {
      this.edgeDataTexture.kill();
      this.edgeDataTexture = null;
    }

    // Kill all canvas/WebGL contexts
    for (const id in this.elements) {
      this.killLayer(id);
    }

    // Destroying remaining collections
    this.canvasContexts = {};
    this.webGLContext = null;
    this.elements = {};
  }

  /**
   * Method used to scale the given size according to the camera's ratio, i.e.
   * zooming state.
   *
   * @param  {number?} size -        The size to scale (node size, edge thickness etc.).
   * @param  {number?} cameraRatio - A camera ratio (defaults to the actual camera ratio).
   * @return {number}              - The scaled size.
   */
  scaleSize(size = 1, cameraRatio = this.camera.ratio): number {
    return (
      (size / this.settings.zoomToSizeRatioFunction(cameraRatio)) *
      (this.getSetting("itemSizesReference") === "positions" ? cameraRatio * this.graphToViewportRatio : 1)
    );
  }

  /**
   * Method that returns the collection of all used canvases.
   * At the moment, the instantiated canvases are the following, and in the
   * following order in the DOM:
   * - `stage` (WebGL)
   * - `edgeLabels`
   * - `labels`
   * - `mouse`
   *
   * @return {PlainObject<HTMLCanvasElement>} - The collection of canvases.
   */
  getCanvases(): PlainObject<HTMLCanvasElement> {
    const res: Record<string, HTMLCanvasElement> = {};
    for (const layer in this.elements)
      if (this.elements[layer] instanceof HTMLCanvasElement) res[layer] = this.elements[layer] as HTMLCanvasElement;
    return res;
  }

  /**
   * Returns memory usage statistics for all WebGL resources.
   */
  getMemoryStats(): MemoryStats {
    const textures: TextureStats[] = [];
    const buffers: BufferStats[] = [];
    const buckets: BucketStats[] = [];

    // Shared data textures
    if (this.nodeDataTexture) {
      textures.push({ name: "nodeData", ...this.nodeDataTexture.getMemoryStats() });
    }
    if (this.edgeDataTexture) {
      textures.push({ name: "edgeData", ...this.edgeDataTexture.getMemoryStats() });
    }

    // Node programs
    for (const [key, program] of Object.entries(this.nodePrograms)) {
      buffers.push({ program: `nodes:${key}`, ...program.getMemoryStats() });
      const layerStats = (program as { getLayerTextureStats?: () => ReturnType<typeof program.getMemoryStats> })
        .getLayerTextureStats?.();
      if (layerStats) {
        textures.push({ name: `nodes:${key}:layerAttributes`, ...layerStats });
      }
    }
    // Edge programs
    for (const [key, program] of Object.entries(this.edgePrograms)) {
      buffers.push({ program: `edges:${key}`, ...program.getMemoryStats() });
      const attrStats = (program as { getAttributeTextureStats?: () => ReturnType<typeof program.getMemoryStats> | null })
        .getAttributeTextureStats?.();
      if (attrStats) {
        textures.push({ name: `edges:${key}:pathAttributes`, ...attrStats });
      }
    }

    // Label programs
    for (const [key, program] of Object.entries(this.labelPrograms)) {
      buffers.push({ program: `labels:${key}`, ...program.getMemoryStats() });
    }
    for (const [key, program] of Object.entries(this.edgeLabelPrograms)) {
      buffers.push({ program: `edgeLabels:${key}`, ...program.getMemoryStats() });
    }

    // Backdrop programs
    for (const [key, program] of Object.entries(this.backdropPrograms)) {
      buffers.push({ program: `backdrop:${key}`, ...program.getMemoryStats() });
    }

    // Buckets
    for (const stats of this.itemBuckets.nodes.getMemoryStats()) {
      buckets.push({ type: "nodes", ...stats });
    }
    for (const stats of this.itemBuckets.edges.getMemoryStats()) {
      buckets.push({ type: "edges", ...stats });
    }

    // Picking resources
    const pickingWidth = Math.ceil((this.width * this.pixelRatio) / this.settings.pickingDownSizingRatio);
    const pickingHeight = Math.ceil((this.height * this.pixelRatio) / this.settings.pickingDownSizingRatio);
    const picking = {
      width: pickingWidth,
      height: pickingHeight,
      textureBytes: pickingWidth * pickingHeight * 4,
      depthBufferBytes: pickingWidth * pickingHeight * 2,
    };

    // Summary
    const texturesBytes = textures.reduce((sum, t) => sum + t.totalBytes, 0);
    const buffersBytes = buffers.reduce((sum, b) => sum + b.totalBytes, 0);
    const bucketsBytes = buckets.reduce((sum, b) => sum + b.totalBytes, 0);
    const pickingBytes = picking.textureBytes + picking.depthBufferBytes;

    return {
      textures,
      buffers,
      buckets,
      picking,
      summary: {
        texturesBytes,
        buffersBytes,
        bucketsBytes,
        pickingBytes,
        totalBytes: texturesBytes + buffersBytes + bucketsBytes + pickingBytes,
      },
    };
  }

  /**
   * Returns write statistics for all WebGL resources since last reset.
   */
  getWriteStats(): WriteStats {
    const textures: { name: string; writes: number; bytesWritten: number }[] = [];
    const buffers: { program: string; writes: number; bytesWritten: number }[] = [];

    // Data textures
    if (this.nodeDataTexture) {
      textures.push({ name: "nodeData", ...this.nodeDataTexture.getWriteStats() });
    }
    if (this.edgeDataTexture) {
      textures.push({ name: "edgeData", ...this.edgeDataTexture.getWriteStats() });
    }

    // Node programs
    for (const [key, program] of Object.entries(this.nodePrograms)) {
      buffers.push({ program: `nodes:${key}`, ...program.getWriteStats() });
      const layerStats = (program as { getLayerTextureWriteStats?: () => { writes: number; bytesWritten: number } })
        .getLayerTextureWriteStats?.();
      if (layerStats) {
        textures.push({ name: `nodes:${key}:layerAttributes`, ...layerStats });
      }
    }
    // Edge programs
    for (const [key, program] of Object.entries(this.edgePrograms)) {
      buffers.push({ program: `edges:${key}`, ...program.getWriteStats() });
      const attrStats = (program as { getAttributeTextureWriteStats?: () => { writes: number; bytesWritten: number } | null })
        .getAttributeTextureWriteStats?.();
      if (attrStats) {
        textures.push({ name: `edges:${key}:pathAttributes`, ...attrStats });
      }
    }

    // Label programs
    for (const [key, program] of Object.entries(this.labelPrograms)) {
      buffers.push({ program: `labels:${key}`, ...program.getWriteStats() });
    }
    for (const [key, program] of Object.entries(this.edgeLabelPrograms)) {
      buffers.push({ program: `edgeLabels:${key}`, ...program.getWriteStats() });
    }

    // Backdrop programs
    for (const [key, program] of Object.entries(this.backdropPrograms)) {
      buffers.push({ program: `backdrop:${key}`, ...program.getWriteStats() });
    }

    const textureWrites = textures.reduce((sum, t) => sum + t.writes, 0);
    const bufferWrites = buffers.reduce((sum, b) => sum + b.writes, 0);
    const totalBytesWritten =
      textures.reduce((sum, t) => sum + t.bytesWritten, 0) + buffers.reduce((sum, b) => sum + b.bytesWritten, 0);

    return {
      textures,
      buffers,
      summary: { textureWrites, bufferWrites, totalBytesWritten },
    };
  }

  /**
   * Resets write statistics counters for all WebGL resources.
   */
  resetWriteStats(): void {
    this.nodeDataTexture?.resetWriteStats();
    this.edgeDataTexture?.resetWriteStats();

    for (const program of Object.values(this.nodePrograms)) {
      program.resetWriteStats();
      (program as { resetLayerTextureWriteStats?: () => void }).resetLayerTextureWriteStats?.();
    }
    for (const program of Object.values(this.edgePrograms)) {
      program.resetWriteStats();
      (program as { resetAttributeTextureWriteStats?: () => void }).resetAttributeTextureWriteStats?.();
    }
    for (const program of Object.values(this.labelPrograms)) {
      program.resetWriteStats();
    }
    for (const program of Object.values(this.edgeLabelPrograms)) {
      program.resetWriteStats();
    }
    for (const program of Object.values(this.backdropPrograms)) {
      program.resetWriteStats();
    }
  }
}
