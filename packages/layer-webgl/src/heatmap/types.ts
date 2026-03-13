export type HeatmapOptions = {
  radius: number;
  zoomToRadiusRatioFunction: (ratio: number) => number;
  getWeight?: (node: string) => number;
  colorStops: {
    value: number;
    color: string;
  }[];
  shading?: {
    /** Diffuse lighting strength, 0–1 (default: 0.5) */
    intensity?: number;
    /** Specular highlight strength, 0–1 (default: 0.2) */
    specular?: number;
    /** Specular exponent (default: 16) */
    shininess?: number;
    /** Light direction in degrees, 0=top, clockwise (default: 315 = top-left) */
    lightAngle?: number;
    /** Pixel radius for gradient sampling — higher = smoother shading (default: 3) */
    smoothing?: number;
    /** When true (default), the light rotates with the camera. When false, the light stays fixed in world space. */
    rotateWithCamera?: boolean;
  };
};

export const DEFAULT_HEATMAP_OPTIONS: HeatmapOptions = {
  radius: 100,
  zoomToRadiusRatioFunction: (ratio) => Math.sqrt(ratio),
  colorStops: [
    { value: 0, color: "#00000000" },
    { value: 0.5, color: "#4cc9f080" },
    { value: 1.0, color: "#457b9dff" },
  ],
};
