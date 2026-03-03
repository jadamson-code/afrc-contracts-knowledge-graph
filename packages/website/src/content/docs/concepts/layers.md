---
title: Layers
description: How sigma's multi-layer rendering stack works.
---

Sigma renders the graph on **multiple layers**. Some layers use [WebGL](/concepts/rendering/), some use [Canvas](https://developer.mozilla.org/en-US/Web/HTML/Element/canvas).

## List of existing layers

![Sigma's layers list](/img/layers/sigma-layers.png)

- **`sigma-edges`** (WebGL)
- **`sigma-edgeLabels`** (Canvas)
- **`sigma-nodes`** (WebGL)
- **`sigma-labels`** (Canvas)
- **`sigma-hovers`** (Canvas): This layer draws the hovered and highlighted node labels, with the related backgrounds.
- **`sigma-hoverNodes`** (WebGL): This layer renders the hovered and highlighted nodes **again**, but on top of the `sigma-hovers` Canvas layer.
- **`sigma-mouse`**: This layer is just here to listen to interaction events.

## Manipulating layers

By default, all these layers are simply put in the sigma container, with `position: absolute;` and `inset: 0;`. There are multiple ways to manipulate these layers:

### Putting layers behind the `mouse` layer

It is sometimes useful to add new layers on top of the sigma graph, but without altering the interactions. For instance, in the [Events](/how-to/interactivity/events/) example, we display the events log on top of the graph without breaking the graph interactions.

To do this, the simplest method is:

- Insert the overlay container after the sigma container in the DOM, also with `position: absolute; inset: 0;`
- Put the `sigma-mouse` layer back on top, simply using `z-index: 1;`

### Creating new layers and inserting in the right spot

You can insert custom HTML layers directly using the DOM APIs:

```javascript
myCustomLayer.insertBefore(clustersLayer, sigmaContainer.querySelector(".sigma-hovers"));
```

### Creating new Canvas or WebGL layers

Sigma exposes a `createCanvas` method to create a new Canvas HTML element. This method accepts `beforeLayer` and `afterLayer` options, that take a layer class. Then, the methods `createCanvasContext` and `createWebGLContext` allow retrieving the proper context.

The main advantage of this method is that the layer will be properly removed when the `kill` method is called.
