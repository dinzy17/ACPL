"use client";

import Link from "next/link";
import { useState } from "react";
import { useAdmin } from "@/components/admin/AdminGate";
import { Button, Card, Field } from "@/components/ui";

export default function AcplHistoryPage() {
  const { admin, emit } = useAdmin();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const hist = admin.acplHistory;
  const players = (hist?.players || []).filter((p: any) => {
    if (!q.trim()) return true;
    return String(p.name).toLowerCase().includes(q.trim().toLowerCase());
  });

  const runImport = async () => {
    try {
      setBusy(true);
      setErr("");
      setNote("");
      const res: any = await emit("import-acpl", {});
      const s = res.summary || {};
      setNote(
        `Imported ${s.uniquePlayers || 0} players from ${s.totalSeasonsProcessed || 0} seasons (${s.totalFilesProcessed || 0} files).`
      );
    } catch (e: any) {
      setErr(e.message || "Import failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-5xl">ACPL Historical Statistics</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            {hist?.playerCount || 0} players
            {hist?.meta?.importedAt ? ` · last import ${new Date(hist.meta.importedAt).toLocaleString()}` : " · not imported yet"}
          </p>
          {hist?.log && (
            <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
              Seasons {hist.log.totalSeasonsProcessed} · Files {hist.log.totalFilesProcessed} · Ambiguous names{" "}
              {hist.log.duplicateAmbiguousNames} · Errors {(hist.log.importErrors || []).length}
            </p>
          )}
        </div>
        <Button variant="turf" disabled={busy} onClick={runImport}>
          {busy ? "Importing…" : "Re-import from data/acpl"}
        </Button>
      </Card>

      {err && <p style={{ color: "var(--crimson)" }}>{err}</p>}
      {note && <p style={{ color: "var(--aqua)" }}>{note}</p>}

      <Card className="space-y-3">
        <Field label="Search players" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="overflow-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr
                className="border-b border-[color-mix(in_srgb,var(--ink)_12%,transparent)] text-[11px] uppercase tracking-wider"
                style={{ color: "var(--muted)" }}
              >
                <th className="px-2 py-2">Player</th>
                <th className="px-2 py-2">Seasons</th>
                <th className="px-2 py-2">Matches</th>
                <th className="px-2 py-2">Runs</th>
                <th className="px-2 py-2">Wickets</th>
                <th className="px-2 py-2">Catches</th>
                <th className="px-2 py-2">Dismissals</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p: any) => (
                <tr key={p.id} className="border-b border-[color-mix(in_srgb,var(--ink)_8%,transparent)]">
                  <td className="px-2 py-2">
                    <Link href={`/admin/acpl/${p.id}`} className="font-semibold underline">
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-2 py-2">{(p.seasonsPlayed || []).join(", ") || "—"}</td>
                  <td className="px-2 py-2">{p.career?.matches ?? "—"}</td>
                  <td className="px-2 py-2">{p.career?.runs ?? "—"}</td>
                  <td className="px-2 py-2">{p.career?.wickets ?? "—"}</td>
                  <td className="px-2 py-2">{p.career?.catches ?? "—"}</td>
                  <td className="px-2 py-2">{p.career?.dismissals ?? "—"}</td>
                </tr>
              ))}
              {!players.length && (
                <tr>
                  <td colSpan={7} className="px-2 py-8 text-center" style={{ color: "var(--muted)" }}>
                    No ACPL history loaded. Place season folders under data/acpl and click Re-import.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
