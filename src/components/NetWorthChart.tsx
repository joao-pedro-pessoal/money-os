"use client";

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { usePrivacy } from "./PrivacyContext";

export default function NetWorthChart({
  data,
  currency = "EUR",
}: {
  data: { date: string; netWorth: number }[];
  currency?: string;
}) {
  const { hidden } = usePrivacy();

  if (data.length < 2) {
    return (
      <div className="text-sm text-[var(--muted)] py-12 text-center">
        Not enough history yet — this fills in as your account balances change over time.
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: 260 }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="nw-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: "var(--muted)", fontSize: 11 }}
            axisLine={{ stroke: "var(--border)" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "var(--muted)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            hide={hidden}
            width={hidden ? 0 : 56}
            tickFormatter={(v) => new Intl.NumberFormat("pt-PT", { notation: "compact" }).format(v)}
          />
          {!hidden && (
            <Tooltip
              contentStyle={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
                color: "var(--foreground)",
              }}
              formatter={(value) =>
                new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format(Number(value))
              }
            />
          )}
          {/*
            Straight segments with a dot on every measurement, not a smooth
            curve. Net worth is only known on the days it was recorded, and a
            spline draws a confident arc through days that were never measured
            — it invented a peak of ~70 out of two points at 10 and one at 69.
            The dots make it obvious how much of this line is real.
          */}
          <Area
            type="linear"
            dataKey="netWorth"
            stroke="var(--accent)"
            strokeWidth={2}
            fill="url(#nw-gradient)"
            dot={{ r: 2.5, fill: "var(--accent)", strokeWidth: 0 }}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
