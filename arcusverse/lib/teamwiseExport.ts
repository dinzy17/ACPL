import { lakhsToCr } from "@/lib/format";

export type TeamwisePlayerRow = {
  playerName: string;
  role: string;
  category: string;
  baseCr: number | string;
  soldCr: number | string;
  source: string;
};

export type TeamwiseTeam = {
  teamId: string;
  teamName: string;
  color?: string;
  players: TeamwisePlayerRow[];
};

function slug(s: string) {
  return String(s || "auction")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "auction";
}

function sheetName(name: string, used: Set<string>) {
  let base = String(name || "Team").replace(/[\\/?*\[\]:]/g, " ").trim().slice(0, 31) || "Team";
  let out = base;
  let n = 2;
  while (used.has(out.toLowerCase())) {
    const suffix = ` (${n})`;
    out = (base.slice(0, Math.max(1, 31 - suffix.length)) + suffix).slice(0, 31);
    n += 1;
  }
  used.add(out.toLowerCase());
  return out;
}

export function buildTeamwiseTeams(state: any): TeamwiseTeam[] {
  if (!state?.teams) return [];
  return state.teams.map((team: any) => {
    const bought = (state.live?.sold || [])
      .filter((s: any) => s.teamId === team.id)
      .map((s: any) => {
        const p = state.players?.find((x: any) => x.id === s.playerId);
        return {
          playerName: p?.name || "Player",
          role: p?.role || "",
          category: p?.categoryName || "",
          baseCr: lakhsToCr(s.basePrice),
          soldCr: lakhsToCr(s.soldPrice),
          source: "Bought"
        } satisfies TeamwisePlayerRow;
      });
    const retained = (team.retentions || []).map((r: any) => {
      const p = state.players?.find((x: any) => x.id === r.playerId);
      return {
        playerName: p?.name || "Player",
        role: p?.role || "",
        category: p?.categoryName || "",
        baseCr: lakhsToCr(r.basePrice),
        soldCr: lakhsToCr(r.soldPrice),
        source: "Retained"
      } satisfies TeamwisePlayerRow;
    });
    const players = [...retained, ...bought].sort((a, b) =>
      String(a.playerName).localeCompare(String(b.playerName))
    );
    return {
      teamId: team.id,
      teamName: team.name,
      color: team.color,
      players
    };
  });
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function esc(s: unknown) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function teamwiseHtml(state: any, teams: TeamwiseTeam[]) {
  const title = `${state?.auction?.name || "Auction"} — teamwise players`;
  const code = state?.auction?.code || "";
  const blocks = teams
    .map((t) => {
      const rows = t.players.length
        ? t.players
            .map(
              (p) => `<tr>
            <td>${esc(p.playerName)}</td>
            <td>${esc(p.role)}</td>
            <td>${esc(p.category)}</td>
            <td style="text-align:right">₹${esc(p.baseCr)} Cr</td>
            <td style="text-align:right">₹${esc(p.soldCr)} Cr</td>
            <td>${esc(p.source)}</td>
          </tr>`
            )
            .join("")
        : `<tr><td colspan="6" style="color:#64748b;text-align:center;padding:12px">No players</td></tr>`;
      return `<section style="margin:0 0 28px;page-break-inside:avoid">
        <h2 style="margin:0 0 6px;font-size:22px;color:${esc(t.color || "#0f172a")}">${esc(t.teamName)}</h2>
        <p style="margin:0 0 10px;color:#64748b;font-size:12px">${t.players.length} players</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="background:#e2e8f0">
              <th style="text-align:left;padding:8px;border:1px solid #cbd5e1">Player</th>
              <th style="text-align:left;padding:8px;border:1px solid #cbd5e1">Role</th>
              <th style="text-align:left;padding:8px;border:1px solid #cbd5e1">Category</th>
              <th style="text-align:right;padding:8px;border:1px solid #cbd5e1">Base</th>
              <th style="text-align:right;padding:8px;border:1px solid #cbd5e1">Sold</th>
              <th style="text-align:left;padding:8px;border:1px solid #cbd5e1">Source</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </section>`;
    })
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(title)}</title>
  <style>
    body { font-family: Georgia, "Times New Roman", serif; margin: 28px; color: #0f172a; background: #fff; }
    h1 { font-size: 28px; margin: 0 0 4px; }
    .meta { color: #64748b; margin: 0 0 24px; font-size: 13px; }
    table td { padding: 7px 8px; border: 1px solid #e2e8f0; }
    @media print { body { margin: 12mm; } }
  </style>
</head>
<body>
  <h1>${esc(title)}</h1>
  <p class="meta">Code ${esc(code)}${state?.auction?.tournamentName ? ` · ${esc(state.auction.tournamentName)}` : ""}</p>
  ${blocks}
</body>
</html>`;
}

export async function downloadTeamwiseExcel(state: any) {
  const XLSX = await import("xlsx");
  const teams = buildTeamwiseTeams(state);
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();

  const allRows: (string | number)[][] = [["Team", "Player", "Role", "Category", "Base (Cr)", "Sold (Cr)", "Source"]];
  for (const t of teams) {
    for (const p of t.players) {
      allRows.push([t.teamName, p.playerName, p.role, p.category, p.baseCr, p.soldCr, p.source]);
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(allRows), sheetName("All teams", used));

  for (const t of teams) {
    const aoa: (string | number)[][] = [["Player", "Role", "Category", "Base (Cr)", "Sold (Cr)", "Source"]];
    for (const p of t.players) {
      aoa.push([p.playerName, p.role, p.category, p.baseCr, p.soldCr, p.source]);
    }
    if (aoa.length === 1) aoa.push(["(no players)", "", "", "", "", ""]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sheetName(t.teamName, used));
  }

  const filename = `${slug(state?.auction?.code || "auction")}-teamwise.xlsx`;
  XLSX.writeFile(wb, filename);
}

export function downloadTeamwisePdf(state: any) {
  const teams = buildTeamwiseTeams(state);
  const html = teamwiseHtml(state, teams);
  const w = window.open("", "_blank", "noopener,noreferrer,width=960,height=720");
  if (!w) throw new Error("Popup blocked — allow popups to download PDF");
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 350);
}

async function renderTeamwiseCanvas(state: any): Promise<HTMLCanvasElement> {
  const teams = buildTeamwiseTeams(state);
  const html = teamwiseHtml(state, teams);
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const body = bodyMatch?.[1] || html;
  const rowCount = teams.reduce((n, t) => n + Math.max(1, t.players.length), 0) + teams.length * 2;
  const width = 1100;
  const height = Math.max(700, 160 + rowCount * 34 + teams.length * 70);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <foreignObject width="100%" height="100%">
      <div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;background:#ffffff">${body}</div>
    </foreignObject>
  </svg>`;
  const svgUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Could not render roster image"));
    el.src = svgUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0);
  return canvas;
}

export async function downloadTeamwiseImage(state: any, format: "png" | "jpeg") {
  const canvas = await renderTeamwiseCanvas(state);
  const mime = format === "jpeg" ? "image/jpeg" : "image/png";
  const ext = format === "jpeg" ? "jpg" : "png";
  const filename = `${slug(state?.auction?.code || "auction")}-teamwise.${ext}`;
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), mime, format === "jpeg" ? 0.92 : undefined)
  );
  if (!blob) throw new Error("Image export failed");
  downloadBlob(filename, blob);
}
