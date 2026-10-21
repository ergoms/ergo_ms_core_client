import { expect, test } from './runtime.js'

const username = process.env.ERGO_E2E_USER
const password = process.env.ERGO_E2E_PASSWORD

test.describe('core shell', () => {
  test('login opens home, profile and notifications', async ({ page }) => {
    test.skip(!username || !password, 'ERGO_E2E_USER / ERGO_E2E_PASSWORD не заданы')

    await page.goto('/login')
    await page.locator('#login').fill(username)
    await page.locator('#password').fill(password)
    await page.locator('button[type="submit"]').click()
    await page.waitForURL('**/home**', { timeout: 30_000 })
    await expect(page.locator('nav, [role="navigation"], .sidebar, .app-sidebar').first()).toBeVisible({
      timeout: 15_000,
    })

    const tokenInStorage = await page.evaluate(() => {
      const keys = Object.keys(window.localStorage)
      return keys.some((key) => /jwt|access|token/i.test(key) && window.localStorage.getItem(key))
    })
    expect(tokenInStorage, 'JWT не должен лежать в localStorage').toBeFalsy()

    await page.goto('/user')
    await expect(page).toHaveURL(/\/user/)

    await page.goto('/user/notifications')
    await expect(page).toHaveURL(/\/user\/notifications/)
  })
})
