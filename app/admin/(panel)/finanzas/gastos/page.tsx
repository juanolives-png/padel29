import Link from "next/link";
import { getClub } from "@/lib/data";
import { q } from "@/lib/db";
import { EXPENSE_CATS, addMonths, monthBounds, monthLabel } from "@/lib/finance";
import { nowAR } from "@/lib/time";
import FinTabs from "../FinTabs";
import GastosClient from "./GastosClient";

export const metadata = { title: "Gastos" };
export default async function Gastos(props: { searchParams: Promise<{ m?: string }> }) {
  const sp = await props.searchParams; const club = await getClub(); const today = nowAR().date;
  const ym = /^\d{4}-\d{2}$/.test(sp.m || "") ? sp.m! : today.slice(0, 7);
  const b = monthBounds(ym);
  const [rows, caja, prevFixed] = await Promise.all([
    q("select * from expense where club_id=$1 and date between $2 and $3 order by date desc, created_at desc", [club.id, b.from, b.to]),
    q("select id, date, amount, note, method from cash_move where club_id=$1 and kind='gasto' and date between $2 and $3 order by date desc", [club.id, b.from, b.to]),
    q<{ n: number }>("select count(*)::int as n from expense where club_id=$1 and fixed and substr(date,1,7)=$2", [club.id, addMonths(ym, -1)])]);
  const months = Array.from({ length: 6 }, (_, i) => addMonths(today.slice(0, 7), i - 5));
  return <>
    <div className="page-head" style={{ marginBottom: 14 }}><div><h1>Gastos</h1><p>Cargá lo que cuesta mantener el club. Los gastos chicos que salen de la caja del día se suman solos.</p></div><FinTabs /></div>
    <div className="chips scroll" style={{ marginBottom: 16 }}>{months.map(m => <Link key={m} href={`/admin/finanzas/gastos?m=${m}`} className={"chip" + (m === ym ? " on" : "")} style={{ textDecoration: "none" }}>{monthLabel(m)}</Link>)}</div>
    <GastosClient ym={ym} today={today} cats={EXPENSE_CATS} rows={JSON.parse(JSON.stringify(rows))} caja={JSON.parse(JSON.stringify(caja))} canCopy={prevFixed[0].n > 0} />
  </>;
}
