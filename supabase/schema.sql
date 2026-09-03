-- ============================================================================
-- Supabase Schema for Classic Messenger (Chat, Profiles, Realtime & Calls)
-- ============================================================================
-- Instructions: Run this script directly in your Supabase SQL Editor.
-- ============================================================================

-- 1. Create Profiles Table (Linked to auth.users)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  avatar_url text,
  is_online boolean default false,
  last_seen timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint username_format check (username ~ '^[a-z0-9_]+$')
);

-- 2. Trigger to Automatically Create Profile when User Registers
create or replace function public.handle_new_user()
returns trigger as $$
declare
  raw_username text;
  clean_username text;
begin
  -- Extract username from metadata or fallback to email prefix
  raw_username := coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1));
  
  -- Enforce all lowercase and remove all whitespace/spaces
  clean_username := lower(regexp_replace(trim(raw_username), '\s+', '', 'g'));

  -- Ensure only valid characters (a-z, 0-9, _)
  clean_username := regexp_replace(clean_username, '[^a-z0-9_]', '', 'g');

  if clean_username = '' or clean_username is null then
    clean_username := 'user_' || substring(gen_random_uuid()::text, 1, 6);
  end if;

  insert into public.profiles (id, username, avatar_url, is_online, last_seen, created_at, updated_at)
  values (
    new.id,
    clean_username,
    new.raw_user_meta_data->>'avatar_url',
    false,
    now(),
    now(),
    now()
  );
  return new;
exception
  when unique_violation then
    -- In case of username collision, append random digits
    insert into public.profiles (id, username, avatar_url, is_online, last_seen, created_at, updated_at)
    values (
      new.id,
      clean_username || '_' || substring(gen_random_uuid()::text, 1, 4),
      new.raw_user_meta_data->>'avatar_url',
      false,
      now(),
      now(),
      now()
    );
    return new;
end;
$$ language plpgsql security definer;

-- Drop trigger if it exists and recreate
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3. Helper Function to Resolve Email from Username for Login
create or replace function public.get_email_for_username(p_username text)
returns text as $$
declare
  user_email text;
  clean_user text;
begin
  clean_user := lower(regexp_replace(trim(p_username), '\s+', '', 'g'));
  
  select u.email into user_email
  from auth.users u
  join public.profiles p on p.id = u.id
  where p.username = clean_user
  limit 1;
  
  return user_email;
end;
$$ language plpgsql security definer;

grant execute on function public.get_email_for_username(text) to anon, authenticated;

-- 4. Conversations Table
create table if not exists public.conversations (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 5. Conversation Members Table
create table if not exists public.conversation_members (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references public.conversations(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique(conversation_id, user_id)
);

-- 6. Atomic Function to Find or Create 1-on-1 Conversation
create or replace function public.get_or_create_conversation(p_user_id uuid)
returns uuid as $$
declare
  v_conv_id uuid;
  v_auth_id uuid := auth.uid();
begin
  if v_auth_id is null then
    raise exception 'Authentication required';
  end if;

  if p_user_id is null or p_user_id = v_auth_id then
    raise exception 'Invalid target user ID';
  end if;

  -- 1. Find existing conversation between auth.uid() and p_user_id
  select cm1.conversation_id into v_conv_id
  from public.conversation_members cm1
  join public.conversation_members cm2 on cm1.conversation_id = cm2.conversation_id
  where cm1.user_id = v_auth_id and cm2.user_id = p_user_id
  limit 1;
  
  if v_conv_id is not null then
    return v_conv_id;
  end if;
  
  -- 2. Create new conversation
  insert into public.conversations (id, created_at, updated_at)
  values (gen_random_uuid(), now(), now())
  returning id into v_conv_id;
  
  -- 3. Add both members
  insert into public.conversation_members (conversation_id, user_id, created_at)
  values 
    (v_conv_id, v_auth_id, now()),
    (v_conv_id, p_user_id, now());
  
  return v_conv_id;
end;
$$ language plpgsql security definer;

grant execute on function public.get_or_create_conversation(uuid) to authenticated, anon;

-- 7. Messages Table
create table if not exists public.messages (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references public.conversations(id) on delete cascade not null,
  sender_id uuid references public.profiles(id) on delete cascade not null,
  content text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

-- 8. Indexes for Performance & Search
create index if not exists idx_profiles_username on public.profiles (username);
create index if not exists idx_conversation_members_user on public.conversation_members (user_id);
create index if not exists idx_conversation_members_conv on public.conversation_members (conversation_id);
create index if not exists idx_messages_conversation on public.messages (conversation_id, created_at asc);
create index if not exists idx_messages_sender on public.messages (sender_id);

-- 9. Enable Row Level Security (RLS)
alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

-- 10. RLS Policies

-- PROFILES Policies
drop policy if exists "Authenticated users can view profiles" on public.profiles;
create policy "Authenticated users can view profiles"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

-- CONVERSATIONS Policies
drop policy if exists "Users can view their conversations" on public.conversations;
create policy "Users can view their conversations"
  on public.conversations for select
  to authenticated
  using (
    exists (
      select 1 from public.conversation_members
      where conversation_members.conversation_id = conversations.id
      and conversation_members.user_id = auth.uid()
    )
  );

drop policy if exists "Authenticated users can create conversations" on public.conversations;
create policy "Authenticated users can create conversations"
  on public.conversations for insert
  to authenticated
  with check (true);

-- CONVERSATION_MEMBERS Policies
drop policy if exists "Users can view members of their conversations" on public.conversation_members;
create policy "Users can view members of their conversations"
  on public.conversation_members for select
  to authenticated
  using (
    exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = conversation_members.conversation_id
      and cm.user_id = auth.uid()
    )
  );

drop policy if exists "Authenticated users can add conversation members" on public.conversation_members;
create policy "Authenticated users can add conversation members"
  on public.conversation_members for insert
  to authenticated
  with check (true);

-- MESSAGES Policies
drop policy if exists "Users can view messages in their conversations" on public.messages;
create policy "Users can view messages in their conversations"
  on public.messages for select
  to authenticated
  using (
    exists (
      select 1 from public.conversation_members
      where conversation_members.conversation_id = messages.conversation_id
      and conversation_members.user_id = auth.uid()
    )
  );

drop policy if exists "Users can insert messages into their conversations" on public.messages;
create policy "Users can insert messages into their conversations"
  on public.messages for insert
  to authenticated
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.conversation_members
      where conversation_members.conversation_id = messages.conversation_id
      and conversation_members.user_id = auth.uid()
    )
  );

drop policy if exists "Users can update their own messages" on public.messages;
create policy "Users can update their own messages"
  on public.messages for update
  to authenticated
  using (auth.uid() = sender_id);

-- 11. Realtime Publication Setup
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'profiles') then
    alter publication supabase_realtime add table public.profiles;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'conversation_members') then
    alter publication supabase_realtime add table public.conversation_members;
  end if;
end $$;
