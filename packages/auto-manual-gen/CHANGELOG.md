# Changelog

公開介面（CLI 指令與選項、`manual.yaml` 與 manifest 的 schema、`--json` 格式、exit code 與 `error.code`）有不相容的變更時升主版號。

## 0.1.0

第一個可以安裝的版本，從範例專案 [auto-manual-gen](https://github.com/CK642509/auto-manual-gen) 的 `runner/` 抽出。

- 指令：`init` `doctor` `probe` `validate` `run` `build` `sync` `video` `tour`
- 從目前目錄往上找 `manual.yaml` 決定手冊專案的根目錄；`config.json` 只能覆寫 `app`
- `validate` 的結構檢查改用 `schema/v1/manifest.json`，跟編輯器同一份
- 所有指令支援 `--json`；exit code：0 成功 / 1 內容 / 2 用法或設定 / 3 環境
- `app.mode: custom` 可以指向自己寫的 driver
