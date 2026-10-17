/**
 * Presentation helpers: normalize one API result into the tool's output shape,
 * clip text, and render the plain-text card body the GUI shows.
 *
 * Keeping formatting here means every tool file stays a thin capability.
 *
 * @module dsh-search/format
 */

/** Score at or above this counts as a good hit (per the API docs). */
export const GOOD_SCORE = 1.5;

/** Authority at or above this counts as highly authoritative. */
export const STRONG_AUTHORITY = 3;

/**
 * Clip text to a character budget.
 *
 * @param {unknown} text - candidate text.
 * @param {number} max - character ceiling.
 * @returns {{text: string, truncated: boolean}} clipped text and whether it was cut.
 */
export function clip(text, max) {
	const value = String(text ?? "");
	if (value.length <= max) return { text: value, truncated: false };
	return { text: value.slice(0, max) + "\n…（已截断）", truncated: true };
}

/**
 * Normalize one raw search result.
 *
 * @param {Record<string, any>} raw - API result object.
 * @param {number} rank - 1-based position.
 * @param {{contentLimit?: number}} [options] - clipping options.
 * @returns {Record<string, any>} normalized result.
 */
export function normalizeResult(raw, rank, options = {}) {
	const content = clip(raw?.content ?? "", options.contentLimit ?? 0);
	return {
		rank,
		title: String(raw?.title ?? ""),
		url: String(raw?.url ?? ""),
		snippet: String(raw?.snippet ?? ""),
		summary: String(raw?.summary ?? ""),
		content: content.text,
		siteName: raw?.site_name == null ? "" : String(raw.site_name),
		date: raw?.date == null ? "" : String(raw.date),
		authority: Number.isInteger(raw?.authority) ? raw.authority : -1,
		rerankScore: Number.isFinite(raw?.rerank_score) ? Number(raw.rerank_score) : 0,
		good: Number(raw?.rerank_score ?? 0) >= GOOD_SCORE,
	};
}

/**
 * Format a score for display.
 *
 * @param {number} score - rerank score.
 * @returns {string} two-decimal score.
 */
export function fmtScore(score) {
	return Number(score ?? 0).toFixed(2);
}

/**
 * Format an RFC 3339 timestamp as a date.
 *
 * @param {string} iso - timestamp.
 * @returns {string} `YYYY-MM-DD`, or "—" when absent.
 */
export function fmtDate(iso) {
	return iso ? String(iso).slice(0, 10) : "—";
}

/**
 * One result as display lines.
 *
 * @param {Record<string, any>} result - normalized result.
 * @returns {string} multi-line block.
 */
export function resultBlock(result) {
	const head = `${result.good ? "★" : " "}[${result.rank}] ${result.title || "(无标题)"}`;
	const meta = `    ${fmtScore(result.rerankScore)} 分 · 权威 ${result.authority} · ${fmtDate(result.date)} · ${result.siteName || "—"}`;
	const body = result.summary || result.snippet;
	return [head, `    ${result.url}`, meta, body ? `    ${String(body).replace(/\n+/g, " ")}` : ""].filter(Boolean).join("\n");
}

/**
 * Render a search report body.
 *
 * @param {Record<string, any>} value - tool output.
 * @returns {string} card text.
 */
export function renderSearchReport(value) {
	if (value.results.length === 0) {
		return `query: ${value.query}\n没有匹配结果（本次请求不计费）。换个关键词，或用 site: / after: 收窄范围后重试。`;
	}
	const blocks = value.results.map(resultBlock).join("\n\n");
	return [
		`query: ${value.query}   命中 ${value.total} 条`,
		"",
		blocks,
		"",
		"★ = rerank ≥ 1.5 优质；正文用 deepseek_fetch <url> 取全文。",
	].join("\n");
}
