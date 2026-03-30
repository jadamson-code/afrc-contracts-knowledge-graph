/**
 * Sigma.js Drag Manager
 * =====================
 *
 * Owns node drag session state and applies position updates to the graph.
 * Sigma subscribes to interaction events and delegates drag logic here.
 *
 * @module
 */
import Graph, { Attributes } from "graphology-types";

import { Coordinates, MouseCoords } from "../types";

type DragSession = {
  node: string;
  allNodes: string[];
  startPosition: Coordinates;
  startNodePositions: Map<string, Coordinates>;
  xAttr: string;
  yAttr: string;
};

export class DragManager {
  // Set on pointer-down over a node; actual drag starts on first pointer movement.
  pendingNode: string | null = null;
  session: DragSession | null = null;

  constructor(
    private graph: Graph,
    private viewportToGraph: (coords: Coordinates) => Coordinates,
    private setNodesState: (keys: string[], state: { isDragged: boolean }) => void,
    private emit: (event: string, payload: unknown) => void,
  ) {}

  /**
   * Begin a drag session. Returns false if the drag was cancelled via preventSigmaDefault
   * in the nodeDragStart event.
   */
  start(
    node: string,
    event: MouseCoords,
    getDraggedNodes: (node: string) => string[],
    xAttr: string,
    yAttr: string,
  ): boolean {
    const allNodes = getDraggedNodes(node);

    let cancelled = false;
    this.emit("nodeDragStart", {
      node,
      allDraggedNodes: allNodes,
      event,
      preventSigmaDefault() {
        cancelled = true;
      },
    });
    if (cancelled) return false;

    const startNodePositions = new Map<string, Coordinates>();
    for (const n of allNodes) {
      startNodePositions.set(n, {
        x: this.graph.getNodeAttribute(n, xAttr) as number,
        y: this.graph.getNodeAttribute(n, yAttr) as number,
      });
    }

    this.session = {
      node,
      allNodes,
      startPosition: this.viewportToGraph(event),
      startNodePositions,
      xAttr,
      yAttr,
    };

    this.setNodesState(allNodes, { isDragged: true });
    return true;
  }

  /**
   * Apply the current pointer position to all dragged nodes.
   */
  applyMove(
    event: MouseCoords,
    dragPositionToAttributes: ((position: Coordinates, node: string) => Partial<Attributes>) | null,
  ): void {
    const { allNodes, startNodePositions, startPosition, xAttr, yAttr } = this.session!;
    const currentPosition = this.viewportToGraph(event);
    const totalDelta = {
      x: currentPosition.x - startPosition.x,
      y: currentPosition.y - startPosition.y,
    };

    for (const n of allNodes) {
      const startPos = startNodePositions.get(n);
      if (!startPos || !this.graph.hasNode(n)) continue;

      const newPosition = { x: startPos.x + totalDelta.x, y: startPos.y + totalDelta.y };

      if (dragPositionToAttributes) {
        this.graph.mergeNodeAttributes(n, dragPositionToAttributes(newPosition, n));
      } else {
        this.graph.setNodeAttribute(n, xAttr, newPosition.x);
        this.graph.setNodeAttribute(n, yAttr, newPosition.y);
      }
    }
  }

  /**
   * End the current drag session. Returns the session info for the nodeDragEnd event,
   * or null if there was no active session.
   */
  end(): { node: string; allNodes: string[] } | null {
    this.pendingNode = null;
    if (!this.session) return null;

    const { node, allNodes } = this.session;
    this.setNodesState(allNodes, { isDragged: false });
    this.session = null;
    return { node, allNodes };
  }

  /**
   * Called when a node is removed from the graph. Ends the session if the removed
   * node is the primary dragged node, or removes it from the drag group otherwise.
   */
  removeNode(key: string): void {
    if (key === this.pendingNode) this.pendingNode = null;
    if (!this.session) return;

    if (this.session.node === key) {
      this.setNodesState(this.session.allNodes, { isDragged: false });
      this.session = null;
    } else if (this.session.allNodes.includes(key)) {
      this.session.allNodes = this.session.allNodes.filter((n) => n !== key);
      this.session.startNodePositions.delete(key);
    }
  }

  /**
   * Reset all drag state. Called on graph clear.
   */
  clear(): void {
    this.pendingNode = null;
    this.session = null;
  }
}
