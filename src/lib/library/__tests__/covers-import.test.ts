import { describe, it, expect } from "vitest";
import {
  parseCsvLine,
  parseCoverCsv,
  planCoverImport,
  normaliseTitle,
  describeSkip,
  coverSearchUrl,
} from "../covers-import";
import { SEED_BOOKS } from "../seed";

const library = SEED_BOOKS.map((b) => ({ slug: b.slug, title: b.title }));

const csv = (body: string) => `"slug","title","cover_url"\n${body}`;

describe("reading the sheet", () => {
  it("handles quotes, commas and doubled quotes", () => {
    expect(parseCsvLine('"a","b,c","say ""hi"""')).toEqual(["a", "b,c", 'say "hi"']);
  });

  it("accepts unquoted cells", () => {
    expect(parseCsvLine("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("finds the columns whatever the capitalisation", () => {
    const rows = parseCoverCsv('Cover_Key,Title,COVER URL\nmeditations,Meditations,https://x.test/a.jpg');
    expect(rows[0].key).toBe("meditations");
    expect(rows[0].url).toBe("https://x.test/a.jpg");
  });

  it("refuses a sheet with no URL column", () => {
    // Importing nothing looks exactly like success, so this has to be loud.
    expect(() => parseCoverCsv("slug,title\na,b")).toThrow(/cover URL column/i);
  });

  it("refuses a sheet with nothing to identify the book by", () => {
    expect(() => parseCoverCsv("cover_url\nhttps://x.test/a.jpg")).toThrow(/identify the book/i);
  });

  it("numbers lines from the file, header included", () => {
    const rows = parseCoverCsv(csv('"meditations","Meditations","https://x.test/a.jpg"'));
    expect(rows[0].line).toBe(2);
  });

  it("survives an empty file", () => {
    expect(parseCoverCsv("")).toEqual([]);
  });
});

describe("planning the import", () => {
  it("assigns a cover matched by slug", () => {
    const rows = parseCoverCsv(csv('"meditations","","https://x.test/a.jpg"'));
    const plan = planCoverImport(rows, library);
    expect(plan.assign).toEqual([{ slug: "meditations", url: "https://x.test/a.jpg" }]);
  });

  it("matches by title when the slug doesn't line up", () => {
    // The hand-off called it "1984"; this codebase calls it nineteen-eighty-four.
    const rows = parseCoverCsv(csv('"1984","1984","https://x.test/b.jpg"'));
    const plan = planCoverImport(rows, library);
    expect(plan.assign[0].slug).toBe("nineteen-eighty-four");
  });

  it("matches a title with different punctuation or accents", () => {
    const rows = parseCoverCsv(csv('"","Man’s Search for Meaning","https://x.test/c.jpg"'));
    expect(planCoverImport(rows, library).assign[0].slug).toBe("mans-search-for-meaning");
  });

  it("skips an empty URL instead of clearing the cover", () => {
    // This is the normal state of a half-filled sheet, not a failure.
    const rows = parseCoverCsv(csv('"meditations","Meditations",""'));
    const plan = planCoverImport(rows, library);
    expect(plan.assign).toEqual([]);
    expect(plan.skipped[0].reason).toBe("no-url");
  });

  it("reports a book it can't find rather than guessing", () => {
    const rows = parseCoverCsv(csv('"","Some Book I Invented","https://x.test/d.jpg"'));
    const plan = planCoverImport(rows, library);
    expect(plan.assign).toEqual([]);
    expect(plan.skipped[0].reason).toBe("unknown-book");
  });

  it("refuses a javascript: URL", () => {
    const rows = parseCoverCsv(csv('"meditations","","javascript:alert(1)"'));
    expect(planCoverImport(rows, library).skipped[0].reason).toBe("unsafe-url");
  });

  it("refuses a data: URL", () => {
    const rows = parseCoverCsv(csv('"meditations","","data:image/png;base64,AAA"'));
    expect(planCoverImport(rows, library).skipped[0].reason).toBe("unsafe-url");
  });

  it("accepts a local path under public/", () => {
    const rows = parseCoverCsv(csv('"meditations","","/covers/meditations.jpg"'));
    expect(planCoverImport(rows, library).assign[0].url).toBe("/covers/meditations.jpg");
  });

  it("treats a protocol-relative URL as unsafe", () => {
    const rows = parseCoverCsv(csv('"meditations","","//evil.test/a.jpg"'));
    expect(planCoverImport(rows, library).skipped[0].reason).toBe("unsafe-url");
  });

  it("lets a later row correct an earlier one", () => {
    const rows = parseCoverCsv(
      csv('"meditations","","https://x.test/old.jpg"\n"meditations","","https://x.test/new.jpg"')
    );
    const plan = planCoverImport(rows, library);
    expect(plan.assign).toHaveLength(1);
    expect(plan.assign[0].url).toBe("https://x.test/new.jpg");
    expect(plan.skipped).toHaveLength(0);
  });

  it("handles the delivered sheet: fifty rows, none assigned yet", () => {
    // Every cover_url in the hand-off is empty pending review, so a run today
    // must change nothing at all.
    const body = library.map((b) => `"${b.slug}","${b.title.replace(/"/g, '""')}",""`).join("\n");
    const plan = planCoverImport(parseCoverCsv(csv(body)), library);
    expect(plan.assign).toHaveLength(0);
    expect(plan.skipped).toHaveLength(50);
    expect(plan.skipped.every((s) => s.reason === "no-url")).toBe(true);
  });
});

describe("what it tells you", () => {
  it("explains every kind of skip in plain words", () => {
    for (const reason of ["no-url", "unknown-book", "unsafe-url"] as const) {
      const text = describeSkip({ key: "k", title: "A Book", line: 4, reason });
      expect(text).toContain("A Book");
      expect(text.length).toBeGreaterThan(20);
    }
  });

  it("falls back to the line number when a row has no name at all", () => {
    expect(describeSkip({ key: "", title: "", line: 9, reason: "no-url" })).toContain("line 9");
  });
});

describe("the cover search link", () => {
  it("points at a search page, never at an image", () => {
    const url = coverSearchUrl("Meditations", "Marcus Aurelius");
    expect(url).toBe("https://openlibrary.org/search?q=Meditations%20Marcus%20Aurelius");
    expect(url).not.toMatch(/\.(jpg|png|webp)$/i);
  });

  it("escapes whatever is in the title", () => {
    expect(coverSearchUrl("Justice: What's the Right Thing to Do?", "Sandel")).not.toMatch(/[?&]q=[^&]*\?/);
  });

  it("builds a usable link for every book", () => {
    for (const b of SEED_BOOKS) {
      expect(() => new URL(coverSearchUrl(b.title, b.creator))).not.toThrow();
    }
  });
});

describe("title matching", () => {
  it("ignores case, accents and punctuation", () => {
    expect(normaliseTitle("Man’s Search for Meaning")).toBe(normaliseTitle("mans search for meaning"));
    expect(normaliseTitle("Niccolò")).toBe("niccolo");
  });

  it("gives every book a distinct key", () => {
    const keys = SEED_BOOKS.map((b) => normaliseTitle(b.title));
    expect(new Set(keys).size).toBe(keys.length);
  });
});
