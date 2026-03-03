---
title: Styles and primitives
description: The v4 declarative system for controlling how nodes and edges look.
---

The styles and primitives system is sigma v4's primary mechanism for controlling visual appearance. It replaces the old `nodeProgramClasses` / `edgeProgramClasses` approach with a declarative, composable system.

The two concepts serve different roles:

- **Primitives** describe _what can render_ -- shapes, layers, paths, extremities, and the variables they consume.
- **Styles** describe _how things render_ -- rules that map graph attributes and state to visual properties.

## Primitives

Primitives define the rendering pipeline. They tell sigma which shapes, layers, paths, and extremities to compile into WebGL programs. Sigma generates a single optimized program from the entire declaration.

### Node primitives

```typescript
import { sdfCircle, sdfSquare, sdfTriangle, sdfDiamond, layerFill } from "sigma/rendering";

primitives: {
  nodes: {
    // Geometric outlines available for nodes
    shapes: [sdfCircle(), sdfSquare(), sdfTriangle(), sdfDiamond()],

    // Visual layers composited from back to front
    layers: [
      layerFill(),
      layerBorder({ borders: [{ size: 0.1, color: "#333" }] }),
      layerImage({ imageAttribute: "image" }),
    ],

    // Custom typed attributes that layers can consume
    variables: {
      borderSize: { type: "number", default: 0 },
      borderColor: { type: "color", default: "transparent" },
    },
  },
}
```

**Shapes** define the geometric outline of a node. The built-in shapes are `sdfCircle()`, `sdfSquare()`, `sdfTriangle()`, and `sdfDiamond()`. All declared shapes are compiled into a single program -- each node picks its shape through the `shape` style property.

**Layers** are composited from back to front to build up the node's appearance. Built-in layer types include:

| Layer                | Package                | Description                                    |
| -------------------- | ---------------------- | ---------------------------------------------- |
| `layerFill()`        | `sigma/rendering`      | Solid color fill using the node's `color`       |
| `layerBorder()`      | `@sigma/node-border`   | Configurable concentric borders                |
| `layerImage()`       | `@sigma/node-image`    | Image or pictogram rendered inside the shape   |
| `layerPiechart()`    | `@sigma/node-piechart` | Pie chart slices                               |

Layers automatically disable themselves when they have no data -- for example, an `image` layer on a node with no `image` attribute renders as transparent. This means all nodes share the same WebGL program regardless of which layers they use.

### Edge primitives

```typescript
import { pathLine, pathCurved, pathStepCurved, pathCurvedS, extremityArrow, layerPlain } from "sigma/rendering";

primitives: {
  edges: {
    // Path types available for edges
    paths: [pathLine(), pathCurved(), pathStepCurved(), pathCurvedS()],

    // Extremity types (arrowheads, etc.)
    extremities: [extremityArrow()],

    // Visual layers composited together
    layers: [layerPlain()],
  },
}
```

**Paths** control the geometric route an edge takes between its endpoints. Built-in paths include `pathLine()`, `pathCurved()`, `pathStepCurved()`, and `pathCurvedS()`.

**Extremities** are shapes drawn at the endpoints of edges. The built-in extremity is `extremityArrow()`. Omit the array or leave it empty for no extremity.

### Depth layers

The `depthLayers` array controls the rendering order of elements. Elements assigned to a later depth layer render on top of earlier ones:

```typescript
primitives: {
  depthLayers: [
    "edges",          // Background edges
    "edgeLabels",     // Edge labels
    "nodes",          // Regular nodes
    "nodeLabels",     // Regular node labels
    "topNodes",       // Highlighted nodes (on top)
    "topNodeLabels",  // Highlighted node labels (on top)
  ],
}
```

Nodes and edges are assigned to depth layers through the `depth` and `labelDepth` style properties. This replaces v3's z-index approach.

## Variables

Variables are custom typed attributes declared in the primitives. They bridge the gap between graph data and WebGL rendering.

```typescript
import { layerFill } from "sigma/rendering";

primitives: {
  nodes: {
    variables: {
      borderSize: { type: "number", default: 0 },
      borderColor: { type: "color", default: "transparent" },
    },
    layers: [
      layerFill(),
      layerBorder({
        borders: [
          { size: { attribute: "borderSize" }, color: { attribute: "borderColor" } },
          { size: 0, color: { attribute: "color" }, fill: true },
        ],
      }),
    ],
  },
}
```

Each variable has a `type` (`"number"`, `"color"`, `"string"`, `"boolean"`) and a `default` value. When a layer references `{ attribute: "borderSize" }`, sigma reads the value from the node's graph attributes via the declared variable. If the attribute is missing, the default is used.

Variables that are declared in primitives also become available as style properties, so you can set them through the styles system:

```typescript
styles: {
  nodes: {
    borderSize: { attribute: "borderSize", defaultValue: 0 },
    borderColor: {
      when: "isHovered",
      then: "#e22653",
      else: { attribute: "borderColor", defaultValue: "transparent" },
    },
  },
}
```

## Styles

Styles are ordered rules that determine how nodes and edges look. They map graph attributes, element state, and graph state to visual properties.

### Value types

A style property can be set using several value types:

**Literal value** -- a fixed value applied to all elements:

```typescript
{ color: "#e22653", size: 10 }
```

**Attribute binding** -- reads a value from the element's graph attributes:

```typescript
{ color: { attribute: "color", defaultValue: "#666" } }
```

**Categorical binding** -- maps attribute values to specific outputs via a dictionary:

```typescript
{
  color: {
    attribute: "community",
    dict: { science: "#e22653", art: "#277da1", tech: "#666" },
    defaultValue: "#ccc",
  },
}
```

**Numerical binding** -- maps a numeric attribute to a min/max range:

```typescript
{
  size: {
    attribute: "degree",
    min: 3,
    max: 20,
    minValue: 0,
    maxValue: 100,
  },
}
```

**Function** -- full control via a callback:

```typescript
{
  color: (attributes, state, graphState, graph) => {
    return state.isHovered ? "#e22653" : attributes.color;
  },
}
```

**Inline conditional** -- a concise conditional within a single property:

```typescript
{
  size: {
    when: "isHovered",
    then: 15,
    else: { attribute: "size", defaultValue: 10 },
  },
}
```

### Rule-level conditionals

When you need to change multiple properties based on the same condition, use a rule-level conditional. The `when` clause gates the entire rule:

```typescript
styles: {
  nodes: [
    // Base style: always applied
    { color: { attribute: "color" }, size: { attribute: "size" } },
    // Conditional rule: only applied when hovered
    {
      when: "isHovered",
      then: { size: 15, labelVisibility: "visible" },
    },
  ],
}
```

Rules are evaluated in order. Later rules override earlier ones for any properties they set.

### State predicates

The `when` clause supports several forms:

```typescript
// String: true if the state flag is true
when: "isHovered"

// Array: true if ALL flags are true (AND)
when: ["isHovered", "isActive"]

// Object: true if all specified values match
when: { isHovered: true, isActive: false }

// Function: full control
when: (attributes, state, graphState, graph) => graphState.hasActiveSubgraph && state.isActive
```

### Built-in state flags

Sigma provides these state flags out of the box:

**Node state:** `isHovered`, `isHidden`, `isHighlighted`

**Edge state:** `isHovered`, `isHidden`, `isHighlighted`

**Graph state:** `isIdle`, `isPanning`, `isZooming`, `isDragging`, `hasHovered`, `hasHighlighted`

You can extend these with custom fields by providing your own state types.

### Built-in style properties

These properties are always available, regardless of primitives:

**Nodes:** `x`, `y`, `size`, `color`, `opacity`, `shape`, `visibility`, `depth`, `zIndex`, `label`, `labelColor`, `labelSize`, `labelFont`, `labelVisibility`, `labelPosition`, `labelAngle`, `labelDepth`, `backdropVisibility`, `backdropColor`, `backdropPadding`, and others.

**Edges:** `size`, `color`, `opacity`, `path`, `head`, `tail`, `visibility`, `depth`, `zIndex`, `label`, `labelColor`, `labelSize`, `labelFont`, `labelVisibility`, `labelPosition`, `labelDepth`.

## Full example

Here is a complete example combining primitives and styles to render nodes with borders that highlight on hover:

```typescript
import { layerBorder } from "@sigma/node-border";
import Graph from "graphology";
import Sigma from "sigma";
import { sdfCircle, layerFill, pathLine, extremityArrow } from "sigma/rendering";

const graph = new Graph();
graph.addNode("a", { x: 0, y: 0, size: 15, color: "#e22653", label: "Alice" });
graph.addNode("b", { x: 1, y: 1, size: 10, color: "#277da1", label: "Bob" });
graph.addEdge("a", "b");

const renderer = new Sigma(graph, document.getElementById("container"), {
  primitives: {
    nodes: {
      shapes: [sdfCircle()],
      layers: [
        layerFill(),
        layerBorder({
          borders: [
            { size: 0.1, color: "#333" },
            { size: 0, color: { attribute: "color" }, fill: true },
          ],
        }),
      ],
    },
    edges: {
      paths: [pathLine()],
      extremities: [extremityArrow()],
    },
    depthLayers: ["edges", "nodes", "nodeLabels", "topNodes", "topNodeLabels"],
  },
  styles: {
    nodes: [
      {
        color: { attribute: "color" },
        size: { attribute: "size", defaultValue: 10 },
        label: { attribute: "label" },
      },
      {
        when: "isHovered",
        then: {
          size: 20,
          depth: "topNodes",
          labelDepth: "topNodeLabels",
          labelVisibility: "visible",
        },
      },
    ],
    edges: [
      { color: "#ccc", size: 2, head: "arrow" },
    ],
  },
});
```

See the [hover and search highlight](/how-to/interactivity/hover-search/) guide for a more complete interactive example.
