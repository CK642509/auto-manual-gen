# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 語言

repo 內所有文件、註解、commit message 一律用**繁體中文（台灣用語）**。新增檔案時沿用這個慣例。

## 常用指令

Node 20+。npm workspaces monorepo，一律在 repo 根目錄執行：

```bash
npm install

npm run demo            # Web 模式，vite dev server，http://localhost:5173（strictPort）
npm run demo:electron   # Electron 模式（先 vite build 再 electron .）
npm run demo:build      # 只 build，產物在 apps/demo-stream-app/dist/

npm run manual                                 # 跑整本 manifest，產出 screenshots/
npm run manual -- --chapter <id> --mode web    # 局部重跑；--mode 蓋過 config 的 app.mode

npm run typecheck       # tsc --noEmit，涵蓋 runner/ 與 tools/
npm run driver:smoke               # driver 煙霧測試，走 config 的 app.mode
npm run driver:smoke -- --mode web # 指定形態（web 模式要先開著 npm run demo）
```

Electron main process 讀 `VITE_DEV_SERVER_URL` 環境變數：有值就載 dev server，沒有就載 `dist/index.html`。**產線（Playwright）一律走後者** —— 手冊要拍的是打包後的樣子，所以驅動 Electron 前必須先 build。

尚未建立 lint / test / CI。`.github/workflows/` 是空的（規劃中：`manual.yml`）；`runner/` 目前有 `drivers/`、`config.ts` 與 `run.ts`（動詞集還擠在 `run.ts` 裡，之後要拆進 `actions/` / `capture/` / `overlay/`），`manifest/` 有一本五章的示範手冊，`agent/` 有 UI-MAP / QUIRKS / STYLE 與 few-shot 範例，`docs/` 有兩章正文範例，`plugin/` 還只有 `.gitkeep`。

產物一律不進版控：`screenshots/`（手冊要用的圖，扁平放置、檔名前綴就是章節 id）與 `output/`（最終文件，`failures/{id}/` 放失敗現場）都在 `.gitignore` 裡。

runner 的程式碼是 ESM TypeScript，用 `tsx` 直接跑，不編譯（根目錄 `package.json` 的 `"type": "module"` 是為此而設）。

## 這個 repo 是什麼

用 Playwright + AI Agent 打造的使用手冊產線：驅動 App → 截圖 → 畫框標號 → 遮蔽機敏資訊 → 合併正文 → 產出 Word/PDF。

**現況是骨架階段。** `apps/demo-stream-app` 可以跑，`runner/drivers/` 的 `AppDriver`（Electron / Web 兩個實作）已經接上 Playwright，其餘目錄尚未實作 —— 新增檔案前先確認它屬於下面「架構的三個主軸」的哪一塊。

**repo 根目錄本身就是一本手冊專案**（`manifest/` + `docs/` + `fixtures/` + `templates/` + `config.json`），不是一個 monorepo；`apps/demo-stream-app` 是被拍的靶，實務上應該是另一個 repo，放在這裡只是為了方便展示。

## 架構的三個主軸

### 1. AI 的邊界（改動前先確認落在哪一側）

執行期的啟動、操作、截圖、標註、遮蔽、排版**全部是決定性腳本，不含 AI**。AI 只負責產生之後由機器重複執行的東西：寫 manifest、寫正文、判讀差異。

判準：*AI 的輸出會不會被凍結成可審查的產物，或被決定性機制驗證？* 不會的話就不該讓 AI 做。

具體對應：
- `runner/` —— 純執行者，讀 manifest 驅動 App，**不做任何判斷**。`cli.ts` 的 `probe` / `run` / `validate` 三個指令合起來就是 agent 的自我驗證迴圈
- `manifest/schema.json` —— manifest 刻意**不提供條件判斷、迴圈、變數**。一旦圖靈完備就無法 review，而「產出可被人審查」是選宣告式的全部理由。表達不了的操作走逃生門 `action: custom` 指向一支小 `.ts`，逃生門的使用數量要進 lint 報告
- `agent/` —— 給 AI 的上下文（UI-MAP / STYLE / QUIRKS / few-shot），以及 `diff-pairs/` 這組已知答案的圖對

### 2. 對 agent 友善的介面

CLI 與 runner 的輸出要**結構化**，錯誤訊息要說「你可以怎麼修」。不能只說「找不到元素」，要說「找不到 X，可用的有 A / B / C」。失敗時要留下線索：整頁截圖 + DOM dump + step index + 該畫面可用的 testid 清單。

`probe` 指令（印出當前畫面所有可見且具 testid 的元件 + 文字 + boundingBox）是餵給 agent 的關鍵素材。

### 3. 靠命名約定串接，不用索引檔

```
manifest 的章節 id  ↔  docs/{order}-{id}.md  ↔  screenshots/{id}-NN.png
```

`order` 用 10 的倍數編號，中間留空間插入章節。

## DemoStreamApp（`apps/demo-stream-app/`）

一份前端（Vue 3 + Vite）同時以 Web 與 Electron 兩種形態執行，是整條產線的靶，也是 `AppDriver` 一套腳本服務兩種產品形態的基礎。

- **執行環境由 preload 注入**，不靠 userAgent 偵測。`src/main/preload.cjs` 掛 `window.demoStreamApp`；Web 模式下該物件不存在，前端據此判斷。
- **`vite.config.ts` 的 `base: './'` 不能拿掉** —— Electron 用 `file://` 載入，改成絕對路徑後 Web 跑得起來但 Electron 會白畫面。
- **`useContentSize: true`** 讓 1600×900 指的是內容區而非含邊框的視窗，截圖尺寸才能跨平台一致。

### 畫面結構

兩個分頁，用 `v-if` 切換 —— **沒被選中的那一頁完全不在 DOM 裡**（刻意的，示範條件渲染的坑）。

- **即時監控**：左欄是統計卡 + 可捲動的攝影機清單，右欄是版面工具列與格子區。工具列有版面切換（1×1 / 2×2 / 3×3 / 4×4）、**已存版面設定的下拉選單**（`grid-preset-select`，選了就套回該版面）、儲存版面、清空版面。
- **系統設定**：告警、影像分析（動作偵測 / 人臉辨識）、系統，以及僅 `role=admin` 可見的「授權與裝置」。

主要操作流程：**雙擊左欄的攝影機 → 依序填入右側第一個空格；按格子右上角的 ✕ → 只清掉那一格**，被清掉的格子成為下一個空格，其他格不受影響。刻意不用拖曳 —— `dblclick` 可以直接進 manifest 的 action 動詞集，不必動用 `action: custom` 逃生門。

檔案分工：`App.vue` 只負責殼（topbar、分頁、toast），畫面在 `src/renderer/components/`，狀態在 `src/renderer/composables/`（`useCameras` / `useLayout` / `useSettings` / `useToast` / `useLiveTelemetry`，都是 module-level singleton），假資料在 `src/renderer/data/cameras.ts`。

### 刻意埋的八個坑

這個靶是設計來「很難拍」的，改動時不要「順手修好」這些行為 —— 它們是產線技術的示範對象：

| 坑 | 在哪 | 產線怎麼解 |
|---|---|---|
| 偵測框有 CSS 動畫持續飄移 | `grid-cell-det_{n}a` / `_{n}b` | 停用動畫 / fixture 圖替換 |
| 時間戳每秒跳動 | `grid-cell-timestamp_{n}` | 凍結時間 |
| 推論數值每 1.2 秒重算 | `stat-fps-value`、`grid-cell-detections_{n}`、`grid-cell-fps_{n}` | 攔截 API 或遮掉該區域 |
| 機敏欄位條件渲染 | `settings-section_license` 整塊（僅 `role=admin` 可見） | 注入 role 後 redact |
| Toast 3 秒後自動消失 | `toast`（`useToast.ts` 的 `TOAST_DURATION`） | 等語意訊號後立刻按快門，不要插入固定延遲 |
| 清單非同步載入骨架屏 | `camera-list-skeleton` | 等骨架屏消失、`camera-list` 出現 |
| 巢狀對話框 | `confirm-dialog` 疊在 `camera-dialog` 之上 | 決定拍哪一層；離開章節時兩層都要關 |
| 清單長到需要捲動 | `camera-list`（15 台） | 捲動後 `boundingBox` 必須重取；長清單只拍前幾列 |

`style.css` 有 `.no-motion` class 當 hook，掛到 `<html>` 就會停掉所有動畫與轉場。

### 狀態注入

五個 key 都刻意讀 `localStorage`（而非瀏覽器語言 / 後端），讓產線能用 `addInitScript` 在第一個 navigation 之前注入，重跑同一份 manifest 產出不同語言、不同權限、不同版面的手冊：

```js
localStorage.setItem('locale', 'en')    // 'zh-Hant' | 'en'
localStorage.setItem('role', 'admin')   // 預設 'operator'
localStorage.setItem('layout', '{"mode":"3x3","cells":["gate-a","lobby-01",null]}')
localStorage.setItem('presets', '[{"id":"p1","name":"大廳巡檢","mode":"2x2","cells":[]}]')
localStorage.setItem('settings', '{"face":{"enabled":true,"threshold":75}}')
```

注入 `layout` 特別有用 —— 直接跳到「已經配置好的 3×3 版面」截圖，不必每一章都從空版面開始重新雙擊九次。完整格式見 `TESTID.md`。

`locales/*.json` 同時是手冊的**術語表來源** —— 手冊裡的按鈕名稱直接取自這裡，才能保證等於畫面上真正顯示的字。

### 網路攔截

清單啟動時打 `./api/cameras`，**這支請求在一般執行下一定會失敗**（Vite dev server 沒這個路由、Electron 走 `file://`），失敗就退回 `data/cameras.ts` 的內建假資料，所以離線也跑得起來。它存在的意義是給產線一個 `page.route()` 攔截點 —— 攔截之後手冊每次拍到的清單內容完全固定。**不要把它改成「有就打、沒有就不打」**，那樣攔截點就消失了。

### data-testid

`apps/demo-stream-app/TESTID.md` 是完整規範與現有標記清單，它同時是**給人看的規範**與**餵給 agent 的上下文**，改 testid 就要同步改它。重點：

- 格式 `區域-元件功能` / `區域-元件功能_變體`，小寫、`-` 分詞。
- 動態列用語意 key（`camera-row_gate-a`），**不要用索引**（`camera-row_0`）—— 排序一改就錯位。例外是**固定的畫面位置**（`grid-cell_1`），那是位置語意不是資料索引。
- 條件渲染的元件**必須在 TESTID.md 註明前置條件**，否則 agent 會以為它不存在。這個 App 的條件渲染特別多，一律用 `v-if` 而不是 `v-show`。
- 包裝元件（如 `ToggleSwitch.vue`）用**明確的 `testid` prop** 綁到真正的 DOM 節點，不依賴 Vue 的 attribute fallthrough —— 這是「明明加了卻抓不到」的頭號原因。
- testid 是手冊產線與 E2E 測試的共同契約，改名要進 code review 檢查清單。

## 其他慣例

- **`.gitattributes` 強制 LF**（開發在 Windows、CI 跑 Linux 容器），圖片 / 影片 / docx / pdf 一律 binary。
- 產物不進版控：`output/*`、`config.json`（一人一份，只有 `config.example.json` 進版控）、`*.webm`、`*.mp4`（錄影走 release assets）。
- Commit 用 `feat:` / `fix:` 前綴 + 中文標題，body 用條列說明改了什麼與為什麼。
- `agent/` 這個目錄本身會過期，要跟著 code 一起改 —— 它在 code review 檢查清單上。
