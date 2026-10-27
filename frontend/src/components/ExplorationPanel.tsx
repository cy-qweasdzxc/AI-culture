import { useState } from 'react'
import { Link } from 'react-router-dom'
import SpotMedia from '@/components/SpotMedia'
import { useJourney } from '@/engine/journeyStore'
import type { ExplorationActivity } from '@/types'

const kindLabels = { fiction: '剧情虚构', synthetic: '合成推理', image_observation: '图片观察' }
const mechanismLabels = { ordering: '次序推理', matching: '卡片匹配', evidence: '证据判断' }

export function ActivityCard({ activity }: { activity: ExplorationActivity }) {
  const busy = useJourney((s) => s.busy)
  const ended = useJourney((s) => s.state === 'COMPLETED')
  const verify = useJourney((s) => s.verifyActivity)
  const npcs = useJourney((s) => s.npcs)
  const clues = useJourney((s) => s.clues)
  const spots = useJourney((s) => s.spots)
  const [expanded, setExpanded] = useState(false)
  const saved = activity.progress.answer
  const [order, setOrder] = useState<string[]>(Array.isArray(saved) ? saved : activity.items.map((item) => item.id))
  const [pairs, setPairs] = useState<Record<string, string>>(saved && !Array.isArray(saved) && !('selected' in saved) ? saved as Record<string, string> : {})
  const [selected, setSelected] = useState<string[]>(saved && !Array.isArray(saved) && Array.isArray(saved.selected) ? saved.selected : [])
  const [supports, setSupports] = useState<Record<string, string>>(saved && !Array.isArray(saved) && typeof saved.supports === 'object' ? saved.supports : {})
  const [result, setResult] = useState<{ ok: boolean; feedback: string; awardedScore?: number; awardedClues?: string[]; unlockedCodex?: string[] } | null>(null)
  const done = activity.progress.status === 'completed'
  const disabled = busy || done || ended
  const complete = activity.mechanism === 'ordering' ? order.length > 0 : activity.mechanism === 'matching'
    ? activity.items.every((item) => pairs[item.id]) && new Set(Object.values(pairs)).size === activity.items.length
    : selected.length > 0 && (!activity.needsEvidenceLinks || selected.every((id) => supports[id]))
  const submit = async () => {
    try {
      const answer = activity.mechanism === 'ordering' ? order : activity.mechanism === 'matching' ? pairs : { selected, supports }
      setResult(await verify(activity.id, answer))
    } catch (error) { setResult({ ok: false, feedback: error instanceof Error ? error.message : '探索提交失败，请重试。' }) }
  }
  const move = (index: number, offset: number) => {
    setOrder((previous) => {
      const next = [...previous]; const target = index + offset
      if (target >= 0 && target < next.length) [next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }
  return <details className="min-w-0 rounded-xl border border-line bg-surface p-4 sm:p-5" data-activity-id={activity.id} onToggle={(event) => setExpanded(event.currentTarget.open)}>
    <summary className="min-h-11 cursor-pointer text-base font-semibold leading-7">{activity.title} · {done ? '已完成' : '可选探索'}</summary>
    <p className="mt-3 text-xs leading-6 text-bluegray">{mechanismLabels[activity.mechanism]} · {kindLabels[activity.contentKind]} · 完成得 {activity.score} 探索积分</p>
    <p className="mt-3 text-sm leading-7">{activity.briefing}</p>
    <p className="mt-2 text-xs leading-6 text-bluegray">{activity.readingGuide}</p>
    <p className="mt-2 text-xs leading-6 text-bluegray">材料：{activity.sourceLabel}。本互动不属于已人工审核的历史事实题。</p>
    {activity.photo && expanded && <SpotMedia locationId={activity.spotId} name={spots.find((s) => s.id === activity.spotId)?.name ?? '观察材料'} />}
    {activity.evidence.length > 0 && <section className="mt-4 space-y-3" aria-label="判断依据">
      {activity.evidence.map((card) => <p key={card.id} className="rounded-lg bg-paper-deep p-3 text-sm leading-7"><strong>{card.id === 'photo' ? '观察材料' : '材料边界'}：</strong>{card.label}</p>)}
    </section>}
    <details className="my-4 text-sm leading-7" open={activity.difficulty === 'easy'}><summary className="min-h-11 cursor-pointer leading-[44px]">思考提示</summary><p>{activity.hint}</p></details>
    {activity.hintQuestion && <aside className="my-4 rounded-lg border border-line p-3 text-sm leading-7">
      <p>{activity.npcHintObtained ? '剧情线索已收入背包。' : activity.needsNpcHint ? '深入挑战：请先向 NPC 主动询问剧情线索。' : '也可以请 NPC 帮你理清思路。'}</p>
      <p>推荐提问：{activity.hintQuestion}</p>
      <Link className="inline-link inline-flex min-h-11 items-center" to={`/chat/${activity.npcId}`}>向{npcs.find((npc) => npc.id === activity.npcId)?.name ?? 'NPC'}询问剧情线索</Link>
    </aside>}
    <fieldset disabled={disabled} className="min-w-0 space-y-3" aria-label={`${activity.title}作答`}>
      {activity.mechanism === 'ordering' && <ol aria-label="探索排序列表" className="space-y-2">
        {order.map((id, index) => <li key={id} className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-line p-3">
          <span className="min-w-0 flex-1 text-sm leading-7">{index + 1}. {activity.items.find((card) => card.id === id)?.label}</span>
          <span className="flex shrink-0 gap-1">
            <button type="button" className="btn-ghost min-h-11 min-w-11" disabled={disabled || index === 0} onClick={() => move(index, -1)} aria-label={`上移${activity.items.find((card) => card.id === id)?.label}`}>↑</button>
            <button type="button" className="btn-ghost min-h-11 min-w-11" disabled={disabled || index === order.length - 1} onClick={() => move(index, 1)} aria-label={`下移${activity.items.find((card) => card.id === id)?.label}`}>↓</button>
          </span>
        </li>)}
      </ol>}
      {activity.mechanism === 'matching' && activity.items.map((item) => <label key={item.id} className="block min-w-0 text-sm leading-7">
        {item.label}<select className="input mt-2 w-full min-w-0" aria-label={`为${item.label}选择对应项`} value={pairs[item.id] ?? ''} onChange={(event) => setPairs({ ...pairs, [item.id]: event.target.value })}>
          <option value="">请选择对应项</option>{activity.targets.map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}
        </select>
      </label>)}
      {activity.mechanism === 'evidence' && activity.statements.map((statement) => <div key={statement.id} className="rounded-lg border border-line p-3">
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-7">
          <input type="checkbox" className="mt-2 h-4 w-4 shrink-0 accent-inkgreen" checked={selected.includes(statement.id)} onChange={(event) => {
            setSelected(event.target.checked ? [...selected, statement.id] : selected.filter((id) => id !== statement.id))
            if (!event.target.checked) setSupports(Object.fromEntries(Object.entries(supports).filter(([id]) => id !== statement.id)))
          }} />{statement.label}
        </label>
        {activity.needsEvidenceLinks && selected.includes(statement.id) && <label className="mt-2 block text-xs leading-6">为这项判断选择依据
          <select className="input mt-2 w-full min-w-0" aria-label={`判断依据：${statement.label}`} value={supports[statement.id] ?? ''} onChange={(event) => setSupports({ ...supports, [statement.id]: event.target.value })}>
            <option value="">请选择依据</option>{activity.evidence.map((card) => <option key={card.id} value={card.id}>{card.id === 'photo' ? '观察材料' : '材料边界'}</option>)}
          </select>
        </label>}
      </div>)}
    </fieldset>
    {done && <p role="status" className="mt-4 text-sm leading-7 text-inkgreen">探索已完成 · +{activity.progress.score} 探索积分。{activity.explanation}</p>}
    {ended && !done && <p className="mt-3 text-sm leading-7">本次旅程已结束；未完成可选探索不会改变原结局，可在新旅程中体验。</p>}
    {result && <div className="mt-4 rounded-lg bg-paper-deep p-3 text-sm leading-7" role={result.ok ? 'status' : 'alert'}>
      <p>{result.feedback}</p>
      {result.ok && <><p>本次获得 {result.awardedScore} 探索积分；新解锁图鉴 {result.unlockedCodex?.length ?? 0} 条。</p>
        {result.awardedClues?.map((id) => <p key={id}>获得{clues.find((clue) => clue.id === id)?.name ?? '探索札记'}</p>)}
        <Link className="inline-link mr-4 inline-flex min-h-11 items-center" to="/clues">查看线索背包</Link><Link className="inline-link inline-flex min-h-11 items-center" to="/codex">查看文化图鉴</Link></>}
    </div>}
    {!done && !ended && <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
      <button type="button" className="btn-primary" disabled={disabled || !complete || (activity.needsNpcHint && !activity.npcHintObtained)} onClick={() => void submit()}>{busy ? '正在保存探索…' : '提交探索'}</button>
      <span className="text-xs text-bluegray">已尝试 {activity.progress.attempts} 次</span>
    </div>}
  </details>
}

export default function ExplorationPanel({ spotId }: { spotId: string }) {
  const activities = useJourney((s) => s.activities).filter((activity) => activity.spotId === spotId)
  if (!activities.length) return null
  return <section className="mt-8 border-t border-line pt-6" aria-labelledby="optional-exploration-title">
    <h2 id="optional-exploration-title" className="font-serif text-xl font-semibold">这一站，还可以这样探索</h2>
    <p className="mt-2 text-sm leading-7 text-bluegray">以下互动均为可选，不影响原六项任务与三种结局。探索积分单独记录；照片观察与剧情材料不会自动成为已审核史实。</p>
    <div className="mt-4 grid min-w-0 gap-4">{activities.map((activity) => <ActivityCard key={`${activity.id}:${activity.version}:${activity.difficulty}`} activity={activity} />)}</div>
  </section>
}
