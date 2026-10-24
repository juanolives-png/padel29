"use client";
import { useMemo } from "react";
import { generate, slotsOf, withDefaults, type TConfig, type Win } from "@/lib/tournament";

export type Sched = { courts: number; matchMin: number; hours: Record<string, Win> };
const DAYS: Record<string, [string, string][]> = {
  zonas: [["vie", "Viernes · zonas"], ["sab", "Sábado · zonas"], ["dom", "Domingo · playoffs"]],
  liga: [["dia", "Horario de cada fecha"]],
  americano: [["dia", "Horario de la noche"]],
};
const DUR = [20, 25, 30, 40, 45, 60, 75, 90, 105, 120];

/** Canchas, duración del partido y horario de inicio/fin de cada día, con el cálculo de cuántos partidos entran */
export default function TournamentSettings({ format, value, onChange, preview }: { format: string; value: Sched; onChange: (v: Sched) => void; preview?: TConfig }) {
  const days = DAYS[format] || DAYS.zonas;
  const info = useMemo(() => {
    if (!preview) return null;
    const fx = generate(format, { ...preview, ...value });
    if (fx.kind === "zonas") {
      const cap = (["vie", "sab"] as const).reduce((s, d) => s + slotsOf(value.hours[d], value.matchMin).length * value.courts, 0);
      return { txt: `${fx.zoneMatches.length} partidos de zona · entran ${cap} (${value.courts} cancha${value.courts > 1 ? "s" : ""} × turnos de ${value.matchMin} min)`, warn: fx.warn, conflicts: fx.zoneMatches.filter(m => m.conflict && m.time !== "A definir").length };
    }
    const n = fx.rounds.flatMap(r => r.matches).length;
    return { txt: format === "liga" ? `${fx.rounds.length} fechas de ${fx.rounds[0].matches.length} partidos · cada fecha de ${fx.rounds[0].matches[0].time} a ${fx.rounds[0].matches.at(-1)!.time}` : `${n} partidos en ${fx.rounds.length} rondas · última ronda ${fx.rounds.at(-1)!.matches[0].time}`, warn: fx.warn, conflicts: 0 };
  }, [format, value, preview]);
  const setH = (k: string, f: "start" | "end", v: string) => onChange({ ...value, hours: { ...value.hours, [k]: { ...value.hours[k], [f]: v } } });
  return <div className="stack" style={{ gap: 12 }}>
    <div className="grid2" style={{ gap: 10 }}>
      <div className="field"><label htmlFor="tcourts">Canchas para el torneo</label>
        <div className="stepper"><button type="button" aria-label="Una cancha menos" onClick={() => onChange({ ...value, courts: Math.max(1, value.courts - 1) })}>−</button><input id="tcourts" inputMode="numeric" value={value.courts} onChange={e => onChange({ ...value, courts: Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1) })} /><button type="button" aria-label="Una cancha más" onClick={() => onChange({ ...value, courts: value.courts + 1 })}>+</button></div></div>
      <div className="field"><label htmlFor="tdur">Duración de cada partido</label>
        <select id="tdur" value={value.matchMin} onChange={e => onChange({ ...value, matchMin: Number(e.target.value) })}>{[...new Set([...DUR, value.matchMin])].sort((a, b) => a - b).map(d => <option key={d} value={d}>{d >= 60 ? `${Math.floor(d / 60)} h${d % 60 ? " " + (d % 60) + " min" : ""}` : d + " min"}</option>)}</select></div>
    </div>
    <div className="hours">{days.map(([k, l]) => <div key={k} className="hrow"><span>{l}</span>
      <label><small>Empieza</small><input type="time" value={value.hours[k]?.start || ""} onChange={e => setH(k, "start", e.target.value)} aria-label={`${l}: hora de inicio`} /></label>
      <label><small>Termina</small><input type="time" value={value.hours[k]?.end || ""} onChange={e => setH(k, "end", e.target.value)} aria-label={`${l}: hora de fin`} /></label>
      <em>{slotsOf(value.hours[k], value.matchMin).length} turnos</em></div>)}</div>
    {info && <div className={"cap " + (info.warn ? "bad" : "ok")}><b>{info.warn ? "⚠ " : "✓ "}{info.txt}</b>{info.warn && <span>{info.warn}</span>}{!info.warn && info.conflicts > 0 && <span>{info.conflicts} partido{info.conflicts > 1 ? "s" : ""} quedan fuera de la disponibilidad de alguna pareja.</span>}</div>}
    <p className="small muted" style={{ margin: 0 }}>Si termina a las 00:00 o más tarde, poné la hora de la madrugada (ej. 01:00): se toma como pasada la medianoche.</p>
  </div>;
}

export function schedOf(format: string, cfg: TConfig): Sched { return withDefaults(format, cfg); }
