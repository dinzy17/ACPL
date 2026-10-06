"use client";

import { useEffect, useRef, useState } from "react";
import { parseGIF, decompressFrames } from "gifuct-js";

function chromaKeyFrame(imageData: ImageData) {
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const maxRB = Math.max(r, b);
    const greenness = g - maxRB;
    // Green screen used in the tiger celebration GIFs
    if (g > 70 && greenness > 16 && g > r * 1.08 && g > b * 1.08) {
      d[i + 3] = greenness > 40 ? 0 : Math.max(0, Math.round(255 * (1 - (greenness - 16) / 24)));
    } else if (g > 95 && g > r + 35 && g > b + 35) {
      d[i + 3] = 0;
    }
  }
  return imageData;
}

/**
 * Plays an animated GIF exactly (original frame timing), with green-screen removed.
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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let frameIndex = 0;
    let frames: any[] = [];
    let tempCanvas: HTMLCanvasElement | null = null;
    let tempCtx: CanvasRenderingContext2D | null = null;
    let fullCanvas: HTMLCanvasElement | null = null;
    let fullCtx: CanvasRenderingContext2D | null = null;

    const stop = () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };

    const drawFrame = (frame: any) => {
      const canvas = canvasRef.current;
      if (!canvas || !tempCtx || !fullCtx || !tempCanvas || !fullCanvas) return;

      const dims = frame.dims;
      tempCanvas.width = dims.width;
      tempCanvas.height = dims.height;
      const imageData = tempCtx.createImageData(dims.width, dims.height);
      imageData.data.set(frame.patch);
      chromaKeyFrame(imageData);
      tempCtx.putImageData(imageData, 0, 0);

      if (frame.disposalType === 2) {
        fullCtx.clearRect(dims.left, dims.top, dims.width, dims.height);
      }
      fullCtx.drawImage(tempCanvas, dims.left, dims.top);

      const out = canvas.getContext("2d");
      if (!out) return;
      out.clearRect(0, 0, canvas.width, canvas.height);
      out.drawImage(fullCanvas, 0, 0);
    };

    const tick = () => {
      if (cancelled || !frames.length) return;
      if (frameIndex === 0 && fullCtx && fullCanvas) {
        fullCtx.clearRect(0, 0, fullCanvas.width, fullCanvas.height);
      }
      const frame = frames[frameIndex];
      drawFrame(frame);
      const delay = Math.max(20, frame.delay || 100);
      frameIndex = (frameIndex + 1) % frames.length;
      timer = setTimeout(tick, delay);
    };

    (async () => {
      try {
        setFailed(false);
        setReady(false);
        const res = await fetch(src, { cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to load ${src}`);
        const buf = await res.arrayBuffer();
        const bytes = new Uint8Array(buf);
        const isGif = bytes.length >= 6 && String.fromCharCode(bytes[0], bytes[1], bytes[2]) === "GIF";
        if (!isGif) {
          // Fallback: show as static/native image (webp/png) via canvas draw once
          const img = new Image();
          img.decoding = "async";
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error("image load failed"));
            img.src = src;
          });
          if (cancelled) return;
          const canvas = canvasRef.current;
          if (!canvas) return;
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) return;
          ctx.drawImage(img, 0, 0);
          const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
          chromaKeyFrame(frame);
          ctx.putImageData(frame, 0, 0);
          setReady(true);
          return;
        }

        const gif = parseGIF(buf);
        frames = decompressFrames(gif, true);
        if (!frames.length) throw new Error("GIF has no frames");
        if (cancelled) return;

        const w = gif.lsd.width;
        const h = gif.lsd.height;
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = w;
        canvas.height = h;

        tempCanvas = document.createElement("canvas");
        tempCtx = tempCanvas.getContext("2d", { willReadFrequently: true });
        fullCanvas = document.createElement("canvas");
        fullCanvas.width = w;
        fullCanvas.height = h;
        fullCtx = fullCanvas.getContext("2d", { willReadFrequently: true });
        if (!tempCtx || !fullCtx) throw new Error("canvas unsupported");

        setReady(true);
        tick();
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return stop;
  }, [src]);

  if (failed) {
    // Native <img> last resort (may show green) — still better than blank
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={alt} draggable={false} className={`tiger-mascot tiger-mascot-${mood} ${className}`} />
    );
  }

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={alt}
      className={`tiger-mascot tiger-mascot-${mood} ${ready ? "opacity-100" : "opacity-0"} ${className}`}
    />
  );
}
