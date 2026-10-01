/**
 * 在別人的專案裡產生一份最小可跑的骨架：
 *
 *   auto-manual-gen init                                     # Web App，預設 http://localhost:3000
 *   auto-manual-gen init --url http://localhost:5173
 *   auto-manual-gen init --mode electron --app-dir ../my-app
 *   auto-manual-gen init --locale en                         # 主語言是英文
 *
 * 目標是 init 完接著跑 run，就能拿到第一張截圖 —— 第一次使用的人要的不是完整功能，而是五分鐘內看到東西動起來。
 * 已經存在的檔案一律不覆蓋。
 *
 * 不產生 UI-MAP.md、QUIRKS.md 這類給 agent 的上下文：那些是產品本身的知識，沒辦法事先寫好。
 */
import fs from 'node:fs'
import path from 'node:path'
import { usageError } from '../errors.js'
import { findProjectRoot, MANUAL_FILE } from '../project.js'
import { ui } from '../ui.js'

export type InitOptions = { mode?: string; url?: string; appDir?: string; locale?: string }

const SCHEMA_BASE = 'https://ck642509.github.io/auto-manual-gen/schema/v1'
const DOCS_URL = 'https://github.com/CK642509/auto-manual-gen/tree/main/packages/auto-manual-gen#readme'

const TEXT = {
  'zh-Hant': {
    title: '使用手冊',
    overview: '介面總覽',
    intro: '開啟 App 之後看到的第一個畫面。',
    stepsComment: '先拍一張首頁。接著用 auto-manual-gen probe 看畫面上有哪些 testid，再加上 annotate 標註',
  },
  en: {
    title: 'User Manual',
    overview: 'Overview',
    intro: 'The first screen you see after opening the app.',
    stepsComment: 'Start with one screenshot of the home screen. Then run auto-manual-gen probe to list testids and add annotate',
  },
} as const

const GITIGNORE = ['# auto-manual-gen', 'config.json', 'screenshots/', 'output/', '*.webm', '*.mp4']

function manualYaml(o: { locale: keyof typeof TEXT; mode: 'web' | 'electron'; url: string; appDir: string }): string {
  const t = TEXT[o.locale]
  const app =
    o.mode === 'web'
      ? ['app:', '  mode: web', '  web:', `    url: ${o.url}`]
      : ['app:', '  mode: electron', '  electron:', `    projectDir: ${o.appDir}`, '    # 第一章開機前先打包；手冊要拍的是打包後的樣子', '    build: npm run build']
  return [
    `# yaml-language-server: $schema=${SCHEMA_BASE}/manual.json`,
    '#',
    '# 手冊專案的根設定檔。auto-manual-gen 從目前目錄往上找這個檔案，所有相對路徑都以這裡為基準。',
    `# 每個欄位的說明：${DOCS_URL}`,
    'profile: my-app',
    `title: ${t.title}`,
    "version: '0.1.0'",
    `locales: [${o.locale}]`,
    '',
    'bootstrap:',
    '  viewport: { width: 1280, height: 800, deviceScaleFactor: 2 }',
    '  # 開機完成的信號：這個 testid 出現才開始執行 steps。沒寫就只等頁面 load',
    '  # ready: app-root',
    '  disableAnimations: true',
    '',
    ...app,
    '',
    '# validate 會拿 App 的 i18n 檔，比對正文裡提到的名稱有沒有出處',
    '# text:',
    '#   messages: ../my-app/src/locales/{locale}.json',
    '',
  ].join('\n')
}

function chapterYaml(locale: keyof typeof TEXT): string {
  const t = TEXT[locale]
  return [
    `# yaml-language-server: $schema=${SCHEMA_BASE}/manifest.json`,
    'id: overview',
    `title: ${t.overview}`,
    'order: 10',
    'steps:',
    `  # ${t.stepsComment}`,
    '  - action: screenshot',
    '    name: overview-01',
    '',
  ].join('\n')
}

function chapterDoc(locale: keyof typeof TEXT): string {
  const t = TEXT[locale]
  return [`# ${t.overview}`, '', t.intro, '', '{{screenshot:overview-01}}', ''].join('\n')
}

export async function init(opts: InitOptions) {
  const cwd = process.cwd()
  const existing = findProjectRoot(cwd)
  if (existing) {
    throw usageError('ALREADY_INITIALIZED', `${path.join(existing, MANUAL_FILE)} 已經存在，這裡已經是一個手冊專案了。`, { root: existing })
  }

  const mode = opts.mode ?? 'web'
  if (mode !== 'web' && mode !== 'electron') {
    throw usageError('INVALID_ARGUMENT', `init 的 --mode 只能是 web / electron（custom driver 請 init 之後再改 manual.yaml）`)
  }
  const locale = opts.locale ?? 'zh-Hant'
  if (!(locale in TEXT)) {
    throw usageError('INVALID_ARGUMENT', `init 的 --locale 目前支援：${Object.keys(TEXT).join(' / ')}`)
  }
  const lang = locale as keyof typeof TEXT

  const files: [string, string][] = [
    [MANUAL_FILE, manualYaml({ locale: lang, mode, url: opts.url ?? 'http://localhost:3000', appDir: opts.appDir ?? '.' })],
    ['config.example.json', JSON.stringify({ app: mode === 'web' ? { web: { url: opts.url ?? 'http://localhost:3000' } } : { electron: { build: false } } }, null, 2) + '\n'],
    ['manifest/10-overview.yaml', chapterYaml(lang)],
    ['docs/10-overview.md', chapterDoc(lang)],
  ]

  const created: string[] = []
  const skipped: string[] = []
  for (const [rel, content] of files) {
    const file = path.join(cwd, rel)
    if (fs.existsSync(file)) {
      skipped.push(rel)
      continue
    }
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, content)
    created.push(rel)
  }

  // .gitignore：只補上還沒有的那幾行。截圖、產物、錄影檔都不該進版控
  const gitignore = path.join(cwd, '.gitignore')
  const current = fs.existsSync(gitignore) ? fs.readFileSync(gitignore, 'utf-8') : ''
  const lines = new Set(current.split(/\r?\n/).map((l) => l.trim()))
  const missing = GITIGNORE.slice(1).filter((l) => !lines.has(l))
  if (missing.length > 0) {
    const block = [GITIGNORE[0], ...missing].join('\n')
    fs.writeFileSync(gitignore, current + (current && !current.endsWith('\n') ? '\n' : '') + (current ? '\n' : '') + block + '\n')
    created.push('.gitignore（補上 ' + missing.join(' ') + '）')
  }

  for (const f of created) ui.info(`  + ${f}`)
  for (const f of skipped) ui.info(`  = ${f}（已存在，沒有覆蓋）`)
  ui.info(
    [
      '',
      '接下來：',
      mode === 'web' ? `  1. 把 App 跑起來（${opts.url ?? 'http://localhost:3000'}，網址不對就改 manual.yaml 的 app.web.url）` : '  1. 確認 manual.yaml 的 app.electron.projectDir 指向 App',
      '  2. npx auto-manual-gen doctor     # 檢查環境',
      '  3. npx auto-manual-gen run        # -> screenshots/' + locale + '/overview-01.png',
    ].join('\n'),
  )

  return { root: cwd, created, skipped }
}
