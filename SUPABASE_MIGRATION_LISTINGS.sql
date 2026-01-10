-- Supabase SQL migration (run in SQL Editor)
-- Extend listings table to match the old Firestore schema (optional but recommended)

alter table listings
  add column if not exists currency text,
  add column if not exists place_text text,
  add column if not exists images jsonb,
  add column if not exists contact jsonb,
  add column if not exists meta jsonb;

create index if not exists listings_created_at_idx on listings (created_at desc);
create index if not exists listings_category_id_idx on listings (category_id);
create index if not exists listings_city_idx on listings (city);

-- Enable public inserts (if you want add listing without login)
alter table listings enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='listings' and policyname='public insert listings'
  ) then
    create policy "public insert listings"
    on listings for insert
    with check (true);
  end if;
end $$;
