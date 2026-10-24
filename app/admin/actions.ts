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
    else await c.query("insert into consumption (booking_id,product_id,qty,unit_price,player_idx) values ($1,$2,$3,$4,$5)", [bookingId, productId, qty, p.price, idx]);
    await c.query("update product set sold=sold+$2, stock=case when stock is null then null else stock-$2 end where id=$1", [productId, qty]);
  });
  done(); return ok(p.emoji + " " + p.name + " cargado");
}
export async function removeConsumption(lineId: string) {
  await requireAdmin();
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
export async function payAll(bookingId: string, method: string) {
  await requireAdmin(); const d = await dueOf(bookingId); let s = 0;
  for (const [i, p] of d.acct.players.entries()) { const due = Math.round(d.acct.due[i]); if (due > 0) { s += due; await q("insert into payment (booking_id,player_idx,amount,method) values ($1,$2,$3,$4)", [bookingId, p.idx, due, method]); } }
  done(); return ok(`Cobrado $${s.toLocaleString("es-AR")} · ${method}`);
}
export async function undoPayment(paymentId: string) { await requireAdmin(); await q("delete from payment where id=$1", [paymentId]); done(); return ok("Pago anulado"); }
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
  const lines = items.map(it => { const p = ps.find(x => x.id === it.productId); return { name: p.name, emoji: p.emoji, qty: it.qty, price: p.price }; });
  const total = lines.reduce((s, l) => s + l.qty * l.price, 0);
  await tx(async c => {
    await c.query("insert into counter_sale (club_id,total,method,items) values ($1,$2,$3,$4)", [club.id, total, method, JSON.stringify(lines)]);
    for (const it of items) await c.query("update product set sold=sold+$2, stock=case when stock is null then null else stock-$2 end where id=$1", [it.productId, it.qty]);
  });
  done(); return ok(`Venta cobrada: $${total.toLocaleString("es-AR")} · ${method}`);
}
export async function chargeToBooking(bookingId: string, items: { productId: string; qty: number }[], playerIdx: number[]) {
  await requireAdmin(); for (const it of items) { const r = await addConsumption(bookingId, it.productId, it.qty, playerIdx); if (!r.ok) return r; }
  return ok("Cargado a la cuenta del turno");
}
export async function saveProduct(input: { id?: string; name: string; emoji: string; category: string; price: number; stock: number | null; active: boolean }) {
  await requireAdmin(); const club = await getClub();
  if (!input.name.trim() || !(input.price > 0)) return err("Completá nombre y precio.");
  if (input.id) await q("update product set name=$2, emoji=$3, category=$4, price=$5, stock=$6, active=$7 where id=$1", [input.id, input.name.trim(), input.emoji || "🛒", input.category, Math.round(input.price), input.stock, input.active]);
  else await q("insert into product (club_id,name,emoji,category,price,stock,active) values ($1,$2,$3,$4,$5,$6,$7)", [club.id, input.name.trim(), input.emoji || "🛒", input.category, Math.round(input.price), input.stock, input.active]);
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
  await q("update tournament set config=$2, fixture=$3, results='{\"scores\":{},\"winners\":{}}' where id=$1", [tid, JSON.stringify(cfg), JSON.stringify(fx)]);
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
