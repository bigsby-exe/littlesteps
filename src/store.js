import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes, createHash } from "node:crypto";
import { initialState, reconcile, act, view, InputError } from "./domain.js";
export const token = () => randomBytes(32).toString("base64url");
const hash = (value) => createHash("sha256").update(value).digest("hex");

export function openStore(path) {
  if (path !== ":memory:")
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS profiles (subject TEXT PRIMARY KEY, revision INTEGER NOT NULL, data TEXT NOT NULL, undo TEXT, undo_token TEXT, undo_until INTEGER);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, data TEXT NOT NULL, expires INTEGER NOT NULL);
  `);
  function transaction(fn) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      db.exec("COMMIT");
      return result;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  function load(subject, today) {
    let row = db.prepare("SELECT * FROM profiles WHERE subject=?").get(subject);
    if (!row) {
      db.prepare(
        "INSERT INTO profiles(subject, revision, data) VALUES (?, 0, ?)",
      ).run(subject, JSON.stringify(initialState(today)));
      row = db.prepare("SELECT * FROM profiles WHERE subject=?").get(subject);
    }
    const state = JSON.parse(row.data);
    if (reconcile(state, today)) {
      row.revision++;
      db.prepare(
        "UPDATE profiles SET revision=?, data=?, undo=NULL, undo_token=NULL WHERE subject=?",
      ).run(row.revision, JSON.stringify(state), subject);
    }
    return { state, revision: row.revision };
  }
  return {
    db,
    read(subject, today) {
      return transaction(() => {
        const { state, revision } = load(subject, today);
        return { ...view(state, today), revision };
      });
    },
    mutate(subject, today, revision, action) {
      return transaction(() => {
        const current = load(subject, today);
        if (revision !== current.revision)
          throw new InputError(
            "Your list changed in another tab. We refreshed it; please try again.",
            409,
          );
        const before = JSON.stringify(current.state);
        const result = act(current.state, action, today);
        const undoToken = token();
        db.prepare(
          "UPDATE profiles SET revision=?, data=?, undo=?, undo_token=?, undo_until=? WHERE subject=?",
        ).run(
          revision + 1,
          JSON.stringify(current.state),
          before,
          hash(undoToken),
          Date.now() + 600000,
          subject,
        );
        return {
          ...view(current.state, today),
          revision: revision + 1,
          undoToken,
          ...result,
        };
      });
    },
    undo(subject, today, revision, undoToken) {
      return transaction(() => {
        const current = load(subject, today);
        const row = db
          .prepare("SELECT * FROM profiles WHERE subject=?")
          .get(subject);
        if (
          current.revision !== revision ||
          !row.undo ||
          row.undo_until < Date.now() ||
          typeof undoToken !== "string" ||
          row.undo_token !== hash(undoToken)
        )
          throw new InputError("This change can no longer be undone.", 409);
        const state = JSON.parse(row.undo);
        db.prepare(
          "UPDATE profiles SET revision=?, data=?, undo=NULL, undo_token=NULL WHERE subject=?",
        ).run(revision + 1, row.undo, subject);
        return { ...view(state, today), revision: revision + 1 };
      });
    },
    createSession(data, ttl = 7 * 86400000) {
      db.prepare("DELETE FROM sessions WHERE expires < ?").run(Date.now());
      const id = token();
      db.prepare("INSERT INTO sessions VALUES (?, ?, ?)").run(
        hash(id),
        JSON.stringify(data),
        Date.now() + ttl,
      );
      return id;
    },
    session(id) {
      if (!id || typeof id !== "string") return null;
      const row = db
        .prepare("SELECT data FROM sessions WHERE token=? AND expires>?")
        .get(hash(id), Date.now());
      return row ? JSON.parse(row.data) : null;
    },
    deleteSession(id) {
      if (id) db.prepare("DELETE FROM sessions WHERE token=?").run(hash(id));
    },
    close() {
      db.close();
    },
  };
}
