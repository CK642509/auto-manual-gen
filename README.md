# manual-gen

> 改完 UI，跑一個指令，使用手冊就更新完畢。

用 **Playwright + AI Agent** 打造的使用手冊產線：驅動 App → 截圖 → 畫框標號 → 遮蔽機敏資訊 → 合併正文 → 產出 Word / PDF。

這是 iThome 鐵人賽 30 天系列的配套 repo。系列文章講**建置過程與設計理由**，這裡放**可以直接讀、直接跑的完成品**。
每天對應哪些檔案，見 [`docs/day-index.md`](docs/day-index.md)。

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

兩個指令跑的是**同一份前端**。畫面右上角會顯示當前模式，這是 `AppDriver` 一套腳本
服務兩種產品形態的基礎（見系列 Day 05）。

### 這個靶刻意很難拍

DemoStreamApp 是一個 AI 影像串流監控台。它把截圖產線會遇到的麻煩全部塞在同一頁：

| 元素 | 麻煩在哪 | 產線怎麼解 |
|---|---|---|
| 即時畫面的偵測框 | CSS 動畫持續飄移 | 停用動畫 / fixture 圖替換（Day 07、08） |
| 畫面上的時間戳 | 每秒跳動 | 凍結時間（Day 07） |
| 推論 FPS、偵測數 | 每 1.2 秒重算 | 攔截 API 或遮掉該區域（Day 07、22） |
| 授權金鑰欄位 | 條件渲染 + 機敏資訊 | 注入權限後 redact（Day 07、12） |

在瀏覽器 console 執行，然後 reload，可以親眼看到後兩個：

```js
localStorage.setItem('locale', 'en')    // 換語言 → 整頁文案改變，text selector 全失效
localStorage.setItem('role', 'admin')   // 提權   → 授權金鑰欄位才會出現
localStorage.clear()                    // 復原
```

產線就是靠 `addInitScript` 在第一個 navigation 之前注入這些值，
重跑同一份 manifest 產出不同語言、不同權限的手冊（見系列 Day 07、Day 24）。

## 目錄結構

```
manual-gen/
├─ apps/demo-stream-app/   # 靶：AI 影像串流監控台，Electron + Vue 3，同一份也能純 Web 跑
│  └─ TESTID.md            #   命名規範 —— 同時給人看與給 agent 看
├─ packages/
│  ├─ manual-schema/       # manifest 的 JSON Schema，獨立套件
│  ├─ manual-runner/       # 核心：drivers / actions / capture / overlay / video / probe
│  └─ manual-cli/          # init / probe / run / validate / build
├─ example/                # 一本完整的手冊，讀者的起點
├─ agent/                  # 給 AI agent 的上下文（UI-MAP / STYLE / QUIRKS / few-shot）
├─ fixtures/diff-pairs/    # 已知答案的圖對，檢驗 AI 差異判讀
├─ plugin/                 # Claude Code plugin
└─ docs/day-index.md       # 每天 ↔ 檔案路徑對照
```

三個目錄是這個 repo 真正的差異化資產：**`agent/`**（給 AI 的上下文）、
**`example/`**（一本完整的手冊）、**`fixtures/diff-pairs/`**（可驗證的判讀樣本）。
工具本身反而是最容易被取代的部分。

## 現況

🚧 骨架階段。`apps/demo-stream-app` 可以跑，其餘目錄隨系列進度填入。

## 授權

MIT。DemoStreamApp 是**虛構的示範產品**，裡面的所有資料（串流名稱、RTSP 位址、授權金鑰）皆為捏造，
畫面上的「即時影像」是純 CSS 繪製的假畫面，不含任何真實影像。
