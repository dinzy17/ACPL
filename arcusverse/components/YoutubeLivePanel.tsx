"use client";

import { useEffect, useState } from "react";
import { youtubeEmbedSrc } from "@/lib/youtube.mjs";
import { Button, Card } from "@/components/ui";

const storageKey = (auctionId: string) => `arcus-yt-hidden:${auctionId}`;

/**
 * YouTube Live panel for the hammer desk (owners, spectators, auctioneer, admin).
 * Hide/show preference is local to this browser only — does not change auction config.
 */
export function YoutubeLivePanel({
  auctionId,
  url
}: {
  auctionId?: string;
  url?: string | null;
}) {
  const embed = youtubeEmbedSrc(url);
  const [hidden, setHidden] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!auctionId || typeof window === "undefined") {
      setReady(true);
      return;
    }
    try {
      setHidden(localStorage.getItem(storageKey(auctionId)) === "1");
    } catch {
      setHidden(false);
    }
    setReady(true);
  }, [auctionId]);

  if (!embed || !ready) return null;

  const toggle = () => {
    setHidden((prev) => {
      const next = !prev;
      if (auctionId) {
        try {
          localStorage.setItem(storageKey(auctionId), next ? "1" : "0");
        } catch {
          /* ignore */
        }
      }
      return next;
    });
  };

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
            YouTube Live
          </p>
          <p className="text-sm font-semibold">{hidden ? "Video hidden" : "Live stream"}</p>
        </div>
        <Button type="button" onClick={toggle}>
          {hidden ? "Show video" : "Hide video"}
        </Button>
      </div>
      {!hidden ? (
        <div className="relative aspect-video w-full bg-black">
          <iframe
            title="YouTube Live"
            src={embed}
            className="absolute inset-0 h-full w-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      ) : null}
    </Card>
  );
}
