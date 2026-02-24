import { Graphics } from "pixi.js";
import { clamp } from "../utils/MathUtils";

function timerColor(progress: number): number {
  if (progress > 0.66) {
    return 0x36d67a;
  }
  if (progress > 0.33) {
    return 0xf3c651;
  }
  return 0xe74b5c;
}

export class TimerRingRenderer {
  createRing(radius: number, progress: number): Graphics {
    const ring = new Graphics();
    const safeProgress = clamp(progress, 0, 1);

    ring.circle(0, 0, radius + 4);
    ring.stroke({ color: 0x2a2a2a, width: 2, alpha: 0.7 });

    ring.arc(
      0,
      0,
      radius + 4,
      -Math.PI / 2,
      -Math.PI / 2 + safeProgress * Math.PI * 2
    );
    ring.stroke({ color: timerColor(safeProgress), width: 3, alpha: 0.95 });

    return ring;
  }
}
