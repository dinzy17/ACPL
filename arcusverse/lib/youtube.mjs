/** Parse YouTube URLs into an iframe embed src. Supports watch, live, share, channel live. */

export function parseYoutubeVideoId(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  try {
    const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;
    const u = new URL(withProto);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtu.be") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      return id && /^[\w-]{6,}$/.test(id) ? id : null;
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      const v = u.searchParams.get("v");
      if (v && /^[\w-]{6,}$/.test(v)) return v;
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length >= 2 && ["live", "embed", "shorts", "v", "e"].includes(parts[0])) {
        const id = parts[1];
        // /embed/live_stream is not a video id
        if (id && id !== "live_stream" && /^[\w-]{6,}$/.test(id)) return id;
      }
    }
  } catch {
    /* fall through */
  }
  if (/^[\w-]{11}$/.test(s)) return s;
  return null;
}

/** Channel id from /channel/UC… or /channel/UC…/live */
export function parseYoutubeChannelId(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  try {
    const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;
    const u = new URL(withProto);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (!(host === "youtube.com" || host === "m.youtube.com")) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[0] === "channel" && parts[1] && /^UC[\w-]{20,}$/.test(parts[1])) return parts[1];
    const ch = u.searchParams.get("channel");
    if (ch && /^UC[\w-]{20,}$/.test(ch)) return ch;
  } catch {
    /* fall through */
  }
  if (/^UC[\w-]{20,}$/.test(s)) return s;
  return null;
}

export function isYoutubeUrl(raw) {
  const s = String(raw || "").trim();
  if (!s) return false;
  if (parseYoutubeVideoId(s) || parseYoutubeChannelId(s)) return true;
  try {
    const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;
    const u = new URL(withProto);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    return host === "youtu.be" || host.endsWith("youtube.com");
  } catch {
    return /^[\w-]{11}$/.test(s) || /^UC[\w-]{20,}$/.test(s);
  }
}

export function youtubeEmbedSrc(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const params = new URLSearchParams({
    autoplay: "0",
    rel: "0",
    modestbranding: "1",
    playsinline: "1"
  });
  const videoId = parseYoutubeVideoId(s);
  if (videoId) return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
  const channelId = parseYoutubeChannelId(s);
  if (channelId) {
    params.set("channel", channelId);
    return `https://www.youtube.com/embed/live_stream?${params.toString()}`;
  }
  // Last resort: if it's clearly a YouTube URL, try /embed/ path from live links like @handle/live
  try {
    const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;
    const u = new URL(withProto);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtu.be" || host.endsWith("youtube.com")) {
      // Cannot reliably embed @handle without channel id — return null so UI can prompt
      return null;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function normalizeYoutubeLiveUrl(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (!isYoutubeUrl(s)) {
    throw new Error("Enter a valid YouTube watch, live, channel, or share link");
  }
  return s;
}
