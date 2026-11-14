#!/usr/bin/env node
/**
 * Capture README screenshots against docker-compose.standalone.yml (after migrate + seed).
 *
 * Usage:
 *   npm install
 *   node scripts/capture-screenshots.mjs
 */

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const outDir = path.join(repoRoot, 'docs', 'images')

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'
const DEMO_EMAIL = process.env.DEMO_EMAIL ?? 'demo@example.com'
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'password123'
const DEMO_GROUP_ID = process.env.DEMO_GROUP_ID ?? '33333333-3333-4333-8333-333333333303'
const DRAFT_RECEIPT_ID = process.env.DEMO_DRAFT_RECEIPT_ID ?? '44444444-4444-4444-8444-444444444404'

const VIEWPORT = { width: 1440, height: 900 }

async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' })
  await page.locator('#login-email').fill(DEMO_EMAIL)
  await page.locator('#login-password').fill(DEMO_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 })
}

async function capture(page, fileName) {
  await page.setViewportSize(VIEWPORT)
  await page.screenshot({ path: path.join(outDir, fileName), fullPage: false })
}

async function main() {
  await mkdir(outDir, { recursive: true })

  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: VIEWPORT })
  const page = await context.newPage()

  try {
    await login(page)

    await page.goto(`${BASE_URL}/groups/${DEMO_GROUP_ID}`, { waitUntil: 'networkidle' })
    await page.getByText('Fictional Flatmates').first().waitFor({ timeout: 30_000 })
    await capture(page, 'hero.png')

    await page.goto(
      `${BASE_URL}/groups/${DEMO_GROUP_ID}/upload?receiptId=${DRAFT_RECEIPT_ID}`,
      { waitUntil: 'networkidle' },
    )
    await page.getByText('Review & Assign').waitFor({ timeout: 30_000 })
    await page.getByText('Moon Cheese Puffs').waitFor({ timeout: 10_000 })
    await capture(page, 'feature-01.png')

    await page.goto(`${BASE_URL}/groups/${DEMO_GROUP_ID}/history`, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Settlements' }).click()
    await page.getByText('Fictional fibre bill').waitFor({ state: 'hidden', timeout: 30_000 })
    await page.getByText(/paid via imaginary wallet/i).waitFor({ timeout: 30_000 })
    await capture(page, 'feature-02.png')
  } finally {
    await browser.close()
  }

  console.log('Wrote screenshots to', outDir)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})