# auto-manual-gen

> 改完 UI，跑一個指令，使用手冊就更新完畢。

用 Playwright 驅動你的 App（Web 或 Electron），依照宣告式的 manifest 操作、截圖、畫框標號，
再跟 Markdown 正文合併成 Word / HTML / PDF 手冊。同一份 manifest 也能錄成附字幕的教學影片，或轉成 App 內導覽。

執行期全部是決定性的腳本，沒有 AI。AI agent（或人）負責寫 manifest 與正文，這個工具負責驗證與重複執行。

完整的範例專案（一個 Electron + Vue 的示範 App 與五章手冊）在
[CK642509/auto-manual-gen](https://github.com/CK642509/auto-manual-gen)，clone 下來就能跑。

## Quickstart

需要 Node 20+。在你的 App 跑起來的狀態下：

```bash
npm install -D auto-manual-gen playwright
npx playwright install chromium

npx auto-manual-gen init --url http://localhost:3000   # 產生 manual.yaml、一章 manifest 與正文
npx auto-manual-gen run                                # -> screenshots/zh-Hant/overview-01.png
```

接著：

```bash
npx auto-manual-gen probe          # 列出畫面上有哪些 data-testid，拿來寫 manifest
npx auto-manual-gen validate       # 不開瀏覽器，先驗 manifest 與正文
npx auto-manual-gen build          # 合併成 output/zh-Hant/manual.docx（需要 pandoc）
npx auto-manual-gen doctor         # 看目前環境缺什麼
```

## 指令

| 指令 | 用途 | 主要選項 |
|---|---|---|
| `init` | 在目前目錄產生最小可跑的骨架 | `--url` `--mode web\|electron` `--app-dir` `--locale zh-Hant\|en` |
| `doctor` | 檢查環境：哪些功能能用、缺什麼 | |
| `probe` | 列出畫面上可見且具 `data-testid` 的元件、文字與位置 | `--after click:<testid>,...` `--mode` `--locale` |
| `validate` | 驗證 manifest（schema + 命名一致性）與正文（引用、保護區、名稱出處） | `--chapter` `--locale` `--base <git ref>` |
| `run` | 依 manifest 驅動 App、產出截圖；一章一次開機，可局部重跑 | `--chapter` `--locale` `--mode` |
| `build` | 合併正文與截圖，pandoc 產 docx 或單檔 HTML，可再轉 PDF | `--to docx\|html` `--pdf` `--locale` |
| `sync` | 翻譯同步：主語言改了哪幾段、譯文要重翻哪幾段 | `--locale` `--accept <chapter>` |
| `video` | 把標了 `video: true` 的章節錄成 mp4 / GIF，字幕取自正文 | `--chapter` `--gif` `--burn` `--narrate` `--captions-only` |
| `tour` | 把標了 `tour: true` 的章節轉成 App 內導覽資料（JSON） | `--check` |

`probe`、`validate`、`run` 三個合起來，就是 agent 的自我驗證迴圈：先探勘畫面、寫 manifest、驗證、執行、依錯誤修正。

### exit code 與 `--json`

每個指令都支援 `--json`：stdout 只輸出一份 JSON（`{ command, ok, result }` 或 `{ command, ok: false, error }`），進度訊息全部關掉。

| exit code | 意思 | 例子 |
|---|---|---|
| 0 | 成功 | |
| 1 | 手冊內容有問題 | `validate` 不過、selector 找不到、`sync` 有段落沒同步 |
| 2 | 使用方式或設定錯誤 | 參數打錯、找不到 `manual.yaml`、`manual.yaml` 欄位寫錯 |
| 3 | 環境缺東西 | 沒裝 pandoc / ffmpeg、Chromium 沒下載、在非 Windows 上要求 Word 轉 PDF |

CI 看到 1 就擋下 PR，看到 3 代表是 runner 機器的問題；agent 看到 1 可以去改 manifest，看到 3 就不該動任何檔案。
`error.code` 是給程式判斷用的（例如 `SELECTOR_NOT_FOUND`），`run` 失敗時還會帶上章節、step、候選 testid 與失敗現場的路徑：

```json
{
  "command": "run",
  "ok": false,
  "error": {
    "kind": "content",
    "code": "SELECTOR_NOT_FOUND",
    "chapter": "layout-preset",
    "locale": "zh-Hant",
    "step": 4,
    "testid": "grid-cell-fps_1",
    "candidates": ["grid-cell_1", "grid-cell-view_1", "grid-cell-name_1"],
    "failure": { "screenshot": "output/failures/zh-Hant/layout-preset/failure.png", "dom": "output/failures/zh-Hant/layout-preset/failure.html" }
  }
}
```

## 手冊專案的結構

```text
my-manual/
├── manual.yaml              # 專案設定（進版控）；工具從目前目錄往上找它
├── config.json              # 個人環境（不進版控），只能覆寫 app
├── manifest/
│   └── 10-overview.yaml     # 一章一個檔案：{order}-{id}.yaml
├── docs/
│   ├── 10-overview.md       # 主語言正文，檔名跟 manifest 對齊
│   └── en/10-overview.md    # 其他語言
├── screenshots/{locale}/    # 產物：{id}-NN.png（不進版控）
└── output/{locale}/         # 產物：manual.docx / .html / .pdf、failures/、video/（不進版控）
```

命名約定就是索引，不另外維護對照表：

```
manifest 的章節 id  ↔  docs/[{locale}/]{order}-{id}.md  ↔  screenshots/{locale}/{id}-NN.png
```

## `manual.yaml`

```yaml
# yaml-language-server: $schema=https://ck642509.github.io/auto-manual-gen/schema/v1/manual.json
profile: my-app
title: { zh-Hant: 使用手冊, en: User Manual }   # 封面標題；只寫字串代表每個語言都一樣
version: 'v1.2.0'                                # 封面版號；日期與 commit 取自 git
locales: [zh-Hant, en]                           # 第一個是主語言

bootstrap:                                       # 每一章開機後、開始 steps 之前的準備
  viewport: { width: 1600, height: 900, deviceScaleFactor: 2 }
  storage: { role: operator }                    # 第一次 navigation 之前注入 localStorage
  localeKey: locale                              # App 從哪個 localStorage key 讀語言（多語言時必填）
  ready: app-root                                # 這個 testid 出現才算開機完成；沒寫就等 load
  clock: '2025-09-01T09:00:00'                   # 凍結時間
  disableAnimations: true                        # 注入 CSS 停用 animation / transition

app:
  mode: electron                                 # electron / web / custom；--mode 可以蓋過
  electron: { projectDir: ../my-app, build: npm run build }
  web: { url: http://localhost:5173 }
  # custom: { driver: ./manual/driver.mjs }

paths:                                           # 都可以省略，以下是預設值
  manifest: manifest
  docs: docs
  screenshots: screenshots
  output: output
  # template: templates/reference.docx           # Word 樣式；沒寫用內建的
  # css: templates/manual.css                    # HTML 樣式；沒寫用內建的

text:
  messages: ../my-app/src/locales/{locale}.json  # validate 用來比對正文裡的名稱有沒有出處

tour:
  output: ../my-app/src/help/tours.json          # tour 指令的產物位置
```

完整定義在 [`schema/v1/manual.json`](schema/v1/manual.json)。`config.json` 跟 `manual.yaml` 放在同一層，內容只能是 `{ "app": { ... } }`，例如自己機器上的 dev server 埠號不同：

```json
{ "app": { "mode": "web", "web": { "url": "http://localhost:5174" } } }
```

## manifest

一章一個 YAML。刻意**不提供條件判斷、迴圈、變數**：manifest 要能被人 review，一旦圖靈完備就做不到了。

```yaml
# yaml-language-server: $schema=https://ck642509.github.io/auto-manual-gen/schema/v1/manifest.json
id: camera-add
title: { zh-Hant: 新增攝影機, en: Adding a Camera }
order: 50          # 10 的倍數，中間留空間插章
video: true        # 也錄成影片（video 指令）
tour: true         # 也做成 App 內導覽（tour 指令）

steps:
  - { action: waitFor, testid: camera-list }
  - { action: click, testid: camera-add }
  - action: screenshot
    name: camera-add-01                        # 必須以章節 id 開頭
    clip: { testid: camera-dialog, padding: 12 }
    annotate:
      - { key: name, testid: camera-dialog-name, legend: { zh-Hant: 顯示名稱, en: Display Name } }
  - { action: fill, testid: camera-dialog-name, text: { zh-Hant: 大門西側, en: Gate West } }
```

元件一律用 `data-testid` 指定，不用 CSS selector 或文字（換語言就失效）。

| action | 必填 | 說明 |
|---|---|---|
| `waitFor` | `testid` | 等元件出現；`state: detached` 是等它消失（例如骨架屏） |
| `click` / `dblclick` | `testid` | 點擊；找不到時錯誤訊息會列出畫面上相近的 testid |
| `fill` | `testid` `text` | 輸入文字；`text` 可以逐語言指定 |
| `hover` | `testid` | 滑鼠移上去（tooltip） |
| `scroll` | `testid` | 捲到元件可見 |
| `dismiss` | `testid` | 元件存在就點掉，不存在就跳過（清場用） |
| `wait` | | 固定等 500ms。盡量不要用，優先用 `waitFor` 等語意訊號 |
| `screenshot` | `name` | 截圖。`clip` 只拍某個元件（加 `padding`）；`annotate` 畫框標號，`legend` 會變成圖下方的說明表格 |

### 正文

正文是一般的 Markdown，用兩種標記引用 manifest：

- `{{screenshot:camera-add-01}}`：放截圖（自成一行）。manifest 裡的每一張都要出現剛好一次。
- `{{legend.name}}`：引用本章 annotate 的 legend，換語言時跟著換。

`<!-- protected:start -->` 與 `<!-- protected:end -->` 之間是人工維護的保護區：`validate` 會跟 git 的上一版（`--base`）比對，被改動就失敗。
要錄影片或做導覽的章節，正文要有兩個 H2：第一個底下是編號的操作步驟，第二個是「完成後」的說明，字幕從這裡產生。

## 自訂 driver

內建 Electron 與 Web 兩種啟動方式。其他情況（要先登入 SSO、要先用 docker compose 把後端跑起來……）就自己寫一個 driver，
實作四個方法：

```ts
// manual/driver.mjs（Node 22.18+ 也可以直接寫 .ts）
import { WebDriver } from 'auto-manual-gen'

/** @param {import('auto-manual-gen').DriverContext} ctx */
export default function createDriver(ctx) {
  const web = new WebDriver({ ...ctx, app: { mode: 'web', web: { url: 'http://localhost:8080' } } })
  return {
    async launch() {
      // 先把後端跑起來、登入……
      return web.launch()
    },
    setStorage: (kv) => web.setStorage(kv),
    resize: (w, h) => web.resize(w, h),
    close: () => web.close(),
  }
}
```

```yaml
app:
  mode: custom
  custom: { driver: ./manual/driver.mjs }
```

## 相依與環境

- **Playwright** 是 peer dependency，版本由你的專案決定；E2E 測試已經在用的話可以共用同一份瀏覽器。
- **Electron** 不打包：Electron driver 用的是 App 自己裝的那一份（從 `app.electron.projectDir` 解析）。
- **pandoc**（`build`）、**ffmpeg**（`video`）是外部工具，沒裝只影響用到它們的指令。
- **Word 轉 PDF**（`build --pdf`）與 **TTS 旁白**（`video --narrate`）只能在 Windows 上用；其他平台改用 `build --to html --pdf`。

`doctor` 會列出以上每一項的狀態。

## 設計約束

- **序列執行，不平行。** 截圖穩定性優先於速度 —— 這和 E2E 測試的取捨剛好相反。
- **每一章重新開機。** 每章都重新啟動 App、重跑 bootstrap，章節之間不共用執行期狀態，所以局部重跑站得住腳。打包（`app.electron.build`）只在第一章做一次。
- **清空的單位是一章。** 靠檔名前綴（章節 id）認出該刪哪些圖，不另外維護索引檔。
- **失敗要留下線索。** 整頁截圖 + DOM dump + step index + 畫面上相近的 testid，寫在 `output/failures/{locale}/{id}/`。這個目錄可能含有真實資料，不要提交或發布。

## 版本策略

公開介面包括：CLI 的指令與選項、`manual.yaml` 與 manifest 的 schema、`--json` 的格式、exit code 與 `error.code`。
任何一項有不相容的變更就升主版號，並寫進 [CHANGELOG](CHANGELOG.md)。schema 網址裡的 `v1` 跟著主版號走，舊的 manifest 不會突然全部變紅。

## 授權

MIT
