export default function EntityWarningChips({ items }: { items: string[] }) {
  if (!items.length) {
    return <span className="text-[10px] text-gray-600">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1 max-w-[200px]">
      {items.map((t) => (
        <span
          key={t}
          className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-400/95 border border-amber-900/50"
        >
          {t}
        </span>
      ))}
    </div>
  );
}
