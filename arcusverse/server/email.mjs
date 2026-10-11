import nodemailer from "nodemailer";

export const ADMIN_REG_EMAIL = process.env.ADMIN_REG_EMAIL || "omkarsinha4@gmail.com";

let transporter = null;
let warned = false;

function mailEnabled() {
  // Require credentials so a half-configured SMTP_* does not attempt unauthenticated sends.
  if (process.env.SMTP_URL) return true;
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter() {
  if (transporter) return transporter;
  if (!mailEnabled()) {
    if (!warned) {
      console.warn("[email] SMTP not configured (set SMTP_HOST/SMTP_USER/SMTP_PASS). Emails will be logged only.");
      warned = true;
    }
    return null;
  }
  if (process.env.SMTP_URL) {
    transporter = nodemailer.createTransport(process.env.SMTP_URL);
  } else {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || "").toLowerCase() === "true",
      auth:
        process.env.SMTP_USER && process.env.SMTP_PASS
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined
    });
  }
  return transporter;
}

export async function sendMail({ to, subject, html, text, cc, bcc }) {
  const from = process.env.MAIL_FROM || process.env.SMTP_USER || "ArcusVerse <noreply@arcusverse.local>";
  const payload = {
    from,
    to: Array.isArray(to) ? to.join(", ") : to,
    subject,
    html,
    text: text || html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    cc,
    bcc
  };
  const tx = getTransporter();
  if (!tx) {
    console.log("[email:dry-run]", payload.subject, "→", payload.to);
    return { ok: true, dryRun: true };
  }
  const info = await tx.sendMail(payload);
  return { ok: true, messageId: info.messageId };
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Inline SVG donut for HTML emails (no external assets). */
export function svgDonut(segments, size = 160) {
  const total = segments.reduce((s, x) => s + (Number(x.value) || 0), 0) || 1;
  const r = 56;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const colors = ["#2563EB", "#F97316", "#10B981", "#E11D48", "#7C3AED", "#0E7490", "#CA8A04"];
  const arcs = segments
    .map((seg, i) => {
      const v = Number(seg.value) || 0;
      const len = (v / total) * c;
      const stroke = seg.color || colors[i % colors.length];
      const circle = `<circle cx="80" cy="80" r="${r}" fill="none" stroke="${stroke}" stroke-width="28" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 80 80)"/>`;
      offset += len;
      return circle;
    })
    .join("");
  const legend = segments
    .map(
      (seg, i) =>
        `<div style="font-size:12px;margin:2px 0;"><span style="display:inline-block;width:10px;height:10px;background:${seg.color || colors[i % colors.length]};margin-right:6px;border-radius:2px;"></span>${esc(seg.label)}: <strong>${seg.value}</strong></div>`
    )
    .join("");
  return `<div style="display:inline-block;vertical-align:top;margin:8px 16px 8px 0;text-align:center;">
    <svg width="${size}" height="${size}" viewBox="0 0 160 160">${arcs}<circle cx="80" cy="80" r="36" fill="#fff"/><text x="80" y="85" text-anchor="middle" font-size="18" font-family="Nunito,Arial,sans-serif" fill="#111">${total}</text></svg>
    <div style="text-align:left;max-width:${size}px;">${legend}</div>
  </div>`;
}

export function registrationConfirmationHtml({ tournamentName, registration, publicUrl }) {
  const v = registration.values || {};
  const rows = [
    ["Registration ID", registration.registrationId],
    ["Registration Number", registration.categorySequence || registration.sequence],
    ["Category", registration.category || v.category],
    ["Player Name", v.playerName],
    ["Mobile", v.mobile],
    ["Email", v.email],
    ["Status", registration.status === "waiting" ? `Waiting #${registration.waitingPosition}` : "Registered"],
    ["Registered At", new Date(registration.registeredAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })]
  ];
  const body = rows
    .map(([k, val]) => `<tr><td style="padding:6px 10px;color:#64748b;">${esc(k)}</td><td style="padding:6px 10px;"><strong>${esc(val)}</strong></td></tr>`)
    .join("");
  return `<div style="font-family:Nunito,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;">
    <h1 style="color:#2563EB;">Registration received</h1>
    <p>Thank you for registering${tournamentName ? ` for <strong>${esc(tournamentName)}</strong>` : ""}.</p>
    <table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:12px;">${body}</table>
    ${publicUrl ? `<p style="margin-top:16px;font-size:13px;color:#64748b;">Form: ${esc(publicUrl)}</p>` : ""}
    <p style="margin-top:24px;font-size:12px;color:#94a3b8;">ArcusVerse</p>
  </div>`;
}

export async function sendRegistrationEmails({ store, form, registration, appUrl }) {
  const tournament = store.tournaments.find((t) => t.id === form.tournamentId);
  const tournamentName = tournament?.name || form.title || "Tournament";
  const publicUrl = appUrl ? `${appUrl}/register/${form.publicSlug || form.publicToken}` : "";
  const html = registrationConfirmationHtml({
    tournamentName,
    registration: {
      ...registration,
      category: registration.values?.category,
      categorySequence: registration.categorySequence || registration.sequence
    },
    publicUrl
  });
  const userSubject = `Thank you for registering — ${tournamentName} (${registration.registrationId})`;
  const adminSubject = `New registration — ${tournamentName} (${registration.registrationId})`;
  const userEmail = String(registration.values?.email || "").trim();

  const tasks = [];
  if (userEmail) {
    tasks.push(
      sendMail({
        to: userEmail,
        subject: userSubject,
        html,
        bcc: ADMIN_REG_EMAIL
      }).catch((e) => console.error("[email] user confirmation failed", e.message))
    );
  }
  // Always send a dedicated admin copy (even when registrant email is missing / BCC failed)
  tasks.push(
    sendMail({
      to: ADMIN_REG_EMAIL,
      subject: adminSubject,
      html
    }).catch((e) => console.error("[email] admin copy failed", e.message))
  );
  if (!userEmail) {
    console.warn("[email] registrant email missing — thank-you skipped; admin copy still sent");
  }
  await Promise.all(tasks);
}

export function dailyReportHtml({ form, dashboard, tournamentName, dateLabel }) {
  const byCat = Object.entries(dashboard.byCategory || {}).map(([label, value]) => ({ label, value }));
  const byPay = Object.entries(dashboard.byPayment || {}).map(([label, value]) => ({ label, value }));
  const slotRows = Object.entries(dashboard.availableSlotsByCategory || {})
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 10px;">${esc(k)}</td><td style="padding:6px 10px;">${v.registered || 0} / ${v.capacity || "—"}</td><td style="padding:6px 10px;"><strong>${v.available ?? "—"}</strong></td></tr>`
    )
    .join("");
  return `<div style="font-family:Nunito,Arial,sans-serif;max-width:720px;margin:0 auto;color:#0f172a;">
    <h1 style="color:#2563EB;">Daily registration report</h1>
    <p><strong>${esc(tournamentName)}</strong> · ${esc(dateLabel)} (IST)</p>
    <p>Total <strong>${dashboard.total}</strong> · Registered <strong>${dashboard.registered}</strong> · Waiting <strong>${dashboard.waiting}</strong> · Today <strong>${dashboard.today}</strong></p>
    <h2>By category</h2>
    ${svgDonut(byCat.length ? byCat : [{ label: "None", value: 0 }])}
    <h2>By payment</h2>
    ${svgDonut(byPay.length ? byPay : [{ label: "None", value: 0 }])}
    <h2>Available slots (category-wise)</h2>
    <table style="width:100%;border-collapse:collapse;background:#f8fafc;">
      <tr style="text-align:left;color:#64748b;"><th style="padding:6px 10px;">Category</th><th style="padding:6px 10px;">Registered / Capacity</th><th style="padding:6px 10px;">Available</th></tr>
      ${slotRows || `<tr><td style="padding:6px 10px;" colspan="3">No category capacity configured</td></tr>`}
    </table>
  </div>`;
}

export async function sendDailyRegistrationReports(store, { appUrl, dashboardForForm, formIsAccepting } = {}) {
  const openForms = (store.registrationForms || []).filter((f) => {
    if (typeof formIsAccepting === "function") return formIsAccepting(f).ok;
    return f.status === "open";
  });
  if (!openForms.length) {
    console.log("[email] daily report skipped — no open registration forms");
    return { sent: 0 };
  }
  const dateLabel = new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", year: "numeric", month: "long", day: "numeric" });
  let sent = 0;
  for (const form of openForms) {
    const dashboard = dashboardForForm(store, form.id);
    const tournament = store.tournaments.find((t) => t.id === form.tournamentId);
    const html = dailyReportHtml({
      form,
      dashboard,
      tournamentName: tournament?.name || form.title || "Tournament",
      dateLabel
    });
    await sendMail({
      to: ADMIN_REG_EMAIL,
      subject: `[ArcusVerse] Daily registrations — ${tournament?.name || form.title} — ${dateLabel}`,
      html
    });
    sent += 1;
  }
  return { sent };
}

/** Schedule daily report at ~09:00 IST (03:30 UTC). */
export function startDailyRegistrationReportScheduler(getStore, deps) {
  const tick = async () => {
    try {
      const now = new Date();
      // IST = UTC+5:30
      const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
      if (ist.getUTCHours() !== 9 || ist.getUTCMinutes() > 4) return;
      const key = `daily-reg-${ist.toISOString().slice(0, 10)}`;
      if (globalThis.__arcusDailyReportKey === key) return;
      globalThis.__arcusDailyReportKey = key;
      const store = typeof getStore === "function" ? getStore() : getStore;
      await sendDailyRegistrationReports(store, deps);
    } catch (e) {
      console.error("[email] daily report error", e.message);
    }
  };
  // Check every minute
  const id = setInterval(tick, 60 * 1000);
  if (id.unref) id.unref();
  return id;
}
