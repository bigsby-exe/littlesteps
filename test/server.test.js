import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createApp, configFromEnv } from "../src/server.js";
import { openStore } from "../src/store.js";

test("production refuses missing identity config and local preview cannot use a public URL", () => {
  assert.throws(() => configFromEnv({}), /APP_URL/);
  assert.throws(
    () =>
      configFromEnv({ APP_ENV: "development", APP_URL: "https://example.com" }),
    /loopback/,
  );
  assert.throws(
    () =>
      configFromEnv({
        APP_ENV: "development",
        APP_URL: "http://localhost:3000/secret",
      }),
    /origin/,
  );
});
test("private API rejects anonymous, wrong-user, cross-origin and missing-CSRF requests", async (t) => {
  const store = openStore(":memory:");
  const config = {
    development: false,
    baseUrl: "https://laura.example.com",
    allowedSubject: "laura",
  };
  const app = createApp(config, store, {
    now: () => new Date("2026-09-14T12:00:00Z"),
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    server.close();
    store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${base}/api/state`)).status, 401);
  const other = store.createSession({
    subject: "other",
    csrf: "csrf",
    type: "user",
  });
  assert.equal(
    (
      await fetch(`${base}/api/state`, {
        headers: { Cookie: `__Host-little_steps=${other}` },
      })
    ).status,
    401,
  );
  const cookie = `__Host-little_steps=${store.createSession({ subject: "laura", csrf: "csrf", type: "user" })}`;
  const read = await fetch(`${base}/api/state`, {
    headers: { Cookie: cookie },
  });
  assert.equal(read.status, 200);
  assert.equal(read.headers.get("cache-control"), "no-store");
  assert.ok(
    read.headers
      .get("content-security-policy")
      .includes("frame-ancestors 'none'"),
  );
  const state = await read.json();
  const body = JSON.stringify({
    revision: state.revision,
    action: { type: "complete", id: state.days[0].items[0].id },
  });
  const headers = { Cookie: cookie, "Content-Type": "application/json" };
  assert.equal(
    (await fetch(`${base}/api/action`, { method: "POST", headers, body }))
      .status,
    403,
  );
  assert.equal(
    (
      await fetch(`${base}/api/action`, {
        method: "POST",
        headers: {
          ...headers,
          Origin: "https://evil.example",
          "X-CSRF-Token": "csrf",
        },
        body,
      })
    ).status,
    403,
  );
  const saved = await fetch(`${base}/api/action`, {
    method: "POST",
    headers: { ...headers, Origin: config.baseUrl, "X-CSRF-Token": "csrf" },
    body,
  });
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).doneToday.length, 1);
  assert.equal((await fetch(`${base}/auth/callback?code=forged`)).status, 400);
  assert.equal(
    (
      await fetch(`${base}/api/logout`, {
        method: "POST",
        headers: { ...headers, Origin: config.baseUrl, "X-CSRF-Token": "csrf" },
        body: "{}",
      })
    ).status,
    200,
  );
  assert.equal(
    (await fetch(`${base}/api/state`, { headers: { Cookie: cookie } })).status,
    401,
  );
});
