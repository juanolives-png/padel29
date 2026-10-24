"use client";
import { useEffect, useState, useTransition } from "react";
import { closeToAccount, loadBooking } from "@/app/admin/actions";
import { fmt } from "@/lib/time";

type Person = { bookingId: string; label: string; idx: number; short: string; amount: number; name: string; phone: string };
const fullName = (n: string) => n.trim().split(/\s+/).filter(w => w.length > 1).length >= 2;
const okPhone = (p: string) => p.replace(/\D/g, "").length >= 8;

/** Cierra uno o varios turnos con deuda: cada uno que debe pasa a su cuenta corriente (pide nombre, apellido y celular si faltan) */
export default function ToAccountModal({ bookingIds, onClose, onDone, toast, title }: { bookingIds: string[]; onClose: () => void; onDone: () => void; toast: (m: string, bad?: boolean) => void; title?: string }) {
  const [people, setPeople] = useState<Person[] | null>(null); const [pending, start] = useTransition();
  useEffect(() => {
    Promise.all(bookingIds.map(id => loadBooking(id))).then(ds => {
      const out: Person[] = [];
      ds.forEach((d: any) => {
        if (!d) return; const a = d.acct;
        const owing = d.players.filter((_: any, i: number) => a.due[i] > 0.5);
        const share = a.pool > 0 ? a.pool / (owing.length || d.players.length) : 0;
        (owing.length ? owing : a.pool > 0 ? d.players : []).forEach((p: any) => { const i = d.players.indexOf(p);
          out.push({ bookingId: d.booking.id, label: `${d.booking.court_name} ${d.booking.start}`, idx: p.idx, short: p.name, amount: Math.max(0, a.due[i]) + share, name: p.full_name || "", phone: p.phone || "" }); });
      });
      setPeople(out);
    });
  }, [bookingIds]);
  const total = (people || []).reduce((s, p) => s + p.amount, 0);
  const ready = !!people && people.length > 0 && people.every(p => fullName(p.name) && okPhone(p.phone));
  const set = (k: number, f: Partial<Person>) => setPeople(people!.map((p, j) => j === k ? { ...p, ...f } : p));
  const submit = () => start(async () => {
    for (const id of bookingIds) {
      const ps = people!.filter(p => p.bookingId === id); if (!ps.length) continue;
      const r = await closeToAccount(id, ps.map(p => ({ idx: p.idx, name: p.name, phone: p.phone })));
      if (!r.ok) { toast(r.msg, true); return; }
    }
    toast(`${fmt(total)} pasaron a cuenta corriente`); onDone();
  });

  return <div className="overlay center" style={{ zIndex: 75 }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal checkout" role="dialog" aria-modal="true" aria-label="Pasar a cuenta corriente">
      <div className="between"><h3 style={{ margin: 0 }}>{title || "Pasar deudas a cuenta corriente"}</h3><button className="xbtn" onClick={onClose} aria-label="Cerrar">✕</button></div>
      {!people ? <p className="muted">Cargando…</p> : !people.length ? <p className="muted" style={{ margin: 0 }}>No hay nada pendiente.</p> : <>
        <p className="small muted" style={{ margin: 0 }}>La cuenta del turno se cierra y cada uno queda debiendo en su cuenta corriente. {people.some(p => p.amount % 1) ? "" : ""}Necesitamos nombre, apellido y celular de cada uno.</p>
        <div className="stack" style={{ gap: 8 }}>{people.map((p, k) => { const bad = !fullName(p.name) || !okPhone(p.phone);
          return <div key={p.bookingId + p.idx} className={"tacc" + (bad ? " bad" : "")}>
            <div className="between" style={{ flexWrap: "nowrap" }}><span><b>{p.short}</b>{bookingIds.length > 1 && <small> · {p.label}</small>}</span><b className="amt">{fmt(p.amount)}</b></div>
            <div className="grid2" style={{ gap: 6 }}>
              <input className="input" placeholder="Nombre y apellido" value={p.name} onChange={e => set(k, { name: e.target.value })} aria-label={`Nombre y apellido de ${p.short}`} />
              <input className="input" placeholder="Celular" inputMode="tel" value={p.phone} onChange={e => set(k, { phone: e.target.value })} aria-label={`Celular de ${p.short}`} /></div>
            {bad && <span className="small" style={{ color: "var(--bad)" }}>{!fullName(p.name) ? "Falta nombre y apellido" : "Falta el celular"}</span>}
          </div>; })}</div>
        <div className="co-total"><span>Pasa a cuenta corriente</span><b>{fmt(total)}</b></div>
        <button className="btn block" style={{ padding: 16, fontSize: 16 }} disabled={pending || !ready} onClick={submit}>{ready ? `Cerrar y pasar ${fmt(total)} a cuenta corriente` : "Completá los datos que faltan"}</button>
      </>}
    </div></div>;
}
