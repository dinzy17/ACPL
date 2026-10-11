"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shell, Card, Button } from "@/components/ui";
import { useApp } from "@/components/Providers";
import { LiveBoard } from "@/components/LiveBoard";
import { LiveSpectatorBadge } from "@/components/LiveSpectatorBadge";
import { TeamwiseExportBar } from "@/components/TeamwiseExportBar";
import { beep } from "@/lib/format";

function statusLabel(status: string) {
  if (status === "live") return "Live";
  if (status === "paused") return "Paused";
  if (status === "completed") return "Completed";
  return "Not started";
}

export default function AuctioneerPage() {
  const { emit, socket, hello } = useApp();
  const router = useRouter();
  const [state, setState] = useState<any>(null);
  const [auctionId, setAuctionId] = useState("");
  const [deskAuctions, setDeskAuctions] = useState<any[]>([]);
  const [picking, setPicking] = useState(false);
  const [role, setRole] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [showUrls, setShowUrls] = useState(false);
  const [copied, setCopied] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (!socket) return;
    const on = (s: any) => {
      if (!s?.auction) return;
      if (s?.live?.currentBid) beep("bid");
      setState((prev: any) => {
        if (prev?.auction?.id && s.auction.id !== prev.auction.id) return prev;
        return s;
      });
    };
    socket.on("state", on);
    return () => {
      socket.off("state", on);
    };
  }, [socket]);

  useEffect(() => {
    if (!socket || state || picking) return;
    try {
      const saved = sessionStorage.getItem("arcus-auth");
      if (!saved) {
        router.replace("/");
        return;
      }
      const s = JSON.parse(saved);
      // Do not auto-attach a remembered auctionId when multiple desks are live —
      // server returns needsAuctionPick unless exactly one live/paused auction.
      emit("login", {
        username: s.username,
        password: s.password
      })
        .then((res: any) => {
          if (!["super", "admin", "auctioneer"].includes(res.role)) {
            router.replace("/");
            return;
          }
          setRole(res.role);
          const list = res.deskAuctions || res.admin?.auctions || [];
          setDeskAuctions(list);
          if (res.public?.auction && !res.needsAuctionPick) {
            setState(res.public);
            setAuctionId(res.auctionId || res.public.auction.id);
            setPicking(false);
            return;
          }
          // Multiple (or zero auto) live auctions — show chooser
          setPicking(true);
          if (!list.length) setErr("No auction yet. Create one from Admin → Auctions.");
        })
        .catch(() => router.replace("/"));
    } catch {
      router.replace("/");
    }
  }, [socket, state, picking]);

  const enterDesk = async (id: string) => {
    try {
      setBusy(true);
      setErr("");
      const res: any = await emit("select-desk-auction", { auctionId: id });
      if (!res?.public?.auction) throw new Error("Could not open that auction");
      setState(res.public);
      setAuctionId(res.auctionId || res.public.auction.id);
      setDeskAuctions(res.deskAuctions || deskAuctions);
      setPicking(false);
      try {
        const saved = JSON.parse(sessionStorage.getItem("arcus-auth") || "{}");
        sessionStorage.setItem(
          "arcus-auth",
          JSON.stringify({
            ...saved,
            auctionId: res.auctionId || res.public.auction.id,
            code: res.public.auction.code || saved.code || ""
          })
        );
      } catch {
        /* ignore */
      }
    } catch (e: any) {
      setErr(e.message || "Could not open auction");
    } finally {
      setBusy(false);
    }
  };

  const switchAuction = () => {
    setState(null);
    setAuctionId("");
    setPicking(true);
    setErr("");
    try {
      const saved = JSON.parse(sessionStorage.getItem("arcus-auth") || "{}");
      sessionStorage.setItem("arcus-auth", JSON.stringify({ ...saved, auctionId: "", code: "" }));
      emit("login", { username: saved.username, password: saved.password }).then((res: any) => {
        setDeskAuctions(res.deskAuctions || res.admin?.auctions || deskAuctions);
      });
    } catch {
      /* ignore */
    }
  };

  const startOrResetLive = async () => {
    try {
      setBusy(true);
      setErr("");
      setConfirmReset(false);
      const res: any = await emit("start-auction", { auctionId: auctionId || state?.auction?.id });
      if (res?.public) setState(res.public);
    } catch (e: any) {
      setErr(e.message || "Could not start/reset auction");
    } finally {
      setBusy(false);
    }
  };

  const urls = (() => {
    const code = state?.auction?.code;
    const bases = hello?.spectatorUrls?.length
      ? hello.spectatorUrls
      : hello?.appUrl
        ? [`${hello.appUrl.replace(/\/$/, "")}/live`]
        : ["http://localhost:3000/live"];
    return code ? bases.map((u) => `${u.replace(/\/$/, "")}/${code}`) : bases;
  })();

  const copy = async (u: string) => {
    try {
      await navigator.clipboard.writeText(u);
      setCopied(u);
    } catch {
      setCopied("");
    }
  };

  if (picking || (!state && !err)) {
    const live = deskAuctions.filter((a) => a.status === "live" || a.status === "paused");
    const others = deskAuctions.filter((a) => a.status !== "live" && a.status !== "paused");
    return (
      <Shell title="Auctioneer" subtitle="Choose auction" showLogout>
        <Card className="mx-auto max-w-xl space-y-4">
          <h1 className="font-display text-4xl">Hammer desk</h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {live.length > 1
              ? "More than one auction is live — pick which desk to open."
              : "Select an auction to open on the hammer desk."}
          </p>
          {err && (
            <p className="font-semibold" style={{ color: "var(--crimson)" }}>
              {err}
            </p>
          )}
          {!deskAuctions.length && !err && <p>Loading auctions…</p>}
          {live.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                Live / paused
              </p>
              {live.map((a) => (
                <div key={a.id} className="neu-sm flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="font-display text-2xl">{a.name}</p>
                    <p className="text-sm" style={{ color: "var(--muted)" }}>
                      {statusLabel(a.status)}
                      {a.code ? ` · Code ${a.code}` : ""}
                      {a.tournamentName ? ` · ${a.tournamentName}` : ""}
                    </p>
                  </div>
                  <Button variant="turf" disabled={busy} onClick={() => enterDesk(a.id)}>
                    {busy ? "Opening…" : "Enter desk"}
                  </Button>
                </div>
              ))}
            </div>
          )}
          {others.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                Other auctions
              </p>
              {others.map((a) => (
                <div key={a.id} className="neu-sm flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="font-display text-2xl">{a.name}</p>
                    <p className="text-sm" style={{ color: "var(--muted)" }}>
                      {statusLabel(a.status)}
                      {a.code ? ` · Code ${a.code}` : ""}
                    </p>
                  </div>
                  <Button disabled={busy || a.status === "completed"} onClick={() => enterDesk(a.id)}>
                    {a.status === "completed" ? "Ended" : busy ? "Opening…" : "Enter desk"}
                  </Button>
                </div>
              ))}
            </div>
          )}
          {role !== "auctioneer" && (
            <Link className="btn btn-ghost px-5 py-2.5 text-sm" href="/admin/auctions">
              Open auctions admin
            </Link>
          )}
        </Card>
      </Shell>
    );
  }

  if (!state) {
    return (
      <Shell title="Auctioneer" showLogout>
        <Card className="mx-auto max-w-lg space-y-3">
          <h1 className="font-display text-4xl">Hammer desk</h1>
          <p>{err || "Loading…"}</p>
          {role !== "auctioneer" && (
            <Link className="btn btn-turf px-5 py-2.5 text-sm" href="/admin/auctions">
              Open auctions
            </Link>
          )}
        </Card>
      </Shell>
    );
  }

  return (
    <Shell title="Auctioneer dashboard" subtitle={state.auction.name} showLogout>
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <LiveSpectatorBadge auctionId={auctionId || state.auction.id} />
        <Button
          variant={state.auction?.status === "live" || state.auction?.status === "paused" ? "danger" : "lime"}
          disabled={busy}
          onClick={() => {
            if (state.auction?.status === "live" || state.auction?.status === "paused") setConfirmReset(true);
            else startOrResetLive();
          }}
        >
          {state.auction?.status === "live" || state.auction?.status === "paused"
            ? "Reset live auction"
            : "Start auction"}
        </Button>
        <Button onClick={() => setShowUrls(true)}>Spectator URL</Button>
        <Button onClick={switchAuction}>Switch auction</Button>
        {state.auction?.status === "completed" && state.auction?.code ? (
          <Link className="btn btn-turf px-5 py-2.5 text-sm" href={`/summary/${state.auction.code}`}>
            Open summary & downloads
          </Link>
        ) : null}
        {role !== "auctioneer" && (
          <Link className="btn btn-ghost px-5 py-2.5 text-sm" href="/admin">
            Admin
          </Link>
        )}
      </div>
      {confirmReset && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <Card className="relative z-[71] max-w-md space-y-4 p-6">
            <h2 className="font-display text-3xl">Reset live auction?</h2>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              This clears the current live board and starts over. If you click it by mistake, use{" "}
              <strong>Undo</strong> immediately to restore the previous auction state.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="danger" disabled={busy} onClick={startOrResetLive}>
                {busy ? "Resetting…" : "Yes, reset"}
              </Button>
              <Button onClick={() => setConfirmReset(false)}>Cancel</Button>
            </div>
          </Card>
        </div>
      )}
      {err ? (
        <p className="mb-3 font-semibold" style={{ color: "var(--crimson)" }}>
          {err}
        </p>
      ) : null}
      {state.auction?.status === "completed" ? (
        <div className="mb-4">
          <TeamwiseExportBar state={state} title="Auction ended — download teamwise lists" />
        </div>
      ) : null}
      {showUrls && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => setShowUrls(false)}>
          <Card className="relative z-[61] max-w-lg space-y-3 p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-3xl">Spectator URLs</h2>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Open these on phones and the projector. Copy one and share on the LAN.
            </p>
            {urls.map((u) => (
              <div key={u} className="flex items-center gap-2">
                <p className="flex-1 break-all text-sm" style={{ color: "var(--accent)" }}>
                  {u}
                </p>
                <Button onClick={() => copy(u)}>{copied === u ? "Copied" : "Copy"}</Button>
              </div>
            ))}
            <Button variant="turf" onClick={() => setShowUrls(false)}>
              Close
            </Button>
          </Card>
        </div>
      )}
      <LiveBoard mode="auctioneer" state={state} emit={emit} auctionId={auctionId || state.auction.id} onPublic={setState} />
    </Shell>
  );
}
