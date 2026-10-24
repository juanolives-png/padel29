import Link from "next/link";
import { getClub, getCourts, getPlans, KIND_LABEL } from "@/lib/data";
import { q } from "@/lib/db";
import { fmt, nowAR, toMin } from "@/lib/time";
import { dayTitle } from "@/lib/tournament";

export default async function Home() {
  const club = await getClub();
  const [courts, plans, tours] = await Promise.all([getCourts(club.id), getPlans(club.id), q("select id,name,format,category,config from tournament where club_id=$1 order by created_at desc limit 3", [club.id])]);
  const n = nowAR();
  const taken = await q<{ c: number }>("select count(*)::int as c from booking where club_id=$1 and date=$2 and status<>'cancelled' and start >= $3", [club.id, n.date, n.time]);
  const remainingSlots = club.open_times.filter(t => toMin(t) >= toMin(n.time)).length * courts.length - (taken[0]?.c || 0);
  const oro = plans.find(p => p.name === "Oro");
  return (
    <>
      <section className="hero">
        <div className="ball" aria-hidden />
        <div className="wrap">
          <span className="eyebrow" style={{ color: "var(--acc)" }}>{club.name}</span>
          <h1>Reservá tu cancha<br /><em>en 3 toques.</em></h1>
          <p>Elegí día, horario y cancha. {remainingSlots > 0 ? `Hoy quedan ${remainingSlots} turnos libres.` : "Hoy ya está todo reservado: mirá mañana."}</p>
          <div className="cta"><Link className="btn" href="/reservar">Reservar turno</Link><Link className="btn ghost" style={{ color: "#fff", borderColor: "rgba(255,255,255,.3)" }} href="/29club">Conocé 29club</Link></div>
        </div>
      </section>
      <main className="wrap page stack" style={{ gap: 28 }}>
        <section className="grid3">
          <div className="card soft"><div className="eyebrow">Canchas</div><h3 style={{ marginTop: 6 }}>{courts.length} canchas</h3><p className="muted small" style={{ margin: 0 }}>{courts.map(c => `${c.name} ${KIND_LABEL[c.kind]}`).join(" · ")}</p></div>
          <div className="card soft"><div className="eyebrow">Turnos de {club.slot_minutes} min</div><h3 style={{ marginTop: 6 }}>{fmt(club.court_price)}</h3><p className="muted small" style={{ margin: 0 }}>{fmt(club.court_price / 4)} por jugador. Se paga en el club; cada uno paga su parte.</p></div>
          <div className="card soft"><div className="eyebrow">Mis turnos</div><h3 style={{ marginTop: 6 }}>Cancelá o revisá</h3><p className="muted small" style={{ margin: 0 }}>Con tu celular ves tus reservas. Cancelás sin costo hasta {club.cancel_hours} h antes.</p><Link href="/mis-turnos" className="btn sm ghost" style={{ marginTop: 10 }}>Ver mis turnos</Link></div>
        </section>
        <section className="card dark" style={{ padding: 28, display: "grid", gap: 14 }}>
          <span className="eyebrow" style={{ color: "var(--acc)" }}>29club</span>
          <h2 style={{ fontSize: "clamp(26px, 4vw, 38px)" }}>Pagás hoy y jugás al precio de hoy.</h2>
          <p style={{ margin: 0, color: "rgba(255,255,255,.78)", maxWidth: "60ch" }}>Comprás tus pases por adelantado y el precio de tu turno queda congelado mientras dure el plan.{oro ? ` Con el plan Oro llegás a 25 partidos a ${fmt(Math.round(oro.price / 25))} cada uno.` : ""}</p>
          <div className="row">{plans.map(p => <span key={p.id} className={"pill " + p.name.toLowerCase()} style={{ fontSize: 13, padding: "5px 12px" }}>{p.name} {fmt(p.price)}</span>)}</div>
          <div><Link href="/29club" className="btn">Ver planes</Link></div>
        </section>
        {tours.length > 0 && (
          <section className="stack">
            <div className="between"><h2 style={{ fontSize: 28 }}>Torneos</h2><Link href="/torneos" className="small">Ver todos</Link></div>
            <div className="grid3">{tours.map(t => <Link key={t.id} href={`/torneos/${t.id}`} className="card" style={{ textDecoration: "none" }}>
              <span className="pill acc">{t.format === "liga" ? "Liga semanal" : t.format === "zonas" ? "Fin de semana" : "Americano"}</span>
              <h3 style={{ marginTop: 10 }}>{t.name}</h3><p className="muted small" style={{ margin: 0 }}>Categoría {t.category} · desde el {dayTitle(t.config.startDate).toLowerCase()}</p></Link>)}</div>
          </section>
        )}
      </main>
    </>
  );
}
