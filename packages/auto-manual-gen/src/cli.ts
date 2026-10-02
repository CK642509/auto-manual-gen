/**
 * 指令入口。每個指令都是單一職責、都支援 `--json`、失敗時用 exit code 分出「是誰的問題」：
 *
 *   0 成功 / 1 手冊內容有問題 / 2 使用方式或設定錯誤 / 3 環境缺東西
 *
 * 這三樣是給 CI 與 agent 的介面 —— 它們看 exit code 與結構化輸出決定下一步，而不是讀錯誤訊息。
 */
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs, type ParseArgsConfig } from 'node:util'
import { EXIT_CODE, ManualError, envError, usageError } from './errors.js'
import { packageRoot } from './paths.js'
import { setJsonMode } from './ui.js'

type Options = NonNullable<ParseArgsConfig['options']>
type Command = {
  summary: string
  options: Options
  /** 延遲載入：doctor 要能在沒裝 playwright 的環境裡跑起來，告訴你缺了 playwright */
  run: (values: Record<string, string | boolean | undefined>) => Promise<unknown>
}

const str = { type: 'string' } as const
const bool = { type: 'boolean' } as const

const COMMANDS: Record<string, Command> = {
  init: {
    summary: '在目前目錄產生最小可跑的手冊專案骨架',
    options: { mode: str, url: str, 'app-dir': str, locale: str },
    run: async (v) =>
      (await import('./commands/init.js')).init({ mode: v.mode as string, url: v.url as string, appDir: v['app-dir'] as string, locale: v.locale as string }),
  },
  doctor: {
    summary: '檢查環境：哪些功能可以用、缺什麼',
    options: {},
    run: async () => (await import('./commands/doctor.js')).doctor(),
  },
  validate: {
    summary: '驗證 manifest 與正文（不開瀏覽器）',
    options: { chapter: str, locale: str, base: str },
    run: async (v) => (await import('./commands/validate.js')).validate(v as never),
  },
  probe: {
    summary: '列出畫面上可見且具 testid 的元件（寫 manifest 之前先探勘）',
    options: { mode: str, after: str, locale: str },
    run: async (v) => (await import('./commands/probe.js')).probe(v as never),
  },
  run: {
    summary: '依 manifest 驅動 App、產出截圖',
    options: { chapter: str, locale: str, mode: str },
    run: async (v) => (await import('./commands/run.js')).run(v as never),
  },
  build: {
    summary: '合併正文與截圖，產出 Word / HTML / PDF（需要 pandoc）',
    options: { to: str, pdf: bool, locale: str },
    run: async (v) => (await import('./commands/build.js')).build(v as never),
  },
  sync: {
    summary: '翻譯同步：主語言改了哪幾段、譯文要重翻哪幾段',
    options: { locale: str, accept: str },
    run: async (v) => (await import('./commands/sync.js')).sync(v as never),
  },
  video: {
    summary: '把章節錄成教學影片，附字幕與旁白（需要 ffmpeg）',
    options: { chapter: str, locale: str, mode: str, gif: bool, narrate: bool, burn: bool, 'captions-only': bool },
    run: async (v) => (await import('./commands/video.js')).video({ ...(v as object), captionsOnly: v['captions-only'] as boolean }),
  },
  tour: {
    summary: '把標了 tour: true 的章節轉成 App 內導覽資料',
    options: { check: bool },
    run: async (v) => (await import('./commands/tour.js')).tour(v as never),
  },
}

const MODES = ['electron', 'web', 'custom']

function version(): string {
  return (JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf-8')) as { version: string }).version
}

function help(): string {
  const width = Math.max(...Object.keys(COMMANDS).map((c) => c.length)) + 2
  return [
    `auto-manual-gen ${version()}`,
    '',
    '用法：auto-manual-gen <指令> [選項] [--json]',
    '',
    ...Object.entries(COMMANDS).map(([name, c]) => {
      const opts = Object.entries(c.options).map(([k, o]) => (o.type === 'boolean' ? `--${k}` : `--${k} <${k}>`))
      return `  ${name.padEnd(width)}${c.summary}${opts.length ? `\n  ${' '.repeat(width)}${opts.join(' ')}` : ''}`
    }),
    '',
    '共通選項：--json（結構化輸出）、--help、--version',
    'exit code：0 成功 / 1 手冊內容有問題 / 2 使用方式或設定錯誤 / 3 環境缺東西',
  ].join('\n')
}

/** playwright 是 peer dependency，沒裝的話任何會開瀏覽器的指令都會在 import 時失敗。 */
function isMissingPlaywright(e: unknown): boolean {
  const err = e as NodeJS.ErrnoException
  return err?.code === 'ERR_MODULE_NOT_FOUND' && /'playwright'/.test(err.message)
}

async function main(argv: string[]): Promise<number> {
  const json = argv.includes('--json')
  setJsonMode(json)
  const [name, ...rest] = argv.filter((a) => a !== '--json')

  if (!name || name === '--help' || name === '-h' || name === 'help') {
    console.log(help())
    return 0
  }
  if (name === '--version' || name === '-v') {
    console.log(version())
    return 0
  }

  const emit = (body: Record<string, unknown>) => {
    if (json) console.log(JSON.stringify({ command: name, ...body }, null, 2))
  }

  try {
    const command = COMMANDS[name]
    if (!command) {
      throw usageError('UNKNOWN_COMMAND', `沒有「${name}」這個指令，可用的有：${Object.keys(COMMANDS).join(' / ')}`, {
        available: Object.keys(COMMANDS),
      })
    }
    if (rest.includes('--help')) {
      console.log(help())
      return 0
    }

    let values: Record<string, string | boolean | undefined>
    try {
      // 沒有任何選項設了 multiple，值不會是陣列
      values = parseArgs({ args: rest, options: command.options, strict: true, allowPositionals: false }).values as typeof values
    } catch (cause) {
      const known = Object.keys(command.options).map((k) => `--${k}`)
      throw usageError('INVALID_ARGUMENT', `${(cause as Error).message}\n${name} 可用的選項：${known.join(' ') || '（沒有）'}`, { options: known })
    }
    if (typeof values.mode === 'string' && name !== 'init' && !MODES.includes(values.mode)) {
      throw usageError('INVALID_ARGUMENT', `--mode 只能是 ${MODES.join(' / ')}`)
    }

    let result: unknown
    try {
      result = await command.run(values)
    } catch (e) {
      if (isMissingPlaywright(e)) throw envError('PLAYWRIGHT_MISSING', '找不到 playwright。它是 peer dependency，請在專案裡安裝：npm install -D playwright')
      throw e
    }
    emit({ ok: true, result })
    return 0
  } catch (e) {
    const err =
      e instanceof ManualError
        ? e
        : new ManualError('content', 'UNEXPECTED', `非預期的錯誤（可能是 auto-manual-gen 本身的 bug）：${(e as Error)?.stack ?? e}`)
    if (json) emit({ ok: false, error: { kind: err.kind, code: err.code, message: err.message, ...err.details } })
    else console.error(err.message)
    return EXIT_CODE[err.kind]
  }
}

process.exitCode = await main(process.argv.slice(2))
