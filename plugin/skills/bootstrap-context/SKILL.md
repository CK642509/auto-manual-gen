---
name: bootstrap-context
description: 手冊專案缺少 TESTID.md、agent/UI-MAP.md 或 agent/QUIRKS.md 時使用。說明怎麼用 probe 探勘畫面，替新專案起草這幾份產品上下文，交給人審。
---

# 替新專案建立上下文

寫 manifest 之前，agent 需要知道三件跟產品有關的事。這些是產品的知識，沒辦法事先寫好，
只能在使用者的專案裡**探勘之後起草、交給人審**：

| 檔案 | 回答什麼問題 | 放在哪 |
|---|---|---|
| `TESTID.md` | 這個 testid 是什麼元件 | 產品的原始碼旁邊（跟 testid 一起改） |
| `agent/UI-MAP.md` | 要先做什麼才看得到它 | 手冊專案（`manual.yaml` 那一層） |
| `agent/QUIRKS.md` | 它什麼時候會變成什麼樣子 | 手冊專案 |

範本在這個 skill 的資料夾裡：[UI-MAP.md](templates/UI-MAP.md)、[QUIRKS.md](templates/QUIRKS.md)。

## 步驟

1. 先確認哪幾份已經存在（用 Glob 找 `**/TESTID.md`，排除 `node_modules`），已經有的不要覆寫。
2. 探勘首頁：`auto-manual probe --json`。
3. 依照導覽元件（分頁、側欄、選單）逐一往下探勘：`auto-manual probe --after click:<testid> --json`。
   每次只往下一層，記下「從哪裡、做了什麼操作、才看到哪些 testid」。
4. 只在探勘不到、但原始碼裡有的 testid，才去讀原始碼找原因（條件渲染、權限、延遲載入）。
5. 起草：
   - `TESTID.md`：每個 testid 一列，寫它是什麼、在哪個畫面、有沒有前置條件。
   - `UI-MAP.md`：導覽樹、開對話框的路徑、「探勘不到」的對照表。
   - `QUIRKS.md`：**只寫你有證據的**（例如原始碼裡的 `setTimeout`、`v-if`、角色判斷）。
     證據不足的行為寫成「待確認」清單，不要猜。
6. 停下來，列出起草的檔案與「待確認」清單，請人補上產品知識並審過。

## 要問人的事

這些只有人知道，起草時列成問題，不要自己回答：

- 功能的正式名稱（跟畫面上的字不同時，以哪個為準）
- 哪些畫面要先登入、需要哪種角色
- 哪些資料是敏感的、截圖時要遮蔽
- 手冊的讀者是誰

## 缺 testid 的時候

探勘時發現想拍的元件沒有 `data-testid`，**不要直接改產品的程式碼**。列出缺了哪些、建議的命名，
請人決定。這是在改產品，一定要經過 review。

命名建議：`區域-元件功能` / `區域-元件功能_變體`，小寫、`-` 分詞；動態列用語意 key（`camera-row_gate-a`），不要用索引。
