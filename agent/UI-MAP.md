# UI-MAP

頁面與導覽結構。`TESTID.md` 告訴你「這個 testid 是什麼」，這份文件告訴你「要先做什麼才看得到它」——
規劃一章的操作順序之前，先確認前置條件都滿足了。

## 導覽

```
topbar（全域，兩個分頁都看得到）
├── nav-tab_monitor    即時監控   ← 預設分頁
└── nav-tab_settings   系統設定
```

分頁是 `v-if` 切換，不是 `v-show`：沒被選中的那一頁**完全不在 DOM 裡**，
不要對還沒 click 過 `nav-tab_*` 的分頁做任何探勘或操作。

## 即時監控（`nav-tab_monitor`，App 啟動時的預設分頁）

```
monitor-page
├── 左欄
│   ├── overview-stats           統計卡，一進來就在
│   └── camera-panel             攝影機清單
│       ├── camera-list-skeleton   載入中才存在，載入完成後從 DOM 移除
│       └── camera-list            骨架屏消失後才存在
└── 右欄
    └── grid-panel                版面工具列 + grid-view（格子容器）
```

**開對話框的路徑**：

- `camera-add`（清單面板右上角）→ `camera-dialog` 開啟，新增模式（`camera.value = null`）
- `camera-edit_{id}`（清單裡每一列的齒輪）→ `camera-dialog` 開啟，編輯模式，欄位帶入該台既有資料
- 兩條路徑共用同一個 `camera-dialog`，差異只在**新增模式沒有 `camera-dialog-delete`**（條件渲染，不是 disabled）
- 對話框內按 `camera-dialog-delete` → 二層對話框 `confirm-dialog` 疊上來，離開這一章前兩層都要關掉

## 系統設定（`nav-tab_settings`）

```
settings-page
├── settings-section_alert      告警
├── settings-section_analysis   影像分析（動作偵測 / 人臉辨識子設定都是條件渲染）
└── settings-section_license    授權與裝置 —— 只有 role=admin 才在 DOM 裡
```

`settings-section_license` 不是 disabled 或用 CSS 藏起來，操作員角色（預設）下這個區塊
**整個不存在**。要探勘或截這一段，必須先用 `manual.yaml` 的 `bootstrap.storage.role: admin`
或章節自己的 `setStorage` 把角色提上去。

## 常見的「探勘不到」對照

| 想拍的東西 | 為什麼首頁探勘不到 | 要先做什麼 |
|---|---|---|
| `camera-dialog*` | 對話框還沒開 | `click: camera-add` 或 `camera-edit_{id}` |
| `camera-dialog-delete` | 新增模式下不存在 | 先用 `camera-edit_{id}` 開編輯模式 |
| `confirm-dialog*` | 二層對話框還沒開 | 先開 `camera-dialog`，再 `click: camera-dialog-delete` |
| `settings-section_license` | 角色不是 admin | bootstrap 注入 `role: admin` |
| `settings-*-sub` 系列 | 對應開關預設是關的 | 先 `click` 開關本身 |
| `grid-cell-fps_{n}` / `grid-cell-detections_{n}` | 版面在 3×3 以上 | 見 [`QUIRKS.md`](./QUIRKS.md) |
