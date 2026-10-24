import { dow, toMin, daysBetween } from "./time";
/** Reglas de 29club (presentación comercial de 29 Padel). Ver README para las interpretaciones. */
export const POINTS = { partido: 100, partidoEspecial: 200, referido: 300, sorteoMinimo: 300 };
export const isWeekday = (date: string) => { const d = dow(date); return d >= 1 && d <= 5; };
/** Horario especial: lun a vie de 8 a 17:30, reservado el mismo día o el anterior. Consume medio pase. */
export function isSpecial(date: string, start: string, bookedOn: string) {
  const m = toMin(start);
  return isWeekday(date) && m >= 8 * 60 && m <= 17 * 60 + 30 && daysBetween(bookedOn, date) <= 1;
}
/** Reserva anticipada (Plata y Oro): hasta 2 semanas antes, lun a vie de 8 a 12:30 y de 14 a 16:30. Consume medio pase. */
export function isEarly(date: string, start: string, bookedOn: string) {
  const m = toMin(start), ahead = daysBetween(bookedOn, date);
  const inWindow = (m >= 8 * 60 && m <= 12 * 60 + 30) || (m >= 14 * 60 && m <= 16 * 60 + 30);
  return isWeekday(date) && inWindow && ahead >= 2 && ahead <= 14;
}
export type SubLite = { passesLeft: number; specialLeft: number; earlyLeft: number; inviteLeft: number; expiresAt: Date | string; plan: { earlyUses: number; canTransfer: boolean } };
/** Qué pase corresponde usar para la parte de un socio en un turno. Los beneficios no se suman: se aplica uno solo. */
export function passFor(sub: SubLite, date: string, start: string, bookedOn: string, invite = false) {
  if (invite) return sub.inviteLeft > 0 && sub.passesLeft >= 1 ? { amount: 1, kind: "invitado" as const } : null;
  if (isSpecial(date, start, bookedOn) && sub.specialLeft > 0 && sub.passesLeft >= 0.5) return { amount: 0.5, kind: "especial" as const };
  if (sub.plan.earlyUses > 0 && isEarly(date, start, bookedOn) && sub.earlyLeft > 0 && sub.passesLeft >= 0.5) return { amount: 0.5, kind: "anticipada" as const };
  if (sub.passesLeft >= 1) return { amount: 1, kind: "normal" as const };
  return null;
}
export function isActive(sub: { expiresAt: Date | string; passesLeft: number }) { return new Date(sub.expiresAt).getTime() > Date.now() && sub.passesLeft > 0; }
/** Transferir pases (Oro): no en el último mes del plan. */
export function canTransferNow(sub: { expiresAt: Date | string; plan: { canTransfer: boolean } }) {
  return sub.plan.canTransfer && new Date(sub.expiresAt).getTime() - Date.now() > 30 * 864e5;
}
