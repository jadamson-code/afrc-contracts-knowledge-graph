---
title: Attributes
sidebar:
  label: Attributes
---

In sigma.js v4, node and edge appearance is controlled through the **styles** system rather than reading attributes directly from the graph. The styles declaration maps graphology attributes to visual properties using attribute bindings, functions, and conditionals.

## How styles read attributes

The default styles use `{ attribute: "..." }` bindings to read values from graphology node/edge attributes. For example, the default node styles include:

```typescript
{
  x: { attribute: "x" },
  y: { attribute: "y" },
  color: { attribute: "color", defaultValue: "#666" },
  size: { attribute: "size", defaultValue: 10 },
  label: { attribute: "label" },
}
```

This means sigma reads `x`, `y`, `color`, `size`, and `label` from each node's graphology attributes. If an attribute is missing, the `defaultValue` is used.

## Node style properties

These are the built-in style properties available for nodes:

### Position and geometry

| Property | Type     | Description                                                                                        |
| -------- | -------- | -------------------------------------------------------------------------------------------------- |
| `x`      | `number` | X coordinate in graph space                                                                        |
| `y`      | `number` | Y coordinate in graph space                                                                        |
| `size`   | `number` | Node diameter in pixels                                                                            |
| `shape`  | `string` | Shape name (e.g. `"circle"`, `"square"`). Must match a shape declared in `primitives.nodes.shapes` |

### Appearance

| Property     | Type                    | Description                                |
| ------------ | ----------------------- | ------------------------------------------ |
| `color`      | `string`                | Node fill color                            |
| `opacity`    | `number`                | Opacity from 0 (transparent) to 1 (opaque) |
| `visibility` | `"visible" \| "hidden"` | Whether the node is visible                |

### Ordering

| Property | Type     | Description                                                                      |
| -------- | -------- | -------------------------------------------------------------------------------- |
| `depth`  | `string` | Depth layer for render ordering (must match a layer in `primitives.depthLayers`) |
| `zIndex` | `number` | Z-index within the depth layer                                                   |

### Label properties

| Property                   | Type                                                | Description                                                            |
| -------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------- |
| `label`                    | `string`                                            | Label text content                                                     |
| `labelColor`               | `string`                                            | Label text color                                                       |
| `labelSize`                | `number`                                            | Label font size in pixels                                              |
| `labelFont`                | `string`                                            | Label font family (e.g. `"Georgia, serif"`)                            |
| `labelVisibility`          | `"auto" \| "visible" \| "hidden"`                   | `"auto"` uses density-based culling, `"visible"` forces display        |
| `labelPosition`            | `"right" \| "left" \| "above" \| "below" \| "over"` | Label position relative to node                                        |
| `labelAngle`               | `number`                                            | Label rotation angle in radians                                        |
| `labelDepth`               | `string`                                            | Depth layer for label rendering                                        |
| `labelAttachment`          | `string \| null`                                    | Label attachment name (references `primitives.nodes.labelAttachments`) |
| `labelAttachmentPlacement` | `"below" \| "above" \| "left" \| "right"`           | Attachment position relative to label                                  |

### Backdrop properties

Backdrops render a background shape behind nodes and their labels, typically used for hover effects.

| Property               | Type                          | Description                                                   |
| ---------------------- | ----------------------------- | ------------------------------------------------------------- |
| `backdropVisibility`   | `"visible" \| "hidden"`       | Whether the backdrop is shown                                 |
| `backdropColor`        | `string`                      | Backdrop fill color                                           |
| `backdropShadowColor`  | `string`                      | Shadow color                                                  |
| `backdropShadowBlur`   | `number`                      | Shadow blur radius in pixels                                  |
| `backdropPadding`      | `number`                      | Padding around the node and label in pixels                   |
| `backdropBorderColor`  | `string`                      | Border color                                                  |
| `backdropBorderWidth`  | `number`                      | Border width in pixels                                        |
| `backdropCornerRadius` | `number`                      | Corner radius in pixels                                       |
| `backdropLabelPadding` | `number`                      | Label-specific padding (`-1` falls back to `backdropPadding`) |
| `backdropArea`         | `"both" \| "node" \| "label"` | Which area the backdrop covers                                |

## Edge style properties

### Appearance

| Property     | Type                    | Description                                                                              |
| ------------ | ----------------------- | ---------------------------------------------------------------------------------------- |
| `size`       | `number`                | Edge thickness in pixels                                                                 |
| `color`      | `string`                | Edge color                                                                               |
| `opacity`    | `number`                | Opacity from 0 to 1                                                                      |
| `visibility` | `"visible" \| "hidden"` | Whether the edge is visible                                                              |
| `path`       | `string`                | Path type (e.g. `"straight"`, `"curved"`). Must match a path in `primitives.edges.paths` |
| `head`       | `string`                | Head (target) extremity type (e.g. `"arrow"`, `"none"`)                                  |
| `tail`       | `string`                | Tail (source) extremity type                                                             |

### Ordering

| Property | Type     | Description                     |
| -------- | -------- | ------------------------------- |
| `depth`  | `string` | Depth layer for render ordering |
| `zIndex` | `number` | Z-index within the depth layer  |

### Label properties

| Property          | Type                                     | Description                        |
| ----------------- | ---------------------------------------- | ---------------------------------- |
| `label`           | `string`                                 | Label text content                 |
| `labelColor`      | `string`                                 | Label text color                   |
| `labelSize`       | `number`                                 | Label font size in pixels          |
| `labelFont`       | `string`                                 | Label font family                  |
| `labelVisibility` | `"auto" \| "visible" \| "hidden"`        | Label visibility mode              |
| `labelPosition`   | `"over" \| "above" \| "below" \| "auto"` | Position relative to the edge path |
| `labelDepth`      | `string`                                 | Depth layer for label rendering    |

## Custom variables

Additional style properties can be declared via `primitives.nodes.variables` and `primitives.edges.variables`. These are used by custom rendering layers.

```typescript
import { layerFill } from "sigma/rendering";

const renderer = new Sigma(graph, container, {
  primitives: {
    nodes: {
      variables: {
        borderSize: { type: "number", default: 2 },
        borderColor: { type: "color", default: "#ffffff" },
      },
      layers: [layerFill(), layerBorder({ borders: [{ size: "borderSize", color: "borderColor" }] })],
    },
  },
  styles: {
    nodes: {
      borderSize: 3,
      borderColor: { attribute: "borderColor", defaultValue: "#000" },
    },
  },
});
```

Once declared, custom variables can be styled exactly like built-in properties -- with static values, attribute bindings, functions, or conditionals.

## Setting values with styles

Every style property accepts multiple value forms:

```typescript
// Static value
{ color: "#e44" }

// Attribute binding (reads from graphology attributes)
{ color: { attribute: "color", defaultValue: "#666" } }

// Function
{ color: (attrs, state) => state.isHovered ? "#f00" : attrs.color }

// Conditional
{ color: { when: "isHovered", then: "#f00", else: "#666" } }
```

See the [styles and primitives concept page](/concepts/styles-and-primitives/) for a detailed explanation of the styling system.
