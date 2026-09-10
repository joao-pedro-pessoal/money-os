import { describe, it, expect } from "vitest";
import {
  EXTERNAL_REL,
  AFFILIATE_REL,
  relFor,
  isSafeUrl,
  safeUrl,
  displayHost,
  youtubeVideoId,
  youtubeEmbedUrl,
  isYoutubePlaylist,
} from "../links";

describe("rel attributes", () => {
  it("protects every external link from window.opener and referrer leaks", () => {
    expect(EXTERNAL_REL).toContain("noopener");
    expect(EXTERNAL_REL).toContain("noreferrer");
  });

  it("declares an affiliate link as sponsored", () => {
    // A paid placement on a page that otherwise reads as a neutral
    // recommendation has to say so.
    expect(AFFILIATE_REL).toContain("sponsored");
    expect(AFFILIATE_REL).toContain("nofollow");
  });

  it("keeps the opener protections on affiliate links too", () => {
    expect(AFFILIATE_REL).toContain("noopener");
    expect(AFFILIATE_REL).toContain("noreferrer");
  });

  it("picks the right rel for each kind", () => {
    expect(relFor("external")).toBe(EXTERNAL_REL);
    expect(relFor("affiliate")).toBe(AFFILIATE_REL);
  });
});

describe("isSafeUrl", () => {
  it("accepts http and https", () => {
    expect(isSafeUrl("https://oyc.yale.edu/economics/econ-252")).toBe(true);
    expect(isSafeUrl("http://example.com")).toBe(true);
  });

  it("refuses javascript: — it would run on click", () => {
    expect(isSafeUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeUrl("JavaScript:alert(1)")).toBe(false);
  });

  it("refuses data: — it can carry a whole page", () => {
    expect(isSafeUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
  });

  it("refuses other schemes and junk", () => {
    expect(isSafeUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeUrl("not a url")).toBe(false);
    expect(isSafeUrl("")).toBe(false);
    expect(isSafeUrl(null)).toBe(false);
    expect(isSafeUrl(undefined)).toBe(false);
  });

  it("tolerates surrounding whitespace", () => {
    expect(isSafeUrl("  https://example.com  ")).toBe(true);
    expect(safeUrl("  https://example.com  ")).toBe("https://example.com");
  });

  it("returns null rather than an unsafe href", () => {
    expect(safeUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("displayHost", () => {
  it("shows where a link goes, without the www", () => {
    expect(displayHost("https://www.youtube.com/watch?v=abcdefghijk")).toBe("youtube.com");
    expect(displayHost("https://ocw.mit.edu/courses/18-05")).toBe("ocw.mit.edu");
  });

  it("is null for an unsafe link", () => {
    expect(displayHost("javascript:alert(1)")).toBeNull();
  });
});

describe("youtubeVideoId", () => {
  it("reads the watch form", () => {
    expect(youtubeVideoId("https://www.youtube.com/watch?v=mZI2GQlNdJA")).toBe("mZI2GQlNdJA");
  });

  it("reads the short form", () => {
    expect(youtubeVideoId("https://youtu.be/mZI2GQlNdJA")).toBe("mZI2GQlNdJA");
  });

  it("reads the embed form", () => {
    expect(youtubeVideoId("https://www.youtube.com/embed/mZI2GQlNdJA")).toBe("mZI2GQlNdJA");
  });

  it("ignores a non-YouTube host", () => {
    // A lookalike domain must not get an embed on the page.
    expect(youtubeVideoId("https://youtube.com.evil.example/watch?v=mZI2GQlNdJA")).toBeNull();
  });

  it("ignores a malformed id", () => {
    expect(youtubeVideoId("https://www.youtube.com/watch?v=tooshort")).toBeNull();
  });

  it("is null for a playlist with no video", () => {
    expect(youtubeVideoId("https://www.youtube.com/playlist?list=PL848F2368C90DDC3D")).toBeNull();
  });
});

describe("youtubeEmbedUrl", () => {
  it("uses the privacy-enhanced domain", () => {
    const url = youtubeEmbedUrl("https://www.youtube.com/watch?v=mZI2GQlNdJA")!;
    expect(url).toContain("youtube-nocookie.com");
  });

  it("never autoplays", () => {
    // Opening a page should not start making noise at you.
    expect(youtubeEmbedUrl("https://youtu.be/mZI2GQlNdJA")).toContain("autoplay=0");
  });

  it("is null for anything that isn't a YouTube video", () => {
    expect(youtubeEmbedUrl("https://open.spotify.com/episode/abc")).toBeNull();
    expect(youtubeEmbedUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("isYoutubePlaylist", () => {
  it("recognises a playlist, which belongs to COURSE", () => {
    expect(isYoutubePlaylist("https://www.youtube.com/playlist?list=PL848F2368C90DDC3D")).toBe(true);
    expect(isYoutubePlaylist("https://www.youtube.com/watch?v=mZI2GQlNdJA&list=PL848")).toBe(true);
  });

  it("is false for a plain video", () => {
    expect(isYoutubePlaylist("https://www.youtube.com/watch?v=mZI2GQlNdJA")).toBe(false);
  });

  it("is false for anywhere else", () => {
    expect(isYoutubePlaylist("https://oyc.yale.edu/economics/econ-252")).toBe(false);
  });
});
