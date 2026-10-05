"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { io, Socket } from "socket.io-client";

type Hello = {
  mode?: string;
  appUrl?: string | null;
  appUrls?: string[];
  lan: string[];
  defaultAuction: string | null;
  spectatorUrls?: string[];
};
type Theme = "light" | "dark";

type Ctx = {
  socket: Socket | null;
  hello: Hello | null;
  connected: boolean;
  theme: Theme;
  setTheme: (t: Theme) => void;
  sport: string;
  setSport: (s: string) => void;
  emit: <T = unknown>(event: string, payload?: unknown, opts?: { timeoutMs?: number }) => Promise<T>;
  logout: () => void;
};

const C = createContext<Ctx | null>(null);

export function Providers({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [hello, setHello] = useState<Hello | null>(null);
  const [connected, setConnected] = useState(false);
  const [theme, setThemeState] = useState<Theme>("light");
  const [sport, setSport] = useState("Cricket");

  useEffect(() => {
    const saved = (localStorage.getItem("arcus-theme") as Theme) || "light";
    setThemeState(saved);
    document.documentElement.classList.toggle("dark", saved === "dark");
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    localStorage.setItem("arcus-theme", t);
    document.documentElement.classList.toggle("dark", t === "dark");
  };

  useEffect(() => {
    const s = io({
      transports: ["websocket", "polling"]
    });
    setSocket(s);
    s.on("connect", () => {
      setConnected(true);
      try {
        const saved = sessionStorage.getItem("arcus-auth");
        if (!saved) return;
        const a = JSON.parse(saved);
        s.emit("login", { username: a.username, password: a.password, code: a.code });
      } catch {
        /* */
      }
    });
    s.on("disconnect", () => setConnected(false));
    s.on("hello", (h: Hello) => setHello(h));
    return () => {
      s.close();
    };
  }, []);

  const emit = <T,>(event: string, payload?: unknown, opts?: { timeoutMs?: number }) =>
    new Promise<T>((resolve, reject) => {
      if (!socket) return reject(new Error("Not connected"));
      const timeoutMs = opts?.timeoutMs ?? (event === "upload" ? 90000 : 15000);
      const timer = setTimeout(
        () =>
          reject(
            new Error(
              event === "upload"
                ? "Upload timed out — try a smaller JPG/PNG (under 2 MB)"
                : "No response from server"
            )
          ),
        timeoutMs
      );
      socket.emit(event, payload || {}, (res: { ok?: boolean; error?: string } & T) => {
        clearTimeout(timer);
        if (res && res.ok === false) reject(new Error(res.error || "Failed"));
        else resolve(res);
      });
    });

  const logout = () => {
    sessionStorage.removeItem("arcus-staff");
    sessionStorage.removeItem("arcus-auth");
    sessionStorage.removeItem("arcus-owner");
    sessionStorage.removeItem("arcus-auctioneer");
    sessionStorage.removeItem("arcus-spectator");
    window.location.href = "/";
  };

  const value = useMemo(
    () => ({ socket, hello, connected, theme, setTheme, sport, setSport, emit, logout }),
    [socket, hello, connected, theme, sport]
  );

  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useApp() {
  const c = useContext(C);
  if (!c) throw new Error("useApp");
  return c;
}
