---
name: audit
description: 檢查整本手冊是否還跟得上目前的 UI
disable-model-invocation: true
argument-hint: "[章節 id]"
allowed-tools: Bash(auto-manual validate *) Bash(auto-manual run *)
---

檢查手冊是否還跟得上目前的 UI。有指定章節（「$ARGUMENTS」不是空的）就只檢查那一章，否則檢查整本。

1. 執行 `auto-manual --version`，確認是 0.1.x；對不上就停下來告訴使用者。
2. `auto-manual validate --json`（有指定章節就加 `--chapter`）。
3. `auto-manual run --json`（有指定章節就加 `--chapter`）。`run` 遇到第一個失敗就會停：
   記下那一章的錯誤之後，對它後面的章節逐一用 `--chapter` 繼續跑，直到每一章都跑過一次。
4. 依 exit code 分類，整理成一張表回報：章節、`error.code`、原因、建議的修法。
   - exit 3（環境）：只轉告使用者缺什麼，不分析內容。
   - `SELECTOR_NOT_FOUND`：對照 `error.candidates`、TESTID.md、`git log -p` 最近對 testid 的改動，判斷是改名還是少了前置操作。
5. **這個指令只檢查、不修改**。列出建議之後停下來，問使用者要修哪幾章。
