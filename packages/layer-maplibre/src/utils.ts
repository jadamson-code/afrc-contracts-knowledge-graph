import { MercatorCoordinate } from "maplibre-gl";

/**
 * Given a geo point returns its graph coords.
 */
export function latlngToGraph(coord: { lat: number; lng: number }): { x: number; y: number } {
  const data = MercatorCoordinate.fromLngLat(coord);
  return {
    x: data.x,
    y: 1 - data.y,
  };
}

/**
 * Given graph coords returns its lat/lng coords.
 */
export function graphToLatlng(coords: { x: number; y: number }): { lat: number; lng: number } {
  const mcoords = new MercatorCoordinate(coords.x, 1 - coords.y, 0);
  const data = mcoords.toLngLat();
  return { lat: data.lat, lng: data.lng };
}
