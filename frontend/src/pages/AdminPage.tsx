import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '@/components/Icon'
import TypeTag from '@/components/TypeTag'
import { api, ApiError } from '@/services/api'
import type { KnowledgeType } from '@/types'
import { cn } from '@/utils/cn'

interface KnowledgeForm {
  id: string
  story_id: string
  location_id: string
  title: string
  content: string
  content_type: KnowledgeType
  source: string
  source_url: string
  license: string
  tags: string[]
  min_chapter: number
}
interface Knowledge extends Omit<KnowledgeForm, 'min_chapter'> {
  review_status: string
  version: number
  is_demo: boolean
  metadata: { min_chapter?: number }
}
interface Character {
  id: string
  kind: string
  name: string
  data: { greeting?: string; knowledgeScope?: string; personality?: string[] }
}
interface Task {
  id: string
  title: string
  data: { briefing: string }
}
interface Dialogue {
  id: string
  npc_id: string
  user_input: string
  feedback: string | null
  response: { dialogue?: string; feedback_resolution?: string; mock?: boolean }
}
interface TestRecord {
  id: string
  category: string
  result: unknown
  executed_at: string | null
}
interface RetrievalResult {
  items: {
    id: string
    chunkId: string
    score: number
    lexicalScore: number
    vectorScore: number
    type: string
    title: string
    source: string
    source_url: string
  }[]
  mode: string
  requestedMode: string
  limit: number
  elapsedMs: number
  corpusCount: number
  embeddingModel: string
  embeddingError: string | null
  retrievalConfig: Record<string, number | string>
}
const emptyForm: KnowledgeForm = {
  id: '',
  story_id: 'suzhou-pingjiang',
  location_id: 'pingjiang',
  title: '',
  content: '',
  content_type: 'fact',
  source: '',
  source_url: '',
  license: '',
  tags: [],
  min_chapter: 1,
}
const tabs = [
  ['metrics', '运行指标'],
  ['knowledge', '文化资料'],
  ['characters', 'NPC 配置'],
  ['story', '剧情任务'],
  ['audit', '对话纠错'],
  ['tests', '测试记录'],
] as const
type Tab = (typeof tabs)[number][0]
// 三种检索模式用于对照实验：关键词不需要向量模型，向量与混合需要可用的 Embedding。
const retrievalModes = [
  ['keyword', '关键词检索'],
  ['vector', '向量检索'],
  ['hybrid', '混合检索'],
] as const
type RetrievalMode = (typeof retrievalModes)[number][0]
const inputClass = 'input'
const labelClass = 'flex min-w-0 flex-col gap-2 text-sm font-medium text-ink'
const moduleDescriptions: Record<Tab, string> = {
  metrics: '查看资料、旅程与对话的数据库统计，了解当前内容与使用情况。',
  knowledge: '维护文化资料的正文、来源与授权，完成审核后发布检索索引。',
  characters: '维护人物称呼、开场白和知识边界，保持对话内容清晰一致。',
  story: '调整任务标题与说明，让体验者更容易理解眼前的挑战。',
  audit: '查看对话反馈，核对问题并记录纠错处理结果。',
  tests: '查看已执行的评测记录与原始结果。',
}
const metricLabels: Record<string, string> = {
  knowledge: '文化资料',
  reviewedKnowledge: '已审核资料',
  chunks: '检索文本块',
  characters: '人物角色',
  locations: '文化点位',
  tasks: '剧情任务',
  journeys: '用户旅程',
  dialogues: '对话记录',
  safetyEvents: '安全事件',
  testCases: '评测用例',
}

export default function AdminPage() {
  const [actor, setActor] = useState<string>()
  const [checking, setChecking] = useState(true)
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('admin')
  const [tab, setTab] = useState<Tab>('metrics')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [knowledge, setKnowledge] = useState<Knowledge[]>([])
  const [characters, setCharacters] = useState<Character[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [dialogues, setDialogues] = useState<Dialogue[]>([])
  const [tests, setTests] = useState<TestRecord[]>([])
  const [metrics, setMetrics] = useState<Record<string, unknown>>({})
  const [form, setForm] = useState<KnowledgeForm>({ ...emptyForm })
  const [editingVersion, setEditingVersion] = useState<number>()
  const [reviewer, setReviewer] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [query, setQuery] = useState('')
  const [retrieved, setRetrieved] = useState<RetrievalResult>()
  const [retrievalMode, setRetrievalMode] = useState<RetrievalMode>('keyword')
  const [retrievalLimit, setRetrievalLimit] = useState(4)
  const [resolution, setResolution] = useState('')

  async function refresh() {
    const [k, c, s, d, m, t] = await Promise.all([
      api.get<{ items: Knowledge[] }>('/admin/knowledge'),
      api.get<{ items: Character[] }>('/admin/characters'),
      api.get<{ tasks: Task[] }>('/admin/story'),
      api.get<{ items: Dialogue[] }>('/admin/dialogues'),
      api.get<Record<string, unknown>>('/admin/metrics'),
      api.get<{ items: TestRecord[] }>('/admin/tests'),
    ])
    setKnowledge(k.items)
    setCharacters(c.items)
    setTasks(s.tasks)
    setDialogues(d.items)
    setMetrics(m)
    setTests(t.items)
  }
  async function run(work: () => Promise<unknown>, message = '操作已保存。') {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await work()
      await refresh()
      setNotice(message)
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败，请重试。')
      if (e instanceof ApiError && e.status === 401) setActor(undefined)
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    let alive = true
    api
      .get<{ username: string }>('/admin/me')
      .then(async (result) => {
        if (alive) {
          setActor(result.username)
          await refresh()
        }
      })
      .catch((e: unknown) => {
        if (alive && !(e instanceof ApiError && e.status === 401)) {
          setError(e instanceof Error ? e.message : '管理员会话读取失败。')
        }
      })
      .finally(() => {
        if (alive) setChecking(false)
      })
    return () => {
      alive = false
    }
  }, [])
  function edit(k: Knowledge) {
    setForm({
      id: k.id,
      story_id: k.story_id,
      location_id: k.location_id,
      title: k.title,
      content: k.content,
      content_type: k.content_type,
      source: k.source,
      source_url: k.source_url,
      license: k.license,
      tags: k.tags,
      min_chapter: k.metadata.min_chapter ?? 1,
    })
    setEditingVersion(k.version)
    setConfirmed(false)
  }
  const alerts = (
    <>
      {error && (
        <p
          role="alert"
          className="mt-5 rounded-md border border-cinnabar/25 bg-cinnabar/5 px-4 py-3 text-sm leading-6 text-cinnabar"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="mt-5 flex items-start gap-2 rounded-md border border-inkgreen/20 bg-inkgreen/5 px-4 py-3 text-sm leading-6 text-inkgreen"
        >
          <Icon name="check" className="mt-0.5 h-5 w-5" />
          {notice}
        </p>
      )}
    </>
  )
  const brand = (
    <Link to="/" className="brand-link" aria-label="城迹入戏首页">
      <span className="brand-mark" aria-hidden>
        城迹
      </span>
      <span>
        <span className="block font-serif text-lg font-bold tracking-wider text-ink">城迹入戏</span>
        <span className="mt-0.5 block text-[11px] text-bluegray">内容运营工作台</span>
      </span>
    </Link>
  )
  const homeLink = (
    <Link to="/" className="inline-link gap-2">
      <Icon name="arrow" className="h-4 w-4 rotate-180" />
      返回首页
    </Link>
  )
  if (checking)
    return (
      <div className="min-h-screen">
        <header className="border-b border-line bg-surface">
          <div className="page-width flex min-h-[76px] items-center justify-between gap-5">
            {brand}
            {homeLink}
          </div>
        </header>
        <main className="mx-auto max-w-md px-5 py-16" aria-busy="true">
          <p role="status" className="text-sm text-ink-soft">
            正在读取管理员会话…
          </p>
          <div className="mt-6 space-y-5 rounded-xl border border-line bg-surface p-6" aria-hidden>
            <div className="h-5 w-1/2 rounded bg-paper-deep" />
            <div className="h-11 rounded-md bg-paper-deep" />
            <div className="h-11 rounded-md bg-paper-deep" />
          </div>
        </main>
      </div>
    )
  if (!actor)
    return (
      <div className="min-h-screen">
        <header className="border-b border-line bg-surface">
          <div className="page-width flex min-h-[76px] items-center justify-between gap-5">
            {brand}
            {homeLink}
          </div>
        </header>
        <main className="mx-auto w-full max-w-md px-5 py-12 sm:py-16">
          <Icon name="shield" className="h-8 w-8 text-inkgreen" />
          <h1 className="mt-5 text-3xl font-semibold tracking-tight text-ink">管理后台登录</h1>
          <p className="mt-3 text-sm leading-7 text-ink-soft">
            使用服务端配置的管理员账号。登录状态有效期为两小时。
          </p>
          {alerts}
          <form
            className="card mt-7 space-y-5 p-6 sm:p-8"
            onSubmit={(e) => {
              e.preventDefault()
              void run(async () => {
                const result = await api.post<{ username: string }>('/admin/login', {
                  username,
                  password,
                })
                setActor(result.username)
                setPassword('')
              }, '已登录。')
            }}
          >
            <label className={labelClass}>
              账号
              <input
                className={inputClass}
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </label>
            <label className={labelClass}>
              密码
              <input
                className={inputClass}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            <button className="btn-primary w-full" disabled={busy} aria-busy={busy}>
              登录
            </button>
          </form>
          <p className="mt-5 text-xs leading-6 text-bluegray">
            此入口供内容维护与评测使用。文化体验请返回首页开始旅程。
          </p>
        </main>
      </div>
    )
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="page-width flex min-h-[76px] flex-wrap items-center justify-between gap-x-5 gap-y-2 py-3">
          {brand}
          <div className="flex items-center gap-3 sm:gap-6">
            {homeLink}
            <button
              className="btn-secondary"
              disabled={busy}
              onClick={() => {
                void api
                  .post('/admin/logout')
                  .then(() => setActor(undefined))
                  .catch((e: unknown) => setError(e instanceof Error ? e.message : '退出失败。'))
              }}
            >
              {actor} · 退出
            </button>
          </div>
        </div>
      </header>
      <main className="page-width py-8 sm:py-12">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-ink">管理后台</h1>
          <p className="mt-3 text-sm leading-6 text-ink-soft">
            维护资料与剧情，核对对话反馈，查看使用和评测记录。
          </p>
        </div>
        {alerts}
        <div
          className="mt-8 flex overflow-x-auto border-b border-line"
          role="tablist"
          aria-label="后台模块"
        >
          {tabs.map(([key, label], index) => (
            <button
              key={key}
              id={`admin-tab-${key}`}
              type="button"
              role="tab"
              aria-selected={tab === key}
              aria-controls="admin-panel"
              tabIndex={tab === key ? 0 : -1}
              onClick={() => setTab(key)}
              onKeyDown={(event) => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
                event.preventDefault()
                const nextIndex =
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? tabs.length - 1
                      : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
                setTab(tabs[nextIndex][0])
                document.getElementById(`admin-tab-${tabs[nextIndex][0]}`)?.focus()
              }}
              className={cn(
                'min-h-12 shrink-0 border-b-2 px-4 text-sm transition-colors sm:px-5',
                tab === key
                  ? 'border-cinnabar font-semibold text-cinnabar'
                  : 'border-transparent text-ink-soft hover:text-ink',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div
          id="admin-panel"
          role="tabpanel"
          aria-labelledby={`admin-tab-${tab}`}
          className="mt-8 min-w-0"
        >
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-ink">
              {tabs.find(([key]) => key === tab)?.[1]}
            </h2>
            <p className="mt-2 max-w-prose text-sm leading-6 text-ink-soft">
              {moduleDescriptions[tab]}
            </p>
          </div>
          {tab === 'metrics' && (
            <>
              <dl className="grid grid-cols-2 overflow-hidden rounded-xl border border-line bg-line gap-px md:grid-cols-3 lg:grid-cols-5">
                {Object.entries(metrics)
                  .filter(([, value]) => typeof value === 'number')
                  .map(([key, value]) => (
                    <div key={key} className="min-w-0 bg-surface p-5 sm:p-6">
                      <dt className="text-sm text-ink-soft">{metricLabels[key] ?? key}</dt>
                      <dd className="mt-3 text-3xl font-semibold tabular-nums text-ink">
                        {String(value)}
                      </dd>
                    </div>
                  ))}
              </dl>
              {Object.values(metrics).every((value) => typeof value !== 'number') && (
                <p className="rounded-xl border border-dashed border-line bg-surface px-6 py-10 text-sm leading-7 text-ink-soft">
                  当前暂无可显示的运行统计。
                </p>
              )}
              <p className="mt-5 flex items-start gap-2 text-xs leading-6 text-bluegray">
                <Icon name="report" className="mt-0.5 h-4 w-4" />
                数值来自服务端数据库。性能测量见测试报告；此处没有实时性能监控。
              </p>
            </>
          )}
          {tab === 'knowledge' && (
            <div className="space-y-8">
              <form
                className="card grid gap-x-6 gap-y-5 p-5 sm:grid-cols-2 sm:p-8"
                onSubmit={(e) => {
                  e.preventDefault()
                  void run(async () => {
                    if (editingVersion)
                      await api.put(`/admin/knowledge/${form.id}`, {
                        ...form,
                        version: editingVersion,
                      })
                    else await api.post('/admin/knowledge', form)
                    setForm({ ...emptyForm })
                    setEditingVersion(undefined)
                  }, '资料已保存为待审核；修改会撤销旧审核与索引。')
                }}
              >
                <h3 className="mb-1 text-lg font-semibold text-ink sm:col-span-2">
                  {editingVersion ? `编辑资料 · 版本 ${editingVersion}` : '新增待审核资料'}
                </h3>
                {(['id', 'location_id', 'title', 'source', 'source_url', 'license'] as const).map(
                  (key) => (
                    <label key={key} className={labelClass}>
                      {
                        {
                          id: '条目 ID',
                          location_id: '点位 ID',
                          title: '标题',
                          source: '来源名称',
                          source_url: '来源 URL',
                          license: '授权说明',
                        }[key]
                      }
                      <input
                        className={inputClass}
                        disabled={key === 'id' && !!editingVersion}
                        required={key !== 'source_url'}
                        value={form[key]}
                        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                      />
                    </label>
                  ),
                )}
                <label className={labelClass}>
                  资料类型
                  <select
                    className={inputClass}
                    value={form.content_type}
                    onChange={(e) =>
                      setForm({ ...form, content_type: e.target.value as KnowledgeType })
                    }
                  >
                    {['fact', 'disputed', 'legend', 'fiction'].map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                </label>
                <label className={labelClass}>
                  最早可见章节
                  <input
                    className={inputClass}
                    type="number"
                    min={1}
                    max={100}
                    value={form.min_chapter}
                    onChange={(e) => setForm({ ...form, min_chapter: Number(e.target.value) })}
                    required
                  />
                </label>
                <label className={cn(labelClass, 'sm:col-span-2')}>
                  正文
                  <textarea
                    className={inputClass}
                    rows={5}
                    value={form.content}
                    onChange={(e) => setForm({ ...form, content: e.target.value })}
                    required
                  />
                </label>
                <div className="mt-1 flex flex-wrap gap-3 border-t border-line pt-5 sm:col-span-2">
                  <button className="btn-primary" disabled={busy}>
                    保存为待审核
                  </button>
                  <button
                    className="btn-secondary"
                    type="button"
                    onClick={() => {
                      setForm({ ...emptyForm })
                      setEditingVersion(undefined)
                    }}
                  >
                    清空编辑
                  </button>
                </div>
              </form>
              <section className="border-y border-line py-6">
                <h3 className="text-lg font-semibold text-ink">人工审核</h3>
                <p className="mt-2 max-w-prose text-sm leading-6 text-ink-soft">
                  “通过审核”会记录人工确认。每条资料都须分别核对；审核通过后才可发布检索索引。
                </p>
                <label className={cn(labelClass, 'mt-5 max-w-md')}>
                  审核人员
                  <input
                    aria-label="审核人员"
                    placeholder="审核人员姓名或内部编号"
                    className={inputClass}
                    value={reviewer}
                    onChange={(e) => setReviewer(e.target.value)}
                  />
                </label>
                <label className="mt-3 flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm leading-6 text-ink">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 shrink-0"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  我已核对当前条目的正文、来源 URL 与授权说明。
                </label>
              </section>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-ink">资料列表</h3>
                <p className="text-sm tabular-nums text-bluegray">共 {knowledge.length} 条</p>
              </div>
              {knowledge.length === 0 && (
                <p className="rounded-xl border border-dashed border-line bg-surface px-6 py-10 text-sm leading-7 text-ink-soft">
                  暂无文化资料。在上方填写正文、来源与授权说明，保存第一条待审核资料。
                </p>
              )}
              {knowledge.map((k) => (
                <article key={k.id} className="card p-5 sm:p-7">
                  <div className="flex flex-wrap items-center gap-3">
                    <h4 className="text-lg font-semibold leading-7 text-ink">{k.title}</h4>
                    <TypeTag type={k.content_type} />
                    <span className="chip">
                      {k.review_status} · v{k.version}
                      {k.is_demo ? ' · 演示资料' : ''}
                    </span>
                  </div>
                  <p className="mt-4 max-w-prose whitespace-pre-wrap break-words text-sm leading-7 text-ink-soft">
                    {k.content}
                  </p>
                  <p className="mt-4 break-words text-xs leading-6 text-bluegray">
                    来源：{k.source} · {k.source_url || 'URL 待补充'} · 授权：{k.license}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-3 border-t border-line pt-5">
                    <button className="btn-secondary" disabled={busy} onClick={() => edit(k)}>
                      编辑
                    </button>
                    <button
                      className="btn-secondary"
                      disabled={busy || reviewer.length < 2 || !confirmed}
                      onClick={() => {
                        void run(async () => {
                          await api.post(`/admin/knowledge/${k.id}/review`, {
                            version: k.version,
                            status: 'reviewed',
                            reviewer,
                            confirm_sources: confirmed,
                          })
                          setConfirmed(false)
                        }, '已记录人工审核；请另行发布索引。')
                      }}
                    >
                      通过审核
                    </button>
                    <button
                      className="btn-secondary"
                      disabled={busy || reviewer.length < 2}
                      onClick={() => {
                        void run(
                          () =>
                            api.post(`/admin/knowledge/${k.id}/review`, {
                              version: k.version,
                              status: 'rejected',
                              reviewer,
                              confirm_sources: false,
                            }),
                          '已拒绝并撤销索引。',
                        )
                      }}
                    >
                      拒绝
                    </button>
                    <button
                      className="btn-secondary"
                      disabled={busy || k.review_status !== 'reviewed'}
                      onClick={() => {
                        void run(
                          () => api.post(`/admin/knowledge/${k.id}/publish`),
                          '检索索引已发布。',
                        )
                      }}
                    >
                      发布索引
                    </button>
                  </div>
                </article>
              ))}
              <form
                className="card space-y-5 p-5 sm:p-8"
                onSubmit={(e) => {
                  e.preventDefault()
                  void run(
                    async () =>
                      setRetrieved(
                        await api.post<RetrievalResult>('/admin/retrieval/test', {
                          query,
                          story_id: form.story_id,
                          location_id: form.location_id,
                          chapter: form.min_chapter,
                          mode: retrievalMode,
                          limit: retrievalLimit,
                        }),
                      ),
                    '检索测试已执行。',
                  )
                }}
              >
                <h3 className="text-lg font-semibold text-ink">检索测试 · 当前编辑点位与章节</h3>
                <p className="max-w-prose text-sm leading-7 text-ink-soft">
                  同一问题可用三种模式对照。关键词模式不需要向量模型；向量与混合模式需要配置
                  Embedding， 未配置或调用失败时会明确报错，不会伪装成已执行。
                </p>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_180px_140px]">
                  <label className={cn(labelClass, 'sm:col-span-2 lg:col-span-1')}>
                    检索问题
                    <input
                      aria-label="检索问题"
                      className={inputClass}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      required
                    />
                  </label>
                  <label className={labelClass}>
                    检索模式
                    <select
                      aria-label="检索模式"
                      className={inputClass}
                      value={retrievalMode}
                      onChange={(e) => setRetrievalMode(e.target.value as RetrievalMode)}
                    >
                      {retrievalModes.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={labelClass}>
                    结果上限
                    <input
                      aria-label="结果上限"
                      className={inputClass}
                      type="number"
                      min={1}
                      max={20}
                      value={retrievalLimit}
                      onChange={(e) => setRetrievalLimit(Number(e.target.value))}
                    />
                  </label>
                </div>
                <button className="btn-secondary" disabled={busy}>
                  测试检索
                </button>
                {retrieved && (
                  <div className="space-y-4 border-t border-line pt-5">
                    <p className="break-words text-xs leading-6 text-bluegray">
                      实际执行：<strong>{retrieved.mode}</strong>
                      {retrieved.requestedMode !== retrieved.mode &&
                        `（请求 ${retrieved.requestedMode}，已降级）`}
                      ｜候选库 {retrieved.corpusCount} 块｜用时 {retrieved.elapsedMs} ms ｜阈值
                      lexical≥{String(retrieved.retrievalConfig.lexical_min_score)}、vector≥
                      {String(retrieved.retrievalConfig.vector_min_score)}
                    </p>
                    {retrieved.embeddingError && (
                      <p className="text-xs leading-6 text-cinnabar">
                        向量模型调用失败：{retrieved.embeddingError}（已按关键词结果返回）
                      </p>
                    )}
                    {retrieved.items.length === 0 && (
                      <p className="rounded-md bg-paper-deep px-4 py-3 text-sm leading-7 text-ink-soft">
                        没有命中任何已审核证据。这是正常的拒答前提，不是检索故障。
                      </p>
                    )}
                    <ol className="divide-y divide-line text-sm leading-7 text-ink-soft">
                      {retrieved.items.map((item) => (
                        <li key={item.chunkId} className="break-words py-3">
                          {item.title}（{item.type}）· {item.source}
                          ｜综合 {item.score.toFixed(4)}（关键词 {item.lexicalScore.toFixed(4)} /
                          向量 {item.vectorScore.toFixed(4)}）
                        </li>
                      ))}
                    </ol>
                    <details className="min-w-0 border-t border-line pt-3">
                      <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-inkgreen">
                        原始返回
                      </summary>
                      <pre className="max-h-96 overflow-auto rounded-md bg-paper-deep p-4 text-xs leading-6 text-ink-soft">
                        {JSON.stringify(retrieved, null, 2)}
                      </pre>
                    </details>
                  </div>
                )}
              </form>
            </div>
          )}
          {tab === 'characters' && (
            <div className="space-y-6">
              {characters.every((character) => character.kind !== 'npc') && (
                <p className="rounded-xl border border-dashed border-line bg-surface px-6 py-10 text-sm leading-7 text-ink-soft">
                  暂无 NPC 配置。发布人物资料后，可在这里维护名称、开场白与知识边界。
                </p>
              )}
              {characters
                .filter((c) => c.kind === 'npc')
                .map((c) => (
                  <form
                    key={c.id}
                    className="card grid gap-x-6 gap-y-5 p-5 sm:grid-cols-2 sm:p-8"
                    onSubmit={(e) => {
                      e.preventDefault()
                      const data = new FormData(e.currentTarget)
                      void run(() =>
                        api.patch(`/admin/characters/${c.id}`, {
                          name: data.get('name'),
                          greeting: data.get('greeting'),
                          knowledge_scope: data.get('scope'),
                          personality: c.data.personality ?? [],
                        }),
                      )
                    }}
                  >
                    <div className="sm:col-span-2">
                      <h3 className="text-lg font-semibold text-ink">{c.name}</h3>
                      <p className="mt-1 break-words text-xs text-bluegray">{c.id}</p>
                    </div>
                    <label className={cn(labelClass, 'sm:col-span-2 sm:max-w-md')}>
                      名称
                      <input name="name" className={inputClass} defaultValue={c.name} required />
                    </label>
                    <label className={labelClass}>
                      开场白
                      <textarea
                        name="greeting"
                        className={inputClass}
                        rows={4}
                        defaultValue={c.data.greeting}
                        required
                      />
                    </label>
                    <label className={labelClass}>
                      知识边界
                      <textarea
                        name="scope"
                        className={inputClass}
                        rows={4}
                        defaultValue={c.data.knowledgeScope}
                        required
                      />
                    </label>
                    <div className="border-t border-line pt-5 sm:col-span-2">
                      <button className="btn-primary" disabled={busy}>
                        保存 NPC 配置
                      </button>
                    </div>
                  </form>
                ))}
            </div>
          )}
          {tab === 'story' && (
            <div className="space-y-6">
              <p className="max-w-prose text-sm leading-7 text-ink-soft">
                可编辑任务标题和说明。节点依赖、答案、奖励与结局规则通过版本化种子和测试维护。
              </p>
              {tasks.length === 0 && (
                <p className="rounded-xl border border-dashed border-line bg-surface px-6 py-10 text-sm leading-7 text-ink-soft">
                  暂无剧情任务。路线任务发布后，可在这里调整标题与说明。
                </p>
              )}
              {tasks.map((task) => (
                <form
                  key={task.id}
                  className="card space-y-5 p-5 sm:p-8"
                  onSubmit={(e) => {
                    e.preventDefault()
                    const data = new FormData(e.currentTarget)
                    void run(() =>
                      api.patch(`/admin/tasks/${task.id}`, {
                        title: data.get('title'),
                        briefing: data.get('briefing'),
                      }),
                    )
                  }}
                >
                  <div>
                    <h3 className="text-lg font-semibold text-ink">{task.title}</h3>
                    <p className="mt-1 break-words text-xs text-bluegray">{task.id}</p>
                  </div>
                  <label className={labelClass}>
                    标题
                    <input className={inputClass} name="title" defaultValue={task.title} required />
                  </label>
                  <label className={labelClass}>
                    任务说明
                    <textarea
                      name="briefing"
                      className={inputClass}
                      rows={4}
                      defaultValue={task.data.briefing}
                      required
                    />
                  </label>
                  <div className="border-t border-line pt-5">
                    <button className="btn-primary" disabled={busy}>
                      保存任务文案
                    </button>
                  </div>
                </form>
              ))}
            </div>
          )}
          {tab === 'audit' && (
            <div className="space-y-6">
              <div className="card p-5 sm:p-7">
                <label className={labelClass}>
                  纠错处理说明
                  <textarea
                    className={inputClass}
                    rows={4}
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                  />
                </label>
              </div>
              {dialogues.length === 0 && (
                <div className="rounded-xl border border-dashed border-line bg-surface px-6 py-10">
                  <h3 className="text-lg font-semibold text-ink">暂无对话记录。</h3>
                  <p className="mt-3 text-sm leading-7 text-ink-soft">
                    体验者与 NPC 对话后，记录与纠错反馈会出现在这里。
                  </p>
                </div>
              )}
              {dialogues.map((d) => (
                <article key={d.id} className="card space-y-4 p-5 sm:p-7">
                  <h3 className="break-words text-base font-semibold text-ink">
                    {d.npc_id}
                    {d.response.mock ? ' · Mock' : ''}
                  </h3>
                  <p className="max-w-prose break-words border-t border-line pt-4 text-sm leading-7 text-ink">
                    用户：{d.user_input}
                  </p>
                  <p className="max-w-prose break-words text-sm leading-7 text-ink-soft">
                    回复：{d.response.dialogue}
                  </p>
                  {d.feedback && (
                    <p className="max-w-prose break-words rounded-md bg-cinnabar/5 px-4 py-3 text-sm leading-7 text-cinnabar">
                      纠错：{d.feedback}
                    </p>
                  )}
                  {d.response.feedback_resolution && (
                    <p className="max-w-prose break-words text-sm leading-7 text-inkgreen">
                      已处理：{d.response.feedback_resolution}
                    </p>
                  )}
                  {d.feedback && (
                    <button
                      className="btn-secondary"
                      disabled={busy || resolution.length < 4}
                      onClick={() => {
                        void run(
                          () => api.post(`/admin/dialogues/${d.id}/resolve`, { resolution }),
                          '纠错处理已记录。',
                        )
                      }}
                    >
                      记录处理结果
                    </button>
                  )}
                </article>
              ))}
            </div>
          )}
          {tab === 'tests' && (
            <div className="card p-5 sm:p-8">
              {tests.length === 0 ? (
                <div className="py-4">
                  <h3 className="text-lg font-semibold text-ink">等待第一份评测记录</h3>
                  <p className="mt-3 text-sm leading-7 text-ink-soft">
                    数据库尚无已执行的评测记录；请运行评测脚本。
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {tests.map((t) => (
                    <li key={t.id} className="min-w-0 py-6 first:pt-0 last:pb-0">
                      <h3 className="break-words text-base font-semibold text-ink">
                        {t.id} · {t.category}
                      </h3>
                      <p className="mt-2 text-xs leading-6 text-bluegray">
                        {t.executed_at ?? '未执行'}
                      </p>
                      <pre className="mt-4 max-h-96 overflow-auto rounded-md bg-paper-deep p-4 text-xs leading-6 text-ink-soft">
                        {JSON.stringify(t.result, null, 2)}
                      </pre>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
