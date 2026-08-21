"use client";

import { useState } from "react";
import {
  RESOURCE_TYPES,
  LEVELS,
  PROGRESS_UNITS,
  defaultUnitFor,
  requiresUrl,
  isRelevant,
  type ResourceType,
} from "@/lib/library/types";

interface Category {
  id: string;
  name: string;
  subtags: { id: string; name: string }[];
}

/**
 * One form that changes shape with the type.
 *
 * A podcast is never asked for an ISBN and a book is never asked for a
 * channel. The alternative — every field always visible — is how a form starts
 * feeling like a database table someone forgot to design.
 */
export default function ResourceForm({
  categories,
  action,
}: {
  categories: Category[];
  action: (formData: FormData) => void;
}) {
  const [type, setType] = useState<ResourceType>("BOOK");
  const [unit, setUnit] = useState(defaultUnitFor("BOOK"));
  const [chosenCategories, setChosenCategories] = useState<string[]>([]);

  function pickType(next: ResourceType) {
    setType(next);
    setUnit(defaultUnitFor(next));
  }

  const toggleCategory = (id: string) =>
    setChosenCategories((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const shows = (field: string) => isRelevant(type, field);

  return (
    <form action={action} className="space-y-4 max-w-2xl">
      <div className="flex gap-1 flex-wrap">
        {RESOURCE_TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => pickType(t.value)}
            className="badge border text-xs"
            style={{
              borderColor: type === t.value ? "var(--accent)" : "var(--border)",
              color: type === t.value ? "var(--accent)" : "var(--muted)",
            }}
          >
            {t.singular}
          </button>
        ))}
      </div>
      <input type="hidden" name="type" value={type} />
      <p className="text-xs text-[var(--muted)]">
        {RESOURCE_TYPES.find((t) => t.value === type)!.help}
      </p>

      <input name="title" placeholder="Title" className="input" required />
      <input
        name="creator"
        placeholder="Author, channel, host, professor or institution"
        className="input"
        required
      />
      <textarea name="description" placeholder="What it is" rows={3} className="input" />

      <div>
        <input
          name="externalUrl"
          type="url"
          placeholder={requiresUrl(type) ? "Official link (required)" : "Official link (optional)"}
          className="input"
          required={requiresUrl(type)}
        />
        {requiresUrl(type) && (
          <p className="text-[10px] text-[var(--muted)] mt-1">
            The app stores metadata and progress, never the media — so a {type.toLowerCase()} needs
            somewhere to point.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <select name="level" className="input" defaultValue="BEGINNER">
          {LEVELS.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
        <input name="language" placeholder="Language (optional)" className="input" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <select
          name="progressUnit"
          value={unit}
          onChange={(e) => setUnit(e.target.value as typeof unit)}
          className="input"
        >
          {PROGRESS_UNITS.map((u) => (
            <option key={u.value} value={u.value}>
              Track in {u.label}
            </option>
          ))}
        </select>
        <input
          name="totalUnits"
          type="number"
          step="0.01"
          min="0"
          placeholder="Total (pages, minutes, lessons)"
          className="input"
        />
      </div>

      {/* Type-specific fields. Nothing irrelevant is even rendered, so nothing
          irrelevant can be submitted. */}
      {shows("isbn13") && (
        <div className="grid grid-cols-2 gap-2">
          <input name="isbn13" placeholder="ISBN-13 (optional)" className="input" />
          <input
            name="pageCount"
            type="number"
            min="0"
            placeholder="Pages (optional)"
            className="input"
          />
          <input name="coverUrl" type="url" placeholder="Cover image URL" className="input" />
          <input name="translator" placeholder="Translator (optional)" className="input" />
          {/* Your copy. Two editions of the same work differ in translation,
              publisher and page count without being different books. */}
          <input name="translation" placeholder="Translation (optional)" className="input" />
          <input name="edition" placeholder="Edition (optional)" className="input" />
          <input name="publisher" placeholder="Publisher (optional)" className="input" />
          <div className="col-span-2">
            <input
              name="affiliateUrl"
              type="url"
              placeholder="Affiliate link (optional)"
              className="input"
            />
            <p className="text-[10px] text-[var(--muted)] mt-1">
              Rendered with <span className="font-mono">sponsored nofollow</span>, so it declares
              itself as a paid link.
            </p>
          </div>
        </div>
      )}

      {(shows("platform") || shows("durationMinutes")) && (
        <div className="grid grid-cols-2 gap-2">
          {shows("platform") && (
            <input name="platform" placeholder="Platform (YouTube, Spotify…)" className="input" />
          )}
          {shows("durationMinutes") && (
            <input
              name="durationMinutes"
              type="number"
              min="0"
              placeholder="Duration in minutes"
              className="input"
            />
          )}
          {shows("channelName") && <input name="channelName" placeholder="Channel" className="input" />}
          {shows("hostName") && <input name="hostName" placeholder="Host" className="input" />}
          {shows("guestName") && <input name="guestName" placeholder="Guest" className="input" />}
        </div>
      )}

      {shows("institution") && (
        <div className="grid grid-cols-2 gap-2">
          <input name="institution" placeholder="University or institution" className="input" />
          <input name="instructor" placeholder="Instructor" className="input" />
          <input
            name="lessonCount"
            type="number"
            min="0"
            placeholder="Lessons (optional)"
            className="input"
          />
          <input
            name="estimatedHours"
            type="number"
            step="0.5"
            min="0"
            placeholder="Estimated hours"
            className="input"
          />
        </div>
      )}

      <div>
        <div className="text-xs text-[var(--muted)] mb-2">
          Categories — the same set for every type
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-1">
          {categories.map((c) => (
            <label key={c.id} className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                name="categoryIds"
                value={c.id}
                checked={chosenCategories.includes(c.id)}
                onChange={() => toggleCategory(c.id)}
              />
              <span className="truncate">{c.name}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Subtags appear only for chosen categories: a subtag belongs to one,
          and the detail page groups them that way. */}
      {chosenCategories.length > 0 && (
        <div className="space-y-2">
          {categories
            .filter((c) => chosenCategories.includes(c.id))
            .map((c) => (
              <div key={c.id}>
                <div className="text-[10px] text-[var(--muted)] mb-1">{c.name}</div>
                <div className="flex gap-2 flex-wrap">
                  {c.subtags.map((s) => (
                    <label key={s.id} className="flex items-center gap-1 text-xs">
                      <input type="checkbox" name="subtagIds" value={s.id} />
                      <span>{s.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}

      <textarea
        name="whyLearn"
        rows={2}
        placeholder="Why it's worth learning from (optional)"
        className="input"
      />
      <textarea name="lessons" rows={3} placeholder="Main lessons (optional)" className="input" />

      <button type="submit" className="btn w-full">
        Add to the library
      </button>
    </form>
  );
}
