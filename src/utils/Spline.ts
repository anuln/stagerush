import type { Vector2 } from "./MathUtils";

function distance(a: Vector2, b: Vector2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.hypot(dx, dy);
}

function catmullRomPoint(
  p0: Vector2,
  p1: Vector2,
  p2: Vector2,
  p3: Vector2,
  t: number
): Vector2 {
  const t2 = t * t;
  const t3 = t2 * t;

  return {
    x:
      0.5 *
      ((2 * p1.x) +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y:
      0.5 *
      ((2 * p1.y) +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
  };
}

export function smoothCatmullRom(
  points: Vector2[],
  segmentsPerCurve = 8
): Vector2[] {
  if (points.length <= 2) {
    return [...points];
  }

  const output: Vector2[] = [points[0]];
  const segments = Math.max(2, Math.floor(segmentsPerCurve));

  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    for (let step = 1; step <= segments; step += 1) {
      const t = step / segments;
      output.push(catmullRomPoint(p0, p1, p2, p3, t));
    }
  }

  output[0] = points[0];
  output[output.length - 1] = points[points.length - 1];
  return output;
}

export function pathLength(points: Vector2[]): number {
  if (points.length <= 1) {
    return 0;
  }

  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += distance(points[i - 1], points[i]);
  }
  return total;
}

export function resampleBySpacing(points: Vector2[], spacingPx: number): Vector2[] {
  if (points.length <= 1) {
    return [...points];
  }

  const spacing = Math.max(1, spacingPx);
  const sampled: Vector2[] = [{ ...points[0] }];
  let carry = 0;

  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1];
    const to = points[i];
    const segmentLength = distance(from, to);

    if (segmentLength === 0) {
      continue;
    }

    let traversed = spacing - carry;
    while (traversed <= segmentLength) {
      const t = traversed / segmentLength;
      sampled.push({
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t
      });
      traversed += spacing;
    }

    carry = segmentLength - (traversed - spacing);
    if (carry < 0 || carry >= spacing) {
      carry = 0;
    }
  }

  const last = points[points.length - 1];
  const tail = sampled[sampled.length - 1];
  if (!tail || tail.x !== last.x || tail.y !== last.y) {
    sampled.push({ ...last });
  }

  return sampled;
}
