import { statusBadge } from "@/components/ui/Badge";

interface ConfidenceInlineProps {
  score?: { level: string; overallScore: number } | null;
}

export default function ConfidenceInline({ score }: ConfidenceInlineProps) {
  if (!score) {
    return <span className="text-gray-600 text-xs tabular-nums">—</span>;
  }
  return (
    <div className="flex items-center gap-2">
      {statusBadge(score.level)}
      <span className="text-xs text-gray-500 tabular-nums">
        {(score.overallScore * 100).toFixed(0)}%
      </span>
    </div>
  );
}
