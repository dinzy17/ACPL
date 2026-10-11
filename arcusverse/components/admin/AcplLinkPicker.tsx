"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Field } from "@/components/ui";

type AcplHit = {
  id: string;
  name: string;
  seasonsCount?: number;
  seasonsPlayed?: string[];
  career?: { matches?: number; runs?: number; wickets?: number };
};

/**
 * Searchable ACPL stats dropdown — filters locally as you type (same as ACPL Stats page).
 */
export function AcplLinkPicker({
  emit,
  playerId,
  linkedAcplId,
  linkedAcplName,
  initialQuery = "",
  acplPlayers = [],
  onLinked,
  onUnlinked
}: {
  emit: (event: string, payload?: any) => Promise<any>;
  playerId?: string;
  linkedAcplId?: string | null;
  linkedAcplName?: string | null;
  initialQuery?: string;
  /** Full ACPL history list from admin.acplHistory.players — filtered locally while typing */
  acplPlayers?: AcplHit[];
  onLinked?: (info: { acpl: AcplHit; player?: any; summary?: any }) => void;
  onUnlinked?: () => void;
}) {
  const [q, setQ] = useState(initialQuery);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setQ(linkedAcplName || initialQuery || "");
  }, [initialQuery, linkedAcplName, playerId]);

  // Active local filter while typing — same behavior as /admin/acpl search
  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = Array.isArray(acplPlayers) ? acplPlayers : [];
    const filtered = !needle
      ? list
      : list.filter((p) => String(p.name || "").toLowerCase().includes(needle));
    return filtered.slice(0, 40);
  }, [acplPlayers, q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const link = async (acpl: AcplHit) => {
    if (!playerId) return;
    try {
      setBusy(true);
      setMsg("");
      const res: any = await emit("link-player-acpl", {
        playerId,
        acplPlayerId: acpl.id
      });
      if (!res?.ok && res?.error) throw new Error(res.error);
      setMsg(`Linked to ${res.acpl?.name || acpl.name}`);
      setQ(res.acpl?.name || acpl.name);
      setOpen(false);
      onLinked?.({
        acpl: res.acpl || acpl,
        player: res.player,
        summary: res.summary
      });
    } catch (e: any) {
      setMsg(e.message || "Failed to link");
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    if (!playerId) return;
    try {
      setBusy(true);
      setMsg("");
      const res: any = await emit("unlink-player-acpl", { playerId });
      if (!res?.ok && res?.error) throw new Error(res.error);
      setMsg("ACPL link removed.");
      onUnlinked?.();
    } catch (e: any) {
      setMsg(e.message || "Failed to unlink");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2" ref={wrapRef}>
      <p className="text-sm">
        {linkedAcplId ? (
          <>
            Linked: <strong style={{ color: "var(--turf)" }}>{linkedAcplName || "ACPL player"}</strong>
          </>
        ) : (
          <span style={{ color: "var(--muted)" }}>Not linked to ACPL stats yet — type to filter and select</span>
        )}
      </p>
      <div className="relative">
        <Field
          label="Search & select ACPL player"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          placeholder="Type to filter ACPL players…"
          disabled={!playerId}
          autoComplete="off"
        />
        {open && playerId ? (
          <div
            className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border shadow-lg"
            style={{
              background: "var(--panel, #fff)",
              borderColor: "color-mix(in srgb, var(--ink) 12%, transparent)"
            }}
            role="listbox"
          >
            <p
              className="sticky top-0 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider"
              style={{
                color: "var(--muted)",
                background: "var(--panel, #fff)",
                borderBottom: "1px solid color-mix(in srgb, var(--ink) 8%, transparent)"
              }}
            >
              {results.length
                ? `${results.length}${results.length >= 40 ? "+" : ""} match${results.length === 1 ? "" : "es"} — click to link`
                : q.trim()
                  ? "No matches"
                  : "Type a name to filter"}
            </p>
            {results.map((p) => {
              const already = linkedAcplId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="option"
                  aria-selected={already}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-black/5"
                  disabled={busy || already}
                  onClick={() => link(p)}
                >
                  <span>
                    <span className="font-semibold">{p.name}</span>
                    <span className="block text-xs" style={{ color: "var(--muted)" }}>
                      {p.seasonsCount || p.seasonsPlayed?.length || 0} season
                      {(p.seasonsCount || p.seasonsPlayed?.length || 0) === 1 ? "" : "s"}
                      {p.career?.matches != null ? ` · ${p.career.matches} matches` : ""}
                      {p.career?.runs != null ? ` · ${p.career.runs} runs` : ""}
                      {p.career?.wickets != null ? ` · ${p.career.wickets} wkts` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-bold uppercase" style={{ color: "var(--accent)" }}>
                    {already ? "Linked" : "Select"}
                  </span>
                </button>
              );
            })}
            {q.trim() && !results.length ? (
              <p className="px-3 py-2 text-sm" style={{ color: "var(--muted)" }}>
                No ACPL players match “{q.trim()}”.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      {linkedAcplId ? (
        <Button variant="danger" disabled={busy || !playerId} onClick={unlink}>
          Unlink ACPL
        </Button>
      ) : null}
      {msg ? <p className="text-sm">{msg}</p> : null}
    </div>
  );
}
