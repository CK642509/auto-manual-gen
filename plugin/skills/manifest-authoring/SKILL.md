---
name: manifest-authoring
description: 撰寫或修改 auto-manual-gen 的 manifest（manifest/*.yaml）、或處理 probe / validate / run 的錯誤時使用。說明工作迴圈、可用的動詞與錯誤碼的處理方式。
---

# 撰寫 manifest

manifest 是一章手冊的操作步驟：開哪個畫面、點哪裡、在哪裡截圖、框哪些元件。
CLI 照著它驅動 App，所以 manifest 寫錯，截圖就是錯的。

## 開始之前

1. 確認 CLI 版本：`auto-manual --version`。這份 skill 對應 **0.1.x**，對不上就先提醒使用者，不要硬寫。
2. 讀專案的上下文（缺任何一份就停下來，建議使用者先用 `manual:bootstrap-context` 建立）：
   - `TESTID.md`：有哪些 testid、各自是什麼（位置不固定，用 Glob 找 `**/TESTID.md`，排除 `node_modules`）
   - `agent/UI-MAP.md`：要先做什麼才看得到某個元件
   - `agent/QUIRKS.md`：元件什麼時候會變成什麼樣子（延遲出現、自動消失、條件渲染）
3. 讀 `agent/examples/` 或 `manifest/` 裡已經審過的章節，模仿它們的寫法。

## 工作迴圈

```
probe → 寫 manifest → validate → run --chapter → 看錯誤修正 → 回到 validate
```

- **不要憑印象寫 testid**。先 `auto-manual probe --json` 看畫面上真的有什麼；
  對話框、子設定這類條件渲染的元件，用 `--after click:<testid>,dblclick:<testid>` 先操作到那個畫面再探勘。
- 寫完先 `auto-manual validate --chapter <id> --json`，不開瀏覽器就能擋掉大部分錯誤。
- 再 `auto-manual run --chapter <id> --json`。一次只跑一章；多語言專案可以先用 `--locale` 跑主語言。
- 每個指令都加 `--json`，依照 exit code 與 `error.code` 決定下一步（見下方）。

## 檔案與命名

- 一章一個檔案：`manifest/{order}-{id}.yaml`。`order` 用 10 的倍數，中間留空間插章。
- 檔名的 order / id 必須跟內容的 `order` / `id` 一致。
- 截圖的 `name` 必須以章節 id 開頭：`<id>-01`、`<id>-02`……
- 開頭加上 schema，編輯器會即時檢查：
  `# yaml-language-server: $schema=https://ck642509.github.io/auto-manual-gen/schema/v1/manifest.json`
- 多語言專案裡，會跟著語言變的欄位（`title`、`legend`、`fill` 的 `text`）要寫成
  `{ zh-Hant: ..., en: ... }`，涵蓋 `manual.yaml` 的每一個 `locales`。缺翻譯會直接失敗。

## 動詞

元件一律用 `data-testid` 指定，不用 CSS selector 或文字（換語言就失效）。

| action | 必填 | 說明 |
|---|---|---|
| `waitFor` | `testid` | 等元件出現；`state: detached` 是等它消失（例如骨架屏） |
| `click` / `dblclick` | `testid` | 點擊 |
| `fill` | `testid` `text` | 輸入文字 |
| `hover` | `testid` | 滑鼠移上去（tooltip） |
| `scroll` | `testid` | 捲到元件可見 |
| `dismiss` | `testid` | 元件存在就點掉，不存在就跳過（清場用） |
| `wait` | | 固定等 500ms。**盡量不要用**，優先用 `waitFor` 等語意訊號 |
| `screenshot` | `name` | `clip: { testid, padding }` 只拍某個元件；`annotate` 畫框標號，每項是 `{ key, testid, legend }` |

完整欄位以 schema 為準：`node_modules/auto-manual-gen/schema/v1/manifest.json`。

manifest 刻意**沒有條件判斷、迴圈、變數**。覺得需要這些的時候，代表這件事該放進
`manual.yaml` 的 `bootstrap`（狀態注入、凍結時間）或自訂 driver，回報給人，不要繞過去。

## 寫法原則

- 一章開頭先等畫面穩定：骨架屏 `waitFor ... state: detached`，再 `waitFor` 主要內容。
- 會自動消失的元件（toast），觸發後**立刻** screenshot，中間不要插入任何等待。
- 不要把每次都會變的數值（FPS、時間戳、計數）放進 `annotate`。
- 狀態能用 `bootstrap.storage` 注入的（角色、版面），就不要在 steps 裡一步一步點出來。

## 錯誤處理

| exit code | 意思 | 你該做的事 |
|---|---|---|
| 0 | 成功 | 繼續 |
| 1 | 手冊內容有問題 | 改 manifest 或正文 |
| 2 | 用法或設定錯誤 | 檢查指令參數；`CONFIG_INVALID` 是 `manual.yaml` 的問題，回報給人 |
| 3 | 環境缺東西 | **不要改任何檔案**，把 `error.message` 轉告使用者 |

常見的 `error.code`：

- `SELECTOR_NOT_FOUND`：`error.candidates` 是畫面上相近的 testid。先對照 `TESTID.md` 與 `UI-MAP.md`
  判斷是 testid 改名、還是少了前置操作（對話框沒開、分頁沒切），**不要直接挑第一個候選**。
  失敗現場在 `error.failure`（整頁截圖與 DOM），需要時去讀。
- `ELEMENT_NOT_VISIBLE`：元件在 DOM 裡但看不到，通常是要先 `scroll`，或被另一層對話框蓋住。
- `STEP_FAILED`：看 `error.step` 是第幾步，讀失敗現場的截圖。
- `MANIFEST_INVALID`：schema 或命名不合，訊息會指出是哪個欄位。
- `DOCS_INVALID`：正文的引用或保護區有問題，見 `manual:doc-writing`。

同一個錯誤修了兩次還是失敗，就停下來，把錯誤與你的判斷回報給人。

## 不要做的事

- 不要修改 `node_modules/` 或 CLI 本身。CLI 的行為不對，回報給人。
- 不要刪除或改寫 `<!-- protected:start -->` 與 `<!-- protected:end -->` 之間的內容。
- 不要提交 `screenshots/`、`output/`（包括 `output/failures/`，裡面可能有真實資料）。
