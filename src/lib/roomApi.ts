import { supabase } from './supabase'
import type { GameStatus, Room, RoomPlayer, RoomSettings, RoomSnapshot, Vote } from './types'

function requireClient() {
  if (!supabase) {
    throw new Error('Supabase 尚未配置。请复制 .env.example 并填入项目 URL 与 anon key。')
  }
  return supabase
}

export async function createRoom(nickname: string) {
  const client = requireClient()
  const { data: roomData, error: roomError } = await client.rpc('create_room')
  if (roomError) throw roomError

  const room = Array.isArray(roomData) ? roomData[0] : roomData
  if (!room?.id || !room?.code) throw new Error('创建房间失败。')

  const { error: playerError } = await client.from('room_players').insert({
    room_id: room.id,
    user_id: (await client.auth.getUser()).data.user?.id,
    nickname,
    seat: 1,
    is_host: true,
  })
  if (playerError) throw playerError

  return room as Pick<Room, 'id' | 'code'>
}

export async function getRoomByCode(code: string) {
  const client = requireClient()
  const { data, error } = await client
    .from('rooms')
    .select('*')
    .eq('code', code.toUpperCase())
    .maybeSingle()
  if (error) throw error
  return data as Room | null
}

export async function joinRoom(roomId: string, nickname: string) {
  const client = requireClient()
  const userId = (await client.auth.getUser()).data.user?.id
  if (!userId) throw new Error('请先完成匿名登录。')

  const { data: existing, error: existingError } = await client
    .from('room_players')
    .select('*')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .maybeSingle()
  if (existingError) throw existingError
  if (existing) return existing as RoomPlayer

  const { count, error: countError } = await client
    .from('room_players')
    .select('id', { count: 'exact', head: true })
    .eq('room_id', roomId)
  if (countError) throw countError
  if ((count ?? 0) >= 10) throw new Error('房间已满，最多 10 人。')

  const { data, error } = await client
    .from('room_players')
    .insert({
      room_id: roomId,
      user_id: userId,
      nickname,
      seat: (count ?? 0) + 1,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as RoomPlayer
}

export async function loadRoomSnapshot(roomCode: string): Promise<RoomSnapshot | null> {
  const client = requireClient()
  const room = await getRoomByCode(roomCode)
  if (!room) return null
  const userId = (await client.auth.getUser()).data.user?.id

  const [{ data: players, error: playersError }, { data: assignment, error: assignmentError }, { data: votes, error: votesError }] =
    await Promise.all([
      client.from('room_players').select('*').eq('room_id', room.id).order('seat'),
      client.from('game_assignments').select('*').eq('room_id', room.id).eq('user_id', userId ?? '').maybeSingle(),
      client.from('votes').select('*').eq('room_id', room.id).eq('round', room.round),
    ])

  if (playersError) throw playersError
  if (assignmentError) throw assignmentError
  if (votesError) throw votesError

  return {
    room,
    players: (players ?? []) as RoomPlayer[],
    assignment: assignment ?? null,
    votes: (votes ?? []) as Vote[],
  }
}

export async function updateRoomSettings(roomId: string, settings: RoomSettings) {
  const client = requireClient()
  const { error } = await client.from('rooms').update({ settings }).eq('id', roomId)
  if (error) throw error
}

export async function startGame(roomId: string) {
  const client = requireClient()
  const { error } = await client.rpc('start_game', { p_room_id: roomId })
  if (error) throw error
}

export async function setRoomStatus(roomId: string, status: GameStatus) {
  const client = requireClient()
  const { error } = await client.from('rooms').update({ status }).eq('id', roomId)
  if (error) throw error
}

export async function nextSpeaker(room: Room, aliveCount: number) {
  const client = requireClient()
  const nextIndex = aliveCount ? (room.speaker_index + 1) % aliveCount : 0
  const { error } = await client
    .from('rooms')
    .update({ speaker_index: nextIndex })
    .eq('id', room.id)
  if (error) throw error
}

export async function submitVote(roomId: string, targetPlayerId: string) {
  const client = requireClient()
  const { error } = await client.rpc('submit_vote', {
    p_room_id: roomId,
    p_target_player_id: targetPlayerId,
  })
  if (error) throw error
}

export async function resolveVote(roomId: string) {
  const client = requireClient()
  const { error } = await client.rpc('resolve_vote', { p_room_id: roomId })
  if (error) throw error
}

export async function submitBlankGuess(roomId: string, guess: string) {
  const client = requireClient()
  const { error } = await client.rpc('submit_blank_guess', {
    p_room_id: roomId,
    p_guess: guess,
  })
  if (error) throw error
}

export function subscribeToRoom(roomId: string, onChange: () => void) {
  const client = requireClient()
  const channel = client
    .channel(`room:${roomId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'game_assignments', filter: `room_id=eq.${roomId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'votes', filter: `room_id=eq.${roomId}` }, onChange)
    .subscribe()

  return () => {
    void client.removeChannel(channel)
  }
}
