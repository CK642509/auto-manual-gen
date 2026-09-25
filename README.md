# auto-manual

> 改完 UI，跑一個指令，使用手冊就更新完畢。

用 **Playwright + AI Agent** 打造的使用手冊產線：驅動 App → 截圖 → 畫框標號 → 遮蔽機敏資訊 → 合併正文 → 產出 Word / PDF。

## AI 放在哪一層

執行期的啟動、操作、截圖、標註、遮蔽、排版**全部是決定性的腳本**，沒有 AI。
AI 只負責**產生之後由機器重複執行的東西** —— 寫 manifest、寫正文、判讀差異。

判準一句話：*AI 的輸出會不會被凍結成可審查的產物，或被決定性機制驗證？*

## Quickstart

需要 Node 20+。

```bash
npm install

npm run demo            # Web 模式，開 http://localhost:5173
npm run demo:electron   # Electron 模式（會先 build 再啟動）
```

跑產線本身：

```bash
npm run manual                             # 整本 manifest，產出 screenshots/
npm run manual -- --chapter layout-preset  # 只重跑一章
npm run manual -- --mode web               # 指定形態（web 要另開終端機跑 npm run demo）
```

形態預設讀 `config.json` 的 `app.mode`（範本是 `electron`，會自己先 build，不必另外開服務）。

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
與 `manifest/schema.json`，寫出 `manifest/50-camera-add.yaml`。這個分支把**人工審查前**
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

`npm run build` 把 `docs/` 的正文依 manifest 的 order 合併成 `output/manual.md`，
展開 `{{legend.*}}` 與 `{{screenshot:*}}`（截圖下方自動附上 legend 表格），再交給 pandoc 套
`templates/reference.docx` 產出 Word。需要先安裝 [pandoc](https://pandoc.org/installing.html)（文章用 3.11）。

```bash
npm run manual                # 先把九張截圖拍好
npm run build                 # output/manual.md + output/manual.docx
npm run build -- --pdf        # 再用 Word 更新目錄頁碼、轉出 output/manual.pdf（需要 Windows + Word）
```

封面的版本號取自 `manifest/manual.yaml`，日期與 commit 取自 git，不在任何地方手寫。
`templates/reference.docx` 是 pandoc 預設樣式檔改出來的，改了哪些樣式寫在 `tools/style-reference-docx.ps1`。

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

repo 根目錄**本身就是一本手冊專案**：`manifest/` 是唯一的人為真相來源，
`runner/` 讀它、驅動 App、產出 `screenshots/`，再與 `docs/` 的正文合流成 `output/`。

```
auto-manual/
├─ manifest/               # 章節、步驟、標註 —— 唯一的人為真相來源
│  ├─ schema.json          #   manifest 的 JSON Schema
│  ├─ manual.yaml          #   profile + bootstrap（每一章開始前都要準備好的環境）
│  └─ 20-live-monitor.yaml #   一章一個檔案，{order}-{id}.yaml
├─ docs/                   # 正文（AI 生成 + 人工保護區），檔名與章節 id 對齊
│  ├─ 10-overview.md
│  └─ 20-live-monitor.md
├─ fixtures/               # 固定假資料，讓畫面每次都長一樣
├─ config.example.json     # 環境設定範本（實際的 config.json 一人一份，不進版控）
├─ templates/              # reference.docx，排版樣式與內容分離（pandoc 只讀它的樣式，不讀內容）
├─ runner/                 # 執行邏輯：drivers / actions / capture / overlay / video / probe / cli
│  └─ run.ts               #   讀 manifest 驅動 App，一章一次開機（npm run manual）
├─ tools/                  # 跟產線無關的小工具（文章插圖、log 渲染）
├─ screenshots/            # 產線拍出來的圖（含標註），不進版控
├─ output/                 # 最終的 manual.docx / manual.pdf
│  └─ failures/{id}/       #   失敗現場：整頁截圖 + DOM dump，只給除錯用
├─ agent/                  # 給 AI agent 的上下文（UI-MAP / STYLE / QUIRKS / few-shot）
│  └─ diff-pairs/          #   已知答案的圖對，檢驗 AI 差異判讀
├─ plugin/                 # Claude Code plugin
└─ apps/demo-stream-app/   # 靶：範例 App，Electron + Vue 3，同一份也能純 Web 跑
   └─ TESTID.md            #   命名規範 —— 同時給人看與給 agent 看
```

命名約定是這條產線的接合處，不另外維護索引檔：

```
manifest 的章節 id  ↔  docs/{order}-{id}.md  ↔  screenshots/{id}-NN.png
```

`order` 用 10 的倍數編號，中間留空間插入章節。

三個目錄是這個 repo 真正的差異化資產：**`agent/`**（給 AI 的上下文）、
**根目錄那本手冊本身**（manifest + docs + 產物）、**`agent/diff-pairs/`**（可驗證的判讀樣本）。
工具本身反而是最容易被取代的部分。

> **`apps/` 與其餘目錄實務上應該是兩個 repo。** 產品有產品的版控節奏，產線是另一套工具，
> 硬綁在一起只會互相牽制。這裡放在同一個 repo 純粹是為了方便展示 ——
> clone 一次就同時拿到靶跟打靶的工具。

## 現況

🚧 骨架階段。`apps/demo-stream-app` 與 `runner/`（`drivers/` + `run.ts` + `probe.ts` + `validate.ts`）
可以跑，`manifest/` 有一本五章的示範手冊（含 schema.json），`agent/` 有 `UI-MAP.md`、`QUIRKS.md`、`STYLE.md`
與兩章 manifest few-shot 範例，`docs/` 五章都有正文；`plugin/` 還只有 `.gitkeep`。
正文用 `{{legend.<key>}}` 與 `{{screenshot:<name>}}` 引用 manifest，`validate` 會檢查這些引用與人工保護區，`build` 把它們合併成 Word / PDF。

## 授權

MIT。DemoStreamApp 是**虛構的示範產品**，裡面的所有資料（攝影機名稱、RTSP 位址、授權金鑰）皆為捏造，
畫面上的「即時影像」是純 CSS 繪製的假畫面，不含任何真實影像或人臉。
