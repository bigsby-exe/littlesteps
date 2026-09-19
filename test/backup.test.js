import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { openStore } from "../src/store.js";

test("live backup restores a consistent database including completed chores", () => {
  const dir = mkdtempSync(join(tmpdir(), "laura-backup-"));
  const source = join(dir, "source.sqlite"),
    target = join(dir, "backup.sqlite");
  const store = openStore(source);
  try {
    const state = store.read("laura", "2026-09-14");
    store.mutate("laura", "2026-09-14", state.revision, {
      type: "complete",
      id: state.days[0].items[0].id,
    });
    execFileSync(process.execPath, ["scripts/backup.js", target], {
      env: { ...process.env, DATABASE_PATH: source },
    });
    const check = new DatabaseSync(target, { readOnly: true });
    assert.equal(
      check.prepare("PRAGMA integrity_check").get().integrity_check,
      "ok",
    );
    check.close();
    const restored = openStore(target);
    assert.equal(restored.read("laura", "2026-09-14").doneToday.length, 1);
    restored.close();
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
