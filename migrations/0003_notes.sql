-- VK wallets: notes bought with votes. No audio files here.
create table if not exists vk_wallets (
  vk_id      text primary key,
  name       text not null default '',
  notes      integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists vk_orders (
  vk_order_id text primary key,
  vk_id       text not null,
  item        text not null,
  votes       integer not null,
  notes       integer not null,
  status      text not null,
  created_at  timestamptz not null default now()
);

create table if not exists vk_spends (
  id         bigserial primary key,
  vk_id      text not null,
  kind       text not null,
  notes      integer not null,
  created_at timestamptz not null default now()
);

create index if not exists vk_orders_vk_id_idx on vk_orders (vk_id);
create index if not exists vk_spends_vk_id_idx on vk_spends (vk_id);
