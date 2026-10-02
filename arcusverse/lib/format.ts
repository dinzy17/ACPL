export const LAKH = 1;
export const CRORE = 100; // lakhs

export function crToLakhs(cr: number | string) {
  const n = Number(cr);
  if (Number.isNaN(n)) return 0;
  return Math.round(n * CRORE * 100) / 100;
}

export function lakhsToCr(lakhs: number | string) {
  const n = Number(lakhs);
  if (Number.isNaN(n)) return 0;
  return Math.round((n / CRORE) * 1000) / 1000;
}

export function parseBaseToLakhs(raw: string | number) {
  const n = Number(raw);
  if (Number.isNaN(n)) return 0;
  return crToLakhs(n);
}

export function inr(lakhs: number | null | undefined) {
  if (lakhs == null || Number.isNaN(Number(lakhs))) return "—";
  const n = Number(lakhs);
  const cr = n / CRORE;
  const text = Number.isInteger(cr) ? String(cr) : cr.toFixed(2).replace(/\.?0+$/, "");
  return `₹${text} Cr`;
}

export function lakhs(n: number | null | undefined) {
  return inr(n);
}

export function denomLabel(purseLakhs: number) {
  return inr(purseLakhs);
}

export function defaultIncrementRows() {
  return [
    { fromCr: "0", toCr: "6", stepL: "20" },
    { fromCr: "6", toCr: "8", stepL: "20" },
    { fromCr: "8", toCr: "10", stepL: "25" },
    { fromCr: "10", toCr: "", stepL: "50" }
  ];
}

export function incrementsToRows(incs: { from: number; to: number; step: number }[] | undefined) {
  if (!incs?.length) return defaultIncrementRows();
  return incs.map((i) => ({
    fromCr: String(lakhsToCr(i.from)),
    toCr: i.to >= 90000 ? "" : String(lakhsToCr(i.to)),
    stepL: String(i.step)
  }));
}

export function rowsToIncrements(rows: { fromCr: string; toCr: string; stepL: string }[]) {
  return rows
    .filter((r) => r.fromCr !== "" && r.stepL !== "")
    .map((r, i, arr) => ({
      from: crToLakhs(r.fromCr),
      to: r.toCr === "" ? (i === arr.length - 1 ? 999999 : crToLakhs(arr[i + 1].fromCr)) : crToLakhs(r.toCr),
      step: Number(r.stepL)
    }));
}

export function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (cells[i] || "").trim();
      row[h.toLowerCase()] = row[h];
    });
    return row;
  });
}

export async function parseTableFile(file: File) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    return parseCsv(await file.text());
  }
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "" });
  return json.map((row) => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) {
      out[k] = String(v ?? "").trim();
      out[k.toLowerCase()] = out[k];
    }
    return out;
  });
}

function splitCsvLine(line: string) {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === "," && !q) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

export function download(filename: string, content: string, type = "text/csv") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function rosterCsv(state: any) {
  const rows = [["Team", "Player", "Role", "Category", "Base (L)", "Sold (L)", "Retained"]];
  const extra = state?.teams?.flatMap((t: any) =>
    (t.retentions || []).map((r: any) => ({
      teamId: t.id,
      playerId: r.playerId,
      basePrice: r.basePrice,
      soldPrice: r.soldPrice,
      retained: true
    }))
  );
  const all = [...(extra || []), ...(state?.live?.sold || [])];
  for (const s of all) {
    const p = state.players.find((x: any) => x.id === s.playerId);
    const t = state.teams.find((x: any) => x.id === s.teamId);
    rows.push([
      t?.name,
      p?.name,
      p?.role,
      p?.categoryName,
      s.basePrice,
      s.soldPrice,
      s.retained ? "Yes" : "No"
    ]);
  }
  return rows.map((r) => r.join(",")).join("\n");
}

export function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function beep(kind: "bid" | "sold" | "warn" | "outbid") {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = kind === "sold" ? 660 : kind === "warn" || kind === "outbid" ? 220 : 440;
    g.gain.value = 0.05;
    o.start();
    o.stop(ctx.currentTime + (kind === "sold" ? 0.4 : 0.12));
  } catch {
    /* ignore */
  }
}

export const ROLE_META: Record<string, { label: string; emoji: string; className: string }> = {
  Batsman: { label: "Batsman", emoji: "🏏", className: "badge-bat" },
  Bowler: { label: "Bowler", emoji: "🍒", className: "badge-bowl" },
  "All-Rounder": { label: "All-rounder", emoji: "⚡", className: "badge-ar" },
  Wicketkeeper: { label: "Wicket-keeper", emoji: "🧤", className: "badge-wk" }
};
