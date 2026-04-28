create extension if not exists pgcrypto;

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[0-9A-Z]{6}$'),
  host_user_id uuid not null,
  status text not null default 'lobby' check (status in ('lobby', 'reveal', 'speaking', 'voting', 'elimination', 'blank_guess', 'finished')),
  round integer not null default 1,
  speaker_index integer not null default 0,
  settings jsonb not null default '{"enableBlank":true,"undercoverMode":"auto"}'::jsonb,
  winner text check (winner in ('civilians', 'undercovers', 'blank')),
  result_message text,
  current_word_pair_id uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '12 hours'
);

create table public.room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null,
  nickname text not null check (char_length(trim(nickname)) between 1 and 12),
  seat integer not null check (seat between 1 and 10),
  is_host boolean not null default false,
  is_eliminated boolean not null default false,
  is_online boolean not null default true,
  joined_at timestamptz not null default now(),
  unique (room_id, user_id),
  unique (room_id, seat)
);

create table public.word_pairs (
  id uuid primary key default gen_random_uuid(),
  civilian_word text not null,
  undercover_word text not null,
  category text not null,
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  created_at timestamptz not null default now(),
  unique (civilian_word, undercover_word)
);

alter table public.rooms
  add constraint rooms_current_word_pair_id_fkey
  foreign key (current_word_pair_id) references public.word_pairs(id);

create table public.game_assignments (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.room_players(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('civilian', 'undercover', 'blank')),
  word text,
  created_at timestamptz not null default now(),
  unique (room_id, player_id),
  unique (room_id, user_id)
);

create table public.votes (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  round integer not null,
  voter_player_id uuid not null references public.room_players(id) on delete cascade,
  target_player_id uuid not null references public.room_players(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (room_id, round, voter_player_id)
);

create table public.blank_guesses (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  round integer not null,
  player_id uuid not null references public.room_players(id) on delete cascade,
  guess text not null,
  is_correct boolean not null default false,
  created_at timestamptz not null default now(),
  unique (room_id, round, player_id)
);

alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.word_pairs enable row level security;
alter table public.game_assignments enable row level security;
alter table public.votes enable row level security;
alter table public.blank_guesses enable row level security;

create policy "authenticated can read active rooms"
  on public.rooms for select
  to authenticated
  using (expires_at > now());

create policy "host can update room"
  on public.rooms for update
  to authenticated
  using (host_user_id = auth.uid())
  with check (host_user_id = auth.uid());

create policy "authenticated can read room players"
  on public.room_players for select
  to authenticated
  using (true);

create policy "players can join themselves"
  on public.room_players for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.rooms r
      where r.id = room_id
        and r.status = 'lobby'
        and (not is_host or r.host_user_id = auth.uid())
    )
  );

create policy "players can update themselves or host can update room players"
  on public.room_players for update
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.rooms r
      where r.id = room_id and r.host_user_id = auth.uid()
    )
  );

create policy "authenticated can read word metadata"
  on public.word_pairs for select
  to authenticated
  using (true);

create policy "players read own assignment until finish"
  on public.game_assignments for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.rooms r
      where r.id = room_id and r.status = 'finished'
    )
  );

create policy "room members can read votes"
  on public.votes for select
  to authenticated
  using (
    exists (
      select 1 from public.room_players p
      where p.room_id = votes.room_id and p.user_id = auth.uid()
    )
  );

create policy "room members can read blank guesses"
  on public.blank_guesses for select
  to authenticated
  using (
    exists (
      select 1 from public.room_players p
      where p.room_id = blank_guesses.room_id and p.user_id = auth.uid()
    )
  );

create or replace function public.validate_room_player_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_count integer;
begin
  select * into v_room from public.rooms where id = new.room_id for update;
  if not found or v_room.status <> 'lobby' then
    raise exception '只能在大厅阶段加入房间';
  end if;

  select count(*) into v_count from public.room_players where room_id = new.room_id;
  if v_count >= 10 then
    raise exception '房间已满，最多 10 人';
  end if;

  if new.is_host and v_room.host_user_id <> new.user_id then
    raise exception '只有房主可以设置房主身份';
  end if;

  return new;
end;
$$;

create trigger validate_room_player_insert
before insert on public.room_players
for each row execute function public.validate_room_player_insert();

create or replace function public.create_room()
returns table(id uuid, code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception '需要登录';
  end if;

  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from public.rooms r where r.code = v_code);
  end loop;

  insert into public.rooms (code, host_user_id)
  values (v_code, auth.uid())
  returning rooms.id into v_id;

  return query select v_id, v_code;
end;
$$;

create or replace function public.start_game(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_player_count integer;
  v_undercover_count integer;
  v_blank_count integer;
  v_pair public.word_pairs%rowtype;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or v_room.host_user_id <> auth.uid() then
    raise exception '只有房主可以开始游戏';
  end if;

  select count(*) into v_player_count from public.room_players where room_id = p_room_id;
  if v_player_count < 4 or v_player_count > 10 then
    raise exception '需要 4-10 人才能开始';
  end if;

  v_undercover_count := case when v_player_count >= 7 then 2 else 1 end;
  v_blank_count := case when coalesce((v_room.settings->>'enableBlank')::boolean, true) then 1 else 0 end;

  select * into v_pair from public.word_pairs order by random() limit 1;
  if not found then
    raise exception '词库为空';
  end if;

  update public.room_players set is_eliminated = false where room_id = p_room_id;
  delete from public.votes where room_id = p_room_id;
  delete from public.blank_guesses where room_id = p_room_id;
  delete from public.game_assignments where room_id = p_room_id;

  insert into public.game_assignments (room_id, player_id, user_id, role, word)
  select
    p_room_id,
    ranked.id,
    ranked.user_id,
    case
      when ranked.rn <= v_blank_count then 'blank'
      when ranked.rn <= v_blank_count + v_undercover_count then 'undercover'
      else 'civilian'
    end,
    case
      when ranked.rn <= v_blank_count then null
      when ranked.rn <= v_blank_count + v_undercover_count then v_pair.undercover_word
      else v_pair.civilian_word
    end
  from (
    select p.*, row_number() over (order by random()) as rn
    from public.room_players p
    where p.room_id = p_room_id
  ) ranked;

  update public.rooms
  set status = 'reveal',
      round = 1,
      speaker_index = 0,
      winner = null,
      result_message = null,
      current_word_pair_id = v_pair.id
  where id = p_room_id;
end;
$$;

create or replace function public.evaluate_room_after_elimination(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_alive_count integer;
  v_undercovers integer;
  v_civilians integer;
  v_blank_alive boolean;
  v_blank_already_guessed boolean;
begin
  select * into v_room from public.rooms where id = p_room_id for update;

  select count(*) into v_alive_count
  from public.room_players
  where room_id = p_room_id and not is_eliminated;

  select count(*) into v_undercovers
  from public.game_assignments a
  join public.room_players p on p.id = a.player_id
  where a.room_id = p_room_id and a.role = 'undercover' and not p.is_eliminated;

  select count(*) into v_civilians
  from public.game_assignments a
  join public.room_players p on p.id = a.player_id
  where a.room_id = p_room_id and a.role = 'civilian' and not p.is_eliminated;

  select exists (
    select 1
    from public.game_assignments a
    join public.room_players p on p.id = a.player_id
    where a.room_id = p_room_id and a.role = 'blank' and not p.is_eliminated
  ) into v_blank_alive;

  select exists (
    select 1 from public.blank_guesses g
    where g.room_id = p_room_id and g.round = v_room.round
  ) into v_blank_already_guessed;

  if v_blank_alive and v_alive_count <= 3 and not v_blank_already_guessed then
    update public.rooms
    set status = 'blank_guess',
        result_message = '白板进入猜词机会。'
    where id = p_room_id;
  elsif v_undercovers = 0 then
    update public.rooms
    set status = 'finished',
        winner = 'civilians',
        result_message = '所有卧底已经出局。'
    where id = p_room_id;
  elsif v_undercovers >= v_civilians then
    update public.rooms
    set status = 'finished',
        winner = 'undercovers',
        result_message = '卧底人数已经追平或超过平民。'
    where id = p_room_id;
  else
    update public.rooms
    set status = 'speaking',
        round = round + 1,
        speaker_index = 0,
        result_message = '进入下一轮发言。'
    where id = p_room_id;
  end if;
end;
$$;

create or replace function public.submit_vote(p_room_id uuid, p_target_player_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_voter_id uuid;
begin
  select * into v_room from public.rooms where id = p_room_id;
  if not found or v_room.status <> 'voting' then
    raise exception '当前不能投票';
  end if;

  select id into v_voter_id
  from public.room_players
  where room_id = p_room_id and user_id = auth.uid() and not is_eliminated;
  if v_voter_id is null then
    raise exception '出局或未加入的玩家不能投票';
  end if;

  if not exists (
    select 1 from public.room_players
    where id = p_target_player_id and room_id = p_room_id and not is_eliminated
  ) then
    raise exception '投票目标无效';
  end if;

  insert into public.votes (room_id, round, voter_player_id, target_player_id)
  values (p_room_id, v_room.round, v_voter_id, p_target_player_id)
  on conflict (room_id, round, voter_player_id)
  do update set target_player_id = excluded.target_player_id, created_at = now();
end;
$$;

create or replace function public.resolve_vote(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_alive_count integer;
  v_vote_count integer;
  v_top_count integer;
  v_top_target uuid;
  v_top_ties integer;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or v_room.host_user_id <> auth.uid() then
    raise exception '只有房主可以结算投票';
  end if;
  if v_room.status <> 'voting' then
    raise exception '当前不是投票阶段';
  end if;

  select count(*) into v_alive_count
  from public.room_players
  where room_id = p_room_id and not is_eliminated;

  select count(*) into v_vote_count
  from public.votes
  where room_id = p_room_id and round = v_room.round;

  if v_vote_count < v_alive_count then
    raise exception '还有玩家未投票';
  end if;

  with counts as (
    select target_player_id, count(*)::integer as c
    from public.votes
    where room_id = p_room_id and round = v_room.round
    group by target_player_id
  ),
  top_count as (
    select max(c) as c from counts
  )
  select counts.target_player_id, counts.c, (select count(*) from counts, top_count where counts.c = top_count.c)
  into v_top_target, v_top_count, v_top_ties
  from counts, top_count
  where counts.c = top_count.c
  limit 1;

  if v_top_ties > 1 then
    delete from public.votes where room_id = p_room_id and round = v_room.round;
    update public.rooms
    set status = 'voting',
        result_message = '出现平票，请重新投票。'
    where id = p_room_id;
    return;
  end if;

  update public.room_players
  set is_eliminated = true
  where id = v_top_target and room_id = p_room_id;

  perform public.evaluate_room_after_elimination(p_room_id);
end;
$$;

create or replace function public.submit_blank_guess(p_room_id uuid, p_guess text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_player_id uuid;
  v_word text;
  v_correct boolean;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or v_room.status <> 'blank_guess' then
    raise exception '当前不能猜词';
  end if;

  select a.player_id into v_player_id
  from public.game_assignments a
  join public.room_players p on p.id = a.player_id
  where a.room_id = p_room_id
    and a.user_id = auth.uid()
    and a.role = 'blank'
    and not p.is_eliminated;
  if v_player_id is null then
    raise exception '只有存活白板可以猜词';
  end if;

  select w.civilian_word into v_word
  from public.word_pairs w
  where w.id = v_room.current_word_pair_id;

  v_correct := lower(trim(p_guess)) = lower(trim(v_word));

  insert into public.blank_guesses (room_id, round, player_id, guess, is_correct)
  values (p_room_id, v_room.round, v_player_id, trim(p_guess), v_correct);

  if v_correct then
    update public.rooms
    set status = 'finished',
        winner = 'blank',
        result_message = '白板猜中了平民词：' || v_word
    where id = p_room_id;
  else
    update public.rooms
    set result_message = '白板猜错了，继续结算阵营胜负。'
    where id = p_room_id;
    perform public.evaluate_room_after_elimination(p_room_id);
  end if;
end;
$$;

alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.room_players;
alter publication supabase_realtime add table public.game_assignments;
alter publication supabase_realtime add table public.votes;
alter publication supabase_realtime add table public.blank_guesses;

insert into public.word_pairs (civilian_word, undercover_word, category, difficulty) values
('牛奶','豆浆','食物','easy'),('米饭','面条','食物','easy'),('火锅','烧烤','食物','easy'),('蛋糕','面包','食物','easy'),('咖啡','奶茶','食物','easy'),
('饺子','包子','食物','easy'),('西瓜','哈密瓜','食物','easy'),('冰淇淋','雪糕','食物','easy'),('可乐','雪碧','食物','easy'),('薯条','薯片','食物','easy'),
('手机','平板','物品','easy'),('耳机','音响','物品','easy'),('钥匙','门卡','物品','easy'),('雨伞','雨衣','物品','easy'),('书包','行李箱','物品','easy'),
('电梯','扶梯','物品','easy'),('镜子','相机','物品','medium'),('牙刷','牙膏','物品','easy'),('沙发','椅子','物品','easy'),('空调','风扇','物品','easy'),
('学校','图书馆','地点','easy'),('电影院','剧院','地点','easy'),('医院','药店','地点','easy'),('机场','火车站','地点','easy'),('厨房','餐厅','地点','easy'),
('公园','广场','地点','easy'),('海边','泳池','地点','easy'),('办公室','会议室','地点','easy'),('超市','菜市场','地点','easy'),('酒店','民宿','地点','easy'),
('猫','狗','动物','easy'),('老虎','狮子','动物','easy'),('兔子','仓鼠','动物','easy'),('海豚','鲸鱼','动物','medium'),('企鹅','北极熊','动物','medium'),
('蚊子','苍蝇','动物','easy'),('蝴蝶','蜜蜂','动物','easy'),('乌龟','蜗牛','动物','medium'),('马','骆驼','动物','easy'),('鸭子','鹅','动物','easy'),
('唱歌','跳舞','娱乐','easy'),('电影','电视剧','娱乐','easy'),('篮球','足球','娱乐','easy'),('剧本杀','密室逃脱','娱乐','medium'),('麻将','扑克','娱乐','easy'),
('小说','漫画','娱乐','easy'),('旅行','露营','娱乐','medium'),('直播','短视频','娱乐','easy'),('演唱会','音乐节','娱乐','easy'),('游乐园','动物园','娱乐','easy'),
('上班','上课','生活','easy'),('迟到','早退','生活','easy'),('洗澡','洗脸','生活','easy'),('做饭','点外卖','生活','easy'),('睡觉','午休','生活','easy'),
('搬家','装修','生活','medium'),('考试','面试','生活','medium'),('加班','熬夜','生活','easy'),('快递','外卖','生活','easy'),('红包','转账','生活','easy'),
('口红','粉底','物品','medium'),('香水','洗发水','物品','medium'),('围巾','帽子','物品','easy'),('手表','手环','物品','easy'),('自行车','电动车','物品','easy'),
('地铁','公交','地点','easy'),('阳台','天台','地点','medium'),('银行','邮局','地点','easy'),('健身房','操场','地点','easy'),('教室','实验室','地点','easy'),
('熊猫','考拉','动物','medium'),('孔雀','鹦鹉','动物','medium'),('鲨鱼','鳄鱼','动物','medium'),('松鼠','刺猬','动物','medium'),('青蛙','蜥蜴','动物','medium'),
('酸奶','奶酪','食物','medium'),('馒头','花卷','食物','easy'),('烤鸭','炸鸡','食物','easy'),('粽子','月饼','食物','medium'),('火腿','培根','食物','medium'),
('魔术','杂技','娱乐','medium'),('滑雪','滑冰','娱乐','medium'),('KTV','酒吧','娱乐','easy'),('桌游','电子游戏','娱乐','easy'),('相声','脱口秀','娱乐','medium'),
('闹钟','日历','生活','medium'),('体检','看病','生活','easy'),('租房','买房','生活','medium'),('婚礼','生日会','生活','easy'),('存钱','理财','生活','medium'),
('月亮','太阳','生活','easy'),('下雨','下雪','生活','easy'),('白天','夜晚','生活','easy'),('春天','秋天','生活','easy'),('城市','乡村','地点','easy')
on conflict (civilian_word, undercover_word) do nothing;
