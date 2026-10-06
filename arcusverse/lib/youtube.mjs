/** Parse common YouTube watch / live / short / embed URLs into an embeddable video id. */
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
        if (id && /^[\w-]{6,}$/.test(id)) return id;
      }
    }
  } catch {
    /* fall through */
  }
  if (/^[\w-]{11}$/.test(s)) return s;
  return null;
}

export function youtubeEmbedSrc(raw) {
  const id = parseYoutubeVideoId(raw);
  if (!id) return null;
  const params = new URLSearchParams({
    autoplay: "0",
    rel: "0",
    modestbranding: "1",
    playsinline: "1"
  });
  return `https://www.youtube.com/embed/${id}?${params.toString()}`;
}

export function normalizeYoutubeLiveUrl(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (!parseYoutubeVideoId(s)) {
    throw new Error("Enter a valid YouTube watch, live, or share link");
  }
  return s;
}
