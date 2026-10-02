"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, ColorSelect, Field, FilePick, Select } from "@/components/ui";
import { AcplStatsCard } from "@/components/AcplStats";
import { AcplLinkPicker } from "@/components/admin/AcplLinkPicker";
import { useApp } from "@/components/Providers";
import { parseTableFile, inr, lakhsToCr, crToLakhs, defaultIncrementRows, incrementsToRows, rowsToIncrements } from "@/lib/format";

export const SPORTS = ["Cricket", "Badminton", "Table-tennis"];
export const ROLES = ["Batsman", "Bowler", "All-Rounder", "Wicketkeeper"];

export function TournamentsPanel({ admin, emit }: any) {
  const blank = {
    id: "",
    name: "",
    sport: "Cricket",
    logo: "",
    startDate: "",
    endDate: "",
    venue: "",
    hasAuction: true,
    categoryId: admin.categories[0]?.id || "",
    teamIds: [] as string[],
    playerIds: [] as string[]
  };
  const [form, setForm] = useState(blank);
  const sameSport = (t: any) => String(t.sport || "Cricket").toLowerCase() === String(form.sport || "Cricket").toLowerCase();
  const catTeams = admin.teams.filter((t: any) => t.categoryId === form.categoryId && sameSport(t));
  const catPlayers = admin.players.filter((p: any) => p.categoryId === form.categoryId && sameSport(p));
  const catName = admin.categories.find((c: any) => c.id === form.categoryId)?.name || "this category";

  const toggleTeam = (id: string) =>
    setForm({
      ...form,
      teamIds: form.teamIds.includes(id) ? form.teamIds.filter((x) => x !== id) : [...form.teamIds, id]
    });
  const togglePlayer = (id: string) =>
    setForm({
      ...form,
      playerIds: form.playerIds.includes(id) ? form.playerIds.filter((x) => x !== id) : [...form.playerIds, id]
    });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-3">
        <h2 className="font-display text-3xl">{form.id ? "Edit tournament" : "Add tournament"}</h2>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Pick a sport and category, then add matching teams and players. Creating an auction for this tournament will pull those teams and the selected {form.sport} / {catName} players.
        </p>
        <Field label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Select
          label="Sport"
          value={form.sport}
          onChange={(e) => setForm({ ...form, sport: e.target.value, teamIds: [], playerIds: [] })}
        >
          {SPORTS.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
        <Select
          label="Category"
          value={form.categoryId}
          onChange={(e) => setForm({ ...form, categoryId: e.target.value, teamIds: [], playerIds: [] })}
        >
          {admin.categories.map((c: any) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <FilePick
          label="Tournament logo"
          onData={async (dataUrl, file) => {
            try {
              // Use raw socket emit (skip staff re-login) and a long timeout for large images
              const res: any = await emit("upload", { dataUrl, filename: file.name || "logo.jpg" });
              const url = res?.url;
              if (!url) throw new Error(res?.error || "Upload failed");
              setForm((f) => ({ ...f, logo: url }));
            } catch (e: any) {
              alert(e.message || "Logo upload failed — try a smaller JPG/PNG (under 5 MB).");
            }
          }}
        />
        {form.logo ? (
          <div className="flex items-center gap-3">
            <img src={form.logo} alt="" className="h-14 w-14 rounded-xl object-cover" />
            <Button onClick={() => setForm({ ...form, logo: "" })}>Remove logo</Button>
          </div>
        ) : (
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Upload a logo, then click Save. It appears on the public registration page.
          </p>
        )}
        <Field label="Start date" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
        <Field label="End date" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
        <Field label="Venue" value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} />
        <Select
          label="Auction"
          value={form.hasAuction ? "yes" : "no"}
          onChange={(e) => setForm({ ...form, hasAuction: e.target.value === "yes" })}
        >
          <option value="yes">Yes — show in Create Auction</option>
          <option value="no">No</option>
        </Select>
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
              Add teams ({form.sport} · {catName})
            </p>
            <Button onClick={() => setForm({ ...form, teamIds: catTeams.map((t: any) => t.id) })}>Select all teams</Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {catTeams.map((t: any) => (
              <button
                key={t.id}
                type="button"
                className={`neu tile-lg text-left ${form.teamIds.includes(t.id) ? "is-pressed" : ""}`}
                onClick={() => toggleTeam(t.id)}
              >
                <p className="font-display text-2xl leading-tight break-words sm:text-3xl" style={{ color: t.color }}>
                  {t.name}
                </p>
                <p className="text-sm" style={{ color: "var(--muted)" }}>
                  {t.sport || "Cricket"} · {form.teamIds.includes(t.id) ? "In this tournament" : "Tap to add"}
                </p>
              </button>
            ))}
            {!catTeams.length && (
              <p className="text-sm">
                No {form.sport} / {catName} teams yet. Create them under Teams and tag the sport.
              </p>
            )}
          </div>
        </div>
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
              Players in this tournament ({form.playerIds.length} selected · {form.sport} · {catName})
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setForm({ ...form, playerIds: [] })}>Clear players</Button>
              <Button onClick={() => setForm({ ...form, playerIds: catPlayers.map((p: any) => p.id) })}>Select all players</Button>
            </div>
          </div>
          <div className="grid max-h-72 gap-3 overflow-auto sm:grid-cols-2">
            {catPlayers.map((p: any) => (
              <button
                key={p.id}
                type="button"
                className={`neu tile-lg text-left ${form.playerIds.includes(p.id) ? "is-pressed" : ""}`}
                onClick={() => togglePlayer(p.id)}
              >
                <p className="font-display text-xl leading-tight break-words sm:text-2xl">{p.name}</p>
                <p className="text-sm" style={{ color: "var(--muted)" }}>
                  {p.sport || "Cricket"} · {p.role} · {inr(p.basePrice)} · {form.playerIds.includes(p.id) ? "Selected" : "Tap to add"}
                </p>
              </button>
            ))}
            {!catPlayers.length && (
              <p className="text-sm">No {form.sport} / {catName} players yet. Create them under Players and tag the sport.</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="turf"
            onClick={() =>
              emit("upsert-tournament", form)
                .then((res: any) => {
                  const saved = res.tournament;
                  if (saved) {
                    setForm({
                      ...blank,
                      ...saved,
                      logo: saved.logo || form.logo || "",
                      categoryId: saved.categoryId || form.categoryId,
                      teamIds: Array.isArray(saved.teamIds) ? saved.teamIds : [],
                      playerIds: Array.isArray(saved.playerIds) ? saved.playerIds : []
                    });
                  }
                })
                .catch((e: any) => alert(e.message || "Save failed — try again"))
            }
          >
            Save
          </Button>
          {form.id && <Button onClick={() => setForm(blank)}>Clear</Button>}
        </div>
      </Card>
      <div className="space-y-3">
        {admin.tournaments.map((t: any) => (
          <Card key={t.id} className="flex min-h-[140px] items-start justify-between gap-3">
            <button
              className="flex min-w-0 flex-1 items-start gap-3 text-left"
              onClick={() =>
                setForm({
                  ...blank,
                  ...t,
                  logo: t.logo || "",
                  categoryId: t.categoryId || admin.categories[0]?.id,
                  teamIds: Array.isArray(t.teamIds) ? t.teamIds : [],
                  // Never expand to “all players on tournamentIds” — that re-selected everyone on edit.
                  playerIds: Array.isArray(t.playerIds) ? t.playerIds : []
                })
              }
            >
              {t.logo ? (
                <img src={t.logo} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
              ) : (
                <div
                  className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl text-xl font-bold"
                  style={{ background: "color-mix(in srgb, var(--accent) 18%, transparent)", color: "var(--accent)" }}
                >
                  {(t.name || "?").slice(0, 1)}
                </div>
              )}
              <div className="min-w-0">
                <h3 className="font-display text-4xl">{t.name}</h3>
                <p className="mt-1 text-base" style={{ color: "var(--muted)" }}>
                  {t.sport} · {admin.categories.find((c: any) => c.id === t.categoryId)?.name || "—"} · {t.venue} · {t.startDate} →{" "}
                  {t.endDate} · Auction {t.hasAuction ? "Yes" : "No"}
                </p>
                <p className="mt-1 text-sm">
                  {(t.teamIds || []).length} teams · {(Array.isArray(t.playerIds) ? t.playerIds : []).length} players
                </p>
              </div>
            </button>
            <Button variant="danger" onClick={() => emit("delete-tournament", { id: t.id })}>
              Delete
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function PlayersPanel({ admin, emit }: any) {
  const blank = {
    id: "",
    name: "",
    role: "Batsman",
    sport: "Cricket",
    categoryId: admin.categories[0]?.id,
    basePriceCr: "",
    photo: "",
    teamId: "",
    assignment: "auction",
    tournamentIds: [] as string[]
  };
  const [form, setForm] = useState(blank);
  const [acplPreview, setAcplPreview] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkRole, setBulkRole] = useState("");
  const [bulkBaseCr, setBulkBaseCr] = useState("");
  const [mergeAbsorbId, setMergeAbsorbId] = useState("");
  const [msg, setMsg] = useState("");
  const { setSport } = useApp();
  const sameSport = (x: any) => String(x.sport || "Cricket").toLowerCase() === String(form.sport || "Cricket").toLowerCase();
  const isCricket = String(form.sport || "Cricket").toLowerCase() === "cricket";
  const teams = admin.teams.filter((t: any) => t.categoryId === form.categoryId && sameSport(t));
  const sportTournaments = admin.tournaments.filter((t: any) => sameSport(t));
  const listedPlayers = admin.players.filter((p: any) => sameSport(p));
  const selectedLive = form.id ? listedPlayers.find((p: any) => p.id === form.id) : null;

  useEffect(() => {
    setSport(form.sport || "Cricket");
  }, [form.sport, setSport]);

  useEffect(() => {
    const name = form.name.trim();
    if (name.length < 2) {
      setAcplPreview(null);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      emit("lookup-acpl", { name })
        .then((res: any) => {
          if (alive) setAcplPreview(res.summary);
        })
        .catch(() => {
          if (alive) setAcplPreview({ found: false });
        });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [form.name, emit]);

  const upload = async (dataUrl: string, file: File) => {
    const res: any = await emit("upload", { dataUrl, filename: file.name });
    setForm((f) => ({ ...f, photo: res.url }));
  };

  const toggleT = (id: string) =>
    setForm({
      ...form,
      tournamentIds: form.tournamentIds.includes(id)
        ? form.tournamentIds.filter((x) => x !== id)
        : [...form.tournamentIds, id]
    });

  const toggleSelect = (id: string) =>
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const applyBulk = async () => {
    try {
      setMsg("");
      const payload: any = { playerIds: selectedIds };
      if (bulkRole) payload.role = bulkRole;
      if (bulkBaseCr !== "") payload.basePrice = crToLakhs(bulkBaseCr);
      const res: any = await emit("bulk-update-players", payload);
      setMsg(`Updated ${res.updated || selectedIds.length} player(s).`);
      setSelectedIds([]);
      setBulkRole("");
      setBulkBaseCr("");
    } catch (e: any) {
      setMsg(e.message || "Bulk update failed");
    }
  };

  const clearBulkBase = async () => {
    try {
      setMsg("");
      const res: any = await emit("bulk-update-players", {
        playerIds: selectedIds,
        clearBasePrice: true
      });
      setMsg(`Cleared base price for ${res.updated || selectedIds.length} player(s).`);
      setSelectedIds([]);
      setBulkBaseCr("");
    } catch (e: any) {
      setMsg(e.message || "Clear base failed");
    }
  };

  const mergeIntoSelected = async () => {
    if (!form.id || !mergeAbsorbId) return;
    if (!confirm("Merge the other player into this one? The other entry will be removed.")) return;
    try {
      setMsg("");
      await emit("merge-players", { keepPlayerId: form.id, absorbPlayerId: mergeAbsorbId });
      setMergeAbsorbId("");
      setMsg("Players merged.");
      setForm(blank);
    } catch (e: any) {
      setMsg(e.message || "Merge failed");
    }
  };

  return (
    <div className="space-y-4">
      <Card className="grid gap-3 md:grid-cols-3">
        <p className="md:col-span-3 text-xs" style={{ color: "var(--muted)" }}>
          Tag each player with a sport. Teams and tournaments only list players that match both sport and category.
        </p>
        <Field label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        {isCricket ? (
          <Select label="Playing type" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {ROLES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
        ) : null}
        <Select
          label="Sport"
          value={form.sport}
          onChange={(e) =>
            setForm({
              ...form,
              sport: e.target.value,
              role: String(e.target.value).toLowerCase() === "cricket" ? form.role || "Batsman" : "Player",
              teamId: "",
              tournamentIds: form.tournamentIds.filter((id) => {
                const t = admin.tournaments.find((x: any) => x.id === id);
                return t && String(t.sport || "Cricket").toLowerCase() === String(e.target.value).toLowerCase();
              })
            })
          }
        >
          {SPORTS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Select
          label="Category"
          value={form.categoryId}
          onChange={(e) => setForm({ ...form, categoryId: e.target.value, teamId: "", assignment: "auction" })}
        >
          {admin.categories.map((c: any) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Field
          label="Base price (crores)"
          value={form.basePriceCr}
          onChange={(e) => setForm({ ...form, basePriceCr: e.target.value })}
          placeholder="Leave blank until set"
        />
        <div className="md:col-span-3">
          <p className="mb-3 text-sm font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
            How to add this player
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <button
              type="button"
              className={`neu tile-lg text-left ${form.assignment === "auction" ? "is-pressed" : ""}`}
              onClick={() => setForm({ ...form, assignment: "auction", teamId: "" })}
            >
              <p className="tile-title">Through auction</p>
              <p className="tile-sub">Player goes into the auction pool. No team until sold.</p>
            </button>
            <button
              type="button"
              className={`neu tile-lg text-left ${form.assignment === "team" ? "is-pressed" : ""}`}
              onClick={() => setForm({ ...form, assignment: "team" })}
            >
              <p className="tile-title">Add manually to team</p>
              <p className="tile-sub">Same sport and category only. Assign now, skip the auction.</p>
            </button>
          </div>
          {form.assignment === "team" && (
            <div className="mt-3">
              <Select
                label={`Team (${form.sport} · same category)`}
                value={form.teamId}
                onChange={(e) => setForm({ ...form, teamId: e.target.value, assignment: "team" })}
              >
                <option value="">Select team</option>
                {teams.map((t: any) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
              {!teams.length && (
                <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
                  No {form.sport} teams in this category yet.
                </p>
              )}
            </div>
          )}
        </div>
        <div className="space-y-2">
          <FilePick label="Upload photo" onData={upload} />
          {form.photo ? (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={form.photo}
                alt=""
                className="h-16 w-16 rounded-xl object-cover"
                style={{ outline: "1px solid color-mix(in srgb, var(--ink) 10%, transparent)" }}
              />
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                Current photo (from registration or upload)
              </p>
            </div>
          ) : (
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              No photo yet — registration “Upload player photo” attaches here automatically.
            </p>
          )}
        </div>
        {form.name.trim().length >= 2 && (
          <div className="md:col-span-3">
            <AcplStatsCard acpl={acplPreview} />
          </div>
        )}
        <div className="md:col-span-3">
          <p className="mb-3 text-sm font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
            Add to tournaments ({form.sport})
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sportTournaments.map((t: any) => (
              <button
                key={t.id}
                className={`neu tile-lg text-left ${form.tournamentIds.includes(t.id) ? "is-pressed" : ""}`}
                onClick={() => toggleT(t.id)}
              >
                <p className="tile-title">{t.name}</p>
                <p className="tile-sub">
                  {t.sport} · {t.venue || "Venue TBD"}
                </p>
              </button>
            ))}
            {!sportTournaments.length && <p className="text-sm">Create a {form.sport} tournament first to attach players.</p>}
          </div>
        </div>
        <div className="flex items-end gap-2">
          <Button
            variant="turf"
            onClick={() => {
              if (form.assignment === "team" && !form.teamId) return;
              const payload: any = {
                ...form,
                role: isCricket ? form.role : "Player"
              };
              if (form.basePriceCr === "" || form.basePriceCr == null) {
                // Empty means no base price — clear on save (registration players must not keep a default)
                payload.basePrice = null;
              } else {
                payload.basePrice = crToLakhs(form.basePriceCr);
              }
              emit("upsert-player", payload);
              setForm({ ...blank, categoryId: form.categoryId, sport: form.sport, role: isCricket ? "Batsman" : "Player" });
            }}
          >
            {form.id ? "Save player" : "Add player"}
          </Button>
          {form.id && form.basePriceCr !== "" && form.basePriceCr != null ? (
            <Button
              variant="danger"
              onClick={() => {
                emit("upsert-player", {
                  ...form,
                  role: isCricket ? form.role : "Player",
                  basePrice: null,
                  clearBasePrice: true
                });
                setForm({ ...form, basePriceCr: "" });
                setMsg("Base price cleared.");
              }}
            >
              Clear base price
            </Button>
          ) : null}
        </div>
        {form.id ? (
          <div className="md:col-span-3 space-y-3 rounded-xl p-3" style={{ background: "color-mix(in srgb, var(--accent) 8%, transparent)" }}>
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
              Merge / ACPL link
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <Select label="Merge another player into this one" value={mergeAbsorbId} onChange={(e) => setMergeAbsorbId(e.target.value)}>
                <option value="">Select duplicate to absorb…</option>
                {listedPlayers
                  .filter((p: any) => p.id !== form.id)
                  .map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.acplPlayerId ? ` · ACPL: ${p.acplName || "linked"}` : ""}
                    </option>
                  ))}
              </Select>
              <div className="flex items-end gap-2">
                <Button disabled={!mergeAbsorbId} onClick={mergeIntoSelected}>
                  Merge into this player
                </Button>
                <Button
                  onClick={async () => {
                    const res: any = await emit("dedupe-players");
                    setMsg(`Removed ${res.removed || 0} duplicate name(s).`);
                  }}
                >
                  Dedupe same names
                </Button>
              </div>
              <div className="md:col-span-2">
                <AcplLinkPicker
                  emit={emit}
                  playerId={form.id}
                  linkedAcplId={selectedLive?.acplPlayerId || null}
                  linkedAcplName={selectedLive?.acplName || null}
                  initialQuery={selectedLive?.acplName || form.name || ""}
                  acplPlayers={admin.acplHistory?.players || []}
                  onLinked={({ summary, acpl }) => {
                    setAcplPreview(summary);
                    setMsg(`Linked ACPL stats: ${acpl?.name || ""}`);
                  }}
                  onUnlinked={() => {
                    setAcplPreview(null);
                    setMsg("ACPL link removed.");
                  }}
                />
              </div>
            </div>
          </div>
        ) : null}
        {msg ? (
          <p className="md:col-span-3 text-sm" style={{ color: "var(--turf)" }}>
            {msg}
          </p>
        ) : null}
        <label className="text-xs md:col-span-3" style={{ color: "var(--muted)" }}>
          Bulk CSV: Name, Role, Sport, Category, Base Price (Cr), Team, Tournament, Photo URL
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            className="mt-2 block"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              await emit("bulk-players", { rows: await parseTableFile(file) });
            }}
          />
          <a className="mt-1 inline-block underline" href="/players-template.csv">
            Download template
          </a>
        </label>
      </Card>

      <Card className="space-y-3">
        <h3 className="font-display text-2xl">Bulk update selected</h3>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Select players in the table below, then apply playing type and/or base price.
        </p>
        <div className="grid gap-3 md:grid-cols-4">
          {isCricket ? (
            <Select label="Playing type" value={bulkRole} onChange={(e) => setBulkRole(e.target.value)}>
              <option value="">No change</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          ) : null}
          <Field
            label="Base price (crores)"
            value={bulkBaseCr}
            onChange={(e) => setBulkBaseCr(e.target.value)}
            placeholder="No change"
          />
          <div className="flex items-end gap-2 md:col-span-2">
            <Button disabled={!selectedIds.length || (!bulkRole && bulkBaseCr === "")} variant="turf" onClick={applyBulk}>
              Apply to {selectedIds.length || 0} selected
            </Button>
            <Button disabled={!selectedIds.length} variant="danger" onClick={clearBulkBase}>
              Clear base price
            </Button>
            <Button onClick={() => setSelectedIds(listedPlayers.map((p: any) => p.id))}>Select all</Button>
            <Button onClick={() => setSelectedIds([])}>Clear</Button>
          </div>
        </div>
      </Card>

      <div className="neu overflow-auto">
        <table className="w-full text-sm">
          <thead style={{ color: "var(--muted)" }}>
            <tr>
              <th className="px-3 py-3 text-left"> </th>
              {(isCricket
                ? ["Photo", "Name", "ACPL stats", "Sport", "Type", "Category", "Base", "Team", "Tournaments", ""]
                : ["Photo", "Name", "ACPL stats", "Sport", "Category", "Base", "Team", "Tournaments", ""]
              ).map((h, i) => (
                <th key={`${h || "actions"}-${i}`} className="px-4 py-3 text-left">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {listedPlayers.map((p: any) => (
              <tr key={p.id} className="border-t border-black/5">
                <td className="px-3 py-2">
                  <input type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => toggleSelect(p.id)} />
                </td>
                <td className="px-2 py-2">
                  <div
                    className="h-10 w-10 overflow-hidden rounded-lg"
                    style={{ background: "color-mix(in srgb, var(--ink) 6%, transparent)" }}
                  >
                    {p.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.photo} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[10px] font-bold" style={{ color: "var(--muted)" }}>
                        {String(p.name || "?")
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      className="text-left font-semibold"
                      onClick={() =>
                        setForm({
                          ...blank,
                          ...p,
                          sport: p.sport || "Cricket",
                          role: p.role || (String(p.sport || "").toLowerCase() === "cricket" ? "Batsman" : "Player"),
                          basePriceCr:
                            p.basePrice == null || p.basePrice === "" ? "" : String(lakhsToCr(p.basePrice)),
                          assignment: p.assignment || (p.teamId ? "team" : "auction"),
                          tournamentIds: p.tournamentIds || []
                        })
                      }
                    >
                      {p.name}
                    </button>
                    <Link href={`/admin/players/${p.id}`} className="text-xs underline" style={{ color: "var(--muted)" }}>
                      details
                    </Link>
                  </div>
                </td>
                <td className="px-4 py-2">
                  {p.acplPlayerId ? (
                    <p className="font-semibold" style={{ color: "var(--turf)" }}>
                      {p.acplName || "Linked"}
                    </p>
                  ) : (
                    <span style={{ color: "var(--muted)" }}>—</span>
                  )}
                </td>
                <td className="px-4 py-2">{p.sport || "Cricket"}</td>
                {isCricket ? <td className="px-4 py-2">{p.role}</td> : null}
                <td className="px-4 py-2">{admin.categories.find((c: any) => c.id === p.categoryId)?.name}</td>
                <td className="px-4 py-2">{inr(p.basePrice)}</td>
                <td className="px-4 py-2">
                  {p.assignment === "auction" || !p.teamId
                    ? "Through Auction"
                    : admin.teams.find((t: any) => t.id === p.teamId)?.name}
                </td>
                <td className="px-4 py-2">
                  {(p.tournamentIds || [])
                    .map((id: string) => admin.tournaments.find((t: any) => t.id === id)?.name)
                    .filter(Boolean)
                    .join(", ") || "—"}
                </td>
                <td className="px-4 py-2">
                  <Button variant="danger" onClick={() => emit("delete-player", { id: p.id })}>
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
            {!listedPlayers.length && (
              <tr>
                <td colSpan={isCricket ? 11 : 10} className="px-4 py-8 text-center" style={{ color: "var(--muted)" }}>
                  No {form.sport} players yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function TeamsPanel({ admin, emit }: any) {
  const blank = {
    id: "",
    name: "",
    color: "#2563EB",
    logo: "",
    sport: "Cricket",
    categoryId: admin.categories[0]?.id,
    playerIds: [] as string[],
    cricheroesShareUrl: ""
  };
  const [form, setForm] = useState(blank);
  const sameSport = (p: any) => String(p.sport || "Cricket").toLowerCase() === String(form.sport || "Cricket").toLowerCase();
  const players = admin.players.filter((p: any) => p.categoryId === form.categoryId && sameSport(p));

  const toggle = (id: string) =>
    setForm({
      ...form,
      playerIds: form.playerIds.includes(id) ? form.playerIds.filter((x) => x !== id) : [...form.playerIds, id]
    });

  return (
    <div className="space-y-4">
      <Card className="grid gap-3 md:grid-cols-3">
        <p className="md:col-span-3 text-xs" style={{ color: "var(--muted)" }}>
          Tag each team with a sport. Only players with the same sport and category can be added to the roster.
        </p>
        <Field label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Select
          label="Sport"
          value={form.sport}
          onChange={(e) => setForm({ ...form, sport: e.target.value, playerIds: [] })}
        >
          {SPORTS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Select
          label="Category"
          value={form.categoryId}
          onChange={(e) => setForm({ ...form, categoryId: e.target.value, playerIds: [] })}
        >
          {admin.categories.map((c: any) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <ColorSelect label="Team color" value={form.color} onChange={(v) => setForm({ ...form, color: v })} />
        <Field
          label="CricHeroes share URL"
          value={form.cricheroesShareUrl || ""}
          onChange={(e) => setForm({ ...form, cricheroesShareUrl: e.target.value })}
          placeholder="https://chshare.link/team/…"
        />
        <FilePick
          label="Team logo / photo"
          onData={async (dataUrl, file) => {
            const res: any = await emit("upload", { dataUrl, filename: file.name });
            setForm((f) => ({ ...f, logo: res.url }));
          }}
        />
        {form.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={form.logo} alt="" className="h-16 w-16 rounded-xl object-cover" />
        ) : null}
        <div className="md:col-span-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
            Players ({form.sport} · {admin.categories.find((c: any) => c.id === form.categoryId)?.name} only)
          </p>
          <div className="flex max-h-40 flex-wrap gap-2 overflow-auto">
            {players.map((p: any) => (
              <button
                key={p.id}
                className={`btn px-3 py-1 text-xs ${form.playerIds.includes(p.id) ? "is-pressed" : ""}`}
                onClick={() => toggle(p.id)}
              >
                {p.name}
              </button>
            ))}
            {!players.length && (
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                No matching players. Create {form.sport} players under Players first.
              </p>
            )}
          </div>
        </div>
        <Button
          variant="turf"
          onClick={() => {
            emit("upsert-team", form);
            setForm(blank);
          }}
        >
          {form.id ? "Save team" : "Add team"}
        </Button>
      </Card>
      <div className="grid gap-3 md:grid-cols-2">
        {admin.teams.map((t: any) => (
          <Card key={t.id} className="flex items-center justify-between gap-3">
            <Link href={`/admin/teams/${t.id}`} className="min-w-0 flex-1 text-left">
              <h3 className="font-display text-3xl" style={{ color: t.color }}>
                {t.name}
              </h3>
              <p className="text-sm">
                {t.sport || "Cricket"} · {admin.categories.find((c: any) => c.id === t.categoryId)?.name} · open roster →
              </p>
            </Link>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button
                onClick={() =>
                  setForm({
                    ...blank,
                    ...t,
                    sport: t.sport || "Cricket",
                    playerIds: Array.isArray(t.playerIds)
                      ? t.playerIds
                      : admin.players.filter((p: any) => p.teamId === t.id && p.assignment === "team").map((p: any) => p.id)
                  })
                }
              >
                Edit
              </Button>
              <Button variant="danger" onClick={() => emit("delete-team", { id: t.id })}>
                Delete
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function OwnersPanel({ admin, emit }: any) {
  const blank = {
    id: "",
    name: "",
    username: "",
    password: "",
    categoryId: admin.categories[0]?.id,
    teamId: "",
    retainedPlayerIds: [] as string[]
  };
  const [form, setForm] = useState(blank);
  const [q, setQ] = useState("");
  const teams = admin.teams.filter((t: any) => t.categoryId === form.categoryId);
  const players = admin.players.filter(
    (p: any) => p.categoryId === form.categoryId && p.name.toLowerCase().includes(q.toLowerCase())
  );

  const toggle = (id: string) =>
    setForm({
      ...form,
      retainedPlayerIds: form.retainedPlayerIds.includes(id)
        ? form.retainedPlayerIds.filter((x) => x !== id)
        : [...form.retainedPlayerIds, id]
    });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-3">
        <h2 className="font-display text-3xl">Owner login</h2>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Step 4: after tournament → auction → teams. Creates a user with role Owner for that team’s bidding.
        </p>
        {!admin.teams.length && <p style={{ color: "var(--crimson)" }}>Create a team first.</p>}
        <Field label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Field label="Login username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        <Field
          label={form.id ? "Password (leave blank to keep)" : "Login password"}
          type="password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <Select
          label="Team category"
          value={form.categoryId}
          onChange={(e) => setForm({ ...form, categoryId: e.target.value, teamId: "", retainedPlayerIds: [] })}
        >
          {admin.categories.map((c: any) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select label="Team" value={form.teamId} onChange={(e) => setForm({ ...form, teamId: e.target.value })}>
          <option value="">—</option>
          {teams.map((t: any) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
        <Field label="Search retained players" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="neu-inset max-h-48 overflow-auto p-3">
          {players.map((p: any) => (
            <label key={p.id} className="flex items-center gap-2 py-1 text-sm">
              <input type="checkbox" checked={form.retainedPlayerIds.includes(p.id)} onChange={() => toggle(p.id)} />
              {p.name} · base {inr(p.basePrice)} → retain {inr(p.basePrice * 2)}
            </label>
          ))}
        </div>
        <Button
          variant="turf"
          onClick={() => {
            emit("upsert-owner", form);
            setForm(blank);
          }}
        >
          {form.id ? "Save owner" : "Add owner"}
        </Button>
      </Card>
      <div className="space-y-3">
        {admin.owners.map((o: any) => (
          <Card key={o.id} className="flex items-start justify-between gap-3">
            <button
              className="text-left"
              onClick={() => {
                const team = admin.teams.find((t: any) => t.id === o.teamId);
                setForm({
                  ...blank,
                  ...o,
                  password: "",
                  retainedPlayerIds: (team?.retentions || []).map((r: any) => r.playerId)
                });
              }}
            >
              <h3 className="font-display text-3xl">{o.name}</h3>
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                @{o.username} · {admin.teams.find((t: any) => t.id === o.teamId)?.name}
              </p>
            </button>
            <Button variant="danger" onClick={() => emit("delete-owner", { id: o.id })}>
              Delete
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function AuctionsPanel({ admin, emit }: any) {
  const formRef = useRef<HTMLDivElement>(null);
  const auctionTournaments = admin.tournaments.filter((t: any) => t.hasAuction);
  const [id, setId] = useState("");
  const [name, setName] = useState("Friday Night Auction");
  const [code, setCode] = useState("");
  const [tournamentId, setTournamentId] = useState(auctionTournaments[0]?.id || "");
  const [categoryId, setCategoryId] = useState(admin.categories[0]?.id || "");
  const [purseCr, setPurseCr] = useState("120");
  const [denoms, setDenoms] = useState("6,8,10");
  const [minSquad, setMinSquad] = useState("5");
  const [maxSquad, setMaxSquad] = useState("8");
  const [sequence, setSequence] = useState("random");
  const [timerSeconds, setTimerSeconds] = useState("20");
  const [incRows, setIncRows] = useState(defaultIncrementRows());
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [playerIds, setPlayerIds] = useState<string[]>([]);
  const [maxByBase, setMaxByBase] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const editingId = useRef("");

  const applyRoster = (tid: string) => {
    const t = admin.tournaments.find((x: any) => x.id === tid);
    if (!t) return;
    const cat = t.categoryId || admin.categories[0]?.id;
    const sport = String(t.sport || "Cricket").toLowerCase();
    setCategoryId(cat);
    setTeamIds(
      (t.teamIds || []).filter((id: string) => {
        const tm = admin.teams.find((x: any) => x.id === id);
        return tm && tm.categoryId === cat && String(tm.sport || "Cricket").toLowerCase() === sport;
      })
    );
    setPlayerIds(
      admin.players
        .filter(
          (p: any) =>
            p.categoryId === cat &&
            String(p.sport || "Cricket").toLowerCase() === sport &&
            p.assignment !== "team"
        )
        .map((p: any) => p.id)
    );
  };

  useEffect(() => {
    if (id || !tournamentId) return;
    applyRoster(tournamentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tourSport = String(admin.tournaments.find((t: any) => t.id === tournamentId)?.sport || "Cricket").toLowerCase();
  const catTeams = admin.teams.filter(
    (t: any) => t.categoryId === categoryId && String(t.sport || "Cricket").toLowerCase() === tourSport
  );
  const poolPlayers = useMemo(() => {
    return admin.players.filter(
      (p: any) =>
        p.categoryId === categoryId &&
        String(p.sport || "Cricket").toLowerCase() === tourSport &&
        (p.assignment === "auction" || !p.assignment)
    );
  }, [admin.players, categoryId, tourSport]);

  const bases = useMemo(() => {
    const set = new Set<string>();
    for (const k of Object.keys(maxByBase)) {
      if (k && Number.isFinite(Number(k))) set.add(String(Number(k)));
    }
    for (const p of admin.players.filter((x: any) => x.categoryId === categoryId)) {
      if (p.basePrice != null && p.basePrice !== "") set.add(String(Number(p.basePrice)));
    }
    return Array.from(set).sort((a, b) => Number(a) - Number(b));
  }, [admin.players, categoryId, maxByBase]);

  const parseIncrements = () => rowsToIncrements(incRows);

  const blankForm = () => {
    editingId.current = "";
    setId("");
    setName("Friday Night Auction");
    setCode("");
    setPurseCr("120");
    setDenoms("6,8,10");
    setMinSquad("5");
    setMaxSquad("8");
    setSequence("random");
    setTimerSeconds("20");
    setIncRows(defaultIncrementRows());
    setMaxByBase({});
    setErr("");
    setNote("New auction");
    if (tournamentId) applyRoster(tournamentId);
  };

  const save = async () => {
    try {
      setErr("");
      setNote("");
      if (!tournamentId) throw new Error("Create a tournament first");
      const auctionId = id || editingId.current || undefined;
      const res: any = await emit("upsert-auction", {
        id: auctionId,
        code,
        name,
        tournamentId,
        categoryId,
        purse: crToLakhs(purseCr),
        denominators: denoms
          .split(/[,\s]+/)
          .map((d) => crToLakhs(d))
          .filter(Boolean),
        minSquad,
        maxSquad,
        sequence,
        timerSeconds,
        teamIds,
        playerIds: playerIds.length ? playerIds : poolPlayers.map((p: any) => p.id),
        increments: parseIncrements(),
        minByCategory: {},
        maxByBasePrice: Object.fromEntries(
          bases.map((b) => [b, Number(maxByBase[b] === "" || maxByBase[b] == null ? 4 : maxByBase[b])])
        )
      });
      const saved =
        res?.admin?.auctions?.find((a: any) => a.id === auctionId) ||
        res?.admin?.auctions?.find((a: any) => String(a.code).toUpperCase() === String(code).toUpperCase()) ||
        res?.admin?.auctions?.[res.admin.auctions.length - 1];
      if (saved?.id) {
        editingId.current = saved.id;
        setId(saved.id);
        if (saved.code) setCode(saved.code);
      }
      setNote(auctionId || saved?.id ? "Auction saved." : "Auction created.");
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const loadAuction = (a: any) => {
    editingId.current = a.id;
    setId(a.id);
    setName(a.name);
    setCode(a.code || "");
    setTournamentId(a.tournamentId || auctionTournaments[0]?.id || "");
    setCategoryId(a.categoryId || admin.categories[0]?.id);
    setPurseCr(String(lakhsToCr(a.purse)));
    setDenoms((a.denominators || []).map((d: number) => lakhsToCr(d)).join(","));
    setMinSquad(String(a.minSquad));
    setMaxSquad(String(a.maxSquad));
    setSequence(a.sequence || "random");
    setTimerSeconds(String(a.timerSeconds || 20));
    setTeamIds(a.teamIds || []);
    setPlayerIds(a.playerIds || []);
    setMaxByBase(
      Object.fromEntries(Object.entries(a.maxByBasePrice || {}).map(([k, v]) => [String(Number(k)), String(v)]))
    );
    setIncRows(incrementsToRows(a.increments));
    setErr("");
    setNote(`Editing ${a.name}`);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const startLive = async (auctionId: string) => {
    try {
      setErr("");
      setNote("");
      await emit("start-auction", { auctionId });
      setNote("Live auction started. Open Auctioneer from the lobby.");
    } catch (e: any) {
      setErr(e.message || "Could not start auction");
    }
  };

  if (!auctionTournaments.length) {
    return (
      <Card>
        <h2 className="font-display text-3xl">Create a tournament first</h2>
        <p className="mt-2" style={{ color: "var(--muted)" }}>
          Auctions can only be created for tournaments with Auction = Yes.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4" ref={formRef}>
      <Card className="grid gap-3 md:grid-cols-3">
        {err && (
          <p className="md:col-span-3 font-semibold" style={{ color: "var(--crimson)" }}>
            {err}
          </p>
        )}
        {note && (
          <p className="md:col-span-3 font-semibold" style={{ color: "var(--aqua)" }}>
            {note}
          </p>
        )}
        <div className="md:col-span-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-3xl">{id ? "Edit auction" : "Create auction"}</h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="turf" onClick={() => save()}>
              {id ? "Save auction" : "Create auction"}
            </Button>
            {id ? <Button onClick={blankForm}>New auction</Button> : null}
          </div>
        </div>
        <p className="md:col-span-3 text-xs" style={{ color: "var(--muted)" }}>
          {id
            ? "You are editing an existing auction. Save writes to the same record — it will not create a duplicate."
            : "Pick a tournament. Its category, added teams, and every player in that category are loaded into this auction."}
        </p>
        <Field label="Auction name" value={name} onChange={(e) => setName(e.target.value)} />
        <Field label="Join code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="auto" />
        <Select
          label="Tournament"
          value={tournamentId}
          onChange={(e) => {
            setTournamentId(e.target.value);
            applyRoster(e.target.value);
          }}
        >
          {auctionTournaments.map((t: any) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
        <Field
          label="Category"
          value={admin.categories.find((c: any) => c.id === categoryId)?.name || ""}
          readOnly
        />
        <Field label="Total purse per team (crores)" value={purseCr} onChange={(e) => setPurseCr(e.target.value)} />
        <Field label="Max-bid denominators (cr, comma)" value={denoms} onChange={(e) => setDenoms(e.target.value)} />
        <Field label="Timer seconds" value={timerSeconds} onChange={(e) => setTimerSeconds(e.target.value)} />
        <Field label="Min squad" value={minSquad} onChange={(e) => setMinSquad(e.target.value)} />
        <Field label="Max players per team" value={maxSquad} onChange={(e) => setMaxSquad(e.target.value)} />
        <Select label="Shuffle" value={sequence} onChange={(e) => setSequence(e.target.value)}>
          <option value="random">Random shuffle</option>
          <option value="category">Category-wise shuffle</option>
        </Select>
        <div className="md:col-span-3 space-y-3">
          <p className="text-sm font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
            Bid increments — range in crores, step in lakhs
          </p>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Example: 6 Cr–8 Cr → ₹20 L, 8 Cr–10 Cr → ₹25 L, above 10 Cr → ₹50 L. Leave “To” blank for “and above”.
          </p>
          {incRows.map((row, i) => (
            <div key={i} className="grid gap-2 md:grid-cols-4">
              <Field
                label="From (Cr)"
                value={row.fromCr}
                onChange={(e) => {
                  const next = [...incRows];
                  next[i] = { ...row, fromCr: e.target.value };
                  setIncRows(next);
                }}
              />
              <Field
                label="To (Cr) — blank = above"
                value={row.toCr}
                onChange={(e) => {
                  const next = [...incRows];
                  next[i] = { ...row, toCr: e.target.value };
                  setIncRows(next);
                }}
              />
              <Field
                label="Increment (Lakhs)"
                value={row.stepL}
                onChange={(e) => {
                  const next = [...incRows];
                  next[i] = { ...row, stepL: e.target.value };
                  setIncRows(next);
                }}
              />
              <div className="flex items-end">
                <Button
                  onClick={() => setIncRows(incRows.filter((_, j) => j !== i))}
                  disabled={incRows.length < 2}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
          <Button onClick={() => setIncRows([...incRows, { fromCr: "", toCr: "", stepL: "20" }])}>Add range</Button>
        </div>
        <div className="md:col-span-3 grid gap-3 md:grid-cols-3">
          <p className="md:col-span-3 text-sm font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
            Max players at each base price
          </p>
          {bases.map((b) => (
            <Field
              key={b}
              type="number"
              min={0}
              inputMode="numeric"
              label={`Max players at base ${inr(Number(b))}`}
              value={maxByBase[b] ?? "4"}
              onChange={(e) => setMaxByBase({ ...maxByBase, [b]: e.target.value })}
            />
          ))}
          {!bases.length && (
            <p className="md:col-span-3 text-xs" style={{ color: "var(--muted)" }}>
              Add players (same category) to this tournament to generate base-price slot fields.
            </p>
          )}
        </div>
        <div className="md:col-span-3">
          <p className="mb-2 text-[11px] uppercase" style={{ color: "var(--muted)" }}>
            {admin.categories.find((c: any) => c.id === categoryId)?.name} teams
          </p>
          <div className="flex flex-wrap gap-2">
            {catTeams.map((t: any) => (
              <button
                key={t.id}
                className={`btn px-3 py-1 text-sm ${teamIds.includes(t.id) ? "is-pressed" : ""}`}
                onClick={() => setTeamIds(teamIds.includes(t.id) ? teamIds.filter((x) => x !== t.id) : [...teamIds, t.id])}
              >
                {t.name}
              </button>
            ))}
            {!catTeams.length && <span className="text-sm">No teams in this category yet — you can still save the auction.</span>}
          </div>
        </div>
        <div className="md:col-span-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] uppercase" style={{ color: "var(--muted)" }}>
              Players in pool ({playerIds.length || poolPlayers.length})
            </p>
            <Button onClick={() => setPlayerIds(poolPlayers.map((p: any) => p.id))}>Select all</Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {poolPlayers.map((p: any) => (
              <button
                key={p.id}
                className={`btn px-2 py-1 text-xs ${
                  (playerIds.length ? playerIds : poolPlayers.map((x: any) => x.id)).includes(p.id) ? "is-pressed" : ""
                }`}
                onClick={() => {
                  const cur = playerIds.length ? playerIds : poolPlayers.map((x: any) => x.id);
                  setPlayerIds(cur.includes(p.id) ? cur.filter((x: string) => x !== p.id) : [...cur, p.id]);
                }}
              >
                {p.name} · {inr(p.basePrice)}
              </button>
            ))}
          </div>
        </div>
        <div className="md:col-span-3 flex flex-wrap gap-2">
          <Button variant="turf" onClick={() => save()}>
            {id ? "Save auction" : "Create auction"}
          </Button>
          {id ? <Button onClick={blankForm}>New auction</Button> : null}
        </div>
      </Card>
      {admin.auctions.map((a: any) => (
        <Card key={a.id} className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-3xl">{a.name}</h3>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Code {a.code} · {a.status} · {admin.categories.find((c: any) => c.id === a.categoryId)?.name} · purse{" "}
              {inr(a.purse)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => loadAuction(a)}>Edit</Button>
            <Button variant="lime" onClick={() => startLive(a.id)}>
              Start / reset live
            </Button>
            {(a.status === "completed" || a.status === "live") && (
              <Link className="btn btn-ghost px-5 py-2.5 text-sm" href={`/admin/schedule/${a.id}`}>
                Schedule
              </Link>
            )}
            <Button variant="danger" onClick={() => emit("delete-auction", { id: a.id })}>
              Delete
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

export function UsersPanel({ admin, emit, staff }: any) {
  const blank = { id: "", name: "", username: "", password: "", role: "admin", teamId: "" };
  const [form, setForm] = useState(blank);
  if (staff !== "super") {
    return (
      <Card>
        <h2 className="font-display text-3xl">Users</h2>
        <p className="mt-2">Only Super Admin can create logins and assign roles.</p>
      </Card>
    );
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-3">
        <h2 className="font-display text-3xl">{form.id ? "Edit user" : "Create user"}</h2>
        <Field label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Field label="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        <Field
          label={form.id ? "Password (blank = keep)" : "Password"}
          type="password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <Select label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value, teamId: "" })}>
          <option value="admin">Admin</option>
          <option value="auctioneer">Auctioneer</option>
          <option value="owner">Team owner</option>
        </Select>
        {form.role === "owner" && (
          <Select label="Team" value={form.teamId} onChange={(e) => setForm({ ...form, teamId: e.target.value })}>
            <option value="">Select team</option>
            {admin.teams.map((t: any) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        )}
        <div className="flex gap-2">
          <Button
            variant="turf"
            onClick={() => emit("upsert-user", form).then(() => setForm(blank))}
          >
            {form.id ? "Save user" : "Create user"}
          </Button>
          {form.id && <Button onClick={() => setForm(blank)}>Clear</Button>}
        </div>
      </Card>
      <div className="space-y-3">
        {(admin.users || []).map((u: any) => (
          <Card key={u.id} className="flex items-center justify-between gap-3">
            <button
              className="text-left"
              disabled={u.role === "super"}
              onClick={() => setForm({ ...blank, ...u, password: "" })}
            >
              <h3 className="font-display text-3xl">{u.username}</h3>
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                {u.name} · {u.role === "owner" ? "Team owner" : u.role}
                {u.teamId ? ` · ${admin.teams.find((t: any) => t.id === u.teamId)?.name || ""}` : ""}
              </p>
            </button>
            {u.role !== "super" && (
              <Button variant="danger" onClick={() => emit("delete-user", { id: u.id })}>
                Delete
              </Button>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

export function SettingsPanel({ staff, admin, emit }: any) {
  const liveBidding = admin?.meta?.liveBidding === true;
  const toggleLive = async () => {
    await emit("set-live-bidding", { enabled: !liveBidding });
  };
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Card className="space-y-3">
        <h2 className="font-display text-3xl">Bidding mode</h2>
        <p style={{ color: "var(--muted)" }}>
          Manual (default): the auctioneer records sold/unsold and bids from the hammer desk. Owners watch the same board as
          spectators. Live: owners see bid paddles and can raise from their dashboard.
        </p>
        <div className="flex items-center justify-between gap-4 rounded-2xl bg-canvas px-4 py-3">
          <div>
            <p className="font-semibold">{liveBidding ? "Live bidding" : "Manual bidding"}</p>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              {liveBidding ? "Owners can place bids." : "Owners watch only. Auctioneer desk is unchanged."}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={liveBidding}
            onClick={toggleLive}
            className="relative h-8 w-14 shrink-0 rounded-full transition-colors"
            style={{
              background: liveBidding ? "var(--lime, #84cc16)" : "var(--line, #cbd5e1)"
            }}
          >
            <span
              className="absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-[left]"
              style={{ left: liveBidding ? 28 : 4 }}
            />
          </button>
        </div>
      </Card>
      <Card className="space-y-3">
        <h2 className="font-display text-3xl">Account</h2>
        <p>Signed in as {staff}. Logins no longer use PINs.</p>
        <p style={{ color: "var(--muted)" }}>
          Super Admin creates Admin, Auctioneer, and Team owner accounts from the Users tab. Auction codes are created by Super
          Admin, Admin, and Auctioneer.
        </p>
      </Card>
    </div>
  );
}
