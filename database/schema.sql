-- SafeRoute AI — Supabase Schema
-- Run this in Supabase SQL Editor

create table if not exists reports (
  id           uuid default gen_random_uuid() primary key,
  lat          double precision not null,
  lon          double precision not null,
  safety_type  text not null check (safety_type in (
    'safe', 'well_lit', 'busy', 'police_present',
    'dark', 'danger', 'suspicious', 'no_footpath', 'deserted'
  )),
  description  text,
  sector       text,
  created_at   timestamptz default now()
);

-- Index for fast geospatial queries
create index if not exists idx_reports_lat_lon on reports(lat, lon);
create index if not exists idx_reports_created on reports(created_at desc);

-- Allow public read + insert (no auth required for hackathon)
alter table reports enable row level security;

drop policy if exists "Public read" on reports;
drop policy if exists "Public insert" on reports;

create policy "Public read" on reports for select using (true);
create policy "Public insert" on reports for insert with check (true);

-- Seed some Chandigarh demo data so map isn't empty on demo day
insert into reports (lat, lon, safety_type, description, sector) values
  (30.7412, 76.7843, 'safe',           'Sector 17 plaza, lots of people',     'Sector 17'),
  (30.7341, 76.7812, 'well_lit',       'Jan Marg very well lit',              'Sector 22'),
  (30.7280, 76.7798, 'busy',           'Sector 35 market, busy evening',      'Sector 35'),
  (30.7521, 76.8121, 'safe',           'Sukhna Lake morning walk, safe',      'Sukhna Lake'),
  (30.7198, 76.8094, 'dark',           'Internal lane near Sector 31, dark',  'Sector 31'),
  (30.7312, 76.7765, 'police_present', 'PCR van stationed at sector entry',   'Sector 21'),
  (30.7458, 76.7901, 'deserted',       'Rock Garden road empty at night',     'Rock Garden'),
  (30.7001, 76.7994, 'busy',           'ISBT 43 area, buses running',         'Sector 43'),
  (30.7234, 76.7834, 'dark',           'Street lights out, Sector 20-C',      'Sector 20'),
  (30.7389, 76.7756, 'safe',           'Himalaya Marg well patrolled',        'Sector 9');
