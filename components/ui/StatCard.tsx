interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  delta?: string;
  trend?: "up" | "down" | "flat";
  color?: "default" | "green" | "yellow" | "red" | "blue" | "purple";
}

const valueColorMap: Record<string, string> = {
  default: "text-foreground",
  green: "text-emerald-300",
  yellow: "text-amber-300",
  red: "text-red-300",
  blue: "text-indigo-300",
  purple: "text-purple-300",
};

const deltaToneMap: Record<string, string> = {
  default: "text-indigo-300 bg-indigo-500/10 border-indigo-500/25",
  green: "text-emerald-300 bg-emerald-500/10 border-emerald-500/25",
  yellow: "text-amber-300 bg-amber-500/10 border-amber-500/25",
  red: "text-red-300 bg-red-500/10 border-red-500/25",
  blue: "text-indigo-300 bg-indigo-500/10 border-indigo-500/25",
  purple: "text-purple-300 bg-purple-500/10 border-purple-500/25",
};

export default function StatCard({ label, value, sub, delta, trend, color = "default" }: StatCardProps) {
  const trendIcon = trend === "up" ? "▲ " : trend === "down" ? "▼ " : "";
  return (
    <div className="rounded-2xl border border-border bg-card/60 glass premium-ring p-4 group hover:border-indigo-500/20 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10px] font-semibold text-muted-2 uppercase tracking-[0.18em]">{label}</div>
        {delta ? (
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${deltaToneMap[color]}`}>
            {trendIcon}{delta}
          </span>
        ) : null}
      </div>
      <div className={`text-2xl font-bold tabular-nums mt-2 ${valueColorMap[color]}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      {sub && <div className="text-[11px] text-muted mt-1">{sub}</div>}
    </div>
  );
}
