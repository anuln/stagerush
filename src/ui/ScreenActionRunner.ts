import type { BundleManager } from "../assets/BundleManager";
import type { AudioManager } from "../audio/AudioManager";
import type { ScreenActionId } from "./ScreenState";

interface ScreenActionRunnerDeps {
  hasFestivalManifest: boolean;
  bundleId: string;
  gameManager: {
    handleScreenAction: (actionId: ScreenActionId) => void;
  };
  bundleManager: Pick<BundleManager, "loadBundle" | "unloadBundle">;
  audioManager: Pick<AudioManager, "stopMusic"> | null;
  redraw: () => void;
}

function needsFestivalAssets(actionId: ScreenActionId): boolean {
  return (
    actionId === "START_FESTIVAL" ||
    actionId === "RETRY_LEVEL" ||
    actionId === "NEXT_LEVEL"
  );
}

export async function runScreenActionWithAssets(
  deps: ScreenActionRunnerDeps,
  actionId: ScreenActionId
): Promise<void> {
  if (deps.hasFestivalManifest && needsFestivalAssets(actionId)) {
    await deps.bundleManager.loadBundle(deps.bundleId);
    deps.redraw();
  }

  deps.gameManager.handleScreenAction(actionId);

  if (deps.hasFestivalManifest && actionId === "RETURN_TO_MENU") {
    await deps.bundleManager.unloadBundle(deps.bundleId);
    deps.audioManager?.stopMusic();
  }
}
