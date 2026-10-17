/**
 * `deepseek_search` — web search with structured, reranked results.
 *
 * @module dsh-search/tools
 */

import { normalizeResult, renderSearchReport } from "../format.js";
import { buildQuery } from "../query.js";
import { clampInt, guarded, requireText } from "./shared.js";

export function createSearchTool(ctx) {
	const { client, config } = ctx;
	return {
		name: "deepseek_search",
		description:
			"Search the web through DeepSeek's first-party search engine and get structured, reranked results (title, url, snippet, model-ready summary, optional page content, publish date, authority, rerank score). Supports the operators site:, -site:, -, -\"phrase\", \"exact\", lang:, after:, before: — pass them inside `query` or use the dedicated arguments. Cost: one billed request per successful call (empty results are not billed), so ask for every result you need in one call instead of calling repeatedly. Result count does not change the price. Use `deepseek_fetch` when you need a full page rather than a summary.",
		parameters: {
			query: { type: "string", required: true, description: "Search terms, 1-128 characters. Operators are allowed, e.g. `DeepSeek -site:csdn.net after:2025`." },
			count: { type: "integer", description: "How many results to return, 1-50 (default from config, usually 5)." },
			site: { type: "string", description: "Restrict to sites: `github.com` or `github.com huggingface.co` (becomes `site:a OR site:b`)." },
			lang: { type: "string", description: "Restrict to languages, comma separated, e.g. `zh,en`." },
			after: { type: "string", description: "Only pages published after this date, `2025` or `2025-01-01`." },
			before: { type: "string", description: "Only pages published before this date, `2026` or `2026-06-01`." },
			oriQuestion: { type: "string", description: "The user's original question verbatim; helps the engine infer intent on noisy queries." },
			needContent: { type: "boolean", description: "Also return page body for each result (bigger payload, same price). Prefer `deepseek_fetch` for one specific page." },
		},
		outputSchema: {
			type: "object",
			additionalProperties: false,
			properties: {
				query: { type: "string", required: true },
				total: { type: "integer", required: true },
				billed: { type: "boolean", required: true },
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
						},
					},
				},
			},
		},
		call: (args) => ({ card: "generic", title: `deepseek_search ${args.query}`, kind: "search" }),
		render: (_args, value) => [{ type: "text", text: renderSearchReport(value) }],
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
				const oriQuestion = args.oriQuestion ? String(args.oriQuestion).trim() : "";
				const needContent = args.needContent === true;
				const raw = await client.search({ query, count, oriQuestion, needContent });
				const results = raw.map((item, index) =>
					normalizeResult(item, index + 1, { contentLimit: needContent ? config.maxContentChars : 0 }),
				);
				return { query, total: results.length, billed: results.length > 0, results };
			}),
	};
}
