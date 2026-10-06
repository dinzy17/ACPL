"use client";

/**
 * Plays celebration GIFs with the browser's native animator (exact frames/timing).
 * Green screen is removed server-side on upload so these assets already have transparency.
 */
export function CelebrationGif({
  src,
  alt,
  className = "",
  mood = "sold"
}: {
  src: string;
  alt: string;
  className?: string;
  mood?: "sold" | "unsold";
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      draggable={false}
      className={`tiger-mascot tiger-mascot-${mood} ${className}`}
    />
  );
}
