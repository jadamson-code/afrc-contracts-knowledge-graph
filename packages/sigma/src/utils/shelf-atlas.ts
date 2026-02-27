/**
 * Sigma.js Shelf-Packing Atlas Utility
 * =====================================
 *
 * Generic shelf-packing algorithm for arranging rectangular items into
 * an atlas texture. Used by label attachments to pack user-rendered
 * canvases into a WebGL texture.
 *
 * @module
 */

const MARGIN = 2;

/**
 * Cursor tracking the current packing position within the atlas.
 */
export interface ShelfCursor {
  x: number;
  y: number;
  rowHeight: number;
  maxRowWidth: number;
}

/**
 * Location of a packed item within the atlas.
 */
export interface AtlasEntry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type AtlasLookup = Record<string, AtlasEntry>;

/**
 * An item to be packed into the atlas.
 */
export interface PackableItem {
  key: string;
  width: number;
  height: number;
  draw(ctx: CanvasRenderingContext2D, destX: number, destY: number): void;
}

/**
 * Packs as many items as possible into a single canvas using a shelf (row)
 * algorithm. Items that don't fit are returned in `remaining`.
 */
export function packItemsOnPage(
  items: PackableItem[],
  ctx: CanvasRenderingContext2D,
  cursor: ShelfCursor,
  margin = MARGIN,
): { atlas: AtlasLookup; cursor: ShelfCursor; remaining: PackableItem[] } {
  const { width: canvasW, height: canvasH } = ctx.canvas;
  let { x, y, rowHeight, maxRowWidth } = cursor;
  const atlas: AtlasLookup = {};
  const remaining: PackableItem[] = [];

  for (const item of items) {
    const w = item.width + margin;
    const h = item.height + margin;

    // Skip items that can never fit this page
    if (w > canvasW || h > canvasH || (x + w > canvasW && y + rowHeight + h > canvasH)) {
      remaining.push(item);
      continue;
    }

    // Move to next row if current item doesn't fit horizontally
    if (x + w > canvasW) {
      maxRowWidth = Math.max(maxRowWidth, x);
      x = 0;
      y += rowHeight;
      rowHeight = h;
    }

    item.draw(ctx, x, y);
    atlas[item.key] = { x, y, width: item.width, height: item.height };
    x += w;
    rowHeight = Math.max(rowHeight, h);
  }

  maxRowWidth = Math.max(maxRowWidth, x);
  return {
    atlas,
    cursor: { x, y, rowHeight, maxRowWidth },
    remaining,
  };
}
