import { describe, expect, it } from "vitest";
import { Artist } from "../entities/Artist";
import type { PlannedPath } from "../game/PathPlanner";
import { PathFollower } from "./PathFollower";

function makeArtist(): Artist {
  return new Artist({
    id: "artist-1",
    tier: "newcomer",
    position: { x: 0, y: 0 },
    velocity: { x: 40, y: 0 },
    timerSeconds: 20
  });
}

function makePath(id: string, points: Array<{ x: number; y: number }>): PlannedPath {
  return {
    artistId: "artist-1",
    rawPoints: points,
    smoothedPoints: points,
    length: 100,
    targetStageId: "stage-1",
    stageColor: "#ffffff",
    isValid: true,
    pathId: id
  };
}

describe("PathFollower", () => {
  it("moves artist along path until completion", () => {
    const artist = makeArtist();
    const follower = new PathFollower(40);
    follower.assignPath(artist, makePath("p1", [
      { x: 0, y: 0 },
      { x: 100, y: 0 }
    ]));

    follower.update([artist], 1.0);
    expect(artist.position.x).toBeCloseTo(40, 4);
    expect(artist.state).toBe("FOLLOWING");

    follower.update([artist], 2.0);
    expect(artist.position.x).toBeCloseTo(100, 4);
    expect(artist.state).toBe("ARRIVING");
  });

  it("replaces active path from current position without jump", () => {
    const artist = makeArtist();
    const follower = new PathFollower(40);

    follower.assignPath(artist, makePath("p1", [
      { x: 0, y: 0 },
      { x: 100, y: 0 }
    ]));
    follower.update([artist], 1.0);

    const beforeReplace = artist.position.x;
    follower.assignPath(artist, makePath("p2", [
      { x: 100, y: 0 },
      { x: 100, y: 100 }
    ]));
    follower.update([artist], 0.5);

    expect(artist.position.x).toBeGreaterThanOrEqual(beforeReplace);
    expect(artist.position.y).toBeGreaterThan(0);
  });

  it("ignores invalid path assignment", () => {
    const artist = makeArtist();
    const follower = new PathFollower(40);

    follower.assignPath(artist, {
      ...makePath("p3", [
        { x: 0, y: 0 },
        { x: 10, y: 0 }
      ]),
      isValid: false,
      targetStageId: null
    });

    follower.update([artist], 1);
    expect(artist.position.x).toBeCloseTo(0, 4);
    expect(artist.state).toBe("DRIFTING");
  });

  it("queues reroute while blocked and applies on unblock", () => {
    const artist = makeArtist();
    const follower = new PathFollower(40);

    follower.assignPath(artist, makePath("p1", [
      { x: 0, y: 0 },
      { x: 100, y: 0 }
    ]));
    follower.update([artist], 1);
    expect(artist.position.x).toBeCloseTo(40, 4);

    follower.blockArtist(artist.id, "chat");
    const queued = follower.assignPath(artist, makePath("p2", [
      { x: 40, y: 0 },
      { x: 40, y: 100 }
    ]));
    expect(queued).toBe("queued");

    follower.update([artist], 1);
    expect(artist.position.x).toBeCloseTo(40, 4);
    expect(artist.position.y).toBeCloseTo(0, 4);

    follower.unblockArtist(artist, "chat");
    follower.update([artist], 0.5);
    expect(artist.position.y).toBeGreaterThan(0);
  });
});
