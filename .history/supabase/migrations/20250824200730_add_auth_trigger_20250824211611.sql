-- 1) Add auth_id + backfill and FK
alter table public.staff
  add column if not exists auth_id uuid unique;

update public.staff s
set auth_id = u.id
from auth.users u
where s.auth_id is null
  and lower(u.email) = lower(s.email);

alter table public.staff
  drop constraint if exists staff_auth_id_fkey,
  add constraint staff_auth_id_fkey
  foreign key (auth_id) references auth.users(id)
  on delete set null;

-- 2) Function + trigger to auto-create staff on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.staff (auth_id, name, permission, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', 'New Staff'), 'staff', new.email)
  on conflict (auth_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();
