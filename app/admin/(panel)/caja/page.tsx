import { getClub } from "@/lib/data";
import { getCajaDay, getCloses } from "@/lib/caja";
import { addDays, dayLabel, nowAR } from "@/lib/time";
import CajaClient from "./CajaClient";
export const metadata = { title: "Caja" };
export default async function Caja(props: { searchParams: Promise<{ d?: string }> }) {
  const sp = await props.searchParams;
  const club = await getClub(); const n = nowAR();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.d || "") && sp.d! <= n.date ? sp.d! : n.date;
  const [d, closes] = await Promise.all([getCajaDay(club.id, date), getCloses(club.id, 14)]);
  const days = Array.from({ length: 7 }, (_, i) => addDays(n.date, i - 6));
  return <>
    <div className="page-head" style={{ marginBottom: 14 }}><div><h1>Caja</h1><p>Lo que entró y salió en el día, por medio de pago. Al final contás el efectivo y cerrás.</p></div></div>
    <div className="chips scroll" style={{ marginBottom: 16 }}>{days.map(x => <a key={x} href={`/admin/caja?d=${x}`} className={"chip" + (x === date ? " on" : "")} style={{ textDecoration: "none" }}>{dayLabel(x, n.date)}{closes.some(c => c.date === x) ? " ✓" : ""}</a>)}</div>
    <CajaClient key={date} date={date} label={dayLabel(date, n.date)} clubName={club.name} d={d} closes={JSON.parse(JSON.stringify(closes))} />
  </>;
}
