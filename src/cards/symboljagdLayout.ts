export type SymboljagdSpot = readonly [x: number, y: number, size: number];

// Percentage coordinates keep the same composition on square and tall cards.
const layouts: ReadonlyArray<ReadonlyArray<SymboljagdSpot>> = [
  // Staggered arrangement, based on the original tall-card composition.
  [[18, 14, 22], [77, 17, 18], [48, 37, 34], [17, 49, 18], [81, 48, 28], [39, 67, 20], [74, 79, 22], [20, 88, 18], [51, 11, 14], [48, 89, 16]],
  // Regular rows remain one of the four choices.
  [[20, 18, 26], [53, 18, 20], [81, 20, 24], [20, 50, 22], [53, 50, 34], [83, 52, 20], [19, 81, 24], [51, 82, 22], [81, 82, 26], [35, 35, 14]],
  // A large center surrounded by an uneven ring of smaller pictures.
  [[50, 52, 36], [50, 13, 20], [79, 23, 22], [88, 54, 18], [72, 83, 26], [40, 88, 16], [14, 75, 22], [14, 40, 18], [25, 12, 16], [34, 27, 12]],
  // Two large diagonal anchors with smaller pictures in the gaps.
  [[25, 25, 32], [73, 72, 38], [77, 13, 20], [53, 13, 14], [15, 60, 24], [39, 54, 16], [37, 86, 22], [86, 39, 16], [57, 38, 14], [14, 86, 14]]
];

/** A shuffled deck yields varied layouts without moving symbols on updates. */
export function symboljagdLayout(cardId: string, symbolCount: number): ReadonlyArray<SymboljagdSpot> {
  let hash = 2166136261;
  for (let index = 0; index < cardId.length; index++) {
    hash = Math.imul(hash ^ cardId.charCodeAt(index), 16777619) >>> 0;
  }
  const layoutIndex = hash % layouts.length;
  const positions = layouts[layoutIndex]!;
  const count = Math.min(symbolCount, positions.length);
  const offset = count ? (hash >>> 8) % count : 0;
  return Array.from({ length: count }, (_, index) => {
    const [x, y, size] = positions[(index + offset) % count]!;
    return [x, y, count === 10 && layoutIndex === 1 ? size * 0.75 : size] as const;
  });
}
