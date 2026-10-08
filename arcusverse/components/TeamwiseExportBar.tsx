"use client";

import { useState } from "react";
import { Button, Card } from "@/components/ui";
import {
  downloadTeamwiseExcel,
  downloadTeamwiseImage,
  downloadTeamwisePdf
} from "@/lib/teamwiseExport";

export function TeamwiseExportBar({
  state,
  title = "Download teamwise player lists"
}: {
  state: any;
  title?: string;
}) {
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  if (!state?.auction) return null;

  const run = async (label: string, fn: () => void | Promise<void>) => {
    try {
      setErr("");
      setBusy(label);
      await fn();
    } catch (e: any) {
      setErr(e?.message || "Export failed");
    } finally {
      setBusy("");
    }
  };

  return (
    <Card className="space-y-3 print:hidden">
      <div>
        <h2 className="font-display text-3xl">{title}</h2>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Team-by-team players with base and sold price — Excel, PDF, JPEG, or PNG.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="turf"
          disabled={!!busy}
          onClick={() => run("excel", () => downloadTeamwiseExcel(state))}
        >
          {busy === "excel" ? "Preparing…" : "Excel"}
        </Button>
        <Button disabled={!!busy} onClick={() => run("pdf", () => downloadTeamwisePdf(state))}>
          {busy === "pdf" ? "Preparing…" : "PDF"}
        </Button>
        <Button disabled={!!busy} onClick={() => run("jpeg", () => downloadTeamwiseImage(state, "jpeg"))}>
          {busy === "jpeg" ? "Preparing…" : "JPEG"}
        </Button>
        <Button disabled={!!busy} onClick={() => run("png", () => downloadTeamwiseImage(state, "png"))}>
          {busy === "png" ? "Preparing…" : "PNG"}
        </Button>
      </div>
      {err ? (
        <p className="text-sm font-semibold" style={{ color: "var(--crimson)" }}>
          {err}
        </p>
      ) : null}
    </Card>
  );
}
