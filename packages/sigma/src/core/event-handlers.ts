/**
 * Sigma.js Event Handlers
 * =======================
 *
 * Registers mouse/touch interaction handlers and graph event handlers on behalf
 * of sigma. Extracted here to shrink sigma.ts; sigma creates a context object
 * with bound methods and passes it to these functions.
 *
 * @module
 */
import Graph, { Attributes } from "graphology-types";

import { Settings } from "../settings";
import { Coordinates, Listener, MouseCoords, MouseInteraction, PlainObject, TouchCoords } from "../types";
import { BaseEdgeState, BaseNodeState } from "../types/styles";
import { cleanMouseCoords } from "./captors/captor";
import MouseCaptor from "./captors/mouse";
import TouchCaptor from "./captors/touch";
import { DragManager } from "./drag-manager";
import { EdgeGroupIndex } from "./edge-groups";
import { StateManager } from "./state-manager";
import { StyleAnalysis } from "./styles";

// Partial refresh options (mirrors sigma's refresh() opts)
type RefreshOpts = {
  partialGraph?: { nodes?: string[]; edges?: string[] };
  schedule?: boolean;
  skipIndexation?: boolean;
};

/**
 * Everything the mouse/touch interaction handlers need from sigma.
 * Sigma creates this object inline with bound methods and direct property refs.
 */
export function bindInteractionHandlers<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
>(
  ctx: {
    stateManager: Pick<
      StateManager<unknown, unknown, unknown>,
      "hoveredNode" | "hoveredEdge" | "setHoveredNode" | "setHoveredEdge"
    >;
    getNodeDataCache(): Record<string, { hidden: boolean }>;
    dragManager: DragManager;
    // Getters so handlers always see the latest value after a settings update.
    getSettings(): Pick<
      Settings,
      "enableEdgeEvents" | "enableNodeDrag" | "getDraggedNodes" | "dragPositionToAttributes"
    >;
    getNodeStyleAnalysis(): Pick<StyleAnalysis, "xAttribute" | "yAttribute">;
    // Sigma internals
    getNodeAtPosition(pos: Coordinates): string | null;
    getEdgeAtPoint(x: number, y: number): string | null;
    setNodeState(key: string, state: Partial<BaseNodeState>): void;
    setEdgeState(key: string, state: Partial<BaseEdgeState>): void;
    updateContainerCursor(): void;
    scheduleRefresh(): void;
    viewportToGraph(coords: Coordinates): Coordinates;
    emit(event: string, payload: unknown): void;
  },
  mouseCaptor: MouseCaptor<N, G, E>,
  touchCaptor: TouchCaptor<N, G, E>,
  activeListeners: PlainObject<Listener>,
): void {
  activeListeners.handleResize = () => ctx.scheduleRefresh();
  window.addEventListener("resize", activeListeners.handleResize);

  // Hover detection
  activeListeners.handleMove = (e: MouseCoords | TouchCoords): void => {
    const event = cleanMouseCoords(e);
    const baseEvent = {
      event,
      preventSigmaDefault(): void {
        event.preventSigmaDefault();
      },
    };

    const nodeToHover = ctx.getNodeAtPosition(event);
    if (nodeToHover && ctx.stateManager.hoveredNode !== nodeToHover && !ctx.getNodeDataCache()[nodeToHover]?.hidden) {
      if (ctx.stateManager.hoveredNode) {
        const previousNode = ctx.stateManager.hoveredNode;
        ctx.stateManager.setHoveredNode(nodeToHover);
        ctx.setNodeState(previousNode, { isHovered: false });
        ctx.emit("leaveNode", { ...baseEvent, node: previousNode });
      } else {
        ctx.stateManager.setHoveredNode(nodeToHover);
      }
      ctx.setNodeState(nodeToHover, { isHovered: true });
      ctx.emit("enterNode", { ...baseEvent, node: nodeToHover });
      ctx.updateContainerCursor();
      return;
    }

    if (ctx.stateManager.hoveredNode) {
      if (ctx.getNodeAtPosition(event) !== ctx.stateManager.hoveredNode) {
        const node = ctx.stateManager.hoveredNode;
        ctx.stateManager.setHoveredNode(null);
        ctx.setNodeState(node, { isHovered: false });
        ctx.emit("leaveNode", { ...baseEvent, node });
        ctx.updateContainerCursor();
        return;
      }
    }

    if (ctx.getSettings().enableEdgeEvents) {
      const edgeToHover = ctx.stateManager.hoveredNode ? null : ctx.getEdgeAtPoint(event.x, event.y);

      if (edgeToHover !== ctx.stateManager.hoveredEdge) {
        if (ctx.stateManager.hoveredEdge) {
          ctx.setEdgeState(ctx.stateManager.hoveredEdge, { isHovered: false });
          ctx.emit("leaveEdge", { ...baseEvent, edge: ctx.stateManager.hoveredEdge });
        }
        ctx.stateManager.setHoveredEdge(edgeToHover);
        if (edgeToHover) {
          ctx.setEdgeState(edgeToHover, { isHovered: true });
          ctx.emit("enterEdge", { ...baseEvent, edge: edgeToHover });
        }
        ctx.updateContainerCursor();
      }
    }
  };

  // Drag movement (body-level, fires even outside the canvas)
  activeListeners.handleMoveBody = (e: MouseCoords | TouchCoords): void => {
    const event = cleanMouseCoords(e);
    const { dragManager } = ctx;

    if (dragManager.pendingNode && !dragManager.session) {
      const { xAttribute, yAttribute } = ctx.getNodeStyleAnalysis();
      const settings = ctx.getSettings();
      dragManager.start(dragManager.pendingNode, event, settings.getDraggedNodes, xAttribute || "x", yAttribute || "y");
      dragManager.pendingNode = null;
    }

    if (dragManager.session) {
      dragManager.applyMove(event, ctx.getSettings().dragPositionToAttributes);
      ctx.emit("nodeDrag", {
        node: dragManager.session.node,
        allDraggedNodes: dragManager.session.allNodes,
        event,
      });
      event.preventSigmaDefault();
    }

    ctx.emit("moveBody", {
      event,
      preventSigmaDefault(): void {
        event.preventSigmaDefault();
      },
    });
  };

  activeListeners.handleLeave = (e: MouseCoords | TouchCoords): void => {
    const event = cleanMouseCoords(e);
    const baseEvent = {
      event,
      preventSigmaDefault(): void {
        event.preventSigmaDefault();
      },
    };

    if (ctx.stateManager.hoveredNode) {
      const node = ctx.stateManager.hoveredNode;
      ctx.stateManager.setHoveredNode(null);
      ctx.setNodeState(node, { isHovered: false });
      ctx.emit("leaveNode", { ...baseEvent, node });
    }

    if (ctx.getSettings().enableEdgeEvents && ctx.stateManager.hoveredEdge) {
      const edge = ctx.stateManager.hoveredEdge;
      ctx.stateManager.setHoveredEdge(null);
      ctx.setEdgeState(edge, { isHovered: false });
      ctx.emit("leaveEdge", { ...baseEvent, edge });
    }

    ctx.emit("leaveStage", baseEvent);
  };

  activeListeners.handleEnter = (e: MouseCoords | TouchCoords): void => {
    const event = cleanMouseCoords(e);
    ctx.emit("enterStage", {
      event,
      preventSigmaDefault(): void {
        event.preventSigmaDefault();
      },
    });
  };

  // Click-family events: route to node / edge / stage
  const createInteractionListener = (eventType: MouseInteraction): ((e: MouseCoords | TouchCoords) => void) => {
    return (e) => {
      const event = cleanMouseCoords(e);
      const baseEvent = {
        event,
        preventSigmaDefault: () => {
          event.preventSigmaDefault();
        },
      };

      const nodeAtPosition = ctx.getNodeAtPosition(event);
      if (nodeAtPosition) return ctx.emit(`${eventType}Node`, { ...baseEvent, node: nodeAtPosition });

      if (ctx.getSettings().enableEdgeEvents) {
        const edge = ctx.getEdgeAtPoint(event.x, event.y);
        if (edge) return ctx.emit(`${eventType}Edge`, { ...baseEvent, edge });
      }

      return ctx.emit(`${eventType}Stage`, baseEvent);
    };
  };

  activeListeners.handleClick = createInteractionListener("click");
  activeListeners.handleRightClick = createInteractionListener("rightClick");
  activeListeners.handleDoubleClick = createInteractionListener("doubleClick");
  activeListeners.handleWheel = createInteractionListener("wheel");

  // down: like the generic listener, but also arms the drag manager when a node is hit
  activeListeners.handleDown = (e: MouseCoords | TouchCoords): void => {
    const event = cleanMouseCoords(e);
    const baseEvent = { event, preventSigmaDefault: () => event.preventSigmaDefault() };

    const nodeAtPosition = ctx.getNodeAtPosition(event);
    if (nodeAtPosition) {
      if (ctx.getSettings().enableNodeDrag) ctx.dragManager.pendingNode = nodeAtPosition;
      return ctx.emit("downNode", { ...baseEvent, node: nodeAtPosition });
    }

    if (ctx.getSettings().enableEdgeEvents) {
      const edge = ctx.getEdgeAtPoint(event.x, event.y);
      if (edge) return ctx.emit("downEdge", { ...baseEvent, edge });
    }

    return ctx.emit("downStage", baseEvent);
  };

  // up: like the generic listener, but also ends any active drag session
  activeListeners.handleUp = (e: MouseCoords | TouchCoords): void => {
    const event = cleanMouseCoords(e);
    const baseEvent = { event, preventSigmaDefault: () => event.preventSigmaDefault() };

    const dragResult = ctx.dragManager.end();
    if (dragResult) {
      ctx.emit("nodeDragEnd", { node: dragResult.node, allDraggedNodes: dragResult.allNodes, ...baseEvent });
    }

    const nodeAtPosition = ctx.getNodeAtPosition(event);
    if (nodeAtPosition) return ctx.emit("upNode", { ...baseEvent, node: nodeAtPosition });

    if (ctx.getSettings().enableEdgeEvents) {
      const edge = ctx.getEdgeAtPoint(event.x, event.y);
      if (edge) return ctx.emit("upEdge", { ...baseEvent, edge });
    }

    return ctx.emit("upStage", baseEvent);
  };

  mouseCaptor.on("mousemove", activeListeners.handleMove);
  mouseCaptor.on("mousemovebody", activeListeners.handleMoveBody);
  mouseCaptor.on("click", activeListeners.handleClick);
  mouseCaptor.on("rightClick", activeListeners.handleRightClick);
  mouseCaptor.on("doubleClick", activeListeners.handleDoubleClick);
  mouseCaptor.on("wheel", activeListeners.handleWheel);
  mouseCaptor.on("mousedown", activeListeners.handleDown);
  mouseCaptor.on("mouseup", activeListeners.handleUp);
  mouseCaptor.on("mouseleave", activeListeners.handleLeave);
  mouseCaptor.on("mouseenter", activeListeners.handleEnter);

  touchCaptor.on("touchdown", activeListeners.handleDown);
  touchCaptor.on("touchdown", activeListeners.handleMove);
  touchCaptor.on("touchup", activeListeners.handleUp);
  touchCaptor.on("touchmove", activeListeners.handleMove);
  touchCaptor.on("tap", activeListeners.handleClick);
  touchCaptor.on("doubletap", activeListeners.handleDoubleClick);
  touchCaptor.on("touchmove", activeListeners.handleMoveBody);
}

/**
 * Everything the graph event handlers need from sigma.
 */
export function bindGraphHandlers(
  ctx: {
    graph: Graph;
    edgeGroups: EdgeGroupIndex;
    addNode(key: string): void;
    updateNode(key: string): void;
    removeNode(key: string): void;
    addEdge(key: string): void;
    updateEdge(key: string): void;
    removeEdge(key: string): void;
    clearEdgeState(): void;
    clearNodeState(): void;
    clearEdgeIndices(): void;
    clearNodeIndices(): void;
    refresh(opts?: RefreshOpts): void;
  },
  activeListeners: PlainObject<Listener>,
): void {
  const { graph } = ctx;
  const LAYOUT_IMPACTING_FIELDS = new Set(["x", "y", "zIndex", "type"]);

  activeListeners.eachNodeAttributesUpdatedGraphUpdate = (e: { hints?: { attributes?: string[] } }) => {
    const updatedFields = e.hints?.attributes;
    graph.forEachNode((node) => ctx.updateNode(node));
    const layoutChanged = !updatedFields || updatedFields.some((f) => LAYOUT_IMPACTING_FIELDS.has(f));
    ctx.refresh({ partialGraph: { nodes: graph.nodes() }, skipIndexation: !layoutChanged, schedule: true });
  };

  activeListeners.eachEdgeAttributesUpdatedGraphUpdate = (e: { hints?: { attributes?: string[] } }) => {
    const updatedFields = e.hints?.attributes;
    graph.forEachEdge((edge) => ctx.updateEdge(edge));
    const layoutChanged = updatedFields && ["zIndex", "type"].some((f) => updatedFields?.includes(f));
    ctx.refresh({ partialGraph: { edges: graph.edges() }, skipIndexation: !layoutChanged, schedule: true });
  };

  activeListeners.addNodeGraphUpdate = (payload: { key: string }): void => {
    ctx.addNode(payload.key);
    ctx.refresh({ partialGraph: { nodes: [payload.key] }, skipIndexation: false, schedule: true });
  };

  activeListeners.updateNodeGraphUpdate = (payload: { key: string }): void => {
    ctx.refresh({ partialGraph: { nodes: [payload.key] }, skipIndexation: false, schedule: true });
  };

  activeListeners.dropNodeGraphUpdate = (payload: { key: string }): void => {
    ctx.removeNode(payload.key);
    ctx.refresh({ schedule: true });
  };

  activeListeners.addEdgeGraphUpdate = (payload: { key: string }): void => {
    const edge = payload.key;
    ctx.edgeGroups.register(edge);
    ctx.addEdge(edge);
    const siblings = ctx.edgeGroups.getSiblings(edge);
    for (const sib of siblings) ctx.addEdge(sib);
    ctx.refresh({ partialGraph: { edges: [edge, ...siblings] }, schedule: true });
  };

  activeListeners.updateEdgeGraphUpdate = (payload: { key: string }): void => {
    ctx.refresh({ partialGraph: { edges: [payload.key] }, skipIndexation: false, schedule: true });
  };

  activeListeners.dropEdgeGraphUpdate = (payload: { key: string }): void => {
    const edge = payload.key;
    const siblings = ctx.edgeGroups.getSiblings(edge);
    ctx.edgeGroups.unregister(edge);
    ctx.removeEdge(edge);
    for (const sib of siblings) ctx.addEdge(sib);
    ctx.refresh({ schedule: true });
  };

  activeListeners.clearEdgesGraphUpdate = (): void => {
    ctx.clearEdgeState();
    ctx.clearEdgeIndices();
    ctx.refresh({ schedule: true });
  };

  activeListeners.clearGraphUpdate = (): void => {
    ctx.clearEdgeState();
    ctx.clearNodeState();
    ctx.clearEdgeIndices();
    ctx.clearNodeIndices();
    ctx.refresh({ schedule: true });
  };

  graph.on("nodeAdded", activeListeners.addNodeGraphUpdate);
  graph.on("nodeDropped", activeListeners.dropNodeGraphUpdate);
  graph.on("nodeAttributesUpdated", activeListeners.updateNodeGraphUpdate);
  graph.on("eachNodeAttributesUpdated", activeListeners.eachNodeAttributesUpdatedGraphUpdate);
  graph.on("edgeAdded", activeListeners.addEdgeGraphUpdate);
  graph.on("edgeDropped", activeListeners.dropEdgeGraphUpdate);
  graph.on("edgeAttributesUpdated", activeListeners.updateEdgeGraphUpdate);
  graph.on("eachEdgeAttributesUpdated", activeListeners.eachEdgeAttributesUpdatedGraphUpdate);
  graph.on("edgesCleared", activeListeners.clearEdgesGraphUpdate);
  graph.on("cleared", activeListeners.clearGraphUpdate);
}

export function unbindGraphHandlers(graph: Graph, activeListeners: PlainObject<Listener>): void {
  graph.removeListener("nodeAdded", activeListeners.addNodeGraphUpdate);
  graph.removeListener("nodeDropped", activeListeners.dropNodeGraphUpdate);
  graph.removeListener("nodeAttributesUpdated", activeListeners.updateNodeGraphUpdate);
  graph.removeListener("eachNodeAttributesUpdated", activeListeners.eachNodeAttributesUpdatedGraphUpdate);
  graph.removeListener("edgeAdded", activeListeners.addEdgeGraphUpdate);
  graph.removeListener("edgeDropped", activeListeners.dropEdgeGraphUpdate);
  graph.removeListener("edgeAttributesUpdated", activeListeners.updateEdgeGraphUpdate);
  graph.removeListener("eachEdgeAttributesUpdated", activeListeners.eachEdgeAttributesUpdatedGraphUpdate);
  graph.removeListener("edgesCleared", activeListeners.clearEdgesGraphUpdate);
  graph.removeListener("cleared", activeListeners.clearGraphUpdate);
}
