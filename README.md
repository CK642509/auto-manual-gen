# auto-manual

> 改完 UI，跑一個指令，使用手冊就更新完畢。

用 **Playwright + AI Agent** 打造的使用手冊產線：驅動 App → 截圖 → 畫框標號 → 遮蔽機敏資訊 → 合併正文 → 產出 Word / PDF。

## AI 放在哪一層

執行期的啟動、操作、截圖、標註、遮蔽、排版**全部是決定性的腳本**，沒有 AI。
AI 只負責**產生之後由機器重複執行的東西** —— 寫 manifest、寫正文、判讀差異。

判準一句話：*AI 的輸出會不會被凍結成可審查的產物，或被決定性機制驗證？*

## 這個 repo 裡有什麼

產線本身是一個 npm 套件 **[`auto-manual-gen`](packages/auto-manual-gen/)**（CLI），repo 的其餘部分就是「一個使用它的手冊專案」：

| 位置 | 是什麼 |
|---|---|
| [`packages/auto-manual-gen/`](packages/auto-manual-gen/) | CLI 本體：`init` `doctor` `probe` `validate` `run` `build` `sync` `video` `tour`。**要用在自己的專案，從[這份 README](packages/auto-manual-gen/README.md) 開始** |
| `manual.yaml` + `manifest/` + `docs/` | 範例手冊專案：DemoStreamApp 的五章手冊（中英文） |
| `apps/demo-stream-app/` | 被拍的靶：Electron + Vue 3 的示範 App |
| `agent/` | 給 AI agent 的上下文（UI-MAP / QUIRKS / STYLE / few-shot） |

## Quickstart

需要 Node 20+。

```bash
npm install             # 會順便編譯 packages/auto-manual-gen

npm run demo            # Web 模式，開 http://localhost:5173
npm run demo:electron   # Electron 模式（會先 build 再啟動）
```

跑產線本身（`npm run manual` 就是 `auto-manual-gen run`，其他 npm script 也都只是轉給 CLI）：

```bash
npm run doctor                             # 檢查環境：pandoc、ffmpeg、Word、TTS 有沒有裝
npm run manual                             # 整本 manifest × 所有語言，產出 screenshots/{locale}/
npm run manual -- --locale en              # 只跑一個語言
npm run manual -- --chapter layout-preset  # 只重跑一章
npm run manual -- --mode web               # 指定形態（web 要另開終端機跑 npm run demo）
npx auto-manual-gen run --json             # 直接呼叫 CLI 也可以；--json 給 CI 與 agent 用
```

形態預設讀 `manual.yaml` 的 `app.mode`（`electron`，會自己先 build，不必另外開服務）。
想固定用 Web 模式，把 `config.example.json` 複製成 `config.json`（只能覆寫 `app`，不進版控）。
改了 `packages/auto-manual-gen/src/` 之後要 `npm run cli:build` 重新編譯。

### 重現 Day 15 那次失敗

文章裡的失敗是真的跑出來的，這個分支把修之前與修之後都留著：

```bash
# 取回還沒修的那一版（tag 指著修正前的最後一個 commit）
git checkout day15-before-fix -- manifest/30-layout-preset.yaml
npm run manual -- --mode web                          # 跑到第 3 章 layout-preset 失敗

git checkout HEAD -- manifest/30-layout-preset.yaml   # 修回來
npm run manual -- --chapter layout-preset --mode web  # 只重跑那一章
```

執行紀錄逐字存在 `tools/logs/`，文章裡的終端機圖是 `npm run terminal:shot` 從它渲染的。
**截圖不會跟文章裡像素完全相同** —— 字型隨作業系統而異，那是 Day 23 談 CI 時要處理的題目。

兩個指令跑的是**同一份前端**。畫面右上角會顯示當前模式，這是 `AppDriver`
一套腳本服務兩種產品形態的基礎。

### 重現 Day 17 那次 AI Agent 加一章

Day 17 讓 agent 讀 `agent/UI-MAP.md`、`agent/QUIRKS.md`、`apps/demo-stream-app/TESTID.md`
與 manifest 的 schema（現在在 `packages/auto-manual-gen/schema/v1/manifest.json`），寫出 `manifest/50-camera-add.yaml`。這個分支把**人工審查前**
與**微調後**兩個版本都留著，對應文章裡的兩張 diff：

```bash
npm install
npm run demo   # 另開一個終端機，Web 模式跑起來

# agent 的第一版：只示範填顯示名稱
git checkout day17-agent-v1 -- manifest/50-camera-add.yaml
npm run validate -- --chapter camera-add
npm run manual -- --chapter camera-add --mode web   # 產出 camera-add-01 / -02

# 人工審查後微調：補 RTSP 位址、修正 legend、示範按下確認鍵
git checkout day17 -- manifest/50-camera-add.yaml
npm run manual -- --chapter camera-add --mode web   # 多出 camera-add-03
```

`probe` 與 `validate` 也是 Day 17 補上的，探勘畫面可以直接試：

```bash
npm run probe -- --mode web --after click:camera-add
```

### 重現 Day 19 的正文驗收

`validate` 在 manifest 之後會接著驗正文：legend 與截圖引用、人工保護區，以及「」裡的名稱有沒有出處。
`tools/samples/day19-camera-add-broken.md` 是一份**故意改壞**的新增攝影機正文，
四種問題各放一個：改寫了保護區、引用本章沒有的 legend、漏放一張截圖、寫了 App 沒有的「快速匯出」。

```bash
npm run validate -- --chapter camera-add   # 審過的版本：通過

cp tools/samples/day19-camera-add-broken.md docs/50-camera-add.md
npm run validate -- --chapter camera-add   # 三個錯誤 + 一則需要人工確認

git checkout -- docs/50-camera-add.md      # 復原
```

執行紀錄存在 `tools/logs/day19-validate-broken.txt`。保護區預設跟 `HEAD` 比，
要跟其他版本比就加 `--base <ref>`。

### 重現 Day 20 的 Word / PDF 交付

`npm run build` 把 `docs/` 的正文依 manifest 的 order 合併成 `output/{locale}/manual.md`，
展開 `{{legend.*}}` 與 `{{screenshot:*}}`（截圖下方自動附上 legend 表格），再交給 pandoc 套
`templates/reference.docx` 產出 Word。需要先安裝 [pandoc](https://pandoc.org/installing.html)（文章用 3.11）。

```bash
npm run manual                # 先把九張截圖拍好
npm run build                 # output/{locale}/manual.md + manual.docx
npm run build -- --pdf        # 再用 Word 更新目錄頁碼、轉出 manual.pdf（需要 Windows + Word）
```

封面的版本號取自 `manual.yaml`，日期與 commit 取自 git，不在任何地方手寫。
`templates/reference.docx` 是 pandoc 預設樣式檔改出來的，改了哪些樣式寫在 `tools/style-reference-docx.ps1`。

### 重現 Day 21 的 HTML 版與不靠 Office 的 PDF

同一份 `output/{locale}/manual.md` 改交給 pandoc 產 HTML，樣式來自 `templates/manual.css`（HTML 版的 reference.docx）。
`--embed-resources` 會把截圖內嵌進去，產出單一檔案，可以直接放上網或寄出去。

```bash
npm run build -- --to html          # output/{locale}/manual.html
npm run build -- --to html --pdf    # 再用 Playwright 的 Chromium 印成 manual-html.pdf
```

第二條路不需要 Word 或 LibreOffice，Linux 上也能跑；代價是 PDF 的目錄沒有頁碼、封面也會印上頁碼。

### 重現 Day 22 的多語言手冊

`manual.yaml` 的 `locales: [zh-Hant, en]` 決定要出哪些語言，第一個是主語言。
runner 逐語言把 `locale` 注入 localStorage，同一份 manifest 重跑一遍 —— 截圖本身不用改任何設定。

會跟著語言變的欄位（章節標題、legend、示範輸入值）在 manifest 裡寫成 `{ zh-Hant: ..., en: ... }`，
只寫字串代表每個語言都一樣（例如搜尋關鍵字 `lobby`）。正文的主語言在 `docs/`，其他語言在 `docs/{locale}/`。

```bash
npm run manual                        # 5 章 × 2 種語言 -> screenshots/zh-Hant/、screenshots/en/
npm run validate                      # 每個語言各驗一次；英文正文的粗體名稱對照 en.json
npm run build                         # output/zh-Hant/manual.docx、output/en/manual.docx
npm run build -- --to html            # output/zh-Hant/manual.html、output/en/manual.html
npm run build -- --locale en          # 只出英文版
```

Electron 模式每次開機都用一個全新的 userData 目錄 —— 否則上一次執行存下的設定會跟到下一次（例如人臉辨識已經是開的，再點一次反而關掉）。

### 重現 Day 23 的翻譯同步

中文正文改了之後，`sync` 找出英文版哪幾段要重翻。正文以空行切段、每段算 hash，
`docs/en/{order}-{id}.sync.json` 記下「中文段落 hash ↔ 英文段落 hash」，比對靠 hash 不靠位置，
中間插一段不會讓後面的段落都變成「需要翻譯」。

```bash
npm run sync -- --locale en                       # 列出每一章：需要翻譯 / 需要確認 / 舊譯文
npm run sync -- --locale en --accept camera-add   # 翻好、審完之後，記下這一版的段落對照
```

`--accept` 要求兩邊段落一對一（段落數、截圖、保護區、標題層級都對得上），譯文不能拆段或併段。

文章裡的輸出可以用 `tools/samples/` 的三份檔案重現：中文改了兩段、英文被直接潤飾一段，最後補上翻譯。

```bash
cp tools/samples/day23-camera-add-zh.md docs/50-camera-add.md
cp tools/samples/day23-camera-add-en-edited.md docs/en/50-camera-add.md
npm run sync -- --locale en                        # 需要翻譯 2 段、需要確認 1 段、舊譯文 2 段
npm run sync -- --locale en --accept camera-add    # 被擋下來：原文 15 段、譯文 14 段

cp tools/samples/day23-camera-add-en-translated.md docs/en/50-camera-add.md
npm run sync -- --locale en --accept camera-add    # 記下 15 段的對照
npm run sync -- --locale en                        # 全部同步

git checkout -- docs/                              # 復原
```

執行紀錄存在 `tools/logs/day23-sync.txt`。

### 重現 Day 24 的教學影片與 GIF

錄影用的是同一份 manifest 的 `steps`，只是把「按快門」換成「從頭錄到尾」。
章節要在 manifest 標上 `video: true` 才會錄（目前只有「新增攝影機」）；需要先安裝 [ffmpeg](https://ffmpeg.org/download.html)。

```bash
npm run video                              # 標了 video: true 的章節 × 所有語言 -> output/video/{locale}/{id}.mp4
npm run video -- --locale zh-Hant --gif    # 只錄一個語言，並多轉一份 GIF
npm run video -- --chapter layout-preset   # 沒標 video: true 的章節也可以指定來錄
```

錄影用 Playwright 新版的 `page.screencast`（本專案用 1.63），開機（含狀態注入後的 reload）做完才開始錄。
畫面上的游標是 `packages/auto-manual-gen/src/overlay/cursor.ts` 畫上去的假游標；截圖的位置改成停下來畫上同一套標註，並把 `clip` 以外調暗。
執行紀錄在 `tools/logs/day24-video.txt`。

### 重現 Day 25 的字幕與旁白

字幕不另外寫：內容取自正文的編號步驟、legend 與「完成後」的第一段（`packages/auto-manual-gen/src/video/captions.ts`）。
正文跟 manifest 都有同名的截圖，先用截圖把兩邊切段，再在每一段裡把編號步驟配對到會動的 step。
錄影時記下每個 step 的時間（`output/video/{locale}/{id}.timeline.json`），字幕的時間就從這裡來。

```bash
npm run video                              # mp4 內含可開關的字幕軌，另外輸出 .srt / .vtt
npm run video -- --burn --gif              # 字幕燒進畫面（GIF 沒有字幕軌，要字幕只能燒進去）
npm run video -- --narrate                 # TTS 旁白（Windows 內建的 System.Speech，需要 zh-TW / en-US 語音）
npm run video -- --captions-only           # 正文改字時用：不重錄，只用上次的時間軸重產字幕
```

節奏由字幕決定：下一句字幕出現之前，會先等上一句讀完（有旁白就是念完）；截圖的位置停留時會暫停頁面的計時器，
不然 3 秒就消失的 toast 撐不到字幕讀完。重現「只改正文、不重錄」：把 `tools/samples/day25-camera-add-reworded.md`
複製成 `docs/50-camera-add.md`，再跑 `--captions-only`。執行紀錄在 `tools/logs/day25-*.txt`。

### 重現 Day 26 的 App 內導覽

同一份 manifest 與正文，轉成 App 自己的操作導覽：右上角的「?」選一章，[driver.js](https://driverjs.com/) 會一步一步指著畫面上的元件，
請使用者自己操作。章節要在 manifest 標上 `tour: true` 才會產生（目前是「介面總覽」與「新增攝影機」）。

```bash
npm run tour               # -> apps/demo-stream-app/src/renderer/help/tours.json
npm run tour -- --check    # manifest / 正文改了但 tours.json 沒重產，就以非 0 結束
npm run demo               # 開 App，按右上角的「?」
```

`tours.json` 是產物，但它要跟著 App 一起打包，所以跟 i18n 檔一樣進版控（路徑寫在 `manual.yaml` 的 `tour.output`）。
依賴示範資料的章節（例如雙擊 `camera-row_lobby-01` 的「即時監控畫面」）不要標 `tour: true` —— 使用者的畫面上不一定有那台攝影機。
執行紀錄在 `tools/logs/day26-tour.txt`。

### 重現 Day 27 的 CLI

產線從 `runner/` 抽成了 `packages/auto-manual-gen/`，這個 repo 改成透過 npm workspace 使用它，跟別人 `npm install -D auto-manual-gen` 的用法一樣。

在任何一個空資料夾試 `init`（另一個終端機開著 `npm run demo`）：

```bash
mkdir /tmp/my-manual && cd /tmp/my-manual
npx --prefix <這個 repo 的路徑> auto-manual-gen init --url http://localhost:5173
npx --prefix <這個 repo 的路徑> auto-manual-gen run     # -> screenshots/zh-Hant/overview-01.png
```

exit code 與 `--json`：拿 Day 15 那次失敗來試，看 agent 與 CI 會收到什麼。

```bash
git checkout day15-before-fix -- manifest/30-layout-preset.yaml
npx auto-manual-gen run --chapter layout-preset --mode web --locale zh-Hant --json   # exit 1，error.code = SELECTOR_NOT_FOUND
git checkout HEAD -- manifest/30-layout-preset.yaml

npx auto-manual-gen validate --chapter nope        # exit 2：參數錯了，列出可用的章節
npx auto-manual-gen build                          # 沒裝 pandoc 的話 exit 3
npx auto-manual-gen doctor                         # 哪些能力可以用、缺什麼

npm run cli:pack                                   # npm pack --dry-run：發布出去的套件裡到底有哪些檔案
```

CLI 的完整說明（指令、`manual.yaml` 欄位、manifest 動詞、自訂 driver）在 [`packages/auto-manual-gen/README.md`](packages/auto-manual-gen/README.md)。

### 這個靶長什麼樣子

DemoStreamApp 是一個虛構的 AI 影像串流監控台，兩個分頁：

- **即時監控** —— 左欄是攝影機清單（15 台，要捲動），右欄是可切換 1×1 / 2×2 / 3×3 / 4×4 的畫面牆。
  **雙擊左欄的攝影機**就依序填入右側第一個空格，按格子右上角的 **✕** 只清掉那一格；
  配好的版面可以存成具名的「版面設定」，之後從下拉選單一鍵套回來。
- **系統設定** —— 告警、動作偵測、人臉辨識三組開關（子設定是條件渲染的），
  加上僅管理員可見的「授權與裝置」區塊。

### 這個靶刻意很難拍

它把截圖產線會遇到的麻煩全部塞進同一個 App：

| 元素 | 麻煩在哪 | 產線怎麼解 |
|---|---|---|
| 每格畫面的偵測框 | CSS 動畫持續飄移 | 停用動畫 / fixture 圖替換 |
| 每格畫面的時間戳 | 每秒跳動 | 凍結時間 |
| 推論 FPS、偵測數 | 每 1.2 秒重算 | 攔截 API 或遮掉該區域 |
| 授權金鑰、伺服器位址、裝置序號 | 條件渲染 + 機敏資訊 | 注入權限後 redact / blur / replace |
| 操作成功的 Toast | 3 秒後自動消失 | 等語意訊號後立刻按快門 |
| 攝影機清單 | 非同步載入，先出骨架屏 | 等骨架屏消失而不是固定延遲 |
| 刪除確認框 | 疊在設定對話框上的第二層 | 決定拍哪一層；離開章節時兩層都要關 |
| 攝影機清單 | 長到需要捲動 | 捲動後 `boundingBox` 必須重取 |

在瀏覽器 console 執行，然後 reload，可以親眼看到狀態注入的效果：

```js
localStorage.setItem('locale', 'en')    // 換語言 → 整頁文案改變，text selector 全失效
localStorage.setItem('role', 'admin')   // 提權   → 「授權與裝置」區塊才會出現
localStorage.setItem('layout', '{"mode":"3x3","cells":["gate-a","lobby-01","rooftop"]}')
                                        // 注入版面 → 直接跳到配置好的畫面，不必手動雙擊九次
localStorage.clear()                    // 復原
```

產線就是靠 `addInitScript` 在第一個 navigation 之前注入這些值，
重跑同一份 manifest 產出不同語言、不同權限、不同版面的手冊。
完整的 key 格式與所有 testid 見 [`apps/demo-stream-app/TESTID.md`](apps/demo-stream-app/TESTID.md)。

## 目錄結構

repo 根目錄**本身就是一本手冊專案**：`manual.yaml` 標出專案的根目錄，`manifest/` 是唯一的人為真相來源，
`auto-manual-gen` 讀它、驅動 App、逐語言產出 `screenshots/{locale}/`，再與 `docs/` 的正文合流成 `output/{locale}/`。

```
auto-manual/
├─ manual.yaml             # 專案設定：語言、bootstrap、怎麼啟動 App、各種路徑（進版控）
├─ config.example.json     # 個人環境範本（實際的 config.json 一人一份、不進版控，只能覆寫 app）
├─ manifest/               # 章節、步驟、標註 —— 唯一的人為真相來源
│  └─ 20-live-monitor.yaml #   一章一個檔案，{order}-{id}.yaml
├─ docs/                   # 正文（AI 生成 + 人工保護區），檔名與章節 id 對齊
│  ├─ 10-overview.md       #   主語言（manual.yaml 的 locales 第一個）
│  ├─ 20-live-monitor.md
│  └─ en/                  #   其他語言各一個資料夾，檔名相同
├─ fixtures/               # 固定假資料，讓畫面每次都長一樣
├─ templates/              # 自訂過的 reference.docx 與 manual.css（沒有的話會用套件內建的）
├─ packages/
│  └─ auto-manual-gen/     # 產線本體（npm 套件）：src/、schema/v1/、assets/
├─ tools/                  # 跟產線無關的小工具（文章插圖、log 渲染、driver 煙霧測試）
├─ screenshots/{locale}/   # 產線拍出來的圖（含標註），一個語言一個資料夾，不進版控
├─ output/{locale}/        # 最終的 manual.docx / manual.pdf / manual.html
│  └─ failures/{locale}/{id}/ # 失敗現場：整頁截圖 + DOM dump，只給除錯用
├─ agent/                  # 給 AI agent 的上下文（UI-MAP / STYLE / QUIRKS / few-shot）
│  └─ diff-pairs/          #   已知答案的圖對，檢驗 AI 差異判讀
├─ plugin/                 # Claude Code plugin
└─ apps/demo-stream-app/   # 靶：範例 App，Electron + Vue 3，同一份也能純 Web 跑
   └─ TESTID.md            #   命名規範 —— 同時給人看與給 agent 看
```

命名約定是這條產線的接合處，不另外維護索引檔：

```
manifest 的章節 id  ↔  docs/[{locale}/]{order}-{id}.md  ↔  screenshots/{locale}/{id}-NN.png
```

`order` 用 10 的倍數編號，中間留空間插入章節。

三個目錄是這個 repo 真正的差異化資產：**`agent/`**（給 AI 的上下文）、
**根目錄那本手冊本身**（manifest + docs + 產物）、**`agent/diff-pairs/`**（可驗證的判讀樣本）。
工具本身反而是最容易被取代的部分。

> **`apps/` 與其餘目錄實務上應該是兩個 repo。** 產品有產品的版控節奏，產線是另一套工具，
> 硬綁在一起只會互相牽制。這裡放在同一個 repo 純粹是為了方便展示 ——
> clone 一次就同時拿到靶跟打靶的工具。

## 現況

`packages/auto-manual-gen` 已經可以發布（`npm run cli:pack` 看內容，`.github/workflows/release.yml` 用 trusted publishing 發布），
`manifest/` 有一本五章的示範手冊，`agent/` 有 `UI-MAP.md`、`QUIRKS.md`、`STYLE.md` 與兩章 manifest few-shot 範例，
`docs/` 五章都有中英文正文；`plugin/` 還只有 `.gitkeep`（Day 28）。

## 授權

MIT。DemoStreamApp 是**虛構的示範產品**，裡面的所有資料（攝影機名稱、RTSP 位址、授權金鑰）皆為捏造，
畫面上的「即時影像」是純 CSS 繪製的假畫面，不含任何真實影像或人臉。
