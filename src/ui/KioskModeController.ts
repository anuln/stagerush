interface WakeLockSentinelLike {
  release: () => Promise<void>;
  addEventListener?: (event: "release", handler: () => void) => void;
}

interface WakeLockLike {
  request: (type: "screen") => Promise<WakeLockSentinelLike>;
}

export class KioskModeController {
  private readonly onFullscreenChange: () => void;
  private wakeLock: WakeLockSentinelLike | null = null;
  private isPinned = false;

  constructor() {
    this.onFullscreenChange = () => {
      this.syncPinnedState(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", this.onFullscreenChange);
    this.syncPinnedState(Boolean(document.fullscreenElement));
  }

  dispose(): void {
    document.removeEventListener("fullscreenchange", this.onFullscreenChange);
    void this.releaseWakeLock();
  }

  async enterPinnedMode(): Promise<void> {
    if (this.isPinned) {
      return;
    }
    const enteredFullscreen = await this.requestFullscreen();
    await this.acquireWakeLock();
    this.syncPinnedState(enteredFullscreen || Boolean(this.wakeLock));
  }

  private syncPinnedState(nextPinned: boolean): void {
    this.isPinned = nextPinned;
    document.body.classList.toggle("kiosk-mode", this.isPinned);
  }

  private async requestFullscreen(): Promise<boolean> {
    if (document.fullscreenElement) {
      return true;
    }
    const target = document.documentElement as HTMLElement & {
      requestFullscreen?: () => Promise<void>;
    };
    if (typeof target.requestFullscreen !== "function") {
      return false;
    }
    try {
      await target.requestFullscreen();
      return true;
    } catch {
      return false;
    }
  }

  private async acquireWakeLock(): Promise<void> {
    const nav = navigator as Navigator & { wakeLock?: WakeLockLike };
    if (!nav.wakeLock?.request) {
      return;
    }
    try {
      this.wakeLock = await nav.wakeLock.request("screen");
      this.wakeLock.addEventListener?.("release", () => {
        this.wakeLock = null;
      });
    } catch {
      this.wakeLock = null;
    }
  }

  private async releaseWakeLock(): Promise<void> {
    if (!this.wakeLock) {
      return;
    }
    const activeWakeLock = this.wakeLock;
    this.wakeLock = null;
    try {
      await activeWakeLock.release();
    } catch {
      // ignore release errors
    }
  }
}
