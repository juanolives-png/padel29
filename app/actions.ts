"use server";
import { revalidatePath } from "next/cache";
import { one, tx } from "@/lib/db";
import { getClub } from "@/lib/data";
import { addDays, minutesUntil, nowAR } from "@/lib/time";

export async function createBooking(input: { date: string; start: string; courtId: string; name: string; phone: string }) {
  const club = await getClub(); const name = input.name.trim(), phone = input.phone.replace(/\D/g, "");
  if (name.length < 2) return { ok: false as const, msg: "Escribí tu nombre." };
  if (phone.length < 8) return { ok: false as const, msg: "Escribí tu celular con característica (ej: 2478 123456)." };
  const today = nowAR().date;
  if (input.date < today || input.date > addDays(today, 14)) return { ok: false as const, msg: "Se puede reservar desde hoy hasta 2 semanas." };
  if (!club.open_times.includes(input.start) || minutesUntil(input.date, input.start) < 0) return { ok: false as const, msg: "Ese horario ya pasó." };
  const court = await one("select id from court where id=$1 and club_id=$2 and active", [input.courtId, club.id]); if (!court) return { ok: false as const, msg: "Cancha inválida." };
  try {
    const id = await tx(async c => {
      const p = (await c.query("insert into player (club_id,name,phone) values ($1,$2,$3) on conflict (club_id,phone) do update set name=excluded.name returning id", [club.id, name, phone])).rows[0];
      const b = (await c.query(`insert into booking (club_id,court_id,date,start,source,holder_name,holder_phone,court_price,booked_on) values ($1,$2,$3,$4,'app',$5,$6,$7,$8) returning id`,
        [club.id, input.courtId, input.date, input.start, name, phone, club.court_price, today])).rows[0].id;
      for (let i = 0; i < 4; i++) await c.query("insert into booking_player (booking_id,idx,name,player_id) values ($1,$2,$3,$4)", [b, i, i === 0 ? name.split(" ")[0] : "Jugador " + (i + 1), i === 0 ? p.id : null]);
      return b;
    });
    revalidatePath("/reservar"); revalidatePath("/admin", "layout");
    return { ok: true as const, msg: "¡Reservado!", id };
  } catch { return { ok: false as const, msg: "Uy, alguien la tomó recién. Elegí otro horario." }; }
}

export async function cancelMyBooking(id: string, phone: string) {
  const b = await one("select * from booking where id=$1 and holder_phone=$2 and status<>'cancelled'", [id, phone.replace(/\D/g, "")]);
  if (!b) return { ok: false as const, msg: "No encontré ese turno a tu nombre." };
  const late = minutesUntil(b.date, b.start) < 12 * 60;
  await tx(async c => {
    const used = (await c.query("select * from booking_player where booking_id=$1 and pass_used>0", [id])).rows;
    for (const u of used) if (!late && u.pass_sub_id) {
      await c.query("update subscription set passes_left=passes_left+$2, special_left=special_left+$3, early_left=early_left+$4, invite_left=invite_left+$5 where id=$1",
        [u.pass_sub_id, u.pass_used, u.pass_kind === "especial" ? 1 : 0, u.pass_kind === "anticipada" ? 1 : 0, u.pass_kind === "invitado" ? 1 : 0]);
      await c.query("insert into pass_move (subscription_id,amount,reason,booking_id,note) values ($1,$2,'devolucion',$3,'Turno cancelado con tiempo')", [u.pass_sub_id, u.pass_used, id]);
    }
    await c.query("delete from points_move where booking_id=$1", [id]);
    await c.query("update booking set status='cancelled' where id=$1", [id]);
  });
  revalidatePath("/mis-turnos"); revalidatePath("/admin", "layout");
  return { ok: true as const, msg: late ? "Turno cancelado. Como faltaban menos de 12 h, si usaste un pase de 29club se pierde." : "Turno cancelado." };
}

/** Turnos próximos y estado de 29club de un jugador, buscado por celular */
export async function myStatus(phone: string) {
  const club = await getClub(); const ph = phone.replace(/\D/g, "");
  if (ph.length < 8) return { ok: false as const, msg: "Escribí tu celular completo." };
  const { q } = await import("@/lib/db");
  const today = nowAR().date;
  const player = await one("select * from player where club_id=$1 and phone=$2", [club.id, ph]);
  const bookings = await q(`select b.id, b.date, b.start, c.name as court, b.holder_phone = $2 as mine from booking b join court c on c.id=b.court_id
    where b.club_id=$1 and b.status<>'cancelled' and b.date >= $3 and (b.holder_phone=$2 or b.id in (select booking_id from booking_player where player_id=$4)) order by b.date, b.start`, [club.id, ph, today, player?.id || ""]);
  const subs = player ? await q(`select s.id, s.expires_at, s.passes_left, s.special_left, s.early_left, s.invite_left, pl.name as plan, pl.passes, pl.can_transfer from subscription s join plan pl on pl.id=s.plan_id
    where s.player_id=$1 and s.expires_at > now() order by s.expires_at`, [player.id]) : [];
  const pts = player ? (await one("select coalesce(sum(points),0)::int as p from points_move where player_id=$1 and created_at >= date_trunc('year', now())", [player.id]))!.p : 0;
  return { ok: true as const, name: player?.name || "", bookings: JSON.parse(JSON.stringify(bookings)), subs: JSON.parse(JSON.stringify(subs)), points: pts as number };
}
