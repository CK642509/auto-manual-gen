---
name: doc-writing
description: 撰寫或修改 auto-manual-gen 手冊正文（docs/**/*.md）時使用。說明正文的骨架、截圖與 legend 的引用方式、人工保護區，以及預設的寫作規則。
---

# 撰寫手冊正文

正文是一般的 Markdown，檔名跟 manifest 對齊：主語言是 `docs/{order}-{id}.md`，其他語言是 `docs/{locale}/{order}-{id}.md`。

## 先讀專案自己的規則

如果專案裡有 `agent/STYLE.md`，**以它為準**，這份 skill 只是沒有專案規則時的預設值。
也先讀 `docs/` 裡已經審過的章節，模仿它們的結構、句子長度與語氣，但不要複製產品內容。

## 資料來源

- 只根據本章的 manifest、截圖、`TESTID.md`、`agent/` 的上下文，以及 `manual.yaml` 的 `text.messages` 指向的 i18n 檔撰寫。
- 找不到證據的功能、步驟、限制，一律不寫；覺得「應該要有」的內容，回報給人。
- manifest 的步驟就是操作順序，正文不增、不減、不換順序。
- manifest、截圖、i18n 三者對不上時，不要自己挑一個寫，照 manifest 寫完後把差異回報給人。

## 兩種引用

- `{{screenshot:<name>}}`：放截圖，獨立一行。manifest 裡每一張都要出現**剛好一次**，放在對應的操作步驟之後。
- `{{legend.<key>}}`：引用本章 `annotate` 的 legend，換語言時會跟著換。不要把 legend 的文字抄進正文，也不要寫標號數字。

## 預設的寫作規則

- 讀者是產品的使用者，不是工程師。testid、元件名稱、`waitFor` 這些動詞不能出現在正文，
  要翻成讀者看得到的結果（`waitFor: toast` →「畫面出現成功通知」）。
- 有標號的元件用 `{{legend.<key>}}`；沒有標號的元件，名稱直接取自 i18n 檔，一字不改。
  中文用「」包起來，英文用**粗體**。
- 操作步驟用祈使句、編號清單，一行一個動作。截圖打斷清單時，後面的編號要接續。
- 不描述每次都會變的數值（FPS、時間戳、計數）。

## 骨架

要錄影片（`video: true`）或做導覽（`tour: true`）的章節**必須**是這個結構：第一個 H2 底下是編號步驟，第二個 H2 是完成後的說明。其他章節也建議照這個結構。

```markdown
# <manifest 的 title>

<用途簡介，一到兩句>

## 操作步驟

1. <步驟>
2. <步驟>

{{screenshot:<id>-01}}

3. <步驟>

## 完成後

<讀者應該看到什麼>

> 注意：<真正會影響操作的限制；沒有就整段省略>
```

## 人工保護區

`<!-- protected:start -->` 與 `<!-- protected:end -->` 之間是人工維護的內容（法規、警語、權限規則）。

- 原封不動地保留，包含標記本身、換行與標點。不改寫、不搬位置、不刪除。
- 不要自己新增保護區。需要警語卻沒有資料時，回報給人。
- `validate` 會跟 git 的上一版比對，改到一個字就會失敗。

## 寫完之後

跑 `auto-manual validate --chapter <id> --json`。多語言專案翻譯完譯文後，用
`auto-manual sync --locale <locale> --json` 確認段落有對齊；`sync --accept` 要等人審過譯文再跑。
