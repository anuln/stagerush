import { Container, Graphics, Sprite, Texture } from "pixi.js";
import type { SessionFxConfig, SessionPeriod } from "../config/FestivalConfig";
import {
  resolveSessionFxProfile,
  SESSION_PERIODS
} from "../config/SessionFx";
import type { ResolvedFestivalLayout } from "../maps/MapLoader";

interface ParticleState {
  sprite: Sprite;
  x: number;
  y: number;
  speed: number;
  size: number;
  drift: number;
}

interface RgbColor {
  r: number;
  g: number;
  b: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseHexColor(hex: string): number {
  const normalized = hex.trim().replace("#", "");
  const parsed = Number.parseInt(normalized, 16);
  return Number.isFinite(parsed) ? parsed : 0xffffff;
}

function toRgb(hex: string): RgbColor {
  const color = parseHexColor(hex);
  return {
    r: (color >> 16) & 0xff,
    g: (color >> 8) & 0xff,
    b: color & 0xff
  };
}

function rgbToHex(color: RgbColor): number {
  const r = Math.round(clamp(color.r, 0, 255));
  const g = Math.round(clamp(color.g, 0, 255));
  const b = Math.round(clamp(color.b, 0, 255));
  return (r << 16) | (g << 8) | b;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpColor(a: RgbColor, b: RgbColor, t: number): RgbColor {
  return {
    r: lerp(a.r, b.r, t),
    g: lerp(a.g, b.g, t),
    b: lerp(a.b, b.b, t)
  };
}

export class SessionAtmosphereRenderer {
  private readonly root: Container;
  private readonly overlay = new Graphics();
  private readonly stageGlow = new Graphics();
  private readonly particlesLayer = new Container();
  private readonly particles: ParticleState[] = [];
  private layout: ResolvedFestivalLayout | null = null;
  private config: SessionFxConfig | undefined;
  private activeSession: SessionPeriod = "morning";
  private blendSession: SessionPeriod = "morning";
  private transition = 1;
  private elapsedMs = 0;
  private effectsDensity = 1;

  constructor(parent: Container) {
    this.root = parent;
    this.root.label = "sessionAtmosphereLayer";
    this.root.addChild(this.overlay, this.stageGlow, this.particlesLayer);
  }

  setLayout(layout: ResolvedFestivalLayout): void {
    this.layout = layout;
    this.config = layout.map.sessionFx;
    this.renderOverlay(0xffffff, 0);
  }

  setConfig(config: SessionFxConfig | undefined): void {
    this.config = config;
  }

  setSession(next: SessionPeriod): void {
    if (!SESSION_PERIODS.includes(next)) {
      return;
    }
    if (this.activeSession === next) {
      return;
    }
    this.blendSession = this.activeSession;
    this.activeSession = next;
    this.transition = 0;
  }

  update(deltaSeconds: number, effectsDensity: number): void {
    if (!this.layout) {
      return;
    }
    this.effectsDensity = clamp(effectsDensity, 0.2, 1);
    this.elapsedMs += Math.max(0, deltaSeconds * 1000);

    const fromProfile = resolveSessionFxProfile(this.config, this.blendSession);
    const toProfile = resolveSessionFxProfile(this.config, this.activeSession);
    this.transition = clamp(this.transition + deltaSeconds / 0.9, 0, 1);
    const t = this.transition;
    const overlayColor = rgbToHex(
      lerpColor(toRgb(fromProfile.overlayColor), toRgb(toProfile.overlayColor), t)
    );
    const overlayOpacity = lerp(
      fromProfile.overlayOpacity,
      toProfile.overlayOpacity,
      t
    );
    const particleColor = rgbToHex(
      lerpColor(toRgb(fromProfile.particleColor), toRgb(toProfile.particleColor), t)
    );
    const particleCount = Math.round(
      lerp(fromProfile.particleCount, toProfile.particleCount, t) * this.effectsDensity
    );
    const particleSpeed = lerp(
      fromProfile.particleSpeed,
      toProfile.particleSpeed,
      t
    );
    const stageGlow = lerp(fromProfile.stageGlow, toProfile.stageGlow, t);

    this.renderOverlay(overlayColor, overlayOpacity);
    this.renderStageGlow(stageGlow);
    this.updateParticles(particleCount, particleColor, particleSpeed, deltaSeconds);
  }

  private renderOverlay(color: number, alpha: number): void {
    if (!this.layout) {
      return;
    }
    this.overlay.clear();
    this.overlay.rect(0, 0, this.layout.viewport.width, this.layout.viewport.height);
    this.overlay.fill({ color, alpha });
  }

  private renderStageGlow(intensity: number): void {
    if (!this.layout) {
      return;
    }
    this.stageGlow.clear();
    const pulse = 0.92 + Math.sin(this.elapsedMs / 530) * 0.08;
    const alpha = clamp(intensity * 0.28 * pulse * this.effectsDensity, 0, 0.45);
    for (const stage of this.layout.stages) {
      this.stageGlow.circle(
        stage.screenPosition.x,
        stage.screenPosition.y,
        Math.max(stage.pixelWidth, stage.pixelHeight) * 0.68
      );
      this.stageGlow.fill({
        color: parseHexColor(stage.color),
        alpha
      });
    }
  }

  private updateParticles(
    targetCount: number,
    tint: number,
    speed: number,
    deltaSeconds: number
  ): void {
    if (!this.layout) {
      return;
    }
    while (this.particles.length < targetCount) {
      const sprite = new Sprite(Texture.WHITE);
      sprite.anchor.set(0.5);
      this.particlesLayer.addChild(sprite);
      this.particles.push({
        sprite,
        x: Math.random() * this.layout.viewport.width,
        y: Math.random() * this.layout.viewport.height,
        speed: speed * (0.7 + Math.random() * 0.7),
        size: 1 + Math.random() * 2.2,
        drift: (Math.random() - 0.5) * 14
      });
    }
    while (this.particles.length > targetCount) {
      const particle = this.particles.pop();
      particle?.sprite.destroy();
    }

    const travelDirection = this.activeSession === "evening" ? -1 : 1;
    const width = this.layout.viewport.width;
    const height = this.layout.viewport.height;
    for (const particle of this.particles) {
      particle.sprite.tint = tint;
      particle.sprite.alpha = this.activeSession === "evening" ? 0.2 : 0.12;
      particle.sprite.width = particle.size;
      particle.sprite.height = particle.size;
      particle.y += travelDirection * particle.speed * deltaSeconds;
      particle.x += particle.drift * deltaSeconds;
      if (particle.y < -8) {
        particle.y = height + 8;
      }
      if (particle.y > height + 8) {
        particle.y = -8;
      }
      if (particle.x < -8) {
        particle.x = width + 8;
      }
      if (particle.x > width + 8) {
        particle.x = -8;
      }
      particle.sprite.position.set(particle.x, particle.y);
    }
  }
}

