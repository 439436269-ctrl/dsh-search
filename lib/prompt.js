/**
 * The system-prompt section this plugin contributes.
 *
 * Short on purpose: it only states when the tools beat the built-in ones and
 * what each successful call costs, since the tool descriptions carry the rest.
 *
 * @module dsh-search/prompt
 */

/**
 * @param {Record<string, any>} config - effective plugin config.
 * @returns {string} prompt section text.
 */
export function guideText(config) {
	const key = "（key 从 DEEPSEEK_API_KEY / ~/.secrets/keys.env / ~/.dsh/.credentials.yaml 解析）";
	return [
		"联网搜索与抓取默认走 DeepSeek 官方接口，而不是内置 web_search / web_fetch：",
		"- deepseek_search：要线索。返回 rerank 分、权威度、发布时间，可用 site: / after: / before: / lang: / 精确短语 / 排除词。",
		"- deepseek_fetch：要原文。单页转 Markdown，核实版本号、日期、价格、API 字段时用。",
		"- deepseek_research：要结论。一次搜索＋抓前 N 页正文（默认 2）。",
		"判读：rerankScore ≥ 1.5 为优质，authority ≥ 3 为高权威；summary 是二手摘要，关键事实必须 fetch 原文核实；引用给原始 URL。",
		`成本：每次成功请求计费（约 5 元/千次），count 不影响单价——一次取够，别拆分多次；空结果不计费。限速 Search/Fetch 各 5 QPS。${key}`,
		"仅在不想计费、或需要登录态/点击交互的页面时，才回退内置通道或浏览器自动化。",
	].join("\n");
}
