"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { cancelMyBooking, myStatus } from "@/app/actions";
import { dayLabel, longDate } from "@/lib/time";

type St = Awaited<ReturnType<typeof myStatus>>;
export default function MyClient() {
  const [phone, setPhone] = useState(""), [st, setSt] = useState<St | null>(null), [msg, setMsg] = useState(""), [confirm, setConfirm] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const load = (p = phone) => start(async () => { setMsg(""); const r = await myStatus(p); setSt(r); if (r.ok) try { localStorage.setItem("p29_phone", p.replace(/\D/g, "")); } catch {} });
  useEffect(() => { try { const p = localStorage.getItem("p29_phone"); if (p) { setPhone(p); load(p); } } catch {} }, []); // eslint-disable-line
  return (
    <div className="stack" style={{ gap: 18, maxWidth: 720 }}>
      <form className="row" onSubmit={e => { e.preventDefault(); load(); }}>
        <input className="input" style={{ flex: "1 1 220px" }} value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" placeholder="Tu celular, ej: 2478 123456" aria-label="Celular" />
        <button className="btn dark" disabled={pending}>{pending ? "Buscando…" : "Ver"}</button>
      </form>
      {st && !st.ok && <p style={{ color: "var(--bad)" }}>{st.msg}</p>}
      {msg && <div className="card soft">{msg}</div>}
      {st && st.ok && <>
        {st.name && <h2 style={{ fontSize: 26 }}>Hola, {st.name.split(" ")[0]}</h2>}
        <section className="stack">
          <h3 style={{ fontSize: 20 }}>Próximos turnos</h3>
          {st.bookings.length === 0 ? <div className="card soft">No tenés turnos reservados. <Link href="/reservar">Reservar</Link></div> :
            st.bookings.map((b: any) => <div key={b.id} className="card between">
              <div><b style={{ fontFamily: "var(--f-head)", fontSize: 20 }}>{b.start} · {b.court}</b><div className="muted small">{dayLabel(b.date)} · {longDate(b.date)}{b.mine ? "" : " · te sumaron como jugador"}</div></div>
              {b.mine && (confirm === b.id ? <div className="row"><button className="btn sm danger" onClick={() => start(async () => { const r = await cancelMyBooking(b.id, phone); setMsg(r.msg); setConfirm(null); load(); })}>Sí, cancelar</button><button className="btn sm ghost" onClick={() => setConfirm(null)}>No</button></div>
                : <button className="btn sm ghost" onClick={() => setConfirm(b.id)}>Cancelar</button>)}
            </div>)}
        </section>
        <section className="stack">
          <h3 style={{ fontSize: 20 }}>29club</h3>
          {st.subs.length === 0 ? <div className="card soft">No tenés un plan activo. <Link href="/29club">Conocé los planes</Link></div> :
            st.subs.map((s: any) => <div key={s.id} className="card dark stack" style={{ gap: 10 }}>
              <div className="between"><span className={"pill " + s.plan.toLowerCase()}>{s.plan}</span><span className="small" style={{ opacity: .75 }}>Vence el {new Date(s.expires_at).toLocaleDateString("es-AR")}</span></div>
              <div style={{ fontFamily: "var(--f-head)", fontSize: 44, fontWeight: 800, color: "var(--acc)", lineHeight: 1 }}>{s.passes_left % 1 ? s.passes_left.toFixed(1).replace(".", ",") : s.passes_left} <span style={{ fontSize: 18, color: "#fff" }}>pases</span></div>
              <div className="small" style={{ opacity: .8 }}>{s.special_left} usos en horario especial · {s.early_left} reservas anticipadas{s.can_transfer ? ` · ${s.invite_left} pases para invitados` : ""}</div>
            </div>)}
          <div className="card soft between"><span>Tus puntos del ranking {new Date().getFullYear()}</span><b style={{ fontFamily: "var(--f-head)", fontSize: 24 }}>{st.points}</b></div>
        </section>
      </>}
    </div>
  );
}
