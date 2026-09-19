import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "../src/store.js";

test("server persistence, concurrency and undo preserve completed work and rewards", () => {
  const dir = mkdtempSync(join(tmpdir(), "laura-store-")),
    path = join(dir, "test.sqlite");
  let store = openStore(path);
  try {
    const a = store.read("laura", "2026-09-14");
    const result = store.mutate("laura", "2026-09-14", a.revision, {
      type: "complete",
      id: a.days[0].items[0].id,
    });
    assert.equal(result.doneToday.length, 1);
    assert.throws(
      () =>
        store.mutate("laura", "2026-09-14", a.revision, {
          type: "skip",
          id: a.days[0].items[0].id,
        }),
      /another tab/,
    );
    const session = store.createSession({ subject: "laura", csrf: "test" });
    store.close();
    store = openStore(path);
    assert.equal(store.read("laura", "2026-09-14").doneToday.length, 1);
    assert.equal(store.session(session).subject, "laura");
    assert.throws(
      () => store.undo("laura", "2026-09-14", result.revision, "not-the-token"),
      /no longer/,
    );
    const undone = store.undo(
      "laura",
      "2026-09-14",
      result.revision,
      result.undoToken,
    );
    assert.equal(undone.doneToday.length, 0);
    assert.equal(undone.days[0].items.length, 1);
    assert.throws(
      () =>
        store.undo("laura", "2026-09-14", undone.revision, result.undoToken),
      /no longer/,
    );
    store.deleteSession(session);
    assert.equal(store.session(session), null);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("failed mutation rolls back state and revisions", () => {
  const store = openStore(":memory:");
  try {
    const a = store.read("laura", "2026-09-15");
    const laundry = a.days[0].items[0];
    const b = store.mutate("laura", "2026-09-15", a.revision, {
      type: "complete",
      id: laundry.id,
    });
    assert.throws(
      () =>
        store.mutate("laura", "2026-09-15", b.revision, {
          type: "saveChore",
          id: laundry.choreId,
          kind: "other",
          title: "Wrong",
          days: [1],
        }),
      /Finish or skip/,
    );
    const c = store.read("laura", "2026-09-15");
    assert.equal(c.revision, b.revision);
    assert.equal(c.days[0].items[0].kind, "laundry");
  } finally {
    store.close();
  }
});
