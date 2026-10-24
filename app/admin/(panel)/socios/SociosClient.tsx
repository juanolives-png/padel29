"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { loadSocio, sellPlan, transferPasses } from "../../actions";
import { fmt } from "@/lib/time";

const REASON: Record<string, string> = { compra: "Compra del plan", uso: "Partido (1 pase)", medio_pase_especial: "Partido en horario especial (½)", medio_pase_anticipada: "Reserva anticipada (½)", invitado: "Pase para un invitado", transfer_in: "Transferencia recibida", transfer_out: "Transferencia enviada", referido: "Premio por referido", cancelacion_tardia: "Cancelación con menos de 12 h", devolucion: "Devolución" };
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const num = (n: number) => Number(n).toLocaleString("es-AR");
export default function SociosClient({ plans, socios, rank }: { plans: any[]; socios: any[]; rank: { id: string; name: string; points: number }[] }) {
  const router = useRouter(); const toast = useToast(); const [pending, start] = useTransition();
  const [qq, setQ] = useState(""); const [sell, setSell] = useState(false); const [f, setF] = useState({ name: "", phone: "", planId: plans[2]?.id || plans[0]?.id, method: "Efectivo", referrerPhone: "" });
  const [det, setDet] = useState<any>(null); const [tr, setTr] = useState({ phone: "", n: 1 });
  const list = socios.filter(s => !qq || norm(s.name).includes(norm(qq)) || s.phone.includes(qq.replace(/\D/g, "")));
  const open = (id: string) => start(async () => setDet(await loadSocio(id)));
  return <div className="grid2" style={{ gridTemplateColumns: "minmax(0, 1.5fr) minmax(0, 1fr)", alignItems: "start" }}>
    <div className="card stack">
      <div className="between"><h3 style={{ margin: 0 }}>Socios</h3><button className="btn" onClick={() => setSell(true)}>Vender plan</button></div>
      <input className="input" placeholder="Buscar por nombre o celular" value={qq} onChange={e => setQ(e.target.value)} aria-label="Buscar socio" />
      <div className="scroll-x"><table className="tbl"><thead><tr><th>Socio</th><th>Plan</th><th className="r">Pases</th><th className="r">½ especial</th><th className="r">½ anticip.</th><th className="r">Vence</th></tr></thead>
        <tbody>{list.map(s => <tr key={s.id} style={{ cursor: "pointer", opacity: s.active ? 1 : .5 }} onClick={() => open(s.id)}><td><b>{s.name}</b><div className="small muted">{s.phone}</div></td><td><span className={"pill " + s.plan.toLowerCase()}>{s.plan}</span>{!s.active && <span className="pill" style={{ marginLeft: 4 }}>vencido</span>}</td>
          <td className="r"><b>{num(s.passes_left)}</b></td><td className="r">{s.special_left}</td><td className="r">{s.early_left}</td><td className="r small">{new Date(s.expires_at).toLocaleDateString("es-AR")}</td></tr>)}</tbody></table></div>
    </div>
    <div className="stack">
      <div className="card"><h3>Ranking {new Date().getFullYear()}</h3><table className="tbl"><tbody>{rank.map((r, i) => <tr key={r.id}><td style={{ width: 30 }}><b>{i + 1}</b></td><td>{r.name}</td><td className="r"><b>{r.points}</b></td></tr>)}</tbody></table>
        <p className="small muted" style={{ margin: "10px 0 0" }}>100 por partido · 200 en horario especial · 300 por referido. Se suman solos al usar pases y al vender planes referidos.</p></div>
      <div className="card soft small stack" style={{ gap: 6 }}><b>Cómo se usan los pases</b><span>En la cuenta del turno, vinculá al jugador con su celular y tocá “Usar pase”. El sistema decide solo si corresponde 1 pase o medio (horario especial o reserva anticipada) y suma los puntos.</span></div>
    </div>
    {sell && <div className="overlay center" onClick={e => { if (e.target === e.currentTarget) setSell(false); }}><form className="modal" onSubmit={e => { e.preventDefault(); start(async () => { const r = await sellPlan(f); toast.show(r.msg, !r.ok); if (r.ok) { setSell(false); setF({ ...f, name: "", phone: "", referrerPhone: "" }); router.refresh(); } }); }}>
      <h3>Vender plan 29club</h3>
      <div className="chips">{plans.map(p => <button type="button" key={p.id} className="chip" aria-pressed={f.planId === p.id} onClick={() => setF({ ...f, planId: p.id })}>{p.name} · {fmt(p.price)}</button>)}</div>
      {(() => { const p = plans.find(x => x.id === f.planId); return p ? <p className="small muted" style={{ margin: 0 }}>{p.passes} pases · {p.months} meses · {p.special_uses} usos en horario especial{p.early_uses ? ` · ${p.early_uses} anticipadas` : ""}{p.can_transfer ? " · transfiere pases" : ""}{p.invite_uses ? ` · ${p.invite_uses} pases para invitados` : ""}</p> : null; })()}
      <div className="field"><label htmlFor="sn">Nombre y apellido</label><input id="sn" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required /></div>
      <div className="field"><label htmlFor="sp">Celular</label><input id="sp" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} inputMode="tel" required /></div>
      <div className="field"><label htmlFor="sr">¿Lo refirió un socio? Celular (opcional)</label><input id="sr" value={f.referrerPhone} onChange={e => setF({ ...f, referrerPhone: e.target.value })} inputMode="tel" /></div>
      <div className="field"><label htmlFor="sm">Medio de pago</label><select id="sm" value={f.method} onChange={e => setF({ ...f, method: e.target.value })}><option>Efectivo</option><option>Transferencia</option><option>QR Mercado Pago</option></select></div>
      <button className="btn block" disabled={pending}>Cobrar y dar de alta</button><button type="button" className="btn ghost block" onClick={() => setSell(false)}>Cancelar</button></form></div>}
    {det && <div className="overlay right" onClick={e => { if (e.target === e.currentTarget) setDet(null); }}><aside className="drawer" role="dialog" aria-modal="true" aria-label="Socio">
      <div className="between" style={{ alignItems: "start" }}><div><h2 style={{ fontSize: 28 }}>{det.player.name}</h2><p className="muted small" style={{ margin: "4px 0 0" }}>📱 {det.player.phone}</p></div><button className="xbtn" onClick={() => setDet(null)} aria-label="Cerrar">✕</button></div>
      {det.subs.map((s: any) => { const active = new Date(s.expires_at) > new Date(); return <div key={s.id} className="card dark stack" style={{ gap: 10, opacity: active ? 1 : .6 }}>
        <div className="between"><span className={"pill " + s.plan_name.toLowerCase()}>{s.plan_name}</span><span className="small" style={{ opacity: .75 }}>{active ? "Vence" : "Venció"} el {new Date(s.expires_at).toLocaleDateString("es-AR")}</span></div>
        <div style={{ fontFamily: "var(--f-head)", fontSize: 46, fontWeight: 800, color: "var(--acc)", lineHeight: 1 }}>{num(s.passes_left)} <span style={{ fontSize: 18, color: "#fff" }}>pases</span></div>
        <div className="small" style={{ opacity: .8 }}>{s.special_left} de {s.special_uses} en horario especial · {s.early_left} de {s.early_uses} anticipadas{s.invite_uses ? ` · ${s.invite_left} para invitados` : ""} · pagó {fmt(s.price_paid)}{s.referred_by_name ? ` · referido por ${s.referred_by_name}` : ""}</div>
        {active && s.can_transfer && <form className="row" onSubmit={e => { e.preventDefault(); start(async () => { const r = await transferPasses(s.id, tr.phone, tr.n); toast.show(r.msg, !r.ok); if (r.ok) { setDet(await loadSocio(det.player.id)); router.refresh(); } }); }}>
          <input className="input" style={{ width: 70 }} type="number" min={1} value={tr.n} onChange={e => setTr({ ...tr, n: Number(e.target.value) })} aria-label="Cantidad de pases" />
          <input className="input" style={{ flex: 1 }} placeholder="Celular del socio que recibe" inputMode="tel" value={tr.phone} onChange={e => setTr({ ...tr, phone: e.target.value })} aria-label="Celular del socio que recibe" />
          <button className="btn sm">Transferir</button></form>}
      </div>; })}
      <div className="card"><h3>Puntos {new Date().getFullYear()}</h3>{det.pts.length ? det.pts.map((p: any) => <div key={p.reason} className="between small"><span>{p.reason === "partido" ? "Partidos" : p.reason === "partido_especial" ? "Partidos en horario especial" : p.reason === "referido" ? "Referidos" : p.reason}</span><b>{p.pts}</b></div>) : <span className="muted small">Sin puntos todavía.</span>}</div>
      <div className="card"><h3>Movimientos de pases</h3><div className="moves">{det.moves.map((m: any) => <span key={m.id} className="between"><span>{new Date(m.created_at).toLocaleDateString("es-AR")} · {REASON[m.reason] || m.reason}{m.note ? ` · ${m.note}` : ""}</span><b style={{ color: m.amount > 0 ? "var(--ok)" : "var(--ink)" }}>{m.amount > 0 ? "+" : ""}{num(m.amount)}</b></span>)}</div></div>
    </aside></div>}
    {toast.node}
  </div>;
}
