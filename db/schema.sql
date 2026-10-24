-- Esquema de la app. Se aplica en cada arranque (idempotente).
create table if not exists club (
  id text primary key default gen_random_uuid()::text,
  slug text unique not null,
  name text not null,
  tagline text not null default '',
  color_primary text not null default '#10261c',
  color_accent text not null default '#d6f04c',
  logo_url text,
  whatsapp text not null default '',
  slot_minutes int not null default 90,
  open_times text[] not null default '{}',
  court_price int not null default 30000,
  sena_amount int not null default 10000,
  cancel_hours int not null default 12,
  created_at timestamptz not null default now()
);
create table if not exists court (
  id text primary key default gen_random_uuid()::text,
  club_id text not null references club(id) on delete cascade,
  name text not null,
  kind text not null default 'techada',
  ord int not null default 0
);
alter table court add column if not exists active boolean not null default true;
create table if not exists player (
  id text primary key default gen_random_uuid()::text,
  club_id text not null references club(id) on delete cascade,
  name text not null,
  phone text not null,
  created_at timestamptz not null default now(),
  unique (club_id, phone)
);
create table if not exists booking (
  id text primary key default gen_random_uuid()::text,
  club_id text not null references club(id) on delete cascade,
  court_id text not null references court(id) on delete cascade,
  date text not null,
  start text not null,
  source text not null default 'manual',
  status text not null default 'confirmed',
  holder_name text not null,
  holder_phone text not null default '',
  court_price int not null,
  sena_paid int not null default 0,
  sena_mode text not null default 'total',
  note text not null default '',
  booked_on text not null,
  created_at timestamptz not null default now()
);
create index if not exists booking_club_date on booking (club_id, date);
create unique index if not exists booking_slot_unique on booking (court_id, date, start) where status <> 'cancelled';
create table if not exists booking_player (
  id text primary key default gen_random_uuid()::text,
  booking_id text not null references booking(id) on delete cascade,
  idx int not null,
  name text not null,
  player_id text references player(id) on delete set null,
  pass_used real not null default 0,
  pass_kind text not null default '',
  pass_sub_id text,
  unique (booking_id, idx)
);
create table if not exists product (
  id text primary key default gen_random_uuid()::text,
  club_id text not null references club(id) on delete cascade,
  name text not null,
  emoji text not null default '🛒',
  category text not null,
  price int not null,
  stock int,
  active boolean not null default true,
  sold int not null default 0
);
create table if not exists consumption (
  id text primary key default gen_random_uuid()::text,
  booking_id text not null references booking(id) on delete cascade,
  product_id text not null references product(id),
  qty int not null,
  unit_price int not null,
  player_idx int[] not null,
  created_at timestamptz not null default now()
);
create table if not exists payment (
  id text primary key default gen_random_uuid()::text,
  booking_id text not null references booking(id) on delete cascade,
  player_idx int not null,
  amount int not null,
  method text not null,
  created_at timestamptz not null default now()
);
create table if not exists counter_sale (
  id text primary key default gen_random_uuid()::text,
  club_id text not null references club(id) on delete cascade,
  total int not null,
  method text not null,
  items jsonb not null,
  created_at timestamptz not null default now()
);
create table if not exists plan (
  id text primary key default gen_random_uuid()::text,
  club_id text not null references club(id) on delete cascade,
  name text not null,
  price int not null,
  passes int not null,
  months int not null,
  discount_pct int not null,
  special_uses int not null,
  early_uses int not null,
  can_transfer boolean not null default false,
  invite_uses int not null default 0,
  referral_pass int not null default 1,
  ord int not null default 0
);
create table if not exists subscription (
  id text primary key default gen_random_uuid()::text,
  player_id text not null references player(id) on delete cascade,
  plan_id text not null references plan(id),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  price_paid int not null,
  passes_left real not null,
  special_left int not null,
  early_left int not null,
  invite_left int not null,
  method text not null default 'Efectivo',
  referred_by text references player(id) on delete set null
);
create table if not exists pass_move (
  id text primary key default gen_random_uuid()::text,
  subscription_id text not null references subscription(id) on delete cascade,
  amount real not null,
  reason text not null,
  booking_id text,
  note text not null default '',
  created_at timestamptz not null default now()
);
create table if not exists points_move (
  id text primary key default gen_random_uuid()::text,
  player_id text not null references player(id) on delete cascade,
  points int not null,
  reason text not null,
  booking_id text,
  created_at timestamptz not null default now()
);
create table if not exists tournament (
  id text primary key default gen_random_uuid()::text,
  club_id text not null references club(id) on delete cascade,
  name text not null,
  format text not null,
  category text not null,
  config jsonb not null,
  fixture jsonb,
  results jsonb not null default '{"scores":{},"winners":{}}',
  created_at timestamptz not null default now()
);

-- cierre de caja
alter table booking add column if not exists sena_method text not null default 'Transferencia';
alter table booking add column if not exists sena_at timestamptz;
create table if not exists cash_move (
  id text primary key default gen_random_uuid()::text,
  club_id text not null references club(id) on delete cascade,
  date text not null,
  kind text not null,              -- apertura | gasto | retiro | ingreso
  amount int not null,
  method text not null default 'Efectivo',
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists cash_move_day on cash_move (club_id, date);
create table if not exists cash_close (
  id text primary key default gen_random_uuid()::text,
  club_id text not null references club(id) on delete cascade,
  date text not null,
  opening int not null,
  expected int not null,
  counted int not null,
  diff int not null,
  left_in_box int not null,
  totals jsonb not null,
  checks jsonb not null default '{}',
  note text not null default '',
  closed_at timestamptz not null default now(),
  unique (club_id, date)
);
