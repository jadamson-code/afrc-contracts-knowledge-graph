export type DepthRanges = Record<string, { offset: number; count: number }[]>;

/**
 * Remove a single position from a depth range, splitting the containing
 * fragment if needed.
 */
export function removePositionFromDepthRanges(
  ranges: DepthRanges,
  depth: string,
  position: number,
): void {
  const fragments = ranges[depth];
  if (!fragments) return;

  for (let i = 0; i < fragments.length; i++) {
    const f = fragments[i];
    if (position < f.offset || position >= f.offset + f.count) continue;

    if (f.count === 1) {
      fragments.splice(i, 1);
    } else if (position === f.offset) {
      f.offset++;
      f.count--;
    } else if (position === f.offset + f.count - 1) {
      f.count--;
    } else {
      // Split into two fragments
      const secondOffset = position + 1;
      const secondCount = f.offset + f.count - secondOffset;
      f.count = position - f.offset;
      fragments.splice(i + 1, 0, { offset: secondOffset, count: secondCount });
    }
    return;
  }
}

/**
 * Add a single position to a depth range, merging with adjacent fragments
 * when possible.
 */
export function addPositionToDepthRanges(
  ranges: DepthRanges,
  depth: string,
  position: number,
): void {
  if (!ranges[depth]) {
    ranges[depth] = [{ offset: position, count: 1 }];
    return;
  }

  const fragments = ranges[depth];

  // Find insertion point (fragments are sorted by offset)
  let insertIdx = fragments.length;
  for (let i = 0; i < fragments.length; i++) {
    if (position < fragments[i].offset) {
      insertIdx = i;
      break;
    }
  }

  // Check if we can merge with neighbors
  const prev = insertIdx > 0 ? fragments[insertIdx - 1] : null;
  const next = insertIdx < fragments.length ? fragments[insertIdx] : null;
  const mergeWithPrev = prev && prev.offset + prev.count === position;
  const mergeWithNext = next && position + 1 === next.offset;

  if (mergeWithPrev && mergeWithNext) {
    prev.count += 1 + next.count;
    fragments.splice(insertIdx, 1);
  } else if (mergeWithPrev) {
    prev.count++;
  } else if (mergeWithNext) {
    next.offset--;
    next.count++;
  } else {
    fragments.splice(insertIdx, 0, { offset: position, count: 1 });
  }
}
