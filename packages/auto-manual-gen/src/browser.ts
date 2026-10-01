import { chromium, type Browser } from 'playwright'
import { envError } from './errors.js'

/**
 * 開 Chromium。Playwright 是 peer dependency，瀏覽器要使用者自己下載 ——
 * 沒下載時 Playwright 的錯誤訊息很長，這裡翻成一句「該怎麼補」，並歸類成環境問題（exit 3）。
 */
export async function launchChromium(): Promise<Browser> {
  try {
    return await chromium.launch()
  } catch (cause) {
    const message = (cause as Error).message
    if (/Executable doesn't exist|npx playwright install/.test(message)) {
      throw envError('BROWSER_MISSING', '找不到 Playwright 的 Chromium。請先執行：npx playwright install chromium', {}, { cause })
    }
    throw cause
  }
}
