---
title: Migrating from v3 to v4
description: What changed between sigma.js v3 and v4, and how to migrate.
---

Sigma.js v4 replaces the imperative, class-based rendering system with a declarative configuration approach. This guide covers the major changes and shows how to migrate existing code.

## What's new

### Primitives and layers

Node rendering is now configured through **primitives** -- a declarative description of shapes, layers, and variables. Instead of picking a specific program class per node type, you describe what rendering capabilities your graph needs, and sigma generates a single optimized WebGL program.

```typescript
import { sdfCircle, sdfSquare, layerFill } from "sigma/rendering";

// v4: One program renders circles, squares, borders, and images
const renderer = new Sigma(graph, container, {
  primitives: {
    nodes: {
      shapes: [sdfCircle(), sdfSquare()],
      layers: [
        layerFill(),
        layerBorder({ borders: [{ size: 0.1, color: "#333" }] }),
        layerImage({ imageAttribute: "image" }),
      ],
    },
  },
});
```

### Styles system

**Styles** replace most uses of `nodeReducer` and `edgeReducer`. They are declarative rules that map graph attributes and state flags to visual properties:

```typescript
const renderer = new Sigma(graph, container, {
  styles: {
    nodes: [
      // Base style: read from graph attributes
      { color: { attribute: "color" }, size: { attribute: "size" } },
      // Conditional: highlight hovered nodes
      { when: "isHovered", then: { labelVisibility: "visible" } },
    ],
  },
});
```

### State management

Instead of storing UI state in graph attributes and using reducers to transform them, v4 provides a dedicated state layer:

```typescript
// Set state on individual nodes or edges
renderer.setNodeState("n1", { isHovered: true });
renderer.setEdgeState("e1", { isHighlighted: true });

// Set graph-level state
renderer.setGraphState({ hasActiveSubgraph: true });
```

You can extend the built-in state types with custom fields:

```typescript
interface CustomNodeState extends BaseNodeState {
  isActive: boolean;
}
```

### Depth layers

Rendering order is controlled through named **depth layers** instead of z-index manipulation:

```typescript
const renderer = new Sigma(graph, container, {
  primitives: {
    depthLayers: ["edges", "nodes", "nodeLabels", "topEdges", "topNodes", "topNodeLabels"],
  },
  styles: {
    nodes: [
      { when: "isActive", then: { depth: "topNodes", labelDepth: "topNodeLabels" } },
    ],
  },
});
```

### Edge paths and extremities

Edges support multiple path types and extremities in a single program:

```typescript
import { pathLine, pathCurved, pathStepCurved, extremityArrow } from "sigma/rendering";

const renderer = new Sigma(graph, container, {
  primitives: {
    edges: {
      paths: [pathLine(), pathCurved(), pathStepCurved()],
      extremities: [extremityArrow()],
    },
  },
  styles: {
    edges: [
      { path: { attribute: "path" }, head: { attribute: "head" } },
    ],
  },
});
```

## What's removed

- **`nodeProgramClasses` / `edgeProgramClasses` settings** -- replaced by the `primitives` configuration
- **`defaultNodeType` / `defaultEdgeType` settings** -- node and edge rendering is now configured through primitives and layers
- **Standalone node/edge program packages** (like the old `@sigma/node-square`) -- shapes are now built-in; `@sigma/node-border`, `@sigma/node-image`, and `@sigma/node-piechart` still exist but as layer plugins
- **`NodeProgram` / `EdgeProgram` class pattern** -- replaced by the declarative primitives system
- **`hidden` / `forceLabel` attributes** -- replaced by `visibility` and `labelVisibility` style properties with `when` predicates

## What's still available

- **`nodeReducer` / `edgeReducer`** -- still work as escape hatches for complex logic that styles cannot express, but styles should be preferred for most cases

## Migration steps

### 1. Replace `nodeProgramClasses` with `primitives`

**Before (v3):**

```typescript
import { createNodeBorderProgram } from "@sigma/node-border";
import { createNodeImageProgram } from "@sigma/node-image";

const renderer = new Sigma(graph, container, {
  defaultNodeType: "bordered",
  nodeProgramClasses: {
    bordered: createNodeBorderProgram({
      borders: [
        { size: { attribute: "borderSize" }, color: { attribute: "borderColor" } },
        { size: 0, color: { attribute: "color" }, fill: true },
      ],
    }),
    image: createNodeImageProgram(),
  },
});
```

**After (v4):**

```typescript
import { layerBorder } from "@sigma/node-border";
import { layerImage } from "@sigma/node-image";
import { layerFill } from "sigma/rendering";

const renderer = new Sigma(graph, container, {
  primitives: {
    nodes: {
      layers: [
        layerFill(),
        layerImage({ imageAttribute: "image" }),
        layerBorder({
          borders: [
            { size: { attribute: "borderSize" }, color: { attribute: "borderColor" } },
            { size: 0, color: { attribute: "color" }, fill: true },
          ],
        }),
      ],
    },
  },
});
```

In v4, all layers are compiled into a single WebGL program. Layers that have no data (for example, an image layer on a node with no `image` attribute) automatically become transparent.

### 2. Replace `nodeReducer` / `edgeReducer` with `styles`

**Before (v3):**

```typescript
const renderer = new Sigma(graph, container, {
  nodeReducer: (node, data) => {
    const res = { ...data };

    if (hoveredNode && hoveredNode !== node && !graph.hasEdge(hoveredNode, node)) {
      res.color = "#f6f6f6";
      res.label = "";
    }

    if (node === hoveredNode) {
      res.highlighted = true;
    }

    return res;
  },
});
```

**After (v4):**

```typescript
const renderer = new Sigma(graph, container, {
  styles: {
    nodes: [
      { color: { attribute: "color" }, size: { attribute: "size" }, label: { attribute: "label" } },
      {
        when: (_attrs, _state, graphState) => graphState.hasActiveSubgraph,
        then: { color: "#f6f6f6", label: "" },
      },
      {
        when: "isActive",
        then: { color: { attribute: "color" }, label: { attribute: "label" }, labelVisibility: "visible" },
      },
    ],
  },
});
```

Style rules are evaluated in order, and later rules override earlier ones. This replaces imperative mutation of a data object with a layered, declarative approach.

### 3. Replace external state with `setNodeState` / `setGraphState`

**Before (v3):**

```typescript
// Storing UI state in graph attributes
renderer.on("enterNode", ({ node }) => {
  graph.setNodeAttribute(node, "highlighted", true);
  renderer.refresh();
});
```

**After (v4):**

```typescript
// Using the dedicated state layer
renderer.on("enterNode", ({ node }) => {
  renderer.setNodeState(node, { isActive: true });
  renderer.setGraphState({ hasActiveSubgraph: true });
  renderer.refresh({ skipIndexation: true });
});
```

State updates are separate from graph data, and `refresh({ skipIndexation: true })` avoids re-indexing the graph when only visual state changed.

### 4. Replace `zIndex` with depth layers

**Before (v3):**

```typescript
nodeReducer: (node, data) => {
  if (isHighlighted(node)) {
    return { ...data, zIndex: 1 };
  }
  return data;
},
```

**After (v4):**

```typescript
primitives: {
  depthLayers: ["edges", "nodes", "nodeLabels", "topNodes", "topNodeLabels"],
},
styles: {
  nodes: [
    {
      when: "isHighlighted",
      then: { depth: "topNodes", labelDepth: "topNodeLabels" },
    },
  ],
},
```

### 5. Update imports from removed packages

Old standalone shape packages are no longer needed. Shapes are built into sigma:

```typescript
// v3
import { NodeSquareProgram } from "@sigma/node-square";

// v4: just declare the shape
import { sdfCircle, sdfSquare, sdfTriangle, sdfDiamond } from "sigma/rendering";

primitives: {
  nodes: { shapes: [sdfCircle(), sdfSquare(), sdfTriangle(), sdfDiamond()] },
}
```

Layer packages (`@sigma/node-border`, `@sigma/node-image`, `@sigma/node-piechart`) still exist but are used differently -- import the factory function and call it in the `layers` array:

```typescript
import { layerBorder } from "@sigma/node-border";
import { layerFill } from "sigma/rendering";

// Then use in primitives:
primitives: {
  nodes: {
    layers: [layerFill(), layerBorder({ borders: [{ size: 0.1, color: "#333" }] })],
  },
}
```
