/**
 * JSON Schema 驗證。schema 檔就是編輯器裡 `# yaml-language-server: $schema=...` 指向的那一份 ——
 * 編輯器與 validate 同源，不會有「編輯器說對、validate 說錯」的情況。
 */
import fs from 'node:fs'
import path from 'node:path'
import { Ajv, type ErrorObject, type ValidateFunction } from 'ajv'
import { packageRoot } from './paths.js'

// verbose：錯誤裡帶上實際的值，訊息才能寫「不合法的值 X」
const ajv = new Ajv({ allErrors: true, strict: false, verbose: true })
const compiled = new Map<string, ValidateFunction>()

function compile(name: 'manifest' | 'manual'): ValidateFunction {
  let fn = compiled.get(name)
  if (!fn) {
    const file = path.join(packageRoot, 'schema', 'v1', `${name}.json`)
    fn = ajv.compile(JSON.parse(fs.readFileSync(file, 'utf-8')))
    compiled.set(name, fn)
  }
  return fn
}

/** `/steps/3/action` → `steps[3].action`，跟其他錯誤訊息的寫法一致。 */
const pointer = (p: string) => p.split('/').filter(Boolean).map((s) => (/^\d+$/.test(s) ? `[${s}]` : `.${s}`)).join('').replace(/^\./, '')

/**
 * ajv 的錯誤是給程式看的，這裡翻成「哪裡錯、可以怎麼改」。
 * `if/then` 與 `oneOf` 會額外產生一條籠統的「不符合子 schema」，具體原因已經在別條裡了，丟掉。
 */
function describe(e: ErrorObject, at: string): string | null {
  const where = [at, pointer(e.instancePath)].filter(Boolean).join('.')
  const p = e.params as Record<string, unknown>
  switch (e.keyword) {
    case 'if':
      return null
    case 'oneOf':
      return `${where}: 只能是字串，或 { 語言代碼: 文字 } 這種逐語言指定的寫法`
    case 'enum':
      return `${where}: 不合法的值「${String(e.data)}」，可用的有：${(p.allowedValues as unknown[]).join(' / ')}`
    case 'required':
      return `${where || '（根）'}: 缺少必填欄位 ${p.missingProperty}`
    case 'additionalProperties':
      return `${where || '（根）'}: 不認得的欄位「${p.additionalProperty}」`
    case 'multipleOf':
      return `${where}: 應該是 ${p.multipleOf} 的倍數，中間才留得出插章的空間`
    case 'pattern':
      return `${where}: 格式不符（${p.pattern}）`
    default:
      return `${where}: ${e.message}`
  }
}

function check(name: 'manifest' | 'manual', data: unknown, at: string): string[] {
  const fn = compile(name)
  if (fn(data)) return []
  const messages = (fn.errors ?? [])
    // oneOf 底下各分支的錯誤只會讓人更困惑，只留 oneOf 本身那一條
    .filter((e) => !(fn.errors ?? []).some((o) => o.keyword === 'oneOf' && e !== o && e.schemaPath.startsWith(o.schemaPath.replace(/\/oneOf$/, '/oneOf/'))))
    .map((e) => describe(e, at))
    .filter((m): m is string => m !== null)
  return [...new Set(messages)]
}

/** 一章 manifest（manifest/{order}-{id}.yaml）。 */
export const checkChapter = (data: unknown, at: string) => check('manifest', data, at)

/** 專案設定（manual.yaml，已合併 config.json）。 */
export const checkManual = (data: unknown, at: string) => check('manual', data, at)
