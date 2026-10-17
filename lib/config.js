/**
 * Plugin configuration: the schema the host validates against, the code-side
 * defaults (so direct construction works without the loader), and the bounds
 * check that fails at load time instead of at the first tool call.
 *
 * @module dsh-search/config
 */

import z from "@deepseek-ai/schemastery";

/**
 * Code-side defaults.
 *
 * The Cordis loader already applies `Config`'s defaults, but `apply` is also
 * reachable through direct construction (tests, tooling), so the plugin
 * resolves its own defaults instead of trusting the caller.
 *
 * @type {Record<string, any>}
 */
const DEFAULTS = Object.freeze({
	apiKey: "",
	baseUrl: "https://api.deepseek.com",
	defaultCount: 5,
	maxContentChars: 8_000,
	fetchMaxChars: 20_000,
	timeoutMs: 30_000,
	maxRetries: 2,
	promptEnabled: true,
	promptOrder: 55,
});

export const Config = z.object({
	/** Explicit API key; empty means resolve from env / secrets files at call time. */
	apiKey: z.string().default(""),
	/** API origin. Point it elsewhere only for a compatible proxy. */
	baseUrl: z.string().default("https://api.deepseek.com"),
	/** Result count when the tool call omits `count`. */
	defaultCount: z.natural().default(5),
	/** Per-result ceiling for `content` returned by `deepseek_search`. */
	maxContentChars: z.natural().default(8_000),
	/** Ceiling for the Markdown returned by `deepseek_fetch`. */
	fetchMaxChars: z.natural().default(20_000),
	/** Per-request timeout in milliseconds. */
	timeoutMs: z.natural().default(30_000),
	/** Retries for 408 / 429 / 5xx responses. */
	maxRetries: z.natural().default(2),
	/** Whether to contribute the search guide to the system prompt. */
	promptEnabled: z.boolean().default(true),
	/** Ordering of that section. */
	promptOrder: z.natural().default(55),
});

/**
 * Merge caller config over the defaults, ignoring explicit `undefined`.
 *
 * @param {Record<string, any>|undefined} config - caller config.
 * @returns {Record<string, any>} effective config.
 */
export function resolveConfig(config) {
	const given = Object.fromEntries(Object.entries(config ?? {}).filter(([, value]) => value !== undefined));
	return { ...DEFAULTS, ...given };
}

/**
 * Reject unusable configuration at load time instead of at the first tool call.
 *
 * @param {Record<string, any>} config - schema-validated config.
 * @throws {Error} when a bound is not a positive integer or an origin is malformed.
 */
export function validateConfig(config) {
	const bounds = [
		["defaultCount", config.defaultCount, 1],
		["maxContentChars", config.maxContentChars, 200],
		["fetchMaxChars", config.fetchMaxChars, 500],
		["timeoutMs", config.timeoutMs, 1_000],
		["maxRetries", config.maxRetries, 0],
		["promptOrder", config.promptOrder, 0],
	];
	for (const [field, value, min] of bounds) {
		if (!Number.isInteger(value) || value < min) {
			throw new Error(`deepseek-search: 配置项 ${field}=${value} 必须是 >= ${min} 的整数`);
		}
	}
	if (!/^https?:\/\//.test(config.baseUrl)) {
		throw new Error(`deepseek-search: baseUrl 必须以 http:// 或 https:// 开头（当前 ${config.baseUrl}）`);
	}
	if (config.defaultCount > 50) {
		throw new Error(`deepseek-search: defaultCount=${config.defaultCount} 超出接口上限 50`);
	}
}
