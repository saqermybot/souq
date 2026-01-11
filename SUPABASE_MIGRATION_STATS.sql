-- Souq Syria (Supabase)
-- Favorites + Views counters + RPC functions

-- 1) columns on listings
alter table listings
  add column if not exists view_count int default 0,
  add column if not exists fav_count int default 0;

create index if not exists listings_view_count_idx on listings (view_count);
create index if not exists listings_fav_count_idx on listings (fav_count);

-- 2) per-guest favorites table (no direct access; use RPC)
create table if not exists listing_favorites (
  listing_id uuid not null references listings(id) on delete cascade,
  guest_id text not null,
  created_at timestamptz default now(),
  primary key (listing_id, guest_id)
);

alter table listing_favorites enable row level security;

-- 3) RPC: increment view counter
create or replace function public.listing_inc_view(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update listings
  set view_count = coalesce(view_count,0) + 1
  where id = p_id;
$$;

grant execute on function public.listing_inc_view(uuid) to anon, authenticated;

-- 4) RPC: toggle favorite for a guest + return state
create or replace function public.listing_toggle_fav(p_id uuid, p_guest text)
returns table(is_fav boolean, fav_count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  existed boolean;
  delta int;
begin
  select exists(
    select 1 from listing_favorites where listing_id = p_id and guest_id = p_guest
  ) into existed;

  if existed then
    delete from listing_favorites where listing_id = p_id and guest_id = p_guest;
    delta := -1;
  else
    insert into listing_favorites(listing_id, guest_id) values (p_id, p_guest)
    on conflict do nothing;
    delta := 1;
  end if;

  update listings
  set fav_count = greatest(0, coalesce(fav_count,0) + delta)
  where id = p_id
  returning fav_count into fav_count;

  is_fav := not existed;
  return next;
end;
$$;

grant execute on function public.listing_toggle_fav(uuid, text) to anon, authenticated;
