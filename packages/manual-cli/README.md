# manual-cli

對外的指令入口。

| 指令 | 用途 | 誰在用 |
|---|---|---|
| `init` | 在別人的專案裡產生最小可跑的骨架 | 人 |
| `probe` | 列出當前畫面可見且具 testid 的元件 | **agent** |
| `run --chapter <id>` | 執行（可局部重跑） | 人 + agent |
| `validate` | schema + selector 存在性 + 編號一致性 | 人 + agent + CI |
| `build` | 合併正文與截圖，pandoc 產 docx / pdf | 人 + CI |

## 對 AI 友善的介面設計

輸出要**結構化**，錯誤訊息要說「**你可以怎麼修**」。
這三個指令合起來就是 agent 的自我驗證迴圈 —— 沒有這個迴圈，AI 寫的 selector 只是猜測。
