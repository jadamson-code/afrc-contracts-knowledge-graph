---
title: Sigma API
sidebar:
  label: Sigma API
---

The `Sigma` class is the main entry point. It takes a graphology graph, a DOM container, and an options object.

## Constructor

```typescript
new Sigma(graph, container, options?)
```

| Parameter   | Type          | Description                                |
| ----------- | ------------- | ------------------------------------------ |
| `graph`     | `Graph`       | A graphology graph instance                |
| `container` | `HTMLElement` | DOM element with explicit width and height |
| `options`   | `object`      | Optional configuration (see below)         |

### Options

| Property      | Type                    | Description                                                                                                              |
| ------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `primitives`  | `PrimitivesDeclaration` | Shapes, layers, paths, extremities, depth layers. See [Primitives schema](/reference/primitives-schema/)                 |
| `styles`      | `StylesDeclaration`     | Style rules for nodes and edges. See [Styles and primitives](/concepts/styles-and-primitives/)                           |
| `settings`    | `Partial<Settings>`     | Behavior and performance settings. See [Settings](/reference/settings/)                                                  |
| `nodeReducer` | `function`              | Escape hatch for complex node styling. `(key, displayData, attrs, state, graphState, graph) => Partial<NodeDisplayData>` |
| `edgeReducer` | `function`              | Same for edges                                                                                                           |

### Generic type parameters

```typescript
Sigma<N, E, G, NS, ES, GS>;
```

| Parameter | Extends          | Default          | Description           |
| --------- | ---------------- | ---------------- | --------------------- |
| `N`       | `Attributes`     | `Attributes`     | Node attributes type  |
| `E`       | `Attributes`     | `Attributes`     | Edge attributes type  |
| `G`       | `Attributes`     | `Attributes`     | Graph attributes type |
| `NS`      | `BaseNodeState`  | `BaseNodeState`  | Node state type       |
| `ES`      | `BaseEdgeState`  | `BaseEdgeState`  | Edge state type       |
| `GS`      | `BaseGraphState` | `BaseGraphState` | Graph state type      |

## Lifecycle

| Method           | Returns | Description                                                         |
| ---------------- | ------- | ------------------------------------------------------------------- |
| `kill()`         | `void`  | Destroy the instance: release WebGL, remove listeners, clean up DOM |
| `resize(force?)` | `this`  | Resize to container dimensions. `force` bypasses size check         |
| `clear()`        | `this`  | Clear all canvases (emits `beforeClear`/`afterClear`)               |

## Rendering

| Method                   | Returns | Description                                                                          |
| ------------------------ | ------- | ------------------------------------------------------------------------------------ |
| `refresh(opts?)`         | `this`  | Re-process data and render. Options: `{ partialGraph?, skipIndexation?, schedule? }` |
| `scheduleRefresh(opts?)` | `this`  | Debounced: schedule refresh for next animation frame                                 |
| `scheduleRender()`       | `this`  | Debounced: schedule render-only (no re-processing) for next frame                    |

## Node state

| Method                       | Returns | Description                                               |
| ---------------------------- | ------- | --------------------------------------------------------- |
| `getNodeState(key)`          | `NS`    | Get a node's current state                                |
| `setNodeState(key, state)`   | `this`  | Update a node's state (partial merge) and schedule render |
| `setNodesState(keys, state)` | `this`  | Update multiple nodes' state at once                      |

## Edge state

| Method                       | Returns | Description                                                |
| ---------------------------- | ------- | ---------------------------------------------------------- |
| `getEdgeState(key)`          | `ES`    | Get an edge's current state                                |
| `setEdgeState(key, state)`   | `this`  | Update an edge's state (partial merge) and schedule render |
| `setEdgesState(keys, state)` | `this`  | Update multiple edges' state at once                       |

## Graph state

| Method                 | Returns | Description                                                |
| ---------------------- | ------- | ---------------------------------------------------------- |
| `getGraphState()`      | `GS`    | Get the global graph state                                 |
| `setGraphState(state)` | `this`  | Update the graph state (partial merge) and schedule render |

## Display data

| Method                     | Returns                        | Description                                                        |
| -------------------------- | ------------------------------ | ------------------------------------------------------------------ |
| `getNodeDisplayData(key)`  | `NodeDisplayData \| undefined` | Get computed display data for a node (position, size, color, etc.) |
| `getEdgeDisplayData(key)`  | `EdgeDisplayData \| undefined` | Get computed display data for an edge                              |
| `getNodeDisplayedLabels()` | `Set<string>`                  | Get node keys whose labels are currently visible                   |
| `getEdgeDisplayedLabels()` | `Set<string>`                  | Get edge keys whose labels are currently visible                   |

## Coordinate conversion

| Method                          | Returns       | Description                                                             |
| ------------------------------- | ------------- | ----------------------------------------------------------------------- |
| `graphToViewport(coords)`       | `Coordinates` | Convert graph-space coordinates to screen pixels                        |
| `viewportToGraph(coords)`       | `Coordinates` | Convert screen pixels to graph-space coordinates                        |
| `framedGraphToViewport(coords)` | `Coordinates` | Convert normalized (0–1) graph space to screen pixels                   |
| `viewportToFramedGraph(coords)` | `Coordinates` | Convert screen pixels to normalized graph space                         |
| `getGraphToViewportRatio()`     | `number`      | Distance multiplier between graph and viewport spaces                   |
| `viewRectangle()`               | `object`      | Get the visible area in graph coordinates: `{ x1, y1, x2, y2, height }` |

All coordinate methods accept an optional `override` parameter to use custom camera state, matrix, or dimensions instead of the current ones.

## Bounding box

| Method                | Returns                    | Description                                 |
| --------------------- | -------------------------- | ------------------------------------------- |
| `getBBox()`           | `{ x: Extent; y: Extent }` | Get auto-computed graph bounding box        |
| `getCustomBBox()`     | `object \| null`           | Get custom bounding box override, if set    |
| `setCustomBBox(bbox)` | `this`                     | Override the bounding box (`null` to reset) |

## Settings

| Method                   | Returns       | Description                                           |
| ------------------------ | ------------- | ----------------------------------------------------- |
| `getSettings()`          | `Settings`    | Get a copy of all current settings                    |
| `getSetting(key)`        | `Settings[K]` | Get a single setting value                            |
| `setSetting(key, value)` | `this`        | Set a single setting and schedule refresh             |
| `updateSetting(key, fn)` | `this`        | Update a setting with a function and schedule refresh |
| `setSettings(partial)`   | `this`        | Set multiple settings at once                         |

## Graph and container

| Method                 | Returns       | Description                                       |
| ---------------------- | ------------- | ------------------------------------------------- |
| `getGraph()`           | `Graph`       | Get the current graph instance                    |
| `setGraph(graph)`      | `void`        | Replace the graph, rebind handlers, and refresh   |
| `getContainer()`       | `HTMLElement` | Get the DOM container element                     |
| `getDimensions()`      | `Dimensions`  | Get renderer pixel dimensions `{ width, height }` |
| `getGraphDimensions()` | `Dimensions`  | Get graph extent dimensions                       |

## Camera and input

| Method              | Returns       | Description                                                       |
| ------------------- | ------------- | ----------------------------------------------------------------- |
| `getCamera()`       | `Camera`      | Get the camera instance. See [Camera API](/reference/camera-api/) |
| `setCamera(camera)` | `void`        | Replace the camera instance                                       |
| `getMouseCaptor()`  | `MouseCaptor` | Get the mouse event captor                                        |
| `getTouchCaptor()`  | `TouchCaptor` | Get the touch event captor                                        |

## Layers and WebGL

| Method                                  | Returns                  | Description                                                                |
| --------------------------------------- | ------------------------ | -------------------------------------------------------------------------- |
| `getWebGLContext()`                     | `WebGL2RenderingContext` | Get the main WebGL2 context                                                |
| `createCanvas(id, opts?)`               | `HTMLCanvasElement`      | Create and insert a canvas layer. Options: `{ beforeLayer?, afterLayer? }` |
| `createLayer(id, tag, opts?)`           | `HTMLElement`            | Create and insert a DOM element layer                                      |
| `createWebGLContext(id, opts?)`         | `WebGL2RenderingContext` | Create a WebGL2 context with optional picking                              |
| `killLayer(id)`                         | `this`                   | Destroy a layer                                                            |
| `getCanvases()`                         | `object`                 | Get all canvas layers keyed by ID                                          |
| `getMouseLayer()`                       | `HTMLElement`            | Get the mouse interaction layer                                            |
| `addCustomLayerProgram(depth, program)` | `this`                   | Register a custom fullscreen WebGL program at a depth layer                |
| `removeCustomLayerProgram(depth)`       | `this`                   | Unregister and kill a custom layer program                                 |

## Utilities

| Method                           | Returns        | Description                                                             |
| -------------------------------- | -------------- | ----------------------------------------------------------------------- |
| `scaleSize(size?, cameraRatio?)` | `number`       | Convert a size to viewport scale based on zoom and `itemSizesReference` |
| `getStagePadding()`              | `number`       | Get padding applied when `autoRescale` is enabled                       |
| `getRenderParams()`              | `RenderParams` | Get current render parameters (matrix, dimensions, ratios)              |
| `getMemoryStats()`               | `MemoryStats`  | Get WebGL resource memory usage                                         |
| `getWriteStats()`                | `WriteStats`   | Get GPU write statistics since last reset                               |
| `resetWriteStats()`              | `void`         | Reset GPU write counters                                                |
