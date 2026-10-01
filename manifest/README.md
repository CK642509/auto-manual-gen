# manifest

唯一的「人為真相來源」：整本手冊的章節、順序、每一步要做什麼、要標註哪個元件。
一個章節一個 YAML，檔名與 `docs/` 的正文、`screenshots/` 的檔名前綴對齊。整本手冊的設定在根目錄的 `manual.yaml`。

schema 跟著 `auto-manual-gen` 一起發布（`packages/auto-manual-gen/schema/v1/manifest.json`），也放在固定網址上。
YAML 開頭加這行，有裝 YAML 擴充套件的編輯器就會即時補全、把錯的欄位標紅：

```yaml
# yaml-language-server: $schema=https://ck642509.github.io/auto-manual-gen/schema/v1/manifest.json
```

`auto-manual-gen validate` 用的是同一份 schema，編輯器與 validate 不會有兩套標準。
動詞與欄位的說明見 [`packages/auto-manual-gen/README.md`](../packages/auto-manual-gen/README.md#manifest)。

## 核心決策

manifest 刻意**不提供條件判斷、迴圈、變數**。一旦圖靈完備就沒人能 review 了，
而「產出可被人審查」正是選宣告式的全部理由。

表達不了的啟動流程（要先登入、要先把後端跑起來）交給自訂 driver（`app.mode: custom`），而不是讓 manifest 長出邏輯。
