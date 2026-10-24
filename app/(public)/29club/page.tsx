import Link from "next/link";
import { getClub, getPlans, ranking, type Plan } from "@/lib/data";
import { fmt } from "@/lib/time";
import { POINTS } from "@/lib/club29";

export const metadata = { title: "29club" };
const maxMatches = (p: Plan) => p.passes + (p.special_uses + p.early_uses) / 2;
const TAG: Record<string, string> = { Plata: "Más elegido", Oro: "Mejor precio" };

type Row = { label: string; val: (p: Plan) => string | boolean };
const ROWS: Row[] = [
  { label: "Precio congelado", val: () => true },
  { label: "Medio pase en horario especial", val: p => p.special_uses > 0 ? `${p.special_uses} usos` : false },
  { label: "Reserva anticipada", val: p => p.early_uses > 0 ? `${p.early_uses} usos` : false },
  { label: "Invitá amigos", val: p => p.invite_uses > 0 ? `${p.invite_uses} pases` : false },
  { label: "Transferí pases", val: p => p.can_transfer },
  { label: "Referí y ganá pases", val: p => `+${p.name === "Oro" ? 2 : 1}` },
  { label: "Sumá puntos al ranking", val: () => true },
];

export default async function Club29() {
  const club = await getClub(); const [plans, rank] = await Promise.all([getPlans(club.id), ranking(club.id, 5)]);
  const share = club.court_price / 4;
  const wa = (plan: string) => club.whatsapp ? `https://wa.me/549${club.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(`Hola! Quiero el plan ${plan} de 29club`)}` : null;
  return (
    <>
      <section className="hero c29-hero"><div className="ball" aria-hidden /><div className="wrap">
        <span className="eyebrow" style={{ color: "rgba(255,255,255,.7)", letterSpacing: ".3em" }}>{club.name}</span>
        <h1>29<em>club</em></h1>
        <p>Jugá más. Pagá menos. Tu precio queda congelado.</p>
      </div></section>

      <main className="wrap page stack" style={{ gap: 48 }}>
        <section className="tiers" aria-label="Planes">
          {plans.map(p => {
            const per = Math.round(p.price / maxMatches(p)); const save = Math.round((1 - per / share) * 100); const link = wa(p.name);
            return <article key={p.id} className={"tier t-" + p.name.toLowerCase() + (p.name === "Oro" ? " hi" : "")}>
              {TAG[p.name] && <span className="tag">{TAG[p.name]}</span>}
              <h2>{p.name}</h2>
              <div className="pp"><span className="big">{fmt(per)}</span><span>por partido</span></div>
              <div className="save">Ahorrás {save}%</div>
              <div className="meta"><b>{fmt(p.price)}</b> · {p.passes} pases · {p.months} meses</div>
              <ul className="ticks">{ROWS.map(r => { const v = r.val(p); return <li key={r.label} className={v ? "" : "no"}>
                <span className="ck" aria-hidden>{v ? "✓" : "—"}</span><span>{r.label}</span>{typeof v === "string" && <b>{v}</b>}<span className="sr">{v ? "" : " (no incluido)"}</span></li>; })}</ul>
              {link ? <a className={"btn block" + (p.name === "Oro" ? "" : " dark")} href={link}>Quiero {p.name}</a> : <span className={"btn block" + (p.name === "Oro" ? "" : " dark")} aria-disabled>Pedilo en el club</span>}
            </article>;
          })}
        </section>
        <p className="muted small" style={{ margin: "-30px 0 0", textAlign: "center" }}>Sin plan, tu parte del turno es {fmt(share)}. Precio por partido usando todos los beneficios del plan.</p>

        <section className="how">
          {[["🎟️", "1 pase = 1 partido", "Cubre tu parte del turno."], ["½", "Medio pase", "De lunes a viernes, de 8 a 17:30, reservando el día anterior o el mismo día."], ["🔒", "Precio congelado", "Si sube el turno, a vos no te cambia."]].map(([i, t, d]) =>
            <div key={t} className="how-i"><span className="ic" aria-hidden>{i}</span><div><b>{t}</b><p>{d}</p></div></div>)}
        </section>

        <section className="grid2" style={{ alignItems: "start" }}>
          <div className="card dark stack" style={{ gap: 14, padding: 24 }}>
            <h3 style={{ margin: 0, fontSize: 24 }}>🏆 Ranking 29club</h3>
            <div className="ptsrow">
              <div><b>{POINTS.partido}</b><span>por partido</span></div>
              <div><b>{POINTS.partidoEspecial}</b><span>horario especial</span></div>
              <div><b>{POINTS.referido}</b><span>por referido</span></div>
            </div>
            <p className="small" style={{ margin: 0, opacity: .8 }}>El 1° del año gana entradas al Premier Padel.</p>
          </div>
          {rank.length > 0 ? <div className="card stack" style={{ gap: 4, padding: 24 }}><h3 style={{ margin: "0 0 6px", fontSize: 20 }}>Top {rank.length} · {new Date().getFullYear()}</h3>
            {rank.map((r, i) => <div key={r.id} className="rk"><span className="pos">{i + 1}</span><span>{r.name.split(" ")[0]} {r.name.split(" ")[1]?.[0] ? r.name.split(" ")[1][0] + "." : ""}</span><b>{r.points} pts</b></div>)}</div>
            : <div className="card soft"><p className="muted" style={{ margin: 0 }}>El ranking arranca con tu primer partido.</p></div>}
        </section>

        <details className="faq">
          <summary>Letra chica</summary>
          <ul>
            <li>El plan es personal: cubre tu parte. El resto paga la suya.</li>
            <li>Cancelando con menos de {club.cancel_hours} h, el pase se pierde.</li>
            <li>Los pases vencen con el plan. Los beneficios no se suman.</li>
            <li>Reserva anticipada: lunes a viernes de 8 a 12:30 y de 14 a 16:30, hasta 2 semanas antes.</li>
            <li>Transferencias: solo Oro, a otro socio, salvo el último mes del plan.</li>
          </ul>
        </details>

        <div style={{ textAlign: "center" }}><Link href="/mis-turnos" className="btn ghost">Ver mis pases</Link></div>
      </main>
    </>
  );
}
