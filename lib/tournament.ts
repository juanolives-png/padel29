import { addDays, dow, longDate } from "./time";

export type Pair = { name: string; av: "ambos" | "sab" | "vie" };
export type IndMatch = { id: string; a: string[]; b: string[]; date: string; time: string; court: number };
export type ZoneMatch = { id: string; a: string; b: string; zone: number; day: "vie" | "sab"; date: string; time: string; court: number; note: string; conflict: boolean };
export type Src = { t: "pos"; zone: number; pos: number } | { t: "win"; id: string };
export type PoMatch = { id: string; label: string; sa: Src; sb: Src; date: string; time: string; court: number };
export type Fixture =
  | { kind: "indiv"; rounds: { title: string; date: string; matches: IndMatch[] }[] }
  | { kind: "zonas"; zones: Pair[][]; zoneMatches: ZoneMatch[]; playoffs: PoMatch[]; dates: { vie: string; sab: string; dom: string } };
export type Results = { scores: Record<string, (number | null)[][]>; winners: Record<string, "A" | "B"> };
export type TConfig = { setsV: "1" | "2" | "2st" | "3"; setPts: number; win: number; lose: number; players?: string[]; pairs?: Pair[]; startDate: string };

export const SETS_LABEL: Record<string, string> = { "1": "1 set a 6 games", "2": "2 sets (se juegan los dos)", "2st": "2 sets + super tie-break", "3": "3 sets" };
export const nSets = (v: string) => (v === "1" ? 1 : v === "2" ? 2 : 3);
export const ZL = "ABCD";

export function roundRobin<T>(list: T[]): [T, T][][] {
  const a: (T | null)[] = list.slice(); if (a.length % 2) a.push(null);
  const n = a.length, rounds: [T, T][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const ms: [T, T][] = [];
    for (let i = 0; i < n / 2; i++) { const x = a[i], y = a[n - 1 - i]; if (x != null && y != null) ms.push([x, y]); }
    rounds.push(ms); a.splice(1, 0, a.pop()!);
  }
  return rounds;
}
/** 8 jugadores: cada uno juega una vez con cada otro como pareja; se eligen los cruces que menos repiten rivales */
export function rotatingRounds(players: string[]) {
  const opp: Record<string, number> = {}, k = (x: string, y: string) => [x, y].sort().join("|");
  const SPLITS = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]];
  return roundRobin(players).map(pairs => {
    let best = SPLITS[0], bestCost = Infinity;
    SPLITS.forEach(sp => { let c = 0; sp.forEach(([i, j]) => pairs[i].forEach(x => pairs[j].forEach(y => { c += opp[k(x, y)] || 0; }))); if (c < bestCost) { bestCost = c; best = sp; } });
    return best.map(([i, j]) => { pairs[i].forEach(x => pairs[j].forEach(y => { opp[k(x, y)] = (opp[k(x, y)] || 0) + 1; })); return { a: pairs[i], b: pairs[j] }; });
  });
}
export function nextDow(from: string, d: number) { let x = addDays(from, 1); while (dow(x) !== d) x = addDays(x, 1); return x; }

export function generate(format: string, cfg: TConfig): Fixture {
  if (format === "liga" || format === "americano") {
    const players = (cfg.players || []).slice(0, 8); while (players.length < 8) players.push("Jugador " + (players.length + 1));
    let id = 0;
    const rounds = rotatingRounds(players).map((ms, r) => {
      const date = format === "liga" ? addDays(cfg.startDate, 7 * r) : cfg.startDate;
      const time = format === "liga" ? "20:00" : `${String(20 + Math.floor((r * 20) / 60)).padStart(2, "0")}:${String((r * 20) % 60).padStart(2, "0")}`;
      return { title: (format === "liga" ? "Fecha " : "Ronda ") + (r + 1), date, matches: ms.map((m, j) => ({ id: "m" + id++, a: m.a, b: m.b, date, time, court: j + 1 })) };
    });
    return { kind: "indiv", rounds };
  }
  // zonas
  const ps = (cfg.pairs || []).filter(p => p.name.trim());
  const nz = ps.length <= 8 ? 2 : 4, zones: Pair[][] = Array.from({ length: nz }, () => []);
  ps.forEach((p, i) => { const r = Math.floor(i / nz), c = i % nz; zones[r % 2 ? nz - 1 - c : c].push(p); });
  const vie = cfg.startDate, sab = addDays(vie, 1), dom = addDays(vie, 2);
  return { kind: "zonas", zones, zoneMatches: scheduleZones(zones, vie, sab), playoffs: buildPlayoffs(nz, dom), dates: { vie, sab, dom } };
}

const ZT = { vie: ["18:00", "19:30", "21:00", "22:30"], sab: ["09:00", "10:30", "12:00", "13:30", "15:00", "16:30", "18:00", "19:30", "21:00", "22:30"] };
const can = (p: Pair, d: "vie" | "sab") => p.av === "ambos" || p.av === d;
export function scheduleZones(zones: Pair[][], vie: string, sab: string, courts = 4): ZoneMatch[] {
  type M = { id: string; pa: Pair; pb: Pair; zone: number; days: ("vie" | "sab")[]; day?: "vie" | "sab"; ti?: number; court?: number };
  const ms: M[] = [];
  zones.forEach((z, zi) => roundRobin(z).forEach(r => r.forEach(([a, b]) => { ms.push({ id: "z" + ms.length, pa: a, pb: b, zone: zi, days: (["vie", "sab"] as const).filter(d => can(a, d) && can(b, d)) }); })));
  const busy: Record<string, Set<string>> = {}, taken: Record<string, boolean> = {};
  const at = (d: string, i: number) => busy[d + "|" + i] || new Set<string>();
  const place = (m: M, strict: boolean) => {
    const days = m.days.length ? m.days : (["sab"] as const);
    for (const d of days) for (let ti = 0; ti < ZT[d].length; ti++) for (let c = 1; c <= courts; c++) {
      if (taken[d + "|" + ti + "|" + c]) continue;
      const A = m.pa.name, B = m.pb.name;
      if (at(d, ti).has(A) || at(d, ti).has(B)) continue;
      if (strict && [ti - 1, ti + 1].some(j => at(d, j).has(A) || at(d, j).has(B))) continue;
      taken[d + "|" + ti + "|" + c] = true; (busy[d + "|" + ti] = busy[d + "|" + ti] || new Set()).add(A).add(B);
      m.day = d; m.ti = ti; m.court = c; return true;
    }
    return false;
  };
  ms.slice().sort((x, y) => (x.days.length || 3) - (y.days.length || 3)).forEach(m => { if (!place(m, true)) place(m, false); });
  return ms.map(m => {
    const sat = [m.pa, m.pb].filter(p => p.av === "sab").map(p => p.name), fri = [m.pa, m.pb].filter(p => p.av === "vie").map(p => p.name);
    const conflict = !m.days.length;
    const note = conflict ? `Sin día en común: ${fri.join(", ")} solo viernes y ${sat.join(", ")} solo sábado` : m.day === "sab" && sat.length ? `Pasó al sábado: ${sat.join(" y ")} ${sat.length > 1 ? "no pueden" : "no puede"} el viernes` : "";
    return { id: m.id, a: m.pa.name, b: m.pb.name, zone: m.zone, day: m.day!, date: m.day === "vie" ? vie : sab, time: ZT[m.day!][m.ti!], court: m.court!, note, conflict };
  }).sort((x, y) => (x.day === y.day ? 0 : x.day === "vie" ? -1 : 1) || x.time.localeCompare(y.time) || x.court - y.court);
}
export function buildPlayoffs(nz: number, dom: string): PoMatch[] {
  const pos = (zone: number, p: number): Src => ({ t: "pos", zone, pos: p }), win = (id: string): Src => ({ t: "win", id });
  const M = (id: string, label: string, sa: Src, sb: Src, time: string, court: number): PoMatch => ({ id, label, sa, sb, date: dom, time, court });
  if (nz === 2) return [M("s1", "Semi 1", pos(0, 1), pos(1, 2), "16:00", 1), M("s2", "Semi 2", pos(1, 1), pos(0, 2), "16:00", 2), M("f", "Final", win("s1"), win("s2"), "19:00", 1)];
  return [M("q1", "Cuartos 1", pos(0, 1), pos(1, 2), "10:00", 1), M("q2", "Cuartos 2", pos(2, 1), pos(3, 2), "10:00", 2), M("q3", "Cuartos 3", pos(1, 1), pos(0, 2), "10:00", 3), M("q4", "Cuartos 4", pos(3, 1), pos(2, 2), "10:00", 4),
    M("s1", "Semi 1", win("q1"), win("q2"), "16:00", 1), M("s2", "Semi 2", win("q3"), win("q4"), "16:00", 2), M("f", "Final", win("s1"), win("s2"), "19:00", 1)];
}

export function standingsIndiv(fx: Fixture, res: Results, cfg: TConfig) {
  if (fx.kind !== "indiv") return [];
  const st: Record<string, { p: string; pj: number; sets: number; gf: number; gc: number }> = {};
  fx.rounds.flatMap(r => r.matches).forEach(m => [...m.a, ...m.b].forEach(p => { st[p] = st[p] || { p, pj: 0, sets: 0, gf: 0, gc: 0 }; }));
  fx.rounds.forEach(r => r.matches.forEach(m => {
    const s = res.scores[m.id]; if (!s) return; let played = false;
    s.forEach((g, i) => {
      if (g[0] == null || g[1] == null || g[0] === g[1]) return; played = true;
      const stb = cfg.setsV === "2st" && i === 2;
      m.a.forEach(p => { if (g[0]! > g[1]!) st[p].sets += cfg.setPts; if (!stb) { st[p].gf += g[0]!; st[p].gc += g[1]!; } });
      m.b.forEach(p => { if (g[1]! > g[0]!) st[p].sets += cfg.setPts; if (!stb) { st[p].gf += g[1]!; st[p].gc += g[0]!; } });
    });
    if (played) [...m.a, ...m.b].forEach(p => st[p].pj++);
  }));
  return Object.values(st).sort((x, y) => y.sets - x.sets || y.gf - y.gc - (x.gf - x.gc) || y.gf - x.gf || x.p.localeCompare(y.p));
}
export function standingsZone(names: string[], matches: ZoneMatch[], res: Results, cfg: TConfig) {
  const st: Record<string, { p: string; pj: number; pg: number; pts: number }> = {};
  names.forEach(p => (st[p] = { p, pj: 0, pg: 0, pts: 0 }));
  matches.forEach(m => { const r = res.winners[m.id]; if (!r || !st[m.a] || !st[m.b]) return; const w = r === "A" ? m.a : m.b, l = r === "A" ? m.b : m.a;
    st[w].pj++; st[w].pg++; st[w].pts += cfg.win; st[l].pj++; st[l].pts += cfg.lose; });
  return Object.values(st).sort((x, y) => y.pts - x.pts || y.pg - x.pg || x.p.localeCompare(y.p));
}
export function srcName(fx: Fixture, res: Results, cfg: TConfig, s: Src): string {
  if (fx.kind !== "zonas") return "";
  if (s.t === "pos") {
    const zm = fx.zoneMatches.filter(m => m.zone === s.zone), label = `${s.pos}° Zona ${ZL[s.zone]}`;
    if (!zm.every(m => res.winners[m.id])) return label;
    const st = standingsZone(fx.zones[s.zone].map(p => p.name), zm, res, cfg); return st[s.pos - 1]?.p || label;
  }
  const m = fx.playoffs.find(x => x.id === s.id)!, r = res.winners[s.id];
  return r ? srcName(fx, res, cfg, r === "A" ? m.sa : m.sb) : "Ganador " + m.label;
}
export const dayTitle = (d: string) => longDate(d).replace(/^\w/, c => c.toUpperCase());
