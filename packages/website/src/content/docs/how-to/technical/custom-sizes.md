---
title: Custom size handling
description: How to customize how sigma handles node and edge sizes relative to zoom and positions.
sidebar:
  label: "Custom sizes"
---

By default, sigma rescales node and edge sizes to fit the viewport and uses square-root zoom scaling so that elements grow moderately as you zoom in. These defaults work well for most graphs, but some layouts require more control.

## Default behavior

Out of the box, sigma does two things:

1. **Auto-rescale**: Node sizes are rescaled so the smallest and largest nodes fit within a reasonable range, regardless of the raw values in the graph.
2. **Square-root zoom scaling**: When you zoom in, node sizes grow proportionally to the square root of the zoom ratio. This keeps nodes visible at all zoom levels without overwhelming the view.

## Disabling auto-rescale

If your node sizes are already in pixel values and you want sigma to use them as-is:

```typescript
const renderer = new Sigma(graph, container, {
  settings: { autoRescale: false },
});
```

With `autoRescale: false`, a node with `size: 20` will be rendered at exactly 20 pixels (at zoom level 1). This is useful for layouts where sizes have a precise meaning, like pixel-accurate diagrams or fixed grids.

## Custom zoom-to-size function

The `zoomToSizeRatioFunction` setting controls how sizes change as you zoom. The default is `Math.sqrt`:

```typescript
// Default: sizes grow with the square root of the zoom ratio
const renderer = new Sigma(graph, container, {
  settings: { zoomToSizeRatioFunction: Math.sqrt },
});
```

For sizes that stay constant regardless of zoom:

```typescript
const renderer = new Sigma(graph, container, {
  settings: { zoomToSizeRatioFunction: () => 1 },
});
```

For sizes that scale linearly with zoom (items grow and shrink at the same rate as the camera moves):

```typescript
const renderer = new Sigma(graph, container, {
  settings: { zoomToSizeRatioFunction: (ratio) => ratio },
});
```

## Using positions as size reference

By default, sizes are in screen pixels (`itemSizesReference: "screen"`). If you want sizes to be in the same coordinate space as node positions -- so they scale exactly with the camera like the graph itself:

```typescript
const renderer = new Sigma(graph, container, {
  settings: { itemSizesReference: "positions" },
});
```

With `"positions"`, a node with `size: 1` occupies 1 unit in graph space. As you zoom in, it appears larger on screen, and as you zoom out, it shrinks -- just like the distances between nodes.

## When to use these settings

| Scenario                               | Settings                                                 |
| -------------------------------------- | -------------------------------------------------------- |
| Default graph exploration              | (defaults)                                               |
| Pixel-precise layout (dashboard, grid) | `autoRescale: false`                                     |
| Fixed-size markers on a map            | `autoRescale: false`, `zoomToSizeRatioFunction: () => 1` |
| Sizes meaningful in graph space        | `itemSizesReference: "positions"`                        |
| Linear zoom behavior                   | `zoomToSizeRatioFunction: (ratio) => ratio`              |

## Combining settings

These settings compose naturally. For example, to build a grid where each cell is exactly 1 unit wide in graph coordinates:

```typescript
const renderer = new Sigma(graph, container, {
  settings: {
    autoRescale: false,
    itemSizesReference: "positions",
  },
});
```

For a geographic map where markers should stay the same pixel size at every zoom level:

```typescript
const renderer = new Sigma(graph, container, {
  settings: {
    autoRescale: false,
    zoomToSizeRatioFunction: () => 1,
  },
});
```
