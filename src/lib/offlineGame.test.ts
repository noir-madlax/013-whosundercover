import { describe, expect, it } from 'vitest'
import { createOfflineGame, generateOfflineRoomCode } from './offlineGame'

const fixedPair = [{ civilian_word: '牛奶', undercover_word: '豆浆', category: '食物', difficulty: 'easy' as const }]

describe('offlineGame', () => {
  it('creates a local game with role counts and words', () => {
    const game = createOfflineGame(6, true, () => 0, fixedPair)
    const roles = game.assignments.map((assignment) => assignment.role)

    expect(game.code).toMatch(/^[A-Z2-9]{6}$/)
    expect(roles.filter((role) => role === 'civilian')).toHaveLength(4)
    expect(roles.filter((role) => role === 'undercover')).toHaveLength(1)
    expect(roles.filter((role) => role === 'blank')).toHaveLength(1)
    expect(game.assignments.find((assignment) => assignment.role === 'civilian')?.word).toBe('牛奶')
    expect(game.assignments.find((assignment) => assignment.role === 'undercover')?.word).toBe('豆浆')
    expect(game.assignments.find((assignment) => assignment.role === 'blank')?.word).toBeNull()
  })

  it('rejects unsupported player counts', () => {
    expect(() => createOfflineGame(3, false, () => 0, fixedPair)).toThrow('4-10')
    expect(() => createOfflineGame(11, false, () => 0, fixedPair)).toThrow('4-10')
  })

  it('generates readable room codes without ambiguous characters', () => {
    expect(generateOfflineRoomCode(() => 0)).toBe('AAAAAA')
    expect(generateOfflineRoomCode(() => 0.99)).toBe('999999')
  })
})
