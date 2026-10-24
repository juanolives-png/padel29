"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SETS_LABEL, ZL, nSets, standingsIndiv, standingsZone, srcName, dayTitle, pairAvail, withDefaults, AV_LABEL, type Fixture, type Results, type TConfig, type Pair, type Av, type DayKey } from "@/lib/tournament";
import TournamentSettings, { type Sched } from "./TournamentSettings";
import { saveScore, saveWinner, updatePairs, updateTournamentConfig } from "@/app/admin/actions";

type T = { id: string; name: string; format: string; category: string; config: TConfig; fixture: Fixture; results: Results };
const where = (time: string, court: number) => time === "A definir" ? "Horario a definir" : `${time} · Cancha ${court}`;

export default function TournamentBoard({ t, editable, clubName }: { t: T; editable: boolean; clubName: string }) {
  const router = useRouter(); const [res, setRes] = useState<Results>(t.results); const [, start] = useTransition();
  const [pairs, setPairs] = useState<Pair[]>(t.config.pairs || []); const [who, setWho] = useState(0);
  const [sch, setSch] = useState<Sched>(() => withDefaults(t.format, t.config)); const [schDirty, setSchDirty] = useState(false); const [msg, setMsg] = useState("");
  const fx = t.fixture, cfg = t.config, ns = nSets(cfg.setsV);
  const setLabel = (i: number) => (cfg.setsV === "2st" && i === 2 ? "STB" : t.format === "americano" ? "Games" : "Set " + (i + 1));
  const onScore = (mid: string, i: number, side: number, v: string) => {
    const s = (res.scores[mid] || []).map(x => [...x]); while (s.length < ns) s.push([null, null]);
    s[i][side] = v === "" ? null : Math.max(0, Number(v)); const nr = { ...res, scores: { ...res.scores, [mid]: s } }; setRes(nr);
    start(() => { saveScore(t.id, mid, s); });
  };
  const onWin = (mid: string, w: "A" | "B") => { const cur = res.winners[mid]; const nw = { ...res.winners }; if (cur === w) delete nw[mid]; else nw[mid] = w; setRes({ ...res, winners: nw }); start(() => { saveWinner(t.id, mid, cur === w ? null : w); }); };
  const table = useMemo(() => fx.kind === "indiv" ? standingsIndiv(fx, res, cfg) : [], [fx, res, cfg]);
  const people = fx.kind === "indiv" ? (cfg.players || []) : fx.zones.flat().map(p => p.name);
  const notif = useMemo(() => {
    const me = people[who]; if (!me) return "";
    if (fx.kind === "indiv") {
      for (const r of fx.rounds) for (const m of r.matches) {
        const played = (res.scores[m.id] || []).some(g => g[0] != null && g[1] != null); if (played) continue;
        const inA = m.a.includes(me), inB = m.b.includes(me); if (!inA && !inB) continue;
        const mine = inA ? m.a : m.b, riv = inA ? m.b : m.a, pos = table.findIndex(x => x.p === me) + 1;
        return `🎾 ${clubName} · ${t.name}\n¡Hola ${me}! ${r.title}:\n📅 ${dayTitle(m.date)} · ${where(m.time, m.court)}\n🤝 Jugás con ${mine.find(x => x !== me)}\n🆚 ${riv.join(" y ")}\nVas ${pos}° en la tabla. Respondé 1 para confirmar o 2 si no podés (te buscamos reemplazo).`;
      }
      return `¡Terminaste el torneo, ${me}! Mirá la tabla final.`;
    }
    const pend = fx.zoneMatches.filter(m => (m.a === me || m.b === me) && !res.winners[m.id]);
    if (pend.length) return `🎾 ${clubName} · ${t.name} · ${t.category}\n¡Hola ${me}! Sus partidos de zona:\n` + pend.map(m => `📅 ${m.day === "vie" ? "Viernes" : "Sábado"} ${where(m.time, m.court)} vs ${m.a === me ? m.b : m.a}`).join("\n") + `\nSi pasan de zona, juegan el domingo. Respondé 1 para confirmar.`;
    const po = fx.playoffs.find(m => !res.winners[m.id] && (srcName(fx, res, cfg, m.sa) === me || srcName(fx, res, cfg, m.sb) === me));
    return po ? `🏆 ¡Pasaron de zona, ${me}! ${po.label}:\n📅 Domingo ${where(po.time, po.court)}\n🆚 ${srcName(fx, res, cfg, po.sa) === me ? srcName(fx, res, cfg, po.sb) : srcName(fx, res, cfg, po.sa)}` : `¡Terminaron el torneo, ${me}!`;
  }, [who, res, fx, cfg, people, table, clubName, t.name, t.category]);

  const savePairs = (np: Pair[]) => { setPairs(np); start(async () => { await updatePairs(t.id, np); setRes({ scores: {}, winners: {} }); router.refresh(); }); };

  return (
    <div className="grid2" style={{ gridTemplateColumns: "minmax(0, 1.35fr) minmax(0, 1fr)", alignItems: "start" }}>
      <div className="card stack" style={{ gap: 18 }}>
        {fx.warn && <div className="cap bad"><b>⚠ {fx.warn}</b></div>}
        <p className="muted small" style={{ margin: 0 }}>{SETS_LABEL[cfg.setsV]} · {withDefaults(t.format, cfg).courts} cancha{withDefaults(t.format, cfg).courts > 1 ? "s" : ""} · partidos de {withDefaults(t.format, cfg).matchMin} min · {t.format === "liga" ? "cambiás de pareja cada fecha y jugás una vez con cada uno · " + cfg.setPts + " punto por set ganado, desempata la diferencia de games" : t.format === "americano" ? "una noche, parejas rotativas" : "zonas viernes y sábado según la disponibilidad de cada pareja · playoffs el domingo · pasan los 2 primeros"}</p>
        {fx.kind === "indiv" ? fx.rounds.map(r => <div key={r.title} className="stack" style={{ gap: 8 }}>
          <h3 style={{ fontSize: 18, margin: 0 }}>{r.title} <span className="muted small" style={{ fontFamily: "var(--f-body)", fontWeight: 500 }}>{dayTitle(r.date)}</span></h3>
          {r.matches.map(m => { const s = res.scores[m.id] || []; return <div key={m.id} className="match">
            <div className="teams"><span>{m.a.join(" + ")}</span><span className="vs">vs</span><span className="b">{m.b.join(" + ")}</span></div>
            <div className="sets">{Array.from({ length: t.format === "americano" ? 1 : ns }, (_, i) => <span key={i} className="setbox"><span>{setLabel(i)}</span>
              {editable ? <><input className="sc" type="number" min={0} max={30} inputMode="numeric" aria-label={`${setLabel(i)} ${m.a.join(" y ")}`} value={s[i]?.[0] ?? ""} onChange={e => onScore(m.id, i, 0, e.target.value)} />–<input className="sc" type="number" min={0} max={30} inputMode="numeric" aria-label={`${setLabel(i)} ${m.b.join(" y ")}`} value={s[i]?.[1] ?? ""} onChange={e => onScore(m.id, i, 1, e.target.value)} /></>
                : <b className="num">{s[i]?.[0] ?? "–"}-{s[i]?.[1] ?? "–"}</b>}</span>)}</div>
            <span className="meta">{where(m.time, m.court)}</span></div>; })}
        </div>) : (["vie", "sab"] as const).map(d => <div key={d} className="stack" style={{ gap: 8 }}>
          <h3 style={{ fontSize: 18, margin: 0 }}>{d === "vie" ? "Viernes" : "Sábado"} <span className="muted small" style={{ fontFamily: "var(--f-body)", fontWeight: 500 }}>{dayTitle(fx.dates[d])}</span></h3>
          {fx.zoneMatches.filter(m => m.day === d).map(m => <Match key={m.id} id={m.id} meta={<>{where(m.time, m.court)} · <b>Zona {ZL[m.zone]}</b></>} a={m.a} b={m.b} note={m.note} conflict={m.conflict} w={res.winners[m.id]} onWin={editable ? onWin : undefined} />)}
        </div>).concat(fx.kind === "zonas" ? [<div key="dom" className="stack" style={{ gap: 8 }}>
          <h3 style={{ fontSize: 18, margin: 0 }}>Domingo <span className="muted small" style={{ fontFamily: "var(--f-body)", fontWeight: 500 }}>{dayTitle(fx.dates.dom)}</span></h3>
          {fx.playoffs.map(m => <Match key={m.id} id={m.id} meta={<>{where(m.time, m.court)} · <b>{m.label}</b></>} a={srcName(fx, res, cfg, m.sa)} b={srcName(fx, res, cfg, m.sb)} note="" w={res.winners[m.id]} onWin={editable ? onWin : undefined} />)}
        </div>] : [])}
      </div>
      <div className="stack">
        {fx.kind === "indiv" ? <div className="card"><h3>Tabla · {t.category}</h3><div className="scroll-x"><table className="tbl"><thead><tr><th>#</th><th>Jugador</th><th className="r">PJ</th><th className="r">Sets</th><th className="r">GF</th><th className="r">GC</th><th className="r">Dif</th></tr></thead>
          <tbody>{table.map((r, i) => <tr key={r.p}><td>{i + 1}</td><td>{r.p}</td><td className="r">{r.pj}</td><td className="r"><b>{r.sets}</b></td><td className="r">{r.gf}</td><td className="r">{r.gc}</td><td className="r">{r.gf - r.gc > 0 ? "+" : ""}{r.gf - r.gc}</td></tr>)}</tbody></table></div></div>
          : <div className="grid2" style={{ gap: 12 }}>{fx.zones.map((z, zi) => <div key={zi} className="card" style={{ padding: 12 }}><h3 style={{ fontSize: 17 }}>Zona {ZL[zi]}</h3>
            <table className="tbl" style={{ fontSize: 13 }}><tbody>{standingsZone(z.map(p => p.name), fx.zoneMatches.filter(m => m.zone === zi), res, cfg).map((r, i) => <tr key={r.p} style={{ fontWeight: i < 2 ? 700 : 400 }}><td>{i + 1}</td><td>{r.p}</td><td className="r">{r.pts}</td></tr>)}</tbody></table></div>)}</div>}
        {editable && <div className="card stack" style={{ gap: 12 }}><h3 style={{ margin: 0 }}>Horarios, canchas y duración</h3>
          <TournamentSettings format={t.format} value={sch} onChange={v => { setSch(v); setSchDirty(true); }} preview={{ ...cfg, pairs }} />
          {schDirty && <div className="row"><button className="btn sm" onClick={() => start(async () => { const r = await updateTournamentConfig(t.id, sch); setMsg(r.msg); setSchDirty(false); router.refresh(); })}>Guardar y rearmar cronograma</button>
            <button className="btn sm ghost" onClick={() => { setSch(withDefaults(t.format, cfg)); setSchDirty(false); }}>Deshacer</button></div>}
          <p className="small muted" style={{ margin: 0 }}>Los resultados ya cargados se mantienen.{msg ? " · " + msg : ""}</p></div>}
        {editable && fx.kind === "zonas" && <div className="card stack" style={{ gap: 10 }}><h3 style={{ margin: 0 }}>Parejas: cuándo pueden jugar</h3>
          <p className="small muted" style={{ margin: 0 }}>Cargá lo que te dice cada pareja: qué día y en qué franja (mañana, tarde, noche) o un horario puntual. El cronograma se rearma solo.</p>
          {pairs.map((p, i) => { const av = pairAvail(p); const setAv = (d: DayKey, a: Av) => savePairs(pairs.map((x, j) => j === i ? { name: x.name, avail: { ...pairAvail(x), [d]: a } } : x));
            return <div key={i} className="pav">
              <div className="pav-h"><input defaultValue={p.name} aria-label={`Pareja ${i + 1}`} onBlur={e => { if (e.target.value !== p.name) savePairs(pairs.map((x, j) => j === i ? { ...x, name: e.target.value } : x)); }} />
                <button className="xbtn" aria-label={`Quitar ${p.name}`} onClick={() => savePairs(pairs.filter((_, j) => j !== i))}>✕</button></div>
              <div className="pav-d">{(["vie", "sab"] as DayKey[]).map(d => <div key={d} className={"pav-day" + (av[d].m === "no" ? " off" : "")}>
                <span>{d === "vie" ? "Viernes" : "Sábado"}</span>
                <select value={av[d].m} aria-label={`${p.name} el ${d === "vie" ? "viernes" : "sábado"}`} onChange={e => { const m = e.target.value as Av["m"]; setAv(d, m === "hor" ? { m, from: av[d].from || "18:00", to: av[d].to || "21:00" } : { m }); }}>
                  {Object.entries(AV_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                {av[d].m === "hor" && <div className="hor2"><input type="time" defaultValue={av[d].from} aria-label="Desde" onBlur={e => setAv(d, { ...av[d], from: e.target.value })} /><span className="small muted">a</span><input type="time" defaultValue={av[d].to} aria-label="Hasta" onBlur={e => setAv(d, { ...av[d], to: e.target.value })} /></div>}
              </div>)}</div>
            </div>; })}
          <button className="btn ghost sm" onClick={() => savePairs([...pairs, { name: "Pareja nueva " + (pairs.length + 1), avail: { vie: { m: "todo" }, sab: { m: "todo" } } }])}>+ Agregar pareja</button>
          <p className="small muted" style={{ margin: 0 }}>Cambiar la disponibilidad mantiene los resultados. Agregar, quitar o renombrar parejas rearma las zonas y borra los resultados.</p></div>}
        {editable && <div className="card stack" style={{ gap: 10 }}><h3 style={{ margin: 0 }}>Aviso por WhatsApp</h3>
          <select className="input" value={who} onChange={e => setWho(Number(e.target.value))} aria-label="Ver el mensaje de">{people.map((p, i) => <option key={p + i} value={i}>{p}</option>)}</select>
          <div className="wa-bubble"><div className="m">{notif}</div></div><p className="small muted" style={{ margin: 0 }}>El envío automático por WhatsApp llega cuando conectemos la cuenta de Meta.</p></div>}
      </div>
    </div>
  );
}
function Match({ id, meta, a, b, note, conflict, w, onWin }: { id: string; meta: React.ReactNode; a: string; b: string; note: string; conflict?: boolean; w?: "A" | "B"; onWin?: (id: string, w: "A" | "B") => void }) {
  return <div className={"match" + (conflict ? " moved" : "")}><span className="meta">{meta}</span>
    <span>{a} {onWin ? <button className="wbtn" aria-pressed={w === "A"} onClick={() => onWin(id, "A")}>Ganó</button> : w === "A" ? <span className="pill ok">Ganó</span> : null}</span><span className="vs">vs</span>
    <span className="b">{onWin ? <button className="wbtn" aria-pressed={w === "B"} onClick={() => onWin(id, "B")}>Ganó</button> : w === "B" ? <span className="pill ok">Ganó</span> : null} {b}</span>
    {note && <span className={"note" + (conflict ? "" : " info")}>{conflict ? "⚠ " : ""}{note}</span>}</div>;
}
