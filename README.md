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

兩個指令跑的是**同一份前端**。畫面右上角會顯示當前模式，這是 `AppDriver`
一套腳本服務兩種產品形態的基礎。

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
│  └─ demo-zhHant.yaml
├─ docs/                   # 正文（AI 生成 + 人工保護區），檔名與章節 id 對齊
│  ├─ 10-overview.md
│  └─ 20-setting.md
├─ fixtures/               # 固定假資料，讓畫面每次都長一樣
├─ config.example.json     # 環境設定範本（實際的 config.json 一人一份，不進版控）
├─ templates/              # reference.docx，排版樣式與內容分離
├─ runner/                 # 執行邏輯：drivers / actions / capture / overlay / video / probe / cli
├─ screenshots/            # 產線拍出來的圖（含標註）
├─ output/                 # 最終的 manual.docx / manual.pdf
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

🚧 骨架階段。只有 `apps/demo-stream-app` 可以跑，`runner/` 與其餘目錄尚未實作。

## 授權

MIT。DemoStreamApp 是**虛構的示範產品**，裡面的所有資料（攝影機名稱、RTSP 位址、授權金鑰）皆為捏造，
畫面上的「即時影像」是純 CSS 繪製的假畫面，不含任何真實影像或人臉。
