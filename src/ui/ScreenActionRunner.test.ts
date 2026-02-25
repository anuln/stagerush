import { describe, expect, it, vi } from "vitest";
import { runScreenActionWithAssets } from "./ScreenActionRunner";
import type { ScreenActionId } from "./ScreenState";

function createDeps() {
  return {
    hasFestivalManifest: true,
    bundleId: "govball-festival",
    gameManager: {
      handleScreenAction: vi.fn<(actionId: ScreenActionId) => void>()
    },
    bundleManager: {
      loadBundle: vi.fn(async () => true),
      unloadBundle: vi.fn(async () => true)
    },
    audioManager: {
      stopMusic: vi.fn()
    },
    redraw: vi.fn()
  };
}

describe("runScreenActionWithAssets", () => {
  it("redraws after loading festival assets before start action", async () => {
    const deps = createDeps();

    await runScreenActionWithAssets(deps, "START_FESTIVAL");

    expect(deps.bundleManager.loadBundle).toHaveBeenCalledWith("govball-festival");
    expect(deps.redraw).toHaveBeenCalledTimes(1);
    expect(deps.gameManager.handleScreenAction).toHaveBeenCalledWith("START_FESTIVAL");
  });

  it("unloads festival assets and stops music when returning to menu", async () => {
    const deps = createDeps();

    await runScreenActionWithAssets(deps, "RETURN_TO_MENU");

    expect(deps.bundleManager.unloadBundle).toHaveBeenCalledWith("govball-festival");
    expect(deps.audioManager.stopMusic).toHaveBeenCalledTimes(1);
  });
});
