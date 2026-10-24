"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SETS_LABEL, ZL, nSets, standingsIndiv, standingsZone, srcName, dayTitle, type Fixture, type Results, type TConfig, type Pair } from "@/lib/tournament";
import { saveScore, saveWinner, updatePairs } from "@/app/admin/actions";

type T = { id: string; name: string; format: string; category: string; config: TConfig; fixture: Fixture; results: Results };
const AV: Record<string, string> = { ambos: "Vie o sáb", sab: "Solo sábado", vie: "Solo viernes" };

export default function TournamentBoard({ t, editable, clubName }: { t: T; editable: boolean; clubName: string }) {
  const router = useRouter(); const [res, setRes] = useState<Results>(t.results); const [, start] = useTransition();
  const [pairs, setPairs] = useState<Pair[]>(t.config.pairs || []); const [who, setWho] = useState(0);
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
        return `🎾 ${clubName} · ${t.name}\n¡Hola ${me}! ${r.title}:\n📅 ${dayTitle(m.date)} · ${m.time} · Cancha ${m.court}\n🤝 Jugás con ${mine.find(x => x !== me)}\n🆚 ${riv.join(" y ")}\nVas ${pos}° en la tabla. Respondé 1 para confirmar o 2 si no podés (te buscamos reemplazo).`;
      }
      return `¡Terminaste el torneo, ${me}! Mirá la tabla final.`;
    }
    const pend = fx.zoneMatches.filter(m => (m.a === me || m.b === me) && !res.winners[m.id]);
    if (pend.length) return `🎾 ${clubName} · ${t.name} · ${t.category}\n¡Hola ${me}! Sus partidos de zona:\n` + pend.map(m => `📅 ${m.day === "vie" ? "Viernes" : "Sábado"} ${m.time} · Cancha ${m.court} vs ${m.a === me ? m.b : m.a}`).join("\n") + `\nSi pasan de zona, juegan el domingo. Respondé 1 para confirmar.`;
    const po = fx.playoffs.find(m => !res.winners[m.id] && (srcName(fx, res, cfg, m.sa) === me || srcName(fx, res, cfg, m.sb) === me));
    return po ? `🏆 ¡Pasaron de zona, ${me}! ${po.label}:\n📅 Domingo ${po.time} · Cancha ${po.court}\n🆚 ${srcName(fx, res, cfg, po.sa) === me ? srcName(fx, res, cfg, po.sb) : srcName(fx, res, cfg, po.sa)}` : `¡Terminaron el torneo, ${me}!`;
  }, [who, res, fx, cfg, people, table, clubName, t.name, t.category]);

  const savePairs = (np: Pair[]) => { setPairs(np); start(async () => { await updatePairs(t.id, np); setRes({ scores: {}, winners: {} }); router.refresh(); }); };

  return (
    <div className="grid2" style={{ gridTemplateColumns: "minmax(0, 1.35fr) minmax(0, 1fr)", alignItems: "start" }}>
      <div className="card stack" style={{ gap: 18 }}>
        <p className="muted small" style={{ margin: 0 }}>{SETS_LABEL[cfg.setsV]} · {t.format === "liga" ? "cambiás de pareja cada fecha y jugás una vez con cada uno · " + cfg.setPts + " punto por set ganado, desempata la diferencia de games" : t.format === "americano" ? "una noche, parejas rotativas" : "zonas viernes y sábado según disponibilidad · playoffs el domingo · pasan los 2 primeros"}</p>
        {fx.kind === "indiv" ? fx.rounds.map(r => <div key={r.title} className="stack" style={{ gap: 8 }}>
          <h3 style={{ fontSize: 18, margin: 0 }}>{r.title} <span className="muted small" style={{ fontFamily: "var(--f-body)", fontWeight: 500 }}>{dayTitle(r.date)}</span></h3>
          {r.matches.map(m => { const s = res.scores[m.id] || []; return <div key={m.id} className="match">
            <div className="teams"><span>{m.a.join(" + ")}</span><span className="vs">vs</span><span className="b">{m.b.join(" + ")}</span></div>
            <div className="sets">{Array.from({ length: t.format === "americano" ? 1 : ns }, (_, i) => <span key={i} className="setbox"><span>{setLabel(i)}</span>
              {editable ? <><input className="sc" type="number" min={0} max={30} inputMode="numeric" aria-label={`${setLabel(i)} ${m.a.join(" y ")}`} value={s[i]?.[0] ?? ""} onChange={e => onScore(m.id, i, 0, e.target.value)} />–<input className="sc" type="number" min={0} max={30} inputMode="numeric" aria-label={`${setLabel(i)} ${m.b.join(" y ")}`} value={s[i]?.[1] ?? ""} onChange={e => onScore(m.id, i, 1, e.target.value)} /></>
                : <b className="num">{s[i]?.[0] ?? "–"}-{s[i]?.[1] ?? "–"}</b>}</span>)}</div>
            <span className="meta">{m.time} · Cancha {m.court}</span></div>; })}
        </div>) : (["vie", "sab"] as const).map(d => <div key={d} className="stack" style={{ gap: 8 }}>
          <h3 style={{ fontSize: 18, margin: 0 }}>{d === "vie" ? "Viernes" : "Sábado"} <span className="muted small" style={{ fontFamily: "var(--f-body)", fontWeight: 500 }}>{dayTitle(fx.dates[d])}</span></h3>
          {fx.zoneMatches.filter(m => m.day === d).map(m => <Match key={m.id} id={m.id} meta={<>{m.time} · Cancha {m.court} · <b>Zona {ZL[m.zone]}</b></>} a={m.a} b={m.b} note={m.note} w={res.winners[m.id]} onWin={editable ? onWin : undefined} />)}
        </div>).concat(fx.kind === "zonas" ? [<div key="dom" className="stack" style={{ gap: 8 }}>
          <h3 style={{ fontSize: 18, margin: 0 }}>Domingo <span className="muted small" style={{ fontFamily: "var(--f-body)", fontWeight: 500 }}>{dayTitle(fx.dates.dom)}</span></h3>
          {fx.playoffs.map(m => <Match key={m.id} id={m.id} meta={<>{m.time} · Cancha {m.court} · <b>{m.label}</b></>} a={srcName(fx, res, cfg, m.sa)} b={srcName(fx, res, cfg, m.sb)} note="" w={res.winners[m.id]} onWin={editable ? onWin : undefined} />)}
        </div>] : [])}
      </div>
      <div className="stack">
        {fx.kind === "indiv" ? <div className="card"><h3>Tabla · {t.category}</h3><div className="scroll-x"><table className="tbl"><thead><tr><th>#</th><th>Jugador</th><th className="r">PJ</th><th className="r">Sets</th><th className="r">GF</th><th className="r">GC</th><th className="r">Dif</th></tr></thead>
          <tbody>{table.map((r, i) => <tr key={r.p}><td>{i + 1}</td><td>{r.p}</td><td className="r">{r.pj}</td><td className="r"><b>{r.sets}</b></td><td className="r">{r.gf}</td><td className="r">{r.gc}</td><td className="r">{r.gf - r.gc > 0 ? "+" : ""}{r.gf - r.gc}</td></tr>)}</tbody></table></div></div>
          : <div className="grid2" style={{ gap: 12 }}>{fx.zones.map((z, zi) => <div key={zi} className="card" style={{ padding: 12 }}><h3 style={{ fontSize: 17 }}>Zona {ZL[zi]}</h3>
            <table className="tbl" style={{ fontSize: 13 }}><tbody>{standingsZone(z.map(p => p.name), fx.zoneMatches.filter(m => m.zone === zi), res, cfg).map((r, i) => <tr key={r.p} style={{ fontWeight: i < 2 ? 700 : 400 }}><td>{i + 1}</td><td>{r.p}</td><td className="r">{r.pts}</td></tr>)}</tbody></table></div>)}</div>}
        {editable && fx.kind === "zonas" && <div className="card stack" style={{ gap: 8 }}><h3 style={{ margin: 0 }}>Parejas y disponibilidad</h3>
          <p className="small muted" style={{ margin: 0 }}>Si una pareja no puede el viernes, cambiale la opción: el cronograma se rearma solo. (Se borran los resultados cargados.)</p>
          {pairs.map((p, i) => <div key={i} className="pe-row"><input defaultValue={p.name} aria-label={`Pareja ${i + 1}`} onBlur={e => { if (e.target.value !== p.name) savePairs(pairs.map((x, j) => j === i ? { ...x, name: e.target.value } : x)); }} />
            <select value={p.av} aria-label={`Disponibilidad de ${p.name}`} onChange={e => savePairs(pairs.map((x, j) => j === i ? { ...x, av: e.target.value as Pair["av"] } : x))}>{Object.entries(AV).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <button className="xbtn" aria-label="Quitar pareja" onClick={() => savePairs(pairs.filter((_, j) => j !== i))}>✕</button></div>)}
          <button className="btn ghost sm" onClick={() => savePairs([...pairs, { name: "Pareja nueva " + (pairs.length + 1), av: "ambos" }])}>+ Agregar pareja</button></div>}
        {editable && <div className="card stack" style={{ gap: 10 }}><h3 style={{ margin: 0 }}>Aviso por WhatsApp</h3>
          <select className="input" value={who} onChange={e => setWho(Number(e.target.value))} aria-label="Ver el mensaje de">{people.map((p, i) => <option key={p + i} value={i}>{p}</option>)}</select>
          <div className="wa-bubble"><div className="m">{notif}</div></div><p className="small muted" style={{ margin: 0 }}>El envío automático por WhatsApp llega cuando conectemos la cuenta de Meta.</p></div>}
      </div>
    </div>
  );
}
function Match({ id, meta, a, b, note, w, onWin }: { id: string; meta: React.ReactNode; a: string; b: string; note: string; w?: "A" | "B"; onWin?: (id: string, w: "A" | "B") => void }) {
  return <div className={"match" + (note ? " moved" : "")}><span className="meta">{meta}</span>
    <span>{a} {onWin ? <button className="wbtn" aria-pressed={w === "A"} onClick={() => onWin(id, "A")}>Ganó</button> : w === "A" ? <span className="pill ok">Ganó</span> : null}</span><span className="vs">vs</span>
    <span className="b">{onWin ? <button className="wbtn" aria-pressed={w === "B"} onClick={() => onWin(id, "B")}>Ganó</button> : w === "B" ? <span className="pill ok">Ganó</span> : null} {b}</span>
    {note && <span className="note">{note}</span>}</div>;
}
