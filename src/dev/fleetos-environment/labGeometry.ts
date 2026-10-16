import type { ProtectedRegion, Size } from "./workspaceGeometry";

export const EXPLORER_WIDTH = 310;
export function railGeometry(size: Size) {
  const x = size.width <= 600 ? 12 : 28;
  return { x, width: 50, protectedRight: Math.min(size.width, x + 50 + 18) };
}
/** Floating visuals and protected geometry share configuration, not DOM measurements. */
export function labChrome(size: Size, explorerOpen = false): ProtectedRegion[] {
  const rail = railGeometry(size);
  return [
    {
      id: "floating-rail",
      kind: "permanent-chrome",
      bounds: { x: 0, y: 0, width: rail.protectedRight, height: size.height },
    },
    ...(explorerOpen
      ? [
          {
            id: "dev-instruments",
            kind: "temporary-dev-chrome",
            bounds: {
              x: Math.max(
                rail.protectedRight,
                size.width - Math.min(EXPLORER_WIDTH, size.width - 32) - 32,
              ),
              y: 0,
              width: Math.min(
                size.width - rail.protectedRight,
                EXPLORER_WIDTH + 32,
              ),
              height: size.height,
            },
          },
        ]
      : []),
  ];
}
