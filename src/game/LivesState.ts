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

  recordIncident(count = 1): void {
    if (this.lives === 0 || count <= 0) {
      return;
    }
    this.lives = Math.max(0, this.lives - Math.floor(count));
  }

  recordMiss(): void {
    this.recordIncident(1);
  }
}
