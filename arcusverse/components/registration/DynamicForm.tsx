"use client";

import { useMemo, useState } from "react";
import { Button, Field, Select, compressImageDataUrl } from "@/components/ui";
import { evaluateFieldState, type RegField, type RegRule } from "@/lib/registration/conditions";

type Props = {
  form: {
    title?: string;
    description?: string;
    logo?: string;
    sections?: { key: string; title: string; order?: number }[];
    fields?: RegField[];
    rules?: RegRule[];
    payment?: any;
  };
  mode?: "public" | "preview";
  onSubmit?: (payload: { values: Record<string, any>; fileIds: Record<string, string> }) => Promise<void> | void;
  uploadFile?: (fieldKey: string, dataUrl: string, filename: string) => Promise<string>;
};

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function PaymentInfo({ form, kind }: { form: Props["form"]; kind: "bank" | "upi" }) {
  const payment = form.payment || {};
  if (kind === "bank") {
    const b = payment.bank || {};
    return (
      <div className="neu-sm space-y-1 px-4 py-3 text-sm">
        <p>
          <strong>Account Name:</strong> {b.accountName || "—"}
        </p>
        <p>
          <strong>Account Number:</strong> {b.accountNumber || "—"}
        </p>
        <p>
          <strong>IFSC:</strong> {b.ifsc || "—"}
        </p>
        <p>
          <strong>Bank:</strong> {b.bankName || "—"}
        </p>
      </div>
    );
  }
  const u = payment.upi || {};
  return (
    <div className="neu-sm space-y-2 px-4 py-3 text-sm">
      <p>
        <strong>UPI ID:</strong> {u.upiId || "—"}
      </p>
      <p>
        <strong>Mobile:</strong> {u.mobile || "—"}
      </p>
      {u.qrUrl ? <img src={u.qrUrl} alt="UPI QR" className="mx-auto h-40 w-40 object-contain" /> : null}
    </div>
  );
}

export function DynamicForm({ form, mode = "public", onSubmit, uploadFile }: Props) {
  const fields = useMemo(
    () => [...(form.fields || [])].filter((f) => f.enabled !== false).sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0)),
    [form.fields]
  );
  const sections = useMemo(
    () => [...(form.sections || [])].sort((a, b) => (a.order || 0) - (b.order || 0)),
    [form.sections]
  );
  const [values, setValues] = useState<Record<string, any>>({});
  const [fileIds, setFileIds] = useState<Record<string, string>>({});
  const [fileNames, setFileNames] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  const { visible, required } = useMemo(
    () => evaluateFieldState(fields, form.rules || [], values),
    [fields, form.rules, values]
  );

  const setVal = (key: string, val: any) => {
    setValues((v) => ({ ...v, [key]: val }));
    setErrors((e) => {
      const next = { ...e };
      delete next[key];
      return next;
    });
  };

  const onFile = async (field: RegField, file: File | null) => {
    if (!file) return;
    const max = field.validation?.maxBytes || 5 * 1024 * 1024;
    if (file.size > max) {
      setErrors((e) => ({ ...e, [field.key]: `Max size ${(max / (1024 * 1024)).toFixed(0)} MB` }));
      return;
    }
    try {
      setBusy(true);
      let dataUrl = await fileToDataUrl(file);
      if (file.type.startsWith("image/")) {
        dataUrl = await compressImageDataUrl(dataUrl, file);
      }
      if (!uploadFile) {
        setErrors((e) => ({ ...e, [field.key]: "Upload not available" }));
        return;
      }
      const id = await uploadFile(field.key, dataUrl, file.name);
      setFileIds((f) => ({ ...f, [field.key]: id }));
      setFileNames((f) => ({ ...f, [field.key]: file.name }));
      setErrors((e) => {
        const next = { ...e };
        delete next[field.key];
        return next;
      });
    } catch (err: any) {
      setErrors((e) => ({ ...e, [field.key]: err.message || "Upload failed" }));
    } finally {
      setBusy(false);
    }
  };

  const clientValidate = () => {
    const next: Record<string, string> = {};
    for (const f of fields) {
      if (f.fieldType === "section" || f.fieldType === "info") continue;
      if (!visible[f.key]) continue;
      const isFile = f.fieldType === "file" || f.fieldType === "image";
      const val = isFile ? fileIds[f.key] : values[f.key];
      const empty = val == null || val === "";
      if (required[f.key] && empty) next[f.key] = `${f.label} is required`;
      if (!empty && f.fieldType === "phone") {
        const digits = String(val).replace(/\D/g, "");
        if (digits.length !== 10) {
          next[f.key] = "Mobile number must be exactly 10 digits";
        } else if (!/^[6-9]\d{9}$/.test(digits)) {
          next[f.key] = f.validation?.message || "Enter a valid 10-digit Indian mobile number";
        }
      }
    }
    setErrors(next);
    return !Object.keys(next).length;
  };

  const submit = async () => {
    setFormError("");
    if (mode === "preview") return;
    if (!clientValidate()) {
      setFormError("Please fix the highlighted fields.");
      return;
    }
    try {
      setBusy(true);
      await onSubmit?.({ values, fileIds });
    } catch (err: any) {
      if (err?.validation) setErrors(err.validation);
      setFormError(err?.message || "Submission failed");
    } finally {
      setBusy(false);
    }
  };

  const renderField = (f: RegField) => {
    if (f.fieldType === "info") {
      if (f.config?.contentFrom === "payment.bank") return <PaymentInfo form={form} kind="bank" />;
      if (f.config?.contentFrom === "payment.upi") return <PaymentInfo form={form} kind="upi" />;
      return null;
    }
    if (f.fieldType === "file" || f.fieldType === "image") {
      const accept =
        f.fieldType === "image"
          ? "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          : "image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf";
      return (
        <div>
          <label className="mb-1 block text-sm font-semibold">
            {f.label}
            {required[f.key] ? " *" : ""}
          </label>
          {f.description ? (
            <p className="mb-1 text-xs" style={{ color: "var(--muted)" }}>
              {f.description}
            </p>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="btn btn-ghost relative flex-1 cursor-pointer px-3 py-2 text-center text-sm">
              Upload from gallery / files
              <input
                type="file"
                accept={accept}
                disabled={busy || mode === "preview"}
                className="absolute inset-0 cursor-pointer opacity-0"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  e.target.value = "";
                  onFile(f, file);
                }}
              />
            </label>
            {f.fieldType === "image" ? (
              <label className="btn btn-ghost relative flex-1 cursor-pointer px-3 py-2 text-center text-sm">
                Take photo
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  disabled={busy || mode === "preview"}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    e.target.value = "";
                    onFile(f, file);
                  }}
                />
              </label>
            ) : null}
          </div>
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            {f.fieldType === "image"
              ? "Use Gallery / files to pick an existing photo, or Take photo for the camera."
              : "Upload from gallery or files (JPG, PNG, or PDF)."}
          </p>
          {fileNames[f.key] ? (
            <p className="mt-1 text-xs" style={{ color: "var(--turf)" }}>
              Uploaded: {fileNames[f.key]}
            </p>
          ) : null}
          {errors[f.key] ? (
            <p className="mt-1 text-xs" style={{ color: "var(--danger, #b91c1c)" }}>
              {errors[f.key]}
            </p>
          ) : null}
        </div>
      );
    }
    if (f.fieldType === "dropdown" || f.fieldType === "single" || f.fieldType === "yesno") {
      const opts = f.options?.length ? f.options : f.fieldType === "yesno" ? ["Yes", "No"] : [];
      if (f.fieldType === "single" || f.fieldType === "yesno") {
        return (
          <div>
            <p className="mb-2 text-sm font-semibold">
              {f.label}
              {required[f.key] ? " *" : ""}
            </p>
            {f.description ? (
              <p className="mb-2 text-xs" style={{ color: "var(--muted)" }}>
                {f.description}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {opts.map((o) => (
                <button
                  key={o}
                  type="button"
                  disabled={busy || mode === "preview"}
                  className="neu-sm px-3 py-2 text-sm"
                  style={
                    values[f.key] === o
                      ? { outline: "2px solid var(--accent)", color: "var(--accent)" }
                      : undefined
                  }
                  onClick={() => setVal(f.key, o)}
                >
                  {o}
                </button>
              ))}
            </div>
            {errors[f.key] ? (
              <p className="mt-1 text-xs" style={{ color: "var(--danger, #b91c1c)" }}>
                {errors[f.key]}
              </p>
            ) : null}
          </div>
        );
      }
      return (
        <Select
          label={`${f.label}${required[f.key] ? " *" : ""}`}
          value={values[f.key] || ""}
          onChange={(e) => setVal(f.key, e.target.value)}
          disabled={busy || mode === "preview"}
        >
          <option value="">Select…</option>
          {opts.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      );
    }
    if (f.fieldType === "paragraph") {
      return (
        <div>
          <label className="mb-1 block text-sm font-semibold">
            {f.label}
            {required[f.key] ? " *" : ""}
          </label>
          <textarea
            className="field min-h-[88px] w-full"
            value={values[f.key] || ""}
            placeholder={f.placeholder}
            disabled={busy || mode === "preview"}
            onChange={(e) => setVal(f.key, e.target.value)}
          />
        </div>
      );
    }
    return (
      <div>
        <Field
          label={`${f.label}${required[f.key] ? " *" : ""}`}
          type={f.fieldType === "date" ? "date" : f.fieldType === "number" || f.fieldType === "currency" ? "number" : f.fieldType === "email" ? "email" : f.fieldType === "phone" ? "tel" : "text"}
          value={values[f.key] || ""}
          placeholder={f.placeholder}
          disabled={busy || mode === "preview"}
          inputMode={f.fieldType === "phone" ? "numeric" : undefined}
          maxLength={f.fieldType === "phone" ? 10 : undefined}
          pattern={f.fieldType === "phone" ? "[0-9]{10}" : undefined}
          onChange={(e) => {
            if (f.fieldType === "phone") {
              const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
              setVal(f.key, digits);
              if (digits.length > 0 && digits.length < 10) {
                setErrors((err) => ({ ...err, [f.key]: "Mobile number must be exactly 10 digits" }));
              }
              return;
            }
            setVal(f.key, e.target.value);
          }}
          onBlur={() => {
            if (f.fieldType !== "phone") return;
            const digits = String(values[f.key] || "").replace(/\D/g, "");
            if (!digits && !required[f.key]) return;
            if (digits.length !== 10) {
              setErrors((err) => ({ ...err, [f.key]: "Mobile number must be exactly 10 digits" }));
            } else if (!/^[6-9]\d{9}$/.test(digits)) {
              setErrors((err) => ({
                ...err,
                [f.key]: f.validation?.message || "Enter a valid 10-digit Indian mobile number"
              }));
            }
          }}
        />
        {errors[f.key] ? (
          <p className="mt-1 text-xs" style={{ color: "var(--danger, #b91c1c)" }}>
            {errors[f.key]}
          </p>
        ) : null}
      </div>
    );
  };

  const fieldsBySection = (key: string) => fields.filter((f) => (f.sectionKey || "main") === key && visible[f.key] !== false);

  return (
    <div className="space-y-6">
      <header className="space-y-3 text-center">
        {form.logo ? (
          <img
            src={form.logo}
            alt={form.title || "Tournament logo"}
            className="mx-auto h-24 w-24 rounded-2xl object-cover sm:h-28 sm:w-28"
          />
        ) : null}
        <h1 className="font-display text-4xl">{form.title}</h1>
        {form.description ? (
          <p className="whitespace-pre-line text-sm" style={{ color: "var(--muted)" }}>
            {form.description}
          </p>
        ) : null}
        {mode === "preview" ? (
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--orange)" }}>
            Preview — submissions disabled
          </p>
        ) : null}
      </header>

      {(sections.length ? sections : [{ key: "main", title: "Details" }]).map((sec) => {
        const secFields = fieldsBySection(sec.key);
        if (!secFields.length) return null;
        return (
          <section key={sec.key} className="space-y-3">
            <h2 className="font-display text-2xl">{sec.title}</h2>
            {secFields.map((f) => (
              <div key={f.id || f.key}>{renderField(f)}</div>
            ))}
          </section>
        );
      })}

      {/* orphan fields without matching section */}
      {fields
        .filter((f) => visible[f.key] !== false && !sections.some((s) => s.key === (f.sectionKey || "main")))
        .map((f) => (
          <div key={f.id || f.key}>{renderField(f)}</div>
        ))}

      {formError ? (
        <p className="text-sm" style={{ color: "var(--danger, #b91c1c)" }}>
          {formError}
        </p>
      ) : null}

      {mode !== "preview" ? (
        <Button variant="bid" disabled={busy} onClick={submit}>
          {busy ? "Submitting…" : "Submit registration"}
        </Button>
      ) : null}
    </div>
  );
}
