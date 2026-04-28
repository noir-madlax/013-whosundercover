import { describe, expect, it } from 'vitest'
import {
  buildRoleDeck,
  evaluateWinner,
  findVoteResult,
  getRolePlan,
  shouldPromptBlankGuess,
} from './gameRules'
import type { GameAssignment, RoomPlayer } from './types'

function players(count: number, eliminated: string[] = []): RoomPlayer[] {
  return Array.from({ length: count }, (_, index) => {
    const id = `p${index + 1}`
    return {
      id,
      room_id: 'r1',
      user_id: `u${index + 1}`,
      nickname: `玩家${index + 1}`,
      seat: index + 1,
      is_host: index === 0,
      is_eliminated: eliminated.includes(id),
      is_online: true,
      joined_at: '',
    }
  })
}

function assignments(roles: Array<GameAssignment['role']>): GameAssignment[] {
  return roles.map((role, index) => ({
    id: `a${index + 1}`,
    room_id: 'r1',
    player_id: `p${index + 1}`,
    user_id: `u${index + 1}`,
    role,
    word: role === 'blank' ? null : '词',
    created_at: '',
  }))
}

describe('game rules', () => {
  it('assigns one undercover for 4 and 6 players', () => {
    expect(getRolePlan(4, false)).toEqual({ civilians: 3, undercovers: 1, blanks: 0 })
    expect(getRolePlan(6, true)).toEqual({ civilians: 4, undercovers: 1, blanks: 1 })
  })

  it('assigns two undercovers for 7 and 10 players', () => {
    expect(getRolePlan(7, false)).toEqual({ civilians: 5, undercovers: 2, blanks: 0 })
    expect(getRolePlan(10, true)).toEqual({ civilians: 7, undercovers: 2, blanks: 1 })
  })

  it('builds role decks with optional blank', () => {
    expect(buildRoleDeck(4, false).sort()).toEqual(['civilian', 'civilian', 'civilian', 'undercover'].sort())
    expect(buildRoleDeck(4, true).sort()).toEqual(['blank', 'civilian', 'civilian', 'undercover'].sort())
  })

  it('detects tied votes', () => {
    expect(
      findVoteResult([
        { target_player_id: 'p1' },
        { target_player_id: 'p2' },
      ]),
    ).toEqual({ tied: true, targetPlayerId: null, count: 1 })
  })

  it('resolves civilian and undercover wins', () => {
    expect(evaluateWinner(players(4, ['p4']), assignments(['civilian', 'civilian', 'civilian', 'undercover']))).toBe(
      'civilians',
    )
    expect(evaluateWinner(players(4, ['p1', 'p2']), assignments(['civilian', 'civilian', 'civilian', 'undercover']))).toBe(
      'undercovers',
    )
  })

  it('prompts blank guess when a live blank reaches final three', () => {
    expect(
      shouldPromptBlankGuess(players(4, ['p1']), assignments(['civilian', 'civilian', 'undercover', 'blank'])),
    ).toBe(true)
  })
})
