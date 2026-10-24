"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import BookingDrawer from "@/components/BookingDrawer";
import type { P } from "@/components/ProductPicker";
import { useToast } from "@/components/Toast";
import { createManual } from "../actions";
import { fmt, toMin } from "@/lib/time";

const SRC: Record<string, string> = { app: "App", manual: "Manual", fijo: "Turno fijo", bot: "WhatsApp", torneo: "Torneo" };
type B = { id: string; court_id: string; start: string; source: string; holder_name: string; sena_paid: number; falta: number; settled: boolean; nPlayers: number; okPlayers: number; hasActivity: boolean; passes: number };
export default function AdminGrid({ date, today, now, times, courts, day, products, sena }: { date: string; today: string; now: string; times: string[]; courts: { id: string; name: string; kind: string }[]; day: B[]; products: P[]; sena: number }) {
  const router = useRouter(); const [open, setOpen] = useState<string | null>(null); const [nw, setNw] = useState<{ start: string; courtId: string; court: string } | null>(null);
  const [name, setName] = useState(""), [phone, setPhone] = useState(""), [src, setSrc] = useState("manual"); const [pending, start] = useTransition(); const toast = useToast();
  const past = (t: string) => date < today || (date === today && toMin(t) < toMin(now) - 90);
  return <>
    <div className="agrid-wrap"><table className="agrid"><thead><tr><th>Hora</th>{courts.map(c => <th key={c.id}>{c.name} <span style={{ fontWeight: 500, textTransform: "none" }}>· {c.kind}</span></th>)}</tr></thead>
      <tbody>{times.map(t => <tr key={t}><td className="t">{t}</td>{courts.map(c => {
        const b = day.find(x => x.court_id === c.id && x.start === t);
        if (!b) return <td key={c.id}><button className={"cell free" + (past(t) ? " past" : "")} onClick={() => { setNw({ start: t, courtId: c.id, court: c.name }); setName(""); setPhone(""); }}>Libre · cargar</button></td>;
        return <td key={c.id}><button className={"cell " + b.source + (past(t) ? " past" : "")} onClick={() => setOpen(b.id)}>
          <b>{b.holder_name}</b><span>{SRC[b.source] || b.source}</span>
          <span className="tags">{b.sena_paid > 0 && <span className="pill ok">Señado</span>}{b.passes > 0 && <span className="pill dark">{b.passes} pase{b.passes > 1 ? "s" : ""}</span>}
            {b.settled ? <span className="pill ok">Cuenta cerrada</span> : b.hasActivity ? <span className="pill acc">Falta {fmt(b.falta)} · {b.okPlayers}/{b.nPlayers}</span> : null}</span></button></td>; })}</tr>)}</tbody></table></div>
    {open && <BookingDrawer id={open} products={products} senaDefault={sena} onClose={() => setOpen(null)} toast={toast.show} />}
    {nw && <div className="overlay center" onClick={e => { if (e.target === e.currentTarget) setNw(null); }}><form className="modal" onSubmit={e => { e.preventDefault(); start(async () => { const r = await createManual({ date, start: nw.start, courtId: nw.courtId, name, phone, source: src }); toast.show(r.msg, !r.ok); if (r.ok) { setNw(null); router.refresh(); setOpen(r.id); } }); }}>
      <h3>{nw.court} · {nw.start}</h3>
      <div className="field"><label htmlFor="mn">Nombre de quien reserva</label><input id="mn" value={name} onChange={e => setName(e.target.value)} placeholder="Turno por teléfono" /></div>
      <div className="field"><label htmlFor="mp">Celular (opcional)</label><input id="mp" value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" /></div>
      <div className="field"><label htmlFor="ms">Tipo</label><select id="ms" value={src} onChange={e => setSrc(e.target.value)}><option value="manual">Por teléfono / en el club</option><option value="fijo">Turno fijo</option><option value="torneo">Torneo</option></select></div>
      <button className="btn block" disabled={pending}>Cargar turno</button><button type="button" className="btn ghost block" onClick={() => setNw(null)}>Cancelar</button></form></div>}
    {toast.node}
  </>;
}
