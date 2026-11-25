type Window = { seconds: number; max: number };
export type WorkPolicy = { user: Window[]; connection: Window[]; simultaneous: number; global: number };
export const WORK_LIMITS = {
  pdf: { user: [{ seconds: 60, max: 3 }, { seconds: 3600, max: 20 }], connection: [{ seconds: 60, max: 15 }, { seconds: 3600, max: 100 }], simultaneous: 1, global: 2 },
  widget: { user: [{ seconds: 60, max: 12 }, { seconds: 3600, max: 240 }], connection: [{ seconds: 60, max: 60 }, { seconds: 3600, max: 1200 }], simultaneous: 12, global: 32 },
  alerts: { user: [{ seconds: 60, max: 12 }, { seconds: 3600, max: 240 }], connection: [{ seconds: 60, max: 60 }, { seconds: 3600, max: 1200 }], simultaneous: 12, global: 32 },
  "widget-work": { user: [], connection: [], simultaneous: 1, global: 4 },
  "alerts-work": { user: [], connection: [], simultaneous: 1, global: 4 },
  "csv-preview": { user: [{ seconds: 60, max: 5 }], connection: [{ seconds: 60, max: 20 }], simultaneous: 1, global: 4 },
  "csv-import": { user: [{ seconds: 60, max: 2 }, { seconds: 3600, max: 20 }], connection: [{ seconds: 60, max: 20 }, { seconds: 3600, max: 100 }], simultaneous: 1, global: 4 },
  "backup-inspect": { user: [{ seconds: 60, max: 3 }], connection: [{ seconds: 60, max: 10 }], simultaneous: 1, global: 4 },
  "backup-restore": { user: [{ seconds: 300, max: 1 }, { seconds: 86400, max: 3 }], connection: [{ seconds: 3600, max: 10 }], simultaneous: 1, global: 2 },
  export: { user: [{ seconds: 60, max: 2 }, { seconds: 3600, max: 10 }], connection: [{ seconds: 60, max: 10 }, { seconds: 3600, max: 50 }], simultaneous: 1, global: 4 },
} satisfies Record<string, WorkPolicy>;
export type WorkKind = keyof typeof WORK_LIMITS;
export type Lease = { token: string; until: number };

export function nextAdmission(history: number[], leases: Lease[], windows: readonly Window[], capacity: number, now: number) {
  const kept = history.filter(time => Number.isFinite(time) && time > now - 86400_000);
  const active = leases.filter(lease => lease.until > now);
  let retryAfter = 0;
  for (const window of windows) {
    const relevant = kept.filter(time => time > now - window.seconds * 1000).sort((a, b) => a - b);
    if (relevant.length >= window.max) retryAfter = Math.max(retryAfter, Math.ceil((relevant[relevant.length - window.max] + window.seconds * 1000 - now) / 1000));
  }
  if (active.length >= capacity) retryAfter = Math.max(retryAfter, Math.ceil((Math.min(...active.map(l => l.until)) - now) / 1000));
  return { history: kept, leases: active, retryAfter };
}
