import { strict as assert } from "node:assert"
import type { Locator, Page } from "playwright"
export type Shot = (name: string) => Promise<Buffer>
export interface ComposerFixture {
  readonly firstId: string
  readonly composer: Locator
  readonly koCell: Locator
  readonly enCell: Locator
  readonly review: Locator
}

export async function noHorizontalOverflow(page: Page): Promise<void> {
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
    "horizontal overflow",
  )
}
