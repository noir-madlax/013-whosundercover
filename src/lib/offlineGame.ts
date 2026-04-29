import { buildRoleDeck } from './gameRules'
import type { PlayerRole, WordPair } from './types'
import { WORD_PAIRS } from './wordPairs'

type WordPairSeed = Omit<WordPair, 'id'>

export type OfflineAssignment = {
  seat: number
  role: PlayerRole
  word: string | null
}

export type OfflineGame = {
  code: string
  wordPair: WordPairSeed
  assignments: OfflineAssignment[]
}

export function createOfflineGame(
  playerCount: number,
  enableBlank: boolean,
  rng: () => number = Math.random,
  wordPairs: WordPairSeed[] = WORD_PAIRS,
): OfflineGame {
  if (playerCount < 4 || playerCount > 10) throw new Error('线下模式需要 4-10 位玩家。')
  if (!wordPairs.length) throw new Error('词库为空，无法创建线下游戏。')

  const wordPair = wordPairs[Math.floor(rng() * wordPairs.length)] ?? wordPairs[0]
  const roles = shuffleItems(buildRoleDeck(playerCount, enableBlank), rng)
  const assignments = roles.map((role, index) => ({
    seat: index + 1,
    role,
    word: role === 'blank' ? null : role === 'undercover' ? wordPair.undercover_word : wordPair.civilian_word,
  }))

  return {
    code: generateOfflineRoomCode(rng),
    wordPair,
    assignments,
  }
}

export function generateOfflineRoomCode(rng: () => number = Math.random) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => alphabet[Math.floor(rng() * alphabet.length)] ?? 'A').join('')
}

export function shuffleItems<T>(items: T[], rng: () => number = Math.random) {
  const nextItems = [...items]
  for (let index = nextItems.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1))
    ;[nextItems[index], nextItems[swapIndex]] = [nextItems[swapIndex], nextItems[index]]
  }
  return nextItems
}
