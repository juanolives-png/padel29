import { addDays, dow, longDate, toMin } from "./time";

/* ---------- disponibilidad ---------- */
export type DayKey = "vie" | "sab";
/** no = no puede · todo = cualquier hora · man/tar/noc = franja · hor = horario puntual desde/hasta */
export type Av = { m: "no" | "todo" | "man" | "tar" | "noc" | "hor"; from?: string; to?: string };
export type Pair = { name: string; av?: "ambos" | "sab" | "vie"; avail?: Record<DayKey, Av> };
export const FRANJA: Record<string, [string, string, string]> = { man: ["Mañana", "08:00", "13:00"], tar: ["Tarde", "13:00", "19:00"], noc: ["Noche", "19:00", "26:00"] };
export const AV_LABEL: Record<Av["m"], string> = { no: "No puede", todo: "Cualquier hora", man: "Mañana (8 a 13)", tar: "Tarde (13 a 19)", noc: "Noche (desde 19)", hor: "Horario…" };
/** convierte el formato viejo (ambos/vie/sab) */
export function pairAvail(p: Pair): Record<DayKey, Av> {
  if (p.avail) return p.avail;
  return { vie: { m: p.av === "sab" ? "no" : "todo" }, sab: { m: p.av === "vie" ? "no" : "todo" } };
}
const DN: Record<DayKey, string> = { vie: "vie", sab: "sáb" };
export function avText(p: Pair) {
  const a = pairAvail(p); const one = (d: DayKey) => { const x = a[d]; return x.m === "todo" ? `${DN[d]}` : x.m === "hor" ? `${DN[d]} ${x.from || "?"}–${x.to || "?"}` : `${DN[d]} ${FRANJA[x.m][0].toLowerCase()}`; };
  const ds = (["vie", "sab"] as DayKey[]).filter(d => a[d].m !== "no");
  if (!ds.length) return "sin días";
  if (ds.length === 2 && a.vie.m === "todo" && a.sab.m === "todo") return "";
  return ds.map(one).join(" · ");
}
/** minutos de fin; un fin menor o igual al inicio cuenta como pasada la medianoche */
const endMin = (start: string, end: string) => { const s = toMin(start), e = toMin(end); return e <= s ? e + 1440 : e; };
const hm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
/** ¿la pareja puede un partido que empieza en `t` (minutos) y dura `dur`? */
export function canPlay(av: Av, t: number, dur: number) {
  if (av.m === "no") return false; if (av.m === "todo") return true;
  if (av.m === "hor") { const f = av.from ? toMin(av.from) : 0; const e = av.to ? endMin(av.from || "00:00", av.to) : 26 * 60; return t >= f && t + dur <= e; }
  // franjas: cuenta la hora de inicio del partido (noche llega hasta las 2 de la mañana)
  const [, a, b] = FRANJA[av.m]; return t >= toMin(a) && t < toMin(b);
}

/* ---------- tipos del fixture ---------- */
export type Win = { start: string; end: string };
export type IndMatch = { id: string; a: string[]; b: string[]; date: string; time: string; court: number };
export type ZoneMatch = { id: string; a: string; b: string; zone: number; day: DayKey; date: string; time: string; court: number; note: string; conflict: boolean };
export type Src = { t: "pos"; zone: number; pos: number } | { t: "win"; id: string };
export type PoMatch = { id: string; label: string; sa: Src; sb: Src; date: string; time: string; court: number };
export type Fixture =
  | { kind: "indiv"; rounds: { title: string; date: string; matches: IndMatch[] }[]; warn?: string }
  | { kind: "zonas"; zones: Pair[][]; zoneMatches: ZoneMatch[]; playoffs: PoMatch[]; dates: { vie: string; sab: string; dom: string }; warn?: string };
export type Results = { scores: Record<string, (number | null)[][]>; winners: Record<string, "A" | "B"> };
export type TConfig = {
  setsV: "1" | "2" | "2st" | "3"; setPts: number; win: number; lose: number; players?: string[]; pairs?: Pair[]; startDate: string;
  /** canchas que usa el torneo */ courts?: number;
  /** minutos por partido */ matchMin?: number;
  /** horario de inicio y fin por día: vie/sab/dom para zonas, dia para liga y americano */ hours?: Partial<Record<"vie" | "sab" | "dom" | "dia", Win>>;
};

export const SETS_LABEL: Record<string, string> = { "1": "1 set a 6 games", "2": "2 sets (se juegan los dos)", "2st": "2 sets + super tie-break", "3": "3 sets" };
export const nSets = (v: string) => (v === "1" ? 1 : v === "2" ? 2 : 3);
export const ZL = "ABCD";
export const DEFAULTS: Record<string, { courts: number; matchMin: number; hours: TConfig["hours"] }> = {
  zonas: { courts: 4, matchMin: 90, hours: { vie: { start: "18:00", end: "00:00" }, sab: { start: "09:00", end: "00:00" }, dom: { start: "10:00", end: "21:00" } } },
  liga: { courts: 2, matchMin: 90, hours: { dia: { start: "20:00", end: "23:30" } } },
  americano: { courts: 2, matchMin: 20, hours: { dia: { start: "20:00", end: "23:30" } } },
};
export function withDefaults(format: string, cfg: TConfig) {
  const d = DEFAULTS[format] || DEFAULTS.zonas;
  return { courts: Math.max(1, Math.round(cfg.courts || d.courts)), matchMin: Math.max(10, Math.round(cfg.matchMin || d.matchMin)), hours: { ...d.hours, ...(cfg.hours || {}) } as Record<string, Win> };
}
/** horarios de inicio posibles en un día: cada `dur` minutos, terminando antes del fin */
export function slotsOf(w: Win | undefined, dur: number) {
  if (!w) return [] as number[];
  const s = toMin(w.start), e = endMin(w.start, w.end), out: number[] = [];
  for (let t = s; t + dur <= e; t += dur) out.push(t);
  return out;
}

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
  const { courts, matchMin, hours } = withDefaults(format, cfg);
  if (format === "liga" || format === "americano") {
    const players = (cfg.players || []).slice(0, 8); while (players.length < 8) players.push("Jugador " + (players.length + 1));
    const slots = slotsOf(hours.dia, matchMin); let id = 0, warn = "";
    // con 1 cancha, los 2 partidos de la ronda van uno después del otro
    const perRound = Math.ceil(2 / courts);
    const rounds = rotatingRounds(players).map((ms, r) => {
      const date = format === "liga" ? addDays(cfg.startDate, 7 * r) : cfg.startDate;
      const base = format === "liga" ? 0 : r * perRound;
      return { title: (format === "liga" ? "Fecha " : "Ronda ") + (r + 1), date, matches: ms.map((m, j) => {
        const si = base + Math.floor(j / courts), t = slots[si];
        if (t === undefined) warn = "No entran todos los partidos en el horario: ampliá el horario, sumá canchas o acortá los partidos.";
        return { id: "m" + id++, a: m.a, b: m.b, date, time: t === undefined ? "A definir" : hm(t), court: (j % courts) + 1 };
      }) };
    });
    return { kind: "indiv", rounds, warn };
  }
  // zonas
  const ps = (cfg.pairs || []).filter(p => p.name.trim());
  const nz = ps.length <= 8 ? 2 : 4, zones: Pair[][] = Array.from({ length: nz }, () => []);
  ps.forEach((p, i) => { const r = Math.floor(i / nz), c = i % nz; zones[r % 2 ? nz - 1 - c : c].push(p); });
  const vie = cfg.startDate, sab = addDays(vie, 1), dom = addDays(vie, 2);
  const zm = scheduleZones(zones, vie, sab, { courts, matchMin, hours });
  const po = buildPlayoffs(nz, dom, { courts, matchMin, hours });
  const miss = zm.filter(m => m.time === "A definir").length;
  const warn = [miss ? `${miss} partido${miss > 1 ? "s" : ""} de zona no entra${miss > 1 ? "n" : ""} en el horario: ampliá el horario, sumá canchas o acortá los partidos.` : "",
    po.some(m => m.time === "A definir") ? "Los playoffs del domingo no entran en el horario." : ""].filter(Boolean).join(" ");
  return { kind: "zonas", zones, zoneMatches: zm, playoffs: po, dates: { vie, sab, dom }, warn };
}

type Opts = { courts: number; matchMin: number; hours: Record<string, Win> };
export function scheduleZones(zones: Pair[][], vie: string, sab: string, o: Opts): ZoneMatch[] {
  const DAYS: DayKey[] = ["vie", "sab"];
  const slots: Record<DayKey, number[]> = { vie: slotsOf(o.hours.vie, o.matchMin), sab: slotsOf(o.hours.sab, o.matchMin) };
  type M = { id: string; pa: Pair; pb: Pair; zone: number; opts: [DayKey, number][]; day?: DayKey; ti?: number; court?: number; forced?: boolean };
  const ms: M[] = [];
  zones.forEach((z, zi) => roundRobin(z).forEach(r => r.forEach(([a, b]) => {
    const A = pairAvail(a), B = pairAvail(b);
    const opts: [DayKey, number][] = [];
    DAYS.forEach(d => slots[d].forEach((t, ti) => { if (canPlay(A[d], t, o.matchMin) && canPlay(B[d], t, o.matchMin)) opts.push([d, ti]); }));
    ms.push({ id: "z" + ms.length, pa: a, pb: b, zone: zi, opts });
  })));
  const busy: Record<string, Set<string>> = {}, used: Record<string, number> = {};
  const at = (d: string, i: number) => busy[d + "|" + i] || new Set<string>();
  const tryAt = (m: M, d: DayKey, ti: number, strict: boolean) => {
    const A = m.pa.name, B = m.pb.name;
    if ((used[d + "|" + ti] || 0) >= o.courts) return false;
    if (at(d, ti).has(A) || at(d, ti).has(B)) return false;
    if (strict && [ti - 1, ti + 1].some(j => at(d, j).has(A) || at(d, j).has(B))) return false;
    used[d + "|" + ti] = (used[d + "|" + ti] || 0) + 1; (busy[d + "|" + ti] = busy[d + "|" + ti] || new Set()).add(A).add(B);
    m.day = d; m.ti = ti; m.court = used[d + "|" + ti]; return true;
  };
  const all: [DayKey, number][] = DAYS.flatMap(d => slots[d].map((_, ti) => [d, ti] as [DayKey, number]));
  // primero los que tienen menos opciones
  ms.slice().sort((x, y) => x.opts.length - y.opts.length).forEach(m => {
    if (m.opts.some(([d, ti]) => tryAt(m, d, ti, true))) return;
    if (m.opts.some(([d, ti]) => tryAt(m, d, ti, false))) return;
    if (all.some(([d, ti]) => tryAt(m, d, ti, false))) { m.forced = true; return; }
  });
  return ms.map(m => {
    const restr = [m.pa, m.pb].map(p => [p.name, avText(p)]).filter(([, t]) => t);
    const placed = m.day !== undefined;
    const conflict = !placed || !!m.forced;
    const note = !placed ? (m.opts.length ? "No hay cancha libre en el horario del torneo" : `No coinciden: ${restr.map(([n, t]) => `${n} (${t})`).join(" y ")}`)
      : m.forced ? `Fuera de su disponibilidad: ${restr.map(([n, t]) => `${n} (${t})`).join(" y ")}`
      : restr.length ? `Según disponibilidad: ${restr.map(([n, t]) => `${n} (${t})`).join(" · ")}` : "";
    const day: DayKey = m.day || "sab";
    return { id: m.id, a: m.pa.name, b: m.pb.name, zone: m.zone, day, date: day === "vie" ? vie : sab, time: placed ? hm(slots[day][m.ti!]) : "A definir", court: placed ? m.court! : 0, note, conflict };
  }).sort((x, y) => (x.day === y.day ? 0 : x.day === "vie" ? -1 : 1) || sortT(x.time) - sortT(y.time) || x.court - y.court);
}
/** para ordenar: los horarios de madrugada van al final del día y "A definir" último */
const sortT = (t: string) => t === "A definir" ? 1e5 : toMin(t) < 360 ? toMin(t) + 1440 : toMin(t);

export function buildPlayoffs(nz: number, dom: string, o: Opts): PoMatch[] {
  const pos = (zone: number, p: number): Src => ({ t: "pos", zone, pos: p }), win = (id: string): Src => ({ t: "win", id });
  const rounds: [string, string, Src, Src][][] = nz === 2
    ? [[["s1", "Semi 1", pos(0, 1), pos(1, 2)], ["s2", "Semi 2", pos(1, 1), pos(0, 2)]], [["f", "Final", win("s1"), win("s2")]]]
    : [[["q1", "Cuartos 1", pos(0, 1), pos(1, 2)], ["q2", "Cuartos 2", pos(2, 1), pos(3, 2)], ["q3", "Cuartos 3", pos(1, 1), pos(0, 2)], ["q4", "Cuartos 4", pos(3, 1), pos(2, 2)]],
       [["s1", "Semi 1", win("q1"), win("q2")], ["s2", "Semi 2", win("q3"), win("q4")]], [["f", "Final", win("s1"), win("s2")]]];
  const slots = slotsOf(o.hours.dom, o.matchMin); let si = 0; const out: PoMatch[] = [];
  rounds.forEach(r => {
    r.forEach(([id, label, sa, sb], j) => {
      const k = si + Math.floor(j / o.courts), t = slots[k];
      out.push({ id, label, sa, sb, date: dom, time: t === undefined ? "A definir" : hm(t), court: (j % o.courts) + 1 });
    });
    si += Math.ceil(r.length / o.courts); // la ronda siguiente arranca cuando termina esta
  });
  return out;
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
