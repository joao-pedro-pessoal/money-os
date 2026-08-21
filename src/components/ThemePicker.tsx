"use client";

import { ACCENTS, useTheme } from "./ThemeContext";

export default function ThemePicker() {
  const { accent, mode, setAccent, setMode } = useTheme();

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
