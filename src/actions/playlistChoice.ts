/**
 * The playlists a form chose, checked against the ones that exist.
 *
 * Not a "use server" module: this is a helper for the actions that save a
 * position, a synced position's tags or a watchlist item, and exporting it from
 * one of those would make it an endpoint of its own.
 *
 * Several playlists are ticked boxes, and an unticked box sends nothing — so
 * "none ticked" and "this form has no playlist field" look alike. A form that
 * shows the boxes also sends `PLAYLISTS_SENT` (`PlaylistPicker` does); without
 * it the answer is undefined, meaning leave the playlists as they are, rather
 * than an empty list that would quietly take the position out of all of them.
 */
import { db } from "@/db/client";
import { playlists } from "@/db/schema";
import { knownPlaylistIds, playlistIdsFrom } from "@/lib/portfolio/playlists";

export const PLAYLISTS_SENT = "playlistIdsSent";

export async function chosenPlaylists(formData: FormData): Promise<string[] | undefined> {
  if (formData.get(PLAYLISTS_SENT) === null) return undefined;
  const ids = playlistIdsFrom(formData.getAll("playlistIds"));
  if (ids.length === 0) return [];
  // Only this person's playlists are visible here (row security), so an id
  // from anyone else's — or one deleted since the form was drawn — drops out.
  const known = new Set((await db.select({ id: playlists.id }).from(playlists)).map((p) => p.id));
  return knownPlaylistIds(ids, known);
}
