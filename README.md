# Little Steps

Laura’s own little space for everyday chores: a mobile-first web app with an animated red panda, a repeating two-week routine, and gentle celebrations.

## Local preview

Requires Node.js 24 or newer.

```sh
npm ci
npm run dev
```

Open **http://localhost:3000**. Preview mode creates a local profile without Pocket ID, binds to loopback only, and refuses public hostnames. Do not tunnel preview mode. Changes are stored in `data/laura.sqlite`.

## What’s included

- Today and the next 14 days, with UK calendar dates and an editable Week A / Week B rotation.
- Editable chores; complete, move, skip, pause, remove, and undo the latest change.
- Laundry steps: Wash → Dry → Put away. Only the full cycle counts as a completed chore.
- One active occurrence per chore. Older missed occurrences are retired when the next one arrives. Started laundry and chores explicitly moved beyond the next scheduled day are preserved.
- Date invitations added in settings. While an invitation is waiting, every 10 full completions reveals the next one. Progress does not accumulate when no invitations are waiting. Earned invitations do not expire.
- Server-side SQLite storage, concurrent-tab protection, and server-backed sessions.
- Pocket ID through OpenID Connect, restricted to Laura’s immutable user subject.
- A locally bundled font and SVG companion; no analytics or third-party browser requests.
- Gentle animations, device reduced-motion support, and an in-app motion setting.

There are no push notifications or shared progress accounts in this version. The initial chores all use fixed calendar days; completion-relative recurrence is not needed by this starter routine and is not implemented.

## Docker and Cloudflare Tunnel

1. Copy `.env.example` to `.env` and fill in the values locally. Never commit this file.
2. In Pocket ID, create an OIDC client for Little Steps. Set its exact callback URL to:

   ```text
   https://YOUR-APP-HOSTNAME/auth/callback
   ```

   Enable the client for a group containing Laura. Configure `OIDC_ISSUER` with your Pocket ID issuer URL, and copy the client ID and secret into `.env`. Set `ALLOWED_SUBJECT` to Laura’s user ID (the `sub` claim), not her email or username. Pocket ID supports [restricting clients to allowed groups](https://pocket-id.org/docs/configuration/allowed-groups); the app additionally checks the subject on sign-in and every API request.

3. Start the application:

   ```sh
   docker compose up -d --build
   docker compose logs -f app
   ```

4. If your existing `cloudflared` runs **on the host**, route your public hostname to `http://127.0.0.1:3000`. Set `APP_URL` to that exact public HTTPS origin. Cloudflare documents this hostname-to-local-service mapping in [published application routing](https://developers.cloudflare.com/tunnel/concepts/routing/).
5. If `cloudflared` runs **in Docker**, attach it and this app to the same Docker network and route to `http://app:3000`. A container’s `localhost` is not the app container. You can remove the host `ports` mapping when both services share a network.
6. Open the public URL and sign in as Laura. Verify another Pocket ID user is refused, then complete a chore and reload to confirm saving.

The app intentionally will not start in production with incomplete identity configuration. The tunnel does not replace application authentication. Your Pocket ID issuer must also be reachable by both the application server and Laura’s browser.

No credentials or public hostname are included, and no tunnel or Pocket ID client has been provisioned by this repository.

## Back up and restore

SQLite data lives in the `laura-data` named Docker volume. Keep the volume when updating the image. Do not use `docker compose down -v` unless intentionally deleting all data.

Create a consistent live backup with SQLite’s backup API, then copy it off the host:

```sh
docker compose exec app node scripts/backup.js /data/backup.sqlite
docker compose cp app:/data/backup.sqlite ./laura-backup.sqlite
```

For a local install:

```sh
npm run backup -- ./backups/laura-backup.sqlite
```

Backups contain chore history and sessions. Store them privately and keep an off-host copy. For restoration, first make a backup of the current database, stop the application, then use a one-off container:

```sh
docker compose stop app
docker compose run --rm --no-deps -v "$PWD/laura-backup.sqlite:/restore.sqlite:ro" app node --input-type=module -e '
  import { copyFileSync, rmSync } from "node:fs";
  import { DatabaseSync } from "node:sqlite";
  const check = new DatabaseSync("/restore.sqlite", { readOnly: true });
  if (check.prepare("PRAGMA integrity_check").get().integrity_check !== "ok") throw new Error("Backup failed integrity check");
  check.close();
  for (const suffix of ["-wal", "-shm"]) rmSync("/data/laura.sqlite" + suffix, { force: true });
  copyFileSync("/restore.sqlite", "/data/laura.sqlite");
  const restored = new DatabaseSync("/data/laura.sqlite");
  restored.exec("DELETE FROM sessions");
  restored.close();
'
docker compose start app
```

This replaces current data with the backup and signs out existing sessions. Only perform it while the app is stopped. Test your backup/restore procedure before relying on it.

## Verification

```sh
npm test
npm run test:browser
```

The browser test uses `/usr/bin/chromium` by default; set `CHROMIUM_PATH` for another installed Chromium binary. It uses an isolated in-memory database and writes screenshots under `artifacts/`.

The implementation uses Node’s [SQLite API](https://nodejs.org/api/sqlite.html) and the maintained [`openid-client` OIDC flow](https://github.com/panva/openid-client/blob/main/examples/oidc.ts), including state, nonce and PKCE checks. Production identity is tested against a local OIDC fixture, but real Pocket ID and Cloudflare integration must be verified with your own configuration.

## Layout

- `src/domain.js`: date arithmetic, scheduling, chore actions and rewards.
- `src/store.js`: transactions, revisions, undo and sessions.
- `src/server.js`: HTTP API, identity and deployment configuration.
- `public/`: responsive interface, red panda, animations and local font.
- `docs/product-design.md`: agreed product decisions.

Nunito is distributed under the SIL Open Font License; see `public/fonts/OFL.txt`.
