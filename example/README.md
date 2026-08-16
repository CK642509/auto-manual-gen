# example —— 一本完整的手冊

這是產線的**輸出範例**，也是讀者拿去改成自己專案的起點。
`manual-gen init` 產生的骨架，本質上就是這個目錄的精簡版。

| 目錄 | 內容 | 對應天數 |
|---|---|---|
| `manifest/` | `base.yaml` + `chapters/*.yaml`，唯一的人為真相來源 | Day 13 |
| `fixtures/` | 假 API 回應、固定串流圖 —— 讓畫面每次都一樣 | Day 07 |
| `docs/` | 正文 Markdown。AI 生成，**含人工保護區標記** | Day 17, 18 |
| `templates/` | `reference.docx`，pandoc 的樣式來源 | Day 19 |
| `config.json` | 環境相依的東西全部在這（App 路徑、輸出目錄、圖片寬度） | Day 28 |
| `output/` | 產物，不進版控（但會放一份 sample 供 Day 01 下載） | — |

## 命名約定

三者靠約定串起來，不需要額外索引檔：

```
chapters[].id  ↔  docs/{order}-{id}.md  ↔  screenshots/{name}.png
```

`order` 用 10 的倍數編號，中間留空間給之後插入的章節。
