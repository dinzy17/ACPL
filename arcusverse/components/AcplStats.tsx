"use client";

import Link from "next/link";

function dash(v: unknown) {
  if (v == null || v === "") return "—";
  return String(v);
}

/** Compact ACPL career card for hammer desk / player hero. */
export function AcplStatsCard({
  acpl,
  href,
  compact = false
}: {
  acpl?: any;
  href?: string;
  compact?: boolean;
}) {
  const found = acpl?.found === true;
  const rows = [
    ["Matches", found ? acpl.matches : null],
    ["Runs", found ? acpl.runs : null],
    ["Wickets", found ? acpl.wickets : null],
    ["Catches", found ? acpl.catches : null],
    ["Total Dismissals", found ? acpl.dismissals : null],
    ["Seasons Played", found ? acpl.seasonsLabel : null]
  ];

  return (
    <div className={`rounded-2xl bg-canvas ${compact ? "p-3" : "p-4"}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--muted)" }}>
          ACPL Historical Statistics
        </p>
        {found && href ? (
          <Link href={href} className="text-[11px] font-semibold underline" style={{ color: "var(--accent)" }}>
            Full stats
          </Link>
        ) : null}
      </div>
      <div className={`grid gap-1.5 ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"}`}>
        {rows.map(([label, value]) => (
          <div key={label as string}>
            <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--muted)" }}>
              {label}
            </p>
            <p className="font-display text-xl leading-tight">{dash(value)}</p>
          </div>
        ))}
      </div>
      {!found && (
        <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
          No historical ACPL record for this player.
        </p>
      )}
    </div>
  );
}

export function AcplCareerPanel({ player }: { player: any }) {
  if (!player) {
    return (
      <div className="card p-6">
        <p style={{ color: "var(--muted)" }}>Player not found in ACPL history.</p>
      </div>
    );
  }
  const c = player.career || {};
  const seasons = Object.values(player.seasons || {}).sort(
    (a: any, b: any) => (a.seasonNumber || 0) - (b.seasonNumber || 0)
  ) as any[];

  const summary = [
    ["Matches", c.matches],
    ["Runs", c.runs],
    ["Wickets", c.wickets],
    ["Catches", c.catches ?? c.totalCatches],
    ["Total Dismissals", c.dismissals],
    ["MVP Total", c.mvpTotal != null ? Number(c.mvpTotal).toFixed(2) : null],
    ["Seasons Played", (player.seasonsPlayed || []).join(", ")],
    ["Total Seasons", player.seasonsCount]
  ];

  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-5">
        <h2 className="font-display text-4xl">{player.name}</h2>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Career summary across ACPL seasons
        </p>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          {summary.map(([label, value]) => (
            <div key={label as string} className="rounded-2xl bg-canvas px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--muted)" }}>
                {label}
              </p>
              <p className="font-display text-2xl">{dash(value)}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="card overflow-auto p-0">
        <h3 className="font-display px-4 pt-4 text-3xl">Season-wise statistics</h3>
        <table className="mt-2 w-full min-w-[800px] text-left text-sm">
          <thead>
            <tr
              className="border-b border-[color-mix(in_srgb,var(--ink)_12%,transparent)] text-[11px] uppercase tracking-wider"
              style={{ color: "var(--muted)" }}
            >
              <th className="px-4 py-3">Season</th>
              <th className="px-4 py-3">Matches</th>
              <th className="px-4 py-3">Runs</th>
              <th className="px-4 py-3">Wickets</th>
              <th className="px-4 py-3">Catches</th>
              <th className="px-4 py-3">Dismissals</th>
              <th className="px-4 py-3">MVP</th>
              <th className="px-4 py-3">Team</th>
            </tr>
          </thead>
          <tbody>
            {seasons.map((s) => (
              <tr key={s.seasonKey} className="border-b border-[color-mix(in_srgb,var(--ink)_8%,transparent)]">
                <td className="px-4 py-3 font-semibold">{s.label || s.seasonKey}</td>
                <td className="px-4 py-3">{s.matches || 0}</td>
                <td className="px-4 py-3">{s.runs || 0}</td>
                <td className="px-4 py-3">{s.wickets || 0}</td>
                <td className="px-4 py-3">{s.catches || 0}</td>
                <td className="px-4 py-3">{s.dismissals || 0}</td>
                <td className="px-4 py-3">{s.mvpTotal != null ? Number(s.mvpTotal).toFixed(2) : "—"}</td>
                <td className="px-4 py-3">{s.teamName || "—"}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="px-4 py-3">Total</td>
              <td className="px-4 py-3">{c.matches || 0}</td>
              <td className="px-4 py-3">{c.runs || 0}</td>
              <td className="px-4 py-3">{c.wickets || 0}</td>
              <td className="px-4 py-3">{c.catches ?? c.totalCatches ?? 0}</td>
              <td className="px-4 py-3">{c.dismissals || 0}</td>
              <td className="px-4 py-3">{c.mvpTotal != null ? Number(c.mvpTotal).toFixed(2) : "—"}</td>
              <td className="px-4 py-3">—</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
