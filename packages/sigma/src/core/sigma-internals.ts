/**
 * Sigma.js Internals
 * ==================
 *
 * The SigmaInternals object gives satellite modules (LabelRenderer,
 * event-handlers) direct access to sigma's shared state. Sigma writes to
 * these plain properties and satellites read them directly.
 *
 * @module
 */
import { Attributes } from "graphology-types";
import Graph from "graphology-types";

import { PrimitivesDeclaration } from "../primitives";
import {
  AttachmentManager,
  BackdropProgram,
  EdgeDataTexture,
  EdgeLabelBackgroundProgram,
  EdgeLabelProgram,
  LabelBackgroundProgram,
  LabelProgram,
  NodeDataTexture,
} from "../rendering";
import { AttachmentProgram } from "../rendering";
import { Settings } from "../settings";
import { CameraState, Coordinates, Dimensions, EdgeDisplayData, NodeDisplayData } from "../types";
import { BaseEdgeState, BaseNodeState } from "../types/styles";
import { DragManager } from "./drag-manager";
import { StyleAnalysis } from "./styles";

export type SigmaInternals<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
> = {
  // Data caches (sigma reassigns these on graph events)
  nodeDataCache: Record<string, NodeDisplayData>;
  edgeDataCache: Record<string, EdgeDisplayData>;
  nodesWithForcedLabels: Set<string>;
  nodesWithBackdrop: Set<string>;
  edgesWithForcedLabels: Set<string>;
  nodeIndices: Record<string, number>;
  // Settings and configuration
  settings: Settings;
  primitives: PrimitivesDeclaration | null;
  pixelRatio: number;
  // Graph and managers
  graph: Graph<N, E, G>;
  stateManager: {
    hoveredNode: string | null;
    hoveredEdge: string | null;
    hoveredLabel: string | null;
    setHoveredNode(key: string | null): void;
    setHoveredEdge(key: string | null): void;
    setHoveredLabel(key: string | null): void;
    getNodeState(key: string): BaseNodeState;
  };
  dragManager: DragManager;
  nodeStyleAnalysis: StyleAnalysis;
  // WebGL programs
  labelProgram: LabelProgram<string, N, E, G> | null;
  edgeLabelProgram: EdgeLabelProgram<string, N, E, G> | null;
  edgeLabelBackgroundProgram: EdgeLabelBackgroundProgram<string, N, E, G> | null;
  backdropProgram: BackdropProgram<string, N, E, G> | null;
  labelBackgroundProgram: LabelBackgroundProgram<string, N, E, G> | null;
  attachmentManager: AttachmentManager | null;
  attachmentProgram: AttachmentProgram<N, E, G> | null;
  nodeDataTexture: NodeDataTexture | null;
  edgeDataTexture: EdgeDataTexture | null;
  nodeShapeMap: Record<string, number> | null;
  nodeGlobalShapeIds: number[] | null;
  // Sigma methods
  getDimensions(): Dimensions;
  getGraphDimensions(): Dimensions;
  getStagePadding(): number;
  getCameraState(): CameraState;
  getNodeAtPosition(pos: Coordinates): string | null;
  getEdgeAtPoint(x: number, y: number): string | null;
  getLabelAtPosition(x: number, y: number): string | null;
  setNodeState(key: string, state: Partial<BaseNodeState>): void;
  setEdgeState(key: string, state: Partial<BaseEdgeState>): void;
  updateContainerCursor(): void;
  scheduleRefresh(): void;
  viewportToFramedGraph(coords: Coordinates): Coordinates;
  viewportToGraph(coords: Coordinates): Coordinates;
  framedGraphToViewport(coords: Coordinates): Coordinates;
  scaleSize(size?: number): number;
  emit(event: string, payload: unknown): void;
};
