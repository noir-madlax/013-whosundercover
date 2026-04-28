import type { GameAssignment, PlayerRole, RoomPlayer, Winner } from './types'

export type RolePlan = {
  civilians: number
  undercovers: number
  blanks: number
}

export function getUndercoverCount(playerCount: number) {
  if (playerCount < 4) return 0
  return playerCount >= 7 ? 2 : 1
}

export function getRolePlan(playerCount: number, enableBlank: boolean): RolePlan {
  const undercovers = getUndercoverCount(playerCount)
  const blanks = enableBlank ? 1 : 0
  return {
    civilians: Math.max(playerCount - undercovers - blanks, 0),
    undercovers,
    blanks,
  }
}

export function buildRoleDeck(playerCount: number, enableBlank: boolean): PlayerRole[] {
  const plan = getRolePlan(playerCount, enableBlank)
  return [
    ...Array<PlayerRole>(plan.civilians).fill('civilian'),
    ...Array<PlayerRole>(plan.undercovers).fill('undercover'),
    ...Array<PlayerRole>(plan.blanks).fill('blank'),
  ]
}

export function getAlivePlayers(players: RoomPlayer[]) {
  return players
    .filter((player) => !player.is_eliminated)
    .sort((a, b) => a.seat - b.seat)
}

export function getCurrentSpeaker(players: RoomPlayer[], speakerIndex: number) {
  const alivePlayers = getAlivePlayers(players)
  if (!alivePlayers.length) return null
  return alivePlayers[speakerIndex % alivePlayers.length]
}

export function countVotes(votes: { target_player_id: string }[]) {
  return votes.reduce<Record<string, number>>((counts, vote) => {
    counts[vote.target_player_id] = (counts[vote.target_player_id] ?? 0) + 1
    return counts
  }, {})
}

export function findVoteResult(votes: { target_player_id: string }[]) {
  const counts = countVotes(votes)
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1])
  if (!entries.length) return { tied: false, targetPlayerId: null, count: 0 }
  const [winnerId, winnerCount] = entries[0]
  const tied = entries.length > 1 && entries[1][1] === winnerCount
  return { tied, targetPlayerId: tied ? null : winnerId, count: winnerCount }
}

export function evaluateWinner(
  players: RoomPlayer[],
  assignments: Pick<GameAssignment, 'player_id' | 'role'>[],
): Winner {
  const aliveIds = new Set(getAlivePlayers(players).map((player) => player.id))
  const aliveAssignments = assignments.filter((assignment) => aliveIds.has(assignment.player_id))
  const undercovers = aliveAssignments.filter((assignment) => assignment.role === 'undercover').length
  const civilians = aliveAssignments.filter((assignment) => assignment.role === 'civilian').length

  if (undercovers === 0) return 'civilians'
  if (undercovers >= civilians) return 'undercovers'
  return null
}

export function shouldPromptBlankGuess(
  players: RoomPlayer[],
  assignments: Pick<GameAssignment, 'player_id' | 'role'>[],
) {
  const aliveIds = new Set(getAlivePlayers(players).map((player) => player.id))
  const blankAlive = assignments.some(
    (assignment) => assignment.role === 'blank' && aliveIds.has(assignment.player_id),
  )
  return blankAlive && aliveIds.size <= 3
}

export function winnerLabel(winner: Winner) {
  if (winner === 'civilians') return '平民胜利'
  if (winner === 'undercovers') return '卧底胜利'
  if (winner === 'blank') return '白板独赢'
  return '游戏继续'
}
