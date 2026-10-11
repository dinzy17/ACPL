"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui";
import { DynamicForm } from "@/components/registration/DynamicForm";
import { SportBackdrop } from "@/components/SportBackdrop";

export default function PublicRegisterPage({ params }: { params: { token: string } }) {
  const token = params.token;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState<any>(null);
  const [confirmation, setConfirmation] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/public/register/${token}`);
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || "Not found");
        if (!cancelled) setPayload(data);
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Failed to load form");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const uploadFile = async (fieldKey: string, dataUrl: string, filename: string) => {
    const res = await fetch(`/api/public/register/${token}/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fieldKey, dataUrl, filename })
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Upload failed");
    return data.fileId as string;
  };

  const onSubmit = async ({ values, fileIds }: { values: Record<string, any>; fileIds: Record<string, string> }) => {
    const res = await fetch(`/api/public/register/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values, fileIds })
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      const err: any = new Error(data.error || "Submission failed");
      err.validation = data.validation;
      throw err;
    }
    setConfirmation(data.registration);
  };

  const accepting = payload?.accepting;

  return (
    <div className="relative min-h-screen px-4 py-8">
      <SportBackdrop sport={payload?.tournament?.sport || "Cricket"} />
      <div className="relative z-10 mx-auto max-w-xl">
        <Card className="space-y-4">
          {loading ? <p>Loading registration…</p> : null}
          {error ? <p style={{ color: "var(--danger, #b91c1c)" }}>{error}</p> : null}

          {!loading && !error && confirmation ? (
            <div className="space-y-3 text-center">
              <h1 className="font-display text-4xl">
                {confirmation.status === "waiting" ? "Registration Submitted!" : "Registration Successful!"}
              </h1>
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                Thank you for registering{confirmation.tournamentName ? ` for ${confirmation.tournamentName}` : ""}.
              </p>
              <div className="neu-sm space-y-1 px-4 py-3 text-left text-sm">
                <p>
                  <strong>Registration ID:</strong> {confirmation.registrationId}
                </p>
                <p>
                  <strong>Category:</strong> {confirmation.category || "—"}
                </p>
                <p>
                  <strong>Registration Number:</strong>{" "}
                  {confirmation.categorySequence || confirmation.sequence}
                  {confirmation.category ? ` (${confirmation.category})` : ""}
                </p>
                <p>
                  <strong>Registered At:</strong> {new Date(confirmation.registeredAt).toLocaleString()}
                </p>
                <p>
                  <strong>Status:</strong>{" "}
                  {confirmation.status === "waiting"
                    ? `Waiting List #${confirmation.waitingPosition}`
                    : "Registered"}
                </p>
              </div>
              {confirmation.status === "waiting" ? (
                <p className="text-sm" style={{ color: "var(--muted)" }}>
                  You will be promoted automatically if a registered player slot becomes available.
                </p>
              ) : null}
            </div>
          ) : null}

          {!loading && !error && !confirmation && accepting && !accepting.ok ? (
            <div className="space-y-2 text-center">
              <h1 className="font-display text-3xl">{payload?.form?.title || "Registration"}</h1>
              <p className="text-base">{accepting.message}</p>
            </div>
          ) : null}

          {!loading && !error && !confirmation && accepting?.ok ? (
            <DynamicForm form={payload.form} uploadFile={uploadFile} onSubmit={onSubmit} />
          ) : null}
        </Card>
      </div>
    </div>
  );
}
