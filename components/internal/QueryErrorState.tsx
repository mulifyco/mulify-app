import React from "react";

export default function QueryErrorState({
  title = "Could not load data",
  message,
  action,
}: {
  title?: string;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-red-500/30 bg-red-500/8 px-4 py-6 text-sm">
      <div className="text-red-500 font-semibold mb-1">{title}</div>
      <p className="text-muted text-xs leading-relaxed">{message}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
