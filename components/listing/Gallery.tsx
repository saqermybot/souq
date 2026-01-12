"use client";
import { useMemo, useState } from "react";

export default function Gallery({ images, title }: { images: { url: string }[]; title: string }) {
  const safe = useMemo(() => images ?? [], [images]);
  const [i, setI] = useState(0);
  const current = safe[i]?.url;

  return (
    <div className="relative rounded-lg overflow-hidden bg-gray-100">
      <div className="aspect-[4/3]">
        {current ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current} alt={title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">No image</div>
        )}
      </div>

      {safe.length > 0 && (
        <div className="absolute left-3 bottom-3 bg-black/60 text-white text-xs px-2 py-1 rounded">
          {i + 1} / {safe.length}
        </div>
      )}

      {safe.length > 1 && (
        <div className="absolute inset-0 grid grid-cols-2">
          <button className="h-full" aria-label="Prev" onClick={() => setI((p) => (p - 1 + safe.length) % safe.length)} />
          <button className="h-full" aria-label="Next" onClick={() => setI((p) => (p + 1) % safe.length)} />
        </div>
      )}
    </div>
  );
}
