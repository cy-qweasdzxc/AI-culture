import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const developerCopy = /工程演示|演示原型|开发演示|比赛演示|服务端|HttpOnly|待道路规划|待现场核验|正式版本|Mock 模型|未配置地图密钥/
const screenshots = resolve(process.cwd(), '../browser-qa/2026-10-28-release/screenshots')
mkdirSync(screenshots, { recursive: true })

async function checkPage(page: Page) {
  const main = page.locator('main#main-content')
  await expect(main).toBeVisible()
  await expect(main.getByRole('heading', { level: 1 })).toBeVisible()
  expect(await main.innerText()).not.toMatch(developerCopy)
  await expect(page.getByRole('contentinfo', { name: '网站页脚' })).toHaveCount(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
}

test('正式展示：公共页面、页脚声明、路线推荐及旧入口兼容', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  for (const [path, name] of [['/', 'home'], ['/theme', 'theme'], ['/intro', 'intro'], ['/role', 'role'], ['/missing-page', 'not-found']]) {
    await page.goto(path)
    await checkPage(page)
    await page.screenshot({ path: resolve(screenshots, `${info.project.name}-${name}.png`), fullPage: true })
    if (name === 'home') await page.screenshot({ path: resolve(screenshots, `${info.project.name}-home-viewport.png`) })
  }
  await page.goto('/theme')
  await expect(page.getByRole('link', { name: '选择这条完整路线' })).toBeVisible()
  await expect(page.getByRole('heading', { name: /片段预览/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '推荐可用路线' })).toBeEnabled()
  await page.getByRole('button', { name: '推荐可用路线' }).click()
  await expect(page.getByRole('link', { name: '选择角色，开始旅程' })).toBeVisible()
  await checkPage(page)
  const footer = page.getByRole('contentinfo', { name: '网站页脚' })
  await footer.locator('summary').click()
  await expect(footer.getByRole('heading', { name: '内容与来源' })).toBeVisible()
  await expect(footer.getByRole('heading', { name: '出行与隐私' })).toBeVisible()
  await page.screenshot({ path: resolve(screenshots, `${info.project.name}-footer.png`), fullPage: true })
  if (info.project.name === 'mobile') {
    await page.getByRole('button', { name: '打开导航菜单' }).click()
    await page.getByRole('navigation', { name: '移动端主要导航' }).getByRole('link', { name: '玩法说明' }).click()
    await expect(page).toHaveURL(/\/intro$/)
    await expect(page.getByRole('button', { name: '打开导航菜单' })).toHaveAttribute('aria-expanded', 'false')
  }
  await page.goto('/demo')
  await expect(page).toHaveURL(/\/role$/)
  await checkPage(page)
  expect(errors).toEqual([])
})

test('正式展示：开始旅程后地图、景点、对话、任务与回顾页面', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/role')
  await page.getByRole('radio', { name: /沈观澜/ }).click()
  await page.getByRole('button', { name: '创建旅程，开始体验' }).click()
  await expect(page).toHaveURL(/\/map$/)
  await checkPage(page)
  await page.getByRole('button', { name: '平江路，已发现' }).click()
  await page.getByRole('button', { name: '到达此点（虚拟游览）' }).click()
  await expect(page).toHaveURL(/\/spot\/pingjiang$/)
  const routes = [
    ['/spot/pingjiang', 'spot'], ['/map', 'map'], ['/chat/zhou-bo', 'chat'],
    ['/task/task-shuangqipan', 'task'], ['/clues', 'clues'], ['/codex', 'codex'],
    ['/report', 'report'], ['/settings', 'settings'],
  ]
  for (const [path, name] of routes) {
    await page.goto(path)
    await checkPage(page)
    await page.screenshot({ path: resolve(screenshots, `${info.project.name}-${name}.png`), fullPage: true })
  }
  await page.goto('/demo')
  await expect(page).toHaveURL(/\/role$/)
  await page.getByRole('radio', { name: /沈观澜/ }).click()
  await page.getByRole('button', { name: '创建旅程，开始体验' }).click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.keyboard.press('Escape')
  expect(errors).toEqual([])
})
