export const TZ = "America/Argentina/Buenos_Aires";
const WD = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** fecha y hora actuales en Argentina */
export function nowAR() {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const g = (t: string) => p.find(x => x.type === t)!.value;
  const hh = g("hour") === "24" ? "00" : g("hour");
  return { date: `${g("year")}-${g("month")}-${g("day")}`, time: `${hh}:${g("minute")}` };
}
export const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
export const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export function addDays(date: string, n: number) { const d = new Date(date + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
export function dow(date: string) { return new Date(date + "T12:00:00Z").getUTCDay(); }
export function dayLabel(date: string, today = nowAR().date) {
  if (date === today) return "Hoy";
  if (date === addDays(today, 1)) return "Mañana";
  const d = new Date(date + "T12:00:00Z");
  return `${WD[d.getUTCDay()][0].toUpperCase()}${WD[d.getUTCDay()].slice(1)} ${d.getUTCDate()}`;
}
export function longDate(date: string) { const d = new Date(date + "T12:00:00Z"); return `${WD[d.getUTCDay()]} ${d.getUTCDate()} de ${MO[d.getUTCMonth()]}`; }
export function daysBetween(a: string, b: string) { return Math.round((new Date(b + "T12:00:00Z").getTime() - new Date(a + "T12:00:00Z").getTime()) / 864e5); }
/** minutos desde ahora hasta la fecha/hora dada (hora Argentina) */
export function minutesUntil(date: string, start: string) {
  const n = nowAR(); return daysBetween(n.date, date) * 1440 + toMin(start) - toMin(n.time);
}
export const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");
