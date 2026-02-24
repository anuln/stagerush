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

  it("ignores a second pointerDown while a session is already active", () => {
    const a = makeArtist("a1", 100, 100);
    const b = makeArtist("a2", 140, 100);
    const input = new PathDrawingInput(() => [a, b], 45);

    const first = input.pointerDown(100, 100, 10);
    const second = input.pointerDown(140, 100, 11);
    const ended = input.pointerUp(120, 100, 12);

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(ended?.artistId).toBe("a1");
  });

  it("uses injected clock value for cancel when timestamp is omitted", () => {
    const artist = makeArtist("a1", 100, 100);
    const input = new PathDrawingInput(() => [artist], 40, () => 1234);

    input.pointerDown(105, 100, 1000);
    const cancelled = input.pointerCancel();

    expect(cancelled).not.toBeNull();
    expect(cancelled?.startedAtMs).toBe(1000);
    expect(cancelled?.endedAtMs).toBe(1234);
  });
});
