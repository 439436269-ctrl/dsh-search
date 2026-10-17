/**
 * `deepseek_fetch` — one page as Markdown.
 *
 * @module dsh-search/tools
 */

import { clip } from "../format.js";
import { guarded, requireText } from "./shared.js";

export function createFetchTool(ctx) {
	const { client, config } = ctx;
	return {
		name: "deepseek_fetch",
		description:
			"Fetch one web page and get its main content as Markdown (title plus body), extracted by DeepSeek. Use it to read the full text behind a search result, verify a version number / date / price / API field, or quote a page exactly — a search result's summary is a second-hand digest. Cost: one billed request per successful fetch (empty or blocked pages are not billed). JSON API endpoints, PDFs without text, and login-gated pages usually fail with a clear error; those need a browser instead.",
		parameters: {
			url: { type: "string", required: true, description: "Absolute http(s) URL, no embedded username/password." },
			maxChars: { type: "integer", description: "Body ceiling in characters (default from config, usually 20000). The reply says whether it was truncated." },
		},
		outputSchema: {
			type: "object",
			additionalProperties: false,
			properties: {
				url: { type: "string", required: true },
				title: { type: "string", required: true },
				content: { type: "string", required: true },
				chars: { type: "integer", required: true },
				truncated: { type: "boolean", required: true },
				billed: { type: "boolean", required: true },
			},
		},
		call: (args) => ({ card: "generic", title: `deepseek_fetch ${args.url}`, kind: "search" }),
		render: (_args, value) => {
			const header = `# ${value.title || "(无标题)"}\n${value.url}\n`;
			const footer = value.truncated ? `\n\n…（正文 ${value.chars} 字符处截断，可调大 maxChars）` : "";
			return [{ type: "text", text: value.content ? header + "\n" + value.content + footer : `${header}\n（没有可提取的正文，本次不计费）` }];
		},
		execute: (args) =>
			guarded(async () => {
				const url = requireText(args.url, "url");
				if (!/^https?:\/\//i.test(url)) throw new Error("deepseek-search: `url` 必须是 http:// 或 https:// 开头的绝对地址");
				const limit = Number.isFinite(Number(args.maxChars)) && Number(args.maxChars) > 0
					? Math.trunc(Number(args.maxChars))
					: config.fetchMaxChars;
				const page = await client.fetchPage(url);
				const body = clip(page.content, limit);
				return {
					url,
					title: page.title,
					content: body.text,
					chars: page.content.length,
					truncated: body.truncated,
					billed: page.content.length > 0,
				};
			}),
	};
}
