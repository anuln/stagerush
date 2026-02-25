export interface GameFrameLayoutInput {
  viewportWidth: number;
  viewportHeight: number;
  isMobile: boolean;
  baseWidth?: number;
  baseHeight?: number;
  desktopMaxScale?: number;
}

export interface GameFrameLayoutMetrics {
  logicalWidth: number;
  logicalHeight: number;
  displayWidth: number;
  displayHeight: number;
  scale: number;
}

const DEFAULT_BASE_WIDTH = 432;
const DEFAULT_BASE_HEIGHT = 768;
const DEFAULT_DESKTOP_MAX_SCALE = 1;

export function resolveGameFrameLayout(
  input: GameFrameLayoutInput
): GameFrameLayoutMetrics {
  const logicalWidth = Math.max(1, Math.round(input.baseWidth ?? DEFAULT_BASE_WIDTH));
  const logicalHeight = Math.max(1, Math.round(input.baseHeight ?? DEFAULT_BASE_HEIGHT));
  const viewportWidth = Math.max(1, Math.floor(input.viewportWidth));
  const viewportHeight = Math.max(1, Math.floor(input.viewportHeight));
  const desktopMaxScale = Math.max(
    0.1,
    input.desktopMaxScale ?? DEFAULT_DESKTOP_MAX_SCALE
  );

  const fitScale = Math.min(
    viewportWidth / logicalWidth,
    viewportHeight / logicalHeight
  );
  const scale = input.isMobile
    ? Math.max(0.1, fitScale)
    : Math.max(0.1, Math.min(fitScale, desktopMaxScale));

  return {
    logicalWidth,
    logicalHeight,
    displayWidth: Math.max(1, Math.round(logicalWidth * scale)),
    displayHeight: Math.max(1, Math.round(logicalHeight * scale)),
    scale
  };
}
