import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Drawer from '@/components/Drawer'
import PersonaAvatar from '@/components/PersonaAvatar'
import SceneDirectorPanel from '@/components/SceneDirectorPanel'
import SceneParticipants from '@/components/SceneParticipants'
import TypeTag from '@/components/TypeTag'
import SourceStatus from '@/components/SourceStatus'
import { sourceName } from '@/utils/sourceUrl'
import { suggestedChoices, type ChoiceTopic } from '@/data/chatChoices'
import { topicsForSpot } from '@/data/suzhouQuestionBank'
import { sceneVisual } from '@/data/sceneVisuals'
import { useJourney } from '@/engine/journeyStore'
import type { ChatMessage, SceneDirection, SceneStreamEvent } from '@/types'
import { cn } from '@/utils/cn'

const CLUE_NOTICE_MARK = '\n（已发放演示剧情线索'

/** Keep server-awarded clue notices separate from character dialogue. */
function splitClueNotice(text: string): [string, string | null] {
  const index = text.indexOf(CLUE_NOTICE_MARK)
  return index < 0 ? [text, null] : [text.slice(0, index), text.slice(index + 1).replace('已发放演示剧情线索', '已收集剧情线索')]
}

export default function ChatPage() {
  const { npcId } = useParams<{ npcId: string }>()
  const npcs = useJourney((s) => s.npcs)
  const spots = useJourney((s) => s.spots)
  const tasks = useJourney((s) => s.tasks)
  const busy = useJourney((s) => s.busy)
  const journeyComplete = useJourney((s) => s.state === 'COMPLETED')
  const npc = npcs.find((item) => item.id === npcId)

  const allMessages = useJourney((s) => s.messages)
  const messages = npcId ? (allMessages[npcId] ?? []) : []
  const sendChat = useJourney((s) => s.sendChat)
  const sendSceneChat = useJourney((s) => s.sendSceneChat)
  const savedDirection = useJourney((s) => (npcId ? s.sceneDirections[npcId] : undefined))
  const reportIssue = useJourney((s) => s.reportIssue)
  const inventory = useJourney((s) => s.inventory)
  const taskStates = useJourney((s) => s.taskStates)
  const activities = useJourney((s) => s.activities)
  const difficulty = useJourney((s) => s.difficulty)
  const spotStatus = useJourney((s) => s.spotStatus)

  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [multiAgent, setMultiAgent] = useState(true)
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[] | null>(null)
  const [sceneOpen, setSceneOpen] = useState(false)
  const [liveMessages, setLiveMessages] = useState<ChatMessage[]>([])
  const [liveDirection, setLiveDirection] = useState<SceneDirection | null>(null)
  const [phase, setPhase] = useState('')
  const [evidenceSelection, setEvidenceSelection] = useState<{ messageId: string; id: string } | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [contextOpen, setContextOpen] = useState(false)
  const [reportingId, setReportingId] = useState<string | null>(null)
  const [reportingNpcId, setReportingNpcId] = useState<string | null>(null)
  const [reportReason, setReportReason] = useState('')
  const [reportError, setReportError] = useState<string | null>(null)
  const [reportSubmitting, setReportSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [choiceOffset, setChoiceOffset] = useState(0)
  const [choiceTopic, setChoiceTopic] = useState<ChoiceTopic>('全部主题')
  const listRef = useRef<HTMLDivElement>(null)
  const reportRequestRef = useRef(0)
  const turnRequestRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)

  const currentSpotId = useJourney((s) => s.currentSpotId)
  const roleId = useJourney((s) => s.roleId)
  const roleName = useJourney((s) => s.roles.find((r) => r.id === s.roleId)?.name ?? '你')
  const spot =
    spots.find((item) => item.id === currentSpotId && item.npcId === npcId) ??
    spots.find((item) => item.id === npc?.spotId)
  const scene = sceneVisual(spot?.id)
  const pendingMessages =
    liveDirection && savedDirection?.turnId === liveDirection.turnId ? [] : liveMessages
  const displayedMessages = [
    ...messages,
    ...pendingMessages.filter((message) => !messages.some((saved) => saved.id === message.id)),
  ]
  const direction = liveDirection ?? savedDirection ?? null
  const encounteredIds = new Set(
    Object.entries(allMessages).flatMap(([threadId, thread]) =>
      thread
        .filter((message) => message.from === 'npc')
        .map((message) => message.npcId ?? threadId),
    ),
  )
  const participants = npcs.filter((item) => item.id === npcId || encounteredIds.has(item.id))
  const participantIds = participants
    .filter(
      (item) =>
        item.id === npcId ||
        selectedParticipantIds === null ||
        selectedParticipantIds.includes(item.id),
    )
    .map((item) => item.id)
  const evidence = displayedMessages
    .find((message) => message.id === evidenceSelection?.messageId)
    ?.evidence?.find((item) => item.id === evidenceSelection?.id)
  const asked = messages.filter((message) => message.from === 'user').map((message) => message.text)
  const availableTopics = topicsForSpot(spot?.id)
  const effectiveTopic = choiceTopic === '全部主题' || availableTopics.includes(choiceTopic) ? choiceTopic : '全部主题'
  const choices = npc && !journeyComplete
    ? suggestedChoices(npc.id, {
        spotId: spot?.id ?? currentSpotId,
        roleId,
        turn: asked.length,
        offset: choiceOffset,
        asked,
        topic: effectiveTopic,
        inventory, difficulty,
        completedTaskIds: Object.entries(taskStates).filter(([, state]) => state.status === 'completed').map(([id]) => id),
      })
    : []
  const activityQuestions = journeyComplete ? [] : activities.filter((a) => a.spotId === currentSpotId && a.npcId === npcId && a.hintQuestion && !a.npcHintObtained && a.progress.status !== 'completed').map((a) => a.hintQuestion!).filter((text) => !asked.includes(text))
  const hasChoices = choices.length > 0

  useEffect(() => {
    setThinking(false)
    setStopping(false)
    setLiveMessages([])
    setLiveDirection(null)
    setSelectedParticipantIds(null)
    setChoiceTopic('全部主题')
    setChoiceOffset(0)
    setError(null)
    return () => {
      turnRequestRef.current += 1
      abortRef.current?.abort()
    }
  }, [npcId])

  useEffect(() => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: reduceMotion ? 'auto' : 'smooth',
    })
  }, [displayedMessages.length, thinking, phase])

  if (!npc) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="font-serif text-2xl font-bold text-ink">NPC 不存在</h1>
        <Link to="/map" className="mt-4 inline-block text-cinnabar underline">
          返回路线地图
        </Link>
      </div>
    )
  }

  const send = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || thinking || busy || journeyComplete) return
    const request = ++turnRequestRef.current
    const controller = new AbortController()
    abortRef.current = controller
    setThinking(true)
    setStopping(false)
    setError(null)
    setLiveMessages([])
    setLiveDirection(null)
    setPhase(multiAgent ? '导演正在阅读对话，安排这一幕。' : '正在检索文化资料…')
    try {
      if (multiAgent) {
        const pendingId = `pending-${request}`
        setLiveMessages([{ id: pendingId, from: 'user', text: trimmed, at: Date.now() }])
        const onEvent = (event: SceneStreamEvent) => {
          if (request !== turnRequestRef.current || controller.signal.aborted) return
          if (event.type === 'status') {
            const { phase: nextPhase, speaker_name: speakerName, message } = event.data
            setPhase(
              nextPhase === 'directing'
                ? '导演正在阅读对话，安排这一幕。'
                : nextPhase === 'narrating'
                  ? '旁白正在衔接场景。'
                  : nextPhase === 'speaking'
                    ? `${speakerName ?? '角色'}正在组织回应。`
                    : message || '正在保存本轮剧情…',
            )
          } else if (event.type === 'director') {
            setLiveDirection(event.data)
          } else if (event.type === 'message') {
            setLiveMessages((current) => [
              ...current.filter(
                (item) =>
                  item.id !== event.data.id &&
                  !(event.data.from === 'user' && item.id === pendingId),
              ),
              event.data,
            ])
          }
        }
        await sendSceneChat(npc.id, trimmed, participantIds, onEvent, controller.signal)
      } else {
        await sendChat(npc.id, trimmed)
      }
      if (request === turnRequestRef.current) setInput('')
    } catch (err) {
      if (request === turnRequestRef.current) {
        setError(
          controller.signal.aborted
            ? '本轮已停止，已同步保存的对话。你可以修改问题后重试。'
            : err instanceof Error
              ? err.message
              : '对话请求失败，请重试。',
        )
        setInput(trimmed)
      }
    } finally {
      if (request === turnRequestRef.current) {
        setThinking(false)
        setStopping(false)
        setLiveMessages([])
        setLiveDirection(null)
        setPhase('')
        abortRef.current = null
      }
    }
  }

  const spotTasks = tasks.filter((task) => task.spotId === spot?.id)

  const participantsPanel = (
    <SceneParticipants
      npcs={participants}
      anchorId={npc.id}
      selectedIds={participantIds}
      disabled={thinking || busy || journeyComplete}
      onChange={(id, selected) =>
        setSelectedParticipantIds(
          selected ? [...participantIds, id] : participantIds.filter((item) => item !== id),
        )
      }
    />
  )

  const directorPanel = !journeyComplete ? (
    <SceneDirectorPanel
      direction={direction}
      npcs={npcs}
      running={thinking || busy}
      onContinue={() => send('请根据刚才的对话和当前旅程进度继续剧情，安排合适的角色接话。')}
    />
  ) : <p className="text-sm leading-7 text-bluegray">旅程已结束，当前对话与证据仅供只读回顾。</p>

  const closeReport = () => {
    reportRequestRef.current += 1
    setReportingId(null)
    setReportingNpcId(null)
    setReportError(null)
    setReportSubmitting(false)
  }

  const profilePanel = (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <PersonaAvatar id={npc.id} name={npc.name} size="xl" />
        <div className="min-w-0">
          <p className="text-lg font-semibold text-ink">{npc.name}</p>
          <p className="mt-1 text-sm text-bluegray">{npc.title}</p>
          {spot ? <p className="mt-2 text-xs text-bluegray">此刻在 · {spot.name}</p> : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {npc.personality.map((p) => (
          <span key={p} className="chip text-ink-soft">
            {p}
          </span>
        ))}
        <span className="chip text-bluegray">虚构角色</span>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-ink">知识边界</h3>
        <p className="mt-2 text-sm leading-7 text-ink-soft">{npc.knowledgeScope}</p>
      </div>
      <p className="border-t border-line pt-4 text-xs leading-6 text-bluegray">
        {npc.name}只回答自己领域内、且有证据支撑的问题；越界或证据不足时会明确拒答。
      </p>
      {multiAgent ? <div className="border-t border-line pt-5">{participantsPanel}</div> : null}
    </div>
  )

  const contextPanel = (
    <div className="space-y-6">
      {spot ? (
        <div>
          <h3 className="text-sm font-semibold text-ink">当前位置</h3>
          <Link
            to={`/spot/${spot.id}`}
            className="mt-1 flex min-h-11 items-center text-sm text-cinnabar underline underline-offset-4"
          >
            {spot.name}（{spotStatus[spot.id] === 'completed' ? '已完成' : '进行中'}）
          </Link>
        </div>
      ) : null}
      <div>
        <h3 className="text-sm font-semibold text-ink">这里的任务</h3>
        <ul className="mt-2 divide-y divide-line">
          {spotTasks.map((t) =>
            t ? (
              <li key={t.id}>
                <Link
                  to={`/task/${t.id}`}
                  className="flex min-h-14 items-center justify-between gap-3 py-3 text-sm transition-colors hover:text-cinnabar"
                >
                  <span className="text-ink">{t.title}</span>
                  <span
                    className={cn(
                      'text-xs',
                      taskStates[t.id]?.status === 'completed' ? 'text-inkgreen' : 'text-bluegray',
                    )}
                  >
                    {taskStates[t.id]?.status === 'completed' ? '✓' : '未完成'}
                  </span>
                </Link>
              </li>
            ) : null,
          )}
        </ul>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-ink">背包里的线索</h3>
        <p className="mt-1.5 text-sm text-bluegray">
          {inventory.length} 件 ·{' '}
          <Link
            to="/clues"
            className="inline-flex min-h-11 items-center text-cinnabar underline underline-offset-4"
          >
            查看背包
          </Link>
        </p>
      </div>
    </div>
  )

  return (
    <div className="chat-page mx-auto max-w-[1440px] px-4 py-5 sm:px-6 lg:py-8">
      <div className="grid gap-6 xl:grid-cols-[190px_minmax(0,1fr)_220px] 2xl:gap-8">
        {/* 左：NPC 档案（桌面端） */}
        <aside className="hidden self-start py-5 xl:block">{profilePanel}</aside>

        {/* 中：对话区 */}
        <section className="chat-panel flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-surface">
          <header className="relative z-20 flex shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-4 py-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <PersonaAvatar id={npc.id} name={npc.name} />
              <div className="min-w-0">
                <h1 className="truncate font-serif text-xl font-bold text-ink">与{npc.name}对话</h1>
                <p className="mt-1 truncate text-xs text-bluegray">
                  {npc.title}
                  {spot ? ` · ${spot.name}` : ''}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 gap-1 xl:hidden">
              <button
                type="button"
                className="btn-ghost min-h-11 px-2 text-xs"
                onClick={() => setProfileOpen(true)}
              >
                档案
              </button>
              <button
                type="button"
                className="btn-ghost min-h-11 px-2 text-xs"
                onClick={() => setContextOpen(true)}
              >
                任务
              </button>
            </div>
          </header>

          <div className="chat-mode-controls flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2 sm:px-5">
            <div
              className="flex gap-1 rounded-md bg-paper-deep p-1"
              role="group"
              aria-label="对话模式"
            >
              {[
                { enabled: true, label: '多人同场' },
                { enabled: false, label: '单人对话' },
              ].map((mode) => (
                <button
                  key={mode.label}
                  type="button"
                  aria-pressed={multiAgent === mode.enabled}
                  disabled={thinking || busy || journeyComplete}
                  onClick={() => setMultiAgent(mode.enabled)}
                  className={cn(
                    'min-h-11 rounded px-3 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-cinnabar disabled:opacity-50',
                    multiAgent === mode.enabled
                      ? 'bg-surface font-semibold text-inkgreen'
                      : 'text-bluegray hover:text-ink',
                  )}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            {multiAgent ? (
              <button
                type="button"
                onClick={() => setSceneOpen(true)}
                className="min-h-11 text-xs text-inkgreen underline underline-offset-4 xl:hidden"
                aria-label={`查看导演调度与${participantIds.length}位同场角色`}
              >
                导演 · {participantIds.length} 位角色
              </button>
            ) : null}
          </div>
          {multiAgent ? (
            <div className="chat-beat flex shrink-0 items-start gap-2 border-b border-line bg-paper-deep px-4 py-2.5 text-xs leading-5 sm:px-6">
              <span className="shrink-0 font-medium text-inkgreen">当前节拍</span>
              <span className="line-clamp-2 min-w-0 break-words text-ink-soft">
                {direction?.beat ?? '从你的问题开始，由导演安排角色回应。'}
              </span>
            </div>
          ) : null}

          <div className="chat-canvas relative min-h-0 flex-1 overflow-hidden">
            {scene ? (
              <div
                className="chat-scene-image absolute inset-0"
                style={{
                  backgroundImage: `url(${scene.src})`,
                  backgroundPosition: scene.position,
                }}
                role="img"
                aria-label={scene.alt}
              />
            ) : null}
            <div className="chat-scene-veil absolute inset-0" aria-hidden />
            <div
              ref={listRef}
              className="relative z-10 h-full space-y-6 overflow-y-auto overscroll-contain px-3 py-5 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cinnabar sm:px-6"
              role="log"
              aria-label="对话消息"
              aria-live="polite"
              tabIndex={0}
            >
              {spot ? (
                <div className="flex justify-center" aria-hidden>
                  <span className="rounded-full bg-surface px-3 py-1 text-xs text-bluegray">
                    {spot.name} · 艺术化示意
                  </span>
                </div>
              ) : null}
              <div className="anim-fade-rise flex items-end gap-2.5">
                <PersonaAvatar id={npc.id} name={npc.name} />
                <div className="max-w-[85%] rounded-xl rounded-bl-sm bg-surface px-4 py-3 text-sm leading-7 text-ink">
                  {npc.greeting}
                </div>
              </div>

              {displayedMessages.map((m) => {
                if (m.from === 'system') {
                  return (
                    <div key={m.id} className="anim-fade-rise flex justify-center">
                      <span className="max-w-[90%] rounded-md bg-surface px-3 py-2 text-center text-xs leading-6 text-ink-soft">
                        {m.text}
                      </span>
                    </div>
                  )
                }
                if (m.from === 'narrator' || m.agentRole === 'narrator') {
                  return (
                    <article
                      key={m.id}
                      className="mx-auto max-w-prose rounded-lg bg-surface/95 px-4 py-4 sm:px-5"
                    >
                      <p className="text-xs font-semibold text-inkgreen">剧情旁白 · 虚构</p>
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-8 text-ink-soft">
                        {m.text}
                      </p>
                      {thinking && pendingMessages.some((item) => item.id === m.id) ? (
                        <p className="mt-2 text-xs text-bluegray">本轮进行中 · 保存后加入历史</p>
                      ) : null}
                    </article>
                  )
                }
                const isUser = m.from === 'user'
                const speakerId = m.npcId ?? npc.id
                const speakerName =
                  m.speakerName ?? npcs.find((item) => item.id === speakerId)?.name ?? npc.name
                const isTemporary =
                  !messages.some((item) => item.id === m.id) &&
                  pendingMessages.some((item) => item.id === m.id)
                const [body, notice] = splitClueNotice(m.text)
                return (
                  <div
                    key={m.id}
                    className={cn(
                      'anim-fade-rise flex items-end gap-2.5',
                      isUser ? 'justify-end' : 'justify-start',
                    )}
                  >
                    {!isUser ? <PersonaAvatar id={speakerId} name={speakerName} /> : null}
                    <div
                      className={cn(
                        'min-w-0 max-w-[85%] break-words rounded-xl px-4 py-3 text-sm leading-7',
                        isUser
                          ? 'rounded-br-sm bg-inkgreen text-white'
                          : 'rounded-bl-sm bg-surface text-ink',
                      )}
                    >
                      {!isUser ? (
                        <p className="mb-1 text-xs font-semibold text-inkgreen">
                          {speakerName} · 虚构角色
                        </p>
                      ) : null}
                      <p className="whitespace-pre-wrap">{body}</p>
                      {notice ? (
                        <p className="mt-1.5 border-t border-line/60 pt-1.5 text-xs leading-relaxed text-bluegray">
                          {notice}
                        </p>
                      ) : null}
                      {!isUser ? (
                        <p className="mt-2 text-xs text-bluegray">
                          {m.reason === 'NARRATIVE_GUIDANCE'
                            ? '剧情引导'
                            : m.provider === 'none'
                              ? m.reason === 'CONTEXT_AMBIGUOUS' || m.reason === 'CONTEXT_REQUIRED'
                                ? '确认话题'
                                : '资料暂不足'
                              : m.mock || m.provider === 'mock'
                                ? '预设回复'
                                : '文化问答'}
                          {isTemporary ? ' · 本轮尚未保存' : ''}
                        </p>
                      ) : null}
                      {!isUser && m.evidenceIds && m.evidenceIds.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1.5 border-t border-line/60 pt-2">
                          {m.evidenceIds.map((eid) => {
                            const ev = m.evidence?.find((item) => item.id === eid)
                            if (!ev) return null
                            return (
                              <button
                                key={eid}
                                type="button"
                                onClick={() => setEvidenceSelection({ messageId: m.id, id: eid })}
                                className="min-h-11 rounded-md border border-line bg-surface px-3 py-2 text-left text-xs leading-5 text-inkgreen transition-colors hover:border-inkgreen focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cinnabar"
                              >
                                证据 · {ev.title}
                              </button>
                            )
                          })}
                        </div>
                      ) : null}
                      {!isUser && !isTemporary && !journeyComplete ? (
                        <button
                          type="button"
                          onClick={() => {
                            reportRequestRef.current += 1
                            setReportingId(m.feedbackMessageId ?? m.id)
                            setReportingNpcId(m.feedbackNpcId ?? speakerId)
                            setReportReason('')
                            setReportError(null)
                            setReportSubmitting(false)
                          }}
                          className="mt-1 flex min-h-11 items-center text-left text-xs text-bluegray underline underline-offset-4 hover:text-cinnabar"
                        >
                          内容可能不准确？
                        </button>
                      ) : null}
                    </div>
                    {isUser ? <PersonaAvatar id={roleId} name={roleName} kind="user" /> : null}
                  </div>
                )
              })}

              {thinking ? (
                <div className="flex items-center justify-between gap-3 rounded-lg bg-surface px-4 py-3">
                  <div className="text-sm leading-7 text-ink-soft" role="status">
                    {stopping ? '正在停止并同步已保存的对话…' : phase}
                  </div>
                  {multiAgent ? (
                    <button
                      type="button"
                      disabled={stopping}
                      onClick={() => {
                        setStopping(true)
                        abortRef.current?.abort()
                      }}
                      className="min-h-11 shrink-0 text-xs text-cinnabar underline underline-offset-4 disabled:opacity-50"
                    >
                      停止本轮
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          {/* Keep recommendations scrollable so five choices cannot hide messages or evidence. */}
          <div className="shrink-0 border-t border-line bg-surface p-3 sm:p-4">
            <div className="flex flex-col gap-2">
              <div className="chat-suggestions flex min-h-0 flex-col gap-2">
              {journeyComplete ? <p role="status" className="text-sm leading-7 text-bluegray">旅程已结束，可只读回顾对话与证据；开启新旅程后可继续提问。</p> : availableTopics.length > 0 ? (
                <label className="flex min-h-11 items-center gap-3 text-xs text-bluegray">
                  推荐问题主题
                  <select aria-label="推荐问题主题" className="input min-h-11 min-w-0 flex-1 py-2 text-sm" value={effectiveTopic}
                    disabled={thinking || busy} onChange={(event) => { setChoiceTopic(event.target.value as ChoiceTopic); setChoiceOffset(0) }}>
                    {(['全部主题', ...availableTopics] as ChoiceTopic[]).map((topic) => <option key={topic} value={topic}>{topic}</option>)}
                  </select>
                </label>
              ) : null}
              {activityQuestions.map((question) => <button key={question} type="button" disabled={thinking || busy} className="chat-quick-question min-h-11 rounded-md border border-inkgreen p-3 text-left text-sm leading-7" onClick={() => void send(question)}>可选探索：{question}</button>)}
              {choices.map((c) => (
                <button
                  key={c}
                  type="button"
                  disabled={thinking || busy || journeyComplete}
                  onClick={() => send(c)}
                  className="chat-quick-question min-h-11 w-full rounded-md border border-line bg-surface px-3 py-2 text-left text-xs leading-relaxed text-ink-soft transition-colors hover:border-inkgreen hover:bg-paper-deep hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cinnabar disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {c}
                </button>
              ))}
              </div>
              <form
                className="flex min-w-0 items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  send(input)
                }}
              >
                <label htmlFor="chat-input" className="sr-only">
                  向{npc.name}提问
                </label>
                <input
                  id="chat-input"
                  className="input min-w-0 flex-1 max-sm:px-3"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={`问${npc.name}…`}
                  maxLength={200}
                  disabled={thinking || busy || journeyComplete}
                />
                {hasChoices ? (
                  <button
                    type="button"
                    onClick={() => setChoiceOffset((value) => value + 1)}
                    disabled={thinking || busy}
                    aria-label="换一批推荐问题"
                    title="换一批推荐问题"
                    className="min-h-11 shrink-0 px-1 text-xs text-bluegray underline underline-offset-4 hover:text-ink disabled:opacity-50"
                  >
                    换一批
                  </button>
                ) : null}
                <button
                  type="submit"
                  className="btn-primary shrink-0 max-sm:px-3"
                  disabled={thinking || busy || journeyComplete || !input.trim()}
                >
                  发送
                </button>
              </form>
            </div>
          </div>
          {error ? (
            <p className="border-t border-line px-4 py-2 text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
        </section>

        {/* 右：上下文（桌面端） */}
        <aside className="hidden self-start space-y-7 py-5 xl:block">
          {multiAgent ? <div className="border-b border-line pb-6">{directorPanel}</div> : null}
          {contextPanel}
        </aside>
      </div>

      {/* 移动端抽屉 */}
      <Drawer open={profileOpen} onClose={() => setProfileOpen(false)} title="NPC 档案" side="left">
        {profilePanel}
      </Drawer>
      <Drawer open={contextOpen} onClose={() => setContextOpen(false)} title="任务与线索">
        {contextPanel}
      </Drawer>
      <Drawer open={sceneOpen} onClose={() => setSceneOpen(false)} title="同场与导演调度">
        <div className="space-y-7">
          {participantsPanel}
          <div className="border-t border-line pt-6">{directorPanel}</div>
        </div>
      </Drawer>

      {/* 证据详情抽屉 */}
      <Drawer
        open={!!evidence}
        onClose={() => setEvidenceSelection(null)}
        title={evidence ? '证据来源' : ''}
      >
        {evidence ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-ink">{evidence.title}</h3>
              <TypeTag type={evidence.type} />
            </div>
            <p className="text-sm leading-relaxed text-ink-soft">{evidence.content}</p>
            <div className="rounded-md bg-paper-deep p-3">
              <h4 className="text-xs font-medium text-ink">来源</h4>
              <p className="mt-1 text-xs leading-relaxed text-bluegray">{sourceName(evidence.source)}</p>
              <SourceStatus trustLevel={evidence.trust_level} reviewStatus={evidence.review_status ?? evidence.reviewStatus} sourceUrl={evidence.source_url ?? evidence.sourceUrl} license={evidence.license} isDemo={evidence.is_demo} isFictional={evidence.is_fictional ?? evidence.type === 'fiction'} citationCurrent={evidence.citation_current} humanReviewVerified={evidence.human_review_verified} />
            </div>
          </div>
        ) : null}
      </Drawer>

      {/* 纠错反馈 */}
      <Drawer open={!!reportingId && !journeyComplete} onClose={closeReport} title="纠错反馈">
        <p className="text-sm leading-relaxed text-ink-soft">
          指出 AI 回答中可能不准确的地方，会写入反馈记录，帮助后续更新资料与提示。
        </p>
        <label htmlFor="report-reason" className="mt-4 block text-sm font-medium text-ink">
          问题描述
        </label>
        <textarea
          id="report-reason"
          className="input mt-2 min-h-24"
          value={reportReason}
          onChange={(e) => setReportReason(e.target.value)}
          disabled={reportSubmitting}
          placeholder="例如：把始建年代说错了，应该是……"
          maxLength={300}
        />
        {reportError ? (
          <p role="alert" className="mt-3 text-sm leading-7 text-danger">
            {reportError}
          </p>
        ) : null}
        <button
          type="button"
          className="btn-primary mt-4"
          disabled={reportSubmitting || reportReason.trim().length < 4}
          aria-busy={reportSubmitting}
          onClick={async () => {
            if (!reportingId || reportSubmitting) return
            const request = ++reportRequestRef.current
            setReportSubmitting(true)
            setReportError(null)
            try {
              await reportIssue(reportingNpcId ?? npc.id, reportingId, reportReason.trim())
              if (request === reportRequestRef.current) closeReport()
            } catch (err) {
              if (request === reportRequestRef.current) {
                setReportError(err instanceof Error ? err.message : '纠错提交失败。')
              }
            } finally {
              if (request === reportRequestRef.current) setReportSubmitting(false)
            }
          }}
        >
          {reportSubmitting ? '正在提交…' : '提交纠错'}
        </button>
      </Drawer>
    </div>
  )
}
