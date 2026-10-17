/**
 * `deepseek_research` — search once, then fetch the top pages, in one call.
 *
 * Saves the model a round trip when it needs a conclusion rather than links:
 * one billed search plus one billed fetch per fetched page.
 *
 * @module dsh-search/tools
 */

import { normalizeResult, resultBlock } from "../format.js";
import { buildQuery } from "../query.js";
import { clampInt, guarded, requireText } from "./shared.js";

/** Space between fetches, keeping well inside the account-wide 5 QPS. */
const FETCH_GAP_MS = 220;

export function createResearchTool(ctx) {
	const { client, config } = ctx;
	return {
		name: "deepseek_research",
		description:
			"Search and read in one call: run the query, then fetch the top N pages and return their opening text alongside the summaries. Use it when the answer needs page content, not just links. Cost: one billed search + one billed fetch per fetched page, so keep `top` small (1-2 is usually enough; `top: 0` skips fetching entirely). Prefer `deepseek_search` when you only need candidate URLs, and `deepseek_fetch` when you already know which page to read.",
		parameters: {
			query: { type: "string", required: true, description: "Search terms, 1-128 characters; operators allowed." },
			count: { type: "integer", description: "Results to list, 1-50 (default from config, usually 5)." },
			top: { type: "integer", description: "How many top results to fetch full text for, 0-5 (default 2). Each fetched page is billed separately." },
			excerptChars: { type: "integer", description: "Characters of body kept per fetched page (default 3000)." },
			site: { type: "string", description: "Restrict to sites, e.g. `github.com` or `github.com huggingface.co`." },
			lang: { type: "string", description: "Restrict to languages, comma separated." },
			after: { type: "string", description: "Only pages published after this date." },
			before: { type: "string", description: "Only pages published before this date." },
		},
		outputSchema: {
			type: "object",
			additionalProperties: false,
			properties: {
				query: { type: "string", required: true },
				total: { type: "integer", required: true },
				fetched: { type: "integer", required: true },
				billedRequests: { type: "integer", required: true },
				results: {
					type: "array",
					required: true,
					items: {
						type: "object",
						additionalProperties: false,
						properties: {
							rank: { type: "integer", required: true },
							title: { type: "string", required: true },
							url: { type: "string", required: true },
							snippet: { type: "string", required: true },
							summary: { type: "string", required: true },
							content: { type: "string", required: true },
							siteName: { type: "string", required: true },
							date: { type: "string", required: true },
							authority: { type: "integer", required: true },
							rerankScore: { type: "number", required: true },
							good: { type: "boolean", required: true },
							excerpt: { type: "string", required: true },
							fetchError: { type: "string", required: true },
						},
					},
				},
			},
		},
		call: (args) => ({ card: "generic", title: `deepseek_research ${args.query}`, kind: "search" }),
		render: (_args, value) => {
			if (value.results.length === 0) {
				return [{ type: "text", text: `query: ${value.query}\n没有匹配结果（本次请求不计费）。` }];
			}
			const blocks = value.results
				.map((result) => {
					const base = resultBlock(result);
					if (result.excerpt) return `${base}\n    ── 正文节选 ──\n${indent(result.excerpt)}`;
					if (result.fetchError) return `${base}\n    ⚠ 抓取失败：${result.fetchError}`;
					return base;
				})
				.join("\n\n");
			return [
				{
					type: "text",
					text: [
						`query: ${value.query}   命中 ${value.total} 条，抓取 ${value.fetched} 页正文（计费 ${value.billedRequests} 次请求）`,
						"",
						blocks,
						"",
						"引用请带原始 URL；正文是节选，长文用 deepseek_fetch 取全文。",
					].join("\n"),
				},
			];
		},
		execute: (args) =>
			guarded(async () => {
				const query = buildQuery({
					query: requireText(args.query, "query"),
					site: args.site,
					lang: args.lang,
					after: args.after,
					before: args.before,
				});
				const count = clampInt(args.count, config.defaultCount, 1, 50);
				const top = clampInt(args.top, 2, 0, 5);
				const excerptChars = clampInt(args.excerptChars, 3_000, 200, config.maxContentChars);

				const raw = await client.search({ query, count });
				const results = raw.map((item, index) => ({
					...normalizeResult(item, index + 1, { contentLimit: 0 }),
					excerpt: "",
					fetchError: "",
				}));

				let fetched = 0;
				for (const result of results.slice(0, top)) {
					if (fetched > 0) await sleep(FETCH_GAP_MS);
					try {
						const page = await client.fetchPage(result.url);
						result.excerpt = page.content.slice(0, excerptChars);
						fetched += 1;
					} catch (error) {
						result.fetchError = String(error?.message ?? error);
					}
				}

				return {
					query,
					total: results.length,
					fetched,
					billedRequests: results.length === 0 ? 0 : 1 + fetched,
					results,
				};
			}),
	};
}

/**
 * Indent an excerpt for display.
 *
 * @param {string} text - body excerpt.
 * @returns {string} indented, blank-line-collapsed text.
 */
function indent(text) {
	return text
		.replace(/\n{3,}/g, "\n\n")
		.split("\n")
		.map((line) => `    ${line}`)
		.join("\n");
}

/**
 * @param {number} ms - delay.
 * @returns {Promise<void>} resolves after the delay.
 */
function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
