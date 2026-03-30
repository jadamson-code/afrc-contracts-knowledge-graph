/**
 * Sigma.js Attachment Converter
 * ==============================
 *
 * Converts LabelAttachmentContent (canvas, SVG, or HTML) into an HTMLCanvasElement
 * suitable for packing into the attachment atlas.
 *
 * @module
 */
import { LabelAttachmentContent } from "../../../primitives";

// Module-level cache: URL → Promise<data URI>. Prevents duplicate fetches across nodes.
const fetchCache = new Map<string, Promise<string | null>>();

// Suppress duplicate warnings when SVG foreignObject taints the canvas.
let taintWarned = false;

/**
 * Converts a fetch response blob to a base64 data URI via FileReader.
 */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Fetches a URL and returns it as a base64 data URI, using the module-level cache.
 * On failure, returns null (the image will silently be absent).
 */
function fetchAsDataUrl(url: string): Promise<string | null> {
  if (!fetchCache.has(url)) {
    const promise = fetch(url)
      .then((r) => r.blob())
      .then(blobToDataUrl)
      .catch(() => {
        fetchCache.delete(url);
        return null;
      });
    fetchCache.set(url, promise);
  }
  return fetchCache.get(url)!;
}

/**
 * Scans an HTML string for <img src="url"> elements (not already data URIs) and
 * replaces their src attributes with base64 data URIs fetched from the network.
 */
export async function inlineImages(html: string): Promise<string> {
  const div = document.createElement("div");
  div.innerHTML = html;

  const imgs = Array.from(div.querySelectorAll<HTMLImageElement>("img[src]"));
  const toInline = imgs.filter((img) => !img.getAttribute("src")!.startsWith("data:"));

  await Promise.all(
    toInline.map(async (img) => {
      const dataUrl = await fetchAsDataUrl(img.getAttribute("src")!);
      if (dataUrl) img.setAttribute("src", dataUrl);
    }),
  );

  return div.innerHTML;
}

/**
 * Converts an SVG string or SVGElement to an HTMLCanvasElement.
 * Dimensions are read from width/height attributes, falling back to viewBox.
 * The canvas is created at physical pixel size (cssWidth * pixelRatio).
 * Returns null if dimensions cannot be determined or loading fails.
 */
export async function svgToCanvas(svg: string | SVGElement, pixelRatio = 1): Promise<HTMLCanvasElement | null> {
  const svgString = svg instanceof SVGElement ? new XMLSerializer().serializeToString(svg) : svg;

  // Parse CSS dimensions from the SVG itself
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, "image/svg+xml");
  const svgEl = doc.querySelector("svg");
  if (!svgEl) return null;

  let width = parseFloat(svgEl.getAttribute("width") || "");
  let height = parseFloat(svgEl.getAttribute("height") || "");

  if (!(width > 0) || !(height > 0)) {
    const viewBox = svgEl.getAttribute("viewBox");
    if (viewBox) {
      const parts = viewBox.trim().split(/[\s,]+/);
      width = parseFloat(parts[2]);
      height = parseFloat(parts[3]);
    }
  }

  if (!(width > 0) || !(height > 0)) {
    // eslint-disable-next-line no-console
    console.warn("Sigma: SVG label attachment has no parseable dimensions — skipped.");
    return null;
  }

  const physW = Math.ceil(width * pixelRatio);
  const physH = Math.ceil(height * pixelRatio);

  const blob = new Blob([svgString], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = physW;
      canvas.height = physH;
      // drawImage with explicit destination size so SVG (vector) rasterises sharply
      canvas.getContext("2d")!.drawImage(img, 0, 0, physW, physH);
      URL.revokeObjectURL(url);

      // Chromium and Safari taint canvases drawn from SVG with <foreignObject>.
      // Detect it here so tainted canvases never reach the atlas pack canvas.
      try {
        canvas.getContext("2d")!.getImageData(0, 0, 1, 1);
      } catch (e) {
        if (e instanceof DOMException && e.name === "SecurityError") {
          if (!taintWarned) {
            taintWarned = true;
            // eslint-disable-next-line no-console
            console.warn(
              "Sigma: A label attachment was skipped because the rendered canvas is tainted. " +
                'SVG with <foreignObject> (used by the "html" attachment type) is blocked in Chromium and Safari. ' +
                'Use type: "canvas" with Canvas 2D rendering instead.',
            );
          }
          resolve(null);
          return;
        }
        throw e;
      }

      resolve(canvas);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

/**
 * Measures the natural rendered size of an HTML string by temporarily mounting it
 * in a hidden off-screen element and forcing a synchronous layout pass.
 * width:max-content prevents wrapping so the full content width is reported.
 */
function measureHtmlContent(html: string, css?: string): { width: number; height: number } {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;left:-99999px;top:0;visibility:hidden;width:max-content;height:max-content";
  el.innerHTML = (css ? `<style>${css}</style>` : "") + html;
  document.body.appendChild(el);
  const { width, height } = el.getBoundingClientRect();
  document.body.removeChild(el);
  return { width: Math.ceil(width), height: Math.ceil(height) };
}

/**
 * Converts an HTML string or HTMLElement to an HTMLCanvasElement via SVG foreignObject.
 * Width and height are optional CSS pixel dimensions; if omitted they are measured from
 * the rendered content. The resulting canvas is at physical pixel resolution
 * (width * pixelRatio × height * pixelRatio).
 *
 * The SVG uses a viewBox so the HTML lays out at CSS pixel scale (correct font sizes,
 * spacing) while the physical output size is scaled up for retina sharpness.
 */
async function htmlToCanvas(
  html: string | HTMLElement,
  css: string | undefined,
  width: number | undefined,
  height: number | undefined,
  pixelRatio = 1,
): Promise<HTMLCanvasElement | null> {
  const htmlString = html instanceof HTMLElement ? html.outerHTML : html;
  const inlined = await inlineImages(htmlString);

  if (width == null || height == null) {
    const measured = measureHtmlContent(inlined, css);
    width = width ?? measured.width;
    height = height ?? measured.height;
  }

  const physW = Math.ceil(width * pixelRatio);
  const physH = Math.ceil(height * pixelRatio);
  const styleBlock = css ? `<style>${css}</style>` : "";

  // width/height set the physical output size; viewBox maps coordinates to CSS pixels
  // so the HTML layout remains at CSS pixel scale. body margin reset prevents the
  // browser default 8px margin from pushing content outside the canvas bounds.
  const svgString =
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `width="${physW}" height="${physH}" viewBox="0 0 ${width} ${height}">` +
    `<foreignObject width="${width}" height="${height}">` +
    `<body xmlns="http://www.w3.org/1999/xhtml" style="margin:0;padding:0">${styleBlock}${inlined}</body>` +
    `</foreignObject></svg>`;

  // The SVG already encodes physical dimensions, so no further pixelRatio scaling needed.
  return svgToCanvas(svgString, 1);
}

/**
 * Converts any LabelAttachmentContent to an HTMLCanvasElement at physical pixel resolution.
 * Canvas content resolves immediately (user is responsible for pixelRatio scaling).
 * SVG and HTML content are rendered asynchronously.
 */
export async function contentToCanvas(
  content: LabelAttachmentContent,
  pixelRatio = 1,
): Promise<HTMLCanvasElement | null> {
  switch (content.type) {
    case "canvas":
      return content.canvas;
    case "svg":
      return svgToCanvas(content.svg, pixelRatio);
    case "html":
      return htmlToCanvas(content.html, content.css, content.width, content.height, pixelRatio);
  }
}
