import express from "express";
import * as oidc from "openid-client";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { openStore, token } from "./store.js";
import { dateKey, InputError } from "./domain.js";

export function configFromEnv(env = process.env) {
  const development = env.APP_ENV === "development";
  const port = Number(env.PORT || 3000);
  const baseUrl = new URL(env.APP_URL || `http://localhost:${port}`);
  if (
    !["http:", "https:"].includes(baseUrl.protocol) ||
    baseUrl.pathname !== "/" ||
    baseUrl.search ||
    baseUrl.hash ||
    baseUrl.username ||
    baseUrl.password
  )
    throw new Error(
      "APP_URL must be an origin without a path, query, or credentials.",
    );
  if (
    development &&
    !["localhost", "127.0.0.1", "[::1]"].includes(baseUrl.hostname)
  )
    throw new Error("Development mode only supports a loopback APP_URL.");
  if (!development) {
    for (const key of [
      "APP_URL",
      "OIDC_ISSUER",
      "OIDC_CLIENT_ID",
      "OIDC_CLIENT_SECRET",
      "ALLOWED_SUBJECT",
    ])
      if (!env[key]) throw new Error(`${key} is required in production.`);
    if (
      baseUrl.protocol !== "https:" ||
      new URL(env.OIDC_ISSUER).protocol !== "https:"
    )
      throw new Error("Production APP_URL and OIDC_ISSUER must use HTTPS.");
  }
  return {
    development,
    port,
    baseUrl: baseUrl.origin,
    dbPath: env.DATABASE_PATH || "./data/laura.sqlite",
    issuer: env.OIDC_ISSUER,
    clientId: env.OIDC_CLIENT_ID,
    clientSecret: env.OIDC_CLIENT_SECRET,
    allowedSubject: env.ALLOWED_SUBJECT,
  };
}

function cookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .map((v) => v.trim().split("="))
      .filter((v) => v.length === 2),
  );
}
export function createApp(
  config,
  store,
  { getOidc, now = () => new Date() } = {},
) {
  const app = express();
  app.disable("x-powered-by");
  let oidcPromise;
  const discovery =
    getOidc ||
    (() => {
      oidcPromise ||= oidc
        .discovery(new URL(config.issuer), config.clientId, config.clientSecret)
        .catch((e) => {
          oidcPromise = null;
          throw e;
        });
      return oidcPromise;
    });
  const sessionName = config.development
    ? "little_steps"
    : "__Host-little_steps";
  const flowName = config.development
    ? "little_steps_login"
    : "__Host-little_steps_login";
  const cookieOptions = {
    httpOnly: true,
    secure: !config.development,
    sameSite: "lax",
    path: "/",
  };
  app.use((req, res, next) => {
    res.set({
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Cache-Control": "no-store",
    });
    if (!config.development)
      res.set("Strict-Transport-Security", "max-age=31536000");
    if (
      config.development &&
      (req.headers.host !== new URL(config.baseUrl).host ||
        !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
          req.socket.remoteAddress,
        ))
    )
      return res.status(403).send("Development is available on loopback only.");
    next();
  });
  app.use(express.json({ limit: "16kb" }));
  app.get("/healthz", (_req, res) => {
    store.db.prepare("SELECT 1").get();
    res.json({ ok: true });
  });
  app.get("/auth/login", async (req, res) => {
    if (config.development) return res.redirect("/");
    const old = cookies(req)[flowName];
    store.deleteSession(old);
    const client = await discovery();
    const verifier = oidc.randomPKCECodeVerifier(),
      state = oidc.randomState(),
      nonce = oidc.randomNonce();
    const flow = store.createSession(
      { verifier, state, nonce, type: "login" },
      10 * 60000,
    );
    res.cookie(flowName, flow, { ...cookieOptions, maxAge: 10 * 60000 });
    res.redirect(
      oidc.buildAuthorizationUrl(client, {
        redirect_uri: `${config.baseUrl}/auth/callback`,
        scope: "openid profile",
        state,
        nonce,
        code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
        code_challenge_method: "S256",
      }).href,
    );
  });
  app.get("/auth/callback", async (req, res) => {
    if (config.development) return res.redirect("/");
    const id = cookies(req)[flowName],
      flow = store.session(id);
    store.deleteSession(id);
    res.clearCookie(flowName, cookieOptions);
    if (!flow || flow.type !== "login")
      return res
        .status(400)
        .send("Sign-in expired. Please return to the app and try again.");
    try {
      const client = await discovery();
      const tokens = await oidc.authorizationCodeGrant(
        client,
        new URL(req.originalUrl, config.baseUrl),
        {
          pkceCodeVerifier: flow.verifier,
          expectedState: flow.state,
          expectedNonce: flow.nonce,
          idTokenExpected: true,
        },
      );
      const claims = tokens.claims();
      if (!claims || claims.sub !== config.allowedSubject)
        return res
          .status(403)
          .send(
            "This little space belongs to Laura. Please sign in with her account.",
          );
      store.deleteSession(cookies(req)[sessionName]);
      const session = store.createSession({
        subject: claims.sub,
        csrf: token(),
        type: "user",
      });
      res.cookie(sessionName, session, {
        ...cookieOptions,
        maxAge: 7 * 86400000,
      });
      res.redirect("/");
    } catch (error) {
      console.error("OIDC sign-in failed:", error.code || error.name);
      res
        .status(400)
        .send(
          "Sign-in could not be completed. Please return to the app and try again.",
        );
    }
  });
  app.use("/api", (req, res, next) => {
    let session = store.session(cookies(req)[sessionName]);
    if (config.development && !session) {
      session = { subject: "local-preview", csrf: token(), type: "user" };
      res.cookie(sessionName, store.createSession(session), {
        ...cookieOptions,
        maxAge: 7 * 86400000,
      });
    }
    if (
      !session ||
      session.type !== "user" ||
      (!config.development && session.subject !== config.allowedSubject)
    )
      return res
        .status(401)
        .json({ error: "Please sign in to your little space." });
    if (
      req.method !== "GET" &&
      (req.headers.origin !== config.baseUrl ||
        req.headers["x-csrf-token"] !== session.csrf ||
        !req.is("application/json"))
    )
      return res
        .status(403)
        .json({ error: "Please refresh the page before trying again." });
    req.session = session;
    next();
  });
  app.get("/api/state", (req, res) =>
    res.json({
      ...store.read(req.session.subject, dateKey(now())),
      csrf: req.session.csrf,
      development: config.development,
    }),
  );
  app.post("/api/action", (req, res) => {
    const { revision, action } = req.body || {};
    res.json(
      store.mutate(req.session.subject, dateKey(now()), revision, action),
    );
  });
  app.post("/api/undo", (req, res) =>
    res.json(
      store.undo(
        req.session.subject,
        dateKey(now()),
        req.body?.revision,
        req.body?.undoToken,
      ),
    ),
  );
  app.post("/api/logout", (req, res) => {
    store.deleteSession(cookies(req)[sessionName]);
    res.clearCookie(sessionName, cookieOptions);
    res.json({ ok: true });
  });
  app.use("/api", (_req, res) => res.status(404).json({ error: "Not found." }));
  app.use(
    express.static(fileURLToPath(new URL("../public", import.meta.url)), {
      etag: true,
    }),
  );
  app.use((error, req, res, _next) => {
    const status =
      error instanceof InputError
        ? error.status
        : error.type === "entity.parse.failed"
          ? 400
          : error.status === 413
            ? 413
            : 500;
    if (status === 500) console.error("Request failed:", error.name);
    const message =
      status === 500
        ? "Something went wrong saving your changes. Please try again."
        : status === 413
          ? "That request is too large."
          : error.type === "entity.parse.failed"
            ? "Invalid request."
            : error.message;
    if (req.path.startsWith("/api/"))
      res.status(status).json({ error: message });
    else res.status(status).send("Unable to open this page. Please try again.");
  });
  return app;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const config = configFromEnv(),
    store = openStore(config.dbPath),
    app = createApp(config, store);
  const server = app.listen(
    config.port,
    config.development ? "127.0.0.1" : "0.0.0.0",
    () =>
      console.log(
        `Little Steps listening at ${config.baseUrl}${config.development ? " (local preview)" : ""}`,
      ),
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () =>
      server.close(() => {
        store.close();
        process.exit(0);
      }),
    );
}
