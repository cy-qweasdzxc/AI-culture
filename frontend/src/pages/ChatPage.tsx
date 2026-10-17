import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Drawer from '@/components/Drawer'
import PersonaAvatar from '@/components/PersonaAvatar'
import TypeTag from '@/components/TypeTag'
import TypewriterText from '@/components/TypewriterText'
import { suggestedChoices } from '@/data/chatChoices'
import { sceneVisual } from '@/data/sceneVisuals'
import { useJourney } from '@/engine/journeyStore'
import { cn } from '@/utils/cn'

const CLUE_NOTICE_MARK = '\n（已发放演示剧情线索'

/** System notices are shown at once; only the NPC's spoken answer is typed. */
function splitClueNotice(text: string): [string, string | null] {
  const index = text.indexOf(CLUE_NOTICE_MARK)
  return index < 0 ? [text, null] : [text.slice(0, index), text.slice(index + 1)]
}

export default function ChatPage() {
  const { npcId } = useParams<{ npcId: string }>()
  const npcs = useJourney((s) => s.npcs)
  const spots = useJourney((s) => s.spots)
  const tasks = useJourney((s) => s.tasks)
  const busy = useJourney((s) => s.busy)
  const npc = npcs.find((item) => item.id === npcId)

  const messages = useJourney((s) => (npcId ? (s.messages[npcId] ?? []) : []))
  const sendChat = useJourney((s) => s.sendChat)
  const reportIssue = useJourney((s) => s.reportIssue)
  const inventory = useJourney((s) => s.inventory)
  const taskStates = useJourney((s) => s.taskStates)
  const spotStatus = useJourney((s) => s.spotStatus)

  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [evidenceId, setEvidenceId] = useState<string | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [contextOpen, setContextOpen] = useState(false)
  const [reportingId, setReportingId] = useState<string | null>(null)
  const [reportReason, setReportReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [choiceOffset, setChoiceOffset] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const currentSpotId = useJourney((s) => s.currentSpotId)
  const roleId = useJourney((s) => s.roleId)
  const roleName = useJourney((s) => s.roles.find((r) => r.id === s.roleId)?.name ?? '你')
  const spot =
    spots.find((item) => item.id === currentSpotId && item.npcId === npcId) ??
    spots.find((item) => item.id === npc?.spotId)
  const scene = sceneVisual(spot?.id)
  const evidence = messages
    .flatMap((message) => message.evidence ?? [])
    .find((item) => item.id === evidenceId)
  const asked = messages.filter((message) => message.from === 'user').map((message) => message.text)
  const choices = npc
    ? suggestedChoices(npc.id, {
        spotId: currentSpotId,
        roleId,
        turn: asked.length,
        offset: choiceOffset,
        asked,
      })
    : []
  const latestNpc = [...messages].reverse().find((message) => message.from === 'npc')
  // A freshly stored reply starts typing; restored history is shown in full.
  const streamingId = latestNpc && Date.now() - latestNpc.at < 8000 ? latestNpc.id : null

  const followTyping = useCallback(() => {
    const list = listRef.current
    if (!list) return
    if (list.scrollHeight - list.scrollTop - list.clientHeight < 180) {
      list.scrollTop = list.scrollHeight
    }
  }, [])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length, thinking])

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
    if (!trimmed || thinking) return
    setThinking(true)
    setError(null)
    try {
      await sendChat(npc.id, trimmed)
      setInput('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '对话请求失败，请重试。')
    } finally {
      setThinking(false)
    }
  }

  const spotTasks = tasks.filter((task) => task.spotId === spot?.id)

  const profilePanel = (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <PersonaAvatar id={npc.id} name={npc.name} size="xl" />
        <div className="min-w-0">
          <p className="font-serif text-lg font-bold text-ink">{npc.name}</p>
          <p className="mt-0.5 text-xs text-bluegray">{npc.title}</p>
          {spot ? <p className="mt-2 text-xs text-bronze">此刻在 · {spot.name}</p> : null}
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
        <h3 className="text-xs font-medium text-ink">知识边界</h3>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">{npc.knowledgeScope}</p>
      </div>
      <p className="rounded-md bg-paper-deep p-3 text-xs leading-relaxed text-bluegray">
        {npc.name}只回答自己领域内、且有证据支撑的问题；越界或证据不足时会明确拒答。
      </p>
    </div>
  )

  const contextPanel = (
    <div className="space-y-4">
      {spot ? (
        <div>
          <h3 className="text-xs font-medium text-ink">当前位置</h3>
          <Link
            to={`/spot/${spot.id}`}
            className="mt-1 block text-sm text-cinnabar underline underline-offset-4"
          >
            {spot.name}（{spotStatus[spot.id] === 'completed' ? '已完成' : '进行中'}）
          </Link>
        </div>
      ) : null}
      <div>
        <h3 className="text-xs font-medium text-ink">这里的任务</h3>
        <ul className="mt-1.5 space-y-1.5">
          {spotTasks.map((t) =>
            t ? (
              <li key={t.id}>
                <Link
                  to={`/task/${t.id}`}
                  className="flex items-center justify-between rounded border border-line px-2.5 py-1.5 text-sm hover:border-bronze"
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
        <h3 className="text-xs font-medium text-ink">背包里的线索</h3>
        <p className="mt-1.5 text-sm text-bluegray">
          {inventory.length} 件 ·{' '}
          <Link to="/clues" className="text-cinnabar underline underline-offset-4">
            查看背包
          </Link>
        </p>
      </div>
    </div>
  )

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="grid gap-5 lg:grid-cols-[260px_1fr_260px]">
        {/* 左：NPC 档案（桌面端） */}
        <aside className="card hidden self-start p-5 lg:block">{profilePanel}</aside>

        {/* 中：对话区 */}
        <section className="card flex h-[70vh] min-h-[480px] flex-col overflow-hidden">
          <header className="relative z-20 flex items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur-sm">
            <div className="flex min-w-0 items-center gap-3">
              <PersonaAvatar id={npc.id} name={npc.name} />
              <div className="min-w-0">
                <h1 className="truncate font-serif text-base font-bold text-ink">
                  与{npc.name}对话
                </h1>
                <p className="truncate text-xs text-bluegray">
                  {npc.title}
                  {spot ? ` · ${spot.name}` : ''}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 gap-2 lg:hidden">
              <button
                type="button"
                className="btn-ghost min-h-9 px-2 py-1 text-xs"
                onClick={() => setProfileOpen(true)}
              >
                档案
              </button>
              <button
                type="button"
                className="btn-ghost min-h-9 px-2 py-1 text-xs"
                onClick={() => setContextOpen(true)}
              >
                任务
              </button>
            </div>
          </header>

          <div className="chat-canvas relative flex-1 overflow-hidden">
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
              className="relative z-10 h-full space-y-4 overflow-y-auto px-4 py-4"
              aria-live="polite"
            >
              {spot ? (
                <div className="sticky top-0 z-20 flex justify-center" aria-hidden>
                  <span className="rounded-full border border-white/60 bg-surface/[0.85] px-3 py-1 text-[11px] text-ink-soft shadow-sm backdrop-blur-md">
                    {spot.name} · 场景画面
                  </span>
                </div>
              ) : null}
              <div className="anim-fade-rise flex items-end gap-2.5">
                <PersonaAvatar id={npc.id} name={npc.name} />
                <div className="max-w-[85%] rounded-xl rounded-tl-none border border-white/70 bg-surface/[0.92] px-3.5 py-2.5 text-sm leading-relaxed text-ink shadow-[0_5px_18px_rgba(32,28,22,0.1)] backdrop-blur-sm">
                  {npc.greeting}
                </div>
              </div>

              {messages.map((m) => {
                if (m.from === 'system') {
                  return (
                    <div key={m.id} className="anim-fade-rise flex justify-center">
                      <span className="chip border-white/60 bg-surface/[0.85] text-bronze shadow-sm backdrop-blur-sm">
                        {m.text}
                      </span>
                    </div>
                  )
                }
                const isUser = m.from === 'user'
                const [body, notice] = splitClueNotice(m.text)
                return (
                  <div
                    key={m.id}
                    className={cn(
                      'anim-fade-rise flex items-end gap-2.5',
                      isUser ? 'justify-end' : 'justify-start',
                    )}
                  >
                    {!isUser ? <PersonaAvatar id={npc.id} name={npc.name} /> : null}
                    <div
                      className={cn(
                        'max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed shadow-[0_5px_18px_rgba(32,28,22,0.1)]',
                        isUser
                          ? 'rounded-tr-none bg-cinnabar/95 text-white'
                          : 'rounded-tl-none border border-white/70 bg-surface/[0.92] text-ink backdrop-blur-sm',
                      )}
                    >
                      <TypewriterText
                        text={body}
                        animate={m.id === streamingId}
                        className="whitespace-pre-wrap"
                        onProgress={m.id === streamingId ? followTyping : undefined}
                      />
                      {notice ? (
                        <p className="mt-1.5 border-t border-line/60 pt-1.5 text-xs leading-relaxed text-bluegray">
                          {notice}
                        </p>
                      ) : null}
                      {!isUser ? (
                        <p className="mt-2 text-xs text-bluegray">
                          {m.provider === 'none'
                            ? m.reason === 'CONTEXT_AMBIGUOUS' || m.reason === 'CONTEXT_REQUIRED'
                              ? '确认话题 · 未调用模型'
                              : '规则拒答 · 未调用模型'
                            : m.mock || m.provider === 'mock'
                              ? 'Mock 模型 · 开发演示'
                              : m.provider
                                ? `模型提供方：${m.provider}`
                                : '服务端回答'}
                          {m.dataScope ? ` · 资料范围：${m.dataScope}` : ''}
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
                                onClick={() => setEvidenceId(eid)}
                                className="chip border-bronze/40 bg-surface text-bronze hover:border-bronze"
                              >
                                证据 · {ev.title}
                              </button>
                            )
                          })}
                        </div>
                      ) : null}
                      {!isUser ? (
                        <button
                          type="button"
                          onClick={() => {
                            setReportingId(m.id)
                            setReportReason('')
                          }}
                          className="mt-1.5 block text-xs text-bluegray underline underline-offset-2 hover:text-cinnabar"
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
                <div className="anim-fade-rise flex items-end justify-start gap-2.5">
                  <PersonaAvatar id={npc.id} name={npc.name} />
                  <div
                    className="rounded-xl rounded-tl-none border border-white/70 bg-surface/[0.92] px-3.5 py-2.5 text-sm text-bluegray shadow-[0_5px_18px_rgba(32,28,22,0.1)] backdrop-blur-sm"
                    role="status"
                  >
                    正在检索文化资料<span className="animate-pulse">…</span>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {/* 推荐选项 */}
          {choices.length > 0 ? (
            <div className="flex items-center gap-2 border-t border-line px-4 py-2.5">
              <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto">
                {choices.map((c) => (
                  <button
                    key={c}
                    type="button"
                    disabled={thinking || busy}
                    onClick={() => send(c)}
                    className="chip shrink-0 border-bronze/40 bg-surface px-3 py-1.5 text-ink-soft hover:border-bronze hover:text-ink"
                  >
                    {c}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setChoiceOffset((value) => value + 1)}
                disabled={thinking || busy}
                aria-label="换一批推荐问题"
                title="换一批推荐问题"
                className="shrink-0 text-xs text-bluegray underline underline-offset-2 hover:text-ink disabled:opacity-50"
              >
                换一批
              </button>
            </div>
          ) : null}

          {/* 输入区 */}
          <form
            className="flex gap-2 border-t border-line p-3"
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
              className="input flex-1"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`问${npc.name}一个与「${npc.knowledgeScope.slice(0, 12)}…」相关的问题`}
              maxLength={200}
              disabled={thinking || busy}
            />
            <button
              type="submit"
              className="btn-primary shrink-0"
              disabled={thinking || busy || !input.trim()}
            >
              发送
            </button>
          </form>
          {error ? (
            <p className="border-t border-line px-4 py-2 text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
        </section>

        {/* 右：上下文（桌面端） */}
        <aside className="card hidden self-start p-5 lg:block">{contextPanel}</aside>
      </div>

      {/* 移动端抽屉 */}
      <Drawer open={profileOpen} onClose={() => setProfileOpen(false)} title="NPC 档案" side="left">
        {profilePanel}
      </Drawer>
      <Drawer open={contextOpen} onClose={() => setContextOpen(false)} title="任务与线索">
        {contextPanel}
      </Drawer>

      {/* 证据详情抽屉 */}
      <Drawer
        open={!!evidence}
        onClose={() => setEvidenceId(null)}
        title={evidence ? '证据来源' : ''}
      >
        {evidence ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-serif text-lg font-bold text-ink">{evidence.title}</h3>
              <TypeTag type={evidence.type} />
            </div>
            <p className="text-sm leading-relaxed text-ink-soft">{evidence.content}</p>
            <div className="rounded-md bg-paper-deep p-3">
              <h4 className="text-xs font-medium text-ink">来源</h4>
              <p className="mt-1 text-xs leading-relaxed text-bluegray">{evidence.source}</p>
              {evidence.source_url || evidence.sourceUrl ? (
                <a
                  className="mt-2 block text-xs text-cinnabar underline"
                  href={evidence.source_url ?? evidence.sourceUrl ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                >
                  查看来源页面
                </a>
              ) : null}
              <p className="mt-2 text-xs text-bluegray">
                审核状态：{evidence.review_status ?? evidence.reviewStatus ?? '待补充'}
              </p>
            </div>
          </div>
        ) : null}
      </Drawer>

      {/* 纠错反馈 */}
      <Drawer open={!!reportingId} onClose={() => setReportingId(null)} title="纠错反馈">
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
          placeholder="例如：把始建年代说错了，应该是……"
          maxLength={300}
        />
        <button
          type="button"
          className="btn-primary mt-4"
          disabled={reportReason.trim().length < 4}
          onClick={async () => {
            try {
              if (reportingId) await reportIssue(npc.id, reportingId, reportReason.trim())
              setReportingId(null)
            } catch (err) {
              setError(err instanceof Error ? err.message : '纠错提交失败。')
            }
          }}
        >
          提交纠错
        </button>
      </Drawer>
    </div>
  )
}
