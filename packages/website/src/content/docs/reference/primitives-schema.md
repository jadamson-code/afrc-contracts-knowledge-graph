---
title: Primitives schema
sidebar:
  label: Primitives schema
---

Primitives declare the rendering pipeline — what shapes, layers, paths, and extremities sigma compiles into WebGL programs. Pass them in the `primitives` option when creating a Sigma instance.

For a conceptual overview, see [Styles and primitives](/concepts/styles-and-primitives/).

## Top-level structure

```typescript
{
  primitives: {
    nodes?: NodePrimitives,
    edges?: EdgePrimitives,
    depthLayers?: string[],
  },
}
```

## Node primitives

```typescript
{
  nodes: {
    shapes?: NodeShapeSpec[],
    layers?: NodeLayerSpec[],
    variables?: VariablesDefinition,
    label?: LabelOptions,
    backdrop?: BackdropOptions,
    labelAttachments?: Record<string, LabelAttachmentRenderer>,
    rotateWithCamera?: boolean,
  },
}
```

### shapes

Array of SDF shape factories. The first is the default. Each node selects its shape via the `shape` style property.

Built-in factories (from `sigma/rendering`):

| Factory            | Name         | Options                      |
| ------------------ | ------------ | ---------------------------- |
| `sdfCircle()`      | `"circle"`   | —                            |
| `sdfSquare(opts?)` | `"square"`   | `cornerRadius?`, `rotation?` |
| `sdfTriangle()`    | `"triangle"` | —                            |
| `sdfDiamond()`     | `"diamond"`  | —                            |

### layers

Array of layer factories composited from back to front. Layers auto-disable when they have no data for a node.

Built-in:

| Factory               | Package                | Description        |
| --------------------- | ---------------------- | ------------------ |
| `layerFill(opts?)`    | `sigma/rendering`      | Solid color fill   |
| `layerBorder(opts)`   | `@sigma/node-border`   | Concentric borders |
| `layerImage(opts?)`   | `@sigma/node-image`    | Image or pictogram |
| `layerPiechart(opts)` | `@sigma/node-piechart` | Pie chart slices   |

### variables

Custom typed attributes that layers can consume and that become available as style properties.

```typescript
variables: {
  borderSize: { type: "number", default: 0 },
  borderColor: { type: "color", default: "transparent" },
}
```

| Field     | Values                                         | Description                             |
| --------- | ---------------------------------------------- | --------------------------------------- |
| `type`    | `"number"`, `"color"`, `"string"`, `"boolean"` | Variable type                           |
| `default` | matches type                                   | Default value when attribute is missing |

### label

Node label rendering options.

| Field      | Type                                  | Description                     |
| ---------- | ------------------------------------- | ------------------------------- |
| `font`     | `{ family?, weight?, style?, size? }` | Default font settings           |
| `color`    | `string`                              | Default label color             |
| `position` | `LabelPosition`                       | Default label position          |
| `margin`   | `number`                              | Gap between node edge and label |

### labelAttachments

A dictionary of named renderers for label attachments. See the [attachments how-to](/how-to/labels/attachments/).

```typescript
labelAttachments: {
  hoverInfo: (ctx: LabelAttachmentContext) => ({
    type: "html",
    html: "<div>...</div>",
    css: "...",
  }),
}
```

## Edge primitives

```typescript
{
  edges: {
    paths?: EdgePathSpec[],
    extremities?: EdgeExtremitySpec[],
    layers?: EdgeLayerSpec[],
    variables?: VariablesDefinition,
    defaultHead?: string,
    defaultTail?: string,
    label?: EdgeLabelOptions,
  },
}
```

### paths

Array of path factories. The first is the default.

Built-in factories (from `sigma/rendering`):

| Factory             | Name            | Options                   |
| ------------------- | --------------- | ------------------------- |
| `pathLine()`        | `"straight"`    | —                         |
| `pathCurved(opts?)` | `"curved"`      | `curvature?`, `segments?` |
| `pathStep()`        | `"step"`        | —                         |
| `pathStepCurved()`  | `"step-curved"` | —                         |
| `pathCurvedS()`     | `"curved-s"`    | —                         |

### extremities

Array of extremity factories for arrowheads and other endpoint shapes.

| Factory                 | Name      | Options                                  |
| ----------------------- | --------- | ---------------------------------------- |
| `extremityArrow(opts?)` | `"arrow"` | `lengthRatio?`, `widthRatio?`, `margin?` |

### layers

Edge layer factories composited together.

| Factory              | Package           | Description                                                                                   |
| -------------------- | ----------------- | --------------------------------------------------------------------------------------------- |
| `layerPlain()`       | `sigma/rendering` | Solid edge body                                                                               |
| `layerDashed(opts?)` | `sigma/rendering` | Dashed overlay. Options: `dashSize`, `gapSize`, `dashColor`, `dashOffset`, `solidExtremities` |

### label

Edge label rendering options.

| Field          | Type                  | Description                                     |
| -------------- | --------------------- | ----------------------------------------------- |
| `fontSizeMode` | `"fixed" \| "scaled"` | Whether labels scale with zoom                  |
| `textBorder`   | `{ width, color }`    | Outline around label characters for readability |

## Depth layers

An array of strings defining the rendering order. Elements assigned to later layers render on top.

Default:

```typescript
["edges", "edgeLabels", "nodes", "nodeLabels", "topNodes", "topNodeLabels"];
```

Nodes and edges are assigned to depth layers via the `depth` and `labelDepth` style properties.
