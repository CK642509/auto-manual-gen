/**
 * 旁白：把每句字幕交給 TTS 念成 wav。
 *
 * 示範用的是 Windows 內建的 SAPI（`tts.ps1`），不用額外安裝或申請金鑰，但聲音偏機械；
 * 要正式交付，換成雲端的神經網路 TTS 只要換掉這一支，介面（文字進、wav 出、回報長度）不變。
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { repoRoot } from '../config.js'
import type { Cue } from './captions.js'

/** manifest 的語言代碼 → Windows 語音的 culture。 */
const CULTURE: Record<string, string> = { 'zh-Hant': 'zh-TW', en: 'en-US' }

/** 網址念出來又長又沒意義，旁白改用一個詞帶過，字幕上仍然是完整網址。 */
const URL_WORD: Record<string, string> = { 'zh-Hant': '畫面上的位址', en: 'the address shown' }

/** 念 legend 清單時的停頓用哪種標點 —— TTS 看標點決定停多久，英文句子裡混進全形逗號會念得很怪。 */
const PAUSE: Record<string, { comma: string; stop: string }> = {
  'zh-Hant': { comma: '，', stop: '。' },
  en: { comma: ', ', stop: '. ' },
}

/**
 * 字幕是給眼睛看的，旁白是給耳朵聽的 —— 同一句話，要先處理過才適合念。
 * - 「」『』：念不出來，拿掉。
 * - 網址：一個字元一個字元念，一句話多出兩秒，換成一個詞。
 * - ① ② ③：念成「1，」「2，」（英文是 1, 2,），讓 legend 清單聽起來有停頓。
 */
export function speakable(text: string, locale: string): string {
  return text
    .replace(/[「」『』]/g, '')
    .replace(/\b[a-z]+:\/\/[^\s，。]*[^\s，。.,]/g, URL_WORD[locale] ?? '')
    .replace(/[①-⑩]\s*/g, (c) => `${c.charCodeAt(0) - 0x2460 + 1}${PAUSE[locale]?.comma ?? ' '}`)
    .replace(/　/g, PAUSE[locale]?.stop ?? ' ')
}

/** 念完一批句子，回傳每句的長度（毫秒）。wav 放在 `dir/{anchor}.wav`。 */
export function synthesize(cues: Cue[], locale: string, dir: string): Map<string, { file: string; ms: number }> {
  const culture = CULTURE[locale]
  if (!culture) throw new Error(`沒有設定 ${locale} 要用哪個語音（tts.ts 的 CULTURE）`)

  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  const jobs = cues.map((c) => ({ anchor: c.anchor, text: speakable(c.text, locale), out: path.join(dir, `${c.anchor.replace(':', '-')}.wav`) }))
  const jobsFile = path.join(dir, 'jobs.json')
  fs.writeFileSync(jobsFile, JSON.stringify(jobs))

  const script = path.join(repoRoot, 'runner', 'video', 'tts.ps1')
  const result = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Jobs', jobsFile, '-Culture', culture], {
    encoding: 'utf-8',
  })
  if (result.error) throw new Error('旁白目前只支援 Windows（System.Speech）', { cause: result.error })
  if (result.status !== 0) throw new Error(`TTS 失敗：\n${result.stderr || result.stdout}`)

  return new Map(jobs.map((j) => [j.anchor, { file: j.out, ms: durationMs(j.out) }]))
}

function durationMs(file: string): number {
  const out = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf-8' })
  return Math.round(parseFloat(out.stdout) * 1000)
}
