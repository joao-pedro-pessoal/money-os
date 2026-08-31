"use client";

import { ACCENTS, useTheme } from "./ThemeContext";

export default function ThemePicker() {
  const { accent, mode, signal, setAccent, setMode, setSignal } = useTheme();

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs text-[var(--muted)] mb-2">Accent</div>
        <div className="grid grid-cols-3 gap-3">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              onClick={() => setAccent(a.id)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm border"
              style={{
                // The mono swatch is white, which would vanish as a border on
                // the light theme; the accent variable is always readable.
                borderColor:
                  accent === a.id ? (a.id === "mono" ? "var(--accent)" : a.swatch) : "var(--border)",
                borderWidth: accent === a.id ? 2 : 1,
                background: "var(--surface-2)",
              }}
            >
              {/* A white dot is invisible on a light surface, so the mono
                  swatch gets a half-and-half circle — which also says what the
                  theme actually is better than either colour alone. */}
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 999,
                  background:
                    a.id === "mono"
                      ? "linear-gradient(90deg, #ffffff 50%, #0a0a0a 50%)"
                      : a.swatch,
                  border: a.id === "mono" ? "1px solid var(--border-strong, #888)" : undefined,
                }}
              />
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* Only where it does something. On gold, emerald and indigo the signals
          are already in colour and there is nothing for this to restore, so
          offering it there would be a switch that changes nothing. */}
      {accent === "mono" && (
        <div>
          <div className="text-xs text-[var(--muted)] mb-2">Colour that means something</div>
          <div className="flex gap-3">
            <button
              onClick={() => setSignal("mono")}
              className="flex-1 rounded-lg px-3 py-2 text-sm border text-left"
              style={{
                borderColor: signal === "mono" ? "var(--accent)" : "var(--border)",
                borderWidth: signal === "mono" ? 2 : 1,
                background: "var(--surface-2)",
              }}
            >
              None
              <span className="block text-[10px] text-[var(--muted)] mt-0.5">
                A gain is brighter, a loss dimmer. Survives printing.
              </span>
            </button>
            <button
              onClick={() => setSignal("colour")}
              className="flex-1 rounded-lg px-3 py-2 text-sm border text-left"
              style={{
                borderColor: signal === "colour" ? "var(--accent)" : "var(--border)",
                borderWidth: signal === "colour" ? 2 : 1,
                background: "var(--surface-2)",
              }}
            >
              <span className="inline-flex items-center gap-1.5">
                Green, red and assets
                <span
                  aria-hidden
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: mode === "light" ? "#047857" : "#34d399",
                  }}
                />
                <span
                  aria-hidden
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: mode === "light" ? "#b91c1c" : "#f87171",
                  }}
                />
              </span>
              <span className="block text-[10px] text-[var(--muted)] mt-0.5">
                The page stays black and white; only the parts that mean something get hue.
              </span>
            </button>
          </div>
        </div>
      )}

      <div>
        <div className="text-xs text-[var(--muted)] mb-2">Mode</div>
        <div className="flex gap-3">
          <button
            onClick={() => setMode("dark")}
            className="flex-1 rounded-lg px-3 py-2 text-sm border"
            style={{
              borderColor: mode === "dark" ? "var(--accent)" : "var(--border)",
              borderWidth: mode === "dark" ? 2 : 1,
              background: "var(--surface-2)",
            }}
          >
            Dark
          </button>
          <button
            onClick={() => setMode("light")}
            className="flex-1 rounded-lg px-3 py-2 text-sm border"
            style={{
              borderColor: mode === "light" ? "var(--accent)" : "var(--border)",
              borderWidth: mode === "light" ? 2 : 1,
              background: "var(--surface-2)",
            }}
          >
            Light
          </button>
        </div>
      </div>
    </div>
  );
}
