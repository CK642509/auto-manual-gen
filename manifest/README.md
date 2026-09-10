# manifest

唯一的「人為真相來源」：整本手冊的章節、順序、每一步要做什麼、要標註哪個元件。
一個章節一個 YAML，檔名與 `docs/` 的正文、`screenshots/` 的檔名前綴對齊。

`schema.json` 是 manifest 的 JSON Schema，YAML 開頭加這行就能在編輯器裡即時驗證：

```yaml
# yaml-language-server: $schema=./schema.json
```

## 核心決策

manifest 刻意**不提供條件判斷、迴圈、變數**。一旦圖靈完備就沒人能 review 了，
而「產出可被人審查」正是選宣告式的全部理由。

表達不了的操作走逃生門 `action: custom`，指向一支小 `.ts`。
逃生門的使用數量要列進 lint 報告 —— 數字變高就是設計信號。
