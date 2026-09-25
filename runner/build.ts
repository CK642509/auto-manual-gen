/**
 * 合併正文與截圖，交給 pandoc 產出 Word（Day 20）。
 *
 *   npm run build            # output/manual.md → output/manual.docx
 *   npm run build -- --pdf   # 再用 Word 更新目錄頁碼、轉出 output/manual.pdf（只能在裝有 Word 的 Windows）
 *
 * 分兩段：
 *
 * 1. 合併：把 `docs/{order}-{id}.md` 依 manifest 的 order 串起來，展開 `{{legend.*}}` 與 `{{screenshot:*}}`，
 *    寫成一份 `output/manual.md`。這一段是純文字處理，產物可以直接打開來看、拿來 diff。
 * 2. 轉換：pandoc 只負責把 Markdown 的結構轉成 Word 的結構，字型、顏色、頁碼全部來自 `templates/reference.docx`。
 *
 * 合併前會先跑一次跟 `validate` 相同的正文檢查 —— 引用壞掉的正文不該被排成一份看起來很正式的文件。
 */
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { loadConfig, repoRoot } from './config.js'
import { loadManual } from './boot.js'
import { docFileName, docsDir, validateDoc } from './docs.js'
import { loadChapters, rel, type Chapter } from './manifest.js'

const config = loadConfig()
const wantPdf = process.argv.includes('--pdf')

const SHOTS = path.join(repoRoot, config.paths.screenshots)
const OUTPUT = path.join(repoRoot, config.paths.output)
const TEMPLATE = path.join(repoRoot, config.paths.template)

/** A4 扣掉左右各 2.5 cm 的版心寬，跟 reference.docx 的版面設定對齊。圖片再寬也不超過這個數字。 */
const PAGE_WIDTH_IN = 6.3
/** 圖片在紙上的大小以「畫面上的大小」為準：1 個 CSS px = 1/96 吋，這樣小對話框不會被放大成整頁寬。 */
const CSS_PX_PER_IN = 96

const PROTECTED_MARKER = /^\s*<!-- protected:(start|end) -->\s*$/

/** PNG 的寬度寫在檔頭第 16–19 byte，不需要為了這個裝影像處理套件。 */
function pngWidth(file: string): number {
  return fs.readFileSync(file).readUInt32BE(16)
}

function imageWidthIn(file: string, deviceScaleFactor: number): string {
  const inches = Math.min(PAGE_WIDTH_IN, pngWidth(file) / deviceScaleFactor / CSS_PX_PER_IN)
  return `${inches.toFixed(2)}in`
}

/** 版本資訊只有一個來源：manual.yaml 的 version + git。封面上不另外手寫任何日期或版號。 */
function gitInfo(): { commit: string; date: string; dirty: boolean } {
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf-8' }).trim()
  return {
    commit: git('rev-parse', '--short', 'HEAD'),
    date: git('log', '-1', '--format=%cs'),
    dirty: git('status', '--porcelain', '--', config.paths.manifest, config.paths.docs).length > 0,
  }
}

/** 一章的正文：拿掉保護區標記、換掉 legend 引用、把截圖展開成「圖 + 圖說 + legend 表格」。 */
function renderChapter(chapter: Chapter, no: number, deviceScaleFactor: number): string {
  const legends = new Map(chapter.steps.flatMap((s) => s.annotate ?? []).map((a) => [a.key, a.legend]))
  const shots = chapter.steps.filter((s) => s.action === 'screenshot' && s.name)
  let figure = 0

  return fs
    .readFileSync(path.join(docsDir(), docFileName(chapter)), 'utf-8')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => !PROTECTED_MARKER.test(line))
    .join('\n')
    .replace(/^# (.+)$/m, `# ${no}　$1`)
    .replace(/\{\{legend\.([\w-]+)\}\}/g, (_, key: string) => legends.get(key)!)
    .replace(/^\{\{screenshot:([\w-]+)\}\}$/gm, (_, name: string) => {
      const step = shots.find((s) => s.name === name)!
      const file = path.join(SHOTS, `${name}.png`)
      figure++

      const lines = [`![圖 ${no}-${figure}　${chapter.title}](${rel(file)}){width=${imageWidthIn(file, deviceScaleFactor)}}`]
      if (step.annotate?.length) {
        lines.push('', '| 標號 | 說明 |', '|:---:|:---|')
        for (const [i, a] of step.annotate.entries()) lines.push(`| ${i + 1} | ${a.legend} |`)
      }
      return lines.join('\n')
    })
}

/* ---------- 主流程 ---------- */

const manual = loadManual()
const chapters = loadChapters()

// 1. 先確認每一章都排得出來：正文存在、引用正確、截圖都拍好了
const problems: string[] = []
for (const c of chapters) {
  const report = validateDoc(c, chapters, 'HEAD')
  if (!report) {
    problems.push(`${c.id}: 找不到正文 docs/${docFileName(c)}`)
    continue
  }
  problems.push(...report.errors)
  for (const s of c.steps) {
    if (s.action === 'screenshot' && s.name && !fs.existsSync(path.join(SHOTS, `${s.name}.png`))) {
      problems.push(`${c.id}: 找不到截圖 ${config.paths.screenshots}/${s.name}.png，先跑 npm run manual -- --chapter ${c.id}`)
    }
  }
}
if (problems.length > 0) {
  console.error(`無法合併（${problems.length} 個問題）：\n${problems.map((p) => `  - ${p}`).join('\n')}`)
  process.exit(1)
}

// 2. 合併成一份 Markdown，封面資訊放在 YAML metadata
const git = gitInfo()
const scale = manual.bootstrap.viewport.deviceScaleFactor ?? 1
const metadata = [
  '---',
  `title: '${manual.title}'`,
  `subtitle: '版本 ${manual.version}'`,
  `date: '${git.date}（${git.commit}${git.dirty ? '，含未提交的變更' : ''}）'`,
  'lang: zh-TW',
  "toc-title: '目錄'",
  '---',
]
const body = chapters.map((c, i) => renderChapter(c, i + 1, scale))
const merged = [metadata.join('\n'), ...body].join('\n\n')

fs.mkdirSync(OUTPUT, { recursive: true })
const mdFile = path.join(OUTPUT, 'manual.md')
fs.writeFileSync(mdFile, merged)
console.log(`合併 ${chapters.length} 章 -> ${rel(mdFile)}`)

// 3. pandoc：Markdown 結構 → Word 結構，樣式全部來自 reference.docx
const docxFile = path.join(OUTPUT, 'manual.docx')
const pandoc = spawnSync(
  'pandoc',
  [rel(mdFile), '-o', rel(docxFile), `--reference-doc=${rel(TEMPLATE)}`, '--toc', '--toc-depth=1', '--resource-path=.'],
  { cwd: repoRoot, stdio: 'inherit' },
)
if (pandoc.error) {
  console.error(`找不到 pandoc（${pandoc.error.message}）。請先安裝：https://pandoc.org/installing.html`)
  process.exit(1)
}
if (pandoc.status !== 0) process.exit(pandoc.status ?? 1)
console.log(`pandoc -> ${rel(docxFile)}`)

// 4. Word：更新目錄頁碼、存回 docx、轉出 PDF
if (wantPdf) {
  if (process.platform !== 'win32') {
    console.error('--pdf 走的是 Word COM，只能在裝有 Word 的 Windows 上跑。其他環境的做法見 Day 21 / Day 23。')
    process.exit(1)
  }
  const pdfFile = path.join(OUTPUT, 'manual.pdf')
  const word = spawnSync(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(repoRoot, 'runner', 'word-export.ps1'), docxFile, pdfFile],
    { stdio: 'inherit' },
  )
  if (word.status !== 0) process.exit(word.status ?? 1)
  console.log(`Word -> ${rel(pdfFile)}（目錄頁碼已更新）`)
}
