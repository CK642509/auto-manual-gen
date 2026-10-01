import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 套件自己的根目錄（裝在使用者專案裡時是 `node_modules/auto-manual-gen/`）。
 * 只用來找套件附帶的檔案：schema、Word / TTS 的腳本、預設樣式。
 * 使用者的檔案一律以 `project().root` 為基準，兩者不能混用。
 */
export const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const asset = (name: string) => path.join(packageRoot, 'assets', name)
