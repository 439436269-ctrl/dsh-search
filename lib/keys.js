/**
 * API key resolution — three layers, in order, so no key ever lives in the
 * plugin's own config file:
 *
 *   1. `apiKey` from the plugin config (explicit opt-in)
 *   2. `$DEEPSEEK_API_KEY`
 *   3. `~/.secrets/keys.env`            (`DEEPSEEK_API_KEY=...`)
 *   4. `$DSH_HOME/.credentials.yaml`    (`refs: DEEPSEEK_API_KEY: sk-...`)
 *
 * @module dsh-search/keys
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Read one key out of a dotenv-style file.
 *
 * @param {string} file - absolute path.
 * @param {string} name - variable name.
 * @returns {string} the value, or "" when absent.
 */
function fromDotEnv(file, name) {
	if (!existsSync(file)) return "";
	const pattern = new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*(.+?)\\s*$`, "m");
	const match = readFileSync(file, "utf8").match(pattern);
	return match ? match[1].replace(/^["']|["']$/g, "").trim() : "";
}

/**
 * Read one key out of DSH's credentials store (`refs:` block).
 *
 * @param {string} file - absolute path.
 * @param {string} name - variable name.
 * @returns {string} the value, or "" when absent.
 */
function fromCredentials(file, name) {
	if (!existsSync(file)) return "";
	const pattern = new RegExp(`^\\s*${name}:\\s*(\\S+)\\s*$`, "m");
	const match = readFileSync(file, "utf8").match(pattern);
	return match ? match[1].replace(/^["']|["']$/g, "").trim() : "";
}

/**
 * Resolve the API key and report which layer answered.
 *
 * @param {{explicit?: string, env?: NodeJS.ProcessEnv, home?: string, dshHome?: string}} [options] - lookup overrides.
 * @returns {{key: string, source: string}} resolved key plus provenance.
 */
export function resolveApiKey(options = {}) {
	const env = options.env ?? process.env;
	const home = options.home ?? homedir();
	const dshHome = options.dshHome ?? env.DSH_HOME ?? join(home, ".dsh");
	const name = "DEEPSEEK_API_KEY";

	const explicit = String(options.explicit ?? "").trim();
	if (explicit !== "") return { key: explicit, source: "plugin config" };

	const fromEnv = String(env[name] ?? "").trim();
	if (fromEnv !== "") return { key: fromEnv, source: `env ${name}` };

	const dotenv = fromDotEnv(join(home, ".secrets", "keys.env"), name);
	if (dotenv !== "") return { key: dotenv, source: "~/.secrets/keys.env" };

	const cred = fromCredentials(join(dshHome, ".credentials.yaml"), name);
	if (cred !== "") return { key: cred, source: "~/.dsh/.credentials.yaml" };

	return { key: "", source: "missing" };
}
