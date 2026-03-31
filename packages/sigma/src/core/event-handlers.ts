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

import { Listener, MouseCoords, MouseInteraction, PlainObject, TouchCoords } from "../types";
import { cleanMouseCoords } from "./captors/captor";
import MouseCaptor from "./captors/mouse";
import TouchCaptor from "./captors/touch";
import { EdgeGroupIndex } from "./edge-groups";
import { SigmaInternals } from "./sigma-internals";

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
  internals: SigmaInternals<N, E, G>,
  mouseCaptor: MouseCaptor<N, E, G>,
  touchCaptor: TouchCaptor<N, E, G>,
  activeListeners: PlainObject<Listener>,
): void {
  activeListeners.handleResize = () => internals.scheduleRefresh();
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

    const { stateManager } = internals;
    const nodeToHover = internals.getNodeAtPosition(event);
    if (nodeToHover && stateManager.hoveredNode !== nodeToHover && !internals.nodeDataCache[nodeToHover]?.hidden) {
      if (stateManager.hoveredNode) {
        const previousNode = stateManager.hoveredNode;
        stateManager.setHoveredNode(nodeToHover);
        internals.setNodeState(previousNode, { isHovered: false });
        internals.emit("leaveNode", { ...baseEvent, node: previousNode });
      } else {
        stateManager.setHoveredNode(nodeToHover);
      }
      internals.setNodeState(nodeToHover, { isHovered: true });
      internals.emit("enterNode", { ...baseEvent, node: nodeToHover });
      internals.updateContainerCursor();
      return;
    }

    if (stateManager.hoveredNode) {
      if (internals.getNodeAtPosition(event) !== stateManager.hoveredNode) {
        const node = stateManager.hoveredNode;
        stateManager.setHoveredNode(null);
        internals.setNodeState(node, { isHovered: false });
        internals.emit("leaveNode", { ...baseEvent, node });
        internals.updateContainerCursor();
        return;
      }
    }

    if (internals.settings.enableEdgeEvents) {
      const edgeToHover = stateManager.hoveredNode ? null : internals.getEdgeAtPoint(event.x, event.y);

      if (edgeToHover !== stateManager.hoveredEdge) {
        if (stateManager.hoveredEdge) {
          internals.setEdgeState(stateManager.hoveredEdge, { isHovered: false });
          internals.emit("leaveEdge", { ...baseEvent, edge: stateManager.hoveredEdge });
        }
        stateManager.setHoveredEdge(edgeToHover);
        if (edgeToHover) {
          internals.setEdgeState(edgeToHover, { isHovered: true });
          internals.emit("enterEdge", { ...baseEvent, edge: edgeToHover });
        }
        internals.updateContainerCursor();
      }
    }
  };

  // Drag movement (body-level, fires even outside the canvas)
  activeListeners.handleMoveBody = (e: MouseCoords | TouchCoords): void => {
    const event = cleanMouseCoords(e);
    const { dragManager } = internals;

    if (dragManager.pendingNode && !dragManager.session) {
      const { xAttribute, yAttribute } = internals.nodeStyleAnalysis;
      const { settings } = internals;
      dragManager.start(dragManager.pendingNode, event, settings.getDraggedNodes, xAttribute || "x", yAttribute || "y");
      dragManager.pendingNode = null;
    }

    if (dragManager.session) {
      dragManager.applyMove(event, internals.settings.dragPositionToAttributes);
      internals.emit("nodeDrag", {
        node: dragManager.session.node,
        allDraggedNodes: dragManager.session.allNodes,
        event,
      });
      event.preventSigmaDefault();
    }

    internals.emit("moveBody", {
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

    const { stateManager } = internals;
    if (stateManager.hoveredNode) {
      const node = stateManager.hoveredNode;
      stateManager.setHoveredNode(null);
      internals.setNodeState(node, { isHovered: false });
      internals.emit("leaveNode", { ...baseEvent, node });
    }

    if (internals.settings.enableEdgeEvents && stateManager.hoveredEdge) {
      const edge = stateManager.hoveredEdge;
      stateManager.setHoveredEdge(null);
      internals.setEdgeState(edge, { isHovered: false });
      internals.emit("leaveEdge", { ...baseEvent, edge });
    }

    internals.emit("leaveStage", baseEvent);
  };

  activeListeners.handleEnter = (e: MouseCoords | TouchCoords): void => {
    const event = cleanMouseCoords(e);
    internals.emit("enterStage", {
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

      const nodeAtPosition = internals.getNodeAtPosition(event);
      if (nodeAtPosition) return internals.emit(`${eventType}Node`, { ...baseEvent, node: nodeAtPosition });

      if (internals.settings.enableEdgeEvents) {
        const edge = internals.getEdgeAtPoint(event.x, event.y);
        if (edge) return internals.emit(`${eventType}Edge`, { ...baseEvent, edge });
      }

      return internals.emit(`${eventType}Stage`, baseEvent);
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

    const nodeAtPosition = internals.getNodeAtPosition(event);
    if (nodeAtPosition) {
      if (internals.settings.enableNodeDrag) internals.dragManager.pendingNode = nodeAtPosition;
      return internals.emit("downNode", { ...baseEvent, node: nodeAtPosition });
    }

    if (internals.settings.enableEdgeEvents) {
      const edge = internals.getEdgeAtPoint(event.x, event.y);
      if (edge) return internals.emit("downEdge", { ...baseEvent, edge });
    }

    return internals.emit("downStage", baseEvent);
  };

  // up: like the generic listener, but also ends any active drag session
  activeListeners.handleUp = (e: MouseCoords | TouchCoords): void => {
    const event = cleanMouseCoords(e);
    const baseEvent = { event, preventSigmaDefault: () => event.preventSigmaDefault() };

    const dragResult = internals.dragManager.end();
    if (dragResult) {
      internals.emit("nodeDragEnd", { node: dragResult.node, allDraggedNodes: dragResult.allNodes, ...baseEvent });
    }

    const nodeAtPosition = internals.getNodeAtPosition(event);
    if (nodeAtPosition) return internals.emit("upNode", { ...baseEvent, node: nodeAtPosition });

    if (internals.settings.enableEdgeEvents) {
      const edge = internals.getEdgeAtPoint(event.x, event.y);
      if (edge) return internals.emit("upEdge", { ...baseEvent, edge });
    }

    return internals.emit("upStage", baseEvent);
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
