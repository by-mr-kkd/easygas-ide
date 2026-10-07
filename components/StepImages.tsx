import { ChevronDownIcon } from "@heroicons/react/24/outline";

/** A vertical walkthrough: screenshots stacked top→bottom, each separated by a downward "V" mark. */
export function StepImages({ images }: { images: { src: string; alt: string }[] }) {
  return (
    <div className="mt-3 flex flex-col items-center gap-2">
      {images.map((img, i) => (
        <div key={img.src} className="flex w-full flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={img.src}
            alt={img.alt}
            loading="lazy"
            className="w-full rounded-xl border border-line"
          />
          {i < images.length - 1 && (
            <ChevronDownIcon className="h-5 w-5 shrink-0 text-faint" aria-hidden />
          )}
        </div>
      ))}
    </div>
  );
}
