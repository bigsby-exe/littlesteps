import test from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  reconcile,
  act,
  view,
  dateKey,
  rotationDay,
  monday,
} from "../src/domain.js";
const start = (date = "2026-09-14") => {
  const s = initialState(date);
  reconcile(s, date);
  return s;
};
const pending = (s, id) =>
  s.occurrences.find((o) => o.choreId === id && o.status === "pending");

test("UK dates respect midnight and daylight saving without shifting rotation", () => {
  assert.equal(dateKey(new Date("2026-09-19T23:30:00Z")), "2026-09-20");
  assert.equal(dateKey(new Date("2026-12-19T23:30:00Z")), "2026-12-19");
  assert.equal(monday("2026-09-20"), "2026-09-14");
  assert.equal(rotationDay("2026-03-23", "2026-03-30"), 7);
  assert.equal(rotationDay("2026-10-19", "2026-10-26"), 7);
  assert.equal(rotationDay("2026-09-21", "2026-09-20"), 13);
});
test("first visit starts week A without manufacturing a backlog", () => {
  const s = start("2026-09-19");
  assert.equal(s.anchor, "2026-09-14");
  assert.deepEqual(
    view(s, "2026-09-19").days[0].items.map((i) => i.choreId),
    ["room"],
  );
  assert.equal(view(s, "2026-09-19").overdue.length, 0);
});
test("bedding appears on the Sunday of week B only", () => {
  const s = start();
  const days = view(s, "2026-09-14").days;
  assert.equal(days.length, 14);
  assert.deepEqual(
    days
      .filter((d) => d.items.some((i) => i.choreId === "bedding"))
      .map((d) => d.date),
    ["2026-09-27"],
  );
});
test("missed chores are replaced without duplicates, even after long absence", () => {
  const s = start();
  const first = pending(s, "bins").id;
  reconcile(s, "2026-09-17");
  assert.equal(s.occurrences.find((o) => o.id === first).status, "superseded");
  assert.equal(
    s.occurrences.filter((o) => o.choreId === "bins" && o.status === "pending")
      .length,
    1,
  );
  reconcile(s, "2027-09-17");
  for (const c of s.chores)
    assert.ok(
      s.occurrences.filter((o) => o.choreId === c.id && o.status === "pending")
        .length <= 1,
    );
  assert.ok(s.occurrences.length < 30);
});
test("moving an occurrence preserves future cadence and prevents duplicate moved cards", () => {
  const s = start();
  act(
    s,
    { type: "move", id: pending(s, "bins").id, date: "2026-09-20" },
    "2026-09-14",
  );
  assert.equal(
    view(s, "2026-09-14")
      .days.find((d) => d.date === "2026-09-17")
      .items.some((i) => i.choreId === "bins"),
    false,
  );
  reconcile(s, "2026-09-20");
  assert.equal(pending(s, "bins").due, "2026-09-20");
  act(s, { type: "complete", id: pending(s, "bins").id }, "2026-09-20");
  reconcile(s, "2026-09-21");
  assert.equal(pending(s, "bins").due, "2026-09-21");
});
test("laundry progress survives its next scheduled day and counts only at put away", () => {
  const s = start("2026-09-15");
  act(
    s,
    { type: "addInvitation", title: "Picnic", message: "Time together." },
    "2026-09-15",
  );
  const laundry = pending(s, "darks");
  assert.equal(
    act(s, { type: "complete", id: laundry.id }, "2026-09-15").celebration,
    false,
  );
  reconcile(s, "2026-09-22");
  assert.equal(pending(s, "darks").id, laundry.id);
  assert.equal(laundry.step, 1);
  assert.equal(s.rewardProgress, 0);
  act(s, { type: "complete", id: laundry.id }, "2026-09-22");
  assert.equal(s.rewardProgress, 0);
  assert.equal(
    act(s, { type: "complete", id: laundry.id }, "2026-09-22").celebration,
    true,
  );
  assert.equal(s.rewardProgress, 1);
  assert.throws(
    () => act(s, { type: "complete", id: laundry.id }, "2026-09-22"),
    /changed/,
  );
});
test("skip affects only one occurrence and pause preserves laundry progress", () => {
  const s = start("2026-09-15");
  const o = pending(s, "darks");
  act(s, { type: "complete", id: o.id }, "2026-09-15");
  act(s, { type: "pauseChore", id: "darks" }, "2026-09-15");
  assert.equal(view(s, "2026-09-15").days[0].items.length, 0);
  act(s, { type: "pauseChore", id: "darks" }, "2026-09-15");
  assert.equal(pending(s, "darks").step, 1);
  act(s, { type: "skip", id: o.id }, "2026-09-15");
  reconcile(s, "2026-09-22");
  assert.notEqual(pending(s, "darks").id, o.id);
  assert.equal(pending(s, "darks").step, 0);
});
test("rewards are inactive without invitations, unlock once per ten full chores, never expire", () => {
  const s = start();
  const complete = (n) => {
    for (let i = 0; i < n; i++) {
      act(
        s,
        {
          type: "saveChore",
          title: `Small chore ${s.chores.length}`,
          kind: "other",
          days: [0],
        },
        "2026-09-14",
      );
      act(
        s,
        { type: "complete", id: pending(s, s.chores.at(-1).id).id },
        "2026-09-14",
      );
    }
  };
  complete(2);
  assert.equal(s.rewardProgress, 0);
  act(
    s,
    { type: "addInvitation", title: "Picnic", message: "Just us." },
    "2026-09-14",
  );
  complete(9);
  assert.equal(s.rewardProgress, 9);
  assert.equal(s.invitations[0].unlocked, false);
  complete(1);
  assert.equal(s.rewardProgress, 0);
  assert.equal(s.invitations[0].unlocked, true);
  assert.throws(
    () =>
      act(
        s,
        { type: "deleteInvitation", id: s.invitations[0].id },
        "2026-09-14",
      ),
    /stay yours/,
  );
  reconcile(s, "2027-09-14");
  assert.equal(s.invitations[0].unlocked, true);
  act(s, { type: "useInvitation", id: s.invitations[0].id }, "2027-09-14");
  assert.equal(s.invitations[0].used, true);
});
test("invalid schedules and dates are rejected", () => {
  const s = start();
  for (const days of [[], [-1], [14], ["1"]])
    assert.throws(() =>
      act(
        s,
        { type: "saveChore", title: "Test", kind: "other", days },
        "2026-09-14",
      ),
    );
  for (const date of ["2026-02-30", "2026-09-13", "tomorrow", "2030-09-14"])
    assert.throws(() =>
      act(s, { type: "move", id: pending(s, "bins").id, date }, "2026-09-14"),
    );
  assert.throws(
    () => act(s, { type: "settings", anchor: "2026-09-15" }, "2026-09-14"),
    /Monday/,
  );
});
