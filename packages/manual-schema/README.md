# manual-schema

manifest 的 JSON Schema，獨立成套件讓別人能驗證自己的設定檔。

對應系列 **Day 13**（schema 設計）與 **Day 28**（抽離成可安裝的工具）。

## 核心決策

manifest 刻意**不提供條件判斷、迴圈、變數**。一旦圖靈完備就沒人能 review 了，
而「產出可被人審查」正是選宣告式的全部理由。

表達不了的操作走逃生門 `action: custom`，指向一支小 `.ts`。
逃生門的使用數量要列進 lint 報告 —— 數字變高就是設計信號。
