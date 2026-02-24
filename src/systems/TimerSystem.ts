import { Artist } from "../entities/Artist";

export interface ArtistMissEvent {
  artistId: string;
  reason: "timeout";
}

export class TimerSystem {
  update(artists: Artist[], deltaSeconds: number): ArtistMissEvent[] {
    const events: ArtistMissEvent[] = [];

    for (const artist of artists) {
      const didTimeout = artist.tickTimer(deltaSeconds);
      if (didTimeout) {
        events.push({
          artistId: artist.id,
          reason: "timeout"
        });
      }
    }

    return events;
  }
}
