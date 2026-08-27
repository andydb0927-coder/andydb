import { expect, test } from './provider-fixture'

function parseRgb(color: string): [number, number, number] {
  const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number)
  if (!channels || channels.length !== 3) {
    throw new Error(`Expected computed RGB color, received: ${color}`)
  }
  return channels as [number, number, number]
}

function relativeLuminance(color: string): number {
  const linear = parseRgb(color).map((channel) => {
    const normalized = channel / 255
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4
  })

  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(
    relativeLuminance(foreground),
    relativeLuminance(background),
  )
  const darker = Math.min(
    relativeLuminance(foreground),
    relativeLuminance(background),
  )
  return (lighter + 0.05) / (darker + 0.05)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/fixtures/ui-primitives.html')
})

test('Button text reaches WCAG AA contrast in default and hover states', async ({
  page,
}) => {
  const button = page.getByRole('button', { name: '打开项目' })
  const defaultColors = await button.evaluate((element) => {
    const styles = getComputedStyle(element)
    return { foreground: styles.color, background: styles.backgroundColor }
  })

  await button.hover()
  await page.waitForTimeout(200)
  const hoverColors = await button.evaluate((element) => {
    const styles = getComputedStyle(element)
    return { foreground: styles.color, background: styles.backgroundColor }
  })

  expect
    .soft(contrastRatio(defaultColors.foreground, defaultColors.background))
    .toBeGreaterThanOrEqual(4.5)
  expect
    .soft(contrastRatio(hoverColors.foreground, hoverColors.background))
    .toBeGreaterThanOrEqual(4.5)
})

test('Button shows a 2px visible outline when focused by keyboard', async ({
  page,
}) => {
  const button = page.getByRole('button', { name: '打开项目' })

  await page.keyboard.press('Tab')

  await expect(button).toBeFocused()
  const outline = await button.evaluate((element) => {
    const styles = getComputedStyle(element)
    return { style: styles.outlineStyle, width: styles.outlineWidth }
  })
  expect(outline).toEqual({ style: 'solid', width: '2px' })
})
