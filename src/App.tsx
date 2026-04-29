import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { HashRouter, Link, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import {
  BadgeCheck,
  Crown,
  Eye,
  LogIn,
  Minus,
  MessageCircle,
  Play,
  Plus,
  RefreshCw,
  Settings,
  Shuffle,
  Swords,
  Ticket,
  Users,
  Vote,
} from 'lucide-react'
import './App.css'
import { getAlivePlayers, getCurrentSpeaker, getRolePlan, winnerLabel } from './lib/gameRules'
import { createOfflineGame, type OfflineAssignment, type OfflineGame } from './lib/offlineGame'
import {
  createRoom,
  joinRoom,
  loadRoomSnapshot,
  nextSpeaker,
  resolveVote,
  setRoomStatus,
  startGame,
  submitBlankGuess,
  submitVote,
  subscribeToRoom,
  updateRoomSettings,
} from './lib/roomApi'
import { ensureAnonymousUser, isSupabaseConfigured } from './lib/supabase'
import type { Room, RoomPlayer, RoomSnapshot } from './lib/types'

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/offline" element={<OfflinePage />} />
        <Route path="/room/:code" element={<RoomPage />} />
      </Routes>
    </HashRouter>
  )
}

function HomePage() {
  const navigate = useNavigate()
  const [nickname, setNickname] = useState(localStorage.getItem('undercover.nickname') ?? '')
  const [roomCode, setRoomCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleCreateRoom() {
    await runAction(async () => {
      const cleanName = normalizeName(nickname)
      localStorage.setItem('undercover.nickname', cleanName)
      await ensureAnonymousUser()
      const room = await createRoom(cleanName)
      navigate(`/room/${room.code}`)
    })
  }

  async function handleJoinRoom() {
    await runAction(async () => {
      const cleanName = normalizeName(nickname)
      const cleanCode = roomCode.trim().toUpperCase()
      if (!/^[0-9A-Z]{6}$/.test(cleanCode)) throw new Error('请输入 6 位房号。')
      localStorage.setItem('undercover.nickname', cleanName)
      await ensureAnonymousUser()
      navigate(`/room/${cleanCode}`)
    })
  }

  async function runAction(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (actionError) {
      setError(getErrorMessage(actionError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div className="brand-row">
          <span className="brand-mark">卧</span>
          <span>谁是卧底</span>
        </div>
        <div className="hero-copy">
          <h1>开房发词，一局马上开始。</h1>
          <p>房主控场，玩家用 6 位房号加入，只看到自己的身份词。</p>
        </div>
        <StatusStrip />
      </section>

      <section className="control-panel">
        {!isSupabaseConfigured && <ConfigNotice />}
        <label className="field-label" htmlFor="nickname">
          昵称
        </label>
        <input
          id="nickname"
          maxLength={12}
          placeholder="比如：小周"
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
        />

        <div className="button-grid">
          <button className="primary-button" type="button" disabled={busy} onClick={handleCreateRoom}>
            <Play size={18} />
            创建房间
          </button>
          <Link className="secondary-link" to="/offline">
            <Shuffle size={18} />
            线下抽卡模式
          </Link>
        </div>

        <div className="join-row">
          <input
            aria-label="房号"
            maxLength={6}
            placeholder="输入 6 位房号"
            value={roomCode}
            onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
          />
          <button className="secondary-button" type="button" disabled={busy} onClick={handleJoinRoom}>
            <LogIn size={18} />
            加入
          </button>
        </div>

        {error && <p className="error-text">{error}</p>}
      </section>
    </main>
  )
}

function OfflinePage() {
  const [playerCount, setPlayerCount] = useState(6)
  const [enableBlank, setEnableBlank] = useState(true)
  const [game, setGame] = useState<OfflineGame | null>(null)
  const [activeSeat, setActiveSeat] = useState(1)
  const [revealed, setRevealed] = useState(false)
  const [drawnSeats, setDrawnSeats] = useState<number[]>([])

  const plan = getRolePlan(playerCount, enableBlank)
  const drawnSet = new Set(drawnSeats)
  const selectedAssignment = game?.assignments.find((assignment) => assignment.seat === activeSeat) ?? null
  const activeAssignment = selectedAssignment && !drawnSet.has(selectedAssignment.seat) ? selectedAssignment : null
  const remainingCount = game ? game.assignments.length - drawnSeats.length : playerCount

  function startOfflineGame() {
    const nextGame = createOfflineGame(playerCount, enableBlank)
    setGame(nextGame)
    setActiveSeat(1)
    setRevealed(false)
    setDrawnSeats([])
  }

  function resetOfflineGame() {
    setGame(null)
    setActiveSeat(1)
    setRevealed(false)
    setDrawnSeats([])
  }

  function finishCurrentCard() {
    if (!game || !activeAssignment) return
    const nextDrawnSeats = [...new Set([...drawnSeats, activeAssignment.seat])]
    const nextAssignment = game.assignments.find((assignment) => !nextDrawnSeats.includes(assignment.seat))

    setDrawnSeats(nextDrawnSeats)
    setRevealed(false)
    if (nextAssignment) setActiveSeat(nextAssignment.seat)
  }

  return (
    <main className="room-shell offline-shell">
      <header className="room-header">
        <Link className="brand-row compact-brand" to="/">
          <span className="brand-mark">卧</span>
          <span>线下抽卡</span>
        </Link>
        {game && (
          <div className="room-code">
            <Ticket size={16} />
            {game.code}
          </div>
        )}
        <StatusBadge tone={game ? 'focus' : 'safe'}>{game ? `剩余 ${remainingCount}` : `${playerCount} 人`}</StatusBadge>
      </header>

      {!game ? (
        <section className="room-card offline-setup">
          <TurnIndicator icon={<Shuffle size={22} />} tone="focus" label="线下模式" title="创建抽卡房间" />
          <h1>一台手机发身份。</h1>
          <p className="muted">适合面对面聚会：网站只负责开局、抽身份和发词，发言与投票在线下完成。</p>

          <div className="offline-controls">
            <div className="offline-stepper">
              <span>玩家人数</span>
              <div className="stepper-actions">
                <button
                  className="secondary-button icon-button"
                  type="button"
                  disabled={playerCount <= 4}
                  onClick={() => setPlayerCount((count) => Math.max(4, count - 1))}
                >
                  <Minus size={16} />
                </button>
                <strong>{playerCount}</strong>
                <button
                  className="secondary-button icon-button"
                  type="button"
                  disabled={playerCount >= 10}
                  onClick={() => setPlayerCount((count) => Math.min(10, count + 1))}
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>

            <label className="toggle-row offline-toggle">
              <input type="checkbox" checked={enableBlank} onChange={(event) => setEnableBlank(event.target.checked)} />
              <span>启用白板</span>
            </label>
          </div>

          <div className="rule-grid">
            <Metric label="平民" value={plan.civilians} />
            <Metric label="卧底" value={plan.undercovers} />
            <Metric label="白板" value={plan.blanks} />
          </div>

          <button className="primary-button full" type="button" onClick={startOfflineGame}>
            <Swords size={18} />
            创建线下房间
          </button>
        </section>
      ) : (
        <section className="room-card offline-game">
          <div className="offline-game-head">
            <TurnIndicator icon={<Ticket size={22} />} tone="focus" label={`房号 ${game.code}`} title="轮流抽卡" />
            <StatusBadge tone="safe">{drawnSeats.length}/{game.assignments.length} 已抽取</StatusBadge>
          </div>

          <div className="offline-card-grid">
            {game.assignments.map((assignment) => (
              <button
                className={`offline-seat-card ${assignment.seat === activeSeat ? 'current' : ''} ${
                  drawnSet.has(assignment.seat) ? 'drawn' : ''
                }`}
                key={assignment.seat}
                type="button"
                disabled={drawnSet.has(assignment.seat)}
                onClick={() => {
                  setActiveSeat(assignment.seat)
                  setRevealed(false)
                }}
              >
                <span>{assignment.seat}</span>
                <strong>{drawnSet.has(assignment.seat) ? '已抽' : '待抽'}</strong>
              </button>
            ))}
          </div>

          {activeAssignment ? (
            <OfflineCard assignment={activeAssignment} revealed={revealed} onReveal={() => setRevealed(true)} onDone={finishCurrentCard} />
          ) : (
            <div className="offline-complete">
              <BadgeCheck size={28} />
              <h2>身份已全部抽取</h2>
              <p className="muted">把手机放回桌面，开始第一轮描述。</p>
              <button className="primary-button full" type="button" onClick={startOfflineGame}>
                重新发牌
              </button>
            </div>
          )}

          <button className="ghost-button" type="button" onClick={resetOfflineGame}>
            返回设置
          </button>
        </section>
      )}
    </main>
  )
}

function OfflineCard({
  assignment,
  revealed,
  onReveal,
  onDone,
}: {
  assignment: OfflineAssignment
  revealed: boolean
  onReveal: () => void
  onDone: () => void
}) {
  const roleText = assignment.role === 'undercover' ? '卧底' : assignment.role === 'blank' ? '白板' : '平民'
  const wordText = assignment.role === 'blank' ? '你没有词，请靠听描述伪装。' : assignment.word

  return (
    <div className={`offline-draw-card ${revealed ? 'revealed' : ''}`}>
      {!revealed ? (
        <>
          <span>第 {assignment.seat} 位玩家</span>
          <strong>身份牌未翻开</strong>
          <p>确认只有自己能看到屏幕后再抽取。</p>
          <button className="primary-button full" type="button" onClick={onReveal}>
            <Eye size={18} />
            抽取身份
          </button>
        </>
      ) : (
        <>
          <span>{roleText}</span>
          <strong>{wordText}</strong>
          <p>记住身份词后，点击隐藏并把手机交给下一位。</p>
          <button className="primary-button full" type="button" onClick={onDone}>
            我已记住，隐藏
          </button>
        </>
      )}
    </div>
  )
}

function RoomPage() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const [userId, setUserId] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null)
  const [nickname, setNickname] = useState(localStorage.getItem('undercover.nickname') ?? '')
  const [joinRequired, setJoinRequired] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const myPlayer = useMemo(
    () => snapshot?.players.find((player) => player.user_id === userId) ?? null,
    [snapshot?.players, userId],
  )
  const isHost = Boolean(myPlayer?.is_host)

  async function refresh() {
    if (!code) return
    const nextSnapshot = await loadRoomSnapshot(code)
    setSnapshot(nextSnapshot)
    if (!nextSnapshot) return
    const currentUser = await ensureAnonymousUser()
    const currentPlayer = nextSnapshot.players.find((player) => player.user_id === currentUser.id)
    setJoinRequired(!currentPlayer)
  }

  useEffect(() => {
    if (!isSupabaseConfigured) return
    let cancelled = false
    async function boot() {
      try {
        setError('')
        const user = await ensureAnonymousUser()
        if (cancelled) return
        setUserId(user.id)
        const nextSnapshot = await loadRoomSnapshot(code)
        if (cancelled) return
        setSnapshot(nextSnapshot)
        setJoinRequired(Boolean(nextSnapshot && !nextSnapshot.players.some((player) => player.user_id === user.id)))
      } catch (bootError) {
        setError(getErrorMessage(bootError))
      }
    }
    void boot()
    return () => {
      cancelled = true
    }
  }, [code])

  useEffect(() => {
    if (!snapshot?.room.id || !isSupabaseConfigured) return
    return subscribeToRoom(snapshot.room.id, () => {
      void refresh()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot?.room.id, code])

  async function handleJoin() {
    await runAction(async () => {
      if (!snapshot?.room) throw new Error('房间不存在。')
      const cleanName = normalizeName(nickname)
      localStorage.setItem('undercover.nickname', cleanName)
      await joinRoom(snapshot.room.id, cleanName)
      await refresh()
    })
  }

  async function runAction(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (actionError) {
      setError(getErrorMessage(actionError))
    } finally {
      setBusy(false)
    }
  }

  if (!isSupabaseConfigured) {
    return (
      <main className="app-shell single">
        <ConfigNotice />
      </main>
    )
  }

  if (!snapshot && !error) {
    return <LoadingShell label="正在进入房间" />
  }

  if (!snapshot) {
    return (
      <main className="app-shell single">
        <section className="control-panel">
          <h1>找不到房间</h1>
          <p className="muted">房号 {code.toUpperCase()} 不存在或已过期。</p>
          <Link className="secondary-link" to="/">
            回到首页
          </Link>
          {error && <p className="error-text">{error}</p>}
        </section>
      </main>
    )
  }

  return (
    <main className="room-shell">
      <RoomHeader room={snapshot.room} players={snapshot.players} />

      {joinRequired ? (
        <section className="control-panel room-card">
          <h2>加入房间 {snapshot.room.code}</h2>
          <label className="field-label" htmlFor="join-name">
            昵称
          </label>
          <input
            id="join-name"
            maxLength={12}
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
          />
          <button className="primary-button" type="button" disabled={busy} onClick={handleJoin}>
            <LogIn size={18} />
            加入游戏
          </button>
        </section>
      ) : (
        <GameRoom
          snapshot={snapshot}
          myPlayer={myPlayer}
          isHost={isHost}
          busy={busy}
          onAction={runAction}
          onRefresh={refresh}
        />
      )}

      <button className="ghost-button" type="button" onClick={() => navigate('/')}>
        返回首页
      </button>
      {error && <p className="error-text floating-error">{error}</p>}
    </main>
  )
}

function GameRoom({
  snapshot,
  myPlayer,
  isHost,
  busy,
  onAction,
  onRefresh,
}: {
  snapshot: RoomSnapshot
  myPlayer: RoomPlayer | null
  isHost: boolean
  busy: boolean
  onAction: (action: () => Promise<void>) => Promise<void>
  onRefresh: () => Promise<void>
}) {
  const { room, players, assignment, votes } = snapshot
  const alivePlayers = getAlivePlayers(players)
  const currentSpeaker = getCurrentSpeaker(players, room.speaker_index)
  const myVote = votes.find((vote) => vote.voter_player_id === myPlayer?.id)
  const votedPlayerIds = new Set(votes.map((vote) => vote.voter_player_id))
  const voteCounts = votes.reduce<Record<string, number>>((counts, vote) => {
    counts[vote.target_player_id] = (counts[vote.target_player_id] ?? 0) + 1
    return counts
  }, {})
  const canVote = room.status === 'voting' && myPlayer && !myPlayer.is_eliminated
  const [blankGuess, setBlankGuess] = useState('')

  return (
    <div className="room-grid">
      <section className="room-card">
        {room.status === 'lobby' && (
          <LobbyPanel room={room} players={players} isHost={isHost} busy={busy} onAction={onAction} />
        )}
        {room.status === 'reveal' && (
          <RevealPanel
            assignment={assignment}
            isHost={isHost}
            busy={busy}
            onStartSpeaking={() => onAction(() => setRoomStatus(room.id, 'speaking'))}
          />
        )}
        {room.status === 'speaking' && (
          <SpeakingPanel
            room={room}
            currentSpeaker={currentSpeaker}
            isHost={isHost}
            busy={busy}
            onNext={() => onAction(() => nextSpeaker(room, alivePlayers.length))}
            onVote={() => onAction(() => setRoomStatus(room.id, 'voting'))}
          />
        )}
        {room.status === 'voting' && (
          <VotingPanel
            players={alivePlayers}
            myVote={myVote?.target_player_id ?? null}
            canVote={Boolean(canVote)}
            busy={busy}
            isHost={isHost}
            voteCount={votes.length}
            voteCounts={voteCounts}
            onVote={(targetId) => onAction(() => submitVote(room.id, targetId))}
            onResolve={() => onAction(() => resolveVote(room.id))}
          />
        )}
        {room.status === 'blank_guess' && (
          <section className="phase-panel">
            <TurnIndicator icon={<Ticket size={22} />} tone="danger" label={`第 ${room.round} 轮`} title="白板猜词" />
            <h2>白板猜词</h2>
            <ChatBubble tone="system" speaker="系统提示">
              白板玩家如果猜中平民词，将直接独赢。
            </ChatBubble>
            {assignment?.role === 'blank' ? (
              <div className="join-row">
                <input value={blankGuess} onChange={(event) => setBlankGuess(event.target.value)} placeholder="输入平民词" />
                <button
                  className="primary-button compact"
                  type="button"
                  disabled={busy || !blankGuess.trim()}
                  onClick={() => onAction(() => submitBlankGuess(room.id, blankGuess.trim()))}
                >
                  提交
                </button>
              </div>
            ) : (
              <p className="hint">等待白板玩家提交猜测。</p>
            )}
          </section>
        )}
        {room.status === 'finished' && (
          <section className="phase-panel">
            <TurnIndicator icon={<BadgeCheck size={22} />} tone="safe" label="结算" title={winnerLabel(room.winner)} />
            <h2>{winnerLabel(room.winner)}</h2>
            <ChatBubble tone="system" speaker="系统提示">
              {room.result_message ?? '本局结束。'}
            </ChatBubble>
            {isHost && (
              <button className="primary-button" type="button" disabled={busy} onClick={() => onAction(() => startGame(room.id))}>
                <RefreshCw size={18} />
                再来一局
              </button>
            )}
          </section>
        )}
      </section>

      <aside className="room-card side-panel">
        <div className="panel-title">
          <Users size={18} />
          <span>玩家列表</span>
          <StatusBadge tone="safe">{alivePlayers.length} 存活</StatusBadge>
        </div>
        <div className="player-list">
          {players.map((player) => (
            <PlayerCard
              key={player.id}
              player={player}
              isCurrent={player.id === currentSpeaker?.id && room.status === 'speaking'}
              isMe={player.id === myPlayer?.id}
              hasVoted={votedPlayerIds.has(player.id)}
              voteCount={voteCounts[player.id] ?? 0}
            />
          ))}
        </div>
        <button className="secondary-button full" type="button" onClick={() => void onRefresh()}>
          <RefreshCw size={16} />
          手动同步
        </button>
      </aside>
    </div>
  )
}

function LobbyPanel({
  room,
  players,
  isHost,
  busy,
  onAction,
}: {
  room: Room
  players: RoomPlayer[]
  isHost: boolean
  busy: boolean
  onAction: (action: () => Promise<void>) => Promise<void>
}) {
  const plan = getRolePlan(players.length, room.settings.enableBlank)
  const canStart = isHost && players.length >= 4 && players.length <= 10

  return (
    <section className="phase-panel">
      <TurnIndicator icon={<Users size={22} />} tone="safe" label="房间大厅" title="等待玩家" />
      <h2>等待玩家加入</h2>
      <ChatBubble tone="system" speaker="系统提示">
        至少 4 人开局。7 人及以上自动配置 2 个卧底。
      </ChatBubble>
      <div className="rule-grid">
        <Metric label="平民" value={plan.civilians} />
        <Metric label="卧底" value={plan.undercovers} />
        <Metric label="白板" value={plan.blanks} />
      </div>
      {isHost ? (
        <>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={room.settings.enableBlank}
              onChange={(event) =>
                onAction(() =>
                  updateRoomSettings(room.id, {
                    enableBlank: event.target.checked,
                    undercoverMode: 'auto',
                  }),
                )
              }
            />
            <span>启用白板</span>
          </label>
          <button className="primary-button" type="button" disabled={busy || !canStart} onClick={() => onAction(() => startGame(room.id))}>
            <Swords size={18} />
            开始游戏
          </button>
          {!canStart && <p className="hint">需要 4-10 人才能开始。</p>}
        </>
      ) : (
        <p className="hint">等待房主开始游戏。</p>
      )}
    </section>
  )
}

function RevealPanel({
  assignment,
  isHost,
  busy,
  onStartSpeaking,
}: {
  assignment: RoomSnapshot['assignment']
  isHost: boolean
  busy: boolean
  onStartSpeaking: () => void
}) {
  const roleText = assignment?.role === 'undercover' ? '卧底' : assignment?.role === 'blank' ? '白板' : '平民'
  const wordText = assignment?.role === 'blank' ? '你没有词，请靠听描述伪装。' : assignment?.word

  return (
    <section className="phase-panel">
      <TurnIndicator icon={<Eye size={22} />} tone="focus" label="身份确认" title="只给你看" />
      <h2>查看你的身份词</h2>
      <div className="word-card">
        <span>{roleText}</span>
        <strong>{wordText ?? '等待发词'}</strong>
      </div>
      {isHost ? (
        <button className="primary-button" type="button" disabled={busy} onClick={onStartSpeaking}>
          <MessageCircle size={18} />
          全员已看，开始发言
        </button>
      ) : (
        <p className="hint">看完后把手机交给下一位，等待房主开始发言。</p>
      )}
    </section>
  )
}

function SpeakingPanel({
  room,
  currentSpeaker,
  isHost,
  busy,
  onNext,
  onVote,
}: {
  room: Room
  currentSpeaker: RoomPlayer | null
  isHost: boolean
  busy: boolean
  onNext: () => void
  onVote: () => void
}) {
  return (
    <section className="phase-panel">
      <TurnIndicator icon={<MessageCircle size={22} />} tone="focus" label={`第 ${room.round} 轮`} title="正在发言" />
      <h2>轮流描述</h2>
      <div className="speaker-card">
        <span>当前发言</span>
        <strong>{currentSpeaker?.nickname ?? '等待玩家'}</strong>
      </div>
      <div className="chat-stack">
        <ChatBubble tone="active" speaker={currentSpeaker?.nickname ?? '当前玩家'}>
          请用一句话描述你的词，别直接说出答案。
        </ChatBubble>
        <ChatBubble tone="system" speaker="系统提示">
          观察措辞、犹豫和过度解释，线索往往藏在细节里。
        </ChatBubble>
      </div>
      {isHost ? (
        <div className="button-grid two">
          <button className="secondary-button" type="button" disabled={busy} onClick={onNext}>
            下一位
          </button>
          <button className="primary-button" type="button" disabled={busy} onClick={onVote}>
            <Vote size={18} />
            进入投票
          </button>
        </div>
      ) : (
        <p className="hint">一句话描述你的词，不能直接说出词本身。</p>
      )}
    </section>
  )
}

function VotingPanel({
  players,
  myVote,
  canVote,
  busy,
  isHost,
  voteCount,
  voteCounts,
  onVote,
  onResolve,
}: {
  players: RoomPlayer[]
  myVote: string | null
  canVote: boolean
  busy: boolean
  isHost: boolean
  voteCount: number
  voteCounts: Record<string, number>
  onVote: (targetId: string) => void
  onResolve: () => void
}) {
  return (
    <section className="phase-panel">
      <TurnIndicator icon={<Vote size={22} />} tone="danger" label="投票阶段" title="锁定嫌疑人" />
      <h2>投出你怀疑的人</h2>
      <div className="vote-list">
        {players.map((player) => (
          <VoteButton
            key={player.id}
            selected={myVote === player.id}
            disabled={!canVote || busy}
            onClick={() => onVote(player.id)}
            voteCount={voteCounts[player.id] ?? 0}
          >
            {player.nickname}
          </VoteButton>
        ))}
      </div>
      <p className="hint">已投票 {voteCount} / {players.length}</p>
      {isHost && (
        <button className="primary-button" type="button" disabled={busy || voteCount < players.length} onClick={onResolve}>
          结算投票
        </button>
      )}
    </section>
  )
}

function PlayerCard({
  player,
  isCurrent,
  isMe,
  hasVoted,
  voteCount,
}: {
  player: RoomPlayer
  isCurrent: boolean
  isMe: boolean
  hasVoted: boolean
  voteCount: number
}) {
  return (
    <div className={`player-card ${isCurrent ? 'current' : ''} ${player.is_eliminated ? 'eliminated' : ''}`}>
      <div className="player-avatar">{player.nickname.slice(0, 1)}</div>
      <div className="player-meta">
        <div className="player-name-row">
          <span className="player-name">{player.nickname}</span>
          {player.is_host && <Crown size={14} className="host-icon" />}
        </div>
        <div className="player-status-row">
          <StatusBadge tone={player.is_eliminated ? 'danger' : isCurrent ? 'focus' : 'safe'}>
            {player.is_eliminated ? '已淘汰' : isCurrent ? '发言中' : '存活'}
          </StatusBadge>
          {hasVoted && <StatusBadge tone="focus">已投票</StatusBadge>}
        </div>
      </div>
      <div className="player-side-tags">
        {isMe && <span className="mini-tag">我</span>}
        {voteCount > 0 && <span className="vote-count">{voteCount}</span>}
      </div>
    </div>
  )
}

function ChatBubble({
  speaker,
  tone,
  children,
}: {
  speaker: string
  tone: 'active' | 'system'
  children: ReactNode
}) {
  return (
    <div className={`chat-bubble ${tone}`}>
      <span>{speaker}</span>
      <p>{children}</p>
    </div>
  )
}

function VoteButton({
  selected,
  disabled,
  voteCount,
  onClick,
  children,
}: {
  selected: boolean
  disabled: boolean
  voteCount: number
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button className={`vote-button ${selected ? 'selected' : ''}`} type="button" disabled={disabled} onClick={onClick}>
      <span>{children}</span>
      <span className="vote-button-meta">
        {voteCount > 0 && <span>{voteCount}票</span>}
        {selected && <BadgeCheck size={16} />}
      </span>
    </button>
  )
}

function StatusBadge({ tone, children }: { tone: 'safe' | 'focus' | 'danger'; children: ReactNode }) {
  return <span className={`status-badge ${tone}`}>{children}</span>
}

function TurnIndicator({
  icon,
  tone,
  label,
  title,
}: {
  icon: ReactNode
  tone: 'safe' | 'focus' | 'danger'
  label: string
  title: string
}) {
  return (
    <div className={`turn-indicator ${tone}`}>
      <span className="turn-icon">{icon}</span>
      <span className="turn-copy">
        <small>{label}</small>
        <strong>{title}</strong>
      </span>
    </div>
  )
}

function RoomHeader({ room, players }: { room: Room; players: RoomPlayer[] }) {
  const aliveCount = players.filter((player) => !player.is_eliminated).length

  return (
    <header className="room-header">
      <Link className="brand-row compact-brand" to="/">
        <span className="brand-mark">卧</span>
        <span>谁是卧底</span>
      </Link>
      <div className="room-code">
        <Ticket size={16} />
        {room.code}
      </div>
      <StatusBadge tone={room.status === 'voting' ? 'danger' : room.status === 'speaking' ? 'focus' : 'safe'}>
        <Settings size={14} />
        {statusLabel(room.status)} · {aliveCount}/{players.length}
      </StatusBadge>
    </header>
  )
}

function StatusStrip() {
  return (
    <div className="status-strip">
      <span>6 位房号</span>
      <span>匿名加入</span>
      <span>实时同步</span>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}

function ConfigNotice() {
  return (
    <section className="config-notice">
      <h2>需要配置 Supabase</h2>
      <p>复制 `.env.example` 为 `.env.local`，填入项目 URL 和 anon key，然后执行 SQL 迁移。</p>
    </section>
  )
}

function LoadingShell({ label }: { label: string }) {
  return (
    <main className="app-shell single">
      <section className="control-panel loading-panel">
        <RefreshCw className="spin" size={24} />
        <p>{label}</p>
      </section>
    </main>
  )
}

function statusLabel(status: Room['status']) {
  const labels: Record<Room['status'], string> = {
    lobby: '大厅',
    reveal: '发词',
    speaking: '发言',
    voting: '投票',
    elimination: '淘汰',
    blank_guess: '白板猜词',
    finished: '结算',
  }
  return labels[status]
}

function normalizeName(value: string) {
  const name = value.trim()
  if (!name) throw new Error('请先输入昵称。')
  return name.slice(0, 12)
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '操作失败，请稍后再试。'
}

export default App
