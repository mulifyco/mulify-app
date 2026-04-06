interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  color?: "default" | "green" | "yellow" | "red" | "blue";
}

const colorMap = {
  default: "text-white",
  green: "text-emerald-400",
  yellow: "text-yellow-400",
  red: "text-red-400",
  blue: "text-indigo-400",
};

export default function StatCard({ label, value, sub, color = "default" }: StatCardProps) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">{label}</div>
      <div className={`text-2xl font-bold tabular-nums ${colorMap[color]}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      {sub && <div className="text-xs text-gray-600 mt-1">{sub}</div>}
    </div>
  );
}
