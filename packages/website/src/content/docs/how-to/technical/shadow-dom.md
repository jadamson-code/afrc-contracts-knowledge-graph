---
title: Shadow DOM
description: How to use sigma inside a Shadow DOM custom element.
sidebar:
  label: "Shadow DOM"
---

Sigma works inside Shadow DOM custom elements. All events -- node, edge, and stage interactions -- are handled correctly within shadow roots.

## Basic setup

```typescript
import Graph from "graphology";
import Sigma from "sigma";

class SigmaElement extends HTMLElement {
  connectedCallback() {
    const shadow = this.attachShadow({ mode: "open" });
    const container = document.createElement("div");
    container.style.width = "100%";
    container.style.height = "100%";
    shadow.appendChild(container);

    const graph = new Graph();
    graph.addNode("1", { label: "Node 1", x: 0, y: 0, size: 10, color: "#e22653" });
    graph.addNode("2", { label: "Node 2", x: 1, y: 1, size: 10, color: "#666" });
    graph.addEdge("1", "2", { size: 2 });

    new Sigma(graph, container);
  }
}

customElements.define("sigma-graph", SigmaElement);
```

Then use it in HTML:

```html
<sigma-graph style="width: 800px; height: 600px; display: block;"></sigma-graph>
```

## Styles

Since the Shadow DOM encapsulates styles, any CSS your sigma instance needs (like the container dimensions) should be set either inline or inside the shadow root. Sigma's own internal styles are applied directly to its elements, so they work without any extra configuration.
