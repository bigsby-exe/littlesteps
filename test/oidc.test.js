import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import * as oidc from "openid-client";
import { generateKeyPair, exportJWK, SignJWT, base64url } from "jose";
import { createHash } from "node:crypto";
import { createApp } from "../src/server.js";
import { openStore } from "../src/store.js";

// Real discovery, token exchange, signature, PKCE, state and nonce validation
// against a local identity provider. No live credentials are involved.
test("OIDC signs in only the allowed subject and rejects tampered state and nonce", async (t) => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  Object.assign(jwk, { kid: "test-key", alg: "RS256", use: "sig" });
  const codes = new Map();
  let subject = "laura",
    badNonce = false;
  const provider = express();
  provider.use(express.urlencoded({ extended: false }));
  const issuerServer = provider.listen(0, "127.0.0.1");
  await once(issuerServer, "listening");
  const issuer = `http://127.0.0.1:${issuerServer.address().port}`;
  provider.get("/.well-known/openid-configuration", (_req, res) =>
    res.json({
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      jwks_uri: `${issuer}/jwks`,
      response_types_supported: ["code"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["RS256"],
      token_endpoint_auth_methods_supported: ["client_secret_post"],
      code_challenge_methods_supported: ["S256"],
    }),
  );
  provider.get("/jwks", (_req, res) => res.json({ keys: [jwk] }));
  provider.post("/token", async (req, res) => {
    const flow = codes.get(req.body.code);
    codes.delete(req.body.code);
    const challenge = base64url.encode(
      createHash("sha256")
        .update(req.body.code_verifier || "")
        .digest(),
    );
    if (
      !flow ||
      flow.challenge !== challenge ||
      req.body.client_id !== "test-client" ||
      req.body.client_secret !== "test-secret"
    )
      return res.status(400).json({ error: "invalid_grant" });
    const idToken = await new SignJWT({ nonce: flow.nonce })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer(issuer)
      .setSubject(flow.subject)
      .setAudience("test-client")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
    res.json({
      access_token: "fixture-access-token",
      token_type: "Bearer",
      expires_in: 300,
      id_token: idToken,
    });
  });
  const client = await oidc.discovery(
    new URL(issuer),
    "test-client",
    "test-secret",
    undefined,
    { execute: [oidc.allowInsecureRequests] },
  );
  const store = openStore(":memory:");
  const config = {
    development: false,
    baseUrl: "https://laura.example.com",
    allowedSubject: "laura",
  };
  const server = createApp(config, store, {
    getOidc: async () => client,
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    server.closeAllConnections();
    server.close();
    issuerServer.closeAllConnections();
    issuerServer.close();
    store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function signIn({ tamperState = false } = {}) {
    const login = await fetch(`${base}/auth/login`, { redirect: "manual" });
    assert.equal(login.status, 302);
    const cookieHeader = login.headers.get("set-cookie");
    assert.match(cookieHeader, /HttpOnly/);
    assert.match(cookieHeader, /Secure/);
    assert.match(cookieHeader, /SameSite=Lax/);
    const cookie = cookieHeader.split(";")[0],
      url = new URL(login.headers.get("location"));
    assert.equal(
      url.searchParams.get("redirect_uri"),
      `${config.baseUrl}/auth/callback`,
    );
    const code = `code-${Math.random()}`;
    codes.set(code, {
      challenge: url.searchParams.get("code_challenge"),
      nonce: badNonce ? "wrong-nonce" : url.searchParams.get("nonce"),
      subject,
    });
    return fetch(
      `${base}/auth/callback?code=${code}&state=${tamperState ? "wrong-state" : url.searchParams.get("state")}`,
      { headers: { Cookie: cookie }, redirect: "manual" },
    );
  }
  const success = await signIn();
  assert.equal(success.status, 302);
  const sessionCookie = success.headers
    .getSetCookie()
    .find((c) => c.startsWith("__Host-little_steps="))
    .split(";")[0];
  assert.equal(
    (await fetch(`${base}/api/state`, { headers: { Cookie: sessionCookie } }))
      .status,
    200,
  );
  subject = "someone-else";
  assert.equal((await signIn()).status, 403);
  subject = "laura";
  assert.equal((await signIn({ tamperState: true })).status, 400);
  badNonce = true;
  assert.equal((await signIn()).status, 400);
});
