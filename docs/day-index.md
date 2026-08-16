# 每天 ↔ 檔案路徑對照

系列文章的體例是「正文只講關鍵三處」，完整實作看 repo。這份表是兩者的橋。

> repo 只維護 `main` 一份（完成品），不做 30 個 tag。
> 文章講的是**建置過程與理由**，repo 給的是**可以直接讀、直接跑的結果**。

## Part 0 —— 定位與地基

| Day | 主題 | 對應路徑 |
|---|---|---|
| 01 | 手冊為什麼永遠過期 | `example/output/`（成品下載） |
| 02 | 技術選擇 | `package.json`、`apps/demo-stream-app/package.json` |
| 03 | 產線全景與專案架構 | 本 repo 的目錄樹 |
| 04 | Demo App | `apps/demo-stream-app/` |

## Part 1 —— Playwright 產線實作

| Day | 主題 | 對應路徑 |
|---|---|---|
| 05 | 驅動 Electron 與 Web | `packages/manual-runner/drivers/`、`apps/demo-stream-app/src/main/` |
| 06 | data-testid | `apps/demo-stream-app/TESTID.md`、`apps/demo-stream-app/src/renderer/App.vue` |
| 07 | 狀態注入 | `example/fixtures/`、`apps/demo-stream-app/src/renderer/locales/index.ts` |
| 08 | 等待時機 | `packages/manual-runner/actions/wait-for.ts` |
| 09 | 截圖構圖 | `packages/manual-runner/capture/` |
| 10 | 畫框與標註 | `packages/manual-runner/overlay/` |
| 11 | 標號擺放與 legend | `packages/manual-runner/overlay/badge-layout.ts` |
| 12 | 敏感資訊遮蔽 | `packages/manual-runner/overlay/redact.ts` |

## Part 2 —— 設定檔與 runner

| Day | 主題 | 對應路徑 |
|---|---|---|
| 13 | schema 設計 | `packages/manual-schema/`、`example/manifest/` |
| 14 | runner 執行模型 | `packages/manual-runner/` |

## Part 3 —— AI Agent

| Day | 主題 | 對應路徑 |
|---|---|---|
| 15 | agent 寫設定檔 | `packages/manual-runner/probe.ts`、`packages/manual-cli/` |
| 16 | 上下文設計 | `agent/` |
| 17 | AI 寫正文 | `agent/STYLE.md`、`agent/examples/` |
| 18 | 保護區與驗收 | `example/docs/`（保護區標記） |

## Part 4 —— 交付

| Day | 主題 | 對應路徑 |
|---|---|---|
| 19 | Word 與 PDF | `example/templates/reference.docx` |

## Part 5 —— 維護、測試與 CI

| Day | 主題 | 對應路徑 |
|---|---|---|
| 20 | 三種維護情境 | — |
| 21 | 順便得到 smoke test | `packages/manual-runner/` |
| 22 | AI 判讀差異 | `fixtures/diff-pairs/` |
| 23 | 接進 CI | `.github/workflows/manual.yml` |

## Part 6–8 —— 擴散與發布

| Day | 主題 | 對應路徑 |
|---|---|---|
| 24 | 多語言 | `apps/demo-stream-app/src/renderer/locales/` |
| 25 | 增量翻譯與術語表 | `apps/demo-stream-app/src/renderer/locales/*.json` |
| 26 | 錄影與 GIF | `packages/manual-runner/video/` |
| 27 | 字幕與維護成本 | `packages/manual-runner/video/subtitle.ts` |
| 28 | 抽離成 CLI | `packages/manual-cli/`、`example/config.json` |
| 29 | Claude Code plugin | `plugin/` |
| 30 | 回顧 | — |
