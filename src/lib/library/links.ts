/**
 * Leaving the app safely.
 *
 * Every link here points somewhere we don't control, and two of the risks are
 * worth naming because they're invisible until they bite:
 *
 *  - `target="_blank"` without `rel="noopener"` hands the opened page a
 *    reference to yours via `window.opener`, which it can use to navigate you
 *    somewhere else. `noreferrer` additionally stops your URL leaking as the
 *    referrer, and your URLs are pages about your own money.
 *  - An affiliate link is a paid placement. Search engines expect it declared,
 *    and declaring it is also the honest thing to do on a page that otherwise
 *    looks like a neutral recommendation.
 */

/** For any ordinary external link. */
export const EXTERNAL_REL = "noopener noreferrer";

/** For a link you earn from. `sponsored` says what it is; `nofollow` is belt and braces. */
export const AFFILIATE_REL = "sponsored nofollow noopener noreferrer";

export function relFor(kind: "external" | "affiliate"): string {
  return kind === "affiliate" ? AFFILIATE_REL : EXTERNAL_REL;
}

/**
 * Schemes we'll render as a link.
 *
 * A stored URL is user input. `javascript:` in an href runs on click, and
 * `data:` can carry a whole page — neither belongs behind a "watch on YouTube"
 * button.
 */
const SAFE_SCHEMES = ["http:", "https:"];

export function isSafeUrl(raw: string | null | undefined): boolean {
  if (!raw) return false;
  try {
    return SAFE_SCHEMES.includes(new URL(raw.trim()).protocol);
  } catch {
    return false;
  }
}

/** The URL to render, or null when it isn't safe to render one at all. */
export function safeUrl(raw: string | null | undefined): string | null {
  return isSafeUrl(raw) ? raw!.trim() : null;
}

/** Hostname without `www.`, for showing where a link goes before it's clicked. */
export function displayHost(raw: string | null | undefined): string | null {
  const url = safeUrl(raw);
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

const YOUTUBE_HOSTS = ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"];

/** The video id in a YouTube URL, in any of the shapes YouTube uses. */
export function youtubeVideoId(raw: string | null | undefined): string | null {
  const url = safeUrl(raw);
  if (!url) return null;

  try {
    const parsed = new URL(url);
    if (!YOUTUBE_HOSTS.includes(parsed.hostname)) return null;

    if (parsed.hostname === "youtu.be") {
      const id = parsed.pathname.slice(1);
      return /^[\w-]{11}$/.test(id) ? id : null;
    }

    const v = parsed.searchParams.get("v");
    if (v && /^[\w-]{11}$/.test(v)) return v;

    // /embed/ID and /v/ID
    const match = parsed.pathname.match(/^\/(?:embed|v)\/([\w-]{11})/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * An embed URL on YouTube's privacy-enhanced domain.
 *
 * `youtube-nocookie.com` doesn't set tracking cookies until you press play,
 * and `autoplay=0` means opening a page never starts making noise at you.
 * Returns null for anything that isn't a YouTube video, so a podcast link
 * can't accidentally be embedded as one.
 */
export function youtubeEmbedUrl(raw: string | null | undefined): string | null {
  const id = youtubeVideoId(raw);
  if (!id) return null;
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=0&rel=0`;
}

/**
 * Where a resource actually lives: a video platform, or an ordinary web page.
 *
 * A Yale course and a Stanford playlist are both "courses", but you consume
 * them differently — one is a site with syllabus, notes and transcripts, the
 * other is a queue of videos. Worth saying on the card before you click.
 */
export type SourceKind = "YOUTUBE" | "WEBSITE";

export function sourceKind(raw: string | null | undefined): SourceKind | null {
  const url = safeUrl(raw);
  if (!url) return null;
  try {
    return YOUTUBE_HOSTS.includes(new URL(url).hostname) ? "YOUTUBE" : "WEBSITE";
  } catch {
    return null;
  }
}

/** "YouTube", or the host it's on — never a bare "Website" that says nothing. */
export function sourceLabel(raw: string | null | undefined): string | null {
  const kind = sourceKind(raw);
  if (kind === null) return null;
  return kind === "YOUTUBE" ? "YouTube" : displayHost(raw);
}

/** True for a playlist rather than a single video — those belong to COURSE. */
export function isYoutubePlaylist(raw: string | null | undefined): boolean {
  const url = safeUrl(raw);
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (!YOUTUBE_HOSTS.includes(parsed.hostname)) return false;
    return parsed.pathname === "/playlist" || parsed.searchParams.has("list");
  } catch {
    return false;
  }
}
