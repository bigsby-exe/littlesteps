import { randomUUID } from "node:crypto";

export class InputError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
export const dateKey = (now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
export const addDays = (day, n) =>
  new Date(Date.parse(`${day}T12:00:00Z`) + n * 86400000)
    .toISOString()
    .slice(0, 10);
export const monday = (day) =>
  addDays(day, -((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7));
export const rotationDay = (anchor, day) =>
  ((Math.round((Date.parse(day) - Date.parse(anchor)) / 86400000) % 14) + 14) %
  14;
export function validDate(day) {
  return (
    typeof day === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    !Number.isNaN(Date.parse(day)) &&
    new Date(day).toISOString().slice(0, 10) === day
  );
}
const both = (days) => [...days, ...days.map((d) => d + 7)];
export function initialState(today) {
  return {
    version: 1,
    anchor: monday(today),
    created: today,
    synced: addDays(today, -1),
    reducedMotion: false,
    rewardProgress: 0,
    invitations: [],
    occurrences: [],
    chores: [
      ["bins", "Take bins down", "bins", both([0, 3])],
      ["darks", "Wash darks", "laundry", both([1])],
      ["bathroom", "Clean bathroom", "bathroom", both([2])],
      ["lights", "Wash lights", "laundry", both([4])],
      ["room", "Clean room", "room", both([5])],
      ["bedding", "Change bedding", "bedding", [13]],
    ].map(([id, title, kind, days]) => ({
      id,
      title,
      kind,
      days,
      paused: false,
      created: today,
    })),
  };
}

// Calendar arithmetic uses dates, not elapsed hours, so DST cannot shift a chore.
export function reconcile(state, today) {
  if (state.synced >= today) return false;
  // After a long absence only the latest fortnight is actionable. Historical
  // completions are retained; we never manufacture months of missed chores.
  const from =
    state.synced < addDays(today, -14)
      ? addDays(today, -13)
      : addDays(state.synced, 1);
  for (let day = from; day <= today; day = addDays(day, 1)) {
    for (const chore of state.chores.filter(
      (c) =>
        !c.paused &&
        c.created <= day &&
        c.days.includes(rotationDay(state.anchor, day)),
    )) {
      if (
        state.occurrences.some(
          (o) => o.choreId === chore.id && o.scheduled === day,
        )
      )
        continue;
      const pending = state.occurrences.find(
        (o) => o.choreId === chore.id && o.status === "pending",
      );
      if (
        pending &&
        ((chore.kind === "laundry" && pending.step > 0) || pending.due >= day)
      )
        continue;
      if (pending) pending.status = "superseded";
      state.occurrences.push({
        id: randomUUID(),
        choreId: chore.id,
        title: chore.title,
        kind: chore.kind,
        scheduled: day,
        due: day,
        status: "pending",
        step: 0,
      });
    }
  }
  state.synced = today;
  return true;
}

function text(value, name, max = 80) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw new InputError(`${name} must be between 1 and ${max} characters.`);
  return value.trim();
}
function reward(state) {
  const next = state.invitations.find((i) => !i.unlocked);
  if (!next) return;
  state.rewardProgress++;
  if (state.rewardProgress === 10) {
    next.unlocked = true;
    state.rewardProgress = 0;
  }
}

export function act(state, action, today) {
  if (!action || typeof action !== "object")
    throw new InputError("Choose an action.");
  const { type } = action;
  let celebration = false;
  if (["complete", "move", "skip"].includes(type)) {
    const occurrence = state.occurrences.find(
      (o) => o.id === action.id && o.status === "pending",
    );
    const chore =
      occurrence &&
      state.chores.find((c) => c.id === occurrence.choreId && !c.paused);
    if (!occurrence || !chore)
      throw new InputError(
        "This chore has changed. Refresh and try again.",
        409,
      );
    if (type === "move") {
      if (
        !validDate(action.date) ||
        action.date < today ||
        action.date > addDays(today, 365)
      )
        throw new InputError("Choose a date from today through the next year.");
      occurrence.due = action.date;
    } else if (type === "skip") occurrence.status = "skipped";
    else {
      if (occurrence.due > today)
        throw new InputError("Move this chore to today before completing it.");
      occurrence.step++;
      if (occurrence.kind !== "laundry" || occurrence.step === 3) {
        occurrence.status = "done";
        occurrence.completed = today;
        reward(state);
        celebration = true;
      }
    }
  } else if (type === "saveChore") {
    const title = text(action.title, "Chore name");
    const kinds = ["bins", "laundry", "bathroom", "room", "bedding", "other"];
    if (!kinds.includes(action.kind))
      throw new InputError("Choose a chore type.");
    if (
      !Array.isArray(action.days) ||
      !action.days.length ||
      action.days.some((d) => !Number.isInteger(d) || d < 0 || d > 13)
    )
      throw new InputError("Choose at least one day in the fortnight.");
    let chore = action.id ? state.chores.find((c) => c.id === action.id) : null;
    if (action.id && !chore) throw new InputError("Chore not found.", 404);
    if (!chore) {
      if (state.chores.length >= 60)
        throw new InputError("You can have up to 60 chores.");
      chore = { id: randomUUID(), created: today, paused: false };
      state.chores.push(chore);
    }
    if (
      chore.kind &&
      chore.kind !== action.kind &&
      state.occurrences.some(
        (o) => o.choreId === chore.id && o.status === "pending" && o.step > 0,
      )
    )
      throw new InputError(
        "Finish or skip the current laundry cycle before changing its type.",
      );
    Object.assign(chore, {
      title,
      kind: action.kind,
      days: [...new Set(action.days)].sort((a, b) => a - b),
    });
    for (const o of state.occurrences.filter(
      (o) => o.choreId === chore.id && o.status === "pending",
    ))
      Object.assign(o, { title, kind: chore.kind });
    state.synced = addDays(today, -1);
    reconcile(state, today);
  } else if (type === "pauseChore" || type === "deleteChore") {
    const chore = state.chores.find((c) => c.id === action.id);
    if (!chore) throw new InputError("Chore not found.", 404);
    if (type === "pauseChore") chore.paused = !chore.paused;
    else {
      state.chores = state.chores.filter((c) => c.id !== chore.id);
      for (const o of state.occurrences.filter(
        (o) => o.choreId === chore.id && o.status === "pending",
      ))
        o.status = "removed";
    }
    if (type === "pauseChore" && !chore.paused) {
      state.synced = addDays(today, -1);
      reconcile(state, today);
    }
  } else if (type === "settings") {
    if (!validDate(action.anchor) || monday(action.anchor) !== action.anchor)
      throw new InputError("Choose a Monday for the start of Week A.");
    if (
      Math.abs(Date.parse(action.anchor) - Date.parse(today)) >
      366 * 86400000
    )
      throw new InputError("Choose a rotation start within one year of today.");
    state.anchor = action.anchor;
    state.reducedMotion = Boolean(action.reducedMotion);
    state.synced = addDays(today, -1);
    reconcile(state, today);
  } else if (type === "addInvitation") {
    if (state.invitations.length >= 100)
      throw new InputError("You can save up to 100 invitations.");
    state.invitations.push({
      id: randomUUID(),
      title: text(action.title, "Date name"),
      message: text(action.message, "Invitation", 500),
      unlocked: false,
      used: false,
    });
  } else if (type === "useInvitation" || type === "deleteInvitation") {
    const invitation = state.invitations.find((i) => i.id === action.id);
    if (!invitation) throw new InputError("Invitation not found.", 404);
    if (type === "useInvitation") {
      if (!invitation.unlocked || invitation.used)
        throw new InputError("This invitation is not available.");
      invitation.used = true;
    } else {
      if (invitation.unlocked)
        throw new InputError("Earned invitations stay yours.");
      state.invitations = state.invitations.filter(
        (i) => i.id !== invitation.id,
      );
      if (!state.invitations.some((i) => !i.unlocked)) state.rewardProgress = 0;
    }
  } else throw new InputError("Unknown action.");
  return { celebration };
}

export function view(state, today) {
  const activeIds = new Set(
    state.chores.filter((c) => !c.paused).map((c) => c.id),
  );
  const pending = state.occurrences.filter(
    (o) => o.status === "pending" && activeIds.has(o.choreId),
  );
  const days = [];
  for (let n = 0; n < 14; n++) {
    const day = addDays(today, n);
    const items = pending
      .filter((o) => o.due === day)
      .map((o) => ({ ...o, projected: false }));
    if (n > 0)
      for (const chore of state.chores.filter(
        (c) => !c.paused && c.days.includes(rotationDay(state.anchor, day)),
      )) {
        const current = pending.find((o) => o.choreId === chore.id);
        if (
          current &&
          (current.due >= day || (chore.kind === "laundry" && current.step > 0))
        )
          continue;
        items.push({
          id: `${chore.id}:${day}`,
          choreId: chore.id,
          title: chore.title,
          kind: chore.kind,
          due: day,
          projected: true,
          step: 0,
        });
      }
    days.push({
      date: day,
      week: rotationDay(state.anchor, day) < 7 ? "A" : "B",
      items,
    });
  }
  return {
    ...state,
    today,
    week: rotationDay(state.anchor, today) < 7 ? "A" : "B",
    overdue: pending.filter((o) => o.due < today),
    days,
    doneToday: state.occurrences.filter(
      (o) => o.status === "done" && o.completed === today,
    ),
    occurrences: undefined,
  };
}
