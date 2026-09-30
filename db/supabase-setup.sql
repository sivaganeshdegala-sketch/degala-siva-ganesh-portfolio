-- Run in Supabase SQL Editor. Adds portfolio fields and policies without dropping existing rows.
create extension if not exists pgcrypto;

alter table public.projects add column if not exists id uuid default gen_random_uuid();
alter table public.projects add column if not exists title text;
alter table public.projects add column if not exists category text default 'Project';
alter table public.projects add column if not exists description text default '';
alter table public.projects add column if not exists long_description text default '';
alter table public.projects add column if not exists technologies text[] not null default '{}';
alter table public.projects add column if not exists github_url text;
alter table public.projects add column if not exists live_url text;
alter table public.projects add column if not exists image_url text;
alter table public.projects add column if not exists is_published boolean not null default false;
alter table public.projects add column if not exists is_featured boolean not null default false;
alter table public.projects add column if not exists sort_order integer not null default 0;
alter table public.projects add column if not exists created_at timestamptz not null default now();

do $$
declare technology_type text;
begin
    select data_type into technology_type
    from information_schema.columns
    where table_schema = 'public' and table_name = 'projects' and column_name = 'technologies';

    if technology_type in ('text', 'character varying') then
        alter table public.projects alter column technologies type text[]
            using case when technologies is null or trim(technologies::text) = '' then '{}'::text[] else string_to_array(technologies::text, ',') end;
    elsif technology_type = 'jsonb' then
        alter table public.projects alter column technologies type text[]
            using case when technologies is null then '{}'::text[] else array(select jsonb_array_elements_text(technologies::jsonb)) end;
    elsif technology_type = 'json' then
        alter table public.projects alter column technologies type text[]
            using case when technologies is null then '{}'::text[] else array(select json_array_elements_text(technologies::json)) end;
    end if;
end $$;

do $$
begin
    if (select data_type from information_schema.columns where table_schema = 'public' and table_name = 'projects' and column_name = 'id') = 'uuid' then
        alter table public.projects alter column id set default gen_random_uuid();
        update public.projects set id = gen_random_uuid() where id is null;
    end if;
end $$;
create unique index if not exists projects_id_unique on public.projects (id);

alter table public.messages add column if not exists id uuid default gen_random_uuid();
alter table public.messages add column if not exists name text;
alter table public.messages add column if not exists email text;
alter table public.messages add column if not exists message text;
alter table public.messages add column if not exists created_at timestamptz not null default now();
do $$
begin
    if (select data_type from information_schema.columns where table_schema = 'public' and table_name = 'messages' and column_name = 'id') = 'uuid' then
        alter table public.messages alter column id set default gen_random_uuid();
        update public.messages set id = gen_random_uuid() where id is null;
    end if;
end $$;
create unique index if not exists messages_id_unique on public.messages (id);

create table if not exists public.portfolio_profile (
    id text primary key check (id = 'main'),
    data jsonb not null,
    updated_at timestamptz not null default now()
);

alter table public.projects enable row level security;
alter table public.messages enable row level security;
alter table public.portfolio_profile enable row level security;

-- Policies are permissive by default and combine with OR, so replace old ones.
do $$
declare existing_policy record;
begin
    for existing_policy in
        select schemaname, tablename, policyname
        from pg_policies
        where schemaname = 'public' and tablename in ('projects', 'messages', 'portfolio_profile')
    loop
        execute format('drop policy %I on %I.%I', existing_policy.policyname, existing_policy.schemaname, existing_policy.tablename);
    end loop;
end $$;

revoke all on public.projects from public, anon, authenticated;
revoke all on public.messages from public, anon, authenticated;
revoke all on public.portfolio_profile from public, anon, authenticated;

drop policy if exists "Public can read published projects" on public.projects;
create policy "Public can read published projects" on public.projects
    for select to anon, authenticated using (is_published = true);
drop policy if exists "Admin manages projects" on public.projects;
create policy "Admin manages projects" on public.projects
    for all to authenticated
    using ((auth.jwt() ->> 'email') = 'sivaganeshdegala@gmail.com')
    with check ((auth.jwt() ->> 'email') = 'sivaganeshdegala@gmail.com');

drop policy if exists "Visitors can submit contact messages" on public.messages;
create policy "Visitors can submit contact messages" on public.messages
    for insert to anon, authenticated
    with check (
        length(trim(name)) between 1 and 120
        and length(trim(email)) between 3 and 320
        and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
        and length(trim(message)) between 1 and 10000
    );
drop policy if exists "Admin reads contact messages" on public.messages;
create policy "Admin reads contact messages" on public.messages
    for select to authenticated
    using ((auth.jwt() ->> 'email') = 'sivaganeshdegala@gmail.com');
drop policy if exists "Admin deletes contact messages" on public.messages;
create policy "Admin deletes contact messages" on public.messages
    for delete to authenticated
    using ((auth.jwt() ->> 'email') = 'sivaganeshdegala@gmail.com');

drop policy if exists "Public can read portfolio profile" on public.portfolio_profile;
create policy "Public can read portfolio profile" on public.portfolio_profile
    for select to anon, authenticated using (true);
drop policy if exists "Admin manages portfolio profile" on public.portfolio_profile;
create policy "Admin manages portfolio profile" on public.portfolio_profile
    for all to authenticated
    using ((auth.jwt() ->> 'email') = 'sivaganeshdegala@gmail.com')
    with check ((auth.jwt() ->> 'email') = 'sivaganeshdegala@gmail.com');

grant select on public.projects to anon, authenticated;
grant insert, update, delete on public.projects to authenticated;
grant insert on public.messages to anon, authenticated;
grant select, delete on public.messages to authenticated;
grant select on public.portfolio_profile to anon, authenticated;
grant insert, update, delete on public.portfolio_profile to authenticated;

-- Preserve the two existing project entries without duplicating titles.
insert into public.projects (title, category, description, long_description, technologies, github_url, live_url, image_url, is_published, is_featured, sort_order)
select 'Personal Portfolio', 'Web Development',
    'A personal portfolio built with React and Tailwind CSS, presenting my academic journey, skills, and projects.',
    'A single-page portfolio built with React and Tailwind CSS. Supabase powers its published project list, admin tools, and contact message storage.',
    array['React (Learning/Exploring)', 'JavaScript', 'Tailwind CSS', 'HTML'],
    'https://github.com/sivaganeshdegala-sketch/sivadegala-portfolio',
    'https://sivaganeshdegala-sketch.github.io/sivadegala-portfolio/',
    'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=900&q=80',
    true, true, 1
where not exists (select 1 from public.projects where title = 'Personal Portfolio');

insert into public.projects (title, category, description, long_description, technologies, github_url, live_url, image_url, is_published, is_featured, sort_order)
select 'Doctor Appointment Booking System', 'C Programming',
    'A C-based command-line system for patient information, doctor selection, fees, available slots, date and time selection, and booking confirmation.',
    'The current version is a C command-line application. It does not include a database, login, admin panel, web backend, or online payments.',
    array['C (Learning/Using)', 'Command Line'],
    'https://github.com/sivaganeshdegala-sketch', null,
    'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=900&q=80',
    true, true, 2
where not exists (select 1 from public.projects where title = 'Doctor Appointment Booking System');

update public.projects
set category = 'C Programming',
    description = 'A C-based command-line system for patient information, doctor selection, fees, available slots, date and time selection, and booking confirmation.',
    long_description = 'The current version is a C command-line application. It does not include a database, login, admin panel, web backend, or online payments.',
    technologies = array['C (Learning/Using)', 'Command Line']
where title = 'Doctor Appointment Booking System';
