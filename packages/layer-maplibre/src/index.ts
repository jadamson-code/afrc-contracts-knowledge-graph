/** @module @sigma/layer-maplibre */
import { getCameraStateToFitViewportToNodes } from "@sigma/utils";
import Graph from "graphology";
import { Attributes } from "graphology-types";
import { LngLatBounds, Map, MapOptions } from "maplibre-gl";
import { Sigma } from "sigma";

import { graphToLatlng, latlngToGraph } from "./utils";

/**
 * On the graph, we store the 2D projection of the geographical lat/long.
 *
 * @param sigma The sigma instance
 * @param opts.mapOptions Options that will be provided to map constructor.
 * @param opts.getNodeLatLng Function to retrieve lat/long values from a node's attributs (default is lat & lng)
 */
export default function bindMaplibreLayer(
  sigma: Sigma,
  opts?: {
    mapOptions?: Omit<MapOptions, "container" | "center" | "zoom" | "bounds" | "minPitch" | "maxPitch" | "interactive">;
    getNodeLatLng?: (nodeAttributes: Attributes) => { lat: number; lng: number };
  },
) {
  // Keeping data for the cleanup
  let isKilled = false;
  const prevSigmaSettings = sigma.getSettings();
  const prevCustomBBox = sigma.getCustomBBox();

  // `stagePadding: 0` is mandatory, so the bbox of the map & Sigma is the same.
  sigma.setSetting("stagePadding", 0);
  // disable camera rotation
  sigma.setSetting("enableCameraRotation", false);

  // Mercator graph coordinates are in [0,1]. Set customBBox to make
  // normalization identity, and force a synchronous refresh so the
  // normalization function is updated before camera constraints are applied.
  sigma.setCustomBBox({ x: [0, 1], y: [0, 1] });

  // Function that updates graph node positions from geo coordinates to
  // Mercator [0,1] space
  function updateGraphCoordinates(graph: Graph) {
    graph.updateEachNodeAttributes((_node, attrs) => {
      const coords = latlngToGraph(
        opts?.getNodeLatLng ? opts.getNodeLatLng(attrs) : { lat: attrs.lat, lng: attrs.lng },
      );
      return {
        ...attrs,
        x: coords.x,
        y: coords.y,
      };
    });
  }

  // Update graph coordinates and refresh sigma so normalization is ready
  updateGraphCoordinates(sigma.getGraph());
  sigma.refresh();

  // Now that normalization is correct, fit the camera to the graph's
  // Mercator extent so the initial view frames the nodes.
  const graph = sigma.getGraph();
  if (graph.order) {
    sigma.getCamera().setState(getCameraStateToFitViewportToNodes(sigma, graph.nodes()));
  }

  // Apply camera constraints. cameraPanBoundaries triggers cleanCameraState
  // which uses graphToViewport — it needs the correct normalization.
  sigma.setSetting("cameraPanBoundaries", { boundaries: { x: [-1, 2], y: [0, 1] } });

  // Prevent zooming out beyond the world. The max ratio depends on the
  // viewport aspect ratio: for a square graph, the Y range [0,1] fills the
  // viewport height when ratio = min(width, height) / height.
  function updateMaxCameraRatio() {
    const { width, height } = sigma.getDimensions();
    sigma.setSetting("maxCameraRatio", Math.min(width, height) / height);
  }
  updateMaxCameraRatio();

  // Compute initial map bounds from sigma's current viewport, so the map's
  // first render is already at the correct position
  function getSigmaViewportBounds(): LngLatBounds {
    const dims = sigma.getDimensions();
    const graphBottomLeft = sigma.viewportToGraph({ x: 0, y: dims.height }, { padding: 0 });
    const graphTopRight = sigma.viewportToGraph({ x: dims.width, y: 0 }, { padding: 0 });
    return new LngLatBounds(graphToLatlng(graphBottomLeft), graphToLatlng(graphTopRight));
  }

  // Creating map container
  const mapLayerName = "layer-maplibre";
  const mapContainer = sigma.createLayer(mapLayerName, "div", {
    style: { position: "absolute", inset: "0" },
    // 'stage' is the first sigma layer
    beforeLayer: "stage",
  });
  sigma.getContainer().prepend(mapContainer);

  // Initialize the map (non-interactive: sigma controls all interaction)
  const map = new Map({
    container: mapContainer,
    style: "https://demotiles.maplibre.org/style.json",
    minPitch: 0,
    maxPitch: 0,
    ...opts?.mapOptions,
    interactive: false,
    bounds: getSigmaViewportBounds(),
  });

  // Camera state memoization to skip redundant fitBounds calls
  let lx = NaN,
    ly = NaN,
    lr = NaN,
    la = NaN;

  // Sync map bounds to match sigma's viewport
  function syncMapFromSigma() {
    const { x, y, ratio, angle } = sigma.getCamera().getState();
    if (x === lx && y === ly && ratio === lr && angle === la) return;
    lx = x;
    ly = y;
    lr = ratio;
    la = angle;

    map.fitBounds(getSigmaViewportBounds(), { duration: 0 });
  }

  // When sigma is resized, resize the map, recompute zoom limit, and re-sync
  function fnOnResize() {
    map.resize();
    updateMaxCameraRatio();
    lx = NaN;
    syncMapFromSigma();
  }

  // Clean up function to remove everything
  function clean() {
    if (!isKilled) {
      isKilled = true;

      map.remove();

      sigma.killLayer(mapLayerName);

      sigma.off("afterRender", syncMapFromSigma);
      sigma.off("resize", fnOnResize);
      sigma.off("kill", clean);

      // Reset settings
      sigma.setSetting("stagePadding", prevSigmaSettings.stagePadding);
      sigma.setSetting("enableCameraRotation", prevSigmaSettings.enableCameraRotation);
      sigma.setSetting("maxCameraRatio", prevSigmaSettings.maxCameraRatio);
      sigma.setSetting("cameraPanBoundaries", prevSigmaSettings.cameraPanBoundaries);
      sigma.setCustomBBox(prevCustomBBox);
    }
  }

  // When the map is ready, start syncing
  map.once("load", () => {
    sigma.on("afterRender", syncMapFromSigma);
    sigma.on("resize", fnOnResize);
    sigma.on("kill", clean);
  });

  return {
    clean,
    map,
    updateGraphCoordinates,
  };
}

export { graphToLatlng, latlngToGraph };
