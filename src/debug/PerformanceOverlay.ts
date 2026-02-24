import type { QualityTier } from "../config/GameConfig";
import type { RuntimeOutcome } from "../game/GameRuntime";

export interface RuntimeTelemetrySnapshot {
  frameDeltaMs: number;
  updateDurationMs: number;
  activeArtists: number;
  spawnedArtists: number;
  resolvedArtists: number;
  activeDistractions: number;
  activePaths: number;
  runtimeOutcome: RuntimeOutcome;
  qualityTier: QualityTier;
  rendererResolution: number;
  averageFps: number;
}

export function formatPerformanceOverlayLines(
  telemetry: RuntimeTelemetrySnapshot
): string[] {
  return [
    `FPS ${telemetry.averageFps.toFixed(1)} | Q ${telemetry.qualityTier} @${telemetry.rendererResolution.toFixed(2)}x`,
    `Frame ${telemetry.frameDeltaMs.toFixed(1)}ms | Update ${telemetry.updateDurationMs.toFixed(1)}ms`,
    `Artists ${telemetry.activeArtists} active (${telemetry.spawnedArtists}/${telemetry.resolvedArtists})`,
    `Paths ${telemetry.activePaths} | Distractions ${telemetry.activeDistractions} | ${telemetry.runtimeOutcome}`
  ];
}

export class PerformanceOverlay {
  private readonly element: HTMLDivElement | null;

  constructor(enabled = false) {
    if (!enabled || typeof document === "undefined") {
      this.element = null;
      return;
    }

    const element = document.createElement("div");
    element.id = "perf-overlay";
    element.style.position = "fixed";
    element.style.left = "12px";
    element.style.bottom = "12px";
    element.style.zIndex = "9999";
    element.style.padding = "8px 10px";
    element.style.borderRadius = "8px";
    element.style.background = "rgba(8, 9, 14, 0.72)";
    element.style.color = "#d5ffe1";
    element.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, monospace";
    element.style.fontSize = "11px";
    element.style.lineHeight = "1.35";
    element.style.pointerEvents = "none";
    element.style.whiteSpace = "pre";
    element.textContent = "Performance overlay enabled";
    document.body.appendChild(element);
    this.element = element;
  }

  update(telemetry: RuntimeTelemetrySnapshot): void {
    if (!this.element) {
      return;
    }
    this.element.textContent = formatPerformanceOverlayLines(telemetry).join("\n");
  }

  dispose(): void {
    if (!this.element) {
      return;
    }
    this.element.remove();
  }
}
