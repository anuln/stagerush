import { Container, Graphics } from "pixi.js";
import { Artist } from "../entities/Artist";
import { TimerRingRenderer } from "./TimerRingRenderer";

const TIER_STYLE = {
  headliner: { radius: 14, fill: 0xe7bf2f },
  midtier: { radius: 11, fill: 0xb8b8c2 },
  newcomer: { radius: 9, fill: 0xc27a43 }
} as const;

export class ArtistRenderer {
  private readonly layer: Container;
  private readonly timerRingRenderer = new TimerRingRenderer();

  constructor(layer: Container) {
    this.layer = layer;
  }

  render(artists: Artist[]): void {
    this.layer.removeChildren();

    for (const artist of artists) {
      if (artist.state === "COMPLETED") {
        continue;
      }

      const style = TIER_STYLE[artist.tier];
      const container = new Container();
      container.position.set(artist.position.x, artist.position.y);

      const timerProgress = artist.initialTimerSeconds
        ? artist.timerRemainingSeconds / artist.initialTimerSeconds
        : 0;
      container.addChild(this.timerRingRenderer.createRing(style.radius, timerProgress));

      const body = new Graphics();
      body.circle(0, 0, style.radius);
      body.fill(artist.state === "MISSED" ? 0x4a4a4a : style.fill);
      body.stroke({ color: 0x151515, width: 2 });
      container.addChild(body);

      this.layer.addChild(container);
    }
  }
}
