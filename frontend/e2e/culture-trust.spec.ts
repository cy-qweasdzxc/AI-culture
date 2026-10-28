import { expect, test } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import { randomUUID } from 'node:crypto'

// Only synthetic fiction in an isolated Mock database is reviewed by this test.
test('候选、人工审核、内容换版与撤审在公开页和证据抽屉中保持一致', async ({ page }) => {
  const api = page.request
  async function request(method: string, url: string, data?: unknown, expected = 200) {
    const response = await api.fetch(`/api${url}`, { method, data })
    expect(response.status(), `${method} ${url}: ${await response.text()}`).toBe(expected)
    return response.json()
  }
  async function action(client: APIRequestContext, extra: Record<string, unknown>) {
    const response = await client.get('/api/journeys/current')
    expect(response.status()).toBe(200)
    const { snapshot: state } = await response.json()
    return { journey_id: state.journeyId, state_version: state.stateVersion, request_id: randomUUID(), ...extra }
  }
  const password = process.env.E2E_ADMIN_PASSWORD
  expect(password, 'Isolated test admin credentials must be configured').toBeTruthy()
  await request('POST', '/admin/login', { username: 'admin', password })
  await request('POST', '/session')
  await request('POST', '/journeys/start', { role_id: 'scholar', mode: 'virtual' })
  await request('POST', '/location/trigger', await action(api, { spot_id: 'pingjiang' }))
  const id = `browser-trust-${randomUUID()}`
  // Keep the query unique without polluting other tests with an unbroken UUID title.
  const token = id.slice('browser-trust-'.length).replaceAll('-', '').slice(0, 12)
  const title = `合成工程资料 ${token}`
  const body = { id, location_id: 'pingjiang', title, content_type: 'fiction',
    content: `${token} 合成古桥是工程测试中的虚构桥梁,第一版本。`,
    source: '工程合成资料，不是实际文化史料', source_url: `https://example.invalid/${id}/v1`,
    license: '自编合成测试许可第一版' }
  await request('POST', '/admin/knowledge', body, 201)
  const pending = await request('GET', '/places/pingjiang')
  expect(pending.knowledge.some((k: { id: string }) => k.id === id)).toBe(false)
  expect(pending.source_candidates.find((k: { id: string }) => k.id === id)).toMatchObject({
    review_status: 'pending', trust_level: 'unverified', is_demo: false, is_fictional: true, human_review_verified: false,
  })
  await page.goto('/spot/pingjiang')
  await page.locator('summary').filter({ hasText: '参考资料 · 待核验' }).click()
  const card = page.locator('article').filter({ has: page.getByRole('heading', { name: title, exact: true }) })
  await expect(card.getByText('未核验或待人工确认', { exact: true })).toBeVisible()
  await expect(card.getByText('剧情虚构 · 不作为文化史实', { exact: true })).toBeVisible()
  await expect(card.getByRole('link', { name: '查看原始来源' })).toHaveAttribute('href', body.source_url)
  async function review(version: number, status = 'reviewed') {
    return request('POST', `/admin/knowledge/${id}/review`, { version, status,
      reviewer: '合成工程验收员，不是文化素材审核', confirm_sources: true })
  }
  async function chat() {
    return request('POST', '/chat/message', await action(api, { npc_id: 'zhou-bo', message: token }))
  }
  await review(1)
  await request('POST', `/admin/knowledge/${id}/publish`)
  const first = await chat()
  expect(first.evidence_ids).toContain(id)
  await page.goto('/chat/zhou-bo')
  const citations = page.getByRole('button', { name: `证据 · ${title}`, exact: true })
  await citations.last().click()
  const drawer = page.getByRole('dialog', { name: '证据来源', exact: true })
  await expect(drawer.getByText('已记录人工审核', { exact: true })).toBeVisible()
  await expect(drawer.getByText('剧情虚构 · 不作为文化史实', { exact: true })).toBeVisible()
  await expect(drawer.getByRole('link', { name: '查看原始来源' })).toHaveAttribute('href', body.source_url)
  await drawer.getByRole('button', { name: '关闭', exact: true }).click()
  const v2 = { ...body, version: 2, content: `${token} 合成古桥是工程测试中的虚构桥梁,第二版本。`,
    source_url: `https://example.invalid/${id}/v2`, license: '自编合成测试许可第二版' }
  await request('PUT', `/admin/knowledge/${id}`, v2)
  await review(3)
  await request('POST', `/admin/knowledge/${id}/publish`)
  const second = await chat()
  expect(second.evidence.find((e: { id: string }) => e.id === id)).toMatchObject({ version: 4, source_url: v2.source_url })
  await page.reload()
  await expect(citations).toHaveCount(2)
  await citations.last().click()
  await expect(drawer.getByRole('link', { name: '查看原始来源' })).toHaveAttribute('href', v2.source_url)
  await expect(drawer.getByText(v2.content, { exact: true })).toBeVisible()
  await expect(drawer.getByText('已记录人工审核', { exact: true })).toBeVisible()
  await drawer.getByRole('button', { name: '关闭', exact: true }).click()
  await citations.first().click()
  await expect(drawer.getByText('历史引用 · 当前审核或版本已失效', { exact: true })).toBeVisible()
  await expect(drawer.getByRole('link', { name: '查看原始来源' })).toHaveAttribute('href', body.source_url)
  await drawer.getByRole('button', { name: '关闭', exact: true }).click()
  await review(4, 'rejected')
  await page.reload()
  await citations.last().click()
  await expect(drawer.getByText('历史引用 · 当前审核或版本已失效', { exact: true })).toBeVisible()
  await expect(drawer.getByText('已记录人工审核', { exact: true })).toHaveCount(0)
  expect((await chat()).evidence_ids).not.toContain(id)
})
