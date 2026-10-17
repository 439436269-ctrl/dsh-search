/**
 * Helpers every tool file shares: argument clamping, error surfacing, and the
 * "this argument must be a non-blank string" guard.
 *
 * @module dsh-search/tools
 */

/**
 * Clamp a numeric argument into range.
 *
 * @param {unknown} value - candidate value.
 * @param {number} fallback - default when absent or non-numeric.
 * @param {number} min - lower bound.
 * @param {number} max - upper bound.
 * @returns {number} clamped integer.
 */
export function clampInt(value, fallback, min, max) {
	const numeric = Number(value);
	if (!Number.isFinite(numeric)) return fallback;
	return Math.min(Math.max(Math.trunc(numeric), min), max);
}

/**
 * Require a non-blank string argument.
 *
 * @param {unknown} value - candidate value.
 * @param {string} field - argument name, for the error message.
 * @returns {string} trimmed value.
 * @throws {Error} when the value is missing or blank.
 */
export function requireText(value, field) {
	const text = String(value ?? "").trim();
	if (text === "") throw new Error(`deepseek-search: \`${field}\` 不能为空`);
	return text;
}

/**
 * Wrap a tool body so client failures carry their actionable hint.
 *
 * @param {() => Promise<any>} body - tool body.
 * @returns {Promise<any>} body result.
 */
export async function guarded(body) {
	try {
		return await body();
	} catch (error) {
		const hint = /** @type {{hint?: string}} */ (error)?.hint;
		if (hint) throw new Error(`${error.message} — ${hint}`);
		throw error;
	}
}
