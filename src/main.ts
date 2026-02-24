import { Application, Graphics } from "pixi.js";
import "./styles.css";

function isMobileUserAgent(): boolean {
  return /Mobi|Android/i.test(navigator.userAgent);
}

async function bootstrap(): Promise<void> {
  const isMobile = isMobileUserAgent();
  const dpr = window.devicePixelRatio || 1;
  const resolution = isMobile ? Math.min(dpr, 1.5) : dpr;

  const app = new Application();
  await app.init({
    resizeTo: window,
    autoDensity: true,
    resolution,
    powerPreference: isMobile ? "low-power" : "high-performance",
    backgroundAlpha: 1,
    backgroundColor: 0x1a1a2e
  });

  document.body.appendChild(app.canvas);

  const placeholder = new Graphics();
  placeholder.roundRect(24, 24, 180, 84, 14);
  placeholder.fill(0xff6b35);
  app.stage.addChild(placeholder);

  let elapsedSeconds = 0;
  app.ticker.add((ticker) => {
    elapsedSeconds += ticker.deltaMS / 1000;
    if (elapsedSeconds > 3600) {
      elapsedSeconds = 0;
    }
  });
}

void bootstrap();
