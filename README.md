# 29 Padel · reservas, cuentas, bar, 29club y torneos

App web para complejos de pádel. Primera versión hecha para **29 Padel** (club piloto).

- **Jugador** (`/`): reservar turno, mis turnos (por celular), 29club (planes, pases y ranking), torneos.
- **Panel del club** (`/admin`): grilla de turnos con la cuenta de cada turno dividida por jugador, bar (mostrador, stock, productos), socios 29club, torneos y configuración.

Stack: Next.js 14 (App Router) + PostgreSQL (`pg`, SQL plano, sin ORM). Pensado para Railway.

## Desplegar en Railway

1. En Railway: **New Project → Deploy from GitHub repo** y elegí este repositorio.
2. En el mismo proyecto: **+ New → Database → PostgreSQL**.
3. En el servicio de la app, pestaña **Variables**, agregá:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (referencia a la base)
   - `ADMIN_PASSWORD` = la contraseña del panel del club
   - (opcional) `SEED_DEMO` = `0` si querés arrancar sin datos de ejemplo
4. **Settings → Networking → Generate Domain** para tener la URL pública.

Railway corre `npm run build` y después `npm start`, que aplica el esquema (`db/schema.sql`) y, si la base está vacía, carga 29 Padel con canchas, productos, planes y datos de ejemplo.

## Desarrollo local

```bash
npm install
cp .env.example .env   # completar DATABASE_URL y ADMIN_PASSWORD
npm run migrate        # crea tablas y datos de ejemplo
npm run dev
```

## Reglas de 29club implementadas (a confirmar con el club)

Tomadas de la presentación comercial. Lo marcado como *interpretación* conviene validarlo:

- 1 pase = la parte de cancha de un jugador (el plan es personal; el resto paga normalmente).
- **Horario especial** (todos los planes): lun a vie, turnos que empiezan entre 8:00 y 17:30, reservados el mismo día o el anterior → medio pase. Usa uno de los "usos en horarios especiales" del plan.
- **Reserva anticipada** (Plata y Oro): lun a vie, turnos que empiezan entre 8:00–12:30 o 14:00–16:30 → medio pase. *Interpretación:* cuenta como anticipada si se reservó entre 2 y 14 días antes.
- Los beneficios no se suman: el sistema aplica uno solo (primero horario especial, después anticipada, si no 1 pase).
- **Invitar** (Oro): hasta 2 pases para pagar la parte de otro jugador. No suma puntos.
- **Transferir pases** (Oro): a otro socio con plan activo, nunca en el último mes del plan. *Interpretación:* los pases pasan al plan activo del que recibe.
- **Referidos:** si el referido compra Bronce o Plata, quien refirió gana 1 pase; si compra Oro, 2. Siempre suma 300 puntos.
- **Ranking anual:** 100 puntos por partido, 200 en horario especial, 300 por referido. Se suman al usar pases.
- **Cancelación:** con menos de 12 h se pierde el pase; con más, se devuelve.
- **Vencimiento:** los pases no usados dentro de la vigencia se pierden.

## Pendiente (próximas etapas)

- Seña y cobro con Mercado Pago (cuenta del club).
- Asistente de WhatsApp (API oficial de Meta) y avisos automáticos de torneos.
- Turnos fijos semanales automáticos, clases, cierre de caja, carga de mercadería.
- Multi-club (hoy toma el primer club o el de `CLUB_SLUG`).
