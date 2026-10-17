/**
 * Client tests: request shape, retry policy, error translation.
 *
 * These never touch the network — `fetchImpl` is injected.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { SearchClient, SearchClientError } from "../lib/client.js";

/**
 * Build a fake fetch that replays canned responses and records calls.
 *
 * @param {Array<{status?: number, body?: string}>} replies - replies in order; the last one repeats.
 * @returns {{fetchImpl: Function, calls: Array<Record<string, any>>}} fake transport.
 */
function fakeFetch(replies) {
	const calls = [];
	const fetchImpl = async (url, init) => {
		calls.push({ url, ...init, json: JSON.parse(init.body) });
		const reply = replies[Math.min(calls.length - 1, replies.length - 1)];
		const status = reply.status ?? 200;
		return { ok: status >= 200 && status < 300, status, text: async () => reply.body ?? "{}" };
	};
	return { fetchImpl, calls };
}

const KEY = { DEEPSEEK_API_KEY: "sk-test-key" };

test("search sends the documented body and parses results", async () => {
	const body = JSON.stringify({ results: [{ title: "t", url: "https://e.com", rerank_score: 2 }] });
	const { fetchImpl, calls } = fakeFetch([{ body }]);
	const client = new SearchClient({ baseUrl: "https://api.deepseek.com", fetchImpl, apiKey: "sk-explicit" });

	const results = await client.search({ query: "q", count: 3, oriQuestion: "orig", needContent: true });

	assert.equal(calls[0].url, "https://api.deepseek.com/v1/tools/search");
	assert.equal(calls[0].method, "POST");
	assert.equal(calls[0].headers.Authorization, "Bearer sk-explicit");
	assert.deepEqual(calls[0].json, { query: "q", count: 3, ori_question: "orig", need_content: true });
	assert.equal(results.length, 1);
	assert.equal(results[0].rerank_score, 2);
});

test("search omits optional fields when unused", async () => {
	const { fetchImpl, calls } = fakeFetch([{ body: JSON.stringify({ results: [] }) }]);
	const client = new SearchClient({ baseUrl: "https://api.deepseek.com", fetchImpl, apiKey: "sk" });
	await client.search({ query: "q", count: 1 });
	assert.deepEqual(calls[0].json, { query: "q", count: 1 });
});

test("a missing results array degrades to an empty list", async () => {
	const { fetchImpl } = fakeFetch([{ body: JSON.stringify({}) }]);
	const client = new SearchClient({ baseUrl: "https://api.deepseek.com", fetchImpl, apiKey: "sk" });
	assert.deepEqual(await client.search({ query: "q", count: 1 }), []);
});

test("fetchPage returns title and markdown body", async () => {
	const body = JSON.stringify({ title: "Page", content: "# hi\n\ntext" });
	const { fetchImpl, calls } = fakeFetch([{ body }]);
	const client = new SearchClient({ baseUrl: "https://api.deepseek.com", fetchImpl, apiKey: "sk" });

	const page = await client.fetchPage("https://e.com/a");

	assert.equal(calls[0].url, "https://api.deepseek.com/v1/tools/fetch");
	assert.deepEqual(calls[0].json, { url: "https://e.com/a" });
	assert.deepEqual(page, { title: "Page", content: "# hi\n\ntext" });
});

test("a non-retryable status fails once, with the API message and a hint", async () => {
	const body = JSON.stringify({ error: { message: "'count' must be between 1 and 50" } });
	const { fetchImpl, calls } = fakeFetch([{ status: 400, body }]);
	const client = new SearchClient({ baseUrl: "https://api.deepseek.com", fetchImpl, apiKey: "sk" });

	await assert.rejects(
		() => client.search({ query: "q", count: 99 }),
		(error) => error instanceof SearchClientError && /count.*1 and 50/.test(error.message) && error.status === 400 && error.hint.includes("1~50"),
	);
	assert.equal(calls.length, 1, "400 must not be retried");
});

test("a retryable status is retried and then succeeds", async () => {
	const { fetchImpl, calls } = fakeFetch([
		{ status: 429, body: JSON.stringify({ error: { message: "rate limited" } }) },
		{ status: 503, body: "busy" },
		{ body: JSON.stringify({ results: [{ title: "ok" }] }) },
	]);
	const client = new SearchClient({ baseUrl: "https://api.deepseek.com", fetchImpl, apiKey: "sk", maxRetries: 2 });

	const results = await client.search({ query: "q", count: 1 });

	assert.equal(calls.length, 3);
	assert.equal(results[0].title, "ok");
});

test("exhausted retries surface the last failure", async () => {
	const { fetchImpl, calls } = fakeFetch([{ status: 429, body: JSON.stringify({ error: { message: "slow down" } }) }]);
	const client = new SearchClient({ baseUrl: "https://api.deepseek.com", fetchImpl, apiKey: "sk", maxRetries: 1 });

	await assert.rejects(() => client.search({ query: "q", count: 1 }), /slow down.*HTTP 429/s);
	assert.equal(calls.length, 2, "1 attempt + 1 retry");
});

test("missing key fails loudly before any request", async () => {
	const { fetchImpl, calls } = fakeFetch([{ body: "{}" }]);
	const client = new SearchClient({
		baseUrl: "https://api.deepseek.com",
		fetchImpl,
		keyResolver: () => ({ key: "", source: "missing" }),
	});

	await assert.rejects(() => client.search({ query: "q", count: 1 }), /找不到 API Key/);
	assert.equal(calls.length, 0);
});

test("env var supplies the key when config leaves it blank", async () => {
	const { fetchImpl, calls } = fakeFetch([{ body: JSON.stringify({ results: [] }) }]);
	const client = new SearchClient({ baseUrl: "https://api.deepseek.com", fetchImpl });
	const saved = process.env.DEEPSEEK_API_KEY;
	process.env.DEEPSEEK_API_KEY = "sk-from-env";

	try {
		await client.search({ query: "q", count: 1 });
		assert.equal(calls[0].headers.Authorization, "Bearer sk-from-env");
		assert.equal(client.keyInfo().source, `env DEEPSEEK_API_KEY`);
	} finally {
		if (saved === undefined) delete process.env.DEEPSEEK_API_KEY;
		else process.env.DEEPSEEK_API_KEY = saved;
	}
});

test("the origin is normalized and the URL joined once", async () => {
	const { fetchImpl, calls } = fakeFetch([{ body: JSON.stringify({ results: [] }) }]);
	const client = new SearchClient({ baseUrl: "https://api.deepseek.com/", fetchImpl, apiKey: KEY.DEEPSEEK_API_KEY });
	await client.search({ query: "q", count: 1 });
	assert.equal(calls[0].url, "https://api.deepseek.com/v1/tools/search");
});
