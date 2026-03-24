/** @module @sigma/layer-leaflet */
import { getCameraStateToFitViewportToNodes } from "@sigma/utils";
import Graph from "graphology";
import { Attributes } from "graphology-types";
import { LatLngBounds, MapOptions, TileLayer, latLng, map as leafletMap } from "leaflet";
import { Sigma } from "sigma";

import { graphToLatlng, latlngToGraph } from "./utils";

/**
 * On the graph, we store the 2D projection of the geographical lat/long.
 *
 * @param sigma The sigma instance
 * @param opts.mapOptions Options that will be provided to the map constructor.
 * @param opts.tileLayer Tile layer configuration for the map (default is openstreetmap)
 * @param opts.getNodeLatLng Function to retrieve lat/long values from a node's attributs (default is lat & lng)
 */
export default function bindLeafletLayer(
  sigma: Sigma,
  opts?: {
    mapOptions?: Omit<
      MapOptions,
      | "zoomControl"
      | "zoomSnap"
      | "zoom"
      | "maxZoom"
      | "zoomAnimation"
      | "dragging"
      | "scrollWheelZoom"
      | "doubleClickZoom"
      | "touchZoom"
      | "boxZoom"
      | "keyboard"
    >;
    tileLayer?: { urlTemplate: string; attribution?: string };
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

  // Compute sigma viewport bounds as a Leaflet LatLngBounds
  function getSigmaViewportBounds(): LatLngBounds {
    const dims = sigma.getDimensions();
    const graphBottomLeft = sigma.viewportToGraph({ x: 0, y: dims.height }, { padding: 0 });
    const graphTopRight = sigma.viewportToGraph({ x: dims.width, y: 0 }, { padding: 0 });
    return new LatLngBounds(latLng(graphToLatlng(graphBottomLeft)), latLng(graphToLatlng(graphTopRight)));
  }

  // Creating map container
  const mapLayerName = "layer-leaflet";
  const mapContainer = sigma.createLayer(mapLayerName, "div", {
    style: { position: "absolute", inset: "0", zIndex: "0" },
    // 'stage' is the first sigma layer
    beforeLayer: "stage",
  });
  sigma.getContainer().prepend(mapContainer);

  // Initialize the map (non-interactive: sigma controls all interaction).
  // Disable fade/zoom animations to prevent tile blinking: Leaflet sets
  // newly loaded tiles to opacity 0 and fades them in over 200ms, which
  // causes visible flicker when fitBounds is called on every sigma render.
  const map = leafletMap(mapContainer, {
    ...opts?.mapOptions,
    zoomControl: false,
    zoomSnap: 0,
    // we force the maxZoom with a higher tile value so leaflet function are not stuck
    // in a restricted area. It avoids side effect
    maxZoom: 20,
    zoomAnimation: false,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    touchZoom: false,
    boxZoom: false,
    keyboard: false,
  });
  map.fitBounds(getSigmaViewportBounds());

  let tileUrl = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  let tileAttribution: string | undefined =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  if (opts?.tileLayer) {
    tileUrl = opts.tileLayer.urlTemplate;
    tileAttribution = opts.tileLayer.attribution;
  }

  // Subclass TileLayer to prevent tile blinking on view changes.
  // Leaflet's default GridLayer listens to viewprereset and calls
  // _invalidateAll, which destroys every tile and reloads from scratch.
  // Since we only change the viewport (never the CRS), this is unnecessary
  // and causes a visible blink. The other handlers (viewreset, zoom,
  // moveend) still run and handle tile updates gracefully.
  class SmoothTileLayer extends TileLayer {
    getEvents() {
      const events = super.getEvents!();
      delete events.viewprereset;
      return events;
    }
  }
  new SmoothTileLayer(tileUrl, { attribution: tileAttribution }).addTo(map);

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

    map.fitBounds(getSigmaViewportBounds(), { animate: false });
  }

  // When sigma is resized, resize the map, recompute zoom limit, and re-sync
  function fnOnResize() {
    map.invalidateSize({ pan: false, animate: false });
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
  map.whenReady(() => {
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
