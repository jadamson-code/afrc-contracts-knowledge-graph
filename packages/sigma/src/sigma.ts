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
  AbstractEdgeLabelProgram,
  AbstractEdgeProgram,
  AbstractHoverProgram,
  AbstractLabelProgram,
  AbstractNodeProgram,
  BucketCollection,
  EdgeDataTexture,
  EdgeProgramType,
  getShapeId,
  HoverDisplayData,
  HoverProgramType,
  LabelProgramType,
  NodeDataTexture,
  NodeProgramType,
} from "./rendering";
import { Settings, resolveSettings, validateSettings } from "./settings";
import {
  CameraState,
  CoordinateConversionOverride,
  Coordinates,
  Dimensions,
  EdgeDisplayData,
  Extent,
  LabelDisplayData,
  Listener,
  MouseCoords,
  MouseInteraction,
  NodeDisplayData,
  PlainObject,
  RenderParams,
  SigmaEvents,
  TouchCoords,
  TypedEventEmitter,
} from "./types";
import {
  NormalizationFunction,
  colorToIndex,
  createElement,
  createNormalizationFunction,
  extend,
  getMatrixImpact,
  getPixelColor,
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
 * Important functions.
 */
function applyNodeDefaults<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
>(settings: Settings<N, E, G>, key: string, data: Partial<NodeDisplayData>): NodeDisplayData {
  if (!hasOwnProperty.call(data, "x") || !hasOwnProperty.call(data, "y"))
    throw new Error(
      `Sigma: could not find a valid position (x, y) for node "${key}". All your nodes must have a number "x" and "y". Maybe your forgot to apply a layout or your "nodeReducer" is not returning the correct data?`,
    );

  if (!data.color) data.color = settings.defaultNodeColor;

  if (!data.label && data.label !== "") data.label = null;

  if (data.label !== undefined && data.label !== null) data.label = "" + data.label;
  else data.label = null;

  if (!data.size) data.size = 2;

  if (!hasOwnProperty.call(data, "hidden")) data.hidden = false;

  if (!hasOwnProperty.call(data, "highlighted")) data.highlighted = false;

  if (!hasOwnProperty.call(data, "forceLabel")) data.forceLabel = false;

  if (!data.type || data.type === "") data.type = settings.defaultNodeType;

  if (!data.zIndex) data.zIndex = 0;

  return data as NodeDisplayData;
}

function applyEdgeDefaults<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
>(settings: Settings<N, E, G>, _key: string, data: Partial<EdgeDisplayData>): EdgeDisplayData {
  if (!data.color) data.color = settings.defaultEdgeColor;

  if (!data.label) data.label = "";

  if (!data.size) data.size = 0.5;

  if (!hasOwnProperty.call(data, "hidden")) data.hidden = false;

  if (!hasOwnProperty.call(data, "forceLabel")) data.forceLabel = false;

  if (!data.type || data.type === "") data.type = settings.defaultEdgeType;

  if (!data.zIndex) data.zIndex = 0;

  return data as EdgeDisplayData;
}

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
> extends TypedEventEmitter<SigmaEvents> {
  private settings: Settings<N, E, G>;
  private graph: Graph<N, E, G>;
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

  // Indices to keep track of the index of the item inside programs
  private nodeProgramIndex: Record<string, number> = {};
  private edgeProgramIndex: Record<string, number> = {};
  private nodesWithForcedLabels: Set<string> = new Set<string>();
  private edgesWithForcedLabels: Set<string> = new Set<string>();
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
  private highlightedNodes: Set<string> = new Set();
  private hoveredNode: string | null = null;
  private hoveredEdge: string | null = null;

  // Internal states
  private renderFrame: number | null = null;
  private renderHighlightedNodesFrame: number | null = null;
  private needToProcess = false;
  private checkEdgesEventsFrame: number | null = null;

  // Programs
  private nodePrograms: { [key: string]: AbstractNodeProgram<N, E, G> } = {};
  private nodeHoverPrograms: { [key: string]: AbstractNodeProgram<N, E, G> } = {};
  private hoverPrograms: { [key: string]: AbstractHoverProgram<N, E, G> } = {};
  private edgePrograms: { [key: string]: AbstractEdgeProgram<N, E, G> } = {};
  private labelPrograms: { [key: string]: AbstractLabelProgram<N, E, G> } = {};
  private edgeLabelPrograms: { [key: string]: AbstractEdgeLabelProgram<N, E, G> } = {};

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

  private camera: Camera;

  constructor(graph: Graph<N, E, G>, container: HTMLElement, settings: Partial<Settings<N, E, G>> = {}) {
    super();

    // Resolving settings
    this.settings = resolveSettings(settings);

    // Validating
    validateSettings(this.settings);
    validateGraph(graph);
    if (!(container instanceof HTMLElement)) throw new Error("Sigma: container should be an html element.");

    // Properties
    this.graph = graph;
    this.container = container;

    // Initialize bucket collections with maxDepthLevels setting
    this.itemBuckets = {
      nodes: new BucketCollection(this.settings.maxDepthLevels),
      edges: new BucketCollection(this.settings.maxDepthLevels),
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

    // Loading programs
    for (const type in this.settings.nodeProgramClasses) {
      this.registerNodeProgram(type, this.settings.nodeProgramClasses[type]);
    }

    for (const type in this.settings.edgeProgramClasses) {
      this.registerEdgeProgram(type, this.settings.edgeProgramClasses[type]);
    }

    // Initialize WebGL labels
    this.initializeWebGLLabels();

    // Initializing the camera
    this.camera = new Camera();

    // Binding camera events
    this.bindCameraHandlers();

    // Initializing captors
    this.mouseCaptor = new MouseCaptor(this.elements.mouse, this);
    this.mouseCaptor.setSettings(this.settings);
    this.touchCaptor = new TouchCaptor(this.elements.mouse, this);
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
    if (this.nodeHoverPrograms[key]) this.nodeHoverPrograms[key].kill();
    this.nodePrograms[key] = new NodeProgramClass(this.webGLContext!, null, this);
    this.nodeHoverPrograms[key] = new NodeProgramClass(this.webGLContext!, null, this);
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

    // Register the associated hover program if the node program has one
    const HoverProgramClass = NodeProgramClass.HoverProgram as HoverProgramType<N, E, G> | undefined;
    if (HoverProgramClass) {
      this.registerHoverProgram(key, HoverProgramClass);
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
    this.edgePrograms[key] = new EdgeProgramClass(this.webGLContext!, null, this);
    // Register program type with bucket collection (stride will be set properly when used)
    this.itemBuckets.edges.registerProgram(key, 1);

    // Register edge label program if the edge program has one
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const LabelProgram = (EdgeProgramClass as any).LabelProgram;
    if (LabelProgram) {
      if (this.edgeLabelPrograms[key]) this.edgeLabelPrograms[key].kill();
      this.edgeLabelPrograms[key] = new LabelProgram(this.webGLContext!, null, this);
    }

    return this;
  }

  /**
   * Internal function used to unregister a node program
   *
   * @param  {string} key - The program's key, matching the related nodes "type" values.
   * @return {Sigma}
   */
  private unregisterNodeProgram(key: string): this {
    if (this.nodePrograms[key]) {
      const { [key]: program, ...programs } = this.nodePrograms;
      program.kill();
      this.nodePrograms = programs;
    }
    if (this.nodeHoverPrograms[key]) {
      const { [key]: program, ...programs } = this.nodeHoverPrograms;
      program.kill();
      this.nodeHoverPrograms = programs;
    }
    // Unregister the associated label program
    this.unregisterLabelProgram(key);
    // Unregister the associated hover program
    this.unregisterHoverProgram(key);
    return this;
  }

  /**
   * Internal function used to unregister an edge program
   *
   * @param  {string} key - The program's key, matching the related edges "type" values.
   * @return {Sigma}
   */
  private unregisterEdgeProgram(key: string): this {
    if (this.edgePrograms[key]) {
      const { [key]: program, ...programs } = this.edgePrograms;
      program.kill();
      this.edgePrograms = programs;
    }
    // Also unregister the associated edge label program
    if (this.edgeLabelPrograms[key]) {
      const { [key]: program, ...programs } = this.edgeLabelPrograms;
      program.kill();
      this.edgeLabelPrograms = programs;
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

    // Register default font from settings
    this.sdfAtlas.registerFont({
      family: this.settings.labelFont,
      weight: this.settings.labelWeight,
      style: this.settings.labelStyle,
    });

    // Note: Label programs are automatically registered when node programs are registered.
    // The NodeProgram.LabelProgram static property provides the label renderer for each node type.

    // Register any additional label programs from settings (for custom labels not tied to node types)
    for (const type in this.settings.labelProgramClasses) {
      this.registerLabelProgram(type, this.settings.labelProgramClasses[type]);
    }
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
    this.labelPrograms[key] = new LabelProgramClass(this.webGLContext!, null, this);
    return this;
  }

  /**
   * Internal function used to unregister a label program.
   *
   * @param  {string} key - The program's key, matching the related labels "type" values.
   * @return {Sigma}
   */
  private unregisterLabelProgram(key: string): this {
    if (this.labelPrograms[key]) {
      const { [key]: program, ...programs } = this.labelPrograms;
      program.kill();
      this.labelPrograms = programs;
    }
    return this;
  }

  /**
   * Internal function used to register a hover program
   *
   * @param  {string}           key               - The program's key, matching the related node "type" values.
   * @param  {HoverProgramType} HoverProgramClass - A hover program class.
   * @return {Sigma}
   */
  private registerHoverProgram(key: string, HoverProgramClass: HoverProgramType<N, E, G>): this {
    if (this.hoverPrograms[key]) this.hoverPrograms[key].kill();
    this.hoverPrograms[key] = new HoverProgramClass(this.webGLContext!, null, this);
    return this;
  }

  /**
   * Internal function used to unregister a hover program.
   *
   * @param  {string} key - The program's key, matching the related node "type" values.
   * @return {Sigma}
   */
  private unregisterHoverProgram(key: string): this {
    if (this.hoverPrograms[key]) {
      const { [key]: program, ...programs } = this.hoverPrograms;
      program.kill();
      this.hoverPrograms = programs;
    }
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

    const color = getPixelColor(gl, this.pickingFrameBuffer, x, y, this.pixelRatio, this.settings.pickingDownSizingRatio);
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
        if (this.hoveredNode) this.emit("leaveNode", { ...baseEvent, node: this.hoveredNode });

        this.hoveredNode = nodeToHover;
        this.emit("enterNode", { ...baseEvent, node: nodeToHover });
        this.scheduleHighlightedNodesRender();
        return;
      }

      // Checking if the hovered node is still hovered
      if (this.hoveredNode) {
        if (this.getNodeAtPosition(event) !== this.hoveredNode) {
          const node = this.hoveredNode;
          this.hoveredNode = null;

          this.emit("leaveNode", { ...baseEvent, node });
          this.scheduleHighlightedNodesRender();
          return;
        }
      }

      if (this.settings.enableEdgeEvents) {
        const edgeToHover = this.hoveredNode ? null : this.getEdgeAtPoint(baseEvent.event.x, baseEvent.event.y);

        if (edgeToHover !== this.hoveredEdge) {
          if (this.hoveredEdge) this.emit("leaveEdge", { ...baseEvent, edge: this.hoveredEdge });
          if (edgeToHover) this.emit("enterEdge", { ...baseEvent, edge: edgeToHover });
          this.hoveredEdge = edgeToHover;
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
        this.emit("leaveNode", { ...baseEvent, node: this.hoveredNode });
        this.scheduleHighlightedNodesRender();
      }

      if (this.settings.enableEdgeEvents && this.hoveredEdge) {
        this.emit("leaveEdge", { ...baseEvent, edge: this.hoveredEdge });
        this.scheduleHighlightedNodesRender();
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

    const color = getPixelColor(gl, this.pickingFrameBuffer, x, y, this.pixelRatio, this.settings.pickingDownSizingRatio);
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
    this.itemBuckets.nodes.forEachBucketByZIndex((programType, _zIndex, bucket) => {
      const items = bucket.getItems();
      const nodeProgram = this.nodePrograms[programType];
      for (const node of items) {
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
    this.itemBuckets.edges.forEachBucketByZIndex((programType, _zIndex, bucket) => {
      const items = bucket.getItems();
      for (const edge of items) {
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
   * @private
   */
  private getLabelColor(data: NodeDisplayData): string {
    const settings = this.settings;
    if (settings.labelColor.attribute && data[settings.labelColor.attribute as keyof NodeDisplayData]) {
      return data[settings.labelColor.attribute as keyof NodeDisplayData] as string;
    }
    return settings.labelColor.color || "#000";
  }

  /**
   * Method that backports potential settings updates where it's needed.
   * @private
   */
  private handleSettingsUpdate(oldSettings?: Settings<N, E, G>): this {
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
      // Check edge programs:
      if (oldSettings.edgeProgramClasses !== settings.edgeProgramClasses) {
        for (const type in settings.edgeProgramClasses) {
          if (settings.edgeProgramClasses[type] !== oldSettings.edgeProgramClasses[type]) {
            this.registerEdgeProgram(type, settings.edgeProgramClasses[type]);
          }
        }
        for (const type in oldSettings.edgeProgramClasses) {
          if (!settings.edgeProgramClasses[type]) this.unregisterEdgeProgram(type);
        }
      }

      // Check node programs:
      if (oldSettings.nodeProgramClasses !== settings.nodeProgramClasses) {
        for (const type in settings.nodeProgramClasses) {
          if (settings.nodeProgramClasses[type] !== oldSettings.nodeProgramClasses[type]) {
            this.registerNodeProgram(type, settings.nodeProgramClasses[type]);
          }
        }
        for (const type in oldSettings.nodeProgramClasses) {
          if (!settings.nodeProgramClasses[type]) this.unregisterNodeProgram(type);
        }
      }

      // Check maxDepthLevels:
      if (oldSettings.maxDepthLevels !== settings.maxDepthLevels) {
        this.itemBuckets.nodes.setMaxDepthLevels(settings.maxDepthLevels);
        this.itemBuckets.edges.setMaxDepthLevels(settings.maxDepthLevels);
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
  private renderWebGLLabels(params: RenderParams): void {
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
    this.displayedNodeLabels = new Set();
    const visibleNodes: string[] = [];

    for (let i = 0, l = labelsToDisplay.length; i < l; i++) {
      const node = labelsToDisplay[i];
      const data = this.nodeDataCache[node];

      if (this.displayedNodeLabels.has(node)) continue;
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
      const labelType = this.labelPrograms[data.type] ? data.type : this.settings.defaultLabelType;
      charactersPerProgram[labelType] = (charactersPerProgram[labelType] || 0) + data.label!.length;
    }

    // Reallocate label programs based on visible character counts
    for (const type in this.labelPrograms) {
      this.labelPrograms[type].reallocate(charactersPerProgram[type] || 0);
    }

    // Process each visible label into its matching program's buffer
    const characterOffsets: Record<string, number> = {};
    for (let i = 0, l = visibleNodes.length; i < l; i++) {
      const node = visibleNodes[i];
      const data = this.nodeDataCache[node];

      const labelType = this.labelPrograms[data.type] ? data.type : this.settings.defaultLabelType;
      const labelProgram = this.labelPrograms[labelType];
      if (!labelProgram) continue;

      // Build label display data
      const labelData: LabelDisplayData = {
        text: data.label!,
        x: data.x,
        y: data.y,
        size: this.settings.labelSize,
        color: this.getLabelColor(data),
        nodeSize: data.size,
        margin: this.settings.labelMargin,
        position: this.settings.defaultLabelPosition,
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
   * Method used to render edge labels using WebGL.
   * Called from render() before nodes are drawn, so edge labels appear under nodes.
   *
   * @private
   */
  private renderEdgeLabelsWebGL(params: RenderParams): void {
    this.renderEdgeLabelsInternal(params);
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
  private renderEdgeLabelsInternal(params: RenderParams): void {
    if (!this.settings.renderEdgeLabels) return;

    const edgeLabelsToDisplay = edgeLabelsToDisplayFromNodes({
      graph: this.graph,
      hoveredNode: this.hoveredNode,
      displayedNodeLabels: this.displayedNodeLabels,
      highlightedNodes: this.highlightedNodes,
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

      if (!edgeData.label) continue;

      // Use the edge's type to find the matching label program
      const labelType = this.edgeLabelPrograms[edgeData.type] ? edgeData.type : this.settings.defaultEdgeType;
      if (!this.edgeLabelPrograms[labelType]) continue;

      charactersPerProgram[labelType] = (charactersPerProgram[labelType] || 0) + edgeData.label.length;
      edgesToProcess.push({ edge, type: labelType, sourceData, targetData, edgeData, sourceKey: extremities[0], targetKey: extremities[1] });
      displayedLabels.add(edge);
    }

    // Reallocate edge label programs based on visible character counts
    for (const type in this.edgeLabelPrograms) {
      this.edgeLabelPrograms[type].reallocate(charactersPerProgram[type] || 0);
    }

    // Process each visible edge label into its matching program's buffer
    const characterOffsets: Record<string, number> = {};
    for (const { edge, type, sourceData, targetData, edgeData, sourceKey, targetKey } of edgesToProcess) {
      const labelProgram = this.edgeLabelPrograms[type];
      if (!labelProgram) continue;

      // Get edge label color
      const labelColor = this.settings.edgeLabelColor;
      let color: string;
      if ("attribute" in labelColor && labelColor.attribute) {
        color = (edgeData as unknown as Record<string, string>)[labelColor.attribute] || labelColor.color || "#000";
      } else {
        color = labelColor.color || "#000";
      }

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
        size: this.settings.edgeLabelSize,
        color,
        nodeSize: 0, // Not applicable for edge labels (use sourceSize/targetSize instead)
        nodeIndex: -1, // Not applicable for edge labels (use sourceNodeIndex/targetNodeIndex instead)
        margin: this.settings.edgeLabelMargin,
        position: this.settings.edgeLabelPosition,
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
   * Method used to render the highlighted nodes.
   * Renders hover backgrounds, labels, and nodes in WebGL.
   *
   * @return {Sigma}
   */
  private renderHighlightedNodes(): void {
    // 1. Collect nodes to render
    const nodesToRender: string[] = [];

    if (this.hoveredNode && !this.nodeDataCache[this.hoveredNode].hidden) {
      nodesToRender.push(this.hoveredNode);
    }

    this.highlightedNodes.forEach((node) => {
      // The hovered node has already been highlighted
      if (node !== this.hoveredNode) nodesToRender.push(node);
    });

    if (nodesToRender.length === 0) return;

    const renderParams = this.getRenderParams();
    // Highlighted nodes don't need to be in the picking buffer (they're already picked)
    // This also prevents visual artifacts when DEBUG_displayPickingLayer is enabled
    renderParams.pickingFrameBuffer = null;

    // 2. Prepare hover data with label dimensions
    const hoverDataByType: Record<string, HoverDisplayData[]> = {};

    nodesToRender.forEach((node) => {
      const data = this.nodeDataCache[node];

      // Measure label dimensions if there's a label
      // These values match the canvas hover implementation in node-hover.ts
      let labelWidth = 0;
      let labelHeight = 0;
      if (data.label) {
        const context = this.canvasContexts.labels;
        const { labelSize, labelFont, labelWeight } = this.settings;
        context.font = `${labelWeight} ${labelSize}px ${labelFont}`;
        const textWidth = context.measureText(data.label).width;
        // Match canvas: boxWidth = textWidth + 5, boxHeight = labelSize + 2*PADDING (PADDING=2)
        labelWidth = Math.round(textWidth + 5);
        labelHeight = Math.round(labelSize + 4);
      }

      // Get shapeId for hover rendering
      // Hover programs use LOCAL indices (0, 1, 2...) in their shader switch statements,
      // not global registry IDs. This is different from node/edge rendering which uses global IDs.
      let shapeId: number;
      const shapeMap = this.nodeTypeShapeMap[data.type];
      if (shapeMap && data.shape && data.shape in shapeMap) {
        // Multi-shape program: use local index directly
        shapeId = shapeMap[data.shape];
      } else {
        // Single-shape program: always use 0 (there's only one shape)
        shapeId = 0;
      }

      const hoverData: HoverDisplayData = {
        key: node,
        x: data.x,
        y: data.y,
        size: data.size,
        label: data.label,
        labelWidth,
        labelHeight,
        type: data.type,
        shapeId,
      };

      if (!hoverDataByType[data.type]) {
        hoverDataByType[data.type] = [];
      }
      hoverDataByType[data.type].push(hoverData);
    });

    // 3. Render hover backgrounds via WebGL (if hover programs are available)
    for (const type in hoverDataByType) {
      const hoverProgram = this.hoverPrograms[type];
      if (hoverProgram) {
        const items = hoverDataByType[type];
        hoverProgram.reallocate(items.length);
        items.forEach((hoverData, index) => {
          hoverProgram.processHover(index, hoverData);
        });
        hoverProgram.render(renderParams);
      }
    }

    // Helper function to render labels for a set of nodes
    const renderLabelsForNodes = (nodes: string[]) => {
      // Count characters per label program type
      const charactersPerProgram: Record<string, number> = {};
      nodes.forEach((node) => {
        const data = this.nodeDataCache[node];
        if (!data.label) return;
        const labelType = this.labelPrograms[data.type] ? data.type : this.settings.defaultLabelType;
        charactersPerProgram[labelType] = (charactersPerProgram[labelType] || 0) + data.label.length;
      });

      // Reallocate label programs based on character counts
      for (const type in this.labelPrograms) {
        this.labelPrograms[type].reallocate(charactersPerProgram[type] || 0);
      }

      // Process each node's label into its matching program's buffer
      const characterOffsets: Record<string, number> = {};
      nodes.forEach((node) => {
        const data = this.nodeDataCache[node];
        if (!data.label) return;

        const labelType = this.labelPrograms[data.type] ? data.type : this.settings.defaultLabelType;
        const labelProgram = this.labelPrograms[labelType];
        if (!labelProgram) return;

        // Build label display data
        const labelData: LabelDisplayData = {
          text: data.label,
          x: data.x,
          y: data.y,
          size: this.settings.labelSize,
          color: this.getLabelColor(data),
          nodeSize: data.size,
          margin: this.settings.labelMargin,
          position: this.settings.defaultLabelPosition,
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
      });

      // Render WebGL labels
      for (const type in this.labelPrograms) {
        this.labelPrograms[type].render(renderParams);
      }
    };

    // Helper function to render nodes
    const renderNodes = (nodes: string[]) => {
      const nodesPerPrograms: Record<string, number> = {};

      // Count nodes per type:
      nodes.forEach((node) => {
        const type = this.nodeDataCache[node].type;
        nodesPerPrograms[type] = (nodesPerPrograms[type] || 0) + 1;
      });
      // Allocate for each type for the proper number of nodes
      for (const type in this.nodeHoverPrograms) {
        this.nodeHoverPrograms[type].reallocate(nodesPerPrograms[type] || 0);
        // Also reset count, to use when rendering:
        nodesPerPrograms[type] = 0;
      }
      // Process all nodes to render:
      nodes.forEach((node) => {
        const data = this.nodeDataCache[node];
        const textureIndex = this.nodeDataTexture!.getNodeIndex(node);
        this.nodeHoverPrograms[data.type].process(0, nodesPerPrograms[data.type]++, data, textureIndex, node);
      });
      // Upload layer textures and render:
      for (const type in this.nodeHoverPrograms) {
        const program = this.nodeHoverPrograms[type];
        program.uploadLayerTexture?.();
        program.render(renderParams);
      }
    };

    // 4. Render nodes on top of hover backgrounds
    renderNodes(nodesToRender);
    // 5. Render labels on top of everything
    renderLabelsForNodes(nodesToRender);
  }

  /**
   * Method used to schedule a hover render.
   * With unified WebGL context, this triggers a full render.
   */
  private scheduleHighlightedNodesRender(): void {
    this.scheduleRender();
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

    // Drawing edges first (so nodes render on top for picking priority)
    // Programs handle two-pass rendering internally (picking then visual)
    if (!this.settings.hideEdgesOnMove || !moving) {
      for (const type in this.edgePrograms) {
        const program = this.edgePrograms[type];
        program.render(params);
      }
    }

    // Drawing edge labels (after edges, before nodes, so they appear under nodes)
    // Edge labels are WebGL-rendered like node labels
    if (this.settings.renderEdgeLabels && (!this.settings.hideLabelsOnMove || !moving)) {
      this.renderEdgeLabelsWebGL(params);
    }

    // Drawing nodes (programs handle two-pass rendering internally)
    for (const type in this.nodePrograms) {
      const program = this.nodePrograms[type];
      program.render(params);
    }

    // Drawing WebGL labels (programs handle two-pass rendering internally)
    // WebGL labels are GPU-accelerated, so they can render during camera movement
    if (this.settings.renderLabels) {
      this.renderWebGLLabels(params);
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
    this.renderHighlightedNodes();

    return exitRender();
  }

  /**
   * Add a node in the internal data structures.
   * @private
   * @param key The node's graphology ID
   */
  private addNode(key: string): void {
    // Node display data resolution:
    //  1. First we get the node's attributes
    //  2. We optionally reduce them using the function provided by the user
    //     Note that this function must return a total object and won't be merged
    //  3. We apply our defaults, while running some vital checks
    //  4. We apply the normalization function
    // We shallow copy node data to avoid dangerous behaviors from reducers
    let attr = Object.assign({}, this.graph.getNodeAttributes(key)) as Partial<NodeDisplayData>;
    if (this.settings.nodeReducer) attr = this.settings.nodeReducer(key, attr as N);
    const data = applyNodeDefaults(this.settings, key, attr);

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

    this.nodeDataCache[key] = data;

    // Label:
    // We delete and add if needed because this function is also used from
    // update
    this.nodesWithForcedLabels.delete(key);
    if (data.forceLabel && !data.hidden) this.nodesWithForcedLabels.add(key);

    // Highlighted:
    // We remove and re add if needed because this function is also used from
    // update
    this.highlightedNodes.delete(key);
    if (data.highlighted && !data.hidden) this.highlightedNodes.add(key);

    // Bucket management for depth ordering
    const maxDepth = this.itemBuckets.nodes.getMaxDepthLevels();
    const newZIndex = Math.max(0, Math.min(maxDepth - 1, Math.floor(data.zIndex)));
    const oldZIndex = this.zIndexCache.nodes[key];

    if (oldZIndex !== undefined && oldZIndex !== newZIndex) {
      // zIndex changed - move between buckets
      // Note: program type changes require full reprocess, so we use data.type for both
      this.itemBuckets.nodes.moveItem(data.type, oldZIndex, data.type, newZIndex, key);
    } else if (oldZIndex === undefined) {
      // New node - add to bucket
      this.itemBuckets.nodes.addItem(data.type, newZIndex, key);
    } else {
      // Same zIndex - mark for update
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
    // Remove from higlighted nodes
    this.highlightedNodes.delete(key);
    // Remove from hovered
    if (this.hoveredNode === key) this.hoveredNode = null;
    // Remove from forced label
    this.nodesWithForcedLabels.delete(key);
  }

  /**
   * Add an edge into the internal data structures.
   * @private
   * @param key The edge's graphology ID
   */
  private addEdge(key: string): void {
    // Edge display data resolution:
    //  1. First we get the edge's attributes
    //  2. We optionally reduce them using the function provided by the user
    //  3. Note that this function must return a total object and won't be merged
    //  4. We apply our defaults, while running some vital checks
    // We shallow copy edge data to avoid dangerous behaviors from reducers
    let attr = Object.assign({}, this.graph.getEdgeAttributes(key)) as Partial<EdgeDisplayData>;
    if (this.settings.edgeReducer) attr = this.settings.edgeReducer(key, attr as E);
    const data = applyEdgeDefaults(this.settings, key, attr);
    this.edgeDataCache[key] = data;

    // Forced label
    // we filter and re push if needed because this function is also used from
    // update
    this.edgesWithForcedLabels.delete(key);
    if (data.forceLabel && !data.hidden) this.edgesWithForcedLabels.add(key);

    // Bucket management for depth ordering
    const maxDepth = this.itemBuckets.edges.getMaxDepthLevels();
    const newZIndex = Math.max(0, Math.min(maxDepth - 1, Math.floor(data.zIndex)));
    const oldZIndex = this.zIndexCache.edges[key];

    if (oldZIndex !== undefined && oldZIndex !== newZIndex) {
      // zIndex changed - move between buckets
      // Note: program type changes require full reprocess, so we use data.type for both
      this.itemBuckets.edges.moveItem(data.type, oldZIndex, data.type, newZIndex, key);
    } else if (oldZIndex === undefined) {
      // New edge - add to bucket
      this.itemBuckets.edges.addItem(data.type, newZIndex, key);
    } else {
      // Same zIndex - mark for update
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
    this.highlightedNodes = new Set();
    // Clear bucket data
    this.itemBuckets.nodes.clearAll();
    this.zIndexCache.nodes = {};
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
    this.highlightedNodes = new Set();
    this.hoveredNode = null;
  }

  /**
   * Clear all graph state related to edges.
   * @private
   */
  private clearEdgeState(): void {
    this.displayedEdgeLabels = new Set();
    this.highlightedNodes = new Set();
    this.hoveredEdge = null;
  }

  /**
   * Clear all graph state.
   * @private
   */
  private clearState(): void {
    this.clearEdgeState();
    this.clearNodeState();
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

    // Get program class static properties
    const edgeProgramClass = this.settings.edgeProgramClasses[data.type];
    const programStatic = edgeProgramClass as unknown as {
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
  getSettings(): Settings<N, E, G> {
    return { ...this.settings };
  }

  /**
   * Method returning the current value for a given setting key.
   *
   * @param  {string} key - The setting key to get.
   * @return {any} The value attached to this setting key or undefined if not found
   */
  getSetting<K extends keyof Settings<N, E, G>>(key: K): Settings<N, E, G>[K] {
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
  setSetting<K extends keyof Settings<N, E, G>>(key: K, value: Settings<N, E, G>[K]): this {
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
  updateSetting<K extends keyof Settings<N, E, G>>(
    key: K,
    updater: (value: Settings<N, E, G>[K]) => Settings<N, E, G>[K],
  ): this {
    this.setSetting(key, updater(this.settings[key]));
    return this;
  }

  /**
   * Method setting multiple settings at once.
   *
   * @param  {Partial<Settings>} settings - The settings to set.
   * @return {Sigma}
   */
  setSettings(settings: Partial<Settings<N, E, G>>): this {
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

    this.highlightedNodes.clear();

    // Clearing frames
    if (this.renderFrame) {
      cancelAnimationFrame(this.renderFrame);
      this.renderFrame = null;
    }

    if (this.renderHighlightedNodesFrame) {
      cancelAnimationFrame(this.renderHighlightedNodesFrame);
      this.renderHighlightedNodesFrame = null;
    }

    // Destroying canvases
    const container = this.container;

    while (container.firstChild) container.removeChild(container.firstChild);

    // Kill programs:
    for (const type in this.nodePrograms) {
      this.nodePrograms[type].kill();
    }
    for (const type in this.nodeHoverPrograms) {
      this.nodeHoverPrograms[type].kill();
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
    for (const type in this.hoverPrograms) {
      this.hoverPrograms[type].kill();
    }
    this.nodePrograms = {};
    this.nodeHoverPrograms = {};
    this.hoverPrograms = {};
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
}
