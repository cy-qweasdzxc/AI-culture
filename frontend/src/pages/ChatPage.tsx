import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Drawer from '@/components/Drawer'
import TypeTag from '@/components/TypeTag'
import { suggestedChoices } from '@/data/chatScripts'
import { knowledgeById } from '@/data/knowledge'
import { npcById } from '@/data/npcs'
import { spotById } from '@/data/theme'
import { taskById } from '@/data/tasks'
import { useJourney } from '@/engine/journeyStore'
import { cn } from '@/utils/cn'

export default function ChatPage() {
  const { npcId } = useParams<{ npcId: string }>()
  const npc = npcId ? npcById.get(npcId) : undefined

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
  const listRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<number | undefined>(undefined)

  const spot = npc ? spotById.get(npc.spotId) : undefined
  const evidence = evidenceId ? knowledgeById.get(evidenceId) : undefined
  const choices = npc ? suggestedChoices(npc.id, (id) => inventory.includes(id)) : []

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length, thinking])

  useEffect(() => () => window.clearTimeout(timerRef.current), [])

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

  const send = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || thinking) return
    setInput('')
    setThinking(true)
    // 模拟"正在检索文化资料"的检索时延；正式版为真实 RAG 调用
    timerRef.current = window.setTimeout(() => {
      sendChat(npc.id, trimmed)
      setThinking(false)
    }, 700)
  }

  const spotTasks = spot?.taskIds.map((id) => taskById.get(id)).filter(Boolean) ?? []

  const profilePanel = (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="seal h-12 w-12 text-base" aria-hidden>
          {npc.name.slice(0, 1)}
        </span>
        <div>
          <p className="font-serif text-lg font-bold text-ink">{npc.name}</p>
          <p className="text-xs text-bluegray">{npc.title}</p>
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
          <Link to={`/spot/${spot.id}`} className="mt-1 block text-sm text-cinnabar underline underline-offset-4">
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
                <Link to={`/task/${t.id}`} className="flex items-center justify-between rounded border border-line px-2.5 py-1.5 text-sm hover:border-bronze">
                  <span className="text-ink">{t.title}</span>
                  <span className={cn('text-xs', taskStates[t.id]?.status === 'completed' ? 'text-inkgreen' : 'text-bluegray')}>
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
        <p className="mt-1.5 text-sm text-bluegray">{inventory.length} 件 · <Link to="/clues" className="text-cinnabar underline underline-offset-4">查看背包</Link></p>
      </div>
    </div>
  )

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="grid gap-5 lg:grid-cols-[260px_1fr_260px]">
        {/* 左：NPC 档案（桌面端） */}
        <aside className="card hidden self-start p-5 lg:block">{profilePanel}</aside>

        {/* 中：对话区 */}
        <section className="card flex h-[70vh] min-h-[480px] flex-col">
          <header className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <h1 className="font-serif text-base font-bold text-ink">
                与{npc.name}对话{spot ? <span className="ml-2 text-xs font-normal text-bluegray">{spot.name}</span> : null}
              </h1>
            </div>
            <div className="flex gap-2 lg:hidden">
              <button type="button" className="btn-ghost min-h-9 px-2 py-1 text-xs" onClick={() => setProfileOpen(true)}>
                档案
              </button>
              <button type="button" className="btn-ghost min-h-9 px-2 py-1 text-xs" onClick={() => setContextOpen(true)}>
                任务
              </button>
            </div>
          </header>

          <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
            <div className="anim-fade-rise flex justify-start">
              <div className="max-w-[85%] rounded-lg rounded-tl-none bg-paper-deep px-3.5 py-2.5 text-sm leading-relaxed text-ink">
                {npc.greeting}
              </div>
            </div>

            {messages.map((m) => {
              if (m.from === 'system') {
                return (
                  <div key={m.id} className="anim-fade-rise flex justify-center">
                    <span className="chip bg-bronze/10 text-bronze">{m.text}</span>
                  </div>
                )
              }
              const isUser = m.from === 'user'
              return (
                <div key={m.id} className={cn('anim-fade-rise flex', isUser ? 'justify-end' : 'justify-start')}>
                  <div
                    className={cn(
                      'max-w-[85%] rounded-lg px-3.5 py-2.5 text-sm leading-relaxed',
                      isUser ? 'rounded-tr-none bg-cinnabar text-white' : 'rounded-tl-none bg-paper-deep text-ink',
                    )}
                  >
                    <p className="whitespace-pre-wrap">{m.text}</p>
                    {!isUser && m.evidenceIds && m.evidenceIds.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5 border-t border-line/60 pt-2">
                        {m.evidenceIds.map((eid) => {
                          const ev = knowledgeById.get(eid)
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
                </div>
              )
            })}

            {thinking ? (
              <div className="anim-fade-rise flex justify-start">
                <div className="rounded-lg rounded-tl-none bg-paper-deep px-3.5 py-2.5 text-sm text-bluegray" role="status">
                  正在检索文化资料<span className="animate-pulse">…</span>
                </div>
              </div>
            ) : null}
          </div>

          {/* 推荐选项 */}
          {choices.length > 0 ? (
            <div className="flex gap-2 overflow-x-auto border-t border-line px-4 py-2.5">
              {choices.map((c) => (
                <button
                  key={c}
                  type="button"
                  disabled={thinking}
                  onClick={() => send(c)}
                  className="chip shrink-0 border-bronze/40 bg-surface px-3 py-1.5 text-ink-soft hover:border-bronze hover:text-ink"
                >
                  {c}
                </button>
              ))}
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
              disabled={thinking}
            />
            <button type="submit" className="btn-primary shrink-0" disabled={thinking || !input.trim()}>
              发送
            </button>
          </form>
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
      <Drawer open={!!evidence} onClose={() => setEvidenceId(null)} title={evidence ? '证据来源' : ''}>
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
            </div>
          </div>
        ) : null}
      </Drawer>

      {/* 纠错反馈 */}
      <Drawer open={!!reportingId} onClose={() => setReportingId(null)} title="纠错反馈">
        <p className="text-sm leading-relaxed text-ink-soft">
          指出 AI 回答中可能不准确的地方，会写入对话审核队列，由内容审核人员核对。这正是在帮助系统变得更可靠。
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
          onClick={() => {
            if (reportingId) reportIssue(npc.id, reportingId, reportReason.trim())
            setReportingId(null)
          }}
        >
          提交纠错
        </button>
      </Drawer>
    </div>
  )
}
