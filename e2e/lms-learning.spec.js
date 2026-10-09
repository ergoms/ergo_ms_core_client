import { expect, test } from '@playwright/test'

const username = process.env.ERGO_E2E_USER
const password = process.env.ERGO_E2E_PASSWORD
const coursePath = process.env.ERGO_E2E_LMS_COURSE

async function login(page) {
  await page.goto('/login')
  await page.locator('#login').fill(username)
  await page.locator('#password').fill(password)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL('**/home**', { timeout: 30_000 })
}

test.describe('lms learning', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!username || !password, 'ERGO_E2E_USER / ERGO_E2E_PASSWORD не заданы')
    await login(page)
  })

  test('learner cabinet opens without a false completion', async ({ page }) => {
    await page.goto('/lms')
    await expect(page.locator('body')).toBeVisible()
    await expect(page.getByText('Урок завершён')).toHaveCount(0)
    await page.goto('/lms/my-learning')
    await expect(page.locator('body')).toBeVisible()
  })

  test('lost network does not show a successful lesson finish', async ({ page }) => {
    test.skip(!coursePath, 'ERGO_E2E_LMS_COURSE не задан: нужен курс отдельной организации')
    await page.goto(coursePath)
    await page.context().setOffline(true)
    await page.reload({ waitUntil: 'commit' }).catch(() => {})
    await expect(page.locator('body')).toBeVisible()
    await expect(page.getByText('Урок завершён')).toHaveCount(0)
    await page.context().setOffline(false)
  })
})
