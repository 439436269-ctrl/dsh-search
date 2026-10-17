/**
 * Query assembly: turn the tool's structured arguments into one DeepSeek query
 * string, applying the operators the search backend understands.
 *
 * @module dsh-search/query
 */

/** Longest query the endpoint accepts. */
export const MAX_QUERY_CHARS = 128;

/**
 * Expand a site argument into `site:` clauses joined by OR.
 *
 * A caller may pass `github.com`, `github.com huggingface.co`, or
 * `github.com,huggingface.co`; a value that already carries an operator
 * (`site:`, a leading `-`, or an explicit `OR`) is passed through untouched.
 *
 * @param {string} site - raw argument.
 * @returns {string} clause(s) appended to the query.
 */
export function normalizeSite(site) {
	const raw = String(site ?? "").trim();
	if (raw === "") return "";
	if (/(^|\s)site:/.test(raw) || /^(?:-|\+|OR\b)/i.test(raw)) return raw;
	return raw
		.split(/[\s,]+/)
		.filter(Boolean)
		.map((host) => `site:${host}`)
		.join(" OR ");
}

/**
 * Build the final query string.
 *
 * @param {{query: string, site?: string, lang?: string, after?: string, before?: string}} args - tool arguments.
 * @returns {string} query with operators appended.
 * @throws {Error} when the query is blank or too long.
 */
export function buildQuery(args) {
	const base = String(args.query ?? "").trim();
	if (base === "") throw new Error("deepseek-search: `query` 不能为空");
	const parts = [base];
	const site = normalizeSite(args.site);
	if (site !== "") parts.push(site);
	if (args.lang) parts.push(`lang:${String(args.lang).trim()}`);
	if (args.after) parts.push(`after:${String(args.after).trim()}`);
	if (args.before) parts.push(`before:${String(args.before).trim()}`);
	const query = parts.join(" ").trim();
	if ([...query].length > MAX_QUERY_CHARS) {
		throw new Error(`deepseek-search: query 超长（${[...query].length} > ${MAX_QUERY_CHARS} 字符），请精简后重试`);
	}
	return query;
}
