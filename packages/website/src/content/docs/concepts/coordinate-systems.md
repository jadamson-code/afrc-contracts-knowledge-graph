---
title: Coordinate systems
description: How sigma transforms coordinates from graph space to screen pixels.
---

## The graph space: `graph`

The graph contains nodes having arbitrary `(x, y)` positions.

![graph space](/img/coordinate-systems/graph-space.svg)

## Normalized graph space: `framedGraph`

First we compute the extent (min & max values) for `x` and `y` coordinates in graph space.

![graph space extent](/img/coordinate-systems/graph-space-extent.svg)

Then we normalize this space into a "square" (quotation marks hereafter explained) such that graphspace `min` becomes `0` and graphspace max `1`.

But, to complicate this a bit, it is important to understand that the aspect ratio of the original graph space remains inscribed in our normalized "square".

This means either `x` or `y` dimension (the one having the smallest extent) will not be translated to `min = 0` and `max = 1` but will instead have something like `min > 0` and `max < 1`.

![framed graph space](/img/coordinate-systems/framed-graph-space.svg)

## Viewport space: `viewport`

When dealing with 2d canvas (when drawing labels, for instance, or reacting to user mouse events), it can be useful to be able to translate to the viewport coordinates symbolized by a `width` and a `height` in pixels.

One thing to note is that the `y` dimension is then flipped, higher values of `y` meaning lower on the screen.

One other thing to note is that sigma will correct for the aspect ratio of your viewport to make sure (also considering an optional padding) your graph will occupy a maximum of available screen space.

![viewport space](/img/coordinate-systems/viewport-space.svg)

## WebGL vertex shader output space: `clipspace`

In the vertex shader, we translate from `framedGraph` to `clipspace` that has dimensions ranging from `-1` to `1`.

Doing so, we apply a correction to make sure the resulting space is a real square with both dimensions ranging from min (`-1`) to max (`1`).

![clipspace](/img/coordinate-systems/clipspace.svg)

In the fragment shader, the position is then expressed in `viewport` space.

This means doing computation in rendered pixel in the vertex shader is not easy, and transferring values from the vertex shader to the fragment one is not easy either.
