"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAdmin } from "@/components/admin/AdminGate";
import { Button, Card, Field } from "@/components/ui";

function localInputValue(iso?: string) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function SchedulePage() {
  const params = useParams<{ auctionId: string }>();
  const { admin, emit } = useAdmin();
  const auction = admin.auctions.find((a: any) => a.id === params.auctionId || a.code === params.auctionId);
  const teams = useMemo(() => {
    if (!auction) return [];
    return (auction.teamIds || []).map((id: string) => admin.teams.find((t: any) => t.id === id)).filter(Boolean);
  }, [admin.teams, auction]);

  const [groups, setGroups] = useState<any[]>(() =>
    auction?.groups?.length
      ? auction.groups.map((g: any) => ({ ...g, teamIds: [...(g.teamIds || [])] }))
      : [{ id: "g1", name: "Group A", teamIds: [] }]
  );
  const [matchMinutes, setMatchMinutes] = useState(String(auction?.fixture?.matchMinutes || 40));
  const [startAt, setStartAt] = useState(localInputValue(auction?.fixture?.startAt));
  const [noBackToBack, setNoBackToBack] = useState(auction?.fixture?.noBackToBack !== false);
  const [equalRest, setEqualRest] = useState(auction?.fixture?.equalRest !== false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");

  if (!auction) {
    return (
      <Card>
        <p>Auction not found.</p>
        <Link className="btn btn-ghost mt-3 inline-block px-4 py-2 text-sm" href="/admin/auctions">
          ← Back
        </Link>
      </Card>
    );
  }

  const used = new Set(groups.flatMap((g) => g.teamIds || []));
  const unused = teams.filter((t: any) => !used.has(t.id));
  const fixture = auction.fixture;

  const saveGroups = async () => {
    try {
      setErr("");
      await emit("save-auction-groups", { auctionId: auction.id, groups });
      setNote("Groups saved.");
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const randomizeGroups = () => {
    const ids = teams.map((t: any) => t.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    const n = Math.max(1, groups.length);
    const next = Array.from({ length: n }, (_, i) => ({
      id: groups[i]?.id || `g${i + 1}`,
      name: groups[i]?.name || `Group ${String.fromCharCode(65 + i)}`,
      teamIds: [] as string[]
    }));
    ids.forEach((id: string, i: number) => next[i % n].teamIds.push(id));
    setGroups(next);
    setNote(`Randomly assigned ${ids.length} teams into ${n} group${n === 1 ? "" : "s"}. Save groups to keep.`);
  };

  const generate = async () => {
    try {
      setErr("");
      setNote("");
      await emit("save-auction-groups", { auctionId: auction.id, groups });
      await emit("generate-schedule", {
        auctionId: auction.id,
        matchMinutes: Number(matchMinutes) || 40,
        noBackToBack,
        equalRest,
        startAt: startAt ? new Date(startAt).toISOString() : new Date().toISOString(),
        force: auction.status !== "completed"
      });
      setNote("Schedule generated.");
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const teamName = (id: string) => admin.teams.find((t: any) => t.id === id)?.name || id;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-5xl">Match schedule</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {auction.name} · {auction.status} · {teams.length} teams
        </p>
      </div>
      {err && <p style={{ color: "var(--crimson)" }}>{err}</p>}
      {note && <p style={{ color: "var(--aqua)" }}>{note}</p>}

      <Card className="space-y-3">
        <h2 className="font-display text-3xl">Groups</h2>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Split auction teams into groups, then generate fixtures. Unused teams stay out of the schedule.
        </p>
        {groups.map((g, gi) => (
          <div key={g.id} className="rounded-2xl bg-canvas p-3">
            <div className="mb-2 flex flex-wrap items-end gap-2">
              <Field
                label="Group name"
                value={g.name}
                onChange={(e) => {
                  const next = [...groups];
                  next[gi] = { ...g, name: e.target.value };
                  setGroups(next);
                }}
              />
              <Button
                variant="danger"
                onClick={() => setGroups(groups.filter((_, i) => i !== gi))}
                disabled={groups.length < 2}
              >
                Remove group
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {teams.map((t: any) => {
                const on = g.teamIds.includes(t.id);
                const blocked = !on && used.has(t.id);
                return (
                  <button
                    key={t.id}
                    disabled={blocked}
                    className={`btn px-3 py-1 text-sm ${on ? "is-pressed" : ""}`}
                    onClick={() => {
                      const next = [...groups];
                      const ids = on ? g.teamIds.filter((x: string) => x !== t.id) : [...g.teamIds, t.id];
                      next[gi] = { ...g, teamIds: ids };
                      setGroups(next);
                    }}
                  >
                    {t.name}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() =>
              setGroups([...groups, { id: `g${Date.now()}`, name: `Group ${String.fromCharCode(65 + groups.length)}`, teamIds: [] }])
            }
          >
            Add group
          </Button>
          <Button variant="lime" onClick={randomizeGroups} disabled={teams.length < 2}>
            Randomize teams into groups
          </Button>
          {unused.length > 0 && (
            <Button
              onClick={() => {
                const next = [...groups];
                next[0] = { ...next[0], teamIds: [...next[0].teamIds, ...unused.map((t: any) => t.id)] };
                setGroups(next);
              }}
            >
              Dump unused into first group
            </Button>
          )}
          <Button variant="turf" onClick={saveGroups}>
            Save groups
          </Button>
        </div>
      </Card>

      <Card className="grid gap-3 md:grid-cols-3">
        <h2 className="font-display md:col-span-3 text-3xl">Constraints</h2>
        <Field label="Minutes per match" value={matchMinutes} onChange={(e) => setMatchMinutes(e.target.value)} />
        <Field label="First match start" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
        <label className="flex items-center gap-2 text-sm md:col-span-3">
          <input type="checkbox" checked={noBackToBack} onChange={(e) => setNoBackToBack(e.target.checked)} />
          No back-to-back matches for the same team (when possible)
        </label>
        <label className="flex items-center gap-2 text-sm md:col-span-3">
          <input type="checkbox" checked={equalRest} onChange={(e) => setEqualRest(e.target.checked)} />
          Spread rest evenly between matches for each team
        </label>
        <div className="md:col-span-3">
          <Button variant="lime" onClick={generate}>
            Generate schedule
          </Button>
        </div>
      </Card>

      <Card className="overflow-auto p-0">
        <div className="px-4 py-3">
          <h2 className="font-display text-3xl">Fixture · {fixture?.matches?.length || 0} matches</h2>
        </div>
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-[color-mix(in_srgb,var(--ink)_12%,transparent)] text-[11px] uppercase tracking-wider" style={{ color: "var(--muted)" }}>
              <th className="px-4 py-2">#</th>
              <th className="px-4 py-2">When</th>
              <th className="px-4 py-2">Home</th>
              <th className="px-4 py-2">Away</th>
              <th className="px-4 py-2">Group</th>
            </tr>
          </thead>
          <tbody>
            {(fixture?.matches || []).map((m: any) => (
              <tr key={m.id} className="border-b border-[color-mix(in_srgb,var(--ink)_8%,transparent)]">
                <td className="px-4 py-2">{m.order + 1}</td>
                <td className="px-4 py-2">{m.startAt ? new Date(m.startAt).toLocaleString() : "—"}</td>
                <td className="px-4 py-2 font-semibold">{teamName(m.homeId)}</td>
                <td className="px-4 py-2 font-semibold">{teamName(m.awayId)}</td>
                <td className="px-4 py-2">
                  {(auction.groups || groups).find((g: any) => g.id === m.groupId)?.name || "—"}
                </td>
              </tr>
            ))}
            {!(fixture?.matches || []).length && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center" style={{ color: "var(--muted)" }}>
                  No fixture yet. Save groups and generate.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
