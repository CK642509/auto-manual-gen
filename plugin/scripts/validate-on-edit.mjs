/**
 * PostToolUse hook：agent 改了某一章的 manifest 或正文，就自動跑一次 validate。
 *
 * plugin 啟用期間，每一次 Write / Edit 都會觸發這支腳本（連跟手冊無關的專案也是），
 * 所以要盡快判斷「這不關我的事」並直接結束：
 *
 *   1. 副檔名不是 .yaml / .yml / .md            → 結束
 *   2. 檔名不是 {order}-{id}.* 的章節命名       → 結束
 *   3. 往上找不到 manual.yaml                    → 結束（不是手冊專案）
 *   4. 專案裡沒裝 auto-manual-gen                → 結束（不替使用者決定要裝哪一版）
 *
 * 都符合才跑 `validate --chapter <id> --json`。CLI 的 exit code 是 1（內容）或 2（設定）時，
 * 以 exit code 2 結束、把錯誤寫到 stderr，Claude Code 會把它交回給 agent 接著修；
 * exit code 3（環境）不是 agent 改檔案能解決的，只提示、不擋。
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const CHAPTER_FILE = /^\d+-(.+)\.(ya?ml|md)$/

function readInput() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf-8'))
  } catch {
    return {}
  }
}

function findProjectRoot(from) {
  for (let dir = from; ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'manual.yaml'))) return dir
    if (path.dirname(dir) === dir) return undefined
  }
}

/** 跟 bin/auto-manual 一樣用專案自己裝的那一份；package.json 沒有 export，所以從入口往上找。 */
function findCli(root) {
  try {
    const entry = createRequire(path.join(root, 'manual.yaml')).resolve('auto-manual-gen')
    for (let dir = path.dirname(entry); path.dirname(dir) !== dir; dir = path.dirname(dir)) {
      const bin = path.join(dir, 'bin', 'auto-manual-gen.js')
      if (fs.existsSync(bin)) return bin
    }
  } catch {}
  return undefined
}

function validate(cli, root, chapter) {
  const args = [cli, 'validate', '--json', ...(chapter ? ['--chapter', chapter] : [])]
  const r = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf-8' })
  let body
  try {
    body = JSON.parse(r.stdout)
  } catch {}
  return { status: r.status, body }
}

const input = readInput()
const file = input.tool_input?.file_path
if (typeof file !== 'string') process.exit(0)

const m = path.basename(file).match(CHAPTER_FILE)
if (!m) process.exit(0)

const root = findProjectRoot(path.dirname(path.resolve(file)))
if (!root) process.exit(0)

const cli = findCli(root)
if (!cli) process.exit(0)

let result = validate(cli, root, m[1])
// 檔名裡的 id 跟內容對不上（或檔案剛改名）時，--chapter 會找不到；退回驗整本，讓錯誤訊息指出是哪裡不一致
if (result.body?.error?.code === 'CHAPTER_NOT_FOUND') result = validate(cli, root)

if (result.status === 0) process.exit(0)

const detail = result.body ? JSON.stringify(result.body.error, null, 2) : '（validate 沒有輸出 JSON）'
const relative = path.relative(root, path.resolve(file))

if (result.status === 3) {
  console.error(`auto-manual-gen validate 因為環境問題沒有跑完，這不是 ${relative} 的內容問題：\n${detail}`)
  process.exit(1)
}

console.error(
  `改完 ${relative} 之後 auto-manual-gen validate 失敗（exit ${result.status}），請依照錯誤修正：\n${detail}`,
)
process.exit(2)
