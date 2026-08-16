# plugin —— Claude Code plugin

對應系列 **Day 29**。

## 這裡面裝的不只是程式碼

- `manual-cli` 的工具介面（`probe` / `run` / `validate`）→ Day 15
- `agent/` 的上下文（TESTID 規範、schema、UI-MAP 範本）→ Day 16
- 正文風格指南與 few-shot 範例 → Day 17

換句話說，**plugin 打包的是「怎麼用這套工具」的知識**，不只是工具本身。
這正好呼應 Day 16 的結論：agent 的產出品質由上下文決定，那就把上下文一起發出去。

## 分層，讓它過期得慢一點

| 放哪 | 內容 | 換平台時 |
|---|---|---|
| MCP server | 工具能力 | 不用動 |
| plugin | 使用知識（prompt、規範、範例） | 重寫這層 |

plugin 生態變化快 —— 文章與此處都要標明版本與日期。
