"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Shell, Card, Button, Field } from "@/components/ui";
import { useApp } from "@/components/Providers";

function redirectFor(role: string) {
  if (role === "auctioneer") return "/auctioneer";
  if (role === "owner") return "/owner";
  if (role === "super" || role === "admin") return "/admin";
  return "/";
}

export default function HomePage() {
  const { hello, emit, socket } = useApp();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const urls = hello?.spectatorUrls?.length
    ? hello.spectatorUrls
    : ["http://localhost:3000/live"];
  const withCode = hello?.defaultAuction ? urls.map((u) => `${u}/${hello.defaultAuction}`) : urls;

  useEffect(() => {
    if (!socket) return;
    try {
      const saved = sessionStorage.getItem("arcus-auth");
      if (!saved) return;
      const s = JSON.parse(saved);
      emit("login", { username: s.username, password: s.password }).then((res: any) => {
        router.replace(res.redirect || redirectFor(res.role));
      });
    } catch {
      /* */
    }
  }, [socket]);

  const login = async () => {
    try {
      setErr("");
      const res: any = await emit("login", { username, password });
      sessionStorage.setItem("arcus-auth", JSON.stringify({ username, password, role: res.role }));
      router.push(res.redirect || redirectFor(res.role));
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const spectate = () => router.push(hello?.defaultAuction ? `/live/${hello.defaultAuction}` : "/live");

  return (
    <Shell title="Login">
      <div className="grid items-stretch gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden p-0">
          <img src="/brand/login-hero.jpg" alt="ArcusVerse" className="h-full min-h-[320px] w-full object-cover" />
        </Card>
        <Card className="space-y-4 p-6 md:p-8">
          <h1 className="font-display text-5xl">Sign in</h1>
          <p className="text-base" style={{ color: "var(--muted)" }}>
            Bid. Compete. Celebrate. Use your username and password, or watch as a spectator.
          </p>
          <Field label="Username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          <Field
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            onKeyDown={(e) => e.key === "Enter" && login()}
          />
          {err && <p style={{ color: "var(--crimson)" }}>{err}</p>}
          <Button variant="turf" className="w-full" onClick={login}>
            Log in
          </Button>
          <div className="relative py-2 text-center text-sm" style={{ color: "var(--muted)" }}>
            or
          </div>
          <Button className="w-full" onClick={spectate}>
            Continue as spectator
          </Button>
          <div className="neu-sm space-y-2 p-4">
            <p className="text-sm font-bold">Spectator URL — share this link (any network)</p>
            {withCode.map((u) => (
              <p key={u} className="break-all text-sm" style={{ color: "var(--accent)" }}>
                {u}
              </p>
            ))}
            {hello?.appUrl ? (
              <p className="mt-2 break-all text-xs" style={{ color: "var(--muted)" }}>
                Staff / owners sign in at {hello.appUrl}
              </p>
            ) : null}
          </div>
        </Card>
      </div>
    </Shell>
  );
}
