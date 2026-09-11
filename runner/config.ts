import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** repo 根目錄 —— 根目錄本身就是一本手冊專案，所有相對路徑都以它為基準。 */
export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export interface AppConfig {
  app: {
    mode: 'electron' | 'web'
    electron: {
      /** 相對於 repo 根目錄 */
      projectDir: string
      buildBeforeLaunch: boolean
    }
    web: {
      url: string
    }
  }
  viewport: {
    width: number
    height: number
    /**
     * 截圖的解析度倍率。預設 2 —— 實際數字要從印刷需求往回推算（Day 10），
     * 這裡先給一個夠用的值。
     */
    deviceScaleFactor?: number
  }
  paths: Record<string, string>
  image: { width: number }
}

/**
 * 讀設定檔。`config.json` 是一人一份、不進版控的；沒有就退回 `config.example.json`，
 * 讓 clone 下來的 repo 不必先做任何設定就能跑起來。
 */
export function loadConfig(): AppConfig {
  const candidates = [path.join(repoRoot, 'config.json'), path.join(repoRoot, 'config.example.json')]
  const found = candidates.find((p) => fs.existsSync(p))

  if (!found) {
    throw new Error(
      `找不到設定檔。已找過：\n${candidates.map((p) => `  - ${p}`).join('\n')}\n` +
        `請複製 config.example.json 成 config.json。`,
    )
  }

  return JSON.parse(fs.readFileSync(found, 'utf-8')) as AppConfig
}
