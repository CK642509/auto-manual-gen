---
name: add-chapter
description: 新增一章手冊
disable-model-invocation: true
argument-hint: <要說明的功能>
allowed-tools: Bash(auto-manual probe *) Bash(auto-manual validate *) Bash(auto-manual run *)
---

新增一章手冊，說明「$ARGUMENTS」。

1. 執行 `auto-manual --version`，確認是 0.1.x；對不上就停下來告訴使用者。
2. 讀專案的 TESTID.md（用 Glob 找 `**/TESTID.md`，排除 `node_modules`）、agent/UI-MAP.md、agent/QUIRKS.md。
   缺少任何一份就先停下來，建議使用者先建立上下文（`manual:bootstrap-context`）。
3. 委派 `manual:explorer` 探勘相關畫面，拿回可用的 testid 與建議的操作順序。
4. 依照 `manual:manifest-authoring` 寫 manifest → `auto-manual validate --chapter <id> --json` →
   `auto-manual run --chapter <id> --json`，失敗就依照 `--json` 的錯誤修正。
5. 兩個指令都通過之後就停下來，列出 diff 與截圖路徑給人 review。不要接著寫正文，也不要修改 CLI。
