interface BadgeProps {
  label: string;
  variant?: "default" | "green" | "yellow" | "red" | "blue" | "purple";
  pill?: boolean;
}

const variantMap: Record<string, string> = {
  default:
    "bg-[color:var(--badge-default-bg)] text-[color:var(--badge-default-fg)] border border-[color:var(--badge-default-border)]",
  green:
    "bg-[color:var(--badge-green-bg)] text-[color:var(--badge-green-fg)] border border-[color:var(--badge-green-border)]",
  yellow:
    "bg-[color:var(--badge-yellow-bg)] text-[color:var(--badge-yellow-fg)] border border-[color:var(--badge-yellow-border)]",
  red:
    "bg-[color:var(--badge-red-bg)] text-[color:var(--badge-red-fg)] border border-[color:var(--badge-red-border)]",
  blue:
    "bg-[color:var(--badge-blue-bg)] text-[color:var(--badge-blue-fg)] border border-[color:var(--badge-blue-border)]",
  purple:
    "bg-[color:var(--badge-purple-bg)] text-[color:var(--badge-purple-fg)] border border-[color:var(--badge-purple-border)]",
};

export default function Badge({ label, variant = "default", pill = false }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium ${pill ? "rounded-full" : "rounded-md"} ${variantMap[variant]}`}
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
