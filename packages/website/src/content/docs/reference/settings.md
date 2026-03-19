---
title: Settings
sidebar:
  label: Settings
---

Settings control camera behavior, interaction, and rendering performance. They are separate from [styles](/reference/style-properties/), which handle visual appearance.

Pass settings when creating a sigma instance:

```typescript
const renderer = new Sigma(graph, container, {
  settings: {
    renderEdgeLabels: true,
    enableEdgeEvents: true,
    hideEdgesOnMove: true,
  },
});
```

Update settings at runtime with `renderer.setSettings()`:

```typescript
renderer.setSettings({ hideEdgesOnMove: true });
```

## Rendering

| Setting                  | Type      | Default | Description                                           |
| ------------------------ | --------- | ------- | ----------------------------------------------------- |
| `renderLabels`           | `boolean` | `true`  | Whether to render node labels                         |
| `renderEdgeLabels`       | `boolean` | `false` | Whether to render edge labels                         |
| `enableEdgeEvents`       | `boolean` | `false` | Enable mouse events on edges (has a performance cost) |
| `stagePadding`           | `number`  | `30`    | Padding around the graph in pixels                    |
| `minEdgeThickness`       | `number`  | `1.7`   | Minimum edge thickness in pixels                      |
| `antiAliasingFeather`    | `number`  | `1`     | Anti-aliasing feather amount for WebGL rendering      |
| `pickingDownSizingRatio` | `number`  | `2`     | Down-sizing ratio for the picking framebuffer         |
| `maxDepthLevels`         | `number`  | `20`    | Maximum number of depth levels for z-ordering         |

## Camera

| Setting                     | Type             | Default | Description                                                          |
| --------------------------- | ---------------- | ------- | -------------------------------------------------------------------- |
| `enableCameraZooming`       | `boolean`        | `true`  | Allow zooming with the mouse wheel                                   |
| `enableCameraPanning`       | `boolean`        | `true`  | Allow panning by dragging the background                             |
| `enableCameraRotation`      | `boolean`        | `true`  | Allow camera rotation                                                |
| `enableCameraMouseRotation` | `boolean`        | `true`  | Allow mouse-based camera rotation                                    |
| `minCameraRatio`            | `number \| null` | `null`  | Minimum zoom level (smaller = more zoomed in). `null` means no limit |
| `maxCameraRatio`            | `number \| null` | `null`  | Maximum zoom level (larger = more zoomed out). `null` means no limit |
| `cameraPanBoundaries`       | see below        | `null`  | Constrain the camera panning area                                    |

### Camera pan boundaries

The `cameraPanBoundaries` setting accepts:

- `null` -- no boundaries (default)
- `true` -- automatically constrain to the graph extent
- An object with `tolerance` and/or `boundaries`:

```typescript
{
  tolerance: 0.1,
  boundaries: { x: [-100, 100], y: [-100, 100] }
}
```

## Sizing and scaling

| Setting                   | Type                        | Default     | Description                                                                                                                                  |
| ------------------------- | --------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `itemSizesReference`      | `"screen" \| "positions"`   | `"screen"`  | How node/edge sizes are interpreted. `"screen"`: sizes are in pixels regardless of zoom. `"positions"`: sizes scale with graph coordinates   |
| `zoomToSizeRatioFunction` | `(ratio: number) => number` | `Math.sqrt` | Maps camera zoom ratio to a size scaling factor. Only relevant when `itemSizesReference` is `"screen"`                                       |
| `autoRescale`             | `boolean \| "once"`         | `true`      | Automatically rescale the graph to fit the viewport. `"once"` captures the initial extent and freezes it, useful for drag-and-drop scenarios |
| `autoCenter`              | `boolean`                   | `true`      | Automatically center the graph in the viewport                                                                                               |

## Label optimization

| Setting                      | Type      | Default | Description                                                                           |
| ---------------------------- | --------- | ------- | ------------------------------------------------------------------------------------- |
| `labelRenderedSizeThreshold` | `number`  | `6`     | Minimum rendered node size (in pixels) for its label to be displayed                  |
| `labelDensity`               | `number`  | `1`     | Controls how many labels are shown. Higher values show more labels (must be positive) |
| `labelGridCellSize`          | `number`  | `100`   | Size of the label grid cells used for density-based culling                           |
| `labelPixelSnapping`         | `boolean` | `true`  | Snap label positions to whole pixels for sharper text rendering                       |

## Performance

| Setting            | Type      | Default | Description                                                                                    |
| ------------------ | --------- | ------- | ---------------------------------------------------------------------------------------------- |
| `hideEdgesOnMove`  | `boolean` | `false` | Hide edges while the camera is moving (panning, zooming). Improves performance on large graphs |
| `hideLabelsOnMove` | `boolean` | `false` | Hide labels while the camera is moving                                                         |

## Mouse and touch interaction

| Setting                      | Type     | Default | Description                                                         |
| ---------------------------- | -------- | ------- | ------------------------------------------------------------------- |
| `zoomingRatio`               | `number` | `1.7`   | Zoom factor per mouse wheel step                                    |
| `zoomDuration`               | `number` | `250`   | Zoom animation duration in milliseconds                             |
| `doubleClickZoomingRatio`    | `number` | `2.2`   | Zoom factor on double click                                         |
| `doubleClickZoomingDuration` | `number` | `200`   | Double-click zoom animation duration in milliseconds                |
| `doubleClickTimeout`         | `number` | `300`   | Maximum delay between two clicks to register as a double click (ms) |
| `inertiaDuration`            | `number` | `200`   | Inertia duration after a pan gesture (ms)                           |
| `inertiaRatio`               | `number` | `3`     | Inertia strength multiplier                                         |
| `dragTimeout`                | `number` | `100`   | Delay before a mouse-down is considered a drag (ms)                 |
| `draggedEventsTolerance`     | `number` | `3`     | Pixel tolerance before a click becomes a drag                       |
| `tapMoveTolerance`           | `number` | `10`    | Pixel tolerance for touch tap detection                             |

## Lifecycle

| Setting                 | Type      | Default | Description                                                                |
| ----------------------- | --------- | ------- | -------------------------------------------------------------------------- |
| `allowInvalidContainer` | `boolean` | `false` | Allow creating a sigma instance with an invalid (e.g. zero-size) container |

## Debug

| Setting                     | Type      | Default | Description                                                     |
| --------------------------- | --------- | ------- | --------------------------------------------------------------- |
| `DEBUG_displayPickingLayer` | `boolean` | `false` | Display the picking layer for debugging node/edge hit detection |
