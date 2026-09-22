# QUIRKS

這個 App 的行為特性 —— 不是「有沒有這個 testid」，而是「這個 testid 什麼時候會變成什麼樣子」。
這類知識人要在這個專案上踩過兩三次才會記住，寫在這裡讓 agent 第一次就避開。

## 時序

- **`camera-list-skeleton` 至少存在 450ms**，就算 fixture 資料回得再快也一樣（刻意的最小顯示時間，
  不然讀者根本看不到「載入中」長什麼樣子）。等它 `state: detached` 再等 `camera-list` 出現，
  不要用固定的 `wait` 賭時間。
- **`toast` 3 秒後自動消失**，同時最多疊 3 則。操作觸發 toast 之後要立刻截圖，
  中間不要插入其他等待——插了很可能拍到空氣。
- **`stat-fps-value`、`grid-cell-fps_{n}`、`grid-cell-detections_{n}` 每 1.2 秒重算**，
  兩次截圖數值不會一樣。這幾個 testid 不適合放進 `annotate`（legend 只該標「這是什麼」，
  不該暗示「數值長這樣」）。
- **`grid-cell-timestamp_{n}` 每秒跳動**，同上，不要在文案裡引用它的當下值。

## 條件渲染（一律 `v-if`，不是 `v-show`）

- 兩個分頁互斥：沒被選中的那一頁不在 DOM 裡。
- `camera-dialog-delete` **只在編輯模式存在**，新增模式下整個按鈕不在 DOM 裡 —— 不是 disabled。
- `settings-section_license` **只有 `role=admin` 才存在**。
- `settings-*-sub` 系列（告警 / 動作偵測 / 人臉辨識的子設定）**只有對應開關打開才存在**。
- `camera-list-empty` 只在搜尋無結果時存在；`grid-cell-empty_{n}` 只在該格是空的時候存在，
  格子裡有攝影機時換成 `grid-cell-view_{n}`——同一個位置的兩個 testid 不會同時存在。

## 版面（grid）相關

- **3×3 起，`grid-cell-fps_{n}`、`grid-cell-detections_{n}` 以及偵測框上的文字標籤會被移除**
  （不是隱藏，`querySelector` 找不到），因為格子寬度不夠、硬塞會讓底部資訊列擠成一團。
  在 3×3 / 4×4 版面下找不到這幾個 testid 是正常的，不是 bug。
- `grid-cell_{n}` 的 `{n}` 是**畫面上的固定位置**（左上角永遠是 1），不是資料索引，
  清掉某一格不會讓後面的格子編號往前遞補。

## 新增 / 編輯攝影機

- `camera-dialog-confirm` 在**顯示名稱為空時 disabled**，其他欄位都可以留空 —— RTSP 位址、
  帳號、密碼都不是必填，這是刻意模擬「先建卡、之後再補連線資訊」的真實情境，
  但**手冊裡示範新增流程時，通常還是要示範連 RTSP 位址一起填**，只示範名稱會讓讀者以為那樣就設定完成了。
- 攝影機的 `id`（也就是 `camera-row_{id}` 的 `{id}`）是**從顯示名稱推導**：轉小寫、非
  `[a-z0-9]` 字元一律去掉。**中文名稱會被整段濾掉**，例如「大門西側」會變成通用的 `camera`
  （重複的話遞增成 `camera-2`），不會是看得懂的語意 key。這只影響「新增之後還要用
  `camera-row_{id}` 操作那台」的章節；只示範新增流程、不需要再操作那台的話可以不管。
- 刪除攝影機的確認框（`confirm-dialog`）疊在攝影機對話框之上，是**第二層** —— 離開這一章前
  兩層都要關掉，不然下一章開機時狀態是乾淨的（每章重新開機），但同一章裡沒關掉的話後續步驟會踩到它。

## 網路 / 資料

- 清單啟動時打 `./api/cameras`，**在一般執行下一定會失敗**（Vite dev server 沒這支路由，
  Electron 走 `file://`），失敗後退回內建假資料，所以離線也跑得起來 —— 這不是要修的 bug。
- 攔截 `./api/cameras` 換成 `fixtures/cameras.json` 可以讓清單內容每次完全固定；
  沒攔截時清單內容也是固定的（同一份內建假資料），只是多繞了一次注定失敗的 fetch。

## 語言

- `locale` 切到 `en` 之後，**畫面上所有中文文案都換成英文**，但 testid 不變。
  用文字內容（`probe` 印出來的 text）當 selector 完全不會動；用 testid 寫的 manifest 換語言重跑就好。
