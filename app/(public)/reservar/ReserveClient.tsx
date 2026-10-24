"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBooking } from "@/app/actions";
import { fmt } from "@/lib/time";

type Slot = { time: string; courts: { id: string; name: string; kind: string; free: boolean }[] };
export default function ReserveClient({ days, date, slots, price, sena }: { days: { date: string; label: string }[]; date: string; slots: Slot[]; price: number; sena: number }) {
  const router = useRouter(); const [pick, setPick] = useState<{ time: string; courtId: string; court: string } | null>(null);
  const [name, setName] = useState(""), [phone, setPhone] = useState(""), [msg, setMsg] = useState(""), [done, setDone] = useState<null | { court: string; time: string }>(null);
  const [pending, start] = useTransition();
  useEffect(() => { try { setName(localStorage.getItem("p29_name") || ""); setPhone(localStorage.getItem("p29_phone") || ""); } catch {} }, []);
  const label = days.find(d => d.date === date)?.label || date;
  const submit = () => start(async () => {
    setMsg(""); const r = await createBooking({ date, start: pick!.time, courtId: pick!.courtId, name, phone });
    if (!r.ok) { setMsg(r.msg); router.refresh(); return; }
    try { localStorage.setItem("p29_name", name); localStorage.setItem("p29_phone", phone.replace(/\D/g, "")); } catch {}
    setDone({ court: pick!.court, time: pick!.time }); setPick(null); router.refresh();
  });
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="chips scroll" role="tablist" aria-label="Día">{days.map(d => <button key={d.date} className="chip" aria-pressed={d.date === date} onClick={() => router.push(`/reservar?d=${d.date}`)}>{d.label}</button>)}</div>
      {slots.length === 0 && <div className="card soft">No quedan turnos para {label.toLowerCase()}. Probá otro día.</div>}
      <div className="slots">{slots.map(s => {
        const free = s.courts.filter(c => c.free).length;
        return <div key={s.time} className="slot-row"><div className="t">{s.time}<small>{free ? `${free} libre${free > 1 ? "s" : ""}` : "Completo"}</small></div>
          <div className="courts">{s.courts.map(c => <button key={c.id} className="cbtn" disabled={!c.free} onClick={() => { setPick({ time: s.time, courtId: c.id, court: c.name }); setMsg(""); }} aria-label={`${c.name} ${c.kind} a las ${s.time}${c.free ? "" : ", ocupada"}`}>{c.name}<small>{c.kind}</small></button>)}</div></div>;
      })}</div>
      {pick && <div className="overlay center" onClick={e => { if (e.target === e.currentTarget) setPick(null); }}>
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="rt">
          <h3 id="rt">{pick.court} · {pick.time}</h3>
          <dl className="kv"><dt>Día</dt><dd>{label}</dd><dt>Turno</dt><dd>{fmt(price)}</dd><dt>Por jugador</dt><dd>{fmt(price / 4)}</dd></dl>
          <div className="field"><label htmlFor="n">Tu nombre</label><input id="n" value={name} onChange={e => setName(e.target.value)} autoComplete="name" /></div>
          <div className="field"><label htmlFor="p">Celular</label><input id="p" value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="2478 123456" /></div>
          <p className="note" style={{ margin: 0 }}>Se paga en el club; cada jugador paga su parte. Si sos socio de 29club, usás tu pase. Seña de {fmt(sena)} con Mercado Pago: próximamente.</p>
          {msg && <p style={{ color: "var(--bad)", margin: 0, fontWeight: 600 }}>{msg}</p>}
          <button className="btn block" onClick={submit} disabled={pending}>{pending ? "Reservando…" : "Confirmar reserva"}</button>
          <button className="btn ghost block" onClick={() => setPick(null)}>Elegir otro</button>
        </div></div>}
      {done && <div className="overlay center" onClick={() => setDone(null)}><div className="modal" role="dialog" aria-modal="true">
        <h3>¡Listo, {name.split(" ")[0]}!</h3><p style={{ margin: 0 }}>Reservaste la <b>{done.court}</b> {label.toLowerCase()} a las <b>{done.time}</b>.</p>
        <p className="muted small" style={{ margin: 0 }}>Podés cancelar sin costo hasta 12 h antes desde “Mis turnos”.</p>
        <Link className="btn block" href="/mis-turnos">Ver mis turnos</Link><button className="btn ghost block" onClick={() => setDone(null)}>Cerrar</button></div></div>}
    </div>
  );
}
