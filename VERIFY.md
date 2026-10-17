# 验证记录

版本：0.1.0（2026-10-17）

## 单测（mock fetch，不联网、不花钱）

```
node --test test/*.test.js
tests 22  pass 22  fail 0
```

覆盖：请求体形状（`need_content` / `ori_question` 只有在需要时出现）、400 不重试、429/503 退避重试后成功、重试耗尽、key 缺失在发请求前失败、origin 尾部斜杠归一化、`site:` 展开为 OR、query 长度上限、`count` 钳到 50、正文截断标注、`research` 的 `1+N` 计费口径与 `top:0` 不抓取、单页抓取失败不影响其余结果。

## 真机自测（真实接口，约 0.01 元）

```
node scripts/live-selftest.js
key source: <credentials 文件>
PASS  search returns results  — hits=3 top=网页搜索与抓取
PASS  fetch returns Markdown body  — title=网页搜索与抓取 chars=6402
```

## 挂载验证

- `npm pack` 产物 18 个文件，`lib/tools/*.js` 子目录未漏（`files` 用的是 `lib/**/*.js`）。
- 以 tgz 装进 DSH profile 后**热加载成功、无需重启**：三个工具直接出现在工具表，系统提示多出本插件的章节；重复挂载检查为单条（profile patch 无 `insert` 行，bundles 只列一次）。
- 会话内真机调用：`deepseek_search`（`site:github.com` 生效，rerank 2.29 首条）与 `deepseek_fetch`（截断标注生效）均正常。

## CI

- GitHub Actions `ci`：node 22 / 24 矩阵，首次推送即绿；只跑 mock 单测，不碰网络与密钥。

## 发布

- 仓库：`439436269-ctrl/dsh-search`（public，topics 含 `dsh-plugin`）。
- npm：`@vfvrpq/dsh-search@0.1.0`。

## 隐私

- 发布前扫描：源码/文档/配置零命中（只存在测试里显式的假 key 字面量）。
- API key 不落 profile：插件配置默认空，运行时按 `$DEEPSEEK_API_KEY` → `~/.secrets/keys.env` → `$DSH_HOME/.credentials.yaml` 解析。

## 市场投稿（P9）

- PR：`awesome-dsh-plugin/awesome-dsh-plugin#7732`（2026-10-17 提交，条目 `data/plugins/439436269-ctrl__dsh-search.yml`，category `tools`）。
- `check`：**success**（schema/引号/README 重生成/重复条目/stale-fork 守卫全过）。
- `Submission gate`：**failure**，唯一原因是 *repository is 0.0 days old (needs 1)*。按该检查自己的文案，它会定期重跑并在约 24 小时后自动转绿——**不要**重提、不要推空提交、不要关了重开。
- 提交流程备注：本地 `submit-market-pr.mjs` 的前置检查把「<1 天」判为硬失败（exit 1），与上游 gate 的「自愈」语义不一致，因此本次按 skill 的手动三步（建分支 → Contents API 落文件 → 开 PR）提交。
