export class LivesState {
  private lives: number;

  constructor(initialLives = 3) {
    this.lives = Math.max(0, initialLives);
  }

  get remainingLives(): number {
    return this.lives;
  }

  get isLevelFailed(): boolean {
    return this.lives === 0;
  }

  recordMiss(): void {
    if (this.lives === 0) {
      return;
    }
    this.lives -= 1;
  }
}
