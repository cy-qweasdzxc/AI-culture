import { useEffect, useState } from 'react'
import TypeTag from '@/components/TypeTag'
import { api, ApiError } from '@/services/api'
import type { KnowledgeType } from '@/types'

interface KnowledgeForm {
  id: string; story_id: string; location_id: string; title: string; content: string
  content_type: KnowledgeType; source: string; source_url: string; license: string
  tags: string[]; min_chapter: number
}
interface Knowledge extends Omit<KnowledgeForm, 'min_chapter'> {
  review_status: string; version: number; is_demo: boolean
  metadata: { min_chapter?: number }
}
interface Character {
  id: string; kind: string; name: string
  data: { greeting?: string; knowledgeScope?: string; personality?: string[] }
}
interface Task { id: string; title: string; data: { briefing: string } }
interface Dialogue {
  id: string; npc_id: string; user_input: string; feedback: string | null
  response: { dialogue?: string; feedback_resolution?: string; mock?: boolean }
}
interface TestRecord { id: string; category: string; result: unknown; executed_at: string | null }
interface RetrievalResult {
  items: { id: string; chunkId: string; score: number; lexicalScore: number; vectorScore: number
    type: string; title: string; source: string; source_url: string }[]
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
  id: '', story_id: 'suzhou-pingjiang', location_id: 'pingjiang', title: '', content: '',
  content_type: 'fact', source: '', source_url: '', license: '', tags: [], min_chapter: 1,
}
const tabs = [
  ['metrics', '运行指标'], ['knowledge', '文化资料'], ['characters', 'NPC 配置'],
  ['story', '剧情任务'], ['audit', '对话纠错'], ['tests', '测试记录'],
] as const
type Tab = typeof tabs[number][0]
// 三种检索模式用于对照实验：关键词不需要向量模型，向量与混合需要可用的 Embedding。
const retrievalModes = [
  ['keyword', '关键词检索'],
  ['vector', '向量检索'],
  ['hybrid', '混合检索'],
] as const
type RetrievalMode = typeof retrievalModes[number][0]
const inputClass = 'min-h-11 w-full rounded border border-line bg-paper px-3 py-2 text-sm'

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
    setKnowledge(k.items); setCharacters(c.items); setTasks(s.tasks)
    setDialogues(d.items); setMetrics(m); setTests(t.items)
  }
  async function run(work: () => Promise<unknown>, message = '操作已保存。') {
    setBusy(true); setError(''); setNotice('')
    try { await work(); await refresh(); setNotice(message) }
    catch (e) {
      setError(e instanceof Error ? e.message : '操作失败，请重试。')
      if (e instanceof ApiError && e.status === 401) setActor(undefined)
    } finally { setBusy(false) }
  }
  useEffect(() => {
    let alive = true
    api.get<{ username: string }>('/admin/me').then(async (result) => {
      if (alive) { setActor(result.username); await refresh() }
    }).catch((e: unknown) => {
      if (alive && !(e instanceof ApiError && e.status === 401)) {
        setError(e instanceof Error ? e.message : '管理员会话读取失败。')
      }
    }).finally(() => { if (alive) setChecking(false) })
    return () => { alive = false }
  }, [])
  function edit(k: Knowledge) {
    setForm({
      id: k.id, story_id: k.story_id, location_id: k.location_id, title: k.title,
      content: k.content, content_type: k.content_type, source: k.source,
      source_url: k.source_url, license: k.license, tags: k.tags,
      min_chapter: k.metadata.min_chapter ?? 1,
    })
    setEditingVersion(k.version); setConfirmed(false)
  }
  const alerts = <>
    {error && <p role="alert" className="mt-4 rounded border border-cinnabar p-3 text-sm text-cinnabar">{error}</p>}
    {notice && <p role="status" className="mt-4 text-sm text-inkgreen">{notice}</p>}
  </>
  if (checking) return <p className="p-8 text-center">正在读取管理员会话…</p>
  if (!actor) return <div className="mx-auto max-w-md px-4 py-12">
    <h1 className="font-serif text-2xl">管理后台登录</h1>
    <p className="mt-3 text-sm text-bluegray">使用服务端配置的管理员账号。登录状态有效期为两小时。</p>
    {alerts}
    <form className="mt-5 space-y-4" onSubmit={(e) => {
      e.preventDefault()
      void run(async () => {
        const result = await api.post<{ username: string }>('/admin/login', { username, password })
        setActor(result.username); setPassword('')
      }, '已登录。')
    }}>
      <label className="block">账号<input className={inputClass} autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required /></label>
      <label className="block">密码<input className={inputClass} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
      <button className="btn-primary" disabled={busy}>登录</button>
    </form>
  </div>
  return <div className="mx-auto max-w-6xl px-4 py-8">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="font-serif text-2xl font-bold">管理后台</h1>
      <button className="btn-secondary" disabled={busy} onClick={() => {
        void api.post('/admin/logout').then(() => setActor(undefined)).catch((e: unknown) => setError(e instanceof Error ? e.message : '退出失败。'))
      }}>{actor} · 退出</button>
    </div>
    {alerts}
    <div className="mt-5 flex overflow-x-auto border-b border-line" role="tablist" aria-label="后台模块">
      {tabs.map(([key, label]) => <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`min-h-11 shrink-0 px-4 text-sm ${tab === key ? 'border-b-2 border-cinnabar text-cinnabar' : ''}`}>{label}</button>)}
    </div>
    <div className="mt-6">
      {tab === 'metrics' && <>
        <dl className="grid gap-3 sm:grid-cols-3">{Object.entries(metrics).filter(([, value]) => typeof value === 'number').map(([key, value]) => <div key={key} className="card p-4"><dt className="text-xs text-bluegray">{key}</dt><dd className="mt-2 text-2xl">{String(value)}</dd></div>)}</dl>
        <p className="mt-4 text-sm text-bluegray">数值来自服务端数据库。性能测量见测试报告；此处没有实时性能监控。</p>
      </>}
      {tab === 'knowledge' && <div className="space-y-5">
        <form className="card grid gap-3 p-5 sm:grid-cols-2" onSubmit={(e) => {
          e.preventDefault()
          void run(async () => {
            if (editingVersion) await api.put(`/admin/knowledge/${form.id}`, { ...form, version: editingVersion })
            else await api.post('/admin/knowledge', form)
            setForm({ ...emptyForm }); setEditingVersion(undefined)
          }, '资料已保存为待审核；修改会撤销旧审核与索引。')
        }}>
          <h2 className="sm:col-span-2">{editingVersion ? `编辑资料 · 版本 ${editingVersion}` : '新增待审核资料'}</h2>
          {(['id', 'location_id', 'title', 'source', 'source_url', 'license'] as const).map((key) => <label key={key} className="text-sm">{({ id: '条目 ID', location_id: '点位 ID', title: '标题', source: '来源名称', source_url: '来源 URL', license: '授权说明' })[key]}<input className={inputClass} disabled={key === 'id' && !!editingVersion} required={key !== 'source_url'} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></label>)}
          <label>资料类型<select className={inputClass} value={form.content_type} onChange={(e) => setForm({ ...form, content_type: e.target.value as KnowledgeType })}>{['fact', 'disputed', 'legend', 'fiction'].map((type) => <option key={type}>{type}</option>)}</select></label>
          <label>最早可见章节<input className={inputClass} type="number" min={1} max={100} value={form.min_chapter} onChange={(e) => setForm({ ...form, min_chapter: Number(e.target.value) })} required /></label>
          <label className="sm:col-span-2">正文<textarea className={inputClass} rows={5} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} required /></label>
          <div className="flex gap-2 sm:col-span-2"><button className="btn-primary" disabled={busy}>保存为待审核</button><button className="btn-secondary" type="button" onClick={() => { setForm({ ...emptyForm }); setEditingVersion(undefined) }}>清空编辑</button></div>
        </form>
        <div className="card space-y-3 p-5">
          <h2>人工审核</h2>
          <input aria-label="审核人员" placeholder="审核人员姓名或内部编号" className={inputClass} value={reviewer} onChange={(e) => setReviewer(e.target.value)} />
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />我已核对当前条目的正文、来源 URL 与授权说明。</label>
          <p className="text-xs text-bluegray">“通过审核”会记录人工确认。每条资料都须分别核对；审核通过后才可发布检索索引。</p>
        </div>
        {knowledge.map((k) => <article key={k.id} className="card p-5">
          <div className="flex flex-wrap gap-2"><strong>{k.title}</strong><TypeTag type={k.content_type} /><span className="chip">{k.review_status} · v{k.version}{k.is_demo ? ' · 演示资料' : ''}</span></div>
          <p className="mt-2 whitespace-pre-wrap text-sm">{k.content}</p>
          <p className="mt-2 break-all text-xs text-bluegray">来源：{k.source} · {k.source_url || 'URL 待补充'} · 授权：{k.license}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn-secondary" disabled={busy} onClick={() => edit(k)}>编辑</button>
            <button className="btn-secondary" disabled={busy || reviewer.length < 2 || !confirmed} onClick={() => {
              void run(async () => {
                await api.post(`/admin/knowledge/${k.id}/review`, { version: k.version, status: 'reviewed', reviewer, confirm_sources: confirmed })
                setConfirmed(false)
              }, '已记录人工审核；请另行发布索引。')
            }}>通过审核</button>
            <button className="btn-secondary" disabled={busy || reviewer.length < 2} onClick={() => {
              void run(() => api.post(`/admin/knowledge/${k.id}/review`, { version: k.version, status: 'rejected', reviewer, confirm_sources: false }), '已拒绝并撤销索引。')
            }}>拒绝</button>
            <button className="btn-secondary" disabled={busy || k.review_status !== 'reviewed'} onClick={() => { void run(() => api.post(`/admin/knowledge/${k.id}/publish`), '检索索引已发布。') }}>发布索引</button>
          </div>
        </article>)}
        <form className="card space-y-3 p-5" onSubmit={(e) => {
          e.preventDefault()
          void run(async () => setRetrieved(await api.post<RetrievalResult>('/admin/retrieval/test', {
            query, story_id: form.story_id, location_id: form.location_id,
            chapter: form.min_chapter, mode: retrievalMode, limit: retrievalLimit,
          })), '检索测试已执行。')
        }}>
          <h2>检索测试 · 当前编辑点位与章节</h2>
          <p className="text-sm text-bluegray">
            同一问题可用三种模式对照。关键词模式不需要向量模型；向量与混合模式需要配置 Embedding，
            未配置或调用失败时会明确报错，不会伪装成已执行。
          </p>
          <div className="flex flex-wrap gap-3">
            <label className="flex-1">检索问题
              <input aria-label="检索问题" className={inputClass} value={query} onChange={(e) => setQuery(e.target.value)} required />
            </label>
            <label>检索模式
              <select aria-label="检索模式" className={inputClass} value={retrievalMode}
                onChange={(e) => setRetrievalMode(e.target.value as RetrievalMode)}>
                {retrievalModes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>结果上限
              <input aria-label="结果上限" className={inputClass} type="number" min={1} max={20}
                value={retrievalLimit} onChange={(e) => setRetrievalLimit(Number(e.target.value))} />
            </label>
          </div>
          <button className="btn-secondary" disabled={busy}>测试检索</button>
          {retrieved && <div className="space-y-2">
            <p className="text-xs text-bluegray">
              实际执行：<strong>{retrieved.mode}</strong>
              {retrieved.requestedMode !== retrieved.mode && `（请求 ${retrieved.requestedMode}，已降级）`}
              ｜候选库 {retrieved.corpusCount} 块｜用时 {retrieved.elapsedMs} ms
              ｜阈值 lexical≥{String(retrieved.retrievalConfig.lexical_min_score)}、vector≥{String(retrieved.retrievalConfig.vector_min_score)}
            </p>
            {retrieved.embeddingError && <p className="text-xs">向量模型调用失败：{retrieved.embeddingError}（已按关键词结果返回）</p>}
            {retrieved.items.length === 0 && <p className="text-sm">没有命中任何已审核证据。这是正常的拒答前提，不是检索故障。</p>}
            <ol className="space-y-1 text-sm">
              {retrieved.items.map((item) => <li key={item.chunkId}>
                {item.title}（{item.type}）· {item.source}
                ｜综合 {item.score.toFixed(4)}（关键词 {item.lexicalScore.toFixed(4)} / 向量 {item.vectorScore.toFixed(4)}）
              </li>)}
            </ol>
            <details><summary className="text-xs text-bluegray">原始返回</summary>
              <pre className="overflow-x-auto text-xs">{JSON.stringify(retrieved, null, 2)}</pre>
            </details>
          </div>}
        </form>
      </div>}
      {tab === 'characters' && <div className="space-y-4">{characters.filter((c) => c.kind === 'npc').map((c) => <form key={c.id} className="card space-y-3 p-5" onSubmit={(e) => {
        e.preventDefault(); const data = new FormData(e.currentTarget)
        void run(() => api.patch(`/admin/characters/${c.id}`, { name: data.get('name'), greeting: data.get('greeting'), knowledge_scope: data.get('scope'), personality: c.data.personality ?? [] }))
      }}><h2>{c.id}</h2><label className="block">名称<input name="name" className={inputClass} defaultValue={c.name} required /></label><label className="block">开场白<textarea name="greeting" className={inputClass} defaultValue={c.data.greeting} required /></label><label className="block">知识边界<textarea name="scope" className={inputClass} defaultValue={c.data.knowledgeScope} required /></label><button className="btn-primary" disabled={busy}>保存 NPC 配置</button></form>)}</div>}
      {tab === 'story' && <div className="space-y-4"><p className="text-sm text-bluegray">可编辑任务标题和说明。节点依赖、答案、奖励与结局规则通过版本化种子和测试维护。</p>{tasks.map((task) => <form key={task.id} className="card space-y-3 p-5" onSubmit={(e) => {
        e.preventDefault(); const data = new FormData(e.currentTarget)
        void run(() => api.patch(`/admin/tasks/${task.id}`, { title: data.get('title'), briefing: data.get('briefing') }))
      }}><h2>{task.id}</h2><label className="block">标题<input className={inputClass} name="title" defaultValue={task.title} required /></label><label className="block">任务说明<textarea name="briefing" className={inputClass} defaultValue={task.data.briefing} required /></label><button className="btn-primary" disabled={busy}>保存任务文案</button></form>)}</div>}
      {tab === 'audit' && <div className="space-y-4">
        <label className="block">纠错处理说明<textarea className={inputClass} value={resolution} onChange={(e) => setResolution(e.target.value)} /></label>
        {dialogues.length === 0 && <p>暂无对话记录。</p>}
        {dialogues.map((d) => <article key={d.id} className="card space-y-2 p-5"><h2>{d.npc_id}{d.response.mock ? ' · Mock' : ''}</h2><p className="text-sm">用户：{d.user_input}</p><p className="text-sm">回复：{d.response.dialogue}</p>{d.feedback && <p className="text-sm text-cinnabar">纠错：{d.feedback}</p>}{d.response.feedback_resolution && <p className="text-sm">已处理：{d.response.feedback_resolution}</p>}{d.feedback && <button className="btn-secondary" disabled={busy || resolution.length < 4} onClick={() => { void run(() => api.post(`/admin/dialogues/${d.id}/resolve`, { resolution }), '纠错处理已记录。') }}>记录处理结果</button>}</article>)}
      </div>}
      {tab === 'tests' && <div className="card p-5">{tests.length === 0 ? <p>数据库尚无已执行的评测记录；请运行评测脚本。</p> : <ul className="space-y-3">{tests.map((t) => <li key={t.id}><strong>{t.id} · {t.category}</strong><p className="text-xs">{t.executed_at ?? '未执行'}</p><pre className="overflow-x-auto text-xs">{JSON.stringify(t.result, null, 2)}</pre></li>)}</ul>}</div>}
    </div>
  </div>
}
