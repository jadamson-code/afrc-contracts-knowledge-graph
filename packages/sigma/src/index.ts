/**
 * Sigma.js Library Endpoint
 * =========================
 *
 * The library endpoint.
 * @module
 */
import Camera from "./core/camera";
import MouseCaptor from "./core/captors/mouse";
import TouchCaptor from "./core/captors/touch";
import { SDFAtlasManager } from "./core/sdf-atlas";
import Sigma from "./sigma";

// Trigger side-effect registration of all built-in primitive factories
// (shapes, layers, paths, etc.) so that default primitives work out of the box.
import "./rendering";

export default Sigma;
export { Sigma, Camera, MouseCaptor, TouchCaptor, SDFAtlasManager };
