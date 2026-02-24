import { GAME_CONFIG } from "../config/GameConfig";

export interface DebugToggles {
  showSpawnPoints: boolean;
}

export function createDebugToggles(
  overrides: Partial<DebugToggles> = {}
): DebugToggles {
  return {
    showSpawnPoints: GAME_CONFIG.debug.showSpawnPoints,
    ...overrides
  };
}
