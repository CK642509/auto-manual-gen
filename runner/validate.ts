/**
 * 驗證設定檔與正文，不開瀏覽器 —— 不合法的 manifest 不需要打開瀏覽器就知道。
 *
 *   npm run validate
 *   npm run validate -- --chapter camera-add
 *   npm run validate -- --chapter camera-add --base main   # 保護區跟哪一版比，預設 HEAD
 *
 * `run.ts` 開瀏覽器前也會做同一層動詞集檢查，這裡多做的是它不管的部分：
 * 檔名與 id/order 是否一致、id 是否重複、screenshot 命名與 annotate key 是否乾淨。
 * 這些都是「用眼睛看得出來但機器該先擋掉」的錯誤，早一秒擋下就少一次開瀏覽器的等待。
 *
 * 正文（docs/）的檢查在 `docs.ts`：legend / 截圖引用、保護區，以及需要人工確認的名稱提醒。
 */
import { validateDoc, validateDocNames } from './docs.js'
import { loadChapters, validateActions, type Chapter } from './manifest.js'

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

const only = arg('chapter')
const baseRef = arg('base') ?? 'HEAD'

function validateNaming(chapter: Chapter): string[] {
  const errors: string[] = []
  const m = chapter.file.match(/^(\d+)-(.+)\.ya?ml$/)

  if (!m) {
    errors.push(`${chapter.file}: 檔名不符合 {order}-{id}.yaml 格式`)
    return errors
  }

  const [, orderInName, idInName] = m
  if (idInName !== chapter.id) {
    errors.push(`${chapter.file}: 檔名裡的 id「${idInName}」跟內容的 id「${chapter.id}」不一致`)
  }
  if (Number(orderInName) !== chapter.order) {
    errors.push(`${chapter.file}: 檔名裡的 order「${orderInName}」跟內容的 order「${chapter.order}」不一致`)
  }
  if (chapter.order % 10 !== 0) {
    errors.push(`${chapter.file}: order 應該是 10 的倍數（目前 ${chapter.order}），中間才留得出插章的空間`)
  }

  return errors
}

function validateScreenshots(chapter: Chapter): string[] {
  const errors: string[] = []
  const seenNames = new Set<string>()

  for (const [i, step] of chapter.steps.entries()) {
    if (step.action !== 'screenshot' || !step.name) continue
    const at = `${chapter.id}.steps[${i}]`

    if (!step.name.startsWith(`${chapter.id}-`)) {
      errors.push(`${at}: screenshot name「${step.name}」應該以章節 id 開頭（${chapter.id}-NN），才能靠檔名認出這張圖屬於哪一章`)
    }
    if (seenNames.has(step.name)) {
      errors.push(`${at}: screenshot name「${step.name}」在這一章裡重複了`)
    }
    seenNames.add(step.name)

    if (step.annotate) {
      const seenKeys = new Set<string>()
      for (const item of step.annotate) {
        if (seenKeys.has(item.key)) errors.push(`${at}: annotate key「${item.key}」在同一張截圖裡重複了`)
        seenKeys.add(item.key)
      }
    }
  }

  return errors
}

const all = loadChapters()
const chapters = only ? all.filter((c) => c.id === only) : all

if (only && chapters.length === 0) {
  console.error(`找不到章節「${only}」，可用的有：${all.map((c) => c.id).join(' / ')}`)
  process.exit(1)
}

const idCounts = new Map<string, number>()
for (const c of all) idCounts.set(c.id, (idCounts.get(c.id) ?? 0) + 1)
const duplicateIdErrors = [...idCounts.entries()]
  .filter(([, n]) => n > 1)
  .map(([id]) => `manifest: id「${id}」被多個章節重複使用`)

const problems = [
  ...duplicateIdErrors,
  ...chapters.flatMap((c) => [...validateNaming(c), ...validateActions(c), ...validateScreenshots(c)]),
]

const list = (items: string[]) => items.map((e) => `  - ${e}`).join('\n')

if (problems.length > 0) {
  console.error(`manifest 驗證失敗（${problems.length} 個問題）：\n${list(problems)}`)
  process.exit(1)
}

console.log(`manifest 驗證通過（${chapters.length} 章）。`)

// manifest 過了才驗正文 —— 正文的引用要對照 manifest，manifest 本身壞掉時對照沒有意義
const docErrors = only ? [] : validateDocNames(all)
const docWarnings: string[] = []
const withoutDocs: string[] = []

for (const c of chapters) {
  const report = validateDoc(c, all, baseRef)
  if (!report) {
    withoutDocs.push(c.id)
    continue
  }
  docErrors.push(...report.errors)
  docWarnings.push(...report.warnings)
}

const checked = chapters.length - withoutDocs.length
if (withoutDocs.length > 0) console.log(`尚未有正文：${withoutDocs.join(' / ')}`)

if (docWarnings.length > 0) console.warn(`需要人工確認（${docWarnings.length} 則）：\n${list(docWarnings)}`)

if (docErrors.length > 0) {
  console.error(`正文驗證失敗（${docErrors.length} 個問題）：\n${list(docErrors)}`)
  process.exit(1)
}

if (checked > 0) console.log(`正文驗證通過（${checked} 章）。`)
