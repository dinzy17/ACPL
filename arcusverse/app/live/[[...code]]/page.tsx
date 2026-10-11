"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Shell, Card, Button, Field } from "@/components/ui";
import { useApp } from "@/components/Providers";
import { LiveBoard } from "@/components/LiveBoard";

export default function LiveEntry() {
  const params = useParams<{ code?: string | string[] }>();
  const router = useRouter();
  const { emit, socket, hello } = useApp();
  const codeParam = Array.isArray(params.code) ? params.code[0] : params.code;
  const [code, setCode] = useState(codeParam || "");
  const [state, setState] = useState<any>(null);

  useEffect(() => {
    if (codeParam) setCode(codeParam);
    else if (hello?.defaultAuction && !code) setCode(hello.defaultAuction);
  }, [codeParam, hello]);

  useEffect(() => {
    if (!socket) return;
    socket.on("state", (s) => {
      if (!s?.auction) return;
      setState((prev: any) => {
        if (prev?.auction?.id && s.auction.id !== prev.auction.id) return prev;
        localStorage.setItem("arcus-live", JSON.stringify(s));
        return s;
      });
    });
    return () => {
      socket.off("state");
    };
  }, [socket]);

  const join = async (c: string) => {
    const res: any = await emit("login", { role: "spectator", code: c });
    setState(res.public);
    if (!codeParam) router.replace(`/live/${res.public.auction.code}`);
  };

  useEffect(() => {
    if (codeParam && socket)
      join(codeParam).catch(() => {
        const cached = localStorage.getItem("arcus-live");
        if (cached) setState(JSON.parse(cached));
      });
  }, [codeParam, socket]);

  if (!state) {
    return (
      <Shell title="Live">
        <Card className="mx-auto max-w-md space-y-4">
          <h1 className="font-display text-5xl">Spectator board</h1>
          <Field label="Auction code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          <Button variant="turf" onClick={() => join(code)}>
            Watch live
          </Button>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell title="Live" subtitle={state.auction.name} showLogout>
      <LiveBoard mode="spectator" state={state} emit={emit} auctionId={state.auction.id} />
    </Shell>
  );
}
