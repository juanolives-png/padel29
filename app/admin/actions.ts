"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { q, one, tx } from "@/lib/db";
import { ADMIN_COOKIE, adminToken, requireAdmin } from "@/lib/auth";
import { getBookingDetail, getClub } from "@/lib/data";
import { passFor, POINTS, canTransferNow } from "@/lib/club29";
import { minutesUntil, nowAR } from "@/lib/time";
import { generate, type TConfig, type Pair } from "@/lib/tournament";
import { EXPENSE_CATS } from "@/lib/finance";

const ok = (msg = "Listo") => ({ ok: true as const, msg });
const err = (msg: string) => ({ ok: false as const, msg });
const done = () => { revalidatePath("/admin", "layout"); };

export async function login(_: unknown, fd: FormData) {
  if (String(fd.get("password") || "") !== (process.env.ADMIN_PASSWORD || "29padel")) return { msg: "Contraseña incorrecta." };
  (await cookies()).set(ADMIN_COOKIE, await adminToken(), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 30, path: "/" });
  redirect("/admin");
}
export async function logout() { (await cookies()).delete(ADMIN_COOKIE); redirect("/admin/login"); }

/* ---------- turnos ---------- */
export async function loadBooking(id: string) { await requireAdmin(); return getBookingDetail(id); }

export async function createManual(input: { date: string; start: string; courtId: string; name: string; phone: string; source?: string }) {
  await requireAdmin(); const club = await getClub();
  const name = input.name.trim() || "Turno por teléfono", phone = input.phone.replace(/\D/g, "");
  try {
    const id = await tx(async c => {
      let playerId: string | null = null;
      if (phone) playerId = (await c.query("insert into player (club_id,name,phone) values ($1,$2,$3) on conflict (club_id,phone) do update set name=excluded.name returning id", [club.id, name, phone])).rows[0].id;
      const b = (await c.query(`insert into booking (club_id,court_id,date,start,source,holder_name,holder_phone,court_price,booked_on) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
        [club.id, input.courtId, input.date, input.start, input.source || "manual", name, phone, club.court_price, nowAR().date])).rows[0].id;
      for (let i = 0; i < 4; i++) await c.query("insert into booking_player (booking_id,idx,name,player_id) values ($1,$2,$3,$4)", [b, i, i === 0 ? name.split(" ")[0] : "Jugador " + (i + 1), i === 0 ? playerId : null]);
      return b;
    });
    done(); return { ok: true as const, msg: "Turno cargado", id };
  } catch { return { ok: false as const, msg: "Ese horario ya está ocupado.", id: "" }; }
}

export async function cancelBooking(id: string) {
  await requireAdmin();
  const b = await one("select * from booking where id=$1", [id]); if (!b) return err("No encontré el turno.");
  if (b.kind === "mesa") return deleteTab(id);
  const late = minutesUntil(b.date, b.start) < 12 * 60;
  await tx(async c => {
    const used = (await c.query("select * from booking_player where booking_id=$1 and pass_used>0", [id])).rows;
    for (const u of used) {
      if (!late && u.pass_sub_id) {
        await c.query("update subscription set passes_left=passes_left+$2, special_left=special_left+$3, early_left=early_left+$4, invite_left=invite_left+$5 where id=$1",
          [u.pass_sub_id, u.pass_used, u.pass_kind === "especial" ? 1 : 0, u.pass_kind === "anticipada" ? 1 : 0, u.pass_kind === "invitado" ? 1 : 0]);
        await c.query("insert into pass_move (subscription_id,amount,reason,booking_id,note) values ($1,$2,'devolucion',$3,'Turno cancelado con tiempo')", [u.pass_sub_id, u.pass_used, id]);
      } else if (u.pass_sub_id) await c.query("insert into pass_move (subscription_id,amount,reason,booking_id,note) values ($1,0,'cancelacion_tardia',$2,'Cancelado con menos de 12 h: el pase se pierde')", [u.pass_sub_id, id]);
    }
    await c.query("delete from points_move where booking_id=$1", [id]);
    await c.query("update booking set status='cancelled' where id=$1", [id]);
  });
  done(); return ok(late ? "Turno cancelado. Era con menos de 12 h: los pases usados se pierden." : "Turno cancelado. Pases devueltos.");
}

export async function renamePlayer(bookingId: string, idx: number, name: string) {
  await requireAdmin(); await q("update booking_player set name=$3 where booking_id=$1 and idx=$2", [bookingId, idx, name.trim() || "Jugador " + (idx + 1)]); done(); return ok();
}
export async function linkPlayer(bookingId: string, idx: number, phone: string, name?: string) {
  await requireAdmin(); const club = await getClub(); const ph = phone.replace(/\D/g, "");
  if (ph.length < 8) return err("Poné el celular completo, con característica.");
  let p = await one("select * from player where club_id=$1 and phone=$2", [club.id, ph]);
  if (!p && name) p = await one("insert into player (club_id,name,phone) values ($1,$2,$3) returning *", [club.id, name.trim(), ph]);
  if (!p) return err("No hay nadie con ese celular. Escribí también el nombre para darlo de alta.");
  await q("update booking_player set player_id=$3, name=$4 where booking_id=$1 and idx=$2", [bookingId, idx, p.id, p.name.split(" ")[0]]);
  done(); return ok(p.name + " vinculado");
}

export async function addConsumption(bookingId: string, productId: string, qty: number, playerIdx: number[]) {
  await requireAdmin();
  const p = await one("select * from product where id=$1", [productId]); if (!p) return err("Producto inexistente.");
  if (p.stock != null && p.stock < qty) return err("Sin stock de " + p.name + ".");
  const idx = [...playerIdx].sort((a, b) => a - b);
  await tx(async c => {
    const ex = (await c.query("select id from consumption where booking_id=$1 and product_id=$2 and player_idx=$3::int[]", [bookingId, productId, idx])).rows[0];
    if (ex) await c.query("update consumption set qty=qty+$2 where id=$1", [ex.id, qty]);
    else await c.query("insert into consumption (booking_id,product_id,qty,unit_price,player_idx,unit_cost) values ($1,$2,$3,$4,$5,$6)", [bookingId, productId, qty, p.price, idx, p.cost ?? null]);
    await c.query("update product set sold=sold+$2, stock=case when stock is null then null else stock-$2 end where id=$1", [productId, qty]);
  });
  done(); return ok(p.emoji + " " + p.name + " cargado");
}
export async function removeConsumption(lineId: string) {
  await requireAdmin();
  const l0 = await one("select * from consumption where id=$1", [lineId]);
  if (l0 && !l0.player_idx.length && Object.keys(l0.shares || {}).length && l0.qty * l0.unit_price - Object.values(l0.shares).reduce((s: number, v: any) => s + Number(v), 0) < l0.unit_price) return err("Ese producto ya está pagado en parte: anulá el pago primero.");
  await tx(async c => {
    const l = (await c.query("select * from consumption where id=$1", [lineId])).rows[0]; if (!l) return;
    if (l.qty > 1) await c.query("update consumption set qty=qty-1 where id=$1", [lineId]); else await c.query("delete from consumption where id=$1", [lineId]);
    await c.query("update product set sold=greatest(sold-1,0), stock=case when stock is null then null else stock+1 end where id=$1", [l.product_id]);
  });
  done(); return ok("Quitado");
}

async function dueOf(bookingId: string) {
  const d = await getBookingDetail(bookingId); if (!d) throw new Error("Turno inexistente"); return d;
}
export async function payPlayer(bookingId: string, idx: number, method: string, amount?: number) {
  await requireAdmin(); const d = await dueOf(bookingId);
  const i = d.acct.players.findIndex((p: any) => p.idx === idx); const due = Math.round(d.acct.due[i]);
  const amt = Math.round(amount ?? due); if (amt <= 0) return err("No debe nada.");
  await q("insert into payment (booking_id,player_idx,amount,method) values ($1,$2,$3,$4)", [bookingId, idx, amt, method]);
  done(); return ok(`${d.players[i].name} pagó $${amt.toLocaleString("es-AR")} · ${method}`);
}
/* ---------- la mesa: consumos sin dueño que se pagan por partes ---------- */
type Tx = import("pg").PoolClient;
const leftOf = (l: any) => l.qty * l.unit_price - Object.values(l.shares || {}).reduce((s: number, v: any) => s + Number(v), 0);
async function addShare(c: Tx, l: any, idx: number, amount: number) {
  const sh = { ...(l.shares || {}) }; sh[idx] = Math.round(((Number(sh[idx]) || 0) + amount) * 100) / 100;
  l.shares = sh; await c.query("update consumption set shares=$2 where id=$1", [l.id, JSON.stringify(sh)]);
}
/** Reparte en partes iguales lo que quedó en la mesa entre los jugadores indicados */
async function assignPool(c: Tx, bookingId: string, idxs: number[]) {
  if (!idxs.length) return;
  const pool = (await c.query("select * from consumption where booking_id=$1 and cardinality(player_idx)=0 for update", [bookingId])).rows;
  for (const l of pool) { const left = leftOf(l); if (left < 1) continue; for (const i of idxs) await addShare(c, l, i, left / idxs.length); }
}
/** Un jugador se lleva `amount` pesos de un consumo de la mesa (una o varias unidades, o una parte) */
async function takeFromPool(c: Tx, bookingId: string, lineId: string, amount: number, idx: number) {
  const l = (await c.query("select * from consumption where id=$1 and booking_id=$2 and cardinality(player_idx)=0 for update", [lineId, bookingId])).rows[0];
  if (!l) throw new Error("Ese consumo ya no está en la mesa.");
  const n = Math.min(Math.round(amount * 100) / 100, leftOf(l)); if (n <= 0) return 0;
  await addShare(c, l, idx, n); return n;
}
async function balanceOf(c: Tx | null, playerId: string) {
  const r = c ? (await c.query("select coalesce(sum(amount),0)::int as s from account_move where player_id=$1", [playerId])).rows[0] : await one("select coalesce(sum(amount),0)::int as s from account_move where player_id=$1", [playerId]);
  return r.s as number;
}
const MONEY = ["Efectivo", "Transferencia", "QR Mercado Pago"];
const pesos = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");

/** Nombre y apellido + celular: obligatorios para tener cuenta corriente */
export type Ident = { name?: string; phone?: string };
const fullName = (n: string) => n.trim().split(/\s+/).filter(w => w.length > 1).length >= 2;
async function ensureIdentity(c: Tx, clubId: string, bookingId: string, idx: number, id: Ident) {
  const bp = (await c.query("select bp.*, p.name as full_name, p.phone from booking_player bp left join player p on p.id=bp.player_id where bp.booking_id=$1 and bp.idx=$2", [bookingId, idx])).rows[0];
  if (!bp) throw new Error("Jugador inexistente.");
  const name = (id.name ?? bp.full_name ?? "").trim().replace(/\s+/g, " "), phone = (id.phone ?? bp.phone ?? "").replace(/\D/g, "");
  if (!fullName(name)) throw new Error(`Para pasarlo a cuenta corriente falta el nombre y apellido de ${bp.name}.`);
  if (phone.length < 8) throw new Error(`Para pasarlo a cuenta corriente falta el celular de ${bp.name}.`);
  let pid: string;
  const byPhone = (await c.query("select id from player where club_id=$1 and phone=$2", [clubId, phone])).rows[0];
  if (bp.player_id && (!byPhone || byPhone.id === bp.player_id)) { pid = bp.player_id; await c.query("update player set name=$2, phone=$3 where id=$1", [pid, name, phone]); }
  else if (byPhone) { pid = byPhone.id; await c.query("update player set name=$2 where id=$1", [pid, name]); }
  else pid = (await c.query("insert into player (club_id,name,phone) values ($1,$2,$3) returning id", [clubId, name, phone])).rows[0].id;
  await c.query("update booking_player set player_id=$3, name=$4 where booking_id=$1 and idx=$2", [bookingId, idx, pid, name.split(" ")[0]]);
  return pid;
}

/**
 * Cobro a una persona. Junta: su parte (si se elige) + lo que se lleva de la mesa + su deuda anterior (si se elige).
 * method: Efectivo | Transferencia | QR Mercado Pago | Saldo (usa lo que tiene a favor) | A cuenta (lo deja debiendo)
 * received: efectivo que entrega; si sobra, es vuelto o queda a favor (changeToCredit).
 */
export async function cobrar(input: { bookingId: string; idx: number; includeOwn: boolean; takes: { lineId: string; amount: number }[]; method: string;
  received?: number; changeToCredit?: boolean; includeDebt?: boolean; restToAccount?: boolean; phone?: string; name?: string }) {
  await requireAdmin(); const club = await getClub();
  const before = await dueOf(input.bookingId);
  const i = before.acct.players.findIndex((p: any) => p.idx === input.idx); if (i < 0) return err("Jugador inexistente.");
  const bp = before.players[i];
  const own = input.includeOwn ? Math.max(0, before.acct.due[i]) : 0;
  const needsAccount = input.method === "Saldo" || input.method === "A cuenta" || !!input.changeToCredit || !!input.includeDebt || !!input.restToAccount;
  let msg = "";
  try {
    await tx(async c => {
      // la cuenta corriente exige nombre, apellido y celular
      let playerId: string | null = bp.player_id;
      if (needsAccount) playerId = await ensureIdentity(c, club.id, input.bookingId, input.idx, { name: input.name, phone: input.phone });
      let items = 0;
      for (const t of input.takes) if (t.amount > 0) items += await takeFromPool(c, input.bookingId, t.lineId, t.amount, input.idx);
      const part = Math.round(own + items); // lo de este turno
      const bal = playerId ? await balanceOf(c, playerId) : 0;
      const debt = input.includeDebt && bal < 0 ? -bal : 0;
      const pay = (amt: number, method: string) => amt > 0 && c.query("insert into payment (booking_id,player_idx,amount,method) values ($1,$2,$3,$4)", [input.bookingId, input.idx, Math.round(amt), method]);
      const move = (amt: number, kind: string, method: string, note = "") => c.query("insert into account_move (club_id,player_id,amount,kind,method,booking_id,note) values ($1,$2,$3,$4,$5,$6,$7)", [club.id, playerId, Math.round(amt), kind, method, input.bookingId, note]);

      if (input.method === "Saldo") {
        if (bal <= 0) throw new Error("No tiene saldo a favor.");
        const use = Math.min(bal, part); await pay(use, "Saldo a favor"); await move(-use, "uso_saldo", "Saldo a favor", "Pagó con saldo");
        msg = `${bp.name} pagó ${pesos(use)} con su saldo a favor` + (part > use ? ` · le falta ${pesos(part - use)}` : ` · le quedan ${pesos(bal - use)} a favor`);
        return;
      }
      if (input.method === "A cuenta") {
        if (part <= 0) throw new Error("No hay nada para dejar a cuenta.");
        await pay(part, "Cuenta corriente"); await move(-part, "deuda", "", "Quedó debiendo del turno");
        msg = `${pesos(part)} a la cuenta de ${bp.name} · debe ${pesos(-(bal - part))}`; return;
      }
      if (!MONEY.includes(input.method)) throw new Error("Elegí cómo paga.");
      const total = part + debt;
      const got = input.method === "Efectivo" && input.received != null && input.received > 0 ? Math.round(input.received) : total;
      if (got <= 0) throw new Error("No hay nada para cobrar.");
      const toTurn = Math.min(got, part); await pay(toTurn, input.method);
      let r = got - toTurn;
      const toDebt = Math.min(r, debt); if (toDebt > 0) { await move(toDebt, "pago_deuda", input.method, "Pagó deuda anterior"); r -= toDebt; }
      const parts = [`${bp.name} pagó ${pesos(got)} · ${input.method === "QR Mercado Pago" ? "QR MP" : input.method}`];
      if (got < part) {
        if (input.restToAccount) { await pay(part - got, "Cuenta corriente"); await move(-(part - got), "deuda", "", "Le faltó plata al pagar"); parts.push(`${pesos(part - got)} a su cuenta corriente`); }
        else parts.push(`queda debiendo ${pesos(part - got)} del turno`);
      }
      if (r > 0) { if (input.changeToCredit) { await move(r, "a_favor", input.method, "Vuelto a favor"); parts.push(`${pesos(r)} quedan a favor`); } else parts.push(`vuelto ${pesos(r)}`); }
      msg = parts.join(" · ");
    });
  } catch (e) { return err((e as Error).message); }
  done(); revalidatePath("/admin/caja"); revalidatePath("/admin/cuentas"); return ok(msg);
}
/** compatibilidad: cobro con ítems de la mesa en unidades */
export async function payWithItems(bookingId: string, idx: number, takes: { lineId: string; qty: number }[], includeOwn: boolean, method: string) {
  const d = await dueOf(bookingId);
  return cobrar({ bookingId, idx, includeOwn, method, takes: takes.map(t => { const l = d.lines.find((x: any) => x.id === t.lineId); return { lineId: t.lineId, amount: (l?.unit_price || 0) * t.qty }; }) });
}
/** Cierra la cuenta del turno: lo que cada uno debe (y lo que quedó en la mesa) pasa a su cuenta corriente */
export async function closeToAccount(bookingId: string, people: ({ idx: number } & Ident)[]) {
  await requireAdmin(); const club = await getClub();
  try {
    const n = await tx(async c => {
      const d0 = await getBookingDetail(bookingId); if (!d0) throw new Error("Turno inexistente.");
      if (d0.acct.pool > 0) { const owing = d0.acct.players.filter((_: any, i: number) => d0.acct.due[i] > 0).map((p: any) => p.idx); await assignPool(c, bookingId, owing.length ? owing : d0.acct.players.map((p: any) => p.idx)); }
      // recalcular con la mesa repartida (dentro de la misma transacción)
      const lines = (await c.query("select c.id, c.qty, c.unit_price, c.player_idx, c.shares, p.name, p.emoji from consumption c join product p on p.id=c.product_id where booking_id=$1", [bookingId])).rows;
      const pays = (await c.query("select player_idx, amount from payment where booking_id=$1", [bookingId])).rows;
      const { computeAccount } = await import("@/lib/account");
      const a = computeAccount({ courtPrice: d0.booking.court_price, senaPaid: d0.booking.sena_paid, senaMode: d0.booking.sena_mode,
        players: d0.players.map((p: any) => ({ idx: p.idx, name: p.name, passUsed: p.pass_used, passKind: p.pass_kind })),
        lines: lines.map((l: any) => ({ id: l.id, qty: l.qty, unitPrice: l.unit_price, playerIdx: l.player_idx, name: l.name, emoji: l.emoji, shares: l.shares })),
        payments: pays.map((p: any) => ({ playerIdx: p.player_idx, amount: p.amount })) });
      let k = 0, acc = 0;
      for (const [i, pl] of a.players.entries()) {
        const due = a.due[i]; if (due <= 0) continue;
        const amt = Math.round(acc + due) - Math.round(acc); acc += due; if (amt <= 0) continue;
        const who = people.find(p => p.idx === pl.idx) || {};
        const pid = await ensureIdentity(c, club.id, bookingId, pl.idx, who);
        await c.query("insert into payment (booking_id,player_idx,amount,method) values ($1,$2,$3,'Cuenta corriente')", [bookingId, pl.idx, amt]);
        await c.query("insert into account_move (club_id,player_id,amount,kind,method,booking_id,note) values ($1,$2,$3,'deuda','',$4,'Cuenta del turno cerrada')", [club.id, pid, -amt, bookingId]);
        k++;
      }
      return k;
    });
    done(); revalidatePath("/admin/caja"); revalidatePath("/admin/cuentas");
    return n ? ok(`Cuenta cerrada: ${n} deuda${n > 1 ? "s" : ""} pasaron a cuenta corriente`) : err("No hay nada que pasar a cuenta corriente.");
  } catch (e) { return err((e as Error).message); }
}
/** Reparte la mesa entre los jugadores elegidos (por defecto, los que todavía deben) */
export async function splitPool(bookingId: string, idxs?: number[]) {
  await requireAdmin(); const d = await dueOf(bookingId);
  const to = idxs?.length ? idxs : d.acct.players.filter((_: any, i: number) => d.acct.due[i] > 0).map((p: any) => p.idx);
  const target = to.length ? to : d.acct.players.map((p: any) => p.idx);
  await tx(c => assignPool(c, bookingId, target));
  done(); return ok(`Mesa repartida entre ${target.length}`);
}
export async function payAll(bookingId: string, method: string) {
  await requireAdmin();
  { const d0 = await dueOf(bookingId); if (d0.acct.pool > 0) { const owing = d0.acct.players.filter((_: any, i: number) => d0.acct.due[i] > 0).map((p: any) => p.idx); await tx(c => assignPool(c, bookingId, owing.length ? owing : d0.acct.players.map((p: any) => p.idx))); } }
  const d = await dueOf(bookingId); let s = 0, acc = 0;
  // redondeo sin perder ni sumar pesos: cada uno paga la diferencia entre acumulados redondeados
  for (const [i, p] of d.acct.players.entries()) { const due = d.acct.due[i]; if (due > 0) { const amt = Math.round(acc + due) - Math.round(acc); acc += due; if (amt > 0) { s += amt; await q("insert into payment (booking_id,player_idx,amount,method) values ($1,$2,$3,$4)", [bookingId, p.idx, amt, method]); } } }
  done(); return ok(`Cobrado $${s.toLocaleString("es-AR")} · ${method}`);
}
export async function undoPayment(paymentId: string) {
  await requireAdmin(); const p = await one("select * from payment where id=$1", [paymentId]); if (!p) return err("No existe.");
  await tx(async c => {
    await c.query("delete from payment where id=$1", [paymentId]);
    // si fue con saldo o a cuenta, se deshace también el movimiento de la cuenta corriente
    if (p.method === "Saldo a favor" || p.method === "Cuenta corriente") {
      const m = (await c.query("select id from account_move where booking_id=$1 and kind=$2 and amount=$3 order by created_at desc limit 1", [p.booking_id, p.method === "Saldo a favor" ? "uso_saldo" : "deuda", -p.amount])).rows[0];
      if (m) await c.query("delete from account_move where id=$1", [m.id]);
    }
  });
  done(); revalidatePath("/admin/cuentas"); return ok("Pago anulado");
}

/* ---------- cuentas corrientes ---------- */
export async function loadAccount(playerId: string) {
  await requireAdmin(); const club = await getClub();
  const player = await one("select * from player where id=$1 and club_id=$2", [playerId, club.id]); if (!player) return null;
  const moves = await q(`select m.*, b.date, b.start, c.name as court from account_move m left join booking b on b.id=m.booking_id left join court c on c.id=b.court_id
    where m.player_id=$1 order by m.created_at desc limit 100`, [playerId]);
  const balance = moves.reduce((s, m) => s + m.amount, 0);
  return JSON.parse(JSON.stringify({ player, moves, balance }));
}
/** Movimiento manual: cobrar deuda, cargar saldo a favor o devolver saldo en plata */
export async function accountAction(input: { playerId?: string; name?: string; phone?: string; kind: "pago_deuda" | "carga" | "devolucion"; amount: number; method: string; note: string }) {
  await requireAdmin(); const club = await getClub();
  const amt = Math.round(Number(input.amount)); if (!(amt > 0)) return err("Poné un importe.");
  if (!MONEY.includes(input.method)) return err("Elegí el medio de pago.");
  let pid = input.playerId;
  if (!pid) {
    const ph = (input.phone || "").replace(/\D/g, ""); if (ph.length < 8 || !(input.name || "").trim()) return err("Poné nombre y celular.");
    pid = (await one("insert into player (club_id,name,phone) values ($1,$2,$3) on conflict (club_id,phone) do update set name=excluded.name returning id", [club.id, input.name!.trim(), ph]))!.id;
  }
  const bal = await balanceOf(null, pid!);
  if (input.kind === "devolucion" && amt > bal) return err(`Solo tiene ${pesos(Math.max(0, bal))} a favor.`);
  const sign = input.kind === "devolucion" ? -1 : 1;
  await q("insert into account_move (club_id,player_id,amount,kind,method,note) values ($1,$2,$3,$4,$5,$6)", [club.id, pid, sign * amt, input.kind, input.method, input.note.trim()]);
  revalidatePath("/admin/cuentas"); revalidatePath("/admin/caja"); done();
  return { ok: true as const, msg: input.kind === "pago_deuda" ? `Cobrado ${pesos(amt)}` : input.kind === "carga" ? `${pesos(amt)} cargados a favor` : `Devueltos ${pesos(amt)}`, id: pid! };
}
export async function undoAccountMove(id: string) {
  await requireAdmin(); const m = await one("select * from account_move where id=$1", [id]); if (!m) return err("No existe.");
  if (m.booking_id && (m.kind === "deuda" || m.kind === "uso_saldo")) return err("Este movimiento viene de un turno: anulá el pago desde la cuenta del turno.");
  await q("delete from account_move where id=$1", [id]); revalidatePath("/admin/cuentas"); revalidatePath("/admin/caja"); done(); return ok("Movimiento anulado");
}
export async function setSena(bookingId: string, amount: number, mode: string, method?: string) {
  await requireAdmin(); const amt = Math.max(0, Math.round(amount));
  // la fecha de la seña se guarda la primera vez que se registra (para la caja del día)
  await q(`update booking set sena_paid=$2, sena_mode=$3, sena_method=coalesce($4, sena_method),
    sena_at = case when $2 = 0 then null when sena_at is null or sena_paid = 0 then now() else sena_at end where id=$1`,
    [bookingId, amt, mode === "reserva" ? "reserva" : "total", method || null]);
  done(); return ok("Seña actualizada");
}

/* ---------- 29club en el turno ---------- */
export async function applyPass(bookingId: string, idx: number, subId: string, inviteFor?: number) {
  await requireAdmin();
  const b = await one("select * from booking where id=$1", [bookingId]); if (!b) return err("Turno inexistente.");
  const sub = await one("select s.*, pl.early_uses, pl.can_transfer, pl.name as plan_name from subscription s join plan pl on pl.id=s.plan_id where s.id=$1", [subId]);
  if (!sub || new Date(sub.expires_at) < new Date()) return err("El plan venció.");
  const target = inviteFor ?? idx, invite = inviteFor != null && inviteFor !== idx;
  const slot = await one("select * from booking_player where booking_id=$1 and idx=$2", [bookingId, target]);
  if (slot?.pass_used > 0) return err("Esa parte ya está pagada con un pase.");
  const pf = passFor({ passesLeft: sub.passes_left, specialLeft: sub.special_left, earlyLeft: sub.early_left, inviteLeft: sub.invite_left, expiresAt: sub.expires_at, plan: { earlyUses: sub.early_uses, canTransfer: sub.can_transfer } }, b.date, b.start, b.booked_on, invite);
  if (!pf) return err(invite ? "No le quedan pases para invitados." : "No le quedan pases suficientes.");
  await tx(async c => {
    await c.query("update subscription set passes_left=passes_left-$2, special_left=special_left-$3, early_left=early_left-$4, invite_left=invite_left-$5 where id=$1",
      [subId, pf.amount, pf.kind === "especial" ? 1 : 0, pf.kind === "anticipada" ? 1 : 0, pf.kind === "invitado" ? 1 : 0]);
    const reason = pf.kind === "especial" ? "medio_pase_especial" : pf.kind === "anticipada" ? "medio_pase_anticipada" : pf.kind === "invitado" ? "invitado" : "uso";
    await c.query("insert into pass_move (subscription_id,amount,reason,booking_id,note) values ($1,$2,$3,$4,$5)", [subId, -pf.amount, reason, bookingId, `${b.date} ${b.start}`]);
    await c.query("update booking_player set pass_used=$3, pass_kind=$4, pass_sub_id=$5 where booking_id=$1 and idx=$2", [bookingId, target, pf.amount, pf.kind, subId]);
    if (!invite) await c.query("insert into points_move (player_id,points,reason,booking_id) values ($1,$2,$3,$4)", [sub.player_id, pf.kind === "especial" ? POINTS.partidoEspecial : POINTS.partido, pf.kind === "especial" ? "partido_especial" : "partido", bookingId]);
  });
  done(); return ok(pf.amount === 0.5 ? `Medio pase (${pf.kind === "especial" ? "horario especial" : "reserva anticipada"})` : invite ? "Pase de invitado aplicado" : "1 pase aplicado");
}
export async function undoPass(bookingId: string, idx: number) {
  await requireAdmin();
  const s = await one("select * from booking_player where booking_id=$1 and idx=$2", [bookingId, idx]); if (!s || !s.pass_sub_id) return err("No tenía pase.");
  await tx(async c => {
    await c.query("update subscription set passes_left=passes_left+$2, special_left=special_left+$3, early_left=early_left+$4, invite_left=invite_left+$5 where id=$1",
      [s.pass_sub_id, s.pass_used, s.pass_kind === "especial" ? 1 : 0, s.pass_kind === "anticipada" ? 1 : 0, s.pass_kind === "invitado" ? 1 : 0]);
    await c.query("insert into pass_move (subscription_id,amount,reason,booking_id,note) values ($1,$2,'devolucion',$3,'Se quitó el pase del turno')", [s.pass_sub_id, s.pass_used, bookingId]);
    await c.query("update booking_player set pass_used=0, pass_kind='', pass_sub_id=null where booking_id=$1 and idx=$2", [bookingId, idx]);
    await c.query("delete from points_move where booking_id=$1 and player_id=(select player_id from subscription where id=$2)", [bookingId, s.pass_sub_id]);
  });
  done(); return ok("Pase devuelto");
}

/* ---------- bar ---------- */
export async function counterSale(items: { productId: string; qty: number }[], method: string) {
  await requireAdmin(); const club = await getClub(); if (!items.length) return err("El ticket está vacío.");
  const ps = await q("select * from product where id = any($1)", [items.map(i => i.productId)]);
  for (const it of items) { const p = ps.find(x => x.id === it.productId); if (p.stock != null && p.stock < it.qty) return err("Sin stock de " + p.name + "."); }
  const lines = items.map(it => { const p = ps.find(x => x.id === it.productId); return { productId: p.id, name: p.name, emoji: p.emoji, qty: it.qty, price: p.price, cost: p.cost ?? null }; });
  const total = lines.reduce((s, l) => s + l.qty * l.price, 0);
  await tx(async c => {
    await c.query("insert into counter_sale (club_id,total,method,items) values ($1,$2,$3,$4)", [club.id, total, method, JSON.stringify(lines)]);
    for (const it of items) await c.query("update product set sold=sold+$2, stock=case when stock is null then null else stock-$2 end where id=$1", [it.productId, it.qty]);
  });
  done(); return ok(`Venta cobrada: $${total.toLocaleString("es-AR")} · ${method}`);
}
export async function chargeToBooking(bookingId: string, items: { productId: string; qty: number }[], playerIdx: number[]) {
  await requireAdmin(); for (const it of items) { const r = await addConsumption(bookingId, it.productId, it.qty, playerIdx); if (!r.ok) return r; }
  return ok("Cargado a la cuenta");
}
export async function saveProduct(input: { id?: string; name: string; emoji: string; category: string; price: number; cost?: number | null; stock: number | null; active: boolean }) {
  await requireAdmin(); const club = await getClub();
  if (!input.name.trim() || !(input.price > 0)) return err("Completá nombre y precio de venta.");
  const cost = input.cost == null || isNaN(Number(input.cost)) ? null : Math.max(0, Math.round(Number(input.cost)));
  if (input.id) await q("update product set name=$2, emoji=$3, category=$4, price=$5, stock=$6, active=$7, cost=$8 where id=$1", [input.id, input.name.trim(), input.emoji || "🛒", input.category, Math.round(input.price), input.stock, input.active, cost]);
  else await q("insert into product (club_id,name,emoji,category,price,stock,active,cost) values ($1,$2,$3,$4,$5,$6,$7,$8)", [club.id, input.name.trim(), input.emoji || "🛒", input.category, Math.round(input.price), input.stock, input.active, cost]);
  done(); return ok("Producto guardado");
}

/* ---------- 29club: socios ---------- */
export async function sellPlan(input: { name: string; phone: string; planId: string; method: string; referrerPhone?: string }) {
  await requireAdmin(); const club = await getClub(); const ph = input.phone.replace(/\D/g, "");
  if (!input.name.trim() || ph.length < 8) return err("Completá nombre y celular.");
  const plan = await one("select * from plan where id=$1", [input.planId]); if (!plan) return err("Elegí un plan.");
  const refPh = (input.referrerPhone || "").replace(/\D/g, "");
  const ref = refPh ? await one("select * from player where club_id=$1 and phone=$2", [club.id, refPh]) : null;
  if (refPh && !ref) return err("No encontré al socio que lo refirió con ese celular.");
  if (ref && refPh === ph) return err("No se puede referir a uno mismo.");
  const msg = await tx(async c => {
    const p = (await c.query("insert into player (club_id,name,phone) values ($1,$2,$3) on conflict (club_id,phone) do update set name=excluded.name returning id", [club.id, input.name.trim(), ph])).rows[0];
    const s = (await c.query(`insert into subscription (player_id,plan_id,expires_at,price_paid,passes_left,special_left,early_left,invite_left,method,referred_by)
      values ($1,$2, now() + ($3 || ' months')::interval, $4,$5,$6,$7,$8,$9,$10) returning id`, [p.id, plan.id, String(plan.months), plan.price, plan.passes, plan.special_uses, plan.early_uses, plan.invite_uses, input.method, ref?.id || null])).rows[0];
    await c.query("insert into pass_move (subscription_id,amount,reason,note) values ($1,$2,'compra',$3)", [s.id, plan.passes, "Plan " + plan.name + " · " + input.method]);
    let extra = "";
    if (ref) {
      const rs = (await c.query("select id from subscription where player_id=$1 and expires_at>now() order by expires_at desc limit 1", [ref.id])).rows[0];
      if (rs) { await c.query("update subscription set passes_left=passes_left+$2 where id=$1", [rs.id, plan.referral_pass]); await c.query("insert into pass_move (subscription_id,amount,reason,note) values ($1,$2,'referido',$3)", [rs.id, plan.referral_pass, "Referiste a " + input.name.trim()]); extra = ` ${ref.name} ganó ${plan.referral_pass} pase${plan.referral_pass > 1 ? "s" : ""} y ${POINTS.referido} puntos.`; }
      else extra = ` ${ref.name} ganó ${POINTS.referido} puntos (no tiene plan activo para sumar pases).`;
      await c.query("insert into points_move (player_id,points,reason) values ($1,$2,'referido')", [ref.id, POINTS.referido]);
    }
    return `Plan ${plan.name} vendido a ${input.name.trim()}.` + extra;
  });
  done(); return ok(msg);
}
export async function transferPasses(fromSubId: string, toPhone: string, amount: number) {
  await requireAdmin(); const club = await getClub();
  const s = await one("select s.*, pl.can_transfer from subscription s join plan pl on pl.id=s.plan_id where s.id=$1", [fromSubId]);
  if (!s) return err("Plan inexistente.");
  if (!canTransferNow({ expiresAt: s.expires_at, plan: { canTransfer: s.can_transfer } })) return err(s.can_transfer ? "En el último mes del plan no se pueden transferir pases." : "Solo el plan Oro permite transferir pases.");
  const n = Math.floor(amount); if (n < 1 || n > Math.floor(s.passes_left)) return err("Cantidad inválida.");
  const to = await one("select p.id, p.name from player p where p.club_id=$1 and p.phone=$2", [club.id, toPhone.replace(/\D/g, "")]);
  if (!to) return err("No encontré a ningún socio con ese celular.");
  const ts = await one("select id from subscription where player_id=$1 and expires_at>now() order by expires_at desc limit 1", [to.id]);
  if (!ts) return err(to.name + " no tiene un plan activo: los pases se transfieren entre socios.");
  if (ts.id === fromSubId) return err("Es el mismo socio.");
  await tx(async c => {
    await c.query("update subscription set passes_left=passes_left-$2 where id=$1", [fromSubId, n]);
    await c.query("update subscription set passes_left=passes_left+$2 where id=$1", [ts.id, n]);
    await c.query("insert into pass_move (subscription_id,amount,reason,note) values ($1,$2,'transfer_out',$3)", [fromSubId, -n, "A " + to.name]);
    await c.query("insert into pass_move (subscription_id,amount,reason,note) values ($1,$2,'transfer_in',$3)", [ts.id, n, "De otro socio"]);
  });
  done(); return ok(`${n} pase${n > 1 ? "s" : ""} transferido${n > 1 ? "s" : ""} a ${to.name}`);
}

/* ---------- torneos ---------- */
export async function createTournament(input: { name: string; format: string; category: string; config: TConfig }) {
  await requireAdmin(); const club = await getClub();
  const fx = generate(input.format, input.config);
  const t = await one("insert into tournament (club_id,name,format,category,config,fixture) values ($1,$2,$3,$4,$5,$6) returning id", [club.id, input.name.trim() || "Torneo", input.format, input.category, JSON.stringify(input.config), JSON.stringify(fx)]);
  done(); revalidatePath("/torneos"); return { ok: true as const, msg: "Torneo creado", id: t.id as string };
}
export async function saveScore(tid: string, matchId: string, scores: (number | null)[][]) {
  await requireAdmin(); await q("update tournament set results = jsonb_set(results, array['scores', $2::text], $3::jsonb) where id=$1", [tid, matchId, JSON.stringify(scores)]); revalidatePath("/torneos", "layout"); return ok();
}
export async function saveWinner(tid: string, matchId: string, w: "A" | "B" | null) {
  await requireAdmin();
  if (w) await q("update tournament set results = jsonb_set(results, array['winners', $2::text], to_jsonb($3::text)) where id=$1", [tid, matchId, w]);
  else await q("update tournament set results = results #- array['winners', $2::text] where id=$1", [tid, matchId]);
  revalidatePath("/torneos", "layout"); done(); return ok();
}
export async function updatePairs(tid: string, pairs: Pair[]) {
  await requireAdmin(); const t = await one("select * from tournament where id=$1", [tid]); if (!t) return err("Torneo inexistente.");
  const cfg = { ...t.config, pairs }; const fx = generate(t.format, cfg);
  // si solo cambió la disponibilidad (mismas parejas), los partidos son los mismos: se conservan los resultados
  const same = JSON.stringify((t.config.pairs || []).map((p: Pair) => p.name)) === JSON.stringify(pairs.map(p => p.name));
  await q(`update tournament set config=$2, fixture=$3${same ? "" : `, results='{"scores":{},"winners":{}}'`} where id=$1`, [tid, JSON.stringify(cfg), JSON.stringify(fx)]);
  done(); revalidatePath("/torneos", "layout"); return ok(same ? "Cronograma rearmado" : "Cronograma rearmado (se borraron los resultados)");
}
/** Cambia horarios, canchas o duración: rearma el cronograma y conserva los resultados ya cargados */
export async function updateTournamentConfig(tid: string, patch: Partial<TConfig>) {
  await requireAdmin(); const t = await one("select * from tournament where id=$1", [tid]); if (!t) return err("Torneo inexistente.");
  const cfg = { ...t.config, ...patch }; const fx = generate(t.format, cfg);
  await q("update tournament set config=$2, fixture=$3 where id=$1", [tid, JSON.stringify(cfg), JSON.stringify(fx)]);
  done(); revalidatePath("/torneos", "layout"); return ok("Cronograma rearmado");
}
export async function deleteTournament(tid: string) { await requireAdmin(); await q("delete from tournament where id=$1", [tid]); done(); revalidatePath("/torneos", "layout"); redirect("/admin/torneos"); }

/* ---------- configuración ---------- */
export async function saveClub(input: { name: string; tagline: string; color_primary: string; color_accent: string; whatsapp: string; court_price: number; sena_amount: number; open_times: string[]; logo_url: string }) {
  await requireAdmin(); const club = await getClub();
  const times = input.open_times.map(t => t.trim()).filter(t => /^\d{2}:\d{2}$/.test(t)).sort();
  if (!times.length) return err("Cargá al menos un horario de inicio (HH:MM).");
  await q(`update club set name=$2, tagline=$3, color_primary=$4, color_accent=$5, whatsapp=$6, court_price=$7, sena_amount=$8, open_times=$9, logo_url=$10 where id=$1`,
    [club.id, input.name.trim(), input.tagline.trim(), input.color_primary, input.color_accent, input.whatsapp.trim(), Math.round(input.court_price), Math.round(input.sena_amount), times, input.logo_url.trim() || null]);
  revalidatePath("/", "layout"); return ok("Configuración guardada");
}
export async function saveCourts(courts: { id?: string; name: string; kind: string }[]) {
  await requireAdmin(); const club = await getClub();
  for (const [i, c] of courts.entries()) {
    if (c.id) await q("update court set name=$2, kind=$3, ord=$4 where id=$1", [c.id, c.name.trim(), c.kind, i]);
    else if (c.name.trim()) await q("insert into court (club_id,name,kind,ord) values ($1,$2,$3,$4)", [club.id, c.name.trim(), c.kind, i]);
  }
  revalidatePath("/", "layout"); return ok("Canchas guardadas");
}

/** Quita una cancha. Si tiene turnos por venir no deja; si tuvo turnos se oculta (para no perder la historia). */
export async function deleteCourt(id: string, force = false) {
  await requireAdmin(); const club = await getClub();
  const today = nowAR().date;
  const fut = await one<{ n: number }>("select count(*)::int as n from booking where court_id=$1 and club_id=$2 and status<>'cancelled' and date >= $3", [id, club.id, today]);
  if (fut && fut.n > 0 && !force) return { ok: false as const, msg: `Esa cancha tiene ${fut.n} turno${fut.n > 1 ? "s" : ""} desde hoy.`, pending: fut.n };
  if (fut && fut.n > 0) await q("update booking set status='cancelled' where court_id=$1 and club_id=$2 and status<>'cancelled' and date >= $3", [id, club.id, today]);
  const any = await one<{ n: number }>("select count(*)::int as n from booking where court_id=$1", [id]);
  if (any && any.n > 0) await q("update court set active=false where id=$1 and club_id=$2", [id, club.id]);
  else await q("delete from court where id=$1 and club_id=$2", [id, club.id]);
  revalidatePath("/", "layout"); return { ok: true as const, msg: fut && fut.n > 0 ? `Cancha eliminada y ${fut.n} turnos cancelados` : "Cancha eliminada", pending: 0 };
}

export async function loadSocio(playerId: string) {
  await requireAdmin();
  const p = await one("select * from player where id=$1", [playerId]); if (!p) return null;
  const subs = await q(`select s.*, pl.name as plan_name, pl.passes, pl.special_uses, pl.early_uses, pl.can_transfer, pl.invite_uses, r.name as referred_by_name
    from subscription s join plan pl on pl.id=s.plan_id left join player r on r.id=s.referred_by where s.player_id=$1 order by s.started_at desc`, [playerId]);
  const moves = subs.length ? await q("select m.*, b.date, b.start from pass_move m left join booking b on b.id=m.booking_id where m.subscription_id = any($1) order by m.created_at desc limit 60", [subs.map(s => s.id)]) : [];
  const pts = await q("select reason, sum(points)::int as pts, count(*)::int as n from points_move where player_id=$1 and created_at >= date_trunc('year', now()) group by reason", [playerId]);
  return JSON.parse(JSON.stringify({ player: p, subs, moves, pts }));
}


/* ---------- caja del día ---------- */
const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
async function closedDay(clubId: string, date: string) { return !!(await one("select id from cash_close where club_id=$1 and date=$2", [clubId, date])); }
const doneCaja = () => { revalidatePath("/admin/caja"); };

export async function addCashMove(input: { date: string; kind: string; amount: number; method: string; note: string }) {
  await requireAdmin(); const club = await getClub();
  if (!isDate(input.date) || !["gasto", "retiro", "ingreso"].includes(input.kind)) return err("Dato inválido.");
  const amt = Math.round(Number(input.amount)); if (!(amt > 0)) return err("Poné un importe.");
  if (await closedDay(club.id, input.date)) return err("La caja de ese día está cerrada. Reabrila para cargar movimientos.");
  await q("insert into cash_move (club_id,date,kind,amount,method,note) values ($1,$2,$3,$4,$5,$6)", [club.id, input.date, input.kind, amt, input.method || "Efectivo", input.note.trim()]);
  doneCaja(); return ok(input.kind === "gasto" ? "Gasto cargado" : input.kind === "retiro" ? "Retiro cargado" : "Ingreso cargado");
}
export async function removeCashMove(id: string) {
  await requireAdmin(); const club = await getClub();
  const m = await one("select * from cash_move where id=$1 and club_id=$2", [id, club.id]); if (!m) return err("No existe.");
  if (await closedDay(club.id, m.date)) return err("La caja de ese día está cerrada.");
  await q("delete from cash_move where id=$1", [id]); doneCaja(); return ok("Movimiento borrado");
}
export async function setOpening(date: string, amount: number) {
  await requireAdmin(); const club = await getClub(); if (!isDate(date)) return err("Fecha inválida.");
  if (await closedDay(club.id, date)) return err("La caja de ese día está cerrada.");
  await q("delete from cash_move where club_id=$1 and date=$2 and kind='apertura'", [club.id, date]);
  await q("insert into cash_move (club_id,date,kind,amount,method,note) values ($1,$2,'apertura',$3,'Efectivo','Fondo inicial')", [club.id, date, Math.max(0, Math.round(Number(amount) || 0))]);
  doneCaja(); return ok("Fondo inicial actualizado");
}
export async function closeDay(input: { date: string; counted: number; leftInBox: number; checks: Record<string, boolean>; note: string }) {
  await requireAdmin(); const club = await getClub(); if (!isDate(input.date)) return err("Fecha inválida.");
  if (await closedDay(club.id, input.date)) return err("Ese día ya está cerrado.");
  const counted = Math.round(Number(input.counted)), left = Math.round(Number(input.leftInBox));
  if (!(counted >= 0)) return err("Contá el efectivo de la caja.");
  if (!(left >= 0) || left > counted) return err("Lo que queda en caja no puede ser más que lo contado.");
  const { getCajaDay } = await import("@/lib/caja");
  const d = await getCajaDay(club.id, input.date);
  const diff = counted - d.expected;
  await q(`insert into cash_close (club_id,date,opening,expected,counted,diff,left_in_box,totals,checks,note) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [club.id, input.date, d.opening, d.expected, counted, diff, left, JSON.stringify(d.totals), JSON.stringify(input.checks || {}), input.note.trim()]);
  doneCaja();
  return ok(diff === 0 ? "Caja cerrada. Todo cuadra ✓" : diff < 0 ? `Caja cerrada con faltante de $${(-diff).toLocaleString("es-AR")}` : `Caja cerrada con sobrante de $${diff.toLocaleString("es-AR")}`);
}
export async function reopenDay(date: string) {
  await requireAdmin(); const club = await getClub();
  await q("delete from cash_close where club_id=$1 and date=$2", [club.id, date]); doneCaja(); return ok("Caja reabierta");
}


/* ---------- mercadería y finanzas ---------- */
/** Entrada de mercadería: suma stock, actualiza el costo y registra la compra */
export async function addStock(input: { productId: string; qty: number; unitCost: number; method: string; fromCash: boolean; supplier: string }) {
  await requireAdmin(); const club = await getClub();
  const qty = Math.round(Number(input.qty)), cost = Math.round(Number(input.unitCost));
  if (!(qty > 0)) return err("Poné la cantidad que entró."); if (!(cost >= 0)) return err("Poné el costo por unidad.");
  const p = await one("select * from product where id=$1 and club_id=$2", [input.productId, club.id]); if (!p) return err("Producto inexistente.");
  await tx(async c => {
    await c.query("update product set stock=coalesce(stock,0)+$2, cost=$3 where id=$1", [p.id, qty, cost]);
    await c.query("insert into stock_entry (club_id,product_id,qty,unit_cost,method,from_cash,supplier) values ($1,$2,$3,$4,$5,$6,$7)", [club.id, p.id, qty, cost, input.method, !!input.fromCash, input.supplier.trim()]);
  });
  revalidatePath("/admin/bar", "layout"); revalidatePath("/admin/finanzas", "layout"); revalidatePath("/admin/caja");
  return ok(`Entraron ${qty} ${p.name} · stock ${(p.stock ?? 0) + qty}`);
}
export async function saveExpense(input: { id?: string; date: string; category: string; detail: string; amount: number; method: string; fixed: boolean }) {
  await requireAdmin(); const club = await getClub();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return err("Fecha inválida.");
  const amt = Math.round(Number(input.amount)); if (!(amt > 0)) return err("Poné el importe.");
  const cat = EXPENSE_CATS.includes(input.category) ? input.category : "Otros";
  if (input.id) await q("update expense set date=$2, category=$3, detail=$4, amount=$5, method=$6, fixed=$7 where id=$1 and club_id=$8", [input.id, input.date, cat, input.detail.trim(), amt, input.method, !!input.fixed, club.id]);
  else await q("insert into expense (club_id,date,category,detail,amount,method,fixed) values ($1,$2,$3,$4,$5,$6,$7)", [club.id, input.date, cat, input.detail.trim(), amt, input.method, !!input.fixed]);
  revalidatePath("/admin/finanzas", "layout"); return ok("Gasto guardado");
}
export async function deleteExpense(id: string) {
  await requireAdmin(); const club = await getClub(); await q("delete from expense where id=$1 and club_id=$2", [id, club.id]);
  revalidatePath("/admin/finanzas", "layout"); return ok("Gasto borrado");
}
export async function importExpenses(rows: { date: string; category: string; detail: string; amount: number; fixed?: boolean }[]) {
  await requireAdmin(); const club = await getClub();
  const ok_ = rows.filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && Math.round(r.amount) > 0);
  if (!ok_.length) return err("No hay filas válidas para importar.");
  await tx(async c => { for (const r of ok_) await c.query("insert into expense (club_id,date,category,detail,amount,method,fixed) values ($1,$2,$3,$4,$5,'Transferencia',$6)", [club.id, r.date, EXPENSE_CATS.includes(r.category) ? r.category : "Otros", r.detail.trim(), Math.round(r.amount), !!r.fixed]); });
  revalidatePath("/admin/finanzas", "layout"); return ok(`${ok_.length} gastos importados`);
}
export async function saveFinanceSettings(f: Record<string, number>) {
  await requireAdmin(); const club = await getClub();
  const clean = Object.fromEntries(Object.entries(f).filter(([, v]) => typeof v === "number" && isFinite(v)));
  await q("update club set finance=$2 where id=$1", [club.id, JSON.stringify(clean)]); revalidatePath("/admin/finanzas", "layout"); return ok("Supuestos guardados");
}
/** Copia los gastos fijos del mes anterior al mes indicado (mismo día; si el mes es más corto, último día) */
export async function copyFixedExpenses(ym: string) {
  await requireAdmin(); const club = await getClub(); if (!/^\d{4}-\d{2}$/.test(ym)) return err("Mes inválido.");
  const [y, m] = ym.split("-").map(Number); const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const fx = await q("select * from expense where club_id=$1 and fixed and substr(date,1,7)=$2", [club.id, prev]);
  if (!fx.length) return err("No hay gastos fijos en el mes anterior.");
  const already = await q("select category, detail from expense where club_id=$1 and fixed and substr(date,1,7)=$2", [club.id, ym]);
  let n = 0;
  for (const e of fx) {
    if (already.some(a => a.category === e.category && a.detail === e.detail)) continue;
    const d = Math.min(Number(e.date.slice(8, 10)), last);
    await q("insert into expense (club_id,date,category,detail,amount,method,fixed) values ($1,$2,$3,$4,$5,$6,true)", [club.id, `${ym}-${String(d).padStart(2, "0")}`, e.category, e.detail, e.amount, e.method]); n++;
  }
  revalidatePath("/admin/finanzas", "layout"); return n ? ok(`${n} gastos fijos copiados (revisá si cambió algún importe)`) : err("Ya estaban cargados.");
}

/* ---------- mesas del bar (cuentas sin cancha) ---------- */
/** Abre una cuenta en el bar: para la gente que mira, espera o viene solo al bar */
export async function openTab(input: { name: string; people?: number }) {
  await requireAdmin(); const club = await getClub();
  const name = input.name.trim(); if (name.length < 2) return { ok: false as const, msg: "Poné un nombre para la mesa (ej: Juan, Mesa 3).", id: "" };
  const n = nowAR(); const k = Math.max(1, Math.min(8, Math.round(input.people || 1)));
  const id = await tx(async c => {
    const b = (await c.query(`insert into booking (club_id,court_id,date,start,source,holder_name,holder_phone,court_price,booked_on,kind,tab_name) values ($1,null,$2,$3,'bar',$4,'',0,$2,'mesa',$4) returning id`, [club.id, n.date, n.time, name])).rows[0].id;
    for (let i = 0; i < k; i++) await c.query("insert into booking_player (booking_id,idx,name) values ($1,$2,$3)", [b, i, k === 1 ? name.split(" ")[0] : `${name.split(" ")[0]} ${i + 1}`]);
    return b as string;
  });
  revalidatePath("/admin/bar", "layout"); return { ok: true as const, msg: `Mesa "${name}" abierta`, id };
}
/** Suma una persona a la mesa (para cobrar por separado) */
export async function addTabPerson(bookingId: string, name: string) {
  await requireAdmin();
  const b = await one("select * from booking where id=$1 and kind='mesa'", [bookingId]); if (!b) return err("No es una mesa del bar.");
  const m = await one<{ m: number }>("select coalesce(max(idx),-1)::int as m from booking_player where booking_id=$1", [bookingId]);
  await q("insert into booking_player (booking_id,idx,name) values ($1,$2,$3)", [bookingId, m!.m + 1, name.trim() || `Persona ${m!.m + 2}`]);
  done(); revalidatePath("/admin/bar", "layout"); return ok("Persona agregada");
}
/** Borra una mesa vacía (sin consumos ni pagos) */
export async function deleteTab(bookingId: string) {
  await requireAdmin();
  const has = await one<{ n: number }>("select (select count(*) from consumption where booking_id=$1) + (select count(*) from payment where booking_id=$1) as n", [bookingId]);
  if (Number(has?.n) > 0) return err("La mesa tiene consumos o pagos: cobrala o pasala a cuenta corriente.");
  await q("update booking set status='cancelled' where id=$1 and kind='mesa'", [bookingId]);
  revalidatePath("/admin/bar", "layout"); done(); return ok("Mesa borrada");
}
