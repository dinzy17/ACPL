"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shell, Card, Button } from "@/components/ui";
import { useApp } from "@/components/Providers";
import { LiveBoard } from "@/components/LiveBoard";
import { beep } from "@/lib/format";

export default function AuctioneerPage() {
  const { emit, socket, hello } = useApp();
  const router = useRouter();
  const [state, setState] = useState<any>(null);
  const [auctionId, setAuctionId] = useState("");
  const [role, setRole] = useState("");
  const [err, setErr] = useState("");
  const [showUrls, setShowUrls] = useState(false);
  const [copied, setCopied] = useState("");

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
    if (!socket || state) return;
    try {
      const saved = sessionStorage.getItem("arcus-auth");
      if (!saved) {
        router.replace("/");
        return;
      }
      const s = JSON.parse(saved);
      emit("login", { username: s.username, password: s.password })
        .then((res: any) => {
          if (!["super", "admin", "auctioneer"].includes(res.role)) {
            router.replace("/");
            return;
          }
          setRole(res.role);
          if (!res.public) {
            setErr("No auction yet. Create one from Admin → Auctions.");
            return;
          }
          setState(res.public);
          setAuctionId(res.auctionId || res.public.auction?.id);
        })
        .catch(() => router.replace("/"));
    } catch {
      router.replace("/");
    }
  }, [socket]);

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
      <div className="mb-4 flex flex-wrap gap-2 print:hidden">
        <Button onClick={() => setShowUrls(true)}>Spectator URL</Button>
        {role !== "auctioneer" && (
          <Link className="btn btn-ghost px-5 py-2.5 text-sm" href="/admin">
            Admin
          </Link>
        )}
      </div>
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
