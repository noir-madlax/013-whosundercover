export type GameStatus =
  | 'lobby'
  | 'reveal'
  | 'speaking'
  | 'voting'
  | 'elimination'
  | 'blank_guess'
  | 'finished'

export type PlayerRole = 'civilian' | 'undercover' | 'blank'
export type Winner = 'civilians' | 'undercovers' | 'blank' | null

export type RoomSettings = {
  enableBlank: boolean
  undercoverMode: 'auto'
}

export type Room = {
  id: string
  code: string
  host_user_id: string
  status: GameStatus
  round: number
  speaker_index: number
  settings: RoomSettings
  winner: Winner
  result_message: string | null
  current_word_pair_id: string | null
  created_at: string
  expires_at: string
}

export type RoomPlayer = {
  id: string
  room_id: string
  user_id: string
  nickname: string
  seat: number
  is_host: boolean
  is_eliminated: boolean
  is_online: boolean
  joined_at: string
}

export type GameAssignment = {
  id: string
  room_id: string
  player_id: string
  user_id: string
  role: PlayerRole
  word: string | null
  created_at: string
}

export type Vote = {
  id: string
  room_id: string
  round: number
  voter_player_id: string
  target_player_id: string
  created_at: string
}

export type WordPair = {
  id: string
  civilian_word: string
  undercover_word: string
  category: string
  difficulty: 'easy' | 'medium' | 'hard'
}

export type RoomSnapshot = {
  room: Room
  players: RoomPlayer[]
  assignment: GameAssignment | null
  votes: Vote[]
}
