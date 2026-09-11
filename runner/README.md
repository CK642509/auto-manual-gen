# runner

產線的核心：讀 manifest，驅動 App，產出截圖與標註過的圖。**純執行者，不做任何判斷。**

| 目錄 | 職責 |
|---|---|
| `drivers/` | 啟動待測物。`electron.ts` / `web.ts` 兩個實作，共用 `AppDriver` 介面（**已實作**） |
| `actions/` | manifest 的動詞集：`click` / `dblclick` / `fill` / `waitFor` / `screenshot` / `setStorage` / `scroll` / `hover` / `dismiss` |
| `capture/` | 截圖構圖與裁切：整頁 / 元素 / `clip` 區域，以及印刷解析度的推算 |
| `overlay/` | **注入 DOM 疊層**。畫框、編號圓標與碰撞避讓、遮蔽、假游標 —— 四件事共用同一套渲染 |
| `video/` | 錄影與字幕：`recordVideo`、`slowMo`、從 step 時間軸產 `.srt` |
| `probe.ts` | 探勘：印出當前畫面所有可見且具 testid 的元件 + 文字 + boundingBox。**餵給 agent 的關鍵素材** |
| `cli.ts` | 指令入口，見下表 |

## 指令

| 指令 | 用途 | 誰在用 |
|---|---|---|
| `auto-manual init` | 在別人的專案裡產生最小可跑的骨架 | 人 |
| `auto-manual probe` | 列出當前畫面可見且具 testid 的元件 | **agent** |
| `auto-manual run --chapter <id>` | 執行（可局部重跑） | 人 + agent |
| `auto-manual validate` | schema + selector 存在性 + 編號一致性 | 人 + agent + CI |
| `auto-manual build` | 合併正文與截圖，pandoc 產 docx / pdf | 人 + CI |

## `AppDriver`

`drivers/types.ts` 定義四個方法：`launch` / `setStorage` / `resize` / `close`。
上層只認得這個介面，底下是 Electron 還是 Web 不需要關心；`createDriver(config)` 依 `app.mode` 挑實作。

`setStorage` 的**呼叫時機會改變它的行為**：

- **launch 之前**：排隊，啟動時用 `addInitScript` 在第一次 navigation 之前注入。App 讀 localStorage 時值已經在了，不會先閃一次預設狀態 —— 這是首選路徑。
- **launch 之後**：註冊 init script 再 reload。Electron 只有這條路（`firstWindow()` 拿到手時已經 navigate 過了）。

煙霧測試：`npm run driver:smoke -- --mode electron|web`，產物在 `output/smoke-<mode>.png`。

## 設計約束

- **序列執行，不平行。** 截圖穩定性優先於速度 —— 這和 E2E 測試的取捨剛好相反。
- **失敗要留下線索**：整頁截圖 + DOM dump + step index + 該畫面可用的 testid 清單。
- **錯誤訊息是給 agent 看的**：不能只說「找不到元素」，要說「找不到 X，可用的有 A / B / C」。
  `probe` / `run` / `validate` 三個指令合起來就是 agent 的自我驗證迴圈 —— 沒有這個迴圈，AI 寫的 selector 只是猜測。
