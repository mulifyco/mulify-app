interface ProductThumbCellProps {
  src: string | null;
  title: string;
}

export default function ProductThumbCell({ src, title }: ProductThumbCellProps) {
  if (!src) {
    return (
      <div className="w-10 h-10 rounded border border-gray-800 bg-gray-900/80 flex items-center justify-center text-[9px] text-gray-600 text-center leading-tight px-0.5">
        ∅
      </div>
    );
  }
  return (
    <div className="w-10 h-10 rounded border border-gray-800 overflow-hidden bg-gray-950 shrink-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={title} className="w-full h-full object-cover" loading="lazy" />
    </div>
  );
}
