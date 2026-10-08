"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card, Field, FilePick, Select } from "@/components/ui";
import { DynamicForm } from "@/components/registration/DynamicForm";
import { AcplLinkPicker } from "@/components/admin/AcplLinkPicker";
import { useApp } from "@/components/Providers";
import { groupRegistrationsByAuctionTeam } from "@/lib/auction-teams.mjs";

const TABS = ["Dashboard", "Form builder", "Settings", "Preview", "Registrations", "Auction teams", "Waiting list"] as const;

const FIELD_TYPES = [
  "text",
  "paragraph",
  "number",
  "phone",
  "email",
  "date",
  "dropdown",
  "single",
  "yesno",
  "file",
  "image",
  "url",
  "info"
];

/**
 * Probe the URL admins are about to share. PUBLIC_URL can name a port the server
 * does not actually answer on, which leaves the app healthy on its own port while
 * every shared link times out — invisible from the admin screens otherwise.
 */
function usePublicUrlReachable(baseUrl: string, publicPath: string | undefined, enabled: boolean) {
  const [state, setState] = useState<"idle" | "checking" | "ok" | "unreachable">("idle");

  useEffect(() => {
    if (!enabled || !baseUrl || !publicPath || typeof window === "undefined") {
      setState("idle");
      return;
    }
    if (baseUrl === window.location.origin) {
      setState("ok");
      return;
    }
    let cancelled = false;
    const ctl = new AbortController();
    const timer = window.setTimeout(() => ctl.abort(), 8000);
    setState("checking");
    // Any HTTP reply proves the port answers; the status itself does not matter.
    fetch(`${baseUrl}/api/public/register/${encodeURIComponent(publicPath)}`, { signal: ctl.signal })
      .then(() => !cancelled && setState("ok"))
      .catch(() => !cancelled && setState("unreachable"))
      .finally(() => window.clearTimeout(timer));
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      ctl.abort();
    };
  }, [baseUrl, publicPath, enabled]);

  return state;
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="neu-sm px-4 py-3">
      <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--muted)" }}>
        {label}
      </p>
      <p className="font-display text-3xl">{value}</p>
    </div>
  );
}

const DONUT_COLORS = ["#2563EB", "#F97316", "#10B981", "#E11D48", "#7C3AED", "#0E7490", "#CA8A04", "#64748B"];

function DonutChart({
  title,
  segments
}: {
  title: string;
  segments: { label: string; value: number }[];
}) {
  const total = segments.reduce((s, x) => s + (Number(x.value) || 0), 0);
  const r = 56;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const arcs =
    total > 0
      ? segments.map((seg, i) => {
          const v = Number(seg.value) || 0;
          const len = (v / total) * c;
          const stroke = DONUT_COLORS[i % DONUT_COLORS.length];
          const el = (
            <circle
              key={seg.label}
              cx="80"
              cy="80"
              r={r}
              fill="none"
              stroke={stroke}
              strokeWidth="28"
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 80 80)"
            />
          );
          offset += len;
          return el;
        })
      : [
          <circle
            key="empty"
            cx="80"
            cy="80"
            r={r}
            fill="none"
            stroke="color-mix(in srgb, var(--ink) 12%, transparent)"
            strokeWidth="28"
          />
        ];

  return (
    <div className="space-y-3">
      <h3 className="font-display text-2xl">{title}</h3>
      <div className="flex flex-wrap items-center gap-4">
        <svg width="160" height="160" viewBox="0 0 160 160" aria-hidden>
          {arcs}
          <circle cx="80" cy="80" r="36" fill="var(--neu-bg)" />
          <text x="80" y="86" textAnchor="middle" fontSize="18" fontWeight="700" fill="var(--ink)">
            {total}
          </text>
        </svg>
        <div className="min-w-[140px] space-y-1 text-sm">
          {segments.length ? (
            segments.map((seg, i) => (
              <div key={seg.label} className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }}
                  />
                  {seg.label}
                </span>
                <strong>{seg.value}</strong>
              </div>
            ))
          ) : (
            <p style={{ color: "var(--muted)" }}>No data yet</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function RegistrationPanel({ admin, emit }: any) {
  const { hello } = useApp();
  const forms = admin.registration?.forms || [];
  const tournaments = admin.tournaments || [];
  const [tournamentId, setTournamentId] = useState(tournaments[0]?.id || "");
  const [tab, setTab] = useState<(typeof TABS)[number]>("Dashboard");
  const [dashboard, setDashboard] = useState<any>(null);
  const [selectedReg, setSelectedReg] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: "sequence", dir: 1 });
  const [search, setSearch] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<any>(null);
  const [selectedFieldKey, setSelectedFieldKey] = useState("");

  const form = useMemo(() => forms.find((f: any) => f.tournamentId === tournamentId) || null, [forms, tournamentId]);

  useEffect(() => {
    if (!tournamentId && tournaments[0]?.id) setTournamentId(tournaments[0].id);
  }, [tournaments, tournamentId]);

  useEffect(() => {
    if (form) {
      const tour = tournaments.find((t: any) => t.id === form.tournamentId);
      const next = JSON.parse(JSON.stringify(form));
      if (!next.logo && tour?.logo) next.logo = tour.logo;
      setDraft(next);
      setSelectedFieldKey(form.fields?.[0]?.key || "");
    } else {
      setDraft(null);
    }
  }, [form?.id, form?.updatedAt, form?.logo, tournamentId]);

  useEffect(() => {
    if (!form?.id || tab !== "Dashboard") return;
    emit("reg-dashboard", { formId: form.id }).then((res: any) => {
      if (res.ok) setDashboard(res.dashboard);
    });
  }, [form?.id, tab, admin.registration?.registrations?.length]);

  // Keep selected registration in sync with admin-state (e.g. after ACPL link)
  useEffect(() => {
    if (!selectedReg?.id) return;
    const next = (admin.registration?.registrations || []).find((r: any) => r.id === selectedReg.id);
    if (!next) return;
    if (
      next.acplPlayerId !== selectedReg.acplPlayerId ||
      next.acplName !== selectedReg.acplName ||
      next.playerId !== selectedReg.playerId ||
      next.status !== selectedReg.status ||
      next.paymentStatus !== selectedReg.paymentStatus ||
      next.basePrice !== selectedReg.basePrice
    ) {
      setSelectedReg(next);
    }
  }, [admin.registration?.registrations, selectedReg]);

  const linkedAuctionPlayer = useMemo(() => {
    if (!selectedReg?.playerId) return null;
    return (admin.players || []).find((p: any) => p.id === selectedReg.playerId) || null;
  }, [admin.players, selectedReg?.playerId]);

  const formRegs = useMemo(
    () => (admin.registration?.registrations || []).filter((r: any) => r.formId === form?.id),
    [admin.registration, form?.id]
  );

  // Every category the form offers, plus any already used by a registration.
  const categoryOptions = useMemo(() => {
    const fromField = (form?.fields || []).find((f: any) => f.key === "category")?.options || [];
    const declared = [...fromField, ...Object.keys(form?.categoryCapacity || {})];
    const used = formRegs.map((r: any) => r.category || r.values?.category);
    const out: string[] = [];
    for (const raw of [...declared, ...used]) {
      const value = String(raw || "").trim();
      if (value && !out.includes(value)) out.push(value);
    }
    return out;
  }, [form?.fields, form?.categoryCapacity, formRegs]);

  const regs = useMemo(() => {
    const sortValue = (r: any) => {
      switch (sort.key) {
        case "registrationId":
          return String(r.registrationId || "");
        case "playerName":
          return String(r.playerName || r.values?.playerName || "").toLowerCase();
        case "category":
          return String(r.category || r.values?.category || "").toLowerCase();
        case "status":
          return String(r.status || "");
        case "paymentStatus":
          return String(r.paymentStatus || "");
        default:
          return Number(r.categorySequence || r.sequence || 0);
      }
    };
    return formRegs
      .filter((r: any) => !filterStatus || r.status === filterStatus)
      .filter((r: any) => !filterCategory || (r.category || r.values?.category) === filterCategory)
      .filter((r: any) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          String(r.registrationId).toLowerCase().includes(q) ||
          String(r.playerName || r.values?.playerName || "")
            .toLowerCase()
            .includes(q) ||
          String(r.mobile || r.values?.mobile || "").includes(q)
        );
      })
      .sort((a: any, b: any) => {
        const va = sortValue(a);
        const vb = sortValue(b);
        let cmp =
          typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
        // Ties read naturally when they stay in registration-number order.
        if (cmp === 0) {
          cmp = Number(a.categorySequence || a.sequence || 0) - Number(b.categorySequence || b.sequence || 0);
        }
        return cmp * sort.dir;
      });
  }, [formRegs, filterStatus, filterCategory, search, sort]);

  // Independent of the Registrations tab filters — this drives the Waiting list tab.
  const waiting = useMemo(
    () =>
      formRegs
        .filter((r: any) => r.status === "waiting")
        .sort((a: any, b: any) => (a.waitingPosition || 0) - (b.waitingPosition || 0)),
    [formRegs]
  );

  const auctionTeamGroups = useMemo(() => {
    const all = (admin.registration?.registrations || []).filter((r: any) => r.formId === form?.id);
    const teamField = (form?.fields || draft?.fields || []).find((f: any) => f.key === "auctionTeam");
    const optionOrder: string[] = Array.isArray(teamField?.options) ? [...teamField.options] : [];
    return groupRegistrationsByAuctionTeam(all, { teamOptions: optionOrder }).map(({ team, players: raw }) => {
      const players = raw.slice().sort((a: any, b: any) => {
        const an = String(a.playerName || a.values?.playerName || "").toLowerCase();
        const bn = String(b.playerName || b.values?.playerName || "").toLowerCase();
        return an.localeCompare(bn);
      });
      const tourTeam = (admin.teams || []).find(
        (t: any) => String(t.name || "").toLowerCase() === String(team).toLowerCase()
      );
      return {
        team,
        logo: tourTeam?.logo || "",
        color: tourTeam?.color || "",
        players: players.map((r: any) => {
          const linked = (admin.players || []).find((p: any) => p.id === r.playerId);
          return {
            ...r,
            photo: linked?.photo || "",
            displayName: r.playerName || r.values?.playerName || "—",
            category: r.category || r.values?.category || "—",
            mobile: r.mobile || r.values?.mobile || ""
          };
        })
      };
    });
  }, [admin.registration, admin.players, admin.teams, form?.id, form?.fields, draft?.fields]);

  const baseUrl = hello?.appUrl || (typeof window !== "undefined" ? window.location.origin : "");
  const publicPath = form?.publicSlug || form?.publicToken;
  const publicUrl = publicPath ? `${baseUrl}/register/${publicPath}` : "";
  // This page loaded from here, so this origin is reachable by definition.
  const fallbackUrl = publicPath && typeof window !== "undefined" ? `${window.location.origin}/register/${publicPath}` : "";
  const linkReach = usePublicUrlReachable(baseUrl, publicPath, tab === "Settings");

  const refreshAdmin = (res: any) => {
    if (res?.admin) {
      // AdminGate listens to admin-state; also merge via emit login path — socket wrap returns admin
    }
    if (!res?.ok) throw new Error(res?.error || "Failed");
    return res;
  };

  const createForm = async (template: string) => {
    setBusy(true);
    setMsg("");
    try {
      const res = await emit("reg-create-form", { tournamentId, template });
      refreshAdmin(res);
      setMsg("Registration form created");
      setTab("Settings");
    } catch (e: any) {
      setMsg(e.message || "Could not create form");
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = async () => {
    if (!draft) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await emit("reg-upsert-form", { ...draft, bumpVersion: true });
      refreshAdmin(res);
      setMsg("Form saved");
    } catch (e: any) {
      setMsg(e.message || "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (status: string) => {
    if (!form) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await emit("reg-set-status", { formId: form.id, status });
      refreshAdmin(res);
      setMsg(`Form marked ${status}`);
    } catch (e: any) {
      setMsg(e.message || "Status change failed");
    } finally {
      setBusy(false);
    }
  };

  const deleteCurrentForm = async () => {
    if (!form) return;
    const regCount = (admin.registration?.registrations || []).filter((r: any) => r.formId === form.id).length;
    const ok = window.confirm(
      regCount
        ? `Delete this registration form and ${regCount} registration(s)?\nYou can create a new form afterward.`
        : "Delete this registration form?\nYou can create a new form afterward."
    );
    if (!ok) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await emit("reg-delete-form", { formId: form.id, force: regCount > 0 });
      if (!res.ok) throw new Error(res.error || "Delete failed");
      setDraft(null);
      setSelectedReg(null);
      setDashboard(null);
      setMsg("Form deleted — create a new one below");
      setTab("Dashboard");
    } catch (e: any) {
      setMsg(e.message || "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  const recreateCurrentForm = async (template: string) => {
    if (!tournamentId) return;
    const regCount = form
      ? (admin.registration?.registrations || []).filter((r: any) => r.formId === form.id).length
      : 0;
    const ok = window.confirm(
      regCount
        ? `Replace the current form with a ${template === "blank" ? "blank" : "ACPL"} template and remove ${regCount} registration(s)?`
        : `Replace the current form with a ${template === "blank" ? "blank" : "ACPL"} template?`
    );
    if (!ok) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await emit("reg-recreate-form", { tournamentId, template, force: true });
      if (!res.ok) throw new Error(res.error || "Recreate failed");
      setMsg("Form recreated");
      setTab("Settings");
    } catch (e: any) {
      setMsg(e.message || "Recreate failed");
    } finally {
      setBusy(false);
    }
  };

  const updateRegStatus = async (registrationId: string, status: string, confirmPromote = false) => {
    if (status === "registered") {
      const ok = window.confirm(
        `Are you sure you want to promote ${registrationId}?\nThis will assign the player an active tournament slot.`
      );
      if (!ok) return;
      confirmPromote = true;
    }
    const res = await emit("reg-update-status", { registrationId, status, confirmPromote });
    if (!res.ok) throw new Error(res.error || "Update failed");
    setSelectedReg(null);
  };

  const openFile = async (fileId: string) => {
    const res = await emit("reg-file-url", { fileId });
    if (!res.ok) throw new Error(res.error || "Cannot open file");
    window.open(res.url, "_blank");
  };

  // Exports what the Status and Category filters select, not the free-text search.
  const exportRegs = async () => {
    if (!form) return;
    const res = await emit("reg-export", {
      formId: form.id,
      category: filterCategory,
      status: filterStatus
    });
    if (!res.ok) throw new Error(res.error || "Export failed");
    const parts = [form.idPrefix || "registrations", filterCategory, filterStatus].filter(Boolean);
    downloadCsv(`${parts.join("-").replace(/[^A-Za-z0-9-]+/g, "")}.csv`, res.csv);
  };

  const selectedField = draft?.fields?.find((f: any) => f.key === selectedFieldKey);

  const updateField = (patch: any) => {
    if (!draft || !selectedField) return;
    setDraft({
      ...draft,
      fields: draft.fields.map((f: any) => (f.key === selectedField.key ? { ...f, ...patch } : f))
    });
  };

  const addCustomField = () => {
    if (!draft) return;
    const key = `custom_${Date.now().toString(36)}`;
    const field = {
      id: key,
      key,
      label: "New field",
      fieldType: "text",
      required: false,
      enabled: true,
      description: "",
      placeholder: "",
      options: [],
      displayOrder: (draft.fields?.length || 0) * 10 + 10,
      sectionKey: draft.sections?.[0]?.key || "main",
      validation: {},
      config: {},
      predefined: false
    };
    setDraft({ ...draft, fields: [...(draft.fields || []), field] });
    setSelectedFieldKey(key);
  };

  const addRule = () => {
    if (!draft) return;
    const rule = {
      id: `rule_${Date.now().toString(36)}`,
      sourceKey: draft.fields?.[0]?.key || "",
      operator: "equals",
      value: "",
      targetKey: draft.fields?.[1]?.key || "",
      action: "show",
      makeRequired: false,
      group: "and"
    };
    setDraft({ ...draft, rules: [...(draft.rules || []), rule] });
  };

  if (!tournaments.length) {
    return <Card>Create a tournament first, then configure registration.</Card>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <Select label="Tournament" value={tournamentId} onChange={(e) => setTournamentId(e.target.value)}>
            {tournaments.map((t: any) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </div>
        {form ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Status: <strong style={{ color: "var(--ink)" }}>{form.status}</strong>
          </p>
        ) : null}
      </div>

      {!form ? (
        <Card className="space-y-3">
          <h2 className="font-display text-3xl">Create registration form</h2>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Each tournament has one registration form. Start from the ACPL Season 6 template (recommended) or a blank form.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="bid" disabled={busy} onClick={() => createForm("acpl6")}>
              Use ACPL template
            </Button>
            <Button disabled={busy} onClick={() => createForm("blank")}>
              Blank form
            </Button>
          </div>
          {msg ? <p className="text-sm">{msg}</p> : null}
        </Card>
      ) : (
        <>
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
          {msg ? <p className="text-sm">{msg}</p> : null}

          {tab === "Dashboard" ? (
            <div className="grid gap-4">
              <Card className="space-y-3">
                <h2 className="font-display text-3xl">Registration</h2>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Stat label="Total" value={dashboard?.total ?? "—"} />
                  <Stat label="Registered" value={dashboard?.registered ?? "—"} />
                  <Stat label="Waiting" value={dashboard?.waiting ?? "—"} />
                  <Stat label="Today" value={dashboard?.today ?? "—"} />
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    variant="danger"
                    disabled={busy || !form?.id}
                    onClick={async () => {
                      if (
                        !confirm(
                          "Clear base price for every auction player linked to registrations on this form? Admins can set base prices later."
                        )
                      ) {
                        return;
                      }
                      try {
                        setBusy(true);
                        setMsg("");
                        const res: any = await emit("clear-registration-base-prices", { formId: form.id });
                        if (!res?.ok && res?.error) throw new Error(res.error);
                        setMsg(`Cleared base price for ${res.cleared || 0} registration-linked player(s).`);
                      } catch (e: any) {
                        setMsg(e.message || "Failed to clear base prices");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Clear all registration base prices
                  </Button>
                  <Button
                    disabled={busy || !form?.id}
                    onClick={async () => {
                      try {
                        setBusy(true);
                        setMsg("");
                        const res: any = await emit("sync-registration-photos", { formId: form.id, force: true });
                        if (!res?.ok && res?.error) throw new Error(res.error);
                        setMsg(
                          `Synced registration photos onto ${res.updated || 0} player(s)${
                            res.skipped ? ` (${res.skipped} skipped)` : ""
                          }.`
                        );
                      } catch (e: any) {
                        setMsg(e.message || "Failed to sync photos");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Sync registration photos to players
                  </Button>
                  <p className="text-sm" style={{ color: "var(--muted)" }}>
                    New registrations never get a default base. Photos from “Upload player photo” attach to the auction
                    player (details + hammer desk).
                  </p>
                </div>
              </Card>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(dashboard?.availableSlotsByCategory || {}).map(([cat, slot]: any) => (
                  <Card key={cat} className="space-y-1">
                    <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--muted)" }}>
                      {cat}
                    </p>
                    <p className="font-display text-3xl">{slot.registered ?? 0}</p>
                    <p className="text-sm" style={{ color: "var(--muted)" }}>
                      Registered
                      {slot.capacity ? ` · Capacity ${slot.capacity}` : ""}
                    </p>
                    <p className="text-sm font-semibold" style={{ color: "var(--turf)" }}>
                      Available slots: {slot.available == null ? "—" : slot.available}
                    </p>
                  </Card>
                ))}
                {!Object.keys(dashboard?.availableSlotsByCategory || {}).length ? (
                  <Card>
                    <p className="text-sm" style={{ color: "var(--muted)" }}>
                      No category data yet.
                    </p>
                  </Card>
                ) : null}
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <DonutChart
                    title="Count by category"
                    segments={Object.entries(dashboard?.byCategory || {}).map(([label, value]) => ({
                      label,
                      value: Number(value) || 0
                    }))}
                  />
                </Card>
                <Card>
                  <DonutChart
                    title="Payment status"
                    segments={Object.entries(dashboard?.byPayment || {}).map(([label, value]) => ({
                      label,
                      value: Number(value) || 0
                    }))}
                  />
                </Card>
              </div>
            </div>
          ) : null}

          {tab === "Settings" && draft ? (
            <Card className="space-y-3">
              <h2 className="font-display text-3xl">Form settings</h2>
              <Field label="Title" value={draft.title || ""} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              <label className="block space-y-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                Description
                <textarea
                  className="field mt-1 min-h-[80px] w-full"
                  value={draft.description || ""}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
              </label>
              <FilePick
                label="Registration header logo (optional override)"
                onData={async (dataUrl, file) => {
                  try {
                    const res: any = await emit("upload", { dataUrl, filename: file.name || "logo.jpg" });
                    const url = res?.url;
                    if (!res?.ok || !url) throw new Error(res?.error || "Upload failed");
                    setDraft((d: any) => ({ ...d, logo: url }));
                    setMsg("Header logo uploaded — click Save settings");
                  } catch (e: any) {
                    alert(e?.message || "Logo upload failed");
                  }
                }}
              />
              {(draft.logo || tournaments.find((t: any) => t.id === tournamentId)?.logo) && (
                <div className="flex flex-wrap items-center gap-3">
                  <img
                    src={draft.logo || tournaments.find((t: any) => t.id === tournamentId)?.logo}
                    alt=""
                    className="h-16 w-16 rounded-xl object-cover"
                  />
                  {draft.logo ? (
                    <Button onClick={() => setDraft((d: any) => ({ ...d, logo: "" }))}>Remove override</Button>
                  ) : null}
                </div>
              )}
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                By default the public form uses the <strong>tournament logo</strong> from Tournaments. Upload here only to
                override it.
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <Field
                  label="Opens at (IST)"
                  type="datetime-local"
                  value={draft.opensAt || ""}
                  onChange={(e) => setDraft({ ...draft, opensAt: e.target.value })}
                />
                <Field
                  label="Closes at (IST)"
                  type="datetime-local"
                  value={draft.closesAt || ""}
                  onChange={(e) => setDraft({ ...draft, closesAt: e.target.value })}
                />
              </div>
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                Schedule times are India Standard Time. Clicking <strong>Open registration</strong> starts the form
                immediately (a future “Opens at” time is cleared).
              </p>
              <Field
                label="Overall capacity"
                type="number"
                value={draft.capacity ?? 100}
                onChange={(e) => setDraft({ ...draft, capacity: Number(e.target.value) })}
              />
              <Select
                label="Category-specific capacity"
                value={draft.useCategoryCapacity ? "yes" : "no"}
                onChange={(e) => setDraft({ ...draft, useCategoryCapacity: e.target.value === "yes" })}
              >
                <option value="no">No — use overall capacity</option>
                <option value="yes">Yes</option>
              </Select>
              {draft.useCategoryCapacity ? (
                <div className="grid gap-2 md:grid-cols-3">
                  {["Men's", "Women's", "Kid's"].map((c) => (
                    <Field
                      key={c}
                      label={`${c} capacity`}
                      type="number"
                      value={draft.categoryCapacity?.[c] ?? ""}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          categoryCapacity: { ...(draft.categoryCapacity || {}), [c]: Number(e.target.value) }
                        })
                      }
                    />
                  ))}
                </div>
              ) : null}
              <Field
                label="Registration ID prefix"
                value={draft.idPrefix || ""}
                onChange={(e) => setDraft({ ...draft, idPrefix: e.target.value })}
              />
              <h3 className="font-display text-2xl">Payment</h3>
              <div className="grid gap-2 md:grid-cols-3">
                {["Men's", "Women's", "Kid's"].map((c) => (
                  <Field
                    key={c}
                    label={`${c} fee (₹)`}
                    type="number"
                    value={draft.payment?.fees?.[c] ?? ""}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        payment: {
                          ...draft.payment,
                          fees: { ...(draft.payment?.fees || {}), [c]: Number(e.target.value) }
                        }
                      })
                    }
                  />
                ))}
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <Field
                  label="Account name"
                  value={draft.payment?.bank?.accountName || ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      payment: { ...draft.payment, bank: { ...draft.payment?.bank, accountName: e.target.value } }
                    })
                  }
                />
                <Field
                  label="Account number"
                  value={draft.payment?.bank?.accountNumber || ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      payment: { ...draft.payment, bank: { ...draft.payment?.bank, accountNumber: e.target.value } }
                    })
                  }
                />
                <Field
                  label="IFSC"
                  value={draft.payment?.bank?.ifsc || ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      payment: { ...draft.payment, bank: { ...draft.payment?.bank, ifsc: e.target.value } }
                    })
                  }
                />
                <Field
                  label="Bank name"
                  value={draft.payment?.bank?.bankName || ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      payment: { ...draft.payment, bank: { ...draft.payment?.bank, bankName: e.target.value } }
                    })
                  }
                />
                <Field
                  label="UPI ID"
                  value={draft.payment?.upi?.upiId || ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      payment: { ...draft.payment, upi: { ...draft.payment?.upi, upiId: e.target.value } }
                    })
                  }
                />
                <Field
                  label="UPI mobile"
                  value={draft.payment?.upi?.mobile || ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      payment: { ...draft.payment, upi: { ...draft.payment?.upi, mobile: e.target.value } }
                    })
                  }
                />
              </div>
              <FilePick
                label="UPI QR code"
                compress={false}
                onData={async (dataUrl, file) => {
                  try {
                    const res: any = await emit("upload", { dataUrl, filename: file.name || "upi-qr.png" });
                    const url = res?.url;
                    if (!res?.ok || !url) throw new Error(res?.error || "Upload failed");
                    setDraft((d: any) => ({
                      ...d,
                      payment: {
                        ...(d.payment || {}),
                        upi: { ...(d.payment?.upi || {}), qrUrl: url }
                      }
                    }));
                    setMsg("UPI QR uploaded — click Save settings to publish it on the form");
                  } catch (e: any) {
                    alert(e?.message || "UPI QR upload failed — try a JPG/PNG under 5 MB.");
                  }
                }}
              />
              {draft.payment?.upi?.qrUrl ? (
                <div className="flex flex-wrap items-center gap-3">
                  <img
                    src={draft.payment.upi.qrUrl}
                    alt="UPI QR preview"
                    className="h-40 w-40 rounded-xl object-contain"
                    style={{ background: "#fff" }}
                  />
                  <div className="space-y-2">
                    <p className="text-xs" style={{ color: "var(--muted)" }}>
                      Preview shown. Click <strong>Save settings</strong> to keep it on the public form.
                    </p>
                    <Button
                      onClick={() =>
                        setDraft((d: any) => ({
                          ...d,
                          payment: {
                            ...(d.payment || {}),
                            upi: { ...(d.payment?.upi || {}), qrUrl: "" }
                          }
                        }))
                      }
                    >
                      Remove QR
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  Upload a clear QR image (PNG preferred). Wait for the preview, then Save settings.
                </p>
              )}
              <div className="neu-sm space-y-2 px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--muted)" }}>
                  Public URL
                </p>
                <Field
                  label="Friendly path"
                  value={draft.publicSlug || ""}
                  placeholder="ACPL-6"
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      publicSlug: e.target.value.replace(/\s+/g, "-")
                    })
                  }
                />
                <p className="break-all text-sm">
                  {baseUrl}/register/<strong>{draft.publicSlug || "…"}</strong>
                </p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  Letters, numbers, hyphens. Old secret token links still work.
                </p>
                {linkReach === "checking" && (
                  <p className="text-xs" style={{ color: "var(--muted)" }}>
                    Checking that this URL is reachable…
                  </p>
                )}
                {linkReach === "unreachable" && (
                  <div className="space-y-2 text-xs" style={{ color: "#B91C1C" }}>
                    <p>
                      This URL is not responding, so links already shared will not open. Share this
                      one instead until it is fixed:
                    </p>
                    <p className="break-all" style={{ color: "var(--ink)" }}>
                      {fallbackUrl}
                    </p>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => {
                      navigator.clipboard?.writeText(`${baseUrl}/register/${draft.publicSlug || form.publicToken}`);
                      setMsg("Public URL copied");
                    }}
                  >
                    Copy URL
                  </Button>
                  {linkReach === "unreachable" && fallbackUrl && (
                    <Button
                      onClick={() => {
                        navigator.clipboard?.writeText(fallbackUrl);
                        setMsg("Working URL copied");
                      }}
                    >
                      Copy working URL
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="bid" disabled={busy} onClick={saveDraft}>
                  Save settings
                </Button>
                <Button disabled={busy || form.status === "open"} onClick={() => setStatus("open")}>
                  Open registration
                </Button>
                <Button disabled={busy || form.status === "closed"} onClick={() => setStatus("closed")}>
                  Close registration
                </Button>
                <Button disabled={busy} onClick={() => setStatus("draft")}>
                  Back to draft
                </Button>
              </div>
              <div className="neu-sm space-y-2 px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--muted)" }}>
                  Start over
                </p>
                <p className="text-sm" style={{ color: "var(--muted)" }}>
                  Delete this form to return to the create screen, or replace it with a fresh template.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={busy} onClick={() => recreateCurrentForm("acpl6")}>
                    Replace with ACPL template
                  </Button>
                  <Button disabled={busy} onClick={() => recreateCurrentForm("blank")}>
                    Replace with blank form
                  </Button>
                  <Button variant="danger" disabled={busy} onClick={deleteCurrentForm}>
                    Delete form
                  </Button>
                </div>
              </div>
            </Card>
          ) : null}

          {tab === "Form builder" && draft ? (
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="space-y-2">
                <h2 className="font-display text-2xl">Fields</h2>
                <div className="max-h-[60vh] space-y-1 overflow-auto">
                  {(draft.fields || []).map((f: any) => (
                    <button
                      key={f.key}
                      type="button"
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm"
                      style={
                        selectedFieldKey === f.key
                          ? { background: "color-mix(in srgb, var(--accent) 14%, transparent)" }
                          : undefined
                      }
                      onClick={() => setSelectedFieldKey(f.key)}
                    >
                      <span>
                        {f.enabled === false ? "☐ " : "☑ "}
                        {f.label}
                      </span>
                      <span style={{ color: "var(--muted)" }}>{f.fieldType}</span>
                    </button>
                  ))}
                </div>
                <Button onClick={addCustomField}>+ Add custom field</Button>
                <Button variant="bid" disabled={busy} onClick={saveDraft}>
                  Save form
                </Button>
              </Card>
              <Card className="space-y-3 lg:col-span-2">
                <h2 className="font-display text-2xl">Field settings</h2>
                {selectedField ? (
                  <>
                    <Field label="Label" value={selectedField.label || ""} onChange={(e) => updateField({ label: e.target.value })} />
                    <Field
                      label="Description"
                      value={selectedField.description || ""}
                      onChange={(e) => updateField({ description: e.target.value })}
                    />
                    <Field
                      label="Placeholder"
                      value={selectedField.placeholder || ""}
                      onChange={(e) => updateField({ placeholder: e.target.value })}
                    />
                    <Select
                      label="Type"
                      value={selectedField.fieldType}
                      onChange={(e) => updateField({ fieldType: e.target.value })}
                      disabled={selectedField.predefined}
                    >
                      {FIELD_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </Select>
                    <Select
                      label="Enabled"
                      value={selectedField.enabled === false ? "no" : "yes"}
                      onChange={(e) => updateField({ enabled: e.target.value === "yes" })}
                    >
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </Select>
                    <Select
                      label="Required"
                      value={selectedField.required ? "yes" : "no"}
                      onChange={(e) => updateField({ required: e.target.value === "yes" })}
                    >
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </Select>
                    <Field
                      label="Display order"
                      type="number"
                      value={selectedField.displayOrder ?? 0}
                      onChange={(e) => updateField({ displayOrder: Number(e.target.value) })}
                    />
                    {(selectedField.fieldType === "dropdown" || selectedField.fieldType === "single") && (
                      <>
                        {selectedField.key === "auctionTeam" ? (
                          <div className="neu-sm space-y-2 px-3 py-3 text-sm">
                            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--muted)" }}>
                              Inherited from tournament
                            </p>
                            <p style={{ color: "var(--muted)" }}>
                              Team choices come from teams added under Tournaments for this event. Edit the tournament’s
                              team list to change this dropdown.
                            </p>
                            <ul className="list-disc pl-5">
                              {(tournaments.find((t: any) => t.id === tournamentId)?.teamIds || [])
                                .map((id: string) => admin.teams.find((x: any) => x.id === id)?.name)
                                .filter(Boolean)
                                .map((name: string) => (
                                  <li key={name}>{name}</li>
                                ))}
                            </ul>
                            {!(tournaments.find((t: any) => t.id === tournamentId)?.teamIds || []).length ? (
                              <p style={{ color: "var(--muted)" }}>No teams linked yet — add them on the Tournaments page.</p>
                            ) : null}
                          </div>
                        ) : (
                          <label
                            className="block space-y-1 text-[11px] font-semibold uppercase tracking-wider"
                            style={{ color: "var(--muted)" }}
                          >
                            Options (one per line)
                            <textarea
                              className="field mt-1 min-h-[100px] w-full"
                              value={(selectedField.options || []).join("\n")}
                              onChange={(e) =>
                                updateField({
                                  options: e.target.value
                                    .split("\n")
                                    .map((x) => x.trim())
                                    .filter(Boolean)
                                })
                              }
                            />
                          </label>
                        )}
                      </>
                    )}
                    {!selectedField.predefined ? (
                      <Button
                        variant="danger"
                        onClick={() => {
                          setDraft({
                            ...draft,
                            fields: draft.fields.filter((f: any) => f.key !== selectedField.key),
                            rules: (draft.rules || []).filter(
                              (r: any) => r.sourceKey !== selectedField.key && r.targetKey !== selectedField.key
                            )
                          });
                          setSelectedFieldKey(draft.fields.find((f: any) => f.key !== selectedField.key)?.key || "");
                        }}
                      >
                        Delete field
                      </Button>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm" style={{ color: "var(--muted)" }}>
                    Select a field
                  </p>
                )}

                <h3 className="font-display pt-4 text-2xl">Conditional rules</h3>
                <div className="space-y-3">
                  {(draft.rules || []).map((r: any, idx: number) => (
                    <div key={r.id || idx} className="neu-sm grid gap-2 px-3 py-3 md:grid-cols-2">
                      <Select
                        label="If field"
                        value={r.sourceKey}
                        onChange={(e) => {
                          const rules = [...draft.rules];
                          rules[idx] = { ...r, sourceKey: e.target.value };
                          setDraft({ ...draft, rules });
                        }}
                      >
                        {(draft.fields || []).map((f: any) => (
                          <option key={f.key} value={f.key}>
                            {f.label}
                          </option>
                        ))}
                      </Select>
                      <Select
                        label="Operator"
                        value={r.operator}
                        onChange={(e) => {
                          const rules = [...draft.rules];
                          rules[idx] = { ...r, operator: e.target.value };
                          setDraft({ ...draft, rules });
                        }}
                      >
                        {["equals", "notEquals", "contains", "isEmpty", "isNotEmpty", "greaterThan", "lessThan"].map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </Select>
                      <Field
                        label="Value"
                        value={r.value || ""}
                        onChange={(e) => {
                          const rules = [...draft.rules];
                          rules[idx] = { ...r, value: e.target.value };
                          setDraft({ ...draft, rules });
                        }}
                      />
                      <Select
                        label="Then show field"
                        value={r.targetKey}
                        onChange={(e) => {
                          const rules = [...draft.rules];
                          rules[idx] = { ...r, targetKey: e.target.value };
                          setDraft({ ...draft, rules });
                        }}
                      >
                        {(draft.fields || []).map((f: any) => (
                          <option key={f.key} value={f.key}>
                            {f.label}
                          </option>
                        ))}
                      </Select>
                      <Select
                        label="Make required"
                        value={r.makeRequired ? "yes" : "no"}
                        onChange={(e) => {
                          const rules = [...draft.rules];
                          rules[idx] = { ...r, makeRequired: e.target.value === "yes" };
                          setDraft({ ...draft, rules });
                        }}
                      >
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </Select>
                      <Button
                        variant="danger"
                        onClick={() => setDraft({ ...draft, rules: draft.rules.filter((_: any, i: number) => i !== idx) })}
                      >
                        Remove rule
                      </Button>
                    </div>
                  ))}
                </div>
                <Button onClick={addRule}>+ Add rule</Button>
              </Card>
            </div>
          ) : null}

          {tab === "Preview" && form ? (
            <Card>
              <DynamicForm form={form} mode="preview" />
            </Card>
          ) : null}

          {tab === "Registrations" ? (
            <div className="grid gap-4 lg:grid-cols-5">
              <Card className="space-y-3 lg:col-span-3">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[160px] flex-1">
                    <Field label="Search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ID, name, mobile" />
                  </div>
                  <Select label="Status" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                    <option value="">All</option>
                    {["registered", "waiting", "cancelled", "rejected"].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                  <Select label="Category" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
                    <option value="">All</option>
                    {categoryOptions.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                  <Button onClick={exportRegs}>
                    {filterCategory ? `Export ${filterCategory} CSV` : "Export CSV"}
                  </Button>
                </div>
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  Showing {regs.length} of {formRegs.length}. Click a column heading to sort. The export follows
                  the Status and Category filters.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead>
                      <tr style={{ color: "var(--muted)" }}>
                        {[
                          { key: "registrationId", label: "ID", className: "py-2" },
                          { key: "sequence", label: "#" },
                          { key: "playerName", label: "Player" },
                          { key: "category", label: "Category" },
                          { key: "", label: "ACPL" },
                          { key: "status", label: "Status" },
                          { key: "paymentStatus", label: "Payment" }
                        ].map((col) =>
                          col.key ? (
                            <th key={col.label} className={col.className}>
                              <button
                                type="button"
                                className="font-inherit cursor-pointer bg-transparent p-0 text-left"
                                style={{ color: sort.key === col.key ? "var(--ink)" : "inherit" }}
                                aria-label={`Sort by ${col.label}`}
                                onClick={() =>
                                  setSort((s) =>
                                    s.key === col.key ? { key: col.key, dir: s.dir === 1 ? -1 : 1 } : { key: col.key, dir: 1 }
                                  )
                                }
                              >
                                {col.label}
                                {sort.key === col.key ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
                              </button>
                            </th>
                          ) : (
                            <th key={col.label} className={col.className}>
                              {col.label}
                            </th>
                          )
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {regs.map((r: any) => (
                        <tr
                          key={r.id}
                          className="cursor-pointer border-t"
                          style={{ borderColor: "color-mix(in srgb, var(--ink) 10%, transparent)" }}
                          onClick={() => setSelectedReg(r)}
                        >
                          <td className="py-2 font-medium">{r.registrationId}</td>
                          <td>{r.categorySequence || r.sequence}</td>
                          <td>{r.playerName || r.values?.playerName}</td>
                          <td>{r.category || r.values?.category}</td>
                          <td>{r.acplName || (r.acplPlayerId ? "Linked" : "—")}</td>
                          <td>
                            {r.status}
                            {r.waitingPosition ? ` #${r.waitingPosition}` : ""}
                          </td>
                          <td>{r.paymentStatus}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
              <Card className="space-y-3 lg:col-span-2">
                <h3 className="font-display text-2xl">Detail</h3>
                {!selectedReg ? (
                  <p className="text-sm" style={{ color: "var(--muted)" }}>
                    Select a registration
                  </p>
                ) : (
                  <>
                    <p className="font-display text-3xl">{selectedReg.values?.playerName}</p>
                    <p className="text-sm" style={{ color: "var(--muted)" }}>
                      {selectedReg.registrationId} · #{selectedReg.categorySequence || selectedReg.sequence} ·{" "}
                      {selectedReg.category || selectedReg.values?.category || "—"} ·{" "}
                      {new Date(selectedReg.registeredAt).toLocaleString()}
                    </p>
                    <div className="space-y-1 text-sm">
                      {Object.entries(selectedReg.values || {}).map(([k, v]) => (
                        <p key={k}>
                          <strong>{k}:</strong> {String(v)}
                        </p>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(selectedReg.fileIds || {}).map(([k, id]) => (
                        <Button key={k} onClick={() => openFile(String(id))}>
                          View {k}
                        </Button>
                      ))}
                    </div>

                    <div
                      className="space-y-3 rounded-xl p-3"
                      style={{ background: "color-mix(in srgb, var(--accent) 8%, transparent)" }}
                    >
                      <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                        Link ACPL stats player
                      </p>
                      <p className="text-sm" style={{ color: "var(--muted)" }}>
                        Search ACPL history and select a player to attach stats to this registration.
                      </p>
                      {selectedReg.playerId ? (
                        <div className="flex flex-wrap items-center gap-3 text-sm">
                          {linkedAuctionPlayer?.photo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={linkedAuctionPlayer.photo}
                              alt=""
                              className="h-14 w-14 rounded-xl object-cover"
                              style={{ outline: "1px solid color-mix(in srgb, var(--ink) 10%, transparent)" }}
                            />
                          ) : null}
                          <p>
                            Auction player:{" "}
                            <strong>{linkedAuctionPlayer?.name || selectedReg.playerName || "—"}</strong>
                            {!linkedAuctionPlayer?.photo ? (
                              <span style={{ color: "var(--muted)" }}> · No photo on player yet</span>
                            ) : null}
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm" style={{ color: "var(--danger, #b91c1c)" }}>
                          No auction player on this registration yet. Promote / register first, then link.
                        </p>
                      )}
                      <AcplLinkPicker
                        emit={emit}
                        playerId={selectedReg.playerId}
                        linkedAcplId={selectedReg.acplPlayerId || linkedAuctionPlayer?.acplPlayerId || null}
                        linkedAcplName={selectedReg.acplName || linkedAuctionPlayer?.acplName || null}
                        initialQuery={
                          selectedReg.acplName ||
                          linkedAuctionPlayer?.acplName ||
                          selectedReg.values?.playerName ||
                          selectedReg.playerName ||
                          ""
                        }
                        acplPlayers={admin.acplHistory?.players || []}
                        onLinked={({ acpl }) => setMsg(`Linked ACPL stats: ${acpl?.name || ""}`)}
                        onUnlinked={() => setMsg("ACPL link removed.")}
                      />
                    </div>

                    {selectedReg.playerId ? (
                      <div className="space-y-2 rounded-xl p-3" style={{ background: "color-mix(in srgb, var(--ink) 4%, transparent)" }}>
                        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                          Base price
                        </p>
                        <p className="text-sm">
                          {linkedAuctionPlayer?.basePrice == null || linkedAuctionPlayer?.basePrice === "" ? (
                            <span style={{ color: "var(--muted)" }}>Not set (correct for new registrations)</span>
                          ) : (
                            <>
                              Current: <strong>{Number(linkedAuctionPlayer.basePrice) / 100} Cr</strong>
                            </>
                          )}
                        </p>
                        {linkedAuctionPlayer?.basePrice != null && linkedAuctionPlayer?.basePrice !== "" ? (
                          <Button
                            variant="danger"
                            disabled={busy}
                            onClick={async () => {
                              try {
                                setBusy(true);
                                await emit("upsert-player", {
                                  id: selectedReg.playerId,
                                  name: linkedAuctionPlayer.name,
                                  role: linkedAuctionPlayer.role,
                                  categoryId: linkedAuctionPlayer.categoryId,
                                  sport: linkedAuctionPlayer.sport,
                                  photo: linkedAuctionPlayer.photo || "",
                                  phone: linkedAuctionPlayer.phone || "",
                                  teamId: linkedAuctionPlayer.teamId,
                                  assignment: linkedAuctionPlayer.assignment || "auction",
                                  tournamentIds: linkedAuctionPlayer.tournamentIds || [],
                                  basePrice: null,
                                  clearBasePrice: true
                                });
                                setMsg("Base price cleared for this player.");
                              } catch (e: any) {
                                setMsg(e.message || "Failed to clear base price");
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            Clear base price
                          </Button>
                        ) : null}
                      </div>
                    ) : null}

                    <Select
                      label="Payment status"
                      value={selectedReg.paymentStatus || "pending"}
                      onChange={async (e) => {
                        const res = await emit("reg-set-payment", {
                          registrationId: selectedReg.id,
                          paymentStatus: e.target.value
                        });
                        if (!res.ok) setMsg(res.error);
                      }}
                    >
                      {["pending", "verified", "rejected"].map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </Select>
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => updateRegStatus(selectedReg.id, "registered", true)}>Promote / Register</Button>
                      <Button onClick={() => updateRegStatus(selectedReg.id, "waiting")}>Move to waiting</Button>
                      <Button variant="danger" onClick={() => updateRegStatus(selectedReg.id, "cancelled")}>
                        Cancel
                      </Button>
                      <Button variant="danger" onClick={() => updateRegStatus(selectedReg.id, "rejected")}>
                        Reject
                      </Button>
                      <Button
                        variant="danger"
                        onClick={async () => {
                          if (!confirm(`Delete ${selectedReg.registrationId}? Registration numbers after this entry will decrease by 1.`)) return;
                          const res = await emit("reg-delete", { registrationId: selectedReg.id });
                          if (!res.ok) setMsg(res.error);
                          else setSelectedReg(null);
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </>
                )}
              </Card>
            </div>
          ) : null}

          {tab === "Auction teams" ? (
            <div className="space-y-4">
              <Card className="space-y-2">
                <h2 className="font-display text-3xl">Players by auction team</h2>
                <p className="text-sm" style={{ color: "var(--muted)" }}>
                  Registrations grouped by the auction team they chose to represent. Cards show photo, category, and
                  status. &ldquo;Not representing a team&rdquo; lists Men&apos;s category players only.
                </p>
              </Card>
              <div className="grid gap-4 lg:grid-cols-2">
                {auctionTeamGroups.map((group) => (
                  <Card key={group.team} className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      {group.logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={group.logo}
                          alt=""
                          className="h-12 w-12 rounded-xl object-cover"
                          style={{ outline: "1px solid color-mix(in srgb, var(--ink) 10%, transparent)" }}
                        />
                      ) : (
                        <div
                          className="flex h-12 w-12 items-center justify-center rounded-xl font-display text-lg"
                          style={{
                            background: group.color || "color-mix(in srgb, var(--accent) 18%, transparent)",
                            color: "var(--ink)"
                          }}
                        >
                          {String(group.team || "?")
                            .slice(0, 2)
                            .toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <h3 className="font-display text-2xl leading-tight">{group.team}</h3>
                        <p className="text-sm" style={{ color: "var(--muted)" }}>
                          {group.players.length} player{group.players.length === 1 ? "" : "s"}
                        </p>
                      </div>
                    </div>
                    {group.players.length ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {group.players.map((p: any) => (
                          <button
                            key={p.id}
                            type="button"
                            className="flex items-center gap-3 rounded-xl px-3 py-2 text-left"
                            style={{
                              background: "color-mix(in srgb, var(--ink) 4%, transparent)",
                              outline: "1px solid color-mix(in srgb, var(--ink) 8%, transparent)"
                            }}
                            onClick={() => {
                              setSelectedReg(p);
                              setTab("Registrations");
                            }}
                          >
                            <div
                              className="h-12 w-12 shrink-0 overflow-hidden rounded-lg"
                              style={{ background: "color-mix(in srgb, var(--ink) 8%, transparent)" }}
                            >
                              {p.photo ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={p.photo} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <div
                                  className="flex h-full items-center justify-center text-xs font-bold"
                                  style={{ color: "var(--muted)" }}
                                >
                                  {String(p.displayName || "?")
                                    .slice(0, 2)
                                    .toUpperCase()}
                                </div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-semibold">{p.displayName}</p>
                              <p className="truncate text-xs" style={{ color: "var(--muted)" }}>
                                {p.category}
                                {p.status ? ` · ${p.status}` : ""}
                                {p.paymentStatus ? ` · ${p.paymentStatus}` : ""}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm" style={{ color: "var(--muted)" }}>
                        No registrations for this team yet.
                      </p>
                    )}
                  </Card>
                ))}
              </div>
              {!auctionTeamGroups.length ? (
                <Card>
                  <p className="text-sm" style={{ color: "var(--muted)" }}>
                    No registrations yet.
                  </p>
                </Card>
              ) : null}
            </div>
          ) : null}

          {tab === "Waiting list" ? (
            <Card className="space-y-3">
              <h2 className="font-display text-3xl">Waiting list</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr style={{ color: "var(--muted)" }}>
                      <th className="py-2">Position</th>
                      <th>Sequence</th>
                      <th>Player</th>
                      <th>Category</th>
                      <th>Registered at</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {waiting.map((r: any) => (
                      <tr
                        key={r.id}
                        className="border-t"
                        style={{ borderColor: "color-mix(in srgb, var(--ink) 10%, transparent)" }}
                      >
                        <td className="py-2">{r.waitingPosition}</td>
                        <td>{r.sequence}</td>
                        <td>{r.playerName || r.values?.playerName}</td>
                        <td>{r.category || r.values?.category}</td>
                        <td>{new Date(r.registeredAt).toLocaleString()}</td>
                        <td>
                          <Button onClick={() => updateRegStatus(r.id, "registered", true)}>Promote</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!waiting.length ? (
                  <p className="text-sm" style={{ color: "var(--muted)" }}>
                    Waiting list is empty.
                  </p>
                ) : null}
              </div>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
