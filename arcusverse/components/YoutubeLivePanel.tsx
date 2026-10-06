"use client";

import { useEffect, useState } from "react";
import { isYoutubeUrl, youtubeEmbedSrc } from "@/lib/youtube.mjs";
import { Button, Card, Field } from "@/components/ui";

const storageKey = (auctionId: string) => `arcus-yt-hidden:${auctionId}`;

/**
 * YouTube Live panel for the hammer desk (owners, spectators, auctioneer, admin).
 * Hide/show preference is local to this browser only — does not change auction config.
 * Auctioneer/admin can set/clear the link via a dedicated event that only patches youtubeLiveUrl.
 */
export function YoutubeLivePanel({
  auctionId,
  url,
  canEdit = false,
  emit,
  onPublic
}: {
  auctionId?: string;
  url?: string | null;
  canEdit?: boolean;
  emit?: (event: string, payload?: any) => Promise<any>;
  onPublic?: (s: any) => void;
}) {
  const embed = youtubeEmbedSrc(url);
  const hasUrl = Boolean(String(url || "").trim());
  const [hidden, setHidden] = useState(false);
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState(String(url || ""));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    setDraft(String(url || ""));
  }, [url]);

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

  if (!ready) return null;
  // Owners/spectators: only render when a stream URL exists
  if (!canEdit && !hasUrl) return null;

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

  const saveLink = async (nextUrl: string) => {
    if (!emit || !auctionId) return;
    setBusy(true);
    setErr("");
    try {
      const trimmed = nextUrl.trim();
      if (trimmed && !isYoutubeUrl(trimmed)) {
        throw new Error("Enter a valid YouTube watch, live, channel, or share link");
      }
      const res: any = await emit("set-youtube-live", { auctionId, youtubeLiveUrl: trimmed });
      if (res?.public) onPublic?.(res.public);
    } catch (e: any) {
      setErr(e?.message || "Could not save YouTube link");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
            YouTube Live
          </p>
          <p className="text-sm font-semibold">
            {!hasUrl ? "No stream linked" : hidden ? "Video hidden" : embed ? "Live stream" : "Link saved — open a watch/live video URL"}
          </p>
        </div>
        {hasUrl ? (
          <Button type="button" onClick={toggle}>
            {hidden ? "Show video" : "Hide video"}
          </Button>
        ) : null}
      </div>

      {canEdit ? (
        <div className="space-y-2 border-t px-4 py-3" style={{ borderColor: "color-mix(in srgb, var(--ink) 10%, transparent)" }}>
          <Field
            label="YouTube Live link"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=… or /live/… or /channel/UC…/live"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="turf" disabled={busy} onClick={() => saveLink(draft)}>
              {busy ? "Saving…" : "Save link"}
            </Button>
            {hasUrl ? (
              <Button type="button" disabled={busy} onClick={() => saveLink("")}>
                Clear link
              </Button>
            ) : null}
          </div>
          {err ? (
            <p className="text-sm font-semibold" style={{ color: "var(--crimson)" }}>
              {err}
            </p>
          ) : (
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Only updates the YouTube link — other auction settings are left untouched. Hide/show is per device.
            </p>
          )}
        </div>
      ) : null}

      {hasUrl && !hidden && embed ? (
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

      {hasUrl && !hidden && !embed ? (
        <p className="px-4 py-3 text-sm" style={{ color: "var(--muted)" }}>
          This link could not be embedded. Use a watch URL, youtu.be link, /live/VIDEO_ID, or /channel/UC…/live.
        </p>
      ) : null}
    </Card>
  );
}
