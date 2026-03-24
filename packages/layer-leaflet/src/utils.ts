import L from "leaflet";

/**
 * Given a geo point returns its graph coords in [0,1] Mercator space.
 */
export function latlngToGraph(coord: { lat: number; lng: number }): { x: number; y: number } {
  const data = L.CRS.EPSG3857.latLngToPoint(L.latLng(coord.lat, coord.lng), 0);
  return {
    x: data.x / 256,
    y: 1 - data.y / 256,
  };
}

/**
 * Given graph coords in [0,1] Mercator space returns lat/lng.
 */
export function graphToLatlng(coords: { x: number; y: number }): { lat: number; lng: number } {
  const data = L.CRS.EPSG3857.pointToLatLng(L.point(coords.x * 256, (1 - coords.y) * 256), 0);
  return { lat: data.lat, lng: data.lng };
}
