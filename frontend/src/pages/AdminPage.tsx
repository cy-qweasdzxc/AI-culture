import { useState } from 'react'
import type { ReactNode } from 'react'
import TypeTag from '@/components/TypeTag'
import { codexEntries } from '@/data/codex'
import { endings } from '@/data/endings'
import { knowledgeBase } from '@/data/knowledge'
import { npcs } from '@/data/npcs'
import { roles } from '@/data/roles'
import { spots } from '@/data/theme'
import { tasks } from '@/data/tasks'
import { selectCompletedTaskCount, selectKnowledgeScore, useJourney } from '@/engine/journeyStore'
import { cn } from '@/utils/cn'

/**
 * 简版管理后台（原型：只读演示）。
 * 正式版需管理端认证；数据维护、审核流转由后端 API 执行。
 */

type Tab = 'dashboard' | 'knowledge' | 'characters' | 'story' | 'audit' | 'metrics'

const tabs: { key: Tab; label: string }[] = [
  { key: 'dashboard', label: '仪表盘' },
  { key: 'knowledge', label: '文化资料' },
  { key: 'characters', label: '角色管理' },
  { key: 'story', label: '剧情节点' },
  { key: 'audit', label: '对话审核' },
  { key: 'metrics', label: '指标' },
]

function Th({ children }: { children: ReactNode }) {
  return <th className="border-b border-line px-3 py-2 text-left text-xs font-medium text-bluegray">{children}</th>
}
function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn('border-b border-line px-3 py-2 text-sm text-ink-soft', className)}>{children}</td>
}

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const s = useJourney()
  const allMessages = Object.entries(s.messages).flatMap(([npcId, msgs]) =>
    msgs.map((m) => ({ npcId, ...m })),
  )

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-ink">管理后台</h1>
          <p className="mt-1 text-xs text-bluegray">原型为只读演示；正式版需管理端认证，写操作经服务端校验。</p>
        </div>
      </div>

      <div className="mt-5 flex gap-1 overflow-x-auto border-b border-line" role="tablist" aria-label="后台模块">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'min-h-11 shrink-0 border-b-2 px-4 text-sm',
              tab === t.key ? 'border-cinnabar font-medium text-cinnabar' : 'border-transparent text-ink-soft hover:text-ink',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'dashboard' ? (
          <dl className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {[
              ['文化点位', spots.length],
              ['任务节点', tasks.length],
              ['图鉴条目', codexEntries.length],
              ['证据条目', knowledgeBase.length],
              ['对话记录', allMessages.length],
            ].map(([label, value]) => (
              <div key={label} className="card p-5">
                <dt className="text-xs text-bluegray">{label}</dt>
                <dd className="mt-1 font-serif text-3xl font-bold text-inkgreen">{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {tab === 'knowledge' ? (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr>
                  <Th>条目</Th>
                  <Th>可信等级</Th>
                  <Th>点位</Th>
                  <Th>审核状态</Th>
                </tr>
              </thead>
              <tbody>
                {knowledgeBase.map((k) => (
                  <tr key={k.id}>
                    <Td className="font-medium text-ink">{k.title}</Td>
                    <Td>
                      <TypeTag type={k.type} />
                    </Td>
                    <Td>{spots.find((sp) => sp.id === k.spotId)?.shortName}</Td>
                    <Td>
                      <span className="chip border-warning/50 bg-warning/10 text-[oklch(0.42_0.1_65)]">演示数据 · 待正式审核</span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {tab === 'characters' ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card overflow-x-auto p-0">
              <table className="w-full">
                <thead>
                  <tr>
                    <Th>玩家角色</Th>
                    <Th>身份</Th>
                    <Th>初始线索</Th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((r) => (
                    <tr key={r.id}>
                      <Td className="font-medium text-ink">{r.name}</Td>
                      <Td>{r.identity}</Td>
                      <Td>{r.startClueId}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card overflow-x-auto p-0">
              <table className="w-full">
                <thead>
                  <tr>
                    <Th>NPC</Th>
                    <Th>知识边界</Th>
                  </tr>
                </thead>
                <tbody>
                  {npcs.map((n) => (
                    <tr key={n.id}>
                      <Td className="font-medium text-ink">
                        {n.name} <span className="text-xs text-bluegray">· {n.title}</span>
                      </Td>
                      <Td>{n.knowledgeScope}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {tab === 'story' ? (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="card p-5">
              <h2 className="text-sm font-medium text-ink">点位（{spots.length}）</h2>
              <ul className="mt-3 space-y-2 text-sm text-ink-soft">
                {spots.map((sp) => (
                  <li key={sp.id}>
                    {sp.order}. {sp.name} <span className="text-xs text-bluegray">半径 {sp.triggerRadiusM}m</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="card p-5">
              <h2 className="text-sm font-medium text-ink">任务（{tasks.length}）</h2>
              <ul className="mt-3 space-y-2 text-sm text-ink-soft">
                {tasks.map((t) => (
                  <li key={t.id}>
                    {t.title} <span className="text-xs text-bluegray">{t.type} · {t.knowledgeScore}分</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="card p-5">
              <h2 className="text-sm font-medium text-ink">结局（{endings.length}）</h2>
              <ul className="mt-3 space-y-2 text-sm text-ink-soft">
                {endings.map((e) => (
                  <li key={e.id}>
                    {e.name} <span className="text-xs text-bluegray">{e.category}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        {tab === 'audit' ? (
          <div className="space-y-6">
            <div className="card p-5">
              <h2 className="text-sm font-medium text-ink">用户纠错上报（{s.auditLog.length}）</h2>
              {s.auditLog.length === 0 ? (
                <p className="mt-3 text-sm text-bluegray">暂无纠错记录。用户在对话页提交「内容可能不准确」后出现在这里。</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {s.auditLog.map((a, i) => (
                    <li key={i} className="rounded border border-line p-3 text-sm text-ink-soft">
                      <span className="chip mr-2 text-bluegray">{a.npcId}</span>
                      {a.reason}
                      <time className="ml-2 text-xs text-bluegray">{new Date(a.at).toLocaleString('zh-CN')}</time>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="card p-5">
              <h2 className="text-sm font-medium text-ink">对话记录（{allMessages.length} 条，本地演示数据）</h2>
              {allMessages.length === 0 ? (
                <p className="mt-3 text-sm text-bluegray">暂无对话。</p>
              ) : (
                <ul className="mt-3 max-h-96 space-y-2 overflow-y-auto">
                  {allMessages.map((m) => (
                    <li key={m.id} className="text-sm text-ink-soft">
                      <span className="chip mr-2 text-bluegray">
                        {m.from === 'user' ? '用户' : m.from === 'npc' ? m.npcId : '系统'}
                      </span>
                      <span className="align-middle">{m.text.slice(0, 60)}{m.text.length > 60 ? '…' : ''}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}

        {tab === 'metrics' ? (
          <div className="card p-6">
            <h2 className="text-sm font-medium text-ink">运行指标（本机演示旅程的真实数据）</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-xs text-bluegray">旅程状态</dt>
                <dd className="mt-1 font-medium text-ink">{s.state}</dd>
              </div>
              <div>
                <dt className="text-xs text-bluegray">已完成任务</dt>
                <dd className="mt-1 font-medium text-ink">{selectCompletedTaskCount(s)} / {tasks.length}</dd>
              </div>
              <div>
                <dt className="text-xs text-bluegray">知识得分</dt>
                <dd className="mt-1 font-medium text-ink">{selectKnowledgeScore(s)}</dd>
              </div>
              <div>
                <dt className="text-xs text-bluegray">图鉴解锁</dt>
                <dd className="mt-1 font-medium text-ink">{s.unlockedCodex.length} / {codexEntries.length}</dd>
              </div>
            </dl>
            <p className="mt-5 text-xs text-bluegray">并发、P95 响应等性能指标【待补充】，将在后端接入后由真实运行数据呈现。</p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
