/**
 * 轉檔：Playwright 錄出來的是 webm（VP8），交付前用 ffmpeg 轉成需要的格式。
 *
 * - mp4（H.264）：相容性最好，Word 裡附連結、上傳影音平台、內部 wiki 都能直接播。
 * - GIF：可以直接嵌進網頁手冊自動播放，但沒有聲音、只有 256 色，檔案也不小。
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { envError } from '../errors.js'

function ffmpeg(args: string[], cwd?: string) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf-8', cwd })
  if (result.error) throw envError('FFMPEG_MISSING', '找不到 ffmpeg —— 請先安裝並確認 ffmpeg 在 PATH 裡（webm 原檔已保留）。', {}, { cause: result.error })
  if (result.status !== 0) throw envError('FFMPEG_FAILED', `ffmpeg 失敗（exit code ${result.status}）：\n${result.stderr}`)
}

export type Extras = {
  /** 字幕檔（.srt）。預設做成可以開關的字幕軌；burn 時直接燒進畫面 */
  srt?: string
  /** 字幕軌的語言標籤（ISO 639-2，例如 chi / eng），播放器選字幕時看的是這個 */
  lang?: string
  burn?: boolean
  /** 旁白：每一句 wav 與它該在影片的第幾毫秒開始 */
  narration?: { file: string; at: number }[]
}

/**
 * 燒字幕用 libass 的 subtitles filter。filter 參數裡的 Windows 路徑（C:\...）要跳脫冒號與反斜線，
 * 很容易寫錯，所以直接把 cwd 切到字幕檔所在的資料夾，只傳檔名。
 */
const burnFilter = (srt: string) =>
  `subtitles=${path.basename(srt)}:force_style='FontName=Microsoft JhengHei,FontSize=20,Outline=1,Shadow=0,MarginV=24'`

export function toMp4(webm: string, mp4: string, extras: Extras = {}) {
  const { srt, lang, burn, narration = [] } = extras
  const inputs = ['-i', webm]
  const maps = ['-map', '0:v']
  const args: string[] = []
  let next = 1

  if (srt && !burn) {
    inputs.push('-i', srt)
    maps.push('-map', `${next++}:s`)
    // mp4 容器只收 mov_text 這種字幕格式
    args.push('-c:s', 'mov_text', ...(lang ? ['-metadata:s:s:0', `language=${lang}`] : []))
  }

  if (narration.length > 0) {
    // 每句旁白各自延遲到它的錨點時間，再混成一軌；normalize=0 避免句子越多、每句音量被平均得越小
    const first = next
    for (const n of narration) inputs.push('-i', n.file)
    const delayed = narration.map((n, i) => `[${first + i}:a]adelay=delays=${Math.round(n.at)}:all=1[a${i}]`)
    const mix = `${narration.map((_, i) => `[a${i}]`).join('')}amix=inputs=${narration.length}:normalize=0:duration=longest[aout]`
    args.push('-filter_complex', [...delayed, mix].join(';'), '-c:a', 'aac', '-b:a', '96k')
    maps.push('-map', '[aout]')
    next += narration.length
  }

  ffmpeg(
    [
      ...inputs,
      ...maps,
      ...(srt && burn ? ['-vf', burnFilter(srt)] : []),
      '-c:v', 'libx264',
      // yuv420p：不指定的話會沿用來源的格式，有些播放器（包括 Windows 內建的）會播不出來
      '-pix_fmt', 'yuv420p',
      // 畫面大部分時間是靜止的 UI，crf 28 看起來跟 23 幾乎沒差，檔案小一半左右
      '-crf', '28',
      '-preset', 'slow',
      ...args,
      // moov atom 移到檔頭，瀏覽器不用下載完整個檔案就能開始播
      '-movflags', '+faststart',
      path.resolve(mp4),
    ].map((a, i, all) => (all[i - 1] === '-i' ? path.resolve(a) : a)),
    srt && burn ? path.dirname(srt) : undefined,
  )
}

/**
 * GIF 的兩個關鍵：
 * 1. 先用 palettegen 從整支影片挑出最合適的 256 色，再用 paletteuse 套回去 ——
 *    直接轉的話 ffmpeg 會用一組通用調色盤，UI 上的淡灰底色會變成一格一格的色塊。
 * 2. 降 fps、縮小寬度。UI 操作不需要 25 fps，10 fps 就很順了。
 */
export function toGif(webm: string, gif: string, { srt, burn }: Extras = {}, width = 960) {
  // GIF 沒有字幕軌，要字幕只能燒進去
  const subs = srt && burn ? `${burnFilter(srt)},` : ''
  ffmpeg(
    [
      '-i', path.resolve(webm),
      '-vf',
      `${subs}fps=10,scale=${width}:-1:flags=lanczos,split[a][b];` +
        '[a]palettegen=stats_mode=diff[p];' +
        '[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle',
      path.resolve(gif),
    ],
    subs ? path.dirname(srt!) : undefined,
  )
}

export const sizeOf = (file: string) => {
  const bytes = fs.statSync(file).size
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`
}
