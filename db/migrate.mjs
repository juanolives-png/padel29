// Aplica el esquema y, si la base está vacía, carga 29 Padel con datos de ejemplo.
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === "1" ? { rejectUnauthorized: false } : undefined });
const q = async (sql, p = []) => (await pool.query(sql, p)).rows;
const one = async (sql, p = []) => (await q(sql, p))[0];

const TZ = "America/Argentina/Buenos_Aires";
function todayAR() {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const g = t => p.find(x => x.type === t).value; return `${g("year")}-${g("month")}-${g("day")}`;
}
const addDays = (d, n) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const dow = d => new Date(d + "T12:00:00Z").getUTCDay();
const nextDow = (from, w) => { let x = addDays(from, 1); while (dow(x) !== w) x = addDays(x, 1); return x; };

async function main() {
  await pool.query(fs.readFileSync(path.join(dir, "schema.sql"), "utf8"));
  const exists = await one("select id from club limit 1");
  if (exists) { console.log("Esquema al día. Base con datos: no se carga el ejemplo."); return; }
  if (process.env.SEED_DEMO === "0") { console.log("SEED_DEMO=0: base vacía, sin datos de ejemplo."); }
  const times = ["08:00", "09:30", "11:00", "12:30", "14:00", "15:30", "17:00", "18:30", "20:00", "21:30"];
  const club = await one(
    `insert into club (slug, name, tagline, color_primary, color_accent, whatsapp, open_times, court_price, sena_amount)
     values ('29padel','29 Padel','Jugá más, pagá menos y congelá el precio de tu turno.','#10261c','#d6f04c','',$1,30000,10000) returning id`, [times]);
  const C = club.id;
  const courts = [];
  for (const [i, [name, kind]] of [["Cancha 1", "techada"], ["Cancha 2", "techada"], ["Cancha 3", "panoramica"], ["Cancha 4", "aire"]].entries())
    courts.push((await one("insert into court (club_id,name,kind,ord) values ($1,$2,$3,$4) returning id", [C, name, kind, i])).id);

  const products = [
    ["bebidas", "🥤", "Gaseosa 500 ml", 2500, 48], ["bebidas", "🍾", "Gaseosa 1,5 L", 4500, 18], ["bebidas", "💧", "Agua sin gas", 2000, 60], ["bebidas", "🫧", "Agua con gas", 2000, 24],
    ["bebidas", "🍋", "Agua saborizada", 2800, 30], ["bebidas", "⚡", "Isotónica", 3500, 30], ["bebidas", "🔋", "Energizante", 4000, 12], ["bebidas", "🧃", "Jugo", 2500, 20],
    ["bebidas", "🍺", "Cerveza lata", 3000, 8], ["bebidas", "🍻", "Cerveza litro", 6500, 10], ["bebidas", "🥃", "Fernet con cola", 6000, null], ["bebidas", "🍷", "Copa de vino", 4500, null],
    ["cafeteria", "☕", "Café", 1800, null], ["cafeteria", "☕", "Cortado", 2000, null], ["cafeteria", "🥛", "Café con leche", 2500, null], ["cafeteria", "🥐", "Medialunas x2", 2200, 24],
    ["cafeteria", "🥪", "Tostado J y Q", 5500, 20], ["cafeteria", "🍫", "Alfajor", 1500, 40], ["cafeteria", "🌾", "Barrita de cereal", 1200, 30],
    ["comidas", "🍔", "Hamburguesa", 8500, null], ["comidas", "🌭", "Pancho", 4000, null], ["comidas", "🍕", "Porción de pizza", 3500, null], ["comidas", "🥟", "Empanada", 1800, null],
    ["comidas", "🍟", "Papas fritas", 4500, null], ["comidas", "🥜", "Maní", 1500, 25],
    ["padel", "🎾", "Tubo de pelotas", 12000, 14], ["padel", "🏓", "Alquiler de paleta", 4000, null], ["padel", "🩹", "Overgrip", 3000, 25], ["padel", "💡", "Luz extra 30 min", 3000, null],
    ["club", "👕", "Remera 29 Padel", 15000, 10], ["club", "🧢", "Gorra 29 Padel", 9000, 8]];
  const prod = {};
  for (const [cat, em, name, price, stock] of products)
    prod[name] = (await one("insert into product (club_id,name,emoji,category,price,stock) values ($1,$2,$3,$4,$5,$6) returning id, price", [C, name, em, cat, price, stock]));

  const plans = {};
  for (const [i, p] of [
    ["Bronce", 27000, 4, 2, 10, 2, 0, false, 0, 1], ["Plata", 51000, 8, 4, 15, 2, 2, false, 0, 1], ["Oro", 120000, 20, 18, 20, 8, 2, true, 2, 2]].entries())
    plans[p[0]] = (await one(`insert into plan (club_id,name,price,passes,months,discount_pct,special_uses,early_uses,can_transfer,invite_uses,referral_pass,ord)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *`, [C, ...p, i]));

  if (process.env.SEED_DEMO === "0") { console.log("Club 29 Padel creado sin datos de ejemplo."); return; }

  // ---- datos de ejemplo ----
  const today = todayAR();
  const names = [["Nico Ferreyra", "1155550101"], ["Fede Gómez", "1155550102"], ["Tomi Acosta", "1155550103"], ["Gonza Ruiz", "1155550104"], ["Lucía Medina", "1155550105"],
    ["Caro Paz", "1155550106"], ["Vale Díaz", "1155550107"], ["Meli Sosa", "1155550108"], ["Agus Luna", "1155550109"], ["Pato Castro", "1155550110"], ["Juli Benítez", "1155550111"], ["Eze Romero", "1155550112"]];
  const pl = {};
  for (const [n, ph] of names) pl[n] = (await one("insert into player (club_id,name,phone) values ($1,$2,$3) returning id", [C, n, ph])).id;
  const subs = {};
  async function sell(player, planName, monthsAgo = 0, referredBy = null) {
    const p = plans[planName]; const started = new Date(Date.now() - monthsAgo * 30 * 864e5); const exp = new Date(started.getTime() + p.months * 30 * 864e5);
    const s = await one(`insert into subscription (player_id,plan_id,started_at,expires_at,price_paid,passes_left,special_left,early_left,invite_left,referred_by)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`, [pl[player], p.id, started, exp, p.price, p.passes, p.special_uses, p.early_uses, p.invite_uses, referredBy ? pl[referredBy] : null]);
    await q("insert into pass_move (subscription_id,amount,reason,note,created_at) values ($1,$2,'compra',$3,$4)", [s.id, p.passes, "Plan " + planName, started]);
    if (referredBy) {
      const rs = subs[referredBy]; if (rs) { await q("update subscription set passes_left = passes_left + $2 where id=$1", [rs, p.referral_pass]); await q("insert into pass_move (subscription_id,amount,reason,note) values ($1,$2,'referido',$3)", [rs, p.referral_pass, "Referiste a " + player]); }
      await q("insert into points_move (player_id,points,reason) values ($1,300,'referido')", [pl[referredBy]]);
    }
    subs[player] = s.id; return s.id;
  }
  await sell("Nico Ferreyra", "Oro", 3); await sell("Lucía Medina", "Plata", 1); await sell("Agus Luna", "Bronce", 0, "Nico Ferreyra"); await sell("Caro Paz", "Oro", 0, "Lucía Medina"); await sell("Gonza Ruiz", "Plata", 2);
  // puntos de partidos ya jugados
  for (const [n, pts] of [["Nico Ferreyra", 2400], ["Lucía Medina", 1900], ["Gonza Ruiz", 1500], ["Caro Paz", 700], ["Agus Luna", 300], ["Fede Gómez", 200]])
    await q("insert into points_move (player_id,points,reason) values ($1,$2,'partido')", [pl[n], pts]);

  const groups = [["Nico Ferreyra", "Fede Gómez", "Tomi Acosta", "Gonza Ruiz"], ["Lucía Medina", "Caro Paz", "Vale Díaz", "Meli Sosa"], ["Agus Luna", "Pato Castro", "Juli Benítez", "Eze Romero"]];
  let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const sources = ["app", "manual", "fijo", "app", "bot"];
  async function book(date, t, ci, group, src, opts = {}) {
    const holder = group[0];
    const b = await one(`insert into booking (club_id,court_id,date,start,source,status,holder_name,holder_phone,court_price,sena_paid,booked_on)
      values ($1,$2,$3,$4,$5,'confirmed',$6,$7,30000,$8,$9) returning id`, [C, courts[ci], date, t, src, holder, names.find(n => n[0] === holder)[1], opts.sena ?? (src === "app" || src === "bot" ? 10000 : 0), opts.bookedOn || addDays(date, -1)]);
    for (const [i, n] of group.entries()) await q("insert into booking_player (booking_id,idx,name,player_id) values ($1,$2,$3,$4)", [b.id, i, n.split(" ")[0], pl[n]]);
    return b.id;
  }
  for (let d = 0; d < 7; d++) {
    const date = addDays(today, d);
    for (const t of times) for (let ci = 0; ci < 4; ci++) {
      const m = parseInt(t); let p = m >= 18 ? 0.6 : m >= 14 ? 0.3 : 0.18; if (dow(date) === 0 || dow(date) === 6) p += 0.15;
      if (rnd() < p) { const g = groups[Math.floor(rnd() * 3)]; await book(date, t, ci, g.map((x, i) => i === 0 ? x : x), sources[Math.floor(rnd() * sources.length)]).catch(() => {}); }
    }
  }
  // turno de hoy con el caso de cuenta partida: Nico usa pase, Fede pagó su parte y media agua y se fue
  await q("delete from booking where date=$1 and start='18:30' and court_id=$2", [today, courts[2]]);
  const b1 = await book(today, "18:30", 2, groups[0], "app");
  const sNico = subs["Nico Ferreyra"];
  await q("update booking_player set pass_used=1, pass_kind='normal', pass_sub_id=$2 where booking_id=$1 and idx=0", [b1, sNico]);
  await q("update subscription set passes_left = passes_left - 1 where id=$1", [sNico]);
  await q("insert into pass_move (subscription_id,amount,reason,booking_id,note) values ($1,-1,'uso',$2,'Cancha 3 18:30')", [sNico, b1]);
  const addC = async (b, name, qty, idx) => { const pr = prod[name]; await q("insert into consumption (booking_id,product_id,qty,unit_price,player_idx) values ($1,$2,$3,$4,$5)", [b, pr.id, qty, pr.price, idx]); await q("update product set sold=sold+$2, stock = case when stock is null then null else stock-$2 end where id=$1", [pr.id, qty]); };
  await addC(b1, "Agua sin gas", 1, [0, 1]); await addC(b1, "Gaseosa 500 ml", 1, [2]); await addC(b1, "Tubo de pelotas", 1, [0, 1, 2, 3]); await addC(b1, "Isotónica", 1, [3]);
  await q("insert into payment (booking_id,player_idx,amount,method) values ($1,1,9000,'Efectivo')", [b1]); // Fede: cancha 5000 + ½ agua 1000 + ¼ tubo 3000
  await q("delete from booking where date=$1 and start='20:00' and court_id=$2", [today, courts[0]]);
  const b2 = await book(today, "20:00", 0, groups[1], "bot");
  await addC(b2, "Cerveza lata", 4, [0, 1, 2, 3]); await addC(b2, "Papas fritas", 1, [0, 1, 2, 3]);
  await q("insert into counter_sale (club_id,total,method,items) values ($1,9800,'Efectivo',$2)", [C, JSON.stringify([{ name: "Café", qty: 3, price: 1800 }, { name: "Medialunas x2", qty: 2, price: 2200 }])]);

  // torneos de ejemplo (el fixture se genera al abrirlos)
  await q("insert into tournament (club_id,name,format,category,config) values ($1,$2,'liga','6ta',$3)", [C, "Liga de los jueves", JSON.stringify({ setsV: "2", setPts: 1, win: 3, lose: 1, startDate: nextDow(today, 4), players: ["Nico", "Fede", "Tomi", "Gonza", "Agus", "Pato", "Juli", "Eze"] })]);
  const pairs = [["Pérez / Gómez", "ambos"], ["Ruiz / Sosa", "sab"], ["Díaz / Molina", "ambos"], ["Acosta / Benítez", "ambos"], ["Romero / Herrera", "sab"], ["Medina / Castro", "ambos"],
    ["Torres / Luna", "ambos"], ["Flores / Ríos", "vie"], ["Sánchez / Ortiz", "ambos"], ["Álvarez / Vega", "sab"], ["Silva / Rojas", "ambos"], ["Morales / Paz", "ambos"]].map(([name, av]) => ({ name, av }));
  await q("insert into tournament (club_id,name,format,category,config) values ($1,$2,'zonas','5ta',$3)", [C, "Torneo 29 Padel · fin de semana", JSON.stringify({ setsV: "2st", setPts: 1, win: 3, lose: 1, startDate: nextDow(today, 5), pairs })]);
  console.log("29 Padel creado con datos de ejemplo.");
}
main().then(() => pool.end()).catch(e => { console.error(e); process.exit(1); });
