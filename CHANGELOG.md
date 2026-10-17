# Changelog

## 0.1.0 — 2026-10-17

首个版本。

- `deepseek_search`：结构化搜索结果，支持 `site:` / `-site:` / 排除词 / 精确短语 / `lang:` / `after:` / `before:`，`count` 1–50，可选 `need_content`。
- `deepseek_fetch`：单页转 Markdown，正文按 `maxChars` 截断并标注。
- `deepseek_research`：搜索 + 抓前 N 页正文，返回 `1 + N` 计费口径。
- key 四层解析（配置 / 环境变量 / `~/.secrets/keys.env` / `$DSH_HOME/.credentials.yaml`），key 不落 profile。
- 超时、429/5xx 退避重试、状态码到可执行提示的翻译。
- 单测 22 项（mock fetch）+ 真机自测脚本。
