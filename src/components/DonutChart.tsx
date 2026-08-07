"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { usePrivacy } from "./PrivacyContext";

const COLORS = [
  "var(--accent)",
  "var(--green)",
  "var(--amber)",
  "var(--red)",
  "var(--muted)",
  "#8b8b8b",
];

export default function DonutChart({ data }: { data: { name: string; value: number }[] }) {
  const { hidden } = usePrivacy();

  if (data.length === 0) {
    return <div className="text-sm text-[var(--muted)] py-8 text-center">No data yet</div>;
  }

  return (
    <div style={{ width: "100%", height: 220 }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={55}
            outerRadius={85}
            paddingAngle={2}
            stroke="var(--surface)"
            strokeWidth={2}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          {!hidden && (
            <Tooltip
              contentStyle={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
                color: "var(--foreground)",
              }}
              formatter={(value) => new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(Number(value))}
            />
          )}
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center mt-2">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
            <span style={{ width: 8, height: 8, borderRadius: 999, background: COLORS[i % COLORS.length] }} />
            {d.name}
          </div>
        ))}
      </div>
    </div>
  );
}
