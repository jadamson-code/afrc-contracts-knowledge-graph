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
import {
  ResolvedStageStyle,
  StyleAnalysis,
  analyzeStyleDeclaration,
  evaluateEdgeStyle,
  evaluateNodeStyle,
  evaluateStageStyle,
} from "./core/styles";
import {
  DEFAULT_DEPTH_LAYERS,
  ExtractEdgeVarsFromPrimitives,
  ExtractNodeVarsFromPrimitives,
  LabelAttachmentContext,
  PrimitivesDeclaration,
  VariablesDefinition,
  generateEdgeProgram,
  generateNodeProgram,
} from "./primitives";
import {
  AttachmentManager,
  BackdropDisplayData,
  BackdropProgram,
  BackdropProgramType,
  BucketCollection,
  EdgeDataTexture,
  EdgeLabelProgram,
  EdgePath,
  EdgeProgram,
  LabelProgram,
  LabelProgramType,
  NodeDataTexture,
  NodeProgram,
  POSITION_MODE_MAP,
  getShapeId,
} from "./rendering";
import {
  ATTACHMENT_GAP,
  ATTACHMENT_PLACEMENT_MAP,
  ATTACHMENT_TEXTURE_UNIT,
  AttachmentProgram,
} from "./rendering/nodes/attachments";
import { Settings, resolveSettings, validateSettings } from "./settings";
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
  SigmaEventPayload,
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
  ForbidBaseKeys,
  FullEdgeState,
  FullGraphState,
  FullNodeState,
  StylesDeclaration,
  createEdgeState,
  createGraphState,
  createNodeState,
} from "./types/styles";
import {
  DepthRanges,
  NormalizationFunction,
  addPositionToDepthRanges,
  colorToArray,
  colorToIndex,
  createElement,
  createNormalizationFunction,
  extend,
  getMatrixImpact,
  getPixelColor,
  getPixelRatio,
  hasNewPartialProps,
  identity,
  matrixFromCamera,
  multiplyVec2,
  parseFontString,
  removePositionFromDepthRanges,
  validateGraph,
} from "./utils";

/**
 * Constants.
 */
const X_LABEL_MARGIN = 150;
const Y_LABEL_MARGIN = 50;
// Texture unit for the shared node data texture (position, size, shapeId)
const NODE_DATA_TEXTURE_UNIT = 3;
// Texture unit for the shared edge data texture (source/target indices, thickness, curvature, etc.)
const EDGE_DATA_TEXTURE_UNIT = 4;

const BACKDROP_AREA_MAP: Record<string, number> = { both: 0, node: 1, label: 2 };

/**
 * Reducer types for the new API.
 */
export type NodeReducer<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
  NS = {}, // additional custom node state fields
  GS = {}, // additional custom graph state fields
> = (
  key: string,
  data: NodeDisplayData,
  attrs: N,
  state: FullNodeState<NS>,
  graphState: FullGraphState<GS>,
  graph: Graph<N, E, G>,
) => Partial<NodeDisplayData>;

export type EdgeReducer<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
  ES = {}, // additional custom edge state fields
  GS = {}, // additional custom graph state fields
> = (
  key: string,
  data: EdgeDisplayData,
  attrs: E,
  state: FullEdgeState<ES>,
  graphState: FullGraphState<GS>,
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
  NS = {}, // additional custom node state fields
  ES = {}, // additional custom edge state fields
  GS = {}, // additional custom graph state fields
  P extends PrimitivesDeclaration = PrimitivesDeclaration,
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
  private webGLContext: WebGL2RenderingContext | null = null;
  // Offscreen canvas for text measurement fallback (not added to DOM)
  private measureContext: CanvasRenderingContext2D | null = null;
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
  private edgePathsByName: Map<string, EdgePath> = new Map();

  // Parallel edge index: groups edges by sorted endpoint pair
  private parallelEdgeGroups: Map<string, string[]> = new Map();
  // Reverse lookup: edge key → group key (needed for edge drop when edge is already removed from graph)
  private edgeToParallelGroupKey: Map<string, string> = new Map();

  // Indices to keep track of the index of the item inside programs
  private nodeProgramIndex: Record<string, number> = {};
  private edgeProgramIndex: Record<string, number> = {};
  private nodesWithForcedLabels: Set<string> = new Set<string>();
  private edgesWithForcedLabels: Set<string> = new Set<string>();
  private nodesWithBackdrop: Set<string> = new Set<string>();
  private nodeGraphCoords: Record<string, Coordinates> = {};
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
  private renderedNodeLabels: Set<string> = new Set();
  private displayedEdgeLabels: Set<string> = new Set();

  // State management (new API)
  private nodeStates: Map<string, FullNodeState<NS>> = new Map();
  private edgeStates: Map<string, FullEdgeState<ES>> = new Map();
  private graphState = createGraphState<GS>();
  private customNodeStateDefaults: NS | undefined;
  private customEdgeStateDefaults: ES | undefined;
  private customGraphStateDefaults: GS | undefined;

  // Tracking for event system (which node/edge is currently hovered for enter/leave events)
  private hoveredNode: string | null = null;
  private hoveredEdge: string | null = null;

  // Node drag state
  private pendingDragNode: string | null = null;
  private dragSession: {
    node: string;
    allNodes: string[];
    startPosition: Coordinates;
    startNodePositions: Map<string, Coordinates>;
    xAttr: string;
    yAttr: string;
  } | null = null;

  // Tracks whether autoRescale:"once" has already captured the extent
  private autoRescaleFrozen = false;

  // New v4 API: primitives and styles declarations
  private primitives: PrimitivesDeclaration | null = null;
  private stylesDeclaration: StylesDeclaration<N, E, NS, ES, GS> | null = null;
  private resolvedStageStyle: ResolvedStageStyle = {};

  // Internal states
  private renderFrame: number | null = null;
  private needToProcess = false;
  private needToRefreshState = false;
  private checkEdgesEventsFrame: number | null = null;

  // Pre-computed style metadata (dependency level, position attribute names)
  private nodeStyleAnalysis: StyleAnalysis = { dependency: "static", xAttribute: null, yAttribute: null };
  private edgeStyleAnalysis: StyleAnalysis = { dependency: "static", xAttribute: null, yAttribute: null };

  // Dirty tracking for selective refreshState
  private dirtyNodes: Set<string> = new Set();
  private dirtyEdges: Set<string> = new Set();
  private graphStateChanged = false;
  private graphStateFlagsDirty = false;

  // Programs (single program per item kind)
  private nodeProgram: NodeProgram<string, N, E, G> | null = null;
  private backdropProgram: BackdropProgram<string, N, E, G> | null = null;
  private edgeProgram: EdgeProgram<string, N, E, G> | null = null;
  private labelProgram: LabelProgram<string, N, E, G> | null = null;
  private edgeLabelProgram: EdgeLabelProgram<string, N, E, G> | null = null;

  // Custom layer programs (fullscreen quad effects rendered at specific depth positions)
  private customLayerPrograms = new Map<
    string,
    {
      render(params: RenderParams): void;
      kill(): void;
      preRender?(params: RenderParams): void;
      cacheData?(): void;
    }
  >();

  // Label attachment rendering
  private attachmentManager: AttachmentManager | null = null;
  private attachmentProgram: AttachmentProgram<N, E, G> | null = null;
  // Per-render-frame cache cleared at render start to avoid redundant measureText calls
  private labelSizeCache = new Map<string, { width: number; height: number }>();

  // Shape slug for edge clamping (encodes shape name, params, rotateWithCamera)
  private nodeShapeSlug: string | null = null;

  // For multi-shape programs: { shapeName -> localIndex }
  private nodeShapeMap: Record<string, number> | null = null;

  // For multi-shape programs: array of global shape IDs (local index -> global ID)
  private nodeGlobalShapeIds: number[] | null = null;

  // WebGL Labels (SDF-based rendering)
  private sdfAtlas: SDFAtlasManager | null = null;

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
  // Track {offset, count} fragment ranges per depth for range-rendering
  private depthRanges: { nodes: DepthRanges; edges: DepthRanges } = { nodes: {}, edges: {} };
  // Depth assigned to each item during the last process() call
  private nodeBaseDepth: Record<string, string> = {};
  private edgeBaseDepth: Record<string, string> = {};

  private camera: Camera;

  constructor(
    graph: Graph<N, E, G>,
    container: HTMLElement,
    options: {
      primitives?: P;
      styles?: StylesDeclaration<
        N,
        E,
        NoInfer<NS>,
        NoInfer<ES>,
        NoInfer<GS>,
        ExtractNodeVarsFromPrimitives<P>,
        ExtractEdgeVarsFromPrimitives<P>
      >;
      settings?: Partial<Settings>;
      nodeReducer?: NodeReducer<N, E, G, NS, GS>;
      edgeReducer?: EdgeReducer<N, E, G, ES, GS>;
      customNodeState?: ForbidBaseKeys<BaseNodeState, NS>;
      customEdgeState?: ForbidBaseKeys<BaseEdgeState, ES>;
      customGraphState?: ForbidBaseKeys<BaseGraphState, GS>;
    } = {},
  ) {
    super();

    // Extract options
    const {
      primitives,
      styles,
      settings = {},
      nodeReducer,
      edgeReducer,
      customNodeState,
      customEdgeState,
      customGraphState,
    } = options;

    // Store custom state defaults for lazy initialization
    this.customNodeStateDefaults = customNodeState as NS | undefined;
    this.customEdgeStateDefaults = customEdgeState as ES | undefined;
    this.customGraphStateDefaults = customGraphState as GS | undefined;
    if (customGraphState) {
      this.graphState = createGraphState<GS>(customGraphState);
    }

    // Store primitives and styles declarations for v4 API
    // Use DEFAULT_STYLES when styles not provided, merging at nodes/edges level
    this.primitives = primitives ?? DEFAULT_PRIMITIVES;
    this.stylesDeclaration = styles
      ? ({
          nodes: styles.nodes ?? DEFAULT_STYLES.nodes,
          edges: styles.edges ?? DEFAULT_STYLES.edges,
          stage: styles.stage,
        } as StylesDeclaration<N, E, NS, ES, GS>)
      : (DEFAULT_STYLES as unknown as StylesDeclaration<N, E, NS, ES, GS>);

    // Store reducers
    this.nodeReducer = nodeReducer ?? null;
    this.edgeReducer = edgeReducer ?? null;

    // Analyze style declarations for dependency level and position attribute names.
    // Reducers are opaque functions that receive state, so force "graph-state".
    this.nodeStyleAnalysis = analyzeStyleDeclaration(this.stylesDeclaration!.nodes as Record<string, unknown>);
    if (this.nodeReducer) this.nodeStyleAnalysis.dependency = "graph-state";
    this.edgeStyleAnalysis = analyzeStyleDeclaration(this.stylesDeclaration!.edges as Record<string, unknown>);
    if (this.edgeReducer) this.edgeStyleAnalysis.dependency = "graph-state";

    // Initial stage style evaluation
    if (this.stylesDeclaration!.stage) {
      this.resolvedStageStyle = evaluateStageStyle(
        this.stylesDeclaration!.stage as Record<string, unknown> | Record<string, unknown>[],
        this.graphState,
      );
    }

    // Resolving settings
    this.settings = resolveSettings(settings);

    // Validating
    validateSettings(this.settings);
    if (this.settings.enableNodeDrag) {
      const { xAttribute, yAttribute } = this.nodeStyleAnalysis;
      if ((!xAttribute || !yAttribute) && !this.settings.dragPositionToAttributes) {
        throw new Error(
          "Sigma: `enableNodeDrag` is true but position attribute names could not be inferred from styles. " +
            'Either use attribute bindings for x/y in your node styles (e.g. `x: { attribute: "x" }`), ' +
            "or provide a `dragPositionToAttributes` setting.",
        );
      }
    }
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
    this.createLayer("mouse", "div", { style: { touchAction: "none", userSelect: "none" } });

    // Initial resize
    this.resize();

    // Apply initial stage styles
    if (this.resolvedStageStyle.background) {
      this.container.style.backgroundColor = this.resolvedStageStyle.background;
    }
    if (this.resolvedStageStyle.cursor) {
      this.container.style.cursor = this.resolvedStageStyle.cursor;
    }

    // Initialize node data texture for sharing position/size/shape data between node and edge programs
    this.nodeDataTexture = new NodeDataTexture(this.webGLContext!);

    // Initialize edge data texture for sharing edge data between edge and edge label programs
    this.edgeDataTexture = new EdgeDataTexture(this.webGLContext!);

    // Generate programs from primitives (uses defaults when not provided)
    const sigma = this as unknown as Sigma<N, E, G>;
    const gl = this.webGLContext!;

    const { program: NodeProgramClass, variables: nodeVariables } = generateNodeProgram<N, E, G>(
      this.primitives?.nodes,
    );
    this.nodeVariables = nodeVariables;
    this.nodeProgram = new NodeProgramClass(gl, null, sigma);

    // Cache shape information
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodeProgramOptions = (NodeProgramClass as any).programOptions;
    if (nodeProgramOptions?.shapeSlug) {
      this.nodeShapeSlug = nodeProgramOptions.shapeSlug;
    }
    if (nodeProgramOptions?.shapeNameToIndex) {
      this.nodeShapeMap = nodeProgramOptions.shapeNameToIndex;
    }
    if (nodeProgramOptions?.shapeGlobalIds) {
      this.nodeGlobalShapeIds = nodeProgramOptions.shapeGlobalIds;
    }

    // Create label program if the node program has one
    const LabelProgramClass = NodeProgramClass.LabelProgram as LabelProgramType<N, E, G> | undefined;
    if (LabelProgramClass) {
      this.labelProgram = new LabelProgramClass(gl, null, sigma);
    }

    // Create backdrop program if the node program has one
    const BackdropProgramClass = NodeProgramClass.BackdropProgram as BackdropProgramType<N, E, G> | undefined;
    if (BackdropProgramClass) {
      this.backdropProgram = new BackdropProgramClass(gl, null, sigma);
    }

    // Create label attachment system if attachments are declared
    const labelAttachments = this.primitives?.nodes?.labelAttachments;
    if (labelAttachments && Object.keys(labelAttachments).length > 0) {
      this.attachmentManager = new AttachmentManager(gl, labelAttachments, () => this.scheduleRender());
      this.attachmentProgram = new AttachmentProgram(gl, null, sigma);
    }

    const {
      program: EdgeProgramClass,
      variables: edgeVariables,
      paths: edgePaths,
    } = generateEdgeProgram<N, E, G>(this.primitives?.edges);
    this.edgeVariables = edgeVariables;
    this.edgePathsByName = new Map(edgePaths.map((p) => [p.name, p]));
    this.edgeProgram = new EdgeProgramClass(gl, null, sigma);

    // Create edge label program if the edge program has one
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const EdgeLabelProgramClass = (EdgeProgramClass as any).LabelProgram;
    if (EdgeLabelProgramClass) {
      this.edgeLabelProgram = new EdgeLabelProgramClass(gl, null, sigma);
    }

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
   * Internal function used to initialize WebGL labels.
   * Sets up the SDF atlas.
   */
  private initializeWebGLLabels(): void {
    // Create SDF Atlas Manager
    this.sdfAtlas = new SDFAtlasManager();

    // Register default font
    this.sdfAtlas.registerFont({
      family: "sans-serif",
      weight: "normal",
      style: "normal",
    });
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
          this.setNodeState(previousNode, { isHovered: false });
          this.emit("leaveNode", { ...baseEvent, node: previousNode });
        } else {
          this.hoveredNode = nodeToHover;
        }

        this.setNodeState(nodeToHover, { isHovered: true });
        this.emit("enterNode", { ...baseEvent, node: nodeToHover });
        this.updateContainerCursor();
        return;
      }

      // Checking if the hovered node is still hovered
      if (this.hoveredNode) {
        if (this.getNodeAtPosition(event) !== this.hoveredNode) {
          const node = this.hoveredNode;
          this.hoveredNode = null;
          this.setNodeState(node, { isHovered: false });
          this.emit("leaveNode", { ...baseEvent, node });
          this.updateContainerCursor();
          return;
        }
      }

      if (this.settings.enableEdgeEvents) {
        const edgeToHover = this.hoveredNode ? null : this.getEdgeAtPoint(baseEvent.event.x, baseEvent.event.y);

        if (edgeToHover !== this.hoveredEdge) {
          if (this.hoveredEdge) {
            this.setEdgeState(this.hoveredEdge, { isHovered: false });
            this.emit("leaveEdge", { ...baseEvent, edge: this.hoveredEdge });
          }
          this.hoveredEdge = edgeToHover;
          if (edgeToHover) {
            this.setEdgeState(edgeToHover, { isHovered: true });
            this.emit("enterEdge", { ...baseEvent, edge: edgeToHover });
          }
          this.updateContainerCursor();
        }
      }
    };

    // Handling mouse move over body (only to dispatch the proper event):
    this.activeListeners.handleMoveBody = (e: MouseCoords | TouchCoords): void => {
      const event = cleanMouseCoords(e);

      // Initiate drag on first movement after downNode
      if (this.pendingDragNode && !this.dragSession) {
        this.startNodeDrag(this.pendingDragNode, event);
        this.pendingDragNode = null;
      }

      // Handle node drag movement
      if (this.dragSession) {
        const currentPosition = this.viewportToGraph(event);
        const totalDelta = {
          x: currentPosition.x - this.dragSession.startPosition.x,
          y: currentPosition.y - this.dragSession.startPosition.y,
        };

        this.applyNodeDrag(totalDelta);

        this.emit("nodeDrag", {
          node: this.dragSession.node,
          allDraggedNodes: this.dragSession.allNodes,
          event,
        });

        // Prevent camera panning during node drag
        event.preventSigmaDefault();
      }

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
        this.setNodeState(node, { isHovered: false });
        this.emit("leaveNode", { ...baseEvent, node });
      }

      if (this.settings.enableEdgeEvents && this.hoveredEdge) {
        const edge = this.hoveredEdge;
        this.hoveredEdge = null;
        this.setEdgeState(edge, { isHovered: false });
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

    // Node drag: prepare on downNode, actual start deferred to first moveBody
    this.on("downNode", ({ node }) => {
      if (!this.settings.enableNodeDrag) return;
      this.pendingDragNode = node;
    });

    // Node drag: end on upNode or upStage
    const handleDragEnd = ({ event, preventSigmaDefault }: SigmaEventPayload) => {
      // Clear pending drag if pointer was released before movement
      this.pendingDragNode = null;

      if (!this.dragSession) return;

      const { node, allNodes } = this.dragSession;
      this.endDrag();

      this.emit("nodeDragEnd", {
        node,
        allDraggedNodes: allNodes,
        event,
        preventSigmaDefault,
      });
    };
    this.on("upNode", handleDragEnd);
    this.on("upStage", handleDragEnd);

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

    // On add edge, register in parallel index, process edge and siblings
    this.activeListeners.addEdgeGraphUpdate = (payload: { key: string }): void => {
      const edge = payload.key;
      this.registerParallelEdge(edge);
      this.addEdge(edge);
      // Re-process siblings whose parallel state changed
      const siblings = this.getParallelSiblings(edge);
      for (const sib of siblings) this.addEdge(sib);
      this.refresh({ partialGraph: { edges: [edge, ...siblings] }, schedule: true });
    };

    // On update edge, we update indices and then call for a refresh
    this.activeListeners.updateEdgeGraphUpdate = (payload: { key: string }): void => {
      const edge = payload.key;
      // schedule a repaint for the edge
      this.refresh({ partialGraph: { edges: [edge] }, skipIndexation: false, schedule: true });
    };

    // On drop edge, unregister from parallel index, remove, and update siblings
    this.activeListeners.dropEdgeGraphUpdate = (payload: { key: string }): void => {
      const edge = payload.key;
      const siblings = this.getParallelSiblings(edge);
      this.unregisterParallelEdge(edge);
      this.removeEdge(edge);
      // Re-process remaining siblings whose parallel state changed
      for (const sib of siblings) this.addEdge(sib);
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

    // Clear attachment cache since all nodes are reprocessed
    this.attachmentManager?.clear();

    const graph = this.graph;
    const settings = this.settings;
    const dimensions = this.getDimensions();

    //
    // NODES
    //
    // Skip extent recomputation when autoRescale is "once" and already frozen
    if (this.settings.autoRescale !== "once" || !this.autoRescaleFrozen) {
      this.nodeExtent = this.computeNodeExtent();
      if (this.settings.autoRescale === "once") {
        this.autoRescaleFrozen = true;
      }
    }
    if (this.settings.autoRescale === false) {
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

    const nodeIndices: typeof this.nodeIndices = {};
    const edgeIndices: typeof this.edgeIndices = {};
    const itemIDsIndex: typeof this.itemIDsIndex = {};
    let incrID = 1;

    const nodes = graph.nodes();
    let totalNodes = 0;

    // Do some indexation on the whole graph
    for (let i = 0, l = nodes.length; i < l; i++) {
      const node = nodes[i];
      const data = this.nodeDataCache[node];

      // Restore un-normalized graph coords before normalizing
      // (nodeDataCache may hold stale normalized values from a previous process cycle)
      const graphCoords = this.nodeGraphCoords[node];
      data.x = graphCoords.x;
      data.y = graphCoords.y;
      this.normalizationFunction.applyTo(data);

      // labelgrid
      if (typeof data.label === "string" && !data.hidden)
        this.labelGrid.add(node, data.size, this.framedGraphToViewport(data, { matrix: nullCameraMatrix }));

      totalNodes++;
    }
    this.labelGrid.organize();

    // Allocate memory to node program
    this.nodeProgram!.reallocate(totalNodes);
    let nodeProcessCount = 0;

    // Update node data texture with position, size, and shape data
    // This must happen before addNodeToProgram so texture indices are available
    for (let i = 0, l = nodes.length; i < l; i++) {
      const node = nodes[i];
      const data = this.nodeDataCache[node];
      // Allocate texture index for this node (or get existing)
      this.nodeDataTexture!.allocate(node);

      // Get shape ID:
      // - For multi-shape programs: convert local index to global ID for edge clamping
      // - For single-shape programs: use global registry ID from slug
      let shapeId: number;
      if (this.nodeShapeMap && this.nodeGlobalShapeIds && data.shape && data.shape in this.nodeShapeMap) {
        // Multi-shape program: convert local index to global ID
        const localIndex = this.nodeShapeMap[data.shape];
        shapeId = this.nodeGlobalShapeIds[localIndex];
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
    this.itemBuckets.nodes.forEachBucketByZIndex((zIndex, bucket) => {
      const items = bucket.getItems();
      const depthIndex = Math.floor(zIndex / maxDepthLevels);
      const depth = depthLayers[depthIndex] ?? depthLayers[0];
      if (!this.depthRanges.nodes[depth]) this.depthRanges.nodes[depth] = [{ offset: nodeProcessCount, count: 0 }];
      const fragments = this.depthRanges.nodes[depth];
      fragments[fragments.length - 1].count += items.size;
      for (const node of items) {
        this.nodeBaseDepth[node] = depth;
        nodeIndices[node] = incrID;
        itemIDsIndex[nodeIndices[node]] = { type: "node", id: node };
        incrID++;

        // Allocate node in the program's layer attribute texture
        this.nodeProgram!.allocateNode?.(node);

        this.addNodeToProgram(node, nodeIndices[node], nodeProcessCount++);
      }
    });

    //
    // EDGES
    //

    const edges = graph.edges();

    // Allocate memory to edge program
    this.edgeProgram!.reallocate(edges.length);
    let edgeProcessCount = 0;

    // Add data to programs using buckets (preserves zIndex ordering)
    this.depthRanges.edges = {};
    this.edgeBaseDepth = {};
    this.itemBuckets.edges.forEachBucketByZIndex((zIndex, bucket) => {
      const items = bucket.getItems();
      const depthIndex = Math.floor(zIndex / maxDepthLevels);
      const depth = depthLayers[depthIndex] ?? depthLayers[0];
      if (!this.depthRanges.edges[depth]) this.depthRanges.edges[depth] = [{ offset: edgeProcessCount, count: 0 }];
      const fragments = this.depthRanges.edges[depth];
      fragments[fragments.length - 1].count += items.size;
      for (const edge of items) {
        this.edgeBaseDepth[edge] = depth;
        edgeIndices[edge] = incrID;
        itemIDsIndex[edgeIndices[edge]] = { type: "edge", id: edge };
        incrID++;

        this.addEdgeToProgram(edge, edgeIndices[edge], edgeProcessCount++);
      }
    });

    this.itemIDsIndex = itemIDsIndex;
    this.nodeIndices = nodeIndices;
    this.edgeIndices = edgeIndices;

    //
    // WEBGL LABELS
    //
    this.processWebGLLabels(nodes);

    // Cache data uniforms for custom layer programs
    for (const program of this.customLayerPrograms.values()) {
      if (program.cacheData) program.cacheData();
    }

    this.emit("afterProcess");
    return this;
  }

  /**
   * Pre-generate glyphs for all labels.
   * Actual label processing happens per-frame in renderWebGLLabels.
   * @private
   */
  private processWebGLLabels(nodes: string[]): void {
    if (!this.labelProgram?.ensureGlyphsReady) return;

    // Group label texts by font string so glyphs are pre-generated for every
    // font family that nodes actually use, not just the program's default font.
    const defaultLabelFont = this.primitives?.nodes?.label?.font?.family || "sans-serif";
    const textsByFont = new Map<string, string[]>();

    for (let i = 0, l = nodes.length; i < l; i++) {
      const node = nodes[i];
      const data = this.nodeDataCache[node];

      if (data.hidden || !data.label) continue;

      const fontString = data.labelFont || defaultLabelFont;
      const existing = textsByFont.get(fontString);
      if (existing) {
        existing.push(data.label);
      } else {
        textsByFont.set(fontString, [data.label]);
      }
    }

    // Ensure all glyphs are generated (this is the expensive part we want to do once)
    for (const [fontString, texts] of textsByFont) {
      const { family, weight, style } = parseFontString(fontString);
      const fontKey = this.labelProgram.registerFont?.(family, weight, style);
      this.labelProgram.ensureGlyphsReady(texts, fontKey);
    }
  }

  /**
   * Get the label color for a node.
   * @private
   */
  private getLabelColor(data: NodeDisplayData): string {
    return data.labelColor;
  }

  /**
   * Measures a node's label dimensions in pixels. Uses the SDF label program
   * when available, falling back to canvas 2D measurement.
   */
  private measureNodeLabel(data: NodeDisplayData): { width: number; height: number } {
    if (!data.label) return { width: 0, height: 0 };

    const labelSize = data.labelSize ?? 14;
    const fontString = data.labelFont || this.primitives?.nodes?.label?.font?.family || "sans-serif";
    const cacheKey = `${data.label}|${labelSize}|${fontString}`;
    if (this.labelSizeCache.has(cacheKey)) return this.labelSizeCache.get(cacheKey)!;

    const { family, weight, style } = parseFontString(fontString);
    let result: { width: number; height: number };
    if (this.labelProgram?.measureLabel) {
      const fontKey = this.labelProgram.registerFont?.(family, weight, style) || "";
      result = this.labelProgram.measureLabel(data.label, labelSize, fontKey);
    } else {
      if (!this.measureContext) {
        this.measureContext = document.createElement("canvas").getContext("2d")!;
      }
      this.measureContext.font = `${style} ${weight} ${labelSize}px ${family}`;
      result = { width: this.measureContext.measureText(data.label).width, height: labelSize };
    }

    this.labelSizeCache.set(cacheKey, result);
    return result;
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
    const position = this.nodeProgramIndex[key];
    if (position === undefined) return;
    removePositionFromDepthRanges(this.depthRanges.nodes, oldDepth, position);
    addPositionToDepthRanges(this.depthRanges.nodes, newDepth, position);
  }

  /**
   * Update depth ranges when an edge moves between depth layers without
   * reprocessing the program array.
   */
  private updateEdgeDepthRanges(key: string, oldDepth: string, newDepth: string): void {
    const position = this.edgeProgramIndex[key];
    if (position === undefined) return;
    removePositionFromDepthRanges(this.depthRanges.edges, oldDepth, position);
    addPositionToDepthRanges(this.depthRanges.edges, newDepth, position);
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
  private computeDisplayedNodeLabels(): void {
    const cameraState = this.camera.getState();

    // Compute viewport bounds in framed graph coordinates for early rejection
    const topLeft = this.viewportToFramedGraph({ x: -X_LABEL_MARGIN, y: -Y_LABEL_MARGIN });
    const topRight = this.viewportToFramedGraph({ x: this.width + X_LABEL_MARGIN, y: -Y_LABEL_MARGIN });
    const bottomLeft = this.viewportToFramedGraph({ x: -X_LABEL_MARGIN, y: this.height + Y_LABEL_MARGIN });
    const bottomRight = this.viewportToFramedGraph({ x: this.width + X_LABEL_MARGIN, y: this.height + Y_LABEL_MARGIN });

    const graphMinX = Math.min(topLeft.x, topRight.x, bottomLeft.x, bottomRight.x);
    const graphMaxX = Math.max(topLeft.x, topRight.x, bottomLeft.x, bottomRight.x);
    const graphMinY = Math.min(topLeft.y, topRight.y, bottomLeft.y, bottomRight.y);
    const graphMaxY = Math.max(topLeft.y, topRight.y, bottomLeft.y, bottomRight.y);

    // LabelGrid uses null-camera viewport space
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

    const labelsToDisplay = this.labelGrid.getLabelsToDisplay(
      cameraState.ratio,
      this.settings.labelDensity,
      gridViewport,
    );
    extend(labelsToDisplay, this.nodesWithForcedLabels);

    for (let i = 0, l = labelsToDisplay.length; i < l; i++) {
      const node = labelsToDisplay[i];
      const data = this.nodeDataCache[node];

      if (this.displayedNodeLabels.has(node)) continue;
      if (data.hidden) continue;
      if (!data.label) continue;

      // Cheap early rejection in framed graph space (no matrix multiply)
      if (data.x < graphMinX || data.x > graphMaxX || data.y < graphMinY || data.y > graphMaxY) continue;

      const { x, y } = this.framedGraphToViewport(data);
      const size = this.scaleSize(data.size);

      if (!data.forceLabel && size < this.settings.labelRenderedSizeThreshold) continue;

      if (
        x < -X_LABEL_MARGIN - size ||
        x > this.width + X_LABEL_MARGIN + size ||
        y < -Y_LABEL_MARGIN - size ||
        y > this.height + Y_LABEL_MARGIN + size
      )
        continue;

      this.displayedNodeLabels.add(node);
    }
  }

  private renderWebGLLabels(params: RenderParams, depth?: string): void {
    // Collect visible nodes for this depth from pre-computed displayedNodeLabels
    const visibleNodes: string[] = [];
    for (const node of this.displayedNodeLabels) {
      if (this.renderedNodeLabels.has(node)) continue;
      const data = this.nodeDataCache[node];
      if (depth && data.labelDepth !== depth) continue;
      this.renderedNodeLabels.add(node);
      visibleNodes.push(node);
    }

    if (!this.labelProgram) return;

    // Count total characters for label program
    let totalCharacters = 0;
    for (let i = 0, l = visibleNodes.length; i < l; i++) {
      const data = this.nodeDataCache[visibleNodes[i]];
      totalCharacters += data.label!.length;
    }

    // Reallocate label program based on visible character count
    this.labelProgram.reallocate(totalCharacters);

    // Process each visible label into the program's buffer
    // TODO: These defaults should come from the styles system
    const defaultLabelSize = 14;
    const defaultLabelMargin = this.primitives?.nodes?.label?.margin ?? 5;
    const defaultLabelPosition = "right" as const;
    const defaultLabelFont = this.primitives?.nodes?.label?.font?.family || "sans-serif";

    // Font key cache: maps font family strings to registered atlas font keys
    const fontKeyMap = new Map<string, string>();

    let characterOffset = 0;
    for (let i = 0, l = visibleNodes.length; i < l; i++) {
      const node = visibleNodes[i];
      const data = this.nodeDataCache[node];

      // Resolve font key for this node's font family
      const fontString = data.labelFont || defaultLabelFont;
      let fontKey = fontKeyMap.get(fontString);
      if (fontKey === undefined) {
        const { family, weight, style } = parseFontString(fontString);
        fontKey = this.labelProgram.registerFont?.(family, weight, style) || "";
        fontKeyMap.set(fontString, fontKey);
      }

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
        type: "default",
        zIndex: data.zIndex ?? 0,
        parentType: "node",
        parentKey: node,
        fontKey,
        labelAngle: data.labelAngle ?? 0,
        nodeIndex: this.nodeDataTexture!.getIndex(node),
      };

      // Process label in the program
      const charsProcessed = this.labelProgram.processLabel(node, characterOffset, labelData);
      characterOffset += charsProcessed;
    }

    // Render WebGL labels (programs handle two-pass rendering internally)
    this.labelProgram.invalidateBuffers();
    this.labelProgram.render(params);
  }

  /**
   * Method used to render backdrops (background + shadow) behind nodes with labels.
   * Called from render() before nodes are drawn, so backdrops appear behind.
   *
   * @private
   */
  private renderBackdrops(params: RenderParams, depth?: string): void {
    if (!this.backdropProgram) return;

    // Collect visible backdrop nodes
    const nodes: string[] = [];
    for (const key of this.nodesWithBackdrop) {
      const data = this.nodeDataCache[key];
      if (!data || data.hidden) continue;
      if (depth && data.depth !== depth) continue;
      nodes.push(key);
    }

    if (nodes.length === 0) return;

    this.backdropProgram.reallocate(nodes.length);

    for (let i = 0; i < nodes.length; i++) {
      const key = nodes[i];
      const data = this.nodeDataCache[key];

      // Only include label dimensions when the label is actually displayed
      const labelVisible = this.displayedNodeLabels.has(key);
      let { width: labelWidth, height: labelHeight } = labelVisible
        ? this.measureNodeLabel(data)
        : { width: 0, height: 0 };

      // Expand label dimensions and compute box offset for attachment
      let labelBoxOffsetX = 0;
      let labelBoxOffsetY = 0;
      if (labelVisible && data.labelAttachment && this.attachmentManager) {
        const entry = this.attachmentManager.getEntry(key, data.labelAttachment);
        if (entry) {
          const placement = data.labelAttachmentPlacement || "below";
          if (placement === "below" || placement === "above") {
            const attachH = entry.height / this.pixelRatio;
            labelHeight += attachH + ATTACHMENT_GAP;
            labelWidth = Math.max(labelWidth, entry.width / this.pixelRatio);
            // Shift center to keep original label at top, attachment at bottom (or vice versa)
            labelBoxOffsetY = placement === "below" ? (attachH + ATTACHMENT_GAP) / 2 : -(attachH + ATTACHMENT_GAP) / 2;
          } else {
            const attachW = entry.width / this.pixelRatio;
            labelWidth += attachW + ATTACHMENT_GAP;
            labelHeight = Math.max(labelHeight, entry.height / this.pixelRatio);
            labelBoxOffsetX = placement === "right" ? (attachW + ATTACHMENT_GAP) / 2 : -(attachW + ATTACHMENT_GAP) / 2;
          }
        }
      }

      // Get shapeId
      let shapeId: number;
      if (this.nodeShapeMap && this.nodeGlobalShapeIds) {
        const localIndex = this.nodeShapeMap[data.shape || Object.keys(this.nodeShapeMap)[0]];
        shapeId = this.nodeGlobalShapeIds[localIndex];
      } else {
        shapeId = getShapeId(data.shape || "circle");
      }

      const rawBgColor = data.backdropColor ? colorToArray(data.backdropColor) : [255, 255, 255, 255];
      const rawShadowColor = data.backdropShadowColor ? colorToArray(data.backdropShadowColor) : [0, 0, 0, 128];
      const backdropColor = rawBgColor.map((c) => c / 255) as [number, number, number, number];
      const backdropShadowColor = rawShadowColor.map((c) => c / 255) as [number, number, number, number];
      const backdropShadowBlur = data.backdropShadowBlur ?? 12;
      const backdropPadding = data.backdropPadding ?? 6;

      const rawBorderColor = data.backdropBorderColor ? colorToArray(data.backdropBorderColor) : [0, 0, 0, 0];
      const backdropBorderColor = rawBorderColor.map((c) => c / 255) as [number, number, number, number];
      const backdropBorderWidth = data.backdropBorderWidth ?? 0;
      const backdropCornerRadius = data.backdropCornerRadius ?? 0;
      const rawLabelPadding = data.backdropLabelPadding ?? -1;
      const backdropLabelPadding = rawLabelPadding < 0 ? backdropPadding : rawLabelPadding;
      const backdropArea = BACKDROP_AREA_MAP[data.backdropArea ?? "both"] ?? 0;

      const backdropData: BackdropDisplayData = {
        key,
        x: data.x,
        y: data.y,
        size: data.size,
        label: data.label,
        labelWidth,
        labelHeight,
        type: "default",
        shapeId,
        position: data.labelPosition || "right",
        labelAngle: data.labelAngle ?? 0,
        backdropColor,
        backdropShadowColor,
        backdropShadowBlur,
        backdropPadding,
        backdropBorderColor,
        backdropBorderWidth,
        backdropCornerRadius,
        backdropLabelPadding,
        backdropArea,
        labelBoxOffset: [labelBoxOffsetX, labelBoxOffsetY],
      };

      this.backdropProgram.processBackdrop(i, backdropData);
    }

    this.backdropProgram.invalidateBuffers();
    this.backdropProgram.render(params);
  }

  /**
   * Caches attachment textures for nodes with visible backdrops. Attachments
   * are tied to backdrop visibility — they only render for backdrop nodes.
   * Must be called before renderBackdrops so backdrop sizing includes them.
   */
  private cacheAttachments(depth?: string): void {
    if (!this.attachmentManager) return;

    const pixelRatio = this.pixelRatio;
    for (const key of this.nodesWithBackdrop) {
      if (!this.displayedNodeLabels.has(key)) continue;
      const data = this.nodeDataCache[key];
      if (!data || data.hidden) continue;
      if (depth && data.depth !== depth) continue;
      if (!data.labelAttachment) continue;

      const attrs = this.graph.getNodeAttributes(key);
      const { width: labelWidth, height: labelHeight } = this.measureNodeLabel(data);

      const context: LabelAttachmentContext = {
        node: key,
        attributes: attrs as Record<string, unknown>,
        pixelRatio,
        labelWidth,
        labelHeight,
      };

      this.attachmentManager.renderAttachment(key, data.labelAttachment, context);
    }

    this.attachmentManager.regenerateAtlas();
  }

  private renderAttachments(params: RenderParams, depth?: string): void {
    if (!this.attachmentManager || !this.attachmentProgram) return;

    // Attachments are only rendered for nodes with visible backdrops
    const nodes: { key: string; attachmentName: string }[] = [];
    for (const key of this.nodesWithBackdrop) {
      if (!this.displayedNodeLabels.has(key)) continue;
      const data = this.nodeDataCache[key];
      if (!data || data.hidden) continue;
      if (depth && data.labelDepth !== depth) continue;
      if (!data.labelAttachment) continue;
      nodes.push({ key, attachmentName: data.labelAttachment });
    }

    if (nodes.length === 0) return;

    // Fill program buffer
    let validCount = 0;
    this.attachmentProgram.reallocateAttachments(nodes.length);

    for (const { key, attachmentName } of nodes) {
      const data = this.nodeDataCache[key];
      const entry = this.attachmentManager.getEntry(key, attachmentName);
      if (!entry) continue;

      const nodeIndex = this.nodeIndices[key];
      if (nodeIndex === undefined) continue;

      const { width: labelWidth, height: labelHeight } = this.measureNodeLabel(data);

      const positionMode = POSITION_MODE_MAP[data.labelPosition || "right"] ?? 0;
      const attachmentPlacement = ATTACHMENT_PLACEMENT_MAP[data.labelAttachmentPlacement || "below"] ?? 0;

      // Atlas dimensions are in physical pixels; convert to CSS pixels
      // to match label dimensions from measureNodeLabel.
      const pr = this.pixelRatio;
      this.attachmentProgram.processAttachment(validCount, {
        nodeIndex,
        atlasX: entry.x,
        atlasY: entry.y,
        atlasW: entry.width,
        atlasH: entry.height,
        attachWidth: entry.width / pr,
        attachHeight: entry.height / pr,
        positionMode,
        attachmentPlacement,
        labelWidth,
        labelHeight,
        labelAngle: data.labelAngle ?? 0,
      });
      validCount++;
    }

    if (validCount === 0) return;

    // Set atlas texture and render
    this.attachmentProgram.reallocateAttachments(validCount);
    this.attachmentManager.bindTexture(ATTACHMENT_TEXTURE_UNIT);
    this.attachmentProgram.invalidateBuffers();
    this.attachmentProgram.render(params);
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

    if (!this.edgeLabelProgram) return;

    const displayedLabels = new Set<string>();

    // Collect edges to process and count total characters
    let totalCharacters = 0;
    const edgesToProcess: Array<{
      edge: string;
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

      totalCharacters += edgeData.label.length;
      edgesToProcess.push({
        edge,
        sourceData,
        targetData,
        edgeData,
        sourceKey: extremities[0],
        targetKey: extremities[1],
      });
      displayedLabels.add(edge);
    }

    // Reallocate edge label program
    this.edgeLabelProgram.reallocate(totalCharacters);

    // Process each visible edge label into the program's buffer
    const defaultEdgeLabelSize = 12;
    const defaultEdgeLabelMargin = this.primitives?.edges?.label?.margin ?? 5;
    const defaultEdgeLabelPosition = "over" as const;

    let characterOffset = 0;
    for (const { edge, sourceData, targetData, edgeData, sourceKey, targetKey } of edgesToProcess) {
      // Get node texture indices for source and target nodes
      const sourceNodeIndex = this.nodeDataTexture!.getIndex(sourceKey);
      const targetNodeIndex = this.nodeDataTexture!.getIndex(targetKey);

      // Get edge texture index (already allocated in addEdgeToProgram)
      const edgeIndex = this.edgeDataTexture!.getIndex(edge);

      // Build edge label display data
      const labelData: import("./types").EdgeLabelDisplayData = {
        text: edgeData.label!,
        x: (sourceData.x + targetData.x) / 2,
        y: (sourceData.y + targetData.y) / 2,
        size: defaultEdgeLabelSize,
        color: edgeData.labelColor,
        nodeSize: 0,
        nodeIndex: -1,
        margin: defaultEdgeLabelMargin,
        position: edgeData.labelPosition ?? defaultEdgeLabelPosition,
        hidden: false,
        forceLabel: edgeData.forceLabel ?? false,
        type: "default",
        zIndex: edgeData.zIndex ?? 0,
        parentType: "edge",
        parentKey: edge,
        fontKey: "",
        labelAngle: 0,
        sourceX: sourceData.x,
        sourceY: sourceData.y,
        targetX: targetData.x,
        targetY: targetData.y,
        sourceSize: sourceData.size,
        targetSize: targetData.size,
        sourceShape: sourceData.shape || "circle",
        targetShape: targetData.shape || "circle",
        edgeSize: edgeData.size,
        offset: 0,
        curvature: (edgeData as unknown as { curvature?: number }).curvature || 0,
        sourceNodeIndex,
        targetNodeIndex,
        edgeIndex,
      };

      // Process label in the program
      const charsProcessed = this.edgeLabelProgram.processEdgeLabel(edge, characterOffset, labelData);
      characterOffset += charsProcessed;
    }

    // Render WebGL edge labels
    this.edgeLabelProgram.invalidateBuffers();
    this.edgeLabelProgram.render(params);

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
    if (this.needToProcess) this.process();
    this.needToProcess = false;

    // Do we need to refresh state (styles in-place, no reprocess)?
    if (this.needToRefreshState) this.refreshState();
    this.needToRefreshState = false;
    this.dirtyNodes.clear();
    this.dirtyEdges.clear();
    this.graphStateChanged = false;

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
    this.labelSizeCache.clear();

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

    // Upload layer attribute textures
    this.nodeProgram!.uploadLayerTexture?.();
    (this.edgeProgram as unknown as { uploadAttributeTexture?: () => void })?.uploadAttributeTexture?.();

    // Bind data textures to their respective texture units
    this.nodeDataTexture!.bind(NODE_DATA_TEXTURE_UNIT);
    this.edgeDataTexture!.bind(EDGE_DATA_TEXTURE_UNIT);

    // Pre-compute which node labels will be displayed (needed by both backdrops and labels)
    this.displayedNodeLabels = new Set();
    this.renderedNodeLabels = new Set();
    if (this.settings.renderLabels) {
      this.computeDisplayedNodeLabels();
    }

    // Pre-render pass for custom layers (offscreen work like density splatting)
    // before the depth loop to avoid framebuffer switching mid-loop.
    for (const program of this.customLayerPrograms.values()) {
      if (program.preRender) program.preRender(params);
    }

    // Restore main framebuffer state after any offscreen passes
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width * this.pixelRatio, this.height * this.pixelRatio);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const depthLayers = this.primitives?.depthLayers ?? [...DEFAULT_DEPTH_LAYERS];
    for (const depth of depthLayers) {
      // Custom layer program at this depth
      const customLayer = this.customLayerPrograms.get(depth);
      if (customLayer) customLayer.render(params);

      // Edges in this depth
      const edgeRanges = this.depthRanges.edges[depth];
      if (edgeRanges && (!this.settings.hideEdgesOnMove || !moving)) {
        for (const { offset, count } of edgeRanges) {
          if (count > 0) this.edgeProgram!.render(params, offset, count);
        }
      }

      // Edge labels for this depth
      if (this.settings.renderEdgeLabels && (!this.settings.hideLabelsOnMove || !moving)) {
        this.renderEdgeLabelsWebGL(params, depth);
      }

      // Cache attachment textures before backdrops so backdrop sizing includes them
      this.cacheAttachments(depth);

      // Backdrops for nodes in this depth (before node programs so they appear behind)
      this.renderBackdrops(params, depth);

      // Nodes in this depth
      const nodeRanges = this.depthRanges.nodes[depth];
      if (nodeRanges) {
        for (const { offset, count } of nodeRanges) {
          if (count > 0) this.nodeProgram!.render(params, offset, count);
        }
      }

      // Label attachments for this depth (after nodes, before labels)
      this.renderAttachments(params, depth);

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
      opacity: resolvedStyle.opacity ?? 1,
      labelColor: resolvedStyle.labelColor ?? "#000",
      label: resolvedStyle.label ?? null,
      hidden: resolvedStyle.visibility === "hidden",
      forceLabel: resolvedStyle.labelVisibility === "visible",
      highlighted: nodeState.isHighlighted,
      zIndex: resolvedStyle.zIndex ?? 0,
      depth: resolvedStyle.depth ?? "nodes",
      labelDepth: resolvedStyle.labelDepth ?? "nodeLabels",
      shape: resolvedStyle.shape,
      labelPosition: resolvedStyle.labelPosition,
      labelSize: resolvedStyle.labelSize,
      labelFont: resolvedStyle.labelFont,
      labelAngle: resolvedStyle.labelAngle,
      backdropVisibility: resolvedStyle.backdropVisibility,
      backdropColor: resolvedStyle.backdropColor,
      backdropShadowColor: resolvedStyle.backdropShadowColor,
      backdropShadowBlur: resolvedStyle.backdropShadowBlur,
      backdropPadding: resolvedStyle.backdropPadding,
      backdropBorderColor: resolvedStyle.backdropBorderColor,
      backdropBorderWidth: resolvedStyle.backdropBorderWidth,
      backdropCornerRadius: resolvedStyle.backdropCornerRadius,
      backdropLabelPadding: resolvedStyle.backdropLabelPadding,
      backdropArea: resolvedStyle.backdropArea,
      labelAttachment: resolvedStyle.labelAttachment ?? null,
      labelAttachmentPlacement: resolvedStyle.labelAttachmentPlacement ?? "below",
      cursor: resolvedStyle.cursor,
    };

    // Apply reducer if provided
    if (this.nodeReducer) {
      const reduced = this.nodeReducer(key, data, attrs, nodeState, this.graphState, this.graph);
      data = { ...data, ...reduced };
    }

    // Validate position (after styles + reducer, so all sources have had a chance to provide x/y)
    if (typeof data.x !== "number" || typeof data.y !== "number") {
      throw new Error(
        `Sigma: could not find a valid position (x, y) for node "${key}". ` +
          "Provide coordinates via node attributes, styles, or a nodeReducer.",
      );
    }

    // Set shape for edge clamping and multi-shape program selection
    if (this.nodeShapeMap) {
      // Multi-shape program: use user-specified shape if valid, otherwise use first shape
      if (!data.shape || !(data.shape in this.nodeShapeMap)) {
        data.shape = Object.keys(this.nodeShapeMap)[0];
      }
    } else if (this.nodeShapeSlug) {
      // Single-shape program: use the program's shape slug
      data.shape = this.nodeShapeSlug;
    }

    // Inject declared variables from primitives into display data
    // Variables can come from: styles > graph attributes > default value
    const mutableData = data as unknown as Record<string, unknown>;
    for (const [varName, varDef] of Object.entries(this.nodeVariables)) {
      mutableData[varName] = resolvedStyle[varName] ?? attrs[varName] ?? varDef.default;
    }

    this.nodeDataCache[key] = data;
    this.nodeGraphCoords[key] = { x: data.x, y: data.y };

    // Label:
    // We delete and add if needed because this function is also used from
    // update
    this.nodesWithForcedLabels.delete(key);
    if (data.forceLabel && !data.hidden) this.nodesWithForcedLabels.add(key);

    // Backdrop visibility tracking
    this.nodesWithBackdrop.delete(key);
    if (!data.hidden && data.backdropVisibility === "visible") {
      this.nodesWithBackdrop.add(key);
    }

    // Bucket management for depth ordering (depth encoded into zIndex range)
    const newZIndex =
      this.getDepthOffset(data.depth) +
      Math.max(0, Math.min(this.settings.maxDepthLevels - 1, Math.floor(data.zIndex)));
    const oldZIndex = this.zIndexCache.nodes[key];

    if (oldZIndex !== undefined && oldZIndex !== newZIndex) {
      this.itemBuckets.nodes.moveItem(oldZIndex, newZIndex, key);
    } else if (oldZIndex === undefined) {
      this.itemBuckets.nodes.addItem(newZIndex, key);
    } else {
      this.itemBuckets.nodes.updateItem(newZIndex, key);
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
   * Initialize a node drag session. Called on first pointer movement after downNode.
   * @private
   */
  private startNodeDrag(node: string, moveEvent: MouseCoords): void {
    const allNodes = this.settings.getDraggedNodes(node);

    // Allow cancellation via preventSigmaDefault
    let cancelled = false;
    this.emit("nodeDragStart", {
      node,
      allDraggedNodes: allNodes,
      event: moveEvent,
      preventSigmaDefault() {
        cancelled = true;
      },
    });

    if (cancelled) return;

    // Resolve position attribute names (validated at construction time)
    const { xAttribute, yAttribute } = this.nodeStyleAnalysis;
    const xAttr = xAttribute || "x";
    const yAttr = yAttribute || "y";

    // Snapshot initial positions for absolute-based computation
    const startNodePositions = new Map<string, Coordinates>();
    for (const n of allNodes) {
      startNodePositions.set(n, {
        x: this.graph.getNodeAttribute(n, xAttr) as number,
        y: this.graph.getNodeAttribute(n, yAttr) as number,
      });
    }

    this.dragSession = {
      node,
      allNodes,
      startPosition: this.viewportToGraph(moveEvent),
      startNodePositions,
      xAttr,
      yAttr,
    };

    this.setNodesState(allNodes, { isDragged: true });
  }

  /**
   * End an in-progress drag session. Safe to call when no drag is active.
   * @private
   */
  private endDrag(): void {
    if (this.dragSession) {
      this.setNodesState(this.dragSession.allNodes, { isDragged: false });
    }
    this.pendingDragNode = null;
    this.dragSession = null;
  }

  /**
   * Apply drag displacement to all currently dragged nodes.
   * @private
   */
  private applyNodeDrag(totalDelta: Coordinates): void {
    const { allNodes, startNodePositions, xAttr, yAttr } = this.dragSession!;
    const { dragPositionToAttributes } = this.settings;

    for (const node of allNodes) {
      const startPos = startNodePositions.get(node);
      if (!startPos || !this.graph.hasNode(node)) continue;

      const newPosition = { x: startPos.x + totalDelta.x, y: startPos.y + totalDelta.y };

      if (dragPositionToAttributes) {
        this.graph.mergeNodeAttributes(node, dragPositionToAttributes(newPosition, node) as Partial<N>);
      } else {
        this.graph.setNodeAttribute(node, xAttr, newPosition.x as N[string]);
        this.graph.setNodeAttribute(node, yAttr, newPosition.y as N[string]);
      }
    }
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
        this.itemBuckets.nodes.removeItem(zIndex, key);
        delete this.zIndexCache.nodes[key];
      }
    }
    // Remove from node cache
    delete this.nodeDataCache[key];
    delete this.nodeGraphCoords[key];
    // Remove from node program index
    delete this.nodeProgramIndex[key];
    // Remove from node state
    this.nodeStates.delete(key);
    // Remove from dirty tracking
    this.dirtyNodes.delete(key);
    // Clean up drag state if this node is involved
    if (key === this.pendingDragNode || (this.dragSession && key === this.dragSession.node)) {
      this.endDrag();
    } else if (this.dragSession?.allNodes.includes(key)) {
      this.dragSession.allNodes = this.dragSession.allNodes.filter((n) => n !== key);
      this.dragSession.startNodePositions.delete(key);
    }
    // Remove from hovered
    if (this.hoveredNode === key) this.hoveredNode = null;
    // Remove from forced label
    this.nodesWithForcedLabels.delete(key);
    // Remove from backdrop tracking
    this.nodesWithBackdrop.delete(key);
  }

  /**
   * Returns the parallel group key for an edge, or null for self-loops.
   * The key uses sorted endpoint IDs so A→B and B→A share the same group.
   */
  private getParallelGroupKey(edge: string): string | null {
    const source = this.graph.source(edge);
    const target = this.graph.target(edge);
    if (source === target) return null;
    return source < target ? `${source}\0${target}` : `${target}\0${source}`;
  }

  /**
   * Registers an edge in the parallel edge index and updates states for the group.
   */
  private registerParallelEdge(edge: string): void {
    const groupKey = this.getParallelGroupKey(edge);
    if (!groupKey) return;

    let group = this.parallelEdgeGroups.get(groupKey);
    if (!group) {
      group = [];
      this.parallelEdgeGroups.set(groupKey, group);
    }
    if (!group.includes(edge)) group.push(edge);

    this.edgeToParallelGroupKey.set(edge, groupKey);
    this.sortParallelGroup(group, groupKey);
    this.updateParallelStates(groupKey);
  }

  /**
   * Removes an edge from the parallel edge index and updates sibling states.
   * Uses the reverse lookup so the edge doesn't need to exist in the graph.
   */
  private unregisterParallelEdge(edge: string): void {
    const groupKey = this.edgeToParallelGroupKey.get(edge);
    if (!groupKey) return;

    this.edgeToParallelGroupKey.delete(edge);

    const group = this.parallelEdgeGroups.get(groupKey);
    if (!group) return;

    const idx = group.indexOf(edge);
    if (idx !== -1) group.splice(idx, 1);

    if (group.length === 0) {
      this.parallelEdgeGroups.delete(groupKey);
    } else {
      this.updateParallelStates(groupKey);
    }
  }

  /**
   * Sorts a parallel group by direction: canonical-direction edges first, then reverse.
   */
  private sortParallelGroup(group: string[], groupKey: string): void {
    const canonicalSource = groupKey.split("\0")[0];
    group.sort((a, b) => {
      const aForward = this.graph.source(a) === canonicalSource || !this.graph.isDirected(a) ? 0 : 1;
      const bForward = this.graph.source(b) === canonicalSource || !this.graph.isDirected(b) ? 0 : 1;
      return aForward - bForward;
    });
  }

  /**
   * Updates parallel state fields on all edges in a group.
   */
  private updateParallelStates(groupKey: string): void {
    const group = this.parallelEdgeGroups.get(groupKey);
    if (!group) return;

    const count = group.length;
    for (let i = 0; i < count; i++) {
      const state = this.getEdgeState(group[i]);
      state.parallelIndex = i;
      state.parallelCount = count;
    }
  }

  /**
   * Returns sibling edges in the same parallel group (excluding the given edge).
   * Uses the reverse lookup so the edge doesn't need to exist in the graph.
   */
  private getParallelSiblings(edge: string): string[] {
    const groupKey = this.edgeToParallelGroupKey.get(edge);
    if (!groupKey) return [];
    const group = this.parallelEdgeGroups.get(groupKey);
    if (!group) return [];
    return group.filter((e) => e !== edge);
  }

  /**
   * Rebuilds the entire parallel edge index from scratch.
   */
  private rebuildParallelEdgeIndex(): void {
    this.parallelEdgeGroups.clear();
    this.edgeToParallelGroupKey.clear();

    this.graph.forEachEdge((edge) => {
      const groupKey = this.getParallelGroupKey(edge);
      if (!groupKey) return;

      let group = this.parallelEdgeGroups.get(groupKey);
      if (!group) {
        group = [];
        this.parallelEdgeGroups.set(groupKey, group);
      }
      group.push(edge);
      this.edgeToParallelGroupKey.set(edge, groupKey);
    });

    // Sort each group and update states
    for (const [groupKey, group] of this.parallelEdgeGroups) {
      this.sortParallelGroup(group, groupKey);
      this.updateParallelStates(groupKey);
    }
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
      opacity: resolvedStyle.opacity ?? 1,
      labelColor: resolvedStyle.labelColor ?? "#666",
      label: resolvedStyle.label ?? "",
      hidden: resolvedStyle.visibility === "hidden",
      forceLabel: resolvedStyle.labelVisibility === "visible",
      zIndex: resolvedStyle.zIndex ?? 0,
      depth: resolvedStyle.depth ?? "edges",
      labelDepth: resolvedStyle.labelDepth ?? "edgeLabels",
      path: resolvedStyle.path,
      selfLoopPath: resolvedStyle.selfLoopPath,
      parallelPath: resolvedStyle.parallelPath,
      head: resolvedStyle.head,
      tail: resolvedStyle.tail,
      labelPosition:
        typeof resolvedStyle.labelPosition === "string"
          ? (resolvedStyle.labelPosition as EdgeLabelPosition)
          : undefined,
      cursor: resolvedStyle.cursor,
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

    // Auto-compute spread variable for parallel edges
    if (edgeState.parallelCount > 1 && this.graph.source(key) !== this.graph.target(key)) {
      const pathName = resolvedStyle.parallelPath || resolvedStyle.path;
      const path = this.edgePathsByName.get(pathName);
      if (path?.spread) {
        const spreadFactor = resolvedStyle.parallelSpread ?? 0.25;
        let spreadValue = path.spread.compute(edgeState.parallelIndex, edgeState.parallelCount, spreadFactor);

        // Correct for reverse-direction edges: swapping source/target flips the
        // perpendicular direction, so we negate to keep visual consistency
        const source = this.graph.source(key);
        const target = this.graph.target(key);
        if (this.graph.isDirected(key) && source > target) {
          spreadValue = -spreadValue;
        }

        (data as unknown as Record<string, unknown>)[path.spread.variable] = spreadValue;
      }
    }

    this.edgeDataCache[key] = data;

    // Forced label
    // we filter and re push if needed because this function is also used from
    // update
    this.edgesWithForcedLabels.delete(key);
    if (data.forceLabel && !data.hidden) this.edgesWithForcedLabels.add(key);

    // Bucket management for depth ordering (depth encoded into zIndex range)
    const newZIndex =
      this.getDepthOffset(data.depth) +
      Math.max(0, Math.min(this.settings.maxDepthLevels - 1, Math.floor(data.zIndex)));
    const oldZIndex = this.zIndexCache.edges[key];

    if (oldZIndex !== undefined && oldZIndex !== newZIndex) {
      this.itemBuckets.edges.moveItem(oldZIndex, newZIndex, key);
    } else if (oldZIndex === undefined) {
      this.itemBuckets.edges.addItem(newZIndex, key);
    } else {
      this.itemBuckets.edges.updateItem(newZIndex, key);
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
        this.itemBuckets.edges.removeItem(zIndex, key);
        delete this.zIndexCache.edges[key];
      }
    }
    // Remove from edge cache
    delete this.edgeDataCache[key];
    // Remove from programId index
    delete this.edgeProgramIndex[key];
    // Free edge from edge data texture
    this.edgeDataTexture!.free(key);
    // Remove from edge state
    this.edgeStates.delete(key);
    // Remove from dirty tracking
    this.dirtyEdges.delete(key);
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
    this.nodeGraphCoords = {};
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
    this.parallelEdgeGroups.clear();
    this.edgeToParallelGroupKey.clear();
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
    this.renderedNodeLabels = new Set();
    this.nodeStates.clear();
    this.hoveredNode = null;
    this.nodesWithBackdrop.clear();
    // Reset drag and rescale state (skip setNodesState since nodeStates was just cleared)
    this.pendingDragNode = null;
    this.dragSession = null;
    this.autoRescaleFrozen = false;
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
    this.graphState = createGraphState<GS>(this.customGraphStateDefaults);
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
    // Get the node's texture index (already allocated during processing)
    const textureIndex = this.nodeDataTexture!.getIndex(node);
    this.nodeProgram!.process(fingerprint, position, data, textureIndex, node);
    this.nodeProgram!.invalidateBuffers();
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
    const extremities = this.graph.extremities(edge),
      sourceData = this.nodeDataCache[extremities[0]],
      targetData = this.nodeDataCache[extremities[1]];

    // Get node texture indices for source and target
    const sourceNodeIndex = this.nodeDataTexture!.getIndex(extremities[0]);
    const targetNodeIndex = this.nodeDataTexture!.getIndex(extremities[1]);

    // Allocate edge in edge data texture (or get existing allocation)
    const edgeTextureIndex = this.edgeDataTexture!.allocate(edge);

    // Get program class static properties
    const programStatic = this.edgeProgram!.constructor as unknown as {
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
    const edgeData = data as unknown as {
      path?: string;
      selfLoopPath?: string;
      parallelPath?: string;
      head?: string;
      tail?: string;
    };

    // Select path: self-loops use selfLoopPath, parallel edges use parallelPath, others use path
    const isSelfLoop = this.graph.source(edge) === this.graph.target(edge);
    const isParallel = !isSelfLoop && (this.getEdgeState(edge)?.parallelCount ?? 1) > 1;
    const pathName = isSelfLoop
      ? edgeData.selfLoopPath
      : isParallel && edgeData.parallelPath
        ? edgeData.parallelPath
        : edgeData.path;
    if (pathName && pathNameToIndex?.[pathName] !== undefined) {
      pathId = pathNameToIndex[pathName];
    }

    // Override head index if edge explicitly specifies one (skip "none" — it's the
    // implicit default from DEFAULT_RESOLVED_EDGE_STYLE and shouldn't override the
    // program's defaultHead setting)
    if (edgeData.head && edgeData.head !== "none" && extremityNameToIndex?.[edgeData.head] !== undefined) {
      headId = extremityNameToIndex[edgeData.head];
    }

    // Override tail index if edge explicitly specifies one (same logic)
    if (edgeData.tail && edgeData.tail !== "none" && extremityNameToIndex?.[edgeData.tail] !== undefined) {
      tailId = extremityNameToIndex[edgeData.tail];
    }

    // Get length ratios from the resolved extremities
    const headLengthRatio = extremitiesPool?.[headId]?.length ?? 0;
    const tailLengthRatio = extremitiesPool?.[tailId]?.length ?? 0;

    // Update edge data texture with core edge data
    // Path-specific attributes (curvature, etc.) are stored in a per-program attribute texture
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

    this.edgeProgram!.process(fingerprint, position, sourceData, targetData, data, edgeTextureIndex);
    this.edgeProgram!.invalidateBuffers();
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
      labelPixelSnapping: this.settings.labelPixelSnapping ? 1.0 : 0.0,
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
    }

    // Delete layer element
    element.remove();
    delete this.elements[id];

    return this;
  }

  /**
   * Method returning the main WebGL context used by the renderer.
   */
  getWebGLContext(): WebGL2RenderingContext {
    if (!this.webGLContext) throw new Error("Sigma: WebGL context is not available");
    return this.webGLContext;
  }

  /**
   * Registers a custom layer program to be rendered at the given depth layer position.
   * The depth name must exist in the primitives depthLayers array.
   */
  addCustomLayerProgram(
    depth: string,
    program: {
      render(params: RenderParams): void;
      kill(): void;
      preRender?(params: RenderParams): void;
      cacheData?(): void;
    },
  ): this {
    const depthLayers = this.primitives?.depthLayers ?? [...DEFAULT_DEPTH_LAYERS];
    if (!depthLayers.includes(depth))
      throw new Error(
        `Sigma: cannot add custom layer program at depth "${depth}" — ` +
          `it must be declared in primitives.depthLayers. Current layers: ${depthLayers.join(", ")}`,
      );
    this.customLayerPrograms.set(depth, program);
    this.refresh();
    return this;
  }

  /**
   * Removes a custom layer program previously registered at the given depth.
   */
  removeCustomLayerProgram(depth: string): this {
    const program = this.customLayerPrograms.get(depth);
    if (program) {
      program.kill();
      this.customLayerPrograms.delete(depth);
      this.scheduleRender();
    }
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
   * @return {FullNodeState<NS>} The node's state.
   */
  getNodeState(key: string): FullNodeState<NS> {
    let state = this.nodeStates.get(key);
    if (!state) {
      state = createNodeState<NS>(this.customNodeStateDefaults);
      this.nodeStates.set(key, state);
    }
    return state;
  }

  /**
   * Method returning an edge's state.
   *
   * @param  {string} key - The edge's key.
   * @return {FullEdgeState<ES>} The edge's state.
   */
  getEdgeState(key: string): FullEdgeState<ES> {
    let state = this.edgeStates.get(key);
    if (!state) {
      state = createEdgeState<ES>(this.customEdgeStateDefaults);
      this.edgeStates.set(key, state);
    }
    return state;
  }

  /**
   * Method returning the graph's state.
   *
   * @return {FullGraphState<GS>} The graph's state.
   */
  getGraphState(): FullGraphState<GS> {
    if (this.graphStateFlagsDirty) {
      this.updateGraphStateFromNodes();
      this.updateGraphStateFromEdges();
      this.graphStateFlagsDirty = false;
    }
    return this.graphState;
  }

  /**
   * Method to update a node's state.
   *
   * @param  {string} key - The node's key.
   * @param  {Partial<FullNodeState<NS>>} state - Partial state to merge.
   * @return {this}
   */
  setNodeState(key: string, state: Partial<BaseNodeState> | Partial<FullNodeState<NS>>): this {
    const currentState = this.getNodeState(key);
    if (!hasNewPartialProps(currentState as Record<string, unknown>, state as Record<string, unknown>)) return this;

    const newState = { ...currentState, ...state };
    this.nodeStates.set(key, newState);

    // Track dirty node for selective refresh
    this.dirtyNodes.add(key);

    // Update hovered node tracking for event system
    this.updateHoveredNodeTracking(key, currentState, newState);

    this.graphStateFlagsDirty = true;
    this.scheduleStateRefresh();

    return this;
  }

  /**
   * Method to update an edge's state.
   *
   * @param  {string} key - The edge's key.
   * @param  {Partial<FullEdgeState<ES>>} state - Partial state to merge.
   * @return {this}
   */
  setEdgeState(key: string, state: Partial<BaseEdgeState> | Partial<FullEdgeState<ES>>): this {
    const currentState = this.getEdgeState(key);
    if (!hasNewPartialProps(currentState as Record<string, unknown>, state as Record<string, unknown>)) return this;

    const newState = { ...currentState, ...state };
    this.edgeStates.set(key, newState);

    // Track dirty edge for selective refresh
    this.dirtyEdges.add(key);

    // Update hovered edge tracking for event system
    this.updateHoveredEdgeTracking(key, currentState, newState);

    this.graphStateFlagsDirty = true;
    this.scheduleStateRefresh();

    return this;
  }

  /**
   * Method to update the graph's state.
   *
   * @param  {Partial<FullGraphState<GS>>} state - Partial state to merge.
   * @return {this}
   */
  setGraphState(state: Partial<BaseGraphState> | Partial<FullGraphState<GS>>): this {
    if (!hasNewPartialProps(this.graphState as Record<string, unknown>, state as Record<string, unknown>)) return this;

    this.graphState = { ...this.graphState, ...state };
    this.graphStateChanged = true;

    this.scheduleStateRefresh();

    return this;
  }

  /**
   * Method to update multiple nodes' states at once.
   *
   * @param  {string[]} keys - The nodes' keys.
   * @param  {Partial<FullNodeState<NS>>} state - Partial state to merge.
   * @return {this}
   */
  setNodesState(keys: string[], state: Partial<BaseNodeState> | Partial<FullNodeState<NS>>): this {
    let changed = false;
    for (const key of keys) {
      const currentState = this.getNodeState(key);
      if (!hasNewPartialProps(currentState as Record<string, unknown>, state as Record<string, unknown>)) continue;
      const newState = { ...currentState, ...state };
      this.nodeStates.set(key, newState);
      this.dirtyNodes.add(key);
      this.updateHoveredNodeTracking(key, currentState, newState);
      changed = true;
    }

    if (changed) {
      this.graphStateFlagsDirty = true;
      this.scheduleStateRefresh();
    }

    return this;
  }

  /**
   * Method to update multiple edges' states at once.
   *
   * @param  {string[]} keys - The edges' keys.
   * @param  {Partial<FullEdgeState<ES>>} state - Partial state to merge.
   * @return {this}
   */
  setEdgesState(keys: string[], state: Partial<BaseEdgeState> | Partial<FullEdgeState<ES>>): this {
    let changed = false;
    for (const key of keys) {
      const currentState = this.getEdgeState(key);
      if (!hasNewPartialProps(currentState as Record<string, unknown>, state as Record<string, unknown>)) continue;
      const newState = { ...currentState, ...state };
      this.edgeStates.set(key, newState);
      this.dirtyEdges.add(key);
      this.updateHoveredEdgeTracking(key, currentState, newState);
      changed = true;
    }

    if (changed) {
      this.graphStateFlagsDirty = true;
      this.scheduleStateRefresh();
    }

    return this;
  }

  /**
   * Update the container's CSS cursor based on the currently hovered item,
   * falling back to the stage cursor style.
   */
  private updateContainerCursor(): void {
    if (this.hoveredNode) {
      this.container.style.cursor =
        this.nodeDataCache[this.hoveredNode]?.cursor || this.resolvedStageStyle.cursor || "";
    } else if (this.hoveredEdge) {
      this.container.style.cursor =
        this.edgeDataCache[this.hoveredEdge]?.cursor || this.resolvedStageStyle.cursor || "";
    } else {
      this.container.style.cursor = this.resolvedStageStyle.cursor || "";
    }
  }

  /**
   * Re-evaluate stage styles and apply them to the container.
   */
  private refreshStageStyle(): void {
    this.resolvedStageStyle = evaluateStageStyle(
      this.stylesDeclaration!.stage as Record<string, unknown> | Record<string, unknown>[],
      this.graphState,
    );

    // Apply background
    if (this.resolvedStageStyle.background !== undefined) {
      this.container.style.backgroundColor = this.resolvedStageStyle.background;
    }

    // Apply cursor (respecting hovered item override)
    this.updateContainerCursor();
  }

  /**
   * Update hovered node tracking for event system (enter/leave events).
   */
  private updateHoveredNodeTracking(key: string, oldState: FullNodeState<NS>, newState: FullNodeState<NS>): void {
    if (oldState.isHovered !== newState.isHovered) {
      if (newState.isHovered) {
        // Clear previous hovered node if any
        if (this.hoveredNode && this.hoveredNode !== key) {
          const prevState = this.getNodeState(this.hoveredNode);
          this.nodeStates.set(this.hoveredNode, { ...prevState, isHovered: false });
          this.dirtyNodes.add(this.hoveredNode);
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
  private updateHoveredEdgeTracking(key: string, oldState: FullEdgeState<ES>, newState: FullEdgeState<ES>): void {
    if (oldState.isHovered !== newState.isHovered) {
      if (newState.isHovered) {
        // Clear previous hovered edge if any
        if (this.hoveredEdge && this.hoveredEdge !== key) {
          const prevState = this.getEdgeState(this.hoveredEdge);
          this.edgeStates.set(this.hoveredEdge, { ...prevState, isHovered: false });
          this.dirtyEdges.add(this.hoveredEdge);
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
    let isDragging = false;

    for (const [, state] of this.nodeStates) {
      if (state.isHovered) hasHovered = true;
      if (state.isHighlighted) hasHighlighted = true;
      if (state.isDragged) isDragging = true;
      if (hasHovered && hasHighlighted && isDragging) break;
    }

    // Also check edges for hover
    if (!hasHovered && this.hoveredEdge) hasHovered = true;

    if (
      this.graphState.hasHovered !== hasHovered ||
      this.graphState.hasHighlighted !== hasHighlighted ||
      this.graphState.isDragging !== isDragging
    ) {
      this.graphStateChanged = true;
    }

    this.graphState = {
      ...this.graphState,
      hasHovered,
      hasHighlighted,
      isDragging,
    };
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

    if (this.graphState.hasHovered !== hasHovered) {
      this.graphStateChanged = true;
    }

    this.graphState = {
      ...this.graphState,
      hasHovered,
    };
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
   * Re-evaluate item styles in-place. Uses dependency classification to skip
   * items whose styles can't have changed.
   */
  private refreshState(): void {
    // Recompute graph-level flags from node/edge states (deferred from setState calls)
    if (this.graphStateFlagsDirty) {
      this.updateGraphStateFromNodes();
      this.updateGraphStateFromEdges();
      this.graphStateFlagsDirty = false;
    }

    const needFullNodeRefresh = this.graphStateChanged && this.nodeStyleAnalysis.dependency === "graph-state";
    const needFullEdgeRefresh = this.graphStateChanged && this.edgeStyleAnalysis.dependency === "graph-state";

    // Nodes
    if (needFullNodeRefresh) {
      this.graph.forEachNode((node) => this.refreshNodeState(node));
    } else if (this.nodeStyleAnalysis.dependency !== "static") {
      for (const node of this.dirtyNodes) {
        this.refreshNodeState(node);
      }
    }

    // Edges
    if (needFullEdgeRefresh) {
      this.graph.forEachEdge((edge) => this.refreshEdgeState(edge));
    } else if (this.edgeStyleAnalysis.dependency !== "static") {
      for (const edge of this.dirtyEdges) {
        this.refreshEdgeState(edge);
      }
    }

    // Stage styles
    if (this.graphStateChanged && this.stylesDeclaration?.stage) {
      this.refreshStageStyle();
    }

    this.dirtyNodes.clear();
    this.dirtyEdges.clear();
    this.graphStateChanged = false;
  }

  /**
   * Re-evaluate a single node's style and rewrite its GPU data.
   */
  private refreshNodeState(node: string): void {
    const oldDepth = this.nodeDataCache[node]?.depth;
    const oldAttachment = this.nodeDataCache[node]?.labelAttachment;
    this.updateNode(node);
    const data = this.nodeDataCache[node];

    // Invalidate attachment cache when state changes
    if (this.attachmentManager) {
      if (data.labelAttachment || oldAttachment) {
        this.attachmentManager.invalidateNode(node);
      }
    }

    // Update node data texture (size may change on hover)
    let shapeId: number;
    if (this.nodeShapeMap && this.nodeGlobalShapeIds && data.shape && data.shape in this.nodeShapeMap) {
      shapeId = this.nodeGlobalShapeIds[this.nodeShapeMap[data.shape]];
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
  }

  /**
   * Re-evaluate a single edge's style and rewrite its GPU data.
   */
  private refreshEdgeState(edge: string): void {
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
      this.rebuildParallelEdgeIndex();
      this.graph.forEachEdge((edge) => this.addEdge(edge));
    } else {
      const nodes = opts.partialGraph?.nodes || [];
      for (let i = 0, l = nodes?.length || 0; i < l; i++) {
        const node = nodes[i];
        const oldAttachment = this.nodeDataCache[node]?.labelAttachment;
        // Recompute node's data (ie. apply reducer)
        this.updateNode(node);
        // Invalidate attachment cache since graph attributes may have changed
        if (this.attachmentManager && (this.nodeDataCache[node]?.labelAttachment || oldAttachment)) {
          this.attachmentManager.invalidateNode(node);
        }
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
   * Compute node extent from un-normalized graph coordinates,
   * which accounts for coordinate remapping via styles.
   */
  private computeNodeExtent(): { x: Extent; y: Extent } {
    const coords = this.nodeGraphCoords;
    const keys = Object.keys(coords);
    if (!keys.length) return { x: [0, 1], y: [0, 1] };

    let xMin = Infinity;
    let xMax = -Infinity;
    let yMin = Infinity;
    let yMax = -Infinity;

    for (let i = 0, l = keys.length; i < l; i++) {
      const { x, y } = coords[keys[i]];
      if (x < xMin) xMin = x;
      if (x > xMax) xMax = x;
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;
    }

    return { x: [xMin, xMax], y: [yMin, yMax] };
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
    this.nodeProgram?.kill();
    this.edgeProgram?.kill();
    this.labelProgram?.kill();
    this.edgeLabelProgram?.kill();
    this.backdropProgram?.kill();
    this.attachmentProgram?.kill();
    this.attachmentManager?.kill();
    this.nodeProgram = null;
    this.edgeProgram = null;
    this.labelProgram = null;
    this.edgeLabelProgram = null;
    this.backdropProgram = null;
    this.attachmentProgram = null;
    this.attachmentManager = null;

    // Kill custom layer programs
    for (const program of this.customLayerPrograms.values()) program.kill();
    this.customLayerPrograms.clear();

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
    this.webGLContext = null;
    this.measureContext = null;
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
   * Returns the mouse interaction layer element.
   */
  getMouseLayer(): HTMLElement {
    return this.elements.mouse;
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

    // Node program
    if (this.nodeProgram) {
      buffers.push({ program: "nodes", ...this.nodeProgram.getMemoryStats() });
      const layerStats = (
        this.nodeProgram as { getLayerTextureStats?: () => Omit<TextureStats, "name"> }
      ).getLayerTextureStats?.();
      if (layerStats) {
        textures.push({ name: "nodes:layerAttributes", ...layerStats });
      }
    }
    // Edge program
    if (this.edgeProgram) {
      buffers.push({ program: "edges", ...this.edgeProgram.getMemoryStats() });
      const attrStats = (
        this.edgeProgram as { getAttributeTextureStats?: () => Omit<TextureStats, "name"> | null }
      ).getAttributeTextureStats?.();
      if (attrStats) {
        textures.push({ name: "edges:pathAttributes", ...attrStats });
      }
    }

    // Label programs
    if (this.labelProgram) {
      buffers.push({ program: "labels", ...this.labelProgram.getMemoryStats() });
    }
    if (this.edgeLabelProgram) {
      buffers.push({ program: "edgeLabels", ...this.edgeLabelProgram.getMemoryStats() });
    }

    // Backdrop program
    if (this.backdropProgram) {
      buffers.push({ program: "backdrop", ...this.backdropProgram.getMemoryStats() });
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

    // Node program
    if (this.nodeProgram) {
      buffers.push({ program: "nodes", ...this.nodeProgram.getWriteStats() });
      const layerStats = (
        this.nodeProgram as { getLayerTextureWriteStats?: () => { writes: number; bytesWritten: number } }
      ).getLayerTextureWriteStats?.();
      if (layerStats) {
        textures.push({ name: "nodes:layerAttributes", ...layerStats });
      }
    }
    // Edge program
    if (this.edgeProgram) {
      buffers.push({ program: "edges", ...this.edgeProgram.getWriteStats() });
      const attrStats = (
        this.edgeProgram as { getAttributeTextureWriteStats?: () => { writes: number; bytesWritten: number } | null }
      ).getAttributeTextureWriteStats?.();
      if (attrStats) {
        textures.push({ name: "edges:pathAttributes", ...attrStats });
      }
    }

    // Label programs
    if (this.labelProgram) {
      buffers.push({ program: "labels", ...this.labelProgram.getWriteStats() });
    }
    if (this.edgeLabelProgram) {
      buffers.push({ program: "edgeLabels", ...this.edgeLabelProgram.getWriteStats() });
    }

    // Backdrop program
    if (this.backdropProgram) {
      buffers.push({ program: "backdrop", ...this.backdropProgram.getWriteStats() });
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

    if (this.nodeProgram) {
      this.nodeProgram.resetWriteStats();
      (this.nodeProgram as { resetLayerTextureWriteStats?: () => void }).resetLayerTextureWriteStats?.();
    }
    if (this.edgeProgram) {
      this.edgeProgram.resetWriteStats();
      (this.edgeProgram as { resetAttributeTextureWriteStats?: () => void }).resetAttributeTextureWriteStats?.();
    }
    this.labelProgram?.resetWriteStats();
    this.edgeLabelProgram?.resetWriteStats();
    this.backdropProgram?.resetWriteStats();
  }
}
