"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, Field } from "@/components/ui";

const TABS = ["Overview", "Stats", "Leaderboard", "Matches", "Upcoming", "Members"] as const;

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function upcomingToHtml(teamName: string, upcoming: any[]) {
  const rows = (upcoming || [])
    .map(
      (m) => `<tr>
      <td style="padding:10px;border-bottom:1px solid #e2e8f0;">${esc(m.date || "—")}${m.time ? ` · ${esc(m.time)}` : ""}</td>
      <td style="padding:10px;border-bottom:1px solid #e2e8f0;">${esc(m.opponent || "TBD")}</td>
      <td style="padding:10px;border-bottom:1px solid #e2e8f0;">${esc(m.venue || "—")}</td>
      <td style="padding:10px;border-bottom:1px solid #e2e8f0;">${esc(m.tournament || "—")}</td>
    </tr>`
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"/><title>${esc(teamName)} — Upcoming matches</title>
  <style>
    body{font-family:Nunito,Segoe UI,Arial,sans-serif;color:#0f172a;padding:32px;background:#f8fafc}
    h1{font-size:28px;margin:0 0 8px}
    p{color:#64748b;margin:0 0 20px}
    table{width:100%;border-collapse:collapse;background:#fff;border-radius:16px;overflow:hidden}
    th{text-align:left;padding:10px;background:#eff6ff;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#64748b}
  </style></head><body>
  <h1>${esc(teamName)}</h1>
  <p>Upcoming matches · generated ${new Date().toLocaleString()}</p>
  <table><thead><tr><th>When</th><th>Opponent</th><th>Venue</th><th>Tournament</th></tr></thead>
  <tbody>${rows || `<tr><td colspan="4" style="padding:16px;color:#64748b">No upcoming matches saved yet.</td></tr>`}</tbody></table>
  </body></html>`;
}

function esc(s: any) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function CricheroesTeamPanel({ team, emit }: { team: any; emit: (e: string, p?: any) => Promise<any> }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [shareUrl, setShareUrl] = useState(team.cricheroesShareUrl || team.cricheroesProfileUrl || "");
  const [upcoming, setUpcoming] = useState<any[]>(team.cricheroes?.matches?.upcoming || []);
  const exportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setShareUrl(team.cricheroesShareUrl || team.cricheroesProfileUrl || "");
    setUpcoming(team.cricheroes?.matches?.upcoming || []);
  }, [team.id, team.cricheroesShareUrl, team.cricheroesProfileUrl, team.cricheroes?.fetchedAt]);

  const cache = team.cricheroes || null;
  const tabs = cache?.tabs || {};
  const profileUrl = team.cricheroesProfileUrl || cache?.profileUrl || "";

  const sync = async () => {
    try {
      setBusy(true);
      setMsg("");
      const res: any = await emit("sync-cricheroes-team", { teamId: team.id, shareUrl });
      const src = res.cache?.source;
      setMsg(
        src === "public_profile_seed"
          ? "Loaded CricHeroes profile snapshot (stats, leaderboard, matches, members)."
          : "Resolved CricHeroes profile links. No snapshot for this team yet — use Open live tabs."
      );
    } catch (e: any) {
      setMsg(e.message || "Sync failed");
    } finally {
      setBusy(false);
    }
  };

  const saveUpcoming = async () => {
    try {
      setBusy(true);
      setMsg("");
      await emit("save-cricheroes-upcoming", { teamId: team.id, upcoming });
      setMsg("Upcoming matches saved.");
    } catch (e: any) {
      setMsg(e.message || "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const downloadPdf = () => {
    const html = upcomingToHtml(team.name, upcoming);
    const w = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
    if (!w) {
      setMsg("Popup blocked — allow popups to download PDF.");
      return;
    }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  const downloadImage = async () => {
    try {
      const html = upcomingToHtml(team.name, upcoming);
      const height = Math.max(420, 180 + upcoming.length * 56);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="${height}">
        <foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml">${html
          .replace("<!doctype html>", "")
          .replace(/<\/?html[^>]*>/gi, "")
          .replace(/<head>[\s\S]*?<\/head>/gi, "")
          .replace(/<\/?body[^>]*>/gi, "")}</div></foreignObject></svg>`;
      const svgUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 900;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.fillStyle = "#f8fafc";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          if (!blob) {
            // fallback raw svg
            const a = document.createElement("a");
            a.href = svgUrl;
            a.download = `${team.name.replace(/\s+/g, "-").toLowerCase()}-upcoming.svg`;
            a.click();
            return;
          }
          downloadBlob(`${team.name.replace(/\s+/g, "-").toLowerCase()}-upcoming.png`, blob);
        }, "image/png");
      };
      img.onerror = () => {
        const a = document.createElement("a");
        a.href = svgUrl;
        a.download = `${team.name.replace(/\s+/g, "-").toLowerCase()}-upcoming.svg`;
        a.click();
      };
      img.src = svgUrl;
      setMsg("Preparing upcoming matches image…");
    } catch (e: any) {
      setMsg(e.message || "Image export failed");
    }
  };

  const lbSections = useMemo(
    () => [
      { key: "batting", title: "Batting" },
      { key: "bowling", title: "Bowling" },
      { key: "fielding", title: "Fielding" }
    ],
    []
  );

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-3xl">CricHeroes</h2>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Stats, leaderboard, past & upcoming matches from the team&apos;s CricHeroes profile.
            </p>
          </div>
          {profileUrl ? (
            <a className="text-sm font-semibold underline" href={profileUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
              Open profile
            </a>
          ) : null}
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
          <Field
            label="CricHeroes share / profile URL"
            value={shareUrl}
            onChange={(e) => setShareUrl(e.target.value)}
            placeholder="https://chshare.link/team/…"
          />
          <div className="flex items-end">
            <Button variant="turf" disabled={busy || !shareUrl.trim()} onClick={sync}>
              {busy ? "Syncing…" : "Sync from CricHeroes"}
            </Button>
          </div>
          <div className="flex items-end">
            <Button
              disabled={busy}
              onClick={async () => {
                try {
                  setBusy(true);
                  const res: any = await emit("sync-all-cricheroes", {});
                  setMsg(`Synced ${res.results?.filter((r: any) => r.ok).length || 0} team(s).`);
                } catch (e: any) {
                  setMsg(e.message || "Bulk sync failed");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Sync all ACPL teams
            </Button>
          </div>
        </div>
        {team.cricheroesTeamId ? (
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Team id {team.cricheroesTeamId}
            {cache?.fetchedAt ? ` · last sync ${new Date(cache.fetchedAt).toLocaleString()}` : ""}
            {cache?.source ? ` · source ${cache.source}` : ""}
          </p>
        ) : null}
        {msg ? <p className="text-sm">{msg}</p> : null}
        {(cache?.notes || []).length ? (
          <ul className="list-disc space-y-1 pl-5 text-xs" style={{ color: "var(--muted)" }}>
            {cache.notes.map((n: string, i: number) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        ) : null}
      </Card>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            className="neu-sm px-3 py-2 text-sm"
            style={tab === t ? { outline: "2px solid var(--accent)", color: "var(--accent)" } : undefined}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Members", tabs.members],
            ["Matches", tabs.matches],
            ["Stats", tabs.stats],
            ["Leaderboard", tabs.leaderboard]
          ].map(([label, href]) => (
            <Card key={label as string} className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                {label}
              </p>
              {href ? (
                <a href={href as string} target="_blank" rel="noreferrer" className="font-semibold underline" style={{ color: "var(--accent)" }}>
                  View on CricHeroes →
                </a>
              ) : (
                <p className="text-sm" style={{ color: "var(--muted)" }}>
                  Sync a share link first
                </p>
              )}
            </Card>
          ))}
        </div>
      ) : null}

      {tab === "Stats" ? (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-2xl">Team stats</h3>
            {tabs.stats ? (
              <a href={tabs.stats} target="_blank" rel="noreferrer" className="text-sm underline" style={{ color: "var(--accent)" }}>
                Open live stats
              </a>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(cache?.stats || []).map((s: any) => (
              <div key={s.label} className="neu-sm px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                  {s.label}
                </p>
                <p className="font-display text-3xl">{s.value}</p>
              </div>
            ))}
            {!(cache?.stats || []).length ? (
              <p className="text-sm sm:col-span-2" style={{ color: "var(--muted)" }}>
                No cached stats yet. Click “Sync from CricHeroes” to load the profile snapshot, or open live stats.
              </p>
            ) : null}
          </div>
        </Card>
      ) : null}

      {tab === "Leaderboard" ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {lbSections.map((sec) => (
            <Card key={sec.key} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-2xl">{sec.title}</h3>
                {tabs.leaderboard ? (
                  <a href={tabs.leaderboard} target="_blank" rel="noreferrer" className="text-xs underline" style={{ color: "var(--accent)" }}>
                    Live
                  </a>
                ) : null}
              </div>
              <ul className="space-y-2 text-sm">
                {(cache?.leaderboard?.[sec.key] || []).map((row: any, i: number) => (
                  <li key={`${row.player}-${i}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5" style={{ background: "color-mix(in srgb, var(--ink) 4%, transparent)" }}>
                    <span className="font-semibold">{row.player}</span>
                    <span style={{ color: "var(--muted)" }}>{row.stat}</span>
                  </li>
                ))}
                {!(cache?.leaderboard?.[sec.key] || []).length ? (
                  <li style={{ color: "var(--muted)" }}>No cached {sec.title.toLowerCase()} leaders yet.</li>
                ) : null}
              </ul>
            </Card>
          ))}
        </div>
      ) : null}

      {tab === "Matches" ? (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-2xl">Past matches</h3>
            {tabs.matches ? (
              <a href={tabs.matches} target="_blank" rel="noreferrer" className="text-sm underline" style={{ color: "var(--accent)" }}>
                Open live matches
              </a>
            ) : null}
          </div>
          <div className="space-y-2">
            {(cache?.matches?.past || []).map((m: any, i: number) => (
              <div key={i} className="rounded-xl px-3 py-2 text-sm" style={{ background: "color-mix(in srgb, var(--ink) 4%, transparent)" }}>
                <p className="font-semibold">{m.tournament || "Match"}</p>
                <p style={{ color: "var(--muted)" }}>
                  {[m.date, m.venue, m.score, m.result].filter(Boolean).join(" · ")}
                </p>
              </div>
            ))}
            {!(cache?.matches?.past || []).length ? (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                No cached past matches yet — open live matches on CricHeroes.
              </p>
            ) : null}
          </div>
        </Card>
      ) : null}

      {tab === "Upcoming" ? (
        <div className="space-y-4">
          <Card className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-2xl">Upcoming matches</h3>
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy} onClick={saveUpcoming}>
                  Save list
                </Button>
                <Button disabled={!upcoming.length} onClick={downloadPdf}>
                  Download PDF
                </Button>
                <Button disabled={!upcoming.length} onClick={downloadImage}>
                  Download image
                </Button>
              </div>
            </div>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Synced from CricHeroes when API access is available, or edit manually then export.
            </p>
            <div className="space-y-2">
              {upcoming.map((m, idx) => (
                <div key={idx} className="grid gap-2 rounded-xl p-3 md:grid-cols-5" style={{ background: "color-mix(in srgb, var(--ink) 4%, transparent)" }}>
                  <Field label="Date" value={m.date || ""} onChange={(e) => setUpcoming((arr) => arr.map((x, i) => (i === idx ? { ...x, date: e.target.value } : x)))} />
                  <Field label="Time" value={m.time || ""} onChange={(e) => setUpcoming((arr) => arr.map((x, i) => (i === idx ? { ...x, time: e.target.value } : x)))} />
                  <Field label="Opponent" value={m.opponent || ""} onChange={(e) => setUpcoming((arr) => arr.map((x, i) => (i === idx ? { ...x, opponent: e.target.value } : x)))} />
                  <Field label="Venue" value={m.venue || ""} onChange={(e) => setUpcoming((arr) => arr.map((x, i) => (i === idx ? { ...x, venue: e.target.value } : x)))} />
                  <div className="flex items-end gap-2">
                    <Field
                      className="flex-1"
                      label="Tournament"
                      value={m.tournament || ""}
                      onChange={(e) => setUpcoming((arr) => arr.map((x, i) => (i === idx ? { ...x, tournament: e.target.value } : x)))}
                    />
                    <Button variant="danger" onClick={() => setUpcoming((arr) => arr.filter((_, i) => i !== idx))}>
                      ✕
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <Button
              onClick={() =>
                setUpcoming((arr) => [...arr, { date: "", time: "", opponent: "", venue: "", tournament: "", url: "" }])
              }
            >
              + Add upcoming match
            </Button>
          </Card>

          <div ref={exportRef} className="neu space-y-3 p-6" style={{ background: "#f8fafc" }}>
            <h3 className="font-display text-3xl">{team.name}</h3>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Upcoming matches
            </p>
            <div className="space-y-2">
              {upcoming.map((m, i) => (
                <div key={i} className="rounded-xl bg-white px-4 py-3 text-sm shadow-sm">
                  <p className="font-semibold">
                    {m.date || "Date TBD"}
                    {m.time ? ` · ${m.time}` : ""} vs {m.opponent || "TBD"}
                  </p>
                  <p style={{ color: "var(--muted)" }}>
                    {[m.venue, m.tournament].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
              ))}
              {!upcoming.length ? <p style={{ color: "var(--muted)" }}>No upcoming matches.</p> : null}
            </div>
          </div>
        </div>
      ) : null}

      {tab === "Members" ? (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-2xl">CricHeroes members</h3>
            {tabs.members ? (
              <a href={tabs.members} target="_blank" rel="noreferrer" className="text-sm underline" style={{ color: "var(--accent)" }}>
                Open live members
              </a>
            ) : null}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(cache?.members || []).map((p: any, i: number) => (
              <div key={`${p.name}-${i}`} className="rounded-xl px-3 py-2 text-sm" style={{ background: "color-mix(in srgb, var(--ink) 4%, transparent)" }}>
                <p className="font-semibold">{p.name}</p>
                <p style={{ color: "var(--muted)" }}>{p.role || "—"}</p>
              </div>
            ))}
            {!(cache?.members || []).length ? (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                No cached members yet — open live members on CricHeroes.
              </p>
            ) : null}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
