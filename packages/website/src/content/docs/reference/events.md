---
title: Events reference
description: Complete list of all sigma.js events and their payloads.
---

Sigma.js utilizes events as a mechanism to execute specific code in response to various actions or changes within a sigma instance.

## Event handling API

Sigma.js's event handling API is modeled after the **[events](https://www.npmjs.com/package/events)** package in Node. Events and their payloads are typed, which benefits TypeScript users.

## Interaction events

All interactive events come with a payload that contains an `event` object with:

- `x` and `y`: Coordinates within the container where the event occurred.
- `original`: The original MouseEvent or TouchEvent.

### Node events

- **enterNode** — mouse enters a node
- **leaveNode** — mouse leaves a node
- **downNode** — mouse button pressed on a node
- **upNode** — mouse button released on a node
- **clickNode** — node clicked
- **rightClickNode** — node right-clicked
- **doubleClickNode** — node double-clicked
- **wheelNode** — mouse wheel on a node

Payload: `{ node: string, event }` where `node` is the node ID.

### Edge events

- **enterEdge** — mouse enters an edge
- **leaveEdge** — mouse leaves an edge
- **downEdge** — mouse button pressed on an edge
- **upEdge** — mouse button released on an edge
- **clickEdge** — edge clicked
- **rightClickEdge** — edge right-clicked
- **doubleClickEdge** — edge double-clicked
- **wheelEdge** — mouse wheel on an edge

Payload: `{ edge: string, event }` where `edge` is the edge ID.

To enable edge events, set `enableEdgeEvents: true` in the sigma settings.

### Stage events

- **enterStage** — mouse enters the stage
- **leaveStage** — mouse leaves the stage
- **downStage** — mouse button pressed on the background
- **upStage** — mouse button released on the background
- **clickStage** — background clicked
- **rightClickStage** — background right-clicked
- **doubleClickStage** — background double-clicked
- **wheelStage** — mouse wheel on the background

Payload: `{ event }`.

## Lifecycle events

- **beforeClear** — emitted before the rendering state is cleared
- **afterClear** — emitted after the rendering state is cleared
- **beforeProcess** — emitted before graph data is processed
- **afterProcess** — emitted after graph data is processed
- **beforeRender** — emitted just before the graph is rendered
- **afterRender** — emitted immediately after the graph has been rendered
- **resize** — emitted when the sigma instance undergoes resizing
- **kill** — emitted when the sigma instance is terminated

These lifecycle events do not come with any payload.

## Drag events

- **nodeDragStart** — a node drag begins
- **nodeDrag** — a node is being dragged
- **nodeDragEnd** — a node drag ends

Payload for `nodeDragStart` and `nodeDragEnd`: `{ node: string, allDraggedNodes: string[], event, preventSigmaDefault() }`.
Payload for `nodeDrag`: `{ node: string, allDraggedNodes: string[], event }`.

## Other events

- **moveBody** — mouse or touch moves over the stage (regardless of target)

Payload: `{ event }`.

## Custom events

Leveraging the `EventEmitter` nature of the sigma instance, developers can emit and listen to custom events:

```javascript
sigma.on("myCustomEvent", ({ data }) => console.log("data", data));
sigma.emit("myCustomEvent", { data: "something something" });
```

In TypeScript:

```typescript
import EventEmitter from "events";

// Cast to EventEmitter to emit custom events:
(sigma as EventEmitter).on("myCustomEvent", ({ data }) => console.log("data", data));
(sigma as EventEmitter).emit("myCustomEvent", { data: "something something" });
```
