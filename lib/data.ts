import { q, one } from "./db";
import { computeAccount } from "./account";

export type Club = { id: string; slug: string; name: string; tagline: string; color_primary: string; color_accent: string; logo_url: string | null; whatsapp: string; slot_minutes: number; open_times: string[]; court_price: number; sena_amount: number; cancel_hours: number };
export type Court = { id: string; name: string; kind: string; ord: number };
export type Product = { id: string; name: string; emoji: string; category: string; price: number; cost: number | null; stock: number | null; active: boolean; sold: number };
export type Plan = { id: string; name: string; price: number; passes: number; months: number; discount_pct: number; special_uses: number; early_uses: number; can_transfer: boolean; invite_uses: number; referral_pass: number; ord: number };

export const KIND_LABEL: Record<string, string> = { techada: "techada", panoramica: "panorámica", aire: "al aire libre" };
export const CATS: [string, string][] = [["bebidas", "Bebidas"], ["cafeteria", "Cafetería"], ["comidas", "Comidas"], ["padel", "Pádel"], ["club", "Del club"]];

export async function getClub(): Promise<Club> {
  const slug = process.env.CLUB_SLUG;
  const c = slug ? await one<Club>("select * from club where slug=$1", [slug]) : await one<Club>("select * from club order by created_at limit 1");
  if (!c) throw new Error("No hay club cargado. Corré npm run migrate.");
  return c;
}
export const getCourts = (clubId: string) => q<Court>("select id,name,kind,ord from court where club_id=$1 and active order by ord", [clubId]);
export const getProducts = (clubId: string, all = false) => q<Product>(`select * from product where club_id=$1 ${all ? "" : "and active"} order by category, name`, [clubId]);
export const getPlans = (clubId: string) => q<Plan>("select * from plan where club_id=$1 order by ord", [clubId]);

export type SlotBooking = { id: string; court_id: string; start: string; source: string; status: string; holder_name: string; sena_paid: number; falta: number; settled: boolean; nPlayers: number; okPlayers: number; hasActivity: boolean; passes: number };
/** Turnos de un día con el estado de su cuenta, para la grilla del panel */
export async function getDay(clubId: string, date: string): Promise<SlotBooking[]> {
  const bs = await q("select * from booking where club_id=$1 and date=$2 and status<>'cancelled'", [clubId, date]);
  if (!bs.length) return [];
  const ids = bs.map(b => b.id);
  const [pls, lines, pays] = await Promise.all([
    q("select booking_id, idx, name, pass_used, pass_kind from booking_player where booking_id = any($1)", [ids]),
    q("select c.booking_id, c.id, c.qty, c.unit_price, c.player_idx, c.shares, p.name, p.emoji from consumption c join product p on p.id=c.product_id where c.booking_id = any($1)", [ids]),
    q("select booking_id, player_idx, amount from payment where booking_id = any($1)", [ids])]);
  return bs.map(b => {
    const a = computeAccount({ courtPrice: b.court_price, senaPaid: b.sena_paid, senaMode: b.sena_mode,
      players: pls.filter(p => p.booking_id === b.id).map(p => ({ idx: p.idx, name: p.name, passUsed: p.pass_used, passKind: p.pass_kind })),
      lines: lines.filter(l => l.booking_id === b.id).map(l => ({ id: l.id, qty: l.qty, unitPrice: l.unit_price, playerIdx: l.player_idx, name: l.name, emoji: l.emoji, shares: l.shares })),
      payments: pays.filter(p => p.booking_id === b.id).map(p => ({ playerIdx: p.player_idx, amount: p.amount })) });
    const bl = lines.some(l => l.booking_id === b.id), bp = pays.some(p => p.booking_id === b.id);
    return { id: b.id, court_id: b.court_id, start: b.start, source: b.source, status: b.status, holder_name: b.holder_name, sena_paid: b.sena_paid, falta: a.falta, settled: a.settled,
      nPlayers: a.players.length, okPlayers: a.due.filter(d => d <= 0).length, hasActivity: bl || bp || a.passCover > 0, passes: a.players.filter(p => p.passUsed > 0).length };
  });
}

export type BookingDetail = Awaited<ReturnType<typeof getBookingDetail>>;
export async function getBookingDetail(id: string) {
  const b = await one("select b.*, c.name as court_name, c.kind as court_kind from booking b join court c on c.id=b.court_id where b.id=$1", [id]);
  if (!b) return null;
  const [players, lines, payments] = await Promise.all([
    q("select bp.idx, bp.name, bp.player_id, bp.pass_used, bp.pass_kind, bp.pass_sub_id, p.phone from booking_player bp left join player p on p.id=bp.player_id where booking_id=$1 order by idx", [id]),
    q("select c.id, c.qty, c.unit_price, c.player_idx, c.shares, c.created_at, p.name, p.emoji from consumption c join product p on p.id=c.product_id where booking_id=$1 order by c.created_at", [id]),
    q("select id, player_idx, amount, method, created_at from payment where booking_id=$1 order by created_at", [id])]);
  // socios con pases activos entre los jugadores
  const pids = players.map(p => p.player_id).filter(Boolean);
  const subs = pids.length ? await q(`select s.*, pl.name as plan_name, pl.early_uses, pl.can_transfer, pl.invite_uses from subscription s join plan pl on pl.id=s.plan_id
    where s.player_id = any($1) and s.expires_at > now() and s.passes_left > 0 order by s.expires_at`, [pids]) : [];
  const acct = computeAccount({ courtPrice: b.court_price, senaPaid: b.sena_paid, senaMode: b.sena_mode,
    players: players.map(p => ({ idx: p.idx, name: p.name, passUsed: p.pass_used, passKind: p.pass_kind })),
    lines: lines.map(l => ({ id: l.id, qty: l.qty, unitPrice: l.unit_price, playerIdx: l.player_idx, name: l.name, emoji: l.emoji, shares: l.shares })),
    payments: payments.map(p => ({ playerIdx: p.player_idx, amount: p.amount })) });
  // saldo de cuenta corriente de cada jugador vinculado (+ a favor, − debe)
  const bal = pids.length ? await q<{ player_id: string; s: number }>("select player_id, sum(amount)::int as s from account_move where player_id = any($1) group by player_id", [pids]) : [];
  const balances = Object.fromEntries(bal.map(x => [x.player_id, x.s]));
  return JSON.parse(JSON.stringify({ booking: b, players, lines, payments, subs, acct, balances }));
}

export async function getSubsForPlayer(playerId: string) {
  return q(`select s.*, pl.name as plan_name, pl.passes, pl.special_uses, pl.early_uses, pl.can_transfer, pl.invite_uses, pl.months from subscription s join plan pl on pl.id=s.plan_id where s.player_id=$1 order by s.started_at desc`, [playerId]);
}
export async function ranking(clubId: string, limit = 20) {
  return q<{ id: string; name: string; points: number }>(`select p.id, p.name, coalesce(sum(m.points),0)::int as points from player p join points_move m on m.player_id=p.id
    where p.club_id=$1 and m.created_at >= date_trunc('year', now()) group by p.id order by points desc limit $2`, [clubId, limit]);
}
