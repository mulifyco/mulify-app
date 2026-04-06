interface BadgeProps {
  label: string;
  variant?: "default" | "green" | "yellow" | "red" | "blue" | "purple";
}

const variantMap: Record<string, string> = {
  default: "bg-gray-800 text-gray-300",
  green: "bg-emerald-900/50 text-emerald-400 border border-emerald-800",
  yellow: "bg-yellow-900/50 text-yellow-400 border border-yellow-800",
  red: "bg-red-900/50 text-red-400 border border-red-800",
  blue: "bg-indigo-900/50 text-indigo-400 border border-indigo-800",
  purple: "bg-purple-900/50 text-purple-400 border border-purple-800",
};

export default function Badge({ label, variant = "default" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${variantMap[variant]}`}
    >
      {label}
    </span>
  );
}

export function statusBadge(status: string): React.ReactElement {
  const map: Record<string, { variant: BadgeProps["variant"]; label: string }> = {
    ACTIVE: { variant: "green", label: "Active" },
    PAUSED: { variant: "yellow", label: "Paused" },
    ERROR: { variant: "red", label: "Error" },
    PENDING: { variant: "default", label: "Pending" },
    RUNNING: { variant: "blue", label: "Running" },
    COMPLETED: { variant: "green", label: "Completed" },
    FAILED: { variant: "red", label: "Failed" },
    PARTIAL: { variant: "yellow", label: "Partial" },
    HIGH: { variant: "green", label: "High" },
    MEDIUM: { variant: "yellow", label: "Medium" },
    LOW: { variant: "red", label: "Low" },
    NORMALIZED: { variant: "green", label: "Normalized" },
    RAW: { variant: "default", label: "Raw" },
    PROCESSING: { variant: "blue", label: "Processing" },
    SKIPPED: { variant: "yellow", label: "Skipped" },
  };

  const cfg = map[status] ?? { variant: "default" as const, label: status };
  return <Badge label={cfg.label} variant={cfg.variant} />;
}
