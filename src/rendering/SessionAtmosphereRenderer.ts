import { Container, Graphics, Sprite, Texture } from "pixi.js";
import type { SessionFxConfig, SessionPeriod } from "../config/FestivalConfig";
import type { FireworksFxProfile, LevelFxProfile } from "../config/FxLedger";
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

interface FireworkParticleState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: number;
}

interface RuntimeFxContext {
  levelNumber: number;
  dayNumber: number;
  sessionIndexInDay: number;
  outcome: "ACTIVE" | "FAILED" | "COMPLETED";
  remainingTimeSeconds: number;
}

interface FireworksPlan {
  profile: FireworksFxProfile;
  endAtMs: number;
  remainingBursts: number;
  nextBurstAtMs: number;
}

interface FireworksPlanOptions {
  densityScale?: number;
  ensureCoverage?: boolean;
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

export function shouldTriggerFinaleCountdownFireworks(
  context: RuntimeFxContext | null
): boolean {
  if (!context) {
    return false;
  }
  if (context.dayNumber !== 3 || context.sessionIndexInDay !== 3) {
    return false;
  }
  if (context.outcome === "FAILED") {
    return false;
  }
  return Number.isFinite(context.remainingTimeSeconds) &&
    context.remainingTimeSeconds <= 15;
}

function buildFinaleCountdownProfile(
  profile: FireworksFxProfile
): FireworksFxProfile {
  return {
    ...profile,
    durationMs: Math.max(profile.durationMs, 20_000),
    burstCountMin: Math.max(profile.burstCountMin, Math.round(profile.burstCountMin * 1.4)),
    burstCountMax: Math.max(profile.burstCountMax, Math.round(profile.burstCountMax * 1.55)),
    launchIntervalMsMin: Math.max(150, Math.round(profile.launchIntervalMsMin * 0.95)),
    launchIntervalMsMax: Math.max(300, Math.round(profile.launchIntervalMsMax * 1.05))
  };
}

export class SessionAtmosphereRenderer {
  private readonly root: Container;
  private readonly overlay = new Graphics();
  private readonly stageGlow = new Graphics();
  private readonly particlesLayer = new Container();
  private readonly fireworksLayer = new Container();
  private readonly fireworksGraphics = new Graphics();
  private readonly particles: ParticleState[] = [];
  private readonly fireworkParticles: FireworkParticleState[] = [];
  private layout: ResolvedFestivalLayout | null = null;
  private config: SessionFxConfig | undefined;
  private activeSession: SessionPeriod = "morning";
  private blendSession: SessionPeriod = "morning";
  private levelFx: LevelFxProfile | null = null;
  private runtimeContext: RuntimeFxContext | null = null;
  private transition = 1;
  private elapsedMs = 0;
  private effectsDensity = 1;
  private fireworksPlan: FireworksPlan | null = null;
  private lastFireworksTriggerKey: string | null = null;

  constructor(parent: Container) {
    this.root = parent;
    this.root.label = "sessionAtmosphereLayer";
    this.fireworksLayer.addChild(this.fireworksGraphics);
    this.root.addChild(
      this.overlay,
      this.stageGlow,
      this.particlesLayer,
      this.fireworksLayer
    );
  }

  setLayout(layout: ResolvedFestivalLayout): void {
    this.layout = layout;
    this.config = layout.map.sessionFx;
    this.renderOverlay(0xffffff, 0);
  }

  setConfig(config: SessionFxConfig | undefined): void {
    this.config = config;
  }

  setLevelFx(levelFx: LevelFxProfile | null): void {
    this.levelFx = levelFx;
  }

  setRuntimeContext(context: RuntimeFxContext | null): void {
    this.runtimeContext = context;
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

    const fromProfile =
      this.levelFx?.atmosphere ??
      resolveSessionFxProfile(this.config, this.blendSession);
    const toProfile =
      this.levelFx?.atmosphere ??
      resolveSessionFxProfile(this.config, this.activeSession);
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
    this.updateFireworks(deltaSeconds);
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

  private updateFireworks(deltaSeconds: number): void {
    this.maybeTriggerFireworks();
    const plan = this.fireworksPlan;
    if (plan) {
      while (
        plan.remainingBursts > 0 &&
        this.elapsedMs >= plan.nextBurstAtMs &&
        this.elapsedMs <= plan.endAtMs
      ) {
        this.spawnFireworkBurst(plan.profile);
        plan.remainingBursts -= 1;
        plan.nextBurstAtMs += randomRange(
          plan.profile.launchIntervalMsMin,
          plan.profile.launchIntervalMsMax
        );
      }
      if (
        (this.elapsedMs > plan.endAtMs && plan.remainingBursts <= 0) ||
        this.elapsedMs > plan.endAtMs + 1200
      ) {
        this.fireworksPlan = null;
      }
    }

    if (this.fireworkParticles.length === 0 && !this.fireworksPlan) {
      this.fireworksGraphics.clear();
      return;
    }

    const gravity = 42;
    for (let index = this.fireworkParticles.length - 1; index >= 0; index -= 1) {
      const particle = this.fireworkParticles[index];
      particle.vy += gravity * deltaSeconds;
      particle.x += particle.vx * deltaSeconds;
      particle.y += particle.vy * deltaSeconds;
      particle.life -= deltaSeconds;
      if (particle.life <= 0) {
        this.fireworkParticles.splice(index, 1);
      }
    }

    this.fireworksGraphics.clear();
    const alphaBase = this.levelFx?.fireworks.trailAlpha ?? 0.86;
    for (const particle of this.fireworkParticles) {
      const lifeRatio = clamp(particle.life / particle.maxLife, 0, 1);
      this.fireworksGraphics.circle(particle.x, particle.y, particle.size);
      this.fireworksGraphics.fill({
        color: particle.color,
        alpha: lifeRatio * alphaBase
      });
    }
  }

  private maybeTriggerFireworks(): void {
    const runtime = this.runtimeContext;
    const profile = this.levelFx?.fireworks;
    if (!runtime || !profile?.enabled) {
      return;
    }
    if (
      runtime.dayNumber === 3 &&
      runtime.sessionIndexInDay === 3 &&
      runtime.remainingTimeSeconds > 20
    ) {
      this.lastFireworksTriggerKey = null;
    }
    if (shouldTriggerFinaleCountdownFireworks(runtime)) {
      const triggerKey = `${runtime.levelNumber}-${runtime.dayNumber}-${runtime.sessionIndexInDay}-countdown`;
      if (triggerKey !== this.lastFireworksTriggerKey) {
        this.lastFireworksTriggerKey = triggerKey;
        this.startFireworksPlan(buildFinaleCountdownProfile(profile), {
          densityScale: Math.max(0.6, this.effectsDensity),
          ensureCoverage: true
        });
      }
    }
    if (runtime.outcome !== "COMPLETED") {
      return;
    }
    if (runtime.sessionIndexInDay !== 3) {
      return;
    }
    if (
      runtime.dayNumber === 3 &&
      this.lastFireworksTriggerKey ===
        `${runtime.levelNumber}-${runtime.dayNumber}-${runtime.sessionIndexInDay}-countdown`
    ) {
      return;
    }
    const triggerKey = `${runtime.levelNumber}-${runtime.dayNumber}-${runtime.sessionIndexInDay}-complete`;
    if (triggerKey === this.lastFireworksTriggerKey) {
      return;
    }
    this.lastFireworksTriggerKey = triggerKey;
    this.startFireworksPlan(profile, { ensureCoverage: true });
  }

  private startFireworksPlan(
    profile: FireworksFxProfile,
    options: FireworksPlanOptions = {}
  ): void {
    const densityScale = clamp(options.densityScale ?? this.effectsDensity, 0.2, 1);
    const burstCountMin = Math.max(
      0,
      Math.round(profile.burstCountMin * densityScale)
    );
    const burstCountMax = Math.max(
      burstCountMin,
      Math.round(profile.burstCountMax * densityScale)
    );
    const sampledBursts = randomRangeInt(burstCountMin, burstCountMax);
    const averageIntervalMs = Math.max(
      1,
      (profile.launchIntervalMsMin + profile.launchIntervalMsMax) / 2
    );
    const coverageBursts = options.ensureCoverage
      ? Math.max(1, Math.ceil(profile.durationMs / averageIntervalMs))
      : 0;
    this.fireworksPlan = {
      profile,
      endAtMs: this.elapsedMs + profile.durationMs,
      remainingBursts: Math.max(sampledBursts, coverageBursts),
      nextBurstAtMs: this.elapsedMs + randomRange(90, 200)
    };
  }

  private spawnFireworkBurst(profile: FireworksFxProfile): void {
    if (!this.layout) {
      return;
    }
    const burstCount = randomRangeInt(
      Math.max(4, Math.round(profile.particlesPerBurstMin * this.effectsDensity)),
      Math.max(6, Math.round(profile.particlesPerBurstMax * this.effectsDensity))
    );
    const centerX = randomRange(
      this.layout.viewport.width * 0.12,
      this.layout.viewport.width * 0.88
    );
    const centerY = randomRange(
      this.layout.viewport.height * 0.12,
      this.layout.viewport.height * 0.44
    );
    const radius = randomRange(profile.burstRadiusMin, profile.burstRadiusMax);
    const palette =
      profile.colors.length > 0
        ? profile.colors
        : ["#FFFFFF", "#FFD166", "#FF8C5A", "#6EE7D4"];
    for (let index = 0; index < burstCount; index += 1) {
      const angle = (Math.PI * 2 * index) / burstCount + randomRange(-0.22, 0.22);
      const speed = radius * (0.72 + Math.random() * 0.66);
      const life = randomRange(0.55, 1.05);
      const colorHex = palette[Math.floor(Math.random() * palette.length)] ?? "#FFFFFF";
      this.fireworkParticles.push({
        x: centerX,
        y: centerY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - randomRange(8, 18),
        life,
        maxLife: life,
        size: randomRange(1.1, 2.8),
        color: parseHexColor(colorHex)
      });
    }
  }
}

function randomRange(min: number, max: number): number {
  if (max <= min) {
    return min;
  }
  return min + Math.random() * (max - min);
}

function randomRangeInt(min: number, max: number): number {
  if (max <= min) {
    return Math.floor(min);
  }
  return Math.floor(randomRange(min, max + 1));
}
