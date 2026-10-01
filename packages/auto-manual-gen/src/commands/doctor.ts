/**
 * 列出目前環境有哪些功能可以用。
 *
 *   auto-manual-gen doctor
 *
 * 必要的（Node、Playwright 與它的 Chromium）缺了就以 exit 3 結束；
 * 其他都是「選用能力」：pandoc、ffmpeg、Word、TTS 缺了不影響截圖，只有用到的指令會以 exit 3 失敗。
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { envError } from '../errors.js'
import { loadProject, type Project } from '../project.js'
import { ui } from '../ui.js'
import { CULTURE } from '../video/tts.js'

type Check = { name: string; ok: boolean; required: boolean; detail: string; usedBy: string; fix?: string }

function version(cmd: string, args: string[]): string | null {
  const r = spawnSync(cmd, args, { encoding: 'utf-8' })
  if (r.error || r.status !== 0) return null
  return r.stdout.split(/\r?\n/)[0].trim()
}

/** Word 與 TTS 都要問 PowerShell，一次問完省一次啟動時間。 */
function windowsCapabilities(): { word: boolean; voices: string[] } {
  const script =
    "$w = [type]::GetTypeFromProgID('Word.Application') -ne $null; " +
    'Add-Type -AssemblyName System.Speech; ' +
    '$v = (New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Culture.Name }; ' +
    "Write-Output ('word=' + $w); Write-Output ('voices=' + ($v -join ','))"
  const r = spawnSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf-8' })
  const out = r.stdout ?? ''
  return {
    word: /word=True/i.test(out),
    voices: (out.match(/voices=(.*)/)?.[1] ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  }
}

export async function doctor() {
  const checks: Check[] = []

  const major = Number(process.versions.node.split('.')[0])
  checks.push({ name: 'Node.js', ok: major >= 20, required: true, detail: process.version, usedBy: '全部', fix: '升級到 Node 20 以上' })

  let project: Project | undefined
  try {
    project = loadProject()
    checks.push({ name: '手冊專案', ok: true, required: false, detail: path.join(project.root, 'manual.yaml'), usedBy: 'init 以外的指令' })
  } catch (e) {
    checks.push({ name: '手冊專案', ok: false, required: false, detail: (e as Error).message.split('\n')[0], usedBy: 'init 以外的指令', fix: 'auto-manual-gen init' })
  }

  // Playwright 是 peer dependency：版本跟著使用者的專案走，E2E 測試已經在用的話可以共用同一份瀏覽器
  try {
    const { chromium } = await import('playwright')
    const exe = chromium.executablePath()
    checks.push({ name: 'Playwright', ok: true, required: true, detail: 'playwright 已安裝', usedBy: 'run / probe / video / build --to html --pdf' })
    checks.push({
      name: 'Chromium',
      ok: fs.existsSync(exe),
      required: true,
      detail: fs.existsSync(exe) ? exe : '還沒下載',
      usedBy: 'web 模式、build --to html --pdf',
      fix: 'npx playwright install chromium',
    })
  } catch {
    checks.push({ name: 'Playwright', ok: false, required: true, detail: '找不到 playwright 套件', usedBy: 'run / probe / video', fix: 'npm install -D playwright' })
  }

  const electron = project?.manual.app.electron
  if (project && electron) {
    const dir = path.resolve(project.root, electron.projectDir)
    let found: string | null = null
    try {
      found = createRequire(path.join(dir, 'package.json')).resolve('electron')
    } catch {}
    checks.push({ name: 'Electron', ok: found !== null, required: false, detail: found ? `從 ${electron.projectDir} 解析得到` : `從 ${electron.projectDir} 解析不到`, usedBy: 'electron 模式', fix: '在 App 的目錄 npm install' })
  }

  const pandoc = version('pandoc', ['--version'])
  checks.push({ name: 'pandoc', ok: pandoc !== null, required: false, detail: pandoc ?? '找不到', usedBy: 'build', fix: 'https://pandoc.org/installing.html' })

  const ffmpeg = version('ffmpeg', ['-version'])
  checks.push({ name: 'ffmpeg', ok: ffmpeg !== null, required: false, detail: ffmpeg?.split(' Copyright')[0] ?? '找不到', usedBy: 'video', fix: 'https://ffmpeg.org/download.html' })

  if (process.platform === 'win32') {
    const win = windowsCapabilities()
    checks.push({ name: 'Word', ok: win.word, required: false, detail: win.word ? '可以透過 COM 呼叫' : '找不到', usedBy: 'build --pdf（docx）', fix: '改用 build --to html --pdf' })
    const locales = project?.manual.locales ?? Object.keys(CULTURE)
    const missing = locales.filter((l) => CULTURE[l] && !win.voices.includes(CULTURE[l]))
    checks.push({
      name: 'TTS 語音',
      ok: missing.length === 0 && win.voices.length > 0,
      required: false,
      detail: win.voices.length > 0 ? `已安裝：${win.voices.join(' / ')}` : '找不到 System.Speech 語音',
      usedBy: 'video --narrate',
      fix: missing.length > 0 ? `在 Windows 設定裡安裝 ${missing.map((l) => CULTURE[l]).join(' / ')} 的語音` : undefined,
    })
  } else {
    checks.push({ name: 'Word', ok: false, required: false, detail: `${process.platform} 上沒有`, usedBy: 'build --pdf（docx）', fix: '改用 build --to html --pdf' })
    checks.push({ name: 'TTS 語音', ok: false, required: false, detail: `${process.platform} 上沒有 System.Speech`, usedBy: 'video --narrate' })
  }

  // 中文字在終端機裡佔兩格，padEnd 只算字元數會對不齊
  const cols = (s: string) => [...s].reduce((n, ch) => n + (/[⺀-￿]/.test(ch) ? 2 : 1), 0)
  const width = Math.max(...checks.map((c) => cols(c.name))) + 2
  for (const c of checks) {
    const mark = c.ok ? '✔' : c.required ? '✖' : '–'
    ui.info(`${mark} ${c.name}${' '.repeat(width - cols(c.name))}${c.detail}`)
    if (!c.ok) ui.info(`  ${' '.repeat(width)}用在：${c.usedBy}${c.fix ? `　補上：${c.fix}` : ''}`)
  }

  const blocking = checks.filter((c) => c.required && !c.ok)
  if (blocking.length > 0) {
    throw envError('ENV_INCOMPLETE', `缺少必要的環境：${blocking.map((c) => c.name).join(' / ')}`, { checks })
  }
  return { checks }
}
