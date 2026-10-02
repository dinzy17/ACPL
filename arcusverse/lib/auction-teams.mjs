/** Normalize registration category labels like "Men's", "mens", "Men". */
export function normalizeCategoryLabel(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .trim();
}

/** Auction franchise representation applies to Men's players only. */
export function isMensCategory(registration) {
  const raw = normalizeCategoryLabel(registration?.category || registration?.values?.category);
  return raw === "men" || raw === "mens" || raw.startsWith("men");
}

/**
 * Group registrations for the Admin → Registration → Auction teams tab.
 * "Not representing a team" includes Men's category players only.
 */
export function groupRegistrationsByAuctionTeam(registrations, { teamOptions = [] } = {}) {
  const optionOrder = Array.isArray(teamOptions) ? [...teamOptions] : [];
  const buckets = new Map();
  const ensure = (key) => {
    if (!buckets.has(key)) buckets.set(key, []);
    return buckets.get(key);
  };
  for (const label of optionOrder) ensure(label);
  for (const r of registrations || []) {
    const representing = String(r.values?.auctionRepresent || "").toLowerCase() === "yes";
    const team = String(r.values?.auctionTeam || "").trim();
    let key;
    if (representing && team) key = team;
    else if (representing && !team) key = "Team not specified";
    else key = "Not representing a team";
    if (key === "Not representing a team" && !isMensCategory(r)) continue;
    ensure(key).push(r);
  }
  const order = [
    ...optionOrder,
    ...[...buckets.keys()].filter((k) => !optionOrder.includes(k) && k !== "Not representing a team" && k !== "Team not specified"),
    "Team not specified",
    "Not representing a team"
  ].filter((k, i, arr) => buckets.has(k) && arr.indexOf(k) === i);

  return order.map((team) => ({
    team,
    players: (buckets.get(team) || []).slice()
  }));
}
