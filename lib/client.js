/**
 * HTTP client for the DeepSeek Search / Fetch endpoints.
 *
 * Both are plain JSON APIs behind the same Bearer auth as the chat API:
 *   POST /v1/tools/search   { query, count, ori_question, need_content }
 *   POST /v1/tools/fetch    { url }
 *
 * The client owns timeout, retry, and error translation, so tool files only see
 * successes or a thrown `SearchClientError` that already carries a hint.
 *
 * @module dsh-search/client
 */

import { resolveApiKey } from "./keys.js";

/** Status codes worth retrying: transient by contract. */
const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

/** Operator-facing explanation per status. */
const HINTS = {
	400: "请求参数不合法（query 1~128 字符、count 1~50）",
	401: "API Key 缺失或无效，检查 DEEPSEEK_API_KEY / ~/.secrets/keys.env / ~/.dsh/.credentials.yaml",
	402: "账号余额不足，请先充值",
	403: "Fetch 被目标站点的安全策略拒绝",
	404: "抓不到可提取的正文（站点拦截、非 HTML、或页面没有 Markdown 正文）",
	429: "超出限速（Search / Fetch 各自 5 QPS，账号级），稍等重试",
	500: "服务端内部错误，稍后重试",
	504: "下游超时，稍后重试",
};

export class SearchClientError extends Error {
	/**
	 * @param {string} message - human-readable failure.
	 * @param {{status?: number, hint?: string}} [meta] - HTTP status and advice.
	 */
	constructor(message, meta = {}) {
		super(message);
		this.name = "SearchClientError";
		this.status = meta.status;
		this.hint = meta.hint;
	}
}

export class SearchClient {
	/**
	 * @param {{baseUrl: string, apiKey?: string, timeoutMs?: number, maxRetries?: number, fetchImpl?: typeof fetch}} options - client options.
	 */
	constructor(options) {
		this.baseUrl = options.baseUrl.replace(/\/+$/, "");
		this.apiKeyOption = options.apiKey ?? "";
		this.timeoutMs = options.timeoutMs ?? 30_000;
		this.maxRetries = options.maxRetries ?? 2;
		this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
		if (typeof this.fetchImpl !== "function") {
			throw new SearchClientError("deepseek-search: 运行环境没有 fetch 实现");
		}
		/** @type {(explicit: string) => {key: string, source: string}} */
		this.keyResolver = options.keyResolver ?? ((explicit) => resolveApiKey({ explicit }));
	}

	/**
	 * Resolve the key for this call and report its provenance.
	 *
	 * @returns {{key: string, source: string}} resolved key.
	 */
	keyInfo() {
		return this.keyResolver(this.apiKeyOption);
	}

	/**
	 * POST one JSON body with retry, timeout, and error translation.
	 *
	 * @param {string} path - endpoint path.
	 * @param {Record<string, unknown>} body - request body.
	 * @returns {Promise<Record<string, any>>} parsed response.
	 */
	async request(path, body) {
		const { key, source } = this.keyInfo();
		if (key === "") {
			throw new SearchClientError("deepseek-search: 找不到 API Key", {
				hint: "设置 DEEPSEEK_API_KEY 环境变量，或写入 ~/.secrets/keys.env 的 DEEPSEEK_API_KEY=...",
			});
		}

		let lastError;
		for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
			if (attempt > 0) await sleep(400 * 2 ** (attempt - 1));
			let response;
			try {
				response = await this.fetchImpl(this.baseUrl + path, {
					method: "POST",
					headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
					body: JSON.stringify(body),
					signal: AbortSignal.timeout(this.timeoutMs),
				});
			} catch (error) {
				lastError = new SearchClientError(`deepseek-search: 网络请求失败（${error?.name ?? "Error"}: ${error?.message ?? error}）`);
				continue;
			}

			const text = await response.text();
			if (response.ok) {
				try {
					return JSON.parse(text);
				} catch {
					throw new SearchClientError("deepseek-search: 响应不是合法 JSON", { status: response.status, hint: text.slice(0, 200) });
				}
			}

			const message = parseErrorMessage(text) || `HTTP ${response.status}`;
			const hint = HINTS[response.status];
			lastError = new SearchClientError(`deepseek-search: ${message}（HTTP ${response.status}，key 来源 ${source}）`, {
				status: response.status,
				hint,
			});
			if (!RETRYABLE.has(response.status)) throw lastError;
		}
		throw lastError;
	}

	/**
	 * Run one web search.
	 *
	 * @param {{query: string, count: number, oriQuestion?: string, needContent?: boolean}} args - search arguments.
	 * @returns {Promise<Array<Record<string, any>>>} raw result objects.
	 */
	async search(args) {
		const body = { query: args.query, count: args.count };
		if (args.oriQuestion) body.ori_question = args.oriQuestion;
		if (args.needContent) body.need_content = true;
		const data = await this.request("/v1/tools/search", body);
		return Array.isArray(data?.results) ? data.results : [];
	}

	/**
	 * Fetch one page as Markdown.
	 *
	 * @param {string} url - http(s) URL.
	 * @returns {Promise<{title: string, content: string}>} page title and body.
	 */
	async fetchPage(url) {
		const data = await this.request("/v1/tools/fetch", { url });
		return { title: String(data?.title ?? ""), content: String(data?.content ?? "") };
	}
}

/**
 * Pull `error.message` out of an OpenAI-shaped error body.
 *
 * @param {string} text - raw response body.
 * @returns {string} message, or "" when unparseable.
 */
function parseErrorMessage(text) {
	try {
		return String(JSON.parse(text)?.error?.message ?? "");
	} catch {
		return "";
	}
}

/**
 * @param {number} ms - delay.
 * @returns {Promise<void>} resolves after the delay.
 */
function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
