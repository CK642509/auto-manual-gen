/**
 * 合併正文與截圖，交給 pandoc 產出 Word（Day 20）或 HTML（Day 21）。
 *
 *   npm run build                      # output/{locale}/manual.md → manual.docx
 *   npm run build -- --pdf             # 再用 Word 更新目錄頁碼、轉出 manual.pdf（只能在裝有 Word 的 Windows）
 *   npm run build -- --to html         # manual.html，圖片內嵌成單一檔案，可以直接放上網
 *   npm run build -- --to html --pdf   # 再用 Playwright 的 Chromium 印成 manual-html.pdf（不需要 Office）
 *   npm run build -- --locale en       # 只出一個語言；沒給就出 manual.yaml 列的全部語言
 *
 * 分兩段：
 *
 * 1. 合併：把 `docs/{order}-{id}.md` 依 manifest 的 order 串起來，展開 `{{legend.*}}` 與 `{{screenshot:*}}`，
 *    寫成一份 `manual.md`。這一段是純文字處理，產物可以直接打開來看、拿來 diff。
 * 2. 轉換：pandoc 只負責結構，長相來自外部檔案 —— Word 看 `templates/reference.docx`，HTML 看 `templates/manual.css`。
 *
 * 每個語言各自一套（Day 22）：主語言的正文在 `docs/`、其他語言在 `docs/{locale}/`，
 * 截圖在 `screenshots/{locale}/`，產物在 `output/{locale}/`。
 *
 * 合併前會先跑一次跟 `validate` 相同的正文檢查 —— 引用壞掉的正文不該被排成一份看起來很正式的文件。
 */
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { loadConfig, repoRoot } from './config.js'
import { docFileName, docsDir, validateDoc } from './docs.js'
import { loadChapters, loadManual, pick, rel, selectLocales, type Chapter } from './manifest.js'

const config = loadConfig()
const wantPdf = process.argv.includes('--pdf')

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

const target = arg('to') ?? 'docx'
if (target !== 'docx' && target !== 'html') {
  console.error(`不支援的輸出格式「${target}」，可用的有：docx / html`)
  process.exit(1)
}

const shotsDir = (locale: string) => path.join(repoRoot, config.paths.screenshots, locale)
const outputDir = (locale: string) => path.join(repoRoot, config.paths.output, locale)
const TEMPLATE = path.join(repoRoot, config.paths.template)
const CSS = path.join(repoRoot, 'templates', 'manual.css')

/** A4 扣掉左右各 2.5 cm 的版心寬，跟 reference.docx 的版面設定對齊。圖片再寬也不超過這個數字。 */
const PAGE_WIDTH_IN = 6.3
/** 圖片在紙上的大小以「畫面上的大小」為準：1 個 CSS px = 1/96 吋，這樣小對話框不會被放大成整頁寬。 */
const CSS_PX_PER_IN = 96

const PROTECTED_MARKER = /^\s*<!-- protected:(start|end) -->\s*$/

/**
 * build 自己寫進文件的字（圖號、legend 表頭、封面、目錄標題）。這些不屬於任何一章的正文，
 * 也不在 App 的 i18n 檔裡，所以放在這裡逐語言定義。多一種語言，就要在這裡多一組。
 */
type BuildStrings = {
  /** pandoc 的 lang：決定 Word 的校對語言與 HTML 的 lang 屬性 */
  lang: string
  toc: string
  figure: (no: string) => string
  /** 章號與標題、圖號與圖說之間的間隔 */
  gap: string
  legendHeader: [string, string]
  version: (v: string) => string
  date: (date: string, commit: string, dirty: boolean) => string
}

const STRINGS: Record<string, BuildStrings> = {
  'zh-Hant': {
    // 不寫 zh-TW：pandoc 只內建 zh-Hant / zh-Hans 的翻譯檔，zh-TW 會找不到而印出一整排警告
    lang: 'zh-Hant-TW',
    toc: '目錄',
    figure: (no) => `圖 ${no}`,
    gap: '　',
    legendHeader: ['標號', '說明'],
    version: (v) => `版本 ${v}`,
    date: (date, commit, dirty) => `${date}（${commit}${dirty ? '，含未提交的變更' : ''}）`,
  },
  en: {
    lang: 'en-US',
    toc: 'Contents',
    figure: (no) => `Figure ${no}`,
    gap: ' ',
    legendHeader: ['No.', 'Description'],
    version: (v) => `Version ${v}`,
    date: (date, commit, dirty) => `${date} (${commit}${dirty ? ', uncommitted changes' : ''})`,
  },
}

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
function renderChapter(chapter: Chapter, no: number, deviceScaleFactor: number, locale: string): string {
  const t = STRINGS[locale]
  const title = pick(chapter.title, locale)
  const legends = new Map(chapter.steps.flatMap((s) => s.annotate ?? []).map((a) => [a.key, pick(a.legend, locale)]))
  const shots = chapter.steps.filter((s) => s.action === 'screenshot' && s.name)
  let figure = 0

  return fs
    .readFileSync(path.join(docsDir(locale), docFileName(chapter)), 'utf-8')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => !PROTECTED_MARKER.test(line))
    .join('\n')
    .replace(/^# (.+)$/m, `# ${no}${t.gap}$1`)
    .replace(/\{\{legend\.([\w-]+)\}\}/g, (_, key: string) => legends.get(key)!)
    .replace(/^\{\{screenshot:([\w-]+)\}\}$/gm, (_, name: string) => {
      const step = shots.find((s) => s.name === name)!
      const file = path.join(shotsDir(locale), `${name}.png`)
      figure++

      const caption = `${t.figure(`${no}-${figure}`)}${t.gap}${title}`
      const lines = [`![${caption}](${rel(file)}){width=${imageWidthIn(file, deviceScaleFactor)}}`]
      if (step.annotate?.length) {
        lines.push('', `| ${t.legendHeader[0]} | ${t.legendHeader[1]} |`, '|:---:|:---|')
        for (const [i, a] of step.annotate.entries()) lines.push(`| ${i + 1} | ${pick(a.legend, locale)} |`)
      }
      return lines.join('\n')
    })
}

/* ---------- 主流程 ---------- */

const manual = loadManual()
const chapters = loadChapters()
let locales: string[]
try {
  locales = selectLocales(manual, arg('locale'))
} catch (e) {
  console.error((e as Error).message)
  process.exit(1)
}

// 1. 先確認每個語言、每一章都排得出來：排版字串有定義、正文存在、引用正確、截圖都拍好了
const problems: string[] = []
for (const locale of locales) {
  if (!STRINGS[locale]) problems.push(`[${locale}] build.ts 的 STRINGS 還沒有這個語言的排版字串（圖號、表頭、封面）`)
  for (const c of chapters) {
    const report = validateDoc(c, chapters, 'HEAD', locale)
    if (!report) {
      problems.push(`[${locale}] ${c.id}: 找不到正文 ${rel(path.join(docsDir(locale), docFileName(c)))}`)
      continue
    }
    problems.push(...report.errors.map((e) => `[${locale}] ${e}`))
    for (const s of c.steps) {
      if (s.action === 'screenshot' && s.name && !fs.existsSync(path.join(shotsDir(locale), `${s.name}.png`))) {
        problems.push(
          `[${locale}] ${c.id}: 找不到截圖 ${rel(shotsDir(locale))}/${s.name}.png，` +
            `先跑 npm run manual -- --chapter ${c.id} --locale ${locale}`,
        )
      }
    }
  }
}
if (problems.length > 0) {
  console.error(`無法合併（${problems.length} 個問題）：\n${problems.map((p) => `  - ${p}`).join('\n')}`)
  process.exit(1)
}

const git = gitInfo()
const scale = manual.bootstrap.viewport.deviceScaleFactor ?? 1

for (const locale of locales) {
  const t = STRINGS[locale]
  const OUTPUT = outputDir(locale)

  // 2. 合併成一份 Markdown，封面資訊放在 YAML metadata
  const metadata = [
    '---',
    `title: '${pick(manual.title, locale)}'`,
    `subtitle: '${t.version(manual.version)}'`,
    `date: '${t.date(git.date, git.commit, git.dirty)}'`,
    `lang: ${t.lang}`,
    `toc-title: '${t.toc}'`,
    '---',
  ]
  const body = chapters.map((c, i) => renderChapter(c, i + 1, scale, locale))
  const merged = [metadata.join('\n'), ...body].join('\n\n')

  fs.mkdirSync(OUTPUT, { recursive: true })
  const mdFile = path.join(OUTPUT, 'manual.md')
  fs.writeFileSync(mdFile, merged)
  console.log(`[${locale}] 合併 ${chapters.length} 章 -> ${rel(mdFile)}`)

  // 3. pandoc：Markdown 結構 → Word / HTML 結構，樣式全部來自外部檔案（reference.docx / manual.css）
  const outFile = path.join(OUTPUT, `manual.${target}`)
  const formatArgs =
    target === 'docx'
      ? [`--reference-doc=${rel(TEMPLATE)}`]
      : ['--standalone', '--embed-resources', `--css=${rel(CSS)}`]
  const pandoc = spawnSync(
    'pandoc',
    [rel(mdFile), '-o', rel(outFile), ...formatArgs, '--toc', '--toc-depth=1', '--resource-path=.'],
    { cwd: repoRoot, stdio: 'inherit' },
  )
  if (pandoc.error) {
    console.error(`找不到 pandoc（${pandoc.error.message}）。請先安裝：https://pandoc.org/installing.html`)
    process.exit(1)
  }
  if (pandoc.status !== 0) process.exit(pandoc.status ?? 1)
  console.log(`[${locale}] pandoc -> ${rel(outFile)}`)

  // 4. PDF：docx 交給 Word，HTML 交給 Playwright 的 Chromium
  if (wantPdf && target === 'docx') {
    if (process.platform !== 'win32') {
      console.error('docx 轉 PDF 走的是 Word COM，只能在裝有 Word 的 Windows 上跑。其他環境改用 --to html --pdf。')
      process.exit(1)
    }
    const pdfFile = path.join(OUTPUT, 'manual.pdf')
    const word = spawnSync(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(repoRoot, 'runner', 'word-export.ps1'), outFile, pdfFile],
      { stdio: 'inherit' },
    )
    if (word.status !== 0) process.exit(word.status ?? 1)
    console.log(`[${locale}] Word -> ${rel(pdfFile)}（目錄頁碼已更新）`)
  }

  if (wantPdf && target === 'html') {
    const pdfFile = path.join(OUTPUT, 'manual-html.pdf')
    const browser = await chromium.launch()
    const page = await browser.newPage()
    await page.goto(pathToFileURL(outFile).href)
    await page.pdf({
      path: pdfFile,
      format: 'A4',
      margin: { top: '2.5cm', bottom: '2.5cm', left: '2.5cm', right: '2.5cm' },
      printBackground: true,
      outline: true, // 標題轉成 PDF 書籤
      tagged: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: '<div style="width:100%;text-align:center;font-size:9pt;color:#6e6e6e"><span class="pageNumber"></span></div>',
    })
    await browser.close()
    console.log(`[${locale}] Chromium -> ${rel(pdfFile)}`)
  }
}
