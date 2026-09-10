# manual-runner

產線的核心：讀 manifest，驅動 App，產出截圖與標註過的圖。**純執行者，不做任何判斷。**

| 目錄 | 職責 |
|---|---|
| `drivers/` | 啟動待測物。`electron.ts` / `web.ts` 兩個實作，共用 `AppDriver` 介面 |
| `actions/` | manifest 的動詞集：`click` / `fill` / `waitFor` / `screenshot` / `setStorage` / `scroll` / `hover` / `dismiss` |
| `capture/` | 截圖構圖與裁切：整頁 / 元素 / `clip` 區域，以及印刷解析度的推算 |
| `overlay/` | **注入 DOM 疊層**。畫框、編號圓標與碰撞避讓、遮蔽、假游標 —— 四件事共用同一套渲染 |
| `video/` | 錄影與字幕：`recordVideo`、`slowMo`、從 step 時間軸產 `.srt` |
| `probe.ts` | 探勘指令：印出當前畫面所有可見且具 testid 的元件 + 文字 + boundingBox。**餵給 agent 的關鍵素材** |

## 設計約束

- **序列執行，不平行。** 截圖穩定性優先於速度 —— 這和 E2E 測試的取捨剛好相反。
- **失敗要留下線索**：整頁截圖 + DOM dump + step index + 該畫面可用的 testid 清單。
- **錯誤訊息是給 agent 看的**：不能只說「找不到元素」，要說「找不到 X，可用的有 A / B / C」。
