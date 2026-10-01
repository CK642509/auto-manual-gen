/**
 * 驗證 manifest 與正文，不開瀏覽器 —— 不合法的 manifest 不需要打開瀏覽器就知道。
 *
 *   auto-manual-gen validate
 *   auto-manual-gen validate --chapter camera-add
 *   auto-manual-gen validate --chapter camera-add --base main   # 保護區跟哪一版比，預設 HEAD
 *   auto-manual-gen validate --locale en                        # 只驗一個語言的正文；沒給就驗全部語言
 *
 * manifest 分兩層：
 * - 結構（動詞、必填欄位、不認得的欄位）：schema/v1/manifest.json，跟編輯器同一份。
 * - 語意（schema 表達不了的）：檔名與 id/order 是否一致、id 是否重複、screenshot 命名與 annotate key 是否乾淨、
 *   逐語言欄位有沒有涵蓋所有語言。
 *
 * 正文（docs/）的檢查在 `docs.ts`：legend / 截圖引用、保護區，以及需要人工確認的名稱提醒。
 */
import { contentError } from '../errors.js'
import { validateDoc, validateDocNames } from '../docs.js'
import { loadChapters, loadManual, selectChapters, selectLocales, validateActions, validateLocales, type Chapter } from '../manifest.js'
import { list, ui } from '../ui.js'

export type ValidateOptions = { chapter?: string; locale?: string; base?: string }

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

export async function validate(opts: ValidateOptions) {
  const baseRef = opts.base ?? 'HEAD'
  const manual = loadManual()
  const locales = selectLocales(manual, opts.locale)
  const all = loadChapters()
  const chapters = selectChapters(all, opts.chapter)

  const idCounts = new Map<string, number>()
  for (const c of all) idCounts.set(c.id, (idCounts.get(c.id) ?? 0) + 1)
  const duplicateIdErrors = [...idCounts.entries()]
    .filter(([, n]) => n > 1)
    .map(([id]) => `manifest: id「${id}」被多個章節重複使用`)

  const manifestErrors = [
    ...duplicateIdErrors,
    ...chapters.flatMap((c) => {
      // 結構不對的話，後面的語意檢查只會產生一堆連帶的錯誤，先停在這一層
      const structural = validateActions(c)
      if (structural.length > 0) return structural
      return [...validateNaming(c), ...validateScreenshots(c), ...validateLocales(c, manual.locales)]
    }),
  ]

  if (manifestErrors.length > 0) {
    throw contentError('MANIFEST_INVALID', `manifest 驗證失敗（${manifestErrors.length} 個問題）：\n${list(manifestErrors)}`, {
      problems: manifestErrors,
    })
  }

  ui.info(`manifest 驗證通過（${chapters.length} 章）。`)

  // manifest 過了才驗正文 —— 正文的引用要對照 manifest，manifest 本身壞掉時對照沒有意義
  // 每個語言各驗一次：同一套規則，對照表換成該語言的 App 文案（Day 22）
  const docs: Record<string, { checked: number; withoutDocs: string[]; errors: string[]; warnings: string[] }> = {}
  let failed = 0

  for (const locale of locales) {
    const errors = opts.chapter ? [] : validateDocNames(all, locale)
    const warnings: string[] = []
    const withoutDocs: string[] = []

    for (const c of chapters) {
      const report = validateDoc(c, all, baseRef, locale)
      if (!report) {
        withoutDocs.push(c.id)
        continue
      }
      errors.push(...report.errors)
      warnings.push(...report.warnings)
    }

    const checked = chapters.length - withoutDocs.length
    docs[locale] = { checked, withoutDocs, errors, warnings }

    if (withoutDocs.length > 0) ui.info(`[${locale}] 尚未有正文：${withoutDocs.join(' / ')}`)
    if (warnings.length > 0) ui.warn(`[${locale}] 需要人工確認（${warnings.length} 則）：\n${list(warnings)}`)

    if (errors.length > 0) {
      failed++
      ui.error(`[${locale}] 正文驗證失敗（${errors.length} 個問題）：\n${list(errors)}`)
    } else if (checked > 0) {
      ui.info(`[${locale}] 正文驗證通過（${checked} 章）。`)
    }
  }

  if (failed > 0) {
    // 細節上面已經印過了，這裡只留一句總結；--json 時細節在 error.docs 裡
    throw contentError('DOCS_INVALID', `正文驗證失敗（${failed} 種語言）。`, { docs })
  }

  return { chapters: chapters.map((c) => c.id), locales, docs }
}
