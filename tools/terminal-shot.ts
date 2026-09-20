/**
 * 把一份真實的終端機輸出渲染成文章用的插圖。
 *
 *   npm run manual > tools/logs/day15-run-full.txt 2>&1
 *   npx tsx tools/terminal-shot.ts tools/logs/day15-run-full.txt --title 整本重跑
 *
 * 刻意讀檔而不是手抄：runner 的輸出格式一改，重跑一次就好，
 * 圖永遠等於真的跑出來的東西。產物在 output/terminal/。
 */
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { repoRoot } from '../runner/config.js'

const source = process.argv[2]
if (!source) {
  console.error('用法：npx tsx tools/terminal-shot.ts <log 檔> [--title 標題]')
  process.exit(1)
}

const titleArg = process.argv.indexOf('--title')
const title = titleArg === -1 ? path.basename(source, path.extname(source)) : process.argv[titleArg + 1]

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** 讓長 testid 清單只在 ` / ` 之間換行，不要斷在單字中間。 */
const nowrapTokens = (s: string) => s.replace(/[\w-]{6,}/g, (t) => `<span class="tok">${t}</span>`)

/**
 * 上色規則對齊 runner 的輸出格式。這裡只認行首符號，
 * 不去解析內容 —— 規則越笨，輸出格式改動時越不容易默默壞掉。
 */
function colorize(line: string): string {
  const text = escape(line)

  if (text.startsWith('$ ')) return `<span class="prompt">$</span> <span class="cmd">${text.slice(2)}</span>`
  if (text.startsWith('manifest:')) return `<span class="dim">${text}</span>`
  if (text.startsWith('▶')) return `<span class="run">${text}</span>`
  if (text.startsWith('✔')) {
    // 章節名稱之後的統計數字壓暗，視線才會停在通過與否
    const m = text.match(/^(✔ \[\d+\/\d+\] \S+)(\s\s.*)$/)
    return m ? `<span class="ok">${m[1]}</span><span class="dim">${m[2]}</span>` : `<span class="ok">${text}</span>`
  }
  if (text.startsWith('✖') || text.startsWith('找不到')) return `<span class="err">${nowrapTokens(text)}</span>`
  if (text.startsWith('  ') || text.startsWith('    ')) return `<span class="indent">${nowrapTokens(text)}</span>`

  return text
}

const body = fs.readFileSync(path.resolve(repoRoot, source), 'utf-8').replace(/\r\n/g, '\n').replace(/\n+$/, '')
const lines = body.split('\n').map(colorize).join('\n')

const html = `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><style>
  :root { --bg:#11151c; --bar:#1b212b; --ink:#d7dde6; --dim:#7d8899;
          --green:#6fd08c; --red:#ff6b60; --blue:#6cb6ff; }
  body { margin:0; background:#fff; }
  .term { width:960px; background:var(--bg); border-radius:10px; overflow:hidden; }
  .bar { height:34px; background:var(--bar); display:flex; align-items:center; padding:0 12px; gap:7px; }
  .dot { width:11px; height:11px; border-radius:50%; }
  .dot.r{background:#ff5f57} .dot.y{background:#febc2e} .dot.g{background:#28c840}
  .bar span { margin-left:10px; color:var(--dim); font:12px/1 "Microsoft JhengHei", system-ui, sans-serif; }
  pre { margin:0; padding:16px 18px 20px; color:var(--ink);
        font:14px/1.65 "Cascadia Mono", Consolas, "Microsoft JhengHei", monospace;
        white-space:pre-wrap; overflow-wrap:break-word; }
  .prompt{color:var(--green)} .cmd{color:#fff} .dim{color:var(--dim)}
  .ok{color:var(--green)} .err{color:var(--red)} .run{color:var(--blue)}
  .tok { white-space:nowrap; }
  .indent { padding-left:2.4em; display:inline-block; text-indent:-2.4em; }
</style></head><body>
<div class="term"><div class="bar">
  <i class="dot r"></i><i class="dot y"></i><i class="dot g"></i><span>auto-manual — ${escape(title)}</span>
</div><pre>${lines}</pre></div>
</body></html>`

const outDir = path.join(repoRoot, 'output', 'terminal')
fs.mkdirSync(outDir, { recursive: true })
const out = path.join(outDir, `${path.basename(source, path.extname(source))}.png`)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1000, height: 600 }, deviceScaleFactor: 2 })
await page.setContent(html, { waitUntil: 'load' })
await page.locator('.term').screenshot({ path: out })
await browser.close()

console.log(`done → ${path.relative(repoRoot, out)}`)
