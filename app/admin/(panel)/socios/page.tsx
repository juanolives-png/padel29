import { getClub, getPlans, ranking } from "@/lib/data";
import { q } from "@/lib/db";
import { fmt } from "@/lib/time";
import SociosClient from "./SociosClient";
export const metadata = { title: "29club" };
export default async function Socios() {
  const club = await getClub();
  const [plans, rank, socios, sales] = await Promise.all([getPlans(club.id), ranking(club.id, 15),
    q(`select p.id, p.name, p.phone, s.id as sub_id, pl.name as plan, s.passes_left, s.special_left, s.early_left, s.invite_left, s.expires_at, s.started_at, pl.can_transfer,
       (s.expires_at > now()) as active from player p join lateral (select * from subscription where player_id=p.id order by expires_at desc limit 1) s on true join plan pl on pl.id=s.plan_id
       where p.club_id=$1 order by active desc, s.expires_at`, [club.id]),
    q<{ s: number; c: number }>("select coalesce(sum(price_paid),0)::int as s, count(*)::int as c from subscription s join player p on p.id=s.player_id where p.club_id=$1 and s.started_at >= date_trunc('month', now())", [club.id])]);
  const active = socios.filter(s => s.active);
  const passes = active.reduce((s, x) => s + Number(x.passes_left), 0);
  return <>
    <div className="page-head"><div><h1>29club</h1><p>Socios, pases, medio pase en horarios especiales, transferencias, referidos y ranking. Los pases se usan desde la cuenta de cada turno.</p></div></div>
    <div className="grid4" style={{ marginBottom: 16 }}>
      <div className="card kpi"><div className="l">Socios activos</div><div className="v">{active.length}</div><div className="small muted">{plans.map(p => `${active.filter(a => a.plan === p.name).length} ${p.name}`).join(" · ")}</div></div>
      <div className="card kpi"><div className="l">Planes vendidos este mes</div><div className="v">{sales[0].c}</div><div className="small muted">{fmt(sales[0].s)} cobrados por adelantado</div></div>
      <div className="card kpi"><div className="l">Pases pendientes</div><div className="v">{passes.toLocaleString("es-AR")}</div><div className="small muted">partidos ya pagados por jugar</div></div>
      <div className="card kpi"><div className="l">Líder del ranking</div><div className="v" style={{ fontSize: 24 }}>{rank[0]?.name || "—"}</div><div className="small muted">{rank[0] ? `${rank[0].points} puntos` : ""}</div></div>
    </div>
    <SociosClient plans={JSON.parse(JSON.stringify(plans))} socios={JSON.parse(JSON.stringify(socios))} rank={rank} />
  </>;
}
