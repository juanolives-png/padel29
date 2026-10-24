"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTournament } from "../../actions";
import { nextDow, withDefaults, type Pair, type TConfig } from "@/lib/tournament";
import TournamentSettings, { type Sched } from "@/components/TournamentSettings";
import { useToast } from "@/components/Toast";

const DEF_PLAYERS = "Martín\nLucas\nNico\nFede\nTomi\nGonza\nPato\nAgus";
const DEF_PAIRS = "Pérez / Gómez\nRuiz / Sosa\nDíaz / Molina\nAcosta / Benítez\nRomero / Herrera\nMedina / Castro\nTorres / Luna\nFlores / Ríos";
export default function NewTournament({ today }: { today: string }) {
  const router = useRouter(); const toast = useToast(); const [pending, start] = useTransition();
  const [f, setF] = useState({ name: "Liga de los jueves", format: "liga", category: "6ta", setsV: "2", setPts: 1, win: 3, lose: 1, list: DEF_PLAYERS, startDate: nextDow(today, 4) });
  const [sch, setSch] = useState<Sched>(() => withDefaults("liga", {} as TConfig));
  const setFormat = (format: string) => { setSch(withDefaults(format, {} as TConfig)); setF({ ...f, format, name: format === "liga" ? "Liga de los jueves" : format === "zonas" ? "Torneo de fin de semana" : "Americano del viernes",
    list: format === "zonas" ? DEF_PAIRS : DEF_PLAYERS, setsV: format === "zonas" ? "2st" : format === "americano" ? "1" : "2", startDate: nextDow(today, format === "liga" ? 4 : 5) }); };
  const lines = f.list.split("\n").map(s => s.trim()).filter(Boolean);
  const base: TConfig = { setsV: f.setsV as "1", setPts: f.setPts, win: f.win, lose: f.lose, startDate: f.startDate, ...(f.format === "zonas" ? { pairs: lines.map(name => ({ name, avail: { vie: { m: "todo" }, sab: { m: "todo" } } }) as Pair) } : { players: lines }) };
  const submit = () => start(async () => {
    const config = { ...base, ...sch };
    const r = await createTournament({ name: f.name, format: f.format, category: f.category, config });
    toast.show(r.msg, !r.ok); if (r.ok) router.push(`/admin/torneos/${r.id}`);
  });
  return <form className="card stack" onSubmit={e => { e.preventDefault(); submit(); }}>
    <h3 style={{ margin: 0 }}>Nuevo torneo</h3>
    <div className="field"><label htmlFor="tf">Formato</label><select id="tf" value={f.format} onChange={e => setFormat(e.target.value)}>
      <option value="liga">Liga semanal individual · cambiás de pareja cada fecha</option><option value="zonas">Fin de semana por parejas · zonas vie/sáb + playoffs dom</option><option value="americano">Americano · 8 jugadores, una noche</option></select></div>
    <div className="field"><label htmlFor="tn">Nombre</label><input id="tn" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></div>
    <div className="grid2" style={{ gap: 10 }}>
      <div className="field"><label htmlFor="tc">Categoría</label><select id="tc" value={f.category} onChange={e => setF({ ...f, category: e.target.value })}>{["8va", "7ma", "6ta", "5ta", "4ta", "3ra", "Damas", "Mixto", "Suma 13"].map(c => <option key={c}>{c}</option>)}</select></div>
      <div className="field"><label htmlFor="ts">Partidos</label><select id="ts" value={f.setsV} onChange={e => setF({ ...f, setsV: e.target.value })} disabled={f.format === "americano"}><option value="2">2 sets (se juegan los dos)</option><option value="1">1 set a 6 games</option><option value="2st">2 sets + super tie-break</option><option value="3">3 sets</option></select></div>
    </div>
    <div className="field"><label htmlFor="td">{f.format === "zonas" ? "Viernes de inicio" : "Primera fecha"}</label><input id="td" type="date" value={f.startDate} onChange={e => setF({ ...f, startDate: e.target.value })} /></div>
    {f.format === "zonas" ? <div className="grid2" style={{ gap: 10 }}><div className="field"><label htmlFor="tw">Pts por ganar</label><input id="tw" type="number" value={f.win} onChange={e => setF({ ...f, win: Number(e.target.value) })} /></div><div className="field"><label htmlFor="tl">Pts por perder</label><input id="tl" type="number" value={f.lose} onChange={e => setF({ ...f, lose: Number(e.target.value) })} /></div></div>
      : <div className="field"><label htmlFor="tp">Puntos por set ganado</label><input id="tp" type="number" value={f.setPts} onChange={e => setF({ ...f, setPts: Number(e.target.value) })} /><span className="small muted">Desempata la diferencia de games.</span></div>}
    <fieldset className="tset"><legend>Horarios, canchas y duración</legend><TournamentSettings format={f.format} value={sch} onChange={setSch} preview={base} /></fieldset>
    <div className="field"><label htmlFor="tlst">{f.format === "zonas" ? "Parejas (una por línea; los días y horarios que puede cada una se cargan después)" : "Jugadores (uno por línea, 8)"}</label><textarea id="tlst" rows={9} value={f.list} onChange={e => setF({ ...f, list: e.target.value })} /></div>
    <button className="btn block" disabled={pending}>{pending ? "Armando…" : "Armar fixture"}</button>{toast.node}
  </form>;
}
