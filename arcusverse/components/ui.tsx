"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useApp } from "./Providers";
import { SportBackdrop } from "./SportBackdrop";

export const TEAM_COLORS = [
  { name: "Sky", value: "#0284C7" },
  { name: "Electric", value: "#2563EB" },
  { name: "Ice", value: "#38BDF8" },
  { name: "Teal", value: "#0E7490" },
  { name: "Navy", value: "#1E3A8A" },
  { name: "Cyan", value: "#06B6D4" },
  { name: "Indigo", value: "#4338CA" },
  { name: "Slate", value: "#334155" },
  { name: "Crimson", value: "#E11D48" }
];

export function Shell({
  title,
  subtitle,
  children,
  nav,
  showLogout = false,
  backHref,
  homeHref,
  onHome
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  nav?: { href: string; label: string }[];
  showLogout?: boolean;
  /** Optional fixed fallback if browser history cannot go back */
  backHref?: string;
  /** When set, shows a Home control (uses onHome if provided, else navigates) */
  homeHref?: string;
  onHome?: () => void;
}) {
  const { connected, hello, theme, setTheme, logout, sport } = useApp();
  const path = usePathname();
  const router = useRouter();
  const isActive = (href: string) => (href === "/admin" ? path === "/admin" : path === href || path.startsWith(href + "/"));
  const showBack = path !== "/";

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    if (backHref) {
      router.push(backHref);
      return;
    }
    if (path.startsWith("/admin/")) router.push("/admin");
    else router.push("/");
  };

  const goHome = () => {
    if (onHome) {
      onHome();
      return;
    }
    if (homeHref) router.push(homeHref);
  };

  return (
    <div className="relative min-h-screen px-4 py-5 md:px-8">
      <SportBackdrop sport={sport} />
      <header className="topbar relative z-10 mx-auto mb-6 flex max-w-[1400px] flex-wrap items-center justify-between gap-2 px-4 py-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          <Link href="/" className="mr-3 flex shrink-0 items-center gap-2 px-1 py-1">
            <img src="/brand/logo.jpg" alt="ArcusVerse" className="h-12 w-12 rounded-xl object-cover" />
            <span className="font-display text-3xl leading-none" style={{ color: "var(--accent)" }}>
              ArcusVerse
            </span>
          </Link>
          {nav?.map((item) => (
            <Link key={item.href} href={item.href} className={`nav-link ${isActive(item.href) ? "active" : ""}`}>
              {item.label}
            </Link>
          ))}
          {homeHref && (
            <button
              type="button"
              onClick={goHome}
              className={`nav-link ${!nav?.length && path === homeHref ? "active" : ""}`}
            >
              Home
            </button>
          )}
          {!nav?.length && (
            <span className="text-[11px] uppercase tracking-[0.28em]" style={{ color: "var(--muted)" }}>
              {title}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {subtitle && (
            <span className="hidden text-sm md:inline" style={{ color: "var(--muted)" }}>
              {subtitle}
            </span>
          )}
          <span className="neu-sm px-3 py-1 text-xs font-semibold">{connected ? "Live LAN" : "Reconnecting"}</span>
          <button className="btn px-4 py-2 text-xs font-bold uppercase tracking-wider" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? "Light" : "Dark"}
          </button>
          {showLogout && (
            <button className="btn px-4 py-2 text-xs font-bold uppercase tracking-wider" onClick={logout}>
              Log out
            </button>
          )}
        </div>
      </header>
      {hello?.mode === "public" && hello?.appUrl ? (
        <div className="relative z-10 mx-auto mb-4 max-w-[1400px] text-xs" style={{ color: "var(--muted)" }}>
          App: {hello.appUrl} · Spectator: {hello.spectatorUrls?.[0] || `${hello.appUrl}/live`}
        </div>
      ) : hello?.lan?.length ? (
        <div className="relative z-10 mx-auto mb-4 max-w-[1400px] text-xs" style={{ color: "var(--muted)" }}>
          Same Wi-Fi: {hello.lan.map((ip) => `http://${ip}:3000`).join(" · ")}
        </div>
      ) : null}
      {showBack ? (
        <div className="relative z-10 mx-auto mb-3 max-w-[1400px]">
          <button type="button" onClick={goBack} className="btn btn-ghost inline-flex px-4 py-2 text-xs font-bold uppercase tracking-wider">
            ← Back
          </button>
        </div>
      ) : null}
      <main className="relative z-10 mx-auto max-w-[1400px]">{children}</main>
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "ghost",
  disabled,
  className = "",
  type = "button"
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "ghost" | "turf" | "lime" | "bid" | "danger";
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
}) {
  const v =
    variant === "turf"
      ? "btn-turf"
      : variant === "lime"
        ? "btn-lime"
        : variant === "bid"
          ? "btn-bid"
          : variant === "danger"
            ? "btn-danger"
            : "btn-ghost";
  return (
    <button type={type} disabled={disabled} onClick={onClick} className={`btn ${v} px-5 py-2.5 text-sm ${className}`}>
      {children}
    </button>
  );
}

export function Card({
  children,
  className = "",
  onClick
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLElement>;
}) {
  return (
    <section className={`neu p-5 ${className}`} onClick={onClick}>
      {children}
    </section>
  );
}

export function Field({
  label,
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className={`block space-y-1 text-[11px] font-semibold uppercase tracking-wider ${className}`} style={{ color: "var(--muted)" }}>
      {label}
      <input {...props} className="field mt-1" />
    </label>
  );
}

export function Select({
  label,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <label className="block space-y-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
      {label}
      <select {...props} className="field mt-1">
        {children}
      </select>
    </label>
  );
}

export function ColorSelect({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block space-y-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
      {label}
      <div className="mt-1 flex flex-wrap gap-2">
        {TEAM_COLORS.map((c) => (
          <button
            key={c.value}
            type="button"
            title={c.name}
            onClick={() => onChange(c.value)}
            className={`h-9 w-9 rounded-full ${value === c.value ? "ring-2 ring-offset-2" : ""}`}
            style={{ background: c.value, boxShadow: "4px 4px 8px var(--neu-dark), -3px -3px 8px var(--neu-light)" }}
          />
        ))}
      </div>
      <p className="pt-1 text-xs normal-case tracking-normal">{TEAM_COLORS.find((c) => c.value === value)?.name || value}</p>
    </label>
  );
}

/** Downscale/compress images before upload so socket payloads stay under limits. */
export async function compressImageDataUrl(dataUrl: string, file: File, maxEdge = 1200, quality = 0.72): Promise<string> {
  const looksImage = file.type.startsWith("image/") || /\.(jpe?g|png|webp|gif)$/i.test(file.name || "");
  if (!looksImage) return dataUrl;
  // Always compress above ~80KB — phone photos are often huge even when type is missing
  if (file.size && file.size <= 80 * 1024 && file.type.startsWith("image/")) return dataUrl;
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not read image"));
      el.src = dataUrl;
    });
    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return dataUrl;
  }
}

export function FilePick({
  label,
  accept,
  onData,
  compress = true
}: {
  label: string;
  accept?: string;
  onData: (dataUrl: string, file: File) => void | Promise<void>;
  /** When false, keep the original image bytes (important for UPI QR codes). */
  compress?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <label className="block text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
      {label}
      <input
        type="file"
        accept={accept || "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"}
        disabled={busy}
        className="mt-1 block w-full text-xs"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          if (compress && file.size < 2 * 1024) {
            alert("Image is too small or invalid. Please choose a real logo (JPG/PNG, at least a few KB).");
            return;
          }
          if (file.size > 8 * 1024 * 1024) {
            alert("File is too large (max 8 MB). Please choose a smaller image.");
            return;
          }
          try {
            setBusy(true);
            const raw = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result || ""));
              reader.onerror = () => reject(new Error("Could not read file"));
              reader.readAsDataURL(file);
            });
            const dataUrl =
              compress && (file.type.startsWith("image/") || /\.(jpe?g|png|webp|gif)$/i.test(file.name))
                ? await compressImageDataUrl(raw, file, 1000, 0.7)
                : raw;
            await onData(dataUrl, file);
          } catch (err: any) {
            alert(err?.message || "Upload failed");
          } finally {
            setBusy(false);
          }
        }}
      />
      {busy ? (
        <p className="mt-1 text-xs" style={{ color: "var(--accent)" }}>
          Uploading…
        </p>
      ) : null}
    </label>
  );
}

export function adminNav(staff?: string) {
  if (staff === "auctioneer") return [{ href: "/auctioneer", label: "Live desk" }];
  const items = [
    { href: "/admin", label: "Overview" },
    { href: "/admin/tournaments", label: "Tournaments" },
    { href: "/admin/registration", label: "Registration" },
    { href: "/admin/auctions", label: "Auctions" },
    { href: "/admin/teams", label: "Teams" },
    { href: "/admin/owners", label: "Owners" },
    { href: "/admin/players", label: "Players" },
    { href: "/admin/acpl", label: "ACPL Stats" }
  ];
  if (staff === "super") items.push({ href: "/admin/users", label: "Users" });
  items.push({ href: "/admin/settings", label: "Settings" });
  items.push({ href: "/auctioneer", label: "Live desk" });
  return items;
}

export const ADMIN_NAV = adminNav();
