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
                borderColor: accent === a.id ? a.swatch : "var(--border)",
                borderWidth: accent === a.id ? 2 : 1,
                background: "var(--surface-2)",
              }}
            >
              <span style={{ width: 12, height: 12, borderRadius: 999, background: a.swatch }} />
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
