# data-testid 命名規範

這份文件同時是**給人看的規範**與**餵給 AI agent 的上下文**。
agent 依這份規範產生 manifest 的 selector；人依這份規範在新元件上補標記。

## 命名格式

```
區域-元件功能
區域-元件功能_變體
```

- 一律小寫，單字之間用 `-`。
- 需要區分同類多個實例時，用 `_` 接語意 key（不要用陣列索引）。

## 現有標記

### 全域

| testid | 說明 |
|---|---|
| `app-root` | 根容器，判斷 App 已掛載完成 |
| `topbar` | 頂列 |
| `topbar-title` | 產品名稱 |
| `topbar-runtime` | 顯示 Web / Electron 模式 |
| `topbar-locale` | 語言切換 |
| `overview-page` | 總覽頁容器 |

### 統計卡

| testid | 說明 |
|---|---|
| `overview-stats` | 統計卡片區 |
| `stat-streams` | 線上串流數 |
| `stat-alert` | 待處理告警數 |
| `stat-fps` | 推論 FPS 卡片 |
| `stat-fps-value` | **數值會浮動**，比對時要遮掉 |

### 即時畫面（產線最難拍的區塊）

| testid | 說明 |
|---|---|
| `live-panel` | 面板容器 |
| `live-title` / `live-model` | 標題與模型名稱 |
| `live-view` | 畫面本體 |
| `live-det_a` / `live-det_b` | 偵測框，**有 CSS 動畫持續飄移** |
| `live-timestamp` | **每秒跳動** |
| `live-detections` | **每 1.2 秒重算** |

### 授權區

| testid | 說明 |
|---|---|
| `license-block` | **僅 admin 可見**，需要注入 `role=admin` 才會渲染 |
| `license-input` | **機敏欄位，截圖前必須 redact** |

### 串流來源

| testid | 說明 |
|---|---|
| `stream-panel` / `stream-panel-title` | 面板與標題 |
| `stream-add` | 新增串流按鈕 |
| `stream-table` | 表格 |
| `stream-row_{id}` | 每一列，`{id}` 是串流 id 不是索引 |

### 對話框

| testid | 說明 |
|---|---|
| `dialog-backdrop` | 遮罩層 |
| `add-stream-dialog` / `add-stream-dialog-title` | 對話框與標題 |
| `add-stream-name` / `add-stream-source` | 輸入欄 |
| `add-stream-cancel` / `add-stream-confirm` | 動作按鈕 |

## 規則

1. **使用者需要動的東西一定要有 testid**；純裝飾元素不要加。
2. **動態產生的列用語意 key**（`stream-row_s-01`），不要用 `stream-row_0` —— 排序一改索引就錯位。
3. **條件渲染的元件要在文件裡註明前置條件**（例如 `license-block` 需要 `role=admin`），否則 agent 會以為它不存在。
4. 若改用 UI 框架的包裝元件，**必須確認 attribute 有傳到真正的 DOM 節點上**，這是「明明加了卻抓不到」的頭號原因。
5. **testid 改名要進 code review 檢查清單** —— 它是手冊產線與 E2E 測試的共同契約。

## 這個 App 刻意埋的四個坑

| 坑 | 在哪 | 產線要怎麼解 |
|---|---|---|
| **持續播放的即時畫面** | `live-view` 的偵測框有 CSS 動畫 | 停用動畫 / 用 fixture 圖替換（Day 07、Day 08） |
| **每秒跳動的時間戳** | `live-timestamp` | 凍結時間（Day 07） |
| **浮動的數值** | `stat-fps-value`、`live-detections` | 攔截 API 或遮掉該區域（Day 07、Day 22） |
| **條件渲染的機敏欄位** | `license-block` / `license-input` | 注入 `role=admin` 後 redact（Day 07、Day 12） |

`style.css` 留了一個 `.no-motion` class 當 hook，掛到 `<html>` 上就會停掉所有動畫與轉場。
