import Link from "next/link";
import { getClub, getPlans, ranking } from "@/lib/data";
import { fmt } from "@/lib/time";
import { POINTS } from "@/lib/club29";

export const metadata = { title: "29club" };
const maxMatches = (p: { passes: number; special_uses: number; early_uses: number }) => p.passes + (p.special_uses + p.early_uses) / 2;

export default async function Club29() {
  const club = await getClub(); const [plans, rank] = await Promise.all([getPlans(club.id), ranking(club.id, 10)]);
  const share = club.court_price / 4;
  const oro = plans.find(p => p.name === "Oro") || plans[plans.length - 1];
  const perMatch = plans.map(p => ({ name: p.name, v: Math.round(p.price / maxMatches(p)) }));
  const best = oro ? Math.round((1 - oro.price / maxMatches(oro) / share) * 100) : 0;
  const bars = [{ name: "Sin plan", v: share, cls: "#5d6b63" }, ...perMatch.map(p => ({ ...p, cls: p.name === "Bronce" ? "var(--bronce)" : p.name === "Plata" ? "var(--plata)" : "var(--oro)" }))];
  const maxV = Math.max(...bars.map(b => b.v));
  return (
    <>
      <section className="hero"><div className="ball" aria-hidden /><div className="wrap">
        <span className="eyebrow" style={{ color: "rgba(255,255,255,.7)", letterSpacing: ".3em" }}>{club.name}</span>
        <h1>29<em>club</em></h1>
        <p>Jugá más, pagá menos y congelá el precio de tu turno.</p>
        <div className="cta"><a className="btn" href="#planes">Elegí tu plan</a></div>
      </div></section>
      <main className="wrap page stack" style={{ gap: 44 }}>
        <section className="stack" style={{ gap: 18 }}>
          <h2 style={{ fontSize: 32 }}>Pagás hoy y jugás al precio de hoy</h2>
          <p className="muted" style={{ margin: 0 }}>Con 29club comprás tus pases por adelantado y tu precio queda congelado mientras dure el plan.</p>
          <div className="stat3">
            <div className="stat"><span className="ic" aria-hidden>🔒</span><span className="v">0</span><span className="small">aumentos mientras dure tu plan</span></div>
            <div className="stat"><span className="ic" aria-hidden>%</span><span className="v">{best}%</span><span className="small">menos por partido con el plan {oro?.name}</span></div>
            <div className="stat"><span className="ic" aria-hidden>🎾</span><span className="v">{oro ? maxMatches(oro) : 0}</span><span className="small">partidos posibles con el plan {oro?.name}</span></div>
          </div>
        </section>
        <section className="stack" style={{ gap: 18 }}>
          <h2 style={{ fontSize: 32 }}>Cómo funciona</h2>
          <div className="steps">
            {[["Elegí tu plan", "Bronce, Plata u Oro, según cuánto jugás."], ["Recibí tus pases", "Pagás una vez, con el descuento incluido."], ["Reservá y jugá", "Usás un pase por partido, al precio congelado."]].map(([t, d], i) =>
              <div key={t} className="step"><div className="n">{i + 1}</div><h3 style={{ fontSize: 19 }}>{t}</h3><p className="muted small" style={{ margin: "4px 0 0" }}>{d}</p></div>)}
          </div>
          <div className="card soft"><b>1 pase = 1 turno de juego.</b> El plan es personal: el resto de los jugadores paga su parte normalmente.</div>
        </section>
        <section id="planes" className="stack" style={{ gap: 18 }}>
          <h2 style={{ fontSize: 32 }}>Elegí tu plan</h2>
          <div className="plans">{plans.map(p => (
            <div key={p.id} className={"plan " + (p.name === "Oro" ? "oro" : "")}>
              <span className={"pill " + p.name.toLowerCase()} style={{ justifySelf: "start", letterSpacing: ".14em" }}>{p.name.toUpperCase()}</span>
              <div className="price">{fmt(p.price)}</div>
              <div className="sub">{p.passes} pases · {p.discount_pct}% off · {p.months} meses</div>
              <hr />
              <b>Hasta {maxMatches(p)} partidos</b>
              <ul>
                <li>Precio congelado</li>
                <li>{p.special_uses} usos en horarios especiales</li>
                {p.early_uses > 0 && <li>{p.early_uses} reservas anticipadas</li>}
                {p.can_transfer && <li>Transferí pases</li>}
                {p.invite_uses > 0 && <li>Invitá amigos con {p.invite_uses} pases</li>}
                <li>Referí amigos y ganá</li>
              </ul>
            </div>))}</div>
        </section>
        <section className="grid2" style={{ alignItems: "center" }}>
          <div className="stack"><h2 style={{ fontSize: 32 }}>Cuánto pagás por partido</h2>
            <div className="bars" role="img" aria-label={`Precio por partido: ${bars.map(b => `${b.name} ${fmt(b.v)}`).join(", ")}`}>
              {bars.map(b => <div key={b.name} className="b"><span className="v">{fmt(b.v)}</span><div className="col" style={{ height: `${(b.v / maxV) * 190}px`, background: b.cls }} /><span>{b.name}</span></div>)}
            </div>
            <p className="muted small" style={{ margin: 0 }}>Turno a {fmt(share)} por jugador. Partidos máximos de cada plan.</p></div>
          <div className="stack"><div style={{ fontFamily: "var(--f-head)", fontSize: 80, fontWeight: 800, lineHeight: 1 }}>{best}%</div>
            <p style={{ margin: 0 }}>menos por partido con el plan {oro?.name}, usando todos sus beneficios.</p>
            <p style={{ margin: 0, fontWeight: 700, color: "var(--ok)" }}>Y el ahorro crece con cada aumento: tu precio no se mueve.</p></div>
        </section>
        <section className="stack" style={{ gap: 18 }}>
          <h2 style={{ fontSize: 32 }}>Jugá más con medio pase</h2>
          <div className="grid2">
            <div className="card soft stack" style={{ gap: 8 }}><h3 style={{ margin: 0 }}>🕒 Horarios especiales</h3><span className="small" style={{ color: "var(--ok)", fontWeight: 700 }}>Todos los planes</span>
              <ul style={{ margin: 0, paddingLeft: 18 }}><li>Lunes a viernes de 8 a 17:30</li><li>Reservás el mismo día o el anterior</li><li>El partido consume medio pase</li></ul></div>
            <div className="card soft stack" style={{ gap: 8 }}><h3 style={{ margin: 0 }}>📅 Reserva anticipada</h3><span className="small" style={{ color: "var(--ok)", fontWeight: 700 }}>Plata y Oro</span>
              <ul style={{ margin: 0, paddingLeft: 18 }}><li>Reservás hasta 2 semanas antes</li><li>Lunes a viernes de 8 a 12:30 y de 14 a 16:30</li><li>El partido consume medio pase</li></ul></div>
          </div>
          <p className="muted small" style={{ margin: 0 }}>Usos por plan: {plans.map(p => `${p.name} ${p.special_uses}${p.early_uses ? ` + ${p.early_uses} anticipadas` : ""}`).join(" · ")}. Los descuentos no se suman.</p>
        </section>
        {oro && <section className="card dark grid2" style={{ padding: 28, alignItems: "center" }}>
          <div><h2 style={{ fontSize: 28 }}><span style={{ color: "var(--oro)" }}>{oro.name}:</span> tu plan casi sin vencimiento</h2>
            <div style={{ fontFamily: "var(--f-head)", fontSize: 96, fontWeight: 800, color: "var(--acc)", lineHeight: 1, marginTop: 12 }}>{oro.months}</div>
            <p style={{ margin: 0, opacity: .8 }}>meses de vigencia y {oro.passes} pases para usar a tu ritmo.</p></div>
          <div className="stack"><div><b>⇄ Transferí pases</b><p style={{ margin: "4px 0 0", opacity: .8 }} className="small">Pasale pases a otro socio y mantienen la vigencia. No aplica en el último mes del plan.</p></div>
            <div><b>👥 Invitá amigos</b><p style={{ margin: "4px 0 0", opacity: .8 }} className="small">Usá hasta {oro.invite_uses} pases de tu plan para pagar la parte de otro jugador.</p></div></div>
        </section>}
        <section className="grid2">
          <div className="card dark stack" style={{ gap: 8 }}><span style={{ fontSize: 28 }} aria-hidden>🎁</span><h3 style={{ margin: 0 }}>Referí un amigo</h3><p className="small" style={{ margin: 0, opacity: .8 }}>Para todos los planes. Si tu amigo compra un plan, ganás:</p>
            <div><b style={{ color: "var(--acc)", fontSize: 22 }}>1 pase</b> <span className="small" style={{ opacity: .8 }}>si compra Bronce o Plata</span></div>
            <div><b style={{ color: "var(--acc)", fontSize: 22 }}>2 pases</b> <span className="small" style={{ opacity: .8 }}>si compra Oro</span></div></div>
          <div className="stack">
            <div className="card soft"><h3>🏆 Ranking 29club</h3><div className="grid3" style={{ gap: 8 }}>
              <div><b style={{ fontFamily: "var(--f-head)", fontSize: 30 }}>{POINTS.partido}</b><div className="small muted">por partido</div></div>
              <div><b style={{ fontFamily: "var(--f-head)", fontSize: 30 }}>{POINTS.partidoEspecial}</b><div className="small muted">en horarios especiales</div></div>
              <div><b style={{ fontFamily: "var(--f-head)", fontSize: 30 }}>{POINTS.referido}</b><div className="small muted">por referido</div></div></div></div>
            <div className="card soft small"><b>1° del año: entradas al Premier Padel.</b> Sorteo mensual opcional: necesitás {POINTS.sorteoMinimo} puntos y participar los descuenta del ranking anual.</div>
          </div>
        </section>
        {rank.length > 0 && <section className="card"><h3>Ranking {new Date().getFullYear()}</h3><table className="tbl"><tbody>{rank.map((r, i) =>
          <tr key={r.id}><td style={{ width: 36 }}><b>{i + 1}</b></td><td>{r.name.split(" ")[0]} {r.name.split(" ")[1]?.[0] ? r.name.split(" ")[1][0] + "." : ""}</td><td className="r"><b>{r.points}</b> pts</td></tr>)}</tbody></table></section>}
        <section className="stack" style={{ gap: 18 }}>
          <h2 style={{ fontSize: 32 }}>Reglas simples</h2>
          <div className="grid2">
            {[["👤 Plan personal", "Cada socio usa sus pases para su parte del turno."], ["⛔ Cancelación", `Con menos de ${club.cancel_hours} h de anticipación se pierde el pase.`], ["⌛ Vencimiento", "Los pases que no se usan dentro de la vigencia se pierden."], ["% Un descuento a la vez", "Los beneficios no se suman: siempre aplica uno solo."]].map(([t, d]) =>
              <div key={t} className="card soft"><b>{t}</b><p className="small muted" style={{ margin: "4px 0 0" }}>{d}</p></div>)}
          </div>
        </section>
        <section className="card dark" style={{ padding: 28, display: "grid", gap: 12 }}>
          <h2 style={{ fontSize: 34 }}>Sumate a <span style={{ color: "var(--acc)" }}>29club</span></h2>
          <p style={{ margin: 0, opacity: .85 }}>{plans.map(p => `${p.name} ${fmt(p.price)}`).join(" · ")}</p>
          <div className="row">{club.whatsapp ? <a className="btn" href={`https://wa.me/549${club.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent("Hola! Quiero sumarme a 29club")}`}>Escribinos por WhatsApp</a> : <span className="btn" aria-disabled>Pedilo en el club</span>}
            <Link href="/mis-turnos" className="btn ghost" style={{ color: "#fff", borderColor: "rgba(255,255,255,.3)" }}>Ver mis pases</Link></div>
        </section>
      </main>
    </>
  );
}
