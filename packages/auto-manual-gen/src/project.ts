/**
 * 手冊專案：從目前目錄往上找 `manual.yaml`，找到的那一層就是根目錄 —— 跟 ESLint、Vite 找設定檔的方式一樣。
 * 所有使用者的路徑（manifest、docs、screenshots、output、App）都以它為基準，跟這個套件裝在哪裡無關。
 *
 * 設定分兩層：
 * - `manual.yaml`：整個專案共用、進版控。
 * - `config.json`：一人一份、不進版控，只能覆寫 `app`（例如自己機器上的 web.url）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import { usageError } from './errors.js'
import type { Localized } from './manifest.js'
import { asset } from './paths.js'
import { checkManual } from './schema.js'

export const MANUAL_FILE = 'manual.yaml'
export const LOCAL_CONFIG_FILE = 'config.json'

export type AppMode = 'electron' | 'web' | 'custom'

export type AppSettings = {
  mode: AppMode
  electron?: { projectDir: string; build?: string | boolean }
  web?: { url: string }
  custom?: { driver: string }
}

export type Viewport = { width: number; height: number; deviceScaleFactor?: number }

export type Manual = {
  profile: string
  /** 封面上的手冊名稱 */
  title: Localized
  version: string
  /** 這本手冊要出哪些語言，第一個是主語言：正文放 `docs/`，其他語言放 `docs/{locale}/` */
  locales: string[]
  bootstrap: {
    viewport: Viewport
    storage?: Record<string, string>
    /** App 從 localStorage 的哪個 key 讀語言。逐語言重跑時換的就是這個值。 */
    localeKey?: string
    /** 開機完成的信號（testid）。 */
    ready?: string
    clock?: string
    disableAnimations?: boolean
  }
  app: AppSettings
  paths?: Partial<Record<'manifest' | 'docs' | 'screenshots' | 'output' | 'template' | 'css', string>>
  text?: { messages?: string }
  tour?: { output: string }
}

export type Project = {
  root: string
  manual: Manual
  /** 都是絕對路徑 */
  paths: { manifest: string; docs: string; screenshots: string; output: string; template: string; css: string }
}

export function findProjectRoot(from: string): string | null {
  let dir = path.resolve(from)
  while (true) {
    if (fs.existsSync(path.join(dir, MANUAL_FILE))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

function readYaml(file: string): unknown {
  try {
    return parse(fs.readFileSync(file, 'utf-8'))
  } catch (cause) {
    throw usageError('CONFIG_INVALID', `${file} 不是合法的 YAML：${(cause as Error).message}`, { file }, { cause })
  }
}

export function loadProject(cwd = process.cwd()): Project {
  const root = findProjectRoot(cwd)
  if (!root) {
    throw usageError(
      'PROJECT_NOT_FOUND',
      `從 ${cwd} 往上都找不到 ${MANUAL_FILE}。\n` + `請在手冊專案裡執行，或先用 auto-manual-gen init 建立一個。`,
      { cwd },
    )
  }

  const manual = readYaml(path.join(root, MANUAL_FILE)) as Manual
  const localFile = path.join(root, LOCAL_CONFIG_FILE)
  if (fs.existsSync(localFile) && manual && typeof manual === 'object') {
    const local = JSON.parse(fs.readFileSync(localFile, 'utf-8')) as { app?: Partial<AppSettings> }
    const extra = Object.keys(local).filter((k) => k !== 'app' && k !== '$schema')
    if (extra.length > 0) {
      throw usageError(
        'CONFIG_INVALID',
        `${LOCAL_CONFIG_FILE} 只能覆寫 app（個人環境），不認得：${extra.join(' / ')}。專案共用的設定請寫在 ${MANUAL_FILE}`,
        { file: localFile },
      )
    }
    const base = manual.app ?? ({} as AppSettings)
    const over = local.app ?? {}
    manual.app = {
      ...base,
      ...over,
      ...((base.electron || over.electron) && { electron: { ...base.electron, ...over.electron } as AppSettings['electron'] }),
      ...((base.web || over.web) && { web: { ...base.web, ...over.web } as AppSettings['web'] }),
      ...((base.custom || over.custom) && { custom: { ...base.custom, ...over.custom } as AppSettings['custom'] }),
    }
  }

  const problems = checkManual(manual, MANUAL_FILE)
  if (problems.length === 0 && manual.locales.length > 1 && !manual.bootstrap.localeKey) {
    problems.push(`${MANUAL_FILE}: locales 有 ${manual.locales.length} 個語言，但沒有設定 bootstrap.localeKey —— runner 不知道要怎麼切換 App 的語言`)
  }
  if (problems.length > 0) {
    throw usageError('CONFIG_INVALID', `${MANUAL_FILE} 設定有誤（${problems.length} 個問題）：\n${problems.map((p) => `  - ${p}`).join('\n')}`, {
      problems,
    })
  }

  const p = manual.paths ?? {}
  const at = (v: string | undefined, fallback: string) => path.resolve(root, v ?? fallback)
  return {
    root,
    manual,
    paths: {
      manifest: at(p.manifest, 'manifest'),
      docs: at(p.docs, 'docs'),
      screenshots: at(p.screenshots, 'screenshots'),
      output: at(p.output, 'output'),
      template: p.template ? at(p.template, '') : asset('reference.docx'),
      css: p.css ? at(p.css, '') : asset('manual.css'),
    },
  }
}

let current: Project | undefined

/** 目前的手冊專案。第一次呼叫時才去找，所以 init、doctor 這種不需要專案的指令不會被擋下來。 */
export function project(): Project {
  return (current ??= loadProject())
}

/** 錯誤訊息與輸出裡的路徑一律相對於專案根目錄，複製貼上就能用。 */
export const rel = (p: string) => path.relative(project().root, p).split(path.sep).join('/')
