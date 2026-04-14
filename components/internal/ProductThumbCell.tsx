interface ProductThumbCellProps {
  src: string | null;
  title: string;
}

export default function ProductThumbCell({ src, title }: ProductThumbCellProps) {
  if (!src) {
    return (
      <div className="w-10 h-10 rounded border border-border bg-surface-2 flex items-center justify-center text-[9px] text-muted-2 text-center leading-tight px-0.5">
        ∅
      </div>
    );
  }
  return (
    <div className="w-10 h-10 rounded border border-border overflow-hidden bg-surface shrink-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={title} className="w-full h-full object-cover" loading="lazy" />
    </div>
  );
}
