-- Shared table-state for Балалаечка net play. Unowned rows (no user_id):
-- room codes are unguessable-enough 6-char ids; payloads are game snaps/SDP.
create table if not exists webrtc_peers (
  room text not null,
  peer_id text not null,
  name text not null default '',
  last_seen timestamptz not null default now(),
  primary key (room, peer_id)
);

create table if not exists webrtc_signals (
  id bigserial primary key,
  room text not null,
  to_peer text not null,
  from_peer text not null,
  kind text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists webrtc_signals_inbox on webrtc_signals (room, to_peer, id);

create table if not exists webrtc_rooms (
  room text primary key,
  host_id text,
  snap jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists webrtc_acts (
  id bigserial primary key,
  room text not null,
  from_peer text not null,
  act jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists webrtc_acts_inbox on webrtc_acts (room, id);
