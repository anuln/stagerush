import { describe, expect, it } from "vitest";
import { Artist } from "../entities/Artist";
import { PathDrawingInput } from "./PathDrawingInput";

function makeArtist(id: string, x: number, y: number): Artist {
  return new Artist({
    id,
    tier: "newcomer",
    position: { x, y },
    velocity: { x: 0, y: 0 },
    timerSeconds: 15
  });
}

describe("PathDrawingInput", () => {
  it("starts session when pointer is near artist", () => {
    const artist = makeArtist("a1", 100, 100);
    const input = new PathDrawingInput(() => [artist], 40);

    const started = input.pointerDown(120, 100, 1);
    input.pointerMove(130, 110);
    const ended = input.pointerUp(130, 110, 2);

    expect(started).toBe(true);
    expect(ended).not.toBeNull();
    expect(ended?.artistId).toBe("a1");
    expect(ended?.rawPoints.length).toBeGreaterThanOrEqual(2);
  });

  it("does not start session when pointer is outside grab radius", () => {
    const artist = makeArtist("a1", 100, 100);
    const input = new PathDrawingInput(() => [artist], 20);

    const started = input.pointerDown(200, 200, 1);
    const ended = input.pointerUp(200, 200, 2);

    expect(started).toBe(false);
    expect(ended).toBeNull();
  });

  it("accumulates move points while drawing", () => {
    const artist = makeArtist("a1", 100, 100);
    const input = new PathDrawingInput(() => [artist], 40);

    input.pointerDown(102, 100, 1);
    input.pointerMove(110, 100);
    input.pointerMove(120, 110);
    const ended = input.pointerUp(130, 120, 2);

    expect(ended).not.toBeNull();
    expect(ended?.rawPoints.length).toBeGreaterThanOrEqual(4);
    expect(ended?.rawPoints[0]).toEqual({ x: 100, y: 100 });
  });

  it("clears active session on cancel", () => {
    const artist = makeArtist("a1", 100, 100);
    const input = new PathDrawingInput(() => [artist], 40);

    input.pointerDown(105, 100, 1);
    const cancelled = input.pointerCancel(2);

    expect(cancelled).not.toBeNull();
    expect(input.getActiveSession()).toBeNull();
    expect(input.pointerUp(110, 110, 3)).toBeNull();
  });
});
