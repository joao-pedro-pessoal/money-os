"use client";

import { useState } from "react";
import { generateSeed, isValidSeed } from "@/lib/vault/seed";

/**
 * The step after Google: the twelve words.
 *
 * Google said who you are; nothing yet can open the vault. A brand new account
 * is given its words here, once, with nowhere to look them up again — the
 * server never has them. An account that already exists asks for them instead.
 */
export default function VaultSeedPrompt({
  isNew,
  onReady,
  onCancel,
}: {
  isNew: boolean;
  onReady: (seed: string) => void;
  onCancel: () => void;
}) {
  const [words, setWords] = useState("");
  const [freshSeed, setFreshSeed] = useState<string | null>(null);
  const [written, setWritten] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const make = async () => {
    setFreshSeed(await generateSeed((n) => crypto.getRandomValues(new Uint8Array(n))));
    setError(null);
  };

  return (
    <div className="card p-5 space-y-4 max-w-xl">
      <div className="text-sm font-medium">
        {isNew ? "Your new vault needs twelve words" : "Your twelve words open the vault"}
      </div>

      {isNew ? (
        <>
          <p className="text-xs text-[var(--muted)]">
            Google signed you in, but it cannot read your money records and neither can this server. These words are
            what does. They exist nowhere else — not here, not at Google — so write them on paper before going on.
          </p>
          {freshSeed ? (
            <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: "var(--amber)" }}>
              <p className="font-mono text-sm break-words">{freshSeed}</p>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={written} onChange={(e) => setWritten(e.target.checked)} />I have
                written them down
              </label>
            </div>
          ) : (
            <button type="button" className="btn" onClick={() => void make()}>
              Show my twelve words
            </button>
          )}
        </>
      ) : (
        <>
          <p className="text-xs text-[var(--muted)]">
            They stay in this browser tab and are never sent. Without them this vault cannot be opened, here or by
            anyone else.
          </p>
          <textarea
            className="input w-full"
            rows={2}
            autoComplete="off"
            spellCheck={false}
            value={words}
            onChange={(e) => setWords(e.target.value)}
            placeholder="word word word …"
          />
        </>
      )}

      {error && (
        <p role="alert" className="text-xs text-[var(--red)]">
          {error}
        </p>
      )}

      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          className="btn"
          onClick={() => {
            if (isNew) {
              if (!freshSeed) return setError("Show the words first, and write them down.");
              if (!written) return setError("Write them down first. Nobody can give them back to you.");
              return onReady(freshSeed);
            }
            if (!isValidSeed(words)) return setError("Those are not the twelve words of a recovery seed.");
            onReady(words.trim());
          }}
        >
          {isNew ? "Open my new vault" : "Open my vault"}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
