/**
 * 驗證設定檔格式，不開瀏覽器 —— 不合法的 manifest 不需要打開瀏覽器就知道。
 *
 *   npm run validate
 *   npm run validate -- --chapter camera-add
 *
 * `run.ts` 開瀏覽器前也會做同一層動詞集檢查，這裡多做的是它不管的部分：
 * 檔名與 id/order 是否一致、id 是否重複、screenshot 命名與 annotate key 是否乾淨。
 * 這些都是「用眼睛看得出來但機器該先擋掉」的錯誤，早一秒擋下就少一次開瀏覽器的等待。
 */
import { loadChapters, validateActions, type Chapter } from './manifest.js'

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

const only = arg('chapter')

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

if (problems.length > 0) {
  console.error(`manifest 驗證失敗（${problems.length} 個問題）：\n${problems.map((e) => `  - ${e}`).join('\n')}`)
  process.exit(1)
}

console.log(`manifest 驗證通過（${chapters.length} 章）。`)
