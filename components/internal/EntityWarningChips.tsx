export default function EntityWarningChips({ items }: { items: string[] }) {
  if (!items.length) {
    return <span className="text-[10px] text-muted-2">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1 max-w-[200px]">
      {items.map((t) => (
        <span
          key={t}
          className="text-[10px] px-1.5 py-0.5 rounded bg-[color:var(--badge-yellow-bg)] text-[color:var(--badge-yellow-fg)] border border-[color:var(--badge-yellow-border)]"
        >
          {t}
        </span>
      ))}
    </div>
  );
}
