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

## 畫面結構

App 有兩個分頁，**分頁用 `v-if` 切換 —— 沒被選中的那一頁完全不在 DOM 裡**。

```
topbar（產品名、分頁、角色、執行環境、語言）
├── nav-tab_monitor  即時監控
│   ├── 左欄：統計卡 + 攝影機清單（可捲動）
│   └── 右欄：版面工具列 + 1×1 / 2×2 / 3×3 / 4×4 格子
└── nav-tab_settings 系統設定
    ├── 告警 / 影像分析 / 系統
    └── 授權與裝置（僅 role=admin）
```

**主要操作流程：雙擊左欄的攝影機 → 依序填入右側第一個空格；
按格子右上角的 ✕ → 只清掉那一格，其他格不動，被清掉的格子成為下一個空格。**

## 現有標記

### 全域

| testid | 說明 |
|---|---|
| `app-root` | 根容器，判斷 App 已掛載完成 |
| `topbar` | 頂列 |
| `topbar-title` | 產品名稱 |
| `topbar-role` | 目前角色（操作員 / 管理員） |
| `topbar-runtime` | 顯示 Web / Electron 模式 |
| `topbar-locale` | 語言切換按鈕 |
| `nav-tabs` | 分頁列 |
| `nav-tab_monitor` / `nav-tab_settings` | 兩個分頁 |
| `toast-host` | Toast 容器，永遠存在 |
| `toast` / `toast-message` | 單則 Toast，**3 秒後自動消失**，同時最多三則 |

### 即時監控頁（前置條件：`nav-tab_monitor` 已選中）

#### 統計卡

| testid | 說明 |
|---|---|
| `monitor-page` | 分頁容器 |
| `overview-stats` | 統計卡片區 |
| `stat-cameras` / `stat-cameras-value` | 線上攝影機數，隨清單載入從 0 變成實際值 |
| `stat-alert` / `stat-alert-value` | 待處理告警數，固定值 |
| `stat-fps` / `stat-fps-value` | **數值每 1.2 秒重算**，比對時要遮掉 |

#### 攝影機清單

| testid | 說明 |
|---|---|
| `camera-panel` / `camera-panel-title` | 面板與標題 |
| `camera-add` | 新增攝影機按鈕 |
| `camera-search` | 搜尋框，過濾名稱與位置 |
| `camera-hint` | 操作提示文字 |
| `camera-list-skeleton` | **載入中骨架屏，載入完成後從 DOM 消失** |
| `camera-list-empty` | 搜尋無結果時才存在 |
| `camera-list` | 清單本體，**內容超過面板高度，需要捲動** |
| `camera-count` | 底部的「共 N 台」 |
| `camera-row_{id}` | 每一列，`{id}` 是語意 key（`gate-a`）不是索引 |
| `camera-state_{id}` | 狀態指示點（running / stopped / offline） |
| `camera-name_{id}` / `camera-zone_{id}` | 名稱與安裝位置 |
| `camera-edit_{id}` | 齒輪按鈕，開啟該台的設定對話框 |

現有的 `{id}`：`gate-a`、`gate-b`、`lobby-01`、`lobby-02`、`dock-03`、`parking-b1`、
`parking-b2`、`corridor-2f`、`corridor-3f`、`office-201`、`office-202`、`server-room`、
`rooftop`、`fence-east`、`fence-west`。

#### 版面工具列與格子

| testid | 說明 |
|---|---|
| `grid-panel` / `grid-toolbar` | 面板與工具列 |
| `grid-layout-group` | 版面切換按鈕群組 |
| `grid-layout_1x1` / `_2x2` / `_3x3` / `_4x4` | 版面切換 |
| `grid-preset-select` | 已存版面設定的下拉選單，**沒存過任何版面時只有一個 disabled 選項** |
| `grid-preset-save` | 開啟「儲存目前版面」對話框 |
| `grid-clear-all` | 清空所有格子 |
| `grid-view` | 格子容器，`data-layout` 屬性同步目前版面（`2x2`…） |
| `grid-cell_{n}` | 單一格子，`{n}` 是 **1-based 的畫面位置**，見下方說明 |
| `grid-cell-empty_{n}` | 空格佔位，**該格有攝影機時不存在** |
| `grid-cell-view_{n}` | 畫面本體，**該格為空時不存在** |
| `grid-cell-det_{n}a` / `grid-cell-det_{n}b` | 偵測框，**有 CSS 動畫持續飄移** |
| `grid-cell-offline_{n}` | 「已停用 / 訊號中斷」遮罩，僅非 running 狀態存在 |
| `grid-cell-name_{n}` | 格內底部的攝影機名稱 |
| `grid-cell-timestamp_{n}` | **每秒跳動** |
| `grid-cell-detections_{n}` / `grid-cell-fps_{n}` | **每 1.2 秒重算**，且 3×3 起會被精簡掉（見下方） |
| `grid-cell-remove_{n}` | 格子右上角的 ✕ |

**為什麼格號可以用數字，這不算違反「不要用索引」？**
`{n}` 指的是**畫面上的固定位置**（左上角永遠是 1），不是清單的陣列索引。
位置不會因為排序、篩選而改變，所以它是穩定的語意；被禁止的是
`camera-row_0` 那種「第幾筆資料」的索引。

**3×3 起會少幾個 testid。** 格子寬度不夠時，`grid-cell-detections_{n}`、
`grid-cell-fps_{n}` 與偵測框上的文字標籤會被移除（不是隱藏），
避免底部資訊列擠成一團 —— agent 在 4×4 版面下找不到它們是正常的。

### 對話框

| testid | 說明 |
|---|---|
| `dialog-backdrop` | 第一層遮罩（攝影機設定 / 儲存版面共用） |
| `camera-dialog` / `camera-dialog-title` | 攝影機對話框，新增與編輯共用，標題文字不同 |
| `camera-dialog-name` | 顯示名稱 |
| `camera-dialog-zone` | 安裝位置（下拉） |
| `camera-dialog-source` | RTSP 位址，**會洩漏內網結構，截圖前要遮蔽** |
| `camera-dialog-username` | 帳號，**機敏** |
| `camera-dialog-password` | 密碼欄（`type=password`） |
| `camera-dialog-enabled` | 啟用推論開關 |
| `camera-dialog-delete` | 刪除按鈕，**僅編輯模式存在**（新增模式下不在 DOM 裡） |
| `camera-dialog-cancel` / `camera-dialog-confirm` | 動作按鈕，確認鍵在名稱為空時 disabled |
| `confirm-backdrop` | **第二層**遮罩，疊在攝影機對話框之上 |
| `confirm-dialog` / `confirm-dialog-title` / `confirm-dialog-message` | 刪除確認框 |
| `confirm-dialog-cancel` / `confirm-dialog-confirm` | 動作按鈕 |
| `preset-dialog` / `preset-dialog-title` | 儲存版面對話框 |
| `preset-dialog-summary` | 「目前版面：2×2，已配置 3 格」 |
| `preset-dialog-name` | 版面名稱輸入 |
| `preset-dialog-cancel` / `preset-dialog-confirm` | 動作按鈕 |

### 系統設定頁（前置條件：`nav-tab_settings` 已選中）

| testid | 說明 |
|---|---|
| `settings-page` | 分頁容器 |
| `settings-section_alert` / `settings-alert-title` | 告警區塊 |
| `settings-alert-enabled` | 告警總開關 |
| `settings-alert-sub` | 告警子設定，**總開關關閉時整塊不存在** |
| `settings-alert-sound` | 告警音效開關（前置條件：告警已開啟） |
| `settings-alert-retention` | 保留天數（前置條件：告警已開啟） |
| `settings-section_analysis` / `settings-analysis-title` | 影像分析區塊 |
| `settings-motion-enabled` | 動作偵測開關 |
| `settings-motion-sub` / `settings-motion-sensitivity` | 靈敏度（前置條件：動作偵測已開啟） |
| `settings-face-enabled` | 人臉辨識開關，**預設是關的** |
| `settings-face-sub` / `settings-face-threshold` / `settings-face-threshold-value` | 相似度門檻（前置條件：人臉辨識已開啟） |
| `settings-section_system` / `settings-system-title` | 系統區塊 |
| `settings-locale` | 語言下拉，與 `topbar-locale` 同步 |
| `settings-role` | 唯讀的角色標籤 |
| `settings-actions` / `settings-reset` / `settings-save` | 底部動作列 |

#### 授權與裝置（前置條件：`nav-tab_settings` 已選中 **且** `role=admin`）

| testid | 說明 |
|---|---|
| `settings-section_license` | 整個區塊，**僅 admin 可見** |
| `settings-license-title` / `settings-license-badge` | 標題與「僅管理員可見」標籤 |
| `license-block` | 欄位容器 |
| `license-input` | **授權金鑰，機敏 → 建議用色塊（預設模式）** |
| `license-server-ip` | **授權伺服器位址，機敏 → 建議用 blur** |
| `license-serial` | **裝置序號，機敏 → 建議用 replace 換成格式正確的假資料** |

## 規則

1. **使用者需要動的東西一定要有 testid**；純裝飾元素不要加。
2. **動態產生的列用語意 key**（`camera-row_gate-a`），不要用 `camera-row_0` —— 排序一改索引就錯位。
   例外是**固定的畫面位置**（`grid-cell_1`），那是位置語意不是資料索引。
3. **條件渲染的元件要在文件裡註明前置條件**，否則 agent 會以為它不存在。
   這個 App 的條件渲染特別多（分頁、對話框、設定子項、授權區塊、格子的空／滿兩種狀態），
   一律用 `v-if` 而不是 `v-show`，元件不存在就是真的不在 DOM 裡。
4. **包裝元件必須確認 attribute 有傳到真正的 DOM 節點上**，這是「明明加了卻抓不到」的頭號原因。
   本專案的 `ToggleSwitch.vue` 用**明確的 `testid` prop** 綁到 `<button>` 上，
   而不是依賴 Vue 的 attribute fallthrough —— 新增包裝元件時沿用這個做法。
5. **testid 改名要進 code review 檢查清單** —— 它是手冊產線與 E2E 測試的共同契約。

## 這個 App 刻意埋的坑

| 坑 | 在哪 | 產線要怎麼解 |
|---|---|---|
| **持續播放的即時畫面** | `grid-cell-det_{n}a` / `_{n}b` 有 CSS 動畫 | 停用動畫 / 用 fixture 圖替換 |
| **每秒跳動的時間戳** | `grid-cell-timestamp_{n}` | 凍結時間 |
| **浮動的數值** | `stat-fps-value`、`grid-cell-detections_{n}`、`grid-cell-fps_{n}` | 攔截 API 或遮掉該區域 |
| **條件渲染的機敏欄位** | `settings-section_license` 整塊 | 注入 `role=admin` 後 redact |
| **Toast 3 秒後自動消失** | `toast` | 等語意訊號後立刻按快門，不要插入固定延遲 |
| **清單非同步載入** | `camera-list-skeleton` 存在期間 | 等骨架屏消失、`camera-list` 出現 |
| **巢狀對話框** | `confirm-dialog` 疊在 `camera-dialog` 之上 | 決定拍哪一層；離開章節時兩層都要關 |
| **清單長到需要捲動** | `camera-list` 共 15 台 | 捲動後 `boundingBox` 必須重取；長清單只拍前幾列 |

`style.css` 留了一個 `.no-motion` class 當 hook，掛到 `<html>` 上就會停掉所有動畫與轉場
（偵測框飄移、錄影燈閃爍、骨架屏微光、開關滑動、Toast 淡入）。

## 狀態注入

五個 key 都讀 `localStorage`，產線用 `addInitScript` 在第一個 navigation 之前注入：

```js
localStorage.setItem('locale', 'en')          // 'zh-Hant' | 'en'
localStorage.setItem('role', 'admin')         // 預設 'operator'
localStorage.setItem('layout', JSON.stringify({
  mode: '2x2',                                // '1x1' | '2x2' | '3x3' | '4x4'
  cells: ['gate-a', 'lobby-01', 'parking-b1', null],
}))
localStorage.setItem('presets', JSON.stringify([
  { id: 'preset-lobby', name: '大廳巡檢', mode: '2x2', cells: ['lobby-01', 'lobby-02', null, null] },
]))
localStorage.setItem('settings', JSON.stringify({
  alert: { enabled: true, sound: true, retention: 30 },
  motion: { enabled: true, sensitivity: 'medium' },
  face: { enabled: false, threshold: 75 },
}))
```

注入 `layout` 特別有用 —— 直接跳到「已經配置好的 3×3 版面」截圖，
不必每一章都從空版面開始重新雙擊九次。

## 網路攔截

清單啟動時會打 `./api/cameras`。這支請求**在一般執行下一定會失敗**
（Vite dev server 沒有這個路由、Electron 走 `file://` 協定），失敗就退回
`src/renderer/data/cameras.ts` 的內建假資料，所以離線也跑得起來。

它存在的意義是給產線一個攔截點：

```ts
await page.route('**/api/cameras', (route) =>
  route.fulfill({ path: 'fixtures/cameras.json' }),
)
```

攔截之後，手冊每次拍到的清單內容就完全固定。
