export default function QueryErrorState({
  title = "Could not load data",
  message,
}: {
  title?: string;
  message: string;
}) {
  return (
    <div className="rounded-lg border border-red-900/50 bg-red-950/20 px-4 py-6 text-sm">
      <div className="text-red-400 font-semibold mb-1">{title}</div>
      <p className="text-red-200/80 text-xs leading-relaxed">{message}</p>
    </div>
  );
}
