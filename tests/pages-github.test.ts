import { strict as assert } from "node:assert";
import { test } from "node:test";
import { pollDeviceToken, requestDeviceCode } from "../lib/pages/github-auth.ts";
import { createGitHubClient, gitBlobSha, mapGitHubError, PagesError } from "../lib/pages/github-api.ts";
import { pagesUrlFor, repoNameFor, shareUrlFor } from "../lib/pages/repo-name.ts";

// ---------------------------------------------------------------------------------------------------
// test doubles: an injected fetch that records requests and answers from a script

interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}
type Answer = { status: number; json?: unknown } | Error;

function fakeFetch(answers: Answer[]) {
  const calls: Recorded[] = [];
  const fetchImpl = async (url: string, init?: RequestInit): Promise<Response> => {
    const raw = init?.body;
    let body: unknown = raw;
    if (typeof raw === "string") {
      try {
        body = JSON.parse(raw);
      } catch {
        body = Object.fromEntries(new URLSearchParams(raw));
      }
    }
    calls.push({ url, method: init?.method ?? "GET", headers: { ...(init?.headers as Record<string, string>) }, body });
    const a = answers.shift();
    if (!a) throw new Error(`unexpected request ${url}`);
    if (a instanceof Error) throw a;
    return new Response(JSON.stringify(a.json ?? {}), { status: a.status, headers: { "Content-Type": "application/json" } });
  };
  return { fetchImpl, calls };
}

const CODE = { deviceCode: "dev-1", interval: 5, expiresAt: 10_000 };
const now = () => 1_000;

// ---------------------------------------------------------------------------------------------------
// device flow

test("requestDeviceCode asks for the repo scope with Accept: application/json", async () => {
  const { fetchImpl, calls } = fakeFetch([{ status: 200, json: { device_code: "d", user_code: "ABCD-1234", verification_uri: "https://github.com/login/device", interval: 5, expires_in: 900 } }]);
  const code = await requestDeviceCode(fetchImpl, "client-1", now);
  assert.equal(calls[0].url, "https://github.com/login/device/code");
  assert.equal(calls[0].headers.Accept, "application/json");
  assert.deepEqual(calls[0].body, { client_id: "client-1", scope: "repo" });
  assert.deepEqual(code, { deviceCode: "d", userCode: "ABCD-1234", verificationUri: "https://github.com/login/device", interval: 5, expiresAt: 901_000 });
});

test("requestDeviceCode refuses without a client id (feature not switched on in this build)", async () => {
  const { fetchImpl, calls } = fakeFetch([]);
  await assert.rejects(requestDeviceCode(fetchImpl, "", now), (e: unknown) => e instanceof PagesError && e.code === "GITHUB_UNAVAILABLE");
  assert.equal(calls.length, 0);
});

test("pollDeviceToken: pending keeps the interval, slow_down raises it by 5 s", async () => {
  const { fetchImpl, calls } = fakeFetch([{ status: 200, json: { error: "authorization_pending" } }, { status: 200, json: { error: "slow_down", interval: 10 } }]);
  assert.deepEqual(await pollDeviceToken(CODE, fetchImpl, "client-1", now), { status: "pending", interval: 5 });
  assert.deepEqual(await pollDeviceToken(CODE, fetchImpl, "client-1", now), { status: "pending", interval: 10 });
  assert.equal(calls[0].url, "https://github.com/login/oauth/access_token");
  assert.deepEqual(calls[0].body, { client_id: "client-1", device_code: "dev-1", grant_type: "urn:ietf:params:oauth:grant-type:device_code" });
});

test("pollDeviceToken: success, expired, denied, network error, and a dead code is never sent", async () => {
  const { fetchImpl, calls } = fakeFetch([
    { status: 200, json: { access_token: "gho_x", token_type: "bearer", scope: "repo" } },
    { status: 200, json: { error: "expired_token" } },
    { status: 200, json: { error: "access_denied" } },
    new Error("offline"),
  ]);
  assert.deepEqual(await pollDeviceToken(CODE, fetchImpl, "c", now), { status: "ok", token: "gho_x" });
  assert.deepEqual(await pollDeviceToken(CODE, fetchImpl, "c", now), { status: "expired" });
  assert.deepEqual(await pollDeviceToken(CODE, fetchImpl, "c", now), { status: "denied" });
  assert.equal((await pollDeviceToken(CODE, fetchImpl, "c", now)).status, "error");
  assert.deepEqual(await pollDeviceToken(CODE, fetchImpl, "c", () => 10_000), { status: "expired" });
  assert.equal(calls.length, 4, "an expired code is not polled");
});

// ---------------------------------------------------------------------------------------------------
// repo name / urls

test("repoNameFor: ASCII slug, Thai names fall back to the id, re-publish reuses the stored repo", () => {
  const base = { id: "a1b2c3d4-e5f6-7890", pages: null };
  assert.equal(repoNameFor({ ...base, name: "Stock Tracker  v2!" }), "easygas-stock-tracker-v2");
  assert.equal(repoNameFor({ ...base, name: "ระบบนับสต็อก" }), "easygas-a1b2c3d4");
  assert.equal(repoNameFor({ ...base, name: "Café Ménu" }), "easygas-cafe-menu");
  assert.equal(repoNameFor({ ...base, name: "x".repeat(80) }).length, "easygas-".length + 40);
  assert.equal(repoNameFor({ ...base, name: "New", pages: { repo: "easygas-old", url: "", published_at: "" } }), "easygas-old");
  assert.equal(pagesUrlFor("Somchai", "easygas-shop"), "https://somchai.github.io/easygas-shop/");
  assert.equal(shareUrlFor("https://somchai.github.io/easygas-shop/"), "https://somchai.github.io/easygas-shop/?openExternalBrowser=1");
});

// ---------------------------------------------------------------------------------------------------
// REST client request shapes

const HEADERS = { Accept: "application/vnd.github+json", Authorization: "Bearer tok", "X-GitHub-Api-Version": "2022-11-28" };

test("createRepo: public, auto_init, with the common headers", async () => {
  const { fetchImpl, calls } = fakeFetch([{ status: 201, json: { name: "easygas-x", full_name: "u/easygas-x", html_url: "", default_branch: "main" } }]);
  const repo = await createGitHubClient("tok", fetchImpl).createRepo("easygas-x", "desc");
  assert.equal(repo.name, "easygas-x");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].url, "https://api.github.com/user/repos");
  assert.deepEqual(calls[0].body, { name: "easygas-x", private: false, auto_init: true, description: "desc" });
  for (const [k, v] of Object.entries(HEADERS)) assert.equal(calls[0].headers[k], v);
});

test("putFile: base64 content, sha only when updating", async () => {
  const { fetchImpl, calls } = fakeFetch([{ status: 201 }, { status: 200 }]);
  const gh = createGitHubClient("tok", fetchImpl);
  await gh.putFile("u", "r", "index.html", "<h1>สวัสดี</h1>", "publish", null);
  await gh.putFile("u", "r", ".nojekyll", "", "publish", "abc123");
  assert.equal(calls[0].method, "PUT");
  assert.equal(calls[0].url, "https://api.github.com/repos/u/r/contents/index.html");
  assert.deepEqual(calls[0].body, { message: "publish", content: Buffer.from("<h1>สวัสดี</h1>", "utf8").toString("base64") });
  assert.deepEqual(calls[1].body, { message: "publish", content: "", sha: "abc123" });
});

test("getFileSha: null for a new file, the sha for an existing one", async () => {
  const { fetchImpl } = fakeFetch([{ status: 404 }, { status: 200, json: { sha: "s1" } }]);
  const gh = createGitHubClient("tok", fetchImpl);
  assert.equal(await gh.getFileSha("u", "r", "index.html"), null);
  assert.equal(await gh.getFileSha("u", "r", "index.html"), "s1");
});

test("enablePages: main branch at root; 409 (already enabled) is fine; other errors throw", async () => {
  const { fetchImpl, calls } = fakeFetch([{ status: 201 }, { status: 409 }, { status: 401 }]);
  const gh = createGitHubClient("tok", fetchImpl);
  await gh.enablePages("u", "r");
  await gh.enablePages("u", "r");
  assert.equal(calls[0].url, "https://api.github.com/repos/u/r/pages");
  assert.deepEqual(calls[0].body, { source: { branch: "main", path: "/" } });
  await assert.rejects(gh.enablePages("u", "r"), (e: unknown) => e instanceof PagesError && e.code === "GITHUB_REAUTH");
});

test("waitForPagesBuild: polls until built, times out without throwing, errored build throws", async () => {
  const { fetchImpl, calls } = fakeFetch([{ status: 200, json: { status: "building" } }, { status: 404 }, { status: 200, json: { status: "built" } }]);
  let t = 0;
  const opts = { sleep: async (ms: number) => void (t += ms), now: () => t, pollMs: 1000, timeoutMs: 10_000 };
  const gh = createGitHubClient("tok", fetchImpl);
  assert.equal(await gh.waitForPagesBuild("u", "r", opts), "built");
  assert.equal(calls.length, 3);
  assert.equal(calls[0].url, "https://api.github.com/repos/u/r/pages/builds/latest");

  const slow = fakeFetch(Array.from({ length: 20 }, () => ({ status: 200, json: { status: "queued" } })));
  t = 0;
  assert.equal(await createGitHubClient("tok", slow.fetchImpl).waitForPagesBuild("u", "r", { ...opts, timeoutMs: 3000 }), "timeout");
  assert.equal(slow.calls.length, 3);

  const bad = fakeFetch([{ status: 200, json: { status: "errored", error: { message: "boom" } } }]);
  await assert.rejects(createGitHubClient("tok", bad.fetchImpl).waitForPagesBuild("u", "r", opts), /boom/);
});

test("waitForPagesBuild with a commit ignores the cancelled build of an earlier upload", async () => {
  // seen live: two uploads = two commits; GitHub cancels the first build ("errored") and builds the second
  const { fetchImpl, calls } = fakeFetch([
    { status: 200, json: { status: "errored", error: { message: "Page build failed." }, commit: "aaa" } },
    { status: 200, json: { status: "building", commit: "bbb" } },
    { status: 200, json: { status: "built", commit: "bbb" } },
  ]);
  let t = 0;
  const opts = { commit: "bbb", sleep: async (ms: number) => void (t += ms), now: () => t, pollMs: 1000, timeoutMs: 10_000 };
  assert.equal(await createGitHubClient("tok", fetchImpl).waitForPagesBuild("u", "r", opts), "built");
  assert.equal(calls.length, 3);
});

test("gitBlobSha matches git's blob hash (what the contents API reports)", () => {
  // `git hash-object` of an empty file and of "hello\n"
  assert.equal(gitBlobSha(""), "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391");
  assert.equal(gitBlobSha("hello\n"), "ce013625030ba8dba906f756967f9e9ca394464a");
});

// ---------------------------------------------------------------------------------------------------
// error mapping

test("mapGitHubError: 401 reconnect, 403 rate limit, 422 name taken (repo only), network", async () => {
  assert.equal(mapGitHubError(401).code, "GITHUB_REAUTH");
  assert.equal(mapGitHubError(403).code, "GITHUB_RATE_LIMIT");
  assert.equal(mapGitHubError(422, "repo").code, "GITHUB_NAME_TAKEN");
  assert.equal(mapGitHubError(422).code, "GITHUB_API");
  assert.match(mapGitHubError(500).message, /500/);
  for (const e of [401, 403, 422, 500].map((s) => mapGitHubError(s, "repo"))) assert.match(e.message, /[฀-๿]/, "Thai message");
  const { fetchImpl } = fakeFetch([new Error("ENOTFOUND")]);
  await assert.rejects(createGitHubClient("tok", fetchImpl).currentUser(), (e: unknown) => e instanceof PagesError && e.code === "NETWORK");
});
