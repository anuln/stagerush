export interface Vector2 {
  x: number;
  y: number;
}

export function addScaledVector(
  origin: Vector2,
  velocity: Vector2,
  deltaSeconds: number
): Vector2 {
  return {
    x: origin.x + velocity.x * deltaSeconds,
    y: origin.y + velocity.y * deltaSeconds
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function scaleVector(vector: Vector2, scale: number): Vector2 {
  return {
    x: vector.x * scale,
    y: vector.y * scale
  };
}
