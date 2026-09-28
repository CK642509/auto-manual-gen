/**
 * 轉檔：Playwright 錄出來的是 webm（VP8），交付前用 ffmpeg 轉成需要的格式。
 *
 * - mp4（H.264）：相容性最好，Word 裡附連結、上傳影音平台、內部 wiki 都能直接播。
 * - GIF：可以直接嵌進網頁手冊自動播放，但沒有聲音、只有 256 色，檔案也不小。
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'

function ffmpeg(args: string[]) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf-8' })
  if (result.error) throw new Error('找不到 ffmpeg —— 請先安裝並確認 ffmpeg 在 PATH 裡（webm 原檔已保留）。', { cause: result.error })
  if (result.status !== 0) throw new Error(`ffmpeg 失敗（exit code ${result.status}）：\n${result.stderr}`)
}

export function toMp4(webm: string, mp4: string) {
  ffmpeg([
    '-i', webm,
    '-c:v', 'libx264',
    // yuv420p：不指定的話會沿用來源的格式，有些播放器（包括 Windows 內建的）會播不出來
    '-pix_fmt', 'yuv420p',
    // 畫面大部分時間是靜止的 UI，crf 28 看起來跟 23 幾乎沒差，檔案小一半左右
    '-crf', '28',
    '-preset', 'slow',
    // moov atom 移到檔頭，瀏覽器不用下載完整個檔案就能開始播
    '-movflags', '+faststart',
    mp4,
  ])
}

/**
 * GIF 的兩個關鍵：
 * 1. 先用 palettegen 從整支影片挑出最合適的 256 色，再用 paletteuse 套回去 ——
 *    直接轉的話 ffmpeg 會用一組通用調色盤，UI 上的淡灰底色會變成一格一格的色塊。
 * 2. 降 fps、縮小寬度。UI 操作不需要 25 fps，10 fps 就很順了。
 */
export function toGif(webm: string, gif: string, width = 960) {
  ffmpeg([
    '-i', webm,
    '-vf',
    `fps=10,scale=${width}:-1:flags=lanczos,split[a][b];` +
      '[a]palettegen=stats_mode=diff[p];' +
      '[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle',
    gif,
  ])
}

export const sizeOf = (file: string) => {
  const bytes = fs.statSync(file).size
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`
}
