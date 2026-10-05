/** Build a round-robin fixture with optional no-back-to-back ordering and timed slots. */

function circleRoundRobin(teamIds) {
  const ids = [...teamIds];
  if (ids.length < 2) return [];
  if (ids.length % 2 === 1) ids.push(null); // bye
  const n = ids.length;
  const rounds = n - 1;
  const half = n / 2;
  const arr = [...ids];
  const pairs = [];
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < half; i++) {
      const home = arr[i];
      const away = arr[n - 1 - i];
      if (home && away) pairs.push({ homeId: home, awayId: away, round: r });
    }
    const fixed = arr[0];
    const rest = arr.slice(1);
    rest.unshift(rest.pop());
    arr.splice(0, arr.length, fixed, ...rest);
  }
  return pairs;
}

function orderNoBackToBack(pairs) {
  const pending = pairs.map((p, i) => ({ ...p, _i: i }));
  const out = [];
  let last = new Set();
  while (pending.length) {
    let idx = pending.findIndex((m) => !last.has(m.homeId) && !last.has(m.awayId));
    if (idx < 0) idx = 0;
    const next = pending.splice(idx, 1)[0];
    out.push(next);
    last = new Set([next.homeId, next.awayId]);
  }
  return out.map(({ homeId, awayId, round }, order) => ({ homeId, awayId, round, order }));
}

function equalizeRest(ordered) {
  // Greedy: prefer matches that maximize min rest since last appearance for both teams
  const pending = [...ordered];
  const out = [];
  const lastSeen = {};
  let slot = 0;
  while (pending.length) {
    let best = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < pending.length; i++) {
      const m = pending[i];
      const a = lastSeen[m.homeId] == null ? 99 : slot - lastSeen[m.homeId];
      const b = lastSeen[m.awayId] == null ? 99 : slot - lastSeen[m.awayId];
      const score = Math.min(a, b) * 10 + (a + b);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    const next = pending.splice(best, 1)[0];
    out.push({ ...next, order: slot });
    lastSeen[next.homeId] = slot;
    lastSeen[next.awayId] = slot;
    slot += 1;
  }
  return out;
}

export function buildGroupSchedule(teamIds, opts = {}) {
  const matchMinutes = Math.max(5, Number(opts.matchMinutes) || 40);
  const noBackToBack = opts.noBackToBack !== false;
  const equalRest = opts.equalRest !== false;
  const startAt = opts.startAt ? new Date(opts.startAt).getTime() : Date.now();
  const groupId = opts.groupId || null;

  let pairs = circleRoundRobin(teamIds);
  if (noBackToBack) pairs = orderNoBackToBack(pairs);
  else pairs = pairs.map((p, order) => ({ ...p, order }));
  if (equalRest) pairs = equalizeRest(pairs);

  const ms = matchMinutes * 60 * 1000;
  return pairs.map((m, i) => ({
    id: `${groupId || "g"}-${i + 1}`,
    groupId,
    homeId: m.homeId,
    awayId: m.awayId,
    order: i,
    round: m.round ?? null,
    startAt: new Date(startAt + i * ms).toISOString()
  }));
}

export function buildAuctionFixture(groups, opts = {}) {
  const matches = [];
  let cursor = opts.startAt ? new Date(opts.startAt).getTime() : Date.now();
  const matchMinutes = Math.max(5, Number(opts.matchMinutes) || 40);
  for (const g of groups || []) {
    const ids = (g.teamIds || []).filter(Boolean);
    if (ids.length < 2) continue;
    const block = buildGroupSchedule(ids, {
      ...opts,
      groupId: g.id,
      startAt: new Date(cursor).toISOString()
    });
    matches.push(...block);
    if (block.length) {
      cursor = new Date(block[block.length - 1].startAt).getTime() + matchMinutes * 60 * 1000;
    }
  }
  // re-number global order and optionally re-space all matches in one timeline
  if (opts.singleTimeline !== false && matches.length) {
    const start = opts.startAt ? new Date(opts.startAt).getTime() : new Date(matches[0].startAt).getTime();
    const ms = matchMinutes * 60 * 1000;
    let ordered = matches;
    if (opts.equalRest !== false || opts.noBackToBack !== false) {
      // already ordered within groups; keep sequence, just retimestamp globally
    }
    return ordered.map((m, i) => ({
      ...m,
      order: i,
      startAt: new Date(start + i * ms).toISOString()
    }));
  }
  return matches.map((m, i) => ({ ...m, order: i }));
}
