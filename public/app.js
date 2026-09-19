const app = document.querySelector("#app");
const dialog = document.querySelector("#dialog");
const toast = document.querySelector("#toast");
let state,
  csrf,
  tab = "today",
  busy = false,
  undoToken,
  toastTimer;
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const icons = {
  check: '<path d="m5 12 4 4L19 6"/>',
  calendar:
    '<rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4m8-4v4M4 11h16m-12 4h2m4 0h2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
  gift: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M3 7h18v4H3zm9 0v14M12 7C4 8 5 0 9 3l3 4Zm0 0c8 1 7-7 3-4l-3 4Z"/>',
  settings:
    '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
  bins: '<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
  laundry:
    '<rect x="4" y="2" width="16" height="20" rx="3"/><circle cx="12" cy="14" r="5"/><path d="M8 5h1m3 0h4m-8 9q4 4 8 0"/>',
  bathroom:
    '<path d="M3 12h18v3a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5Zm2 0V5a3 3 0 0 1 6 0M7 20v2m10-2v2"/>',
  room: '<path d="m3 10 9-8 9 8M5 9v12h14V9M9 21v-8h6v8"/>',
  bedding:
    '<path d="M3 18V8h18v10M3 14h18M3 18v3m18-3v3M6 8V5h12v3M6 11h4m4 0h4"/>',
  other:
    '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  heart:
    '<path d="M20 4c-3-3-7-1-8 2-1-3-5-5-8-2-4 4 0 9 8 16 8-7 12-12 8-16Z"/>',
  leaf: '<path d="M20 3C4 1 1 11 7 17S23 17 20 3ZM4 21 16 9"/>',
};
const icon = (name, cls = "") =>
  `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.other}</svg>`;
const format = (
  day,
  options = { weekday: "long", day: "numeric", month: "long" },
) =>
  new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).format(
    new Date(`${day}T12:00:00Z`),
  );
const panda =
  () => `<svg class="panda" viewBox="0 0 300 230" role="img" aria-label="A happy little red panda">
<defs><linearGradient id="fur" x2="0.7" y2="1"><stop stop-color="#e79460"/><stop offset="1" stop-color="#ce6c47"/></linearGradient><linearGradient id="belly" x2="0" y2="1"><stop stop-color="#634d47"/><stop offset="1" stop-color="#473b38"/></linearGradient></defs>
<ellipse cx="152" cy="213" rx="91" ry="9" fill="#dcd6c7" opacity=".45"/>
<g class="panda-tail"><path d="M180 174c35 26 89 18 79-15-7-21-25-13-40-15-21-2-24-20-44-9" fill="#cc754b"/><path d="M223 144q-8 18 4 37m20-36q-6 20 7 30M196 142q-9 14 0 39" fill="none" stroke="#854c3b" stroke-width="14"/></g>
<ellipse cx="148" cy="174" rx="51" ry="41" fill="url(#belly)"/><ellipse cx="128" cy="205" rx="21" ry="10" fill="#443a36"/><ellipse cx="173" cy="205" rx="21" ry="10" fill="#443a36"/>
<path d="M109 157q-26-6-28 18t29 8" fill="#765344"/><path d="M187 159q18-9 24 5t-18 19" fill="#765344"/>
<g class="panda-head"><path d="M94 89Q63 31 81 26q31-1 54 44M171 68q27-47 49-39 15 8-8 64" fill="#b96143" stroke="#fff4df" stroke-width="7" stroke-linejoin="round"/>
<path d="M92 65 85 39l25 29m83 0 18-24-4 31" fill="#725046"/>
<path d="M150 57c-50-1-77 26-77 62 0 40 35 62 77 60 45 1 80-22 78-61-2-35-31-62-78-61Z" fill="url(#fur)"/>
<path d="M77 113q22-18 44 9l23 21q-20 30-47 14-23-14-20-44m148 0q-22-18-44 9l-23 21q20 30 47 14 23-14 20-44" fill="#fff2dc"/>
<path d="M91 110q11-16 28-9m63 0q16-8 28 9" fill="none" stroke="#fff2dc" stroke-width="9" stroke-linecap="round"/>
<path d="M104 126q7-9 14 0m67 0q7-9 14 0" fill="none" stroke="#493c36" stroke-width="5" stroke-linecap="round"/>
<ellipse cx="102" cy="141" rx="10" ry="5" fill="#edbaa2"/><ellipse cx="201" cy="141" rx="10" ry="5" fill="#edbaa2"/>
<ellipse cx="151" cy="151" rx="23" ry="16" fill="#fff2dc"/><path d="M143 140q8-5 16 0l-8 8Z" fill="#493c36"/><path d="M151 147v5m-10 0q5 8 10 0 5 8 10 0" fill="none" stroke="#493c36" stroke-width="2.5" stroke-linecap="round"/>
<path d="m139 59 9-10 6 10 10-5 2 10" fill="#de8657"/></g>
<g class="panda-sparkles" fill="#cba768"><path d="m51 92 3-8 3 8 8 3-8 3-3 8-3-8-8-3Zm190-31 3-7 3 7 7 3-7 3-3 7-3-7-7-3Z"/><circle cx="69" cy="162" r="3"/><circle cx="237" cy="113" r="3"/></g></svg>`;

function notify(message, canUndo = false) {
  clearTimeout(toastTimer);
  toast.innerHTML = `<span>${esc(message)}</span>${canUndo && undoToken ? '<button id="undo">Undo</button>' : ""}`;
  toast.classList.add("show");
  toastTimer = setTimeout(
    () => toast.classList.remove("show"),
    canUndo ? 15000 : 6000,
  );
}
async function api(path, body) {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body
      ? { "Content-Type": "application/json", "X-CSRF-Token": csrf }
      : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.status === 401) {
    renderLogin();
    throw new Error("Please sign in to continue.");
  }
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 409) await refresh();
    throw new Error(data.error || "Unable to save. Please try again.");
  }
  return data;
}
async function refresh() {
  const data = await api("/api/state");
  // A slow refresh must not replace a more recent saved change.
  if (state && data.revision < state.revision) return;
  const changed =
    !state || state.revision !== data.revision || state.today !== data.today;
  csrf = data.csrf;
  state = data;
  if (changed) render();
}
async function mutate(action, message) {
  if (busy) return;
  busy = true;
  app.setAttribute("aria-busy", "true");
  try {
    const result = await api("/api/action", {
      revision: state.revision,
      action,
    });
    state = { ...state, ...result };
    undoToken = result.undoToken;
    dialog.close();
    render();
    if (result.celebration && !state.reducedMotion) {
      document.querySelector(".panda")?.classList.add("celebrate");
    }
    notify(
      message ||
        (result.celebration
          ? "A little step, beautifully done. ✨"
          : "Saved. All at your pace."),
      true,
    );
  } catch (error) {
    notify(error.message);
  } finally {
    busy = false;
    app.removeAttribute("aria-busy");
  }
}
function renderLogin() {
  state = null;
  app.innerHTML = `<main id="main" class="login"><a class="brand" href="/">${icon("leaf")} little steps<span>FOR LAURA</span></a>${panda()}<span class="eyebrow">YOUR OWN LITTLE SPACE</span><h1>A little care.<br>A little calmer.</h1><p>Everyday things, one small step at a time.<br>Your little companion is ready when you are.</p><a class="primary login-button" href="/auth/login">Come on in ${icon("arrow")}</a><small>Sign in with your Pocket ID</small></main>`;
}
function card(item, { done = false, preview = false } = {}) {
  const steps = ["Wash", "Dry", "Put away"];
  return `<article class="chore-card ${done ? "is-done" : ""}" data-chore="${esc(item.id)}">
    <div class="chore-icon ${esc(item.kind)}">${icon(done ? "check" : item.kind)}</div>
    <div class="chore-copy"><h3>${esc(item.title)}</h3>${item.kind === "laundry" && !done ? `<ol class="laundry-steps" aria-label="Laundry progress">${steps.map((s, i) => `<li class="${i < item.step ? "finished" : i === item.step ? "current" : ""}">${i < item.step ? "✓ " : ""}${s}</li>`).join("")}</ol>` : `<p>${done ? "A little care for your space" : { bins: "A quick trip, a fresh start", bathroom: "A little sparkle for your space", room: "Make a little room to breathe", bedding: "Fresh sheets, cosy sleep", other: "One small thing at a time" }[item.kind] || "All at your own pace"}</p>`}</div>
    ${!preview && !done ? `<button class="complete-button" data-action="complete" data-id="${esc(item.id)}" aria-label="${esc(item.kind === "laundry" ? `Finish ${steps[item.step]} for ${item.title}` : `Complete ${item.title}`)}">${icon("check")}</button><div class="chore-actions"><button data-action="move" data-id="${esc(item.id)}">Move</button><span>·</span><button data-action="skip" data-id="${esc(item.id)}">Skip this time</button>${item.kind === "laundry" ? `<span class="next-step">Next: ${steps[item.step]}</span>` : ""}</div>` : done ? '<span class="done-label">Done</span>' : ""}
  </article>`;
}
function render() {
  if (!state) return;
  document.documentElement.classList.toggle(
    "reduced-motion",
    state.reducedMotion,
  );
  app.innerHTML = `<div class="shell"><header class="site-header"><a href="/" class="brand">${icon("leaf")} little steps<span>FOR LAURA</span></a><button class="settings-button ${tab === "settings" ? "selected" : ""}" data-tab="settings" aria-label="Settings">${icon("settings")}</button></header>
    <main id="main"><section class="hero">${panda()}<div class="greeting-pill">${icon("sun")} A LITTLE SPACE, JUST FOR YOU</div><h1>${tab === "today" ? "Hey Laura, one little step." : tab === "upcoming" ? "A little look ahead." : tab === "rewards" ? "Lovely things to look forward to." : "Make this space yours."}</h1><p>${tab === "today" ? "No rush. No perfect days. Just a little care for you." : tab === "upcoming" ? "Your next two weeks, with plenty of room to move things." : tab === "rewards" ? "Little celebrations, and some time together." : "A routine that fits your life, at your own pace."}</p></section>
    <nav class="tabs" aria-label="Main navigation">${[
      ["today", "sun", "Today"],
      ["upcoming", "calendar", "Upcoming"],
      ["rewards", "heart", "Little treats"],
    ]
      .map(
        ([key, ico, label]) =>
          `<button data-tab="${key}" ${tab === key ? 'aria-current="page"' : ""} class="${tab === key ? "active" : ""}">${icon(ico)}${label}</button>`,
      )
      .join("")}</nav>
    <div class="page-content">${tab === "today" ? todayView() : tab === "upcoming" ? upcomingView() : tab === "rewards" ? rewardsView() : settingsView()}</div>
    <footer>${icon("leaf")} Little steps count. So do quiet days.</footer></main></div>`;
}
function todayView() {
  const todayItems = state.days[0].items,
    done = state.doneToday.length;
  return `<div class="section-heading"><div><span class="eyebrow">${esc(format(state.today, { weekday: "long" }))}</span><h2>Your today <span class="count-badge">${todayItems.length}</span></h2><p>${esc(format(state.today, { day: "numeric", month: "long" }))} <span class="date-dot">·</span> Week ${state.week}</p></div><div class="progress-flower">${icon("other")}<span>${done ? `${done} little ${done === 1 ? "step" : "steps"} done` : "A fresh little start"}</span></div></div>
  <div class="chore-list">${todayItems.length ? todayItems.map((i) => card(i)).join("") : `<div class="empty-card">${icon("leaf")}<h3>${done ? "That’s your today, taken care of." : "A little breathing room."}</h3><p>${done ? "Enjoy a moment for yourself. You’ve earned it." : "Nothing scheduled for today. Quiet days count too."}</p></div>`}</div>
  ${state.overdue.length ? `<section class="overdue"><div class="subheading"><h2>Still to do <span class="count-badge">${state.overdue.length}</span></h2><span>Whenever you’re ready</span></div>${state.overdue.map((i) => card(i)).join("")}</section>` : ""}
  ${done ? `<details class="completed"><summary>${icon("check")} Taken care of today <span>${done}</span></summary>${state.doneToday.map((i) => card(i, { done: true })).join("")}</details>` : ""}
  <aside class="gentle-note"><span class="note-flower">✿</span><div><strong>Small things make a softer day.</strong><p>Do what you can. Move what you need. This is your space.</p></div></aside>
  ${state.invitations.some((i) => !i.unlocked) ? `<button class="reward-preview" data-tab="rewards">${icon("gift")}<span>A little treat is growing <small>${state.rewardProgress} of 10 little steps</small></span>${icon("arrow")}</button>` : ""}`;
}
function upcomingView() {
  return `<div class="section-heading"><div><span class="eyebrow">ROOM TO PLAN</span><h2>The next two weeks</h2><p>Fixed days are a starting point. Life can move.</p></div></div><div class="upcoming-list">${state.days.map((day) => `<section class="upcoming-day"><div class="day-label"><strong>${day.date === state.today ? "Today" : esc(format(day.date, { weekday: "short" }))}</strong><span>${esc(format(day.date, { day: "numeric", month: "short" }))}</span><small>Week ${day.week}</small></div><div class="day-items">${day.items.length ? day.items.map((i) => `<div class="upcoming-item"><span class="mini-icon ${esc(i.kind)}">${icon(i.kind)}</span><span>${esc(i.title)}${i.kind === "laundry" && i.step ? "<small>In progress</small>" : ""}</span>${!i.projected ? `<button data-action="move" data-id="${esc(i.id)}" aria-label="Move ${esc(i.title)}">Move</button>` : ""}</div>`).join("") : '<span class="quiet-day">A little breathing room</span>'}</div></section>`).join("")}</div><p class="footnote">Upcoming days follow your schedule. Laundry already in progress stays on your list until it’s finished.</p>`;
}
function rewardsView() {
  const available = state.invitations.filter((i) => i.unlocked && !i.used),
    queued = state.invitations.filter((i) => !i.unlocked),
    used = state.invitations.filter((i) => i.used);
  return `<div class="section-heading"><div><span class="eyebrow">SOMETHING LOVELY</span><h2>Your little treats</h2><p>No deadlines. Just things to enjoy together.</p></div>${icon("heart", "large-heart")}</div>
  ${queued.length ? `<section class="reward-meter"><span class="note-flower">✿</span><h3>A little invitation is on its way</h3><p>Every 10 completed chores reveals a date together.</p><div class="reward-dots" aria-label="${state.rewardProgress} of 10 completed">${Array.from({ length: 10 }, (_, i) => `<span class="${i < state.rewardProgress ? "filled" : ""}">${i < state.rewardProgress ? "♥" : "·"}</span>`).join("")}</div><small>${state.rewardProgress} / 10 little steps · no streaks to keep</small></section>` : `<div class="empty-card">${icon("gift")}<h3>${available.length || used.length ? "Every little celebration stays yours." : "A little something, when you’re ready."}</h3><p>${available.length || used.length ? "Add another invitation in settings whenever you like." : "Date invitations can be added in settings. For now, your panda will celebrate every little step."}</p></div>`}
  ${available.map((i) => `<article class="invitation"><span class="eyebrow">AN INVITATION FOR YOU ${icon("heart")}</span><h3>${esc(i.title)}</h3><p>${esc(i.message)}</p><button class="primary" data-action="useInvitation" data-id="${esc(i.id)}">We enjoyed this ${icon("check")}</button><small>Yours to enjoy whenever you like</small></article>`).join("")}
  ${used.length ? `<details class="completed"><summary>${icon("heart")} Lovely memories <span>${used.length}</span></summary>${used.map((i) => `<article class="memory"><h3>${esc(i.title)}</h3><p>${esc(i.message)}</p></article>`).join("")}</details>` : ""}`;
}
const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function scheduleLabel(chore) {
  return ["A", "B"]
    .map(
      (week, index) =>
        `${week}: ${
          chore.days
            .filter((d) => Math.floor(d / 7) === index)
            .map((d) => dayNames[d % 7])
            .join(", ") || "rest week"
        }`,
    )
    .join(" · ");
}
function settingsView() {
  return `<div class="section-heading"><div><span class="eyebrow">YOUR RHYTHM</span><h2>Make it work for you</h2><p>Everything here can change as life does.</p></div></div>
  <section class="settings-section"><div class="subheading"><h3>Your chores</h3><button class="text-button" data-action="editChore">+ Add a chore</button></div>${state.chores.map((c) => `<article class="settings-chore ${c.paused ? "paused" : ""}"><div class="mini-icon ${esc(c.kind)}">${icon(c.kind)}</div><div><strong>${esc(c.title)}${c.paused ? " · Paused" : ""}</strong><p>${esc(scheduleLabel(c))}</p></div><button class="text-button" data-action="editChore" data-id="${esc(c.id)}" aria-label="Edit ${esc(c.title)}">Edit</button></article>`).join("")}</section>
  <section class="settings-section"><h3>Your fortnight</h3><form id="settings-form"><label>Week A starts on a Monday<input type="date" name="anchor" value="${esc(state.anchor)}" required></label><p class="field-help">Changing this shifts future scheduled days. Current chores stay on your list.</p><label class="toggle-label"><input type="checkbox" name="reducedMotion" ${state.reducedMotion ? "checked" : ""}> Keep animations still</label><p class="field-help">Your device’s reduced-motion preference is respected too.</p><button class="primary" type="submit">Save preferences</button></form></section>
  <section class="settings-section"><div class="subheading"><h3>Date invitations</h3><button class="text-button" data-action="addInvitation">+ Add</button></div><p class="field-help">Add real plans and a personal message. Invitations reveal in this order, after 10 completed chores each. Progress starts when an invitation is waiting.</p>${
    state.invitations
      .filter((i) => !i.unlocked)
      .map(
        (i) =>
          `<div class="queued-invitation"><span>${esc(i.title)}</span><button class="text-button danger-text" data-action="deleteInvitation" data-id="${esc(i.id)}" aria-label="Remove ${esc(i.title)}">Remove</button></div>`,
      )
      .join("") || '<p class="muted">No invitations waiting yet.</p>'
  }</section>
  <section class="settings-section small-print"><h3>Your little space</h3><p>Dates follow UK time. Your changes are saved on the server.</p><p>Paused chores keep their progress. Removing a chore keeps the little steps you’ve already completed.</p>${!state.development ? '<button class="text-button" data-action="logout">Sign out</button>' : '<span class="preview-label">Local preview</span>'}</section>`;
}
function openDialog(content) {
  dialog.innerHTML = `<button class="close-dialog" aria-label="Close dialog" data-action="close">×</button>${content}`;
  dialog.querySelector("h2").id = "dialog-title";
  dialog.setAttribute("aria-labelledby", "dialog-title");
  dialog.showModal();
}
function editChore(id) {
  const c = state.chores.find((c) => c.id === id);
  openDialog(
    `<span class="eyebrow">YOUR ROUTINE</span><h2>${c ? "A little adjustment" : "One more little thing"}</h2><form id="chore-form" data-id="${esc(id || "")}"><label>Chore name<input name="title" maxlength="80" value="${esc(c?.title || "")}" placeholder="e.g. Water the plants" required></label><label for="chore-kind">Chore type</label><select id="chore-kind" name="kind">${[
      ["other", "Something else"],
      ["bins", "Bins"],
      ["laundry", "Laundry · wash, dry, put away"],
      ["bathroom", "Bathroom"],
      ["room", "Room"],
      ["bedding", "Bedding"],
    ]
      .map(
        ([value, label]) =>
          `<option value="${value}" ${c?.kind === value ? "selected" : ""}>${label}</option>`,
      )
      .join(
        "",
      )}</select><p class="field-help">Choose the days you’d like it to appear.</p>${["A", "B"].map((week, index) => `<fieldset class="day-picker"><legend>Week ${week}</legend><div>${dayNames.map((label, day) => `<label><input type="checkbox" name="days" value="${index * 7 + day}" ${c?.days.includes(index * 7 + day) ? "checked" : ""}><span>${label}</span></label>`).join("")}</div></fieldset>`).join("")}<button class="primary full" type="submit">${c ? "Save changes" : "Add chore"} ${icon("check")}</button></form>${c ? `<div class="dialog-secondary"><button class="text-button" data-action="pauseChore" data-id="${esc(id)}">${c.paused ? "Resume chore" : "Pause chore"}</button><button class="text-button danger-text" data-action="confirmDelete" data-id="${esc(id)}">Remove chore</button></div>` : ""}`,
  );
}
async function handleClick(event) {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.id === "undo" && undoToken) {
    if (busy) return;
    busy = true;
    try {
      state = {
        ...state,
        ...(await api("/api/undo", { revision: state.revision, undoToken })),
      };
      undoToken = null;
      render();
      notify("Undone. All good.");
    } catch (e) {
      notify(e.message);
    } finally {
      busy = false;
    }
    return;
  }
  if (button.dataset.tab) {
    tab = button.dataset.tab;
    render();
    return;
  }
  const { action, id } = button.dataset;
  if (action === "close") dialog.close();
  if (action === "complete") await mutate({ type: action, id });
  if (action === "skip")
    await mutate(
      { type: action, id },
      "Skipped this time. There’s always another day.",
    );
  if (action === "move")
    openDialog(
      `<span class="eyebrow">MAKE A LITTLE ROOM</span><h2>Another day works too.</h2><form id="move-form" data-id="${esc(id)}"><label>Move to<input type="date" name="date" min="${state.today}" value="${state.today}" required></label><p class="field-help">Only this time moves. Your usual routine stays the same.</p><button class="primary full" type="submit">Move chore ${icon("arrow")}</button></form>`,
    );
  if (action === "editChore") editChore(id);
  if (action === "pauseChore")
    await mutate({ type: action, id }, "Your routine has been updated.");
  if (action === "confirmDelete")
    openDialog(
      `<h2>Remove this chore?</h2><p>Your completed little steps will stay. You can add the chore again any time.</p><button class="primary full" data-action="deleteChore" data-id="${esc(id)}">Remove chore</button><button class="text-button full" data-action="close">Keep it</button>`,
    );
  if (action === "deleteChore")
    await mutate({ type: action, id }, "Chore removed.");
  if (action === "addInvitation")
    openDialog(
      `<span class="eyebrow">TIME TOGETHER</span><h2>A little invitation</h2><form id="invitation-form"><label>Date name<input name="title" maxlength="80" placeholder="A picnic, just us" required></label><label>Your message<textarea name="message" maxlength="500" rows="4" placeholder="Let’s pack our favourite snacks and find a sunny spot…" required></textarea></label><p class="field-help">Choose something you can really do together. It will never expire.</p><button class="primary full" type="submit">Save invitation ${icon("heart")}</button></form>`,
    );
  if (action === "deleteInvitation")
    await mutate({ type: action, id }, "Invitation removed.");
  if (action === "useInvitation")
    await mutate({ type: action, id }, "A lovely memory to keep. ♥");
  if (action === "logout") {
    try {
      await api("/api/logout", {});
      renderLogin();
    } catch (e) {
      notify(e.message);
    }
  }
}
document.addEventListener("click", (event) => {
  handleClick(event).catch((e) => notify(e.message));
});
document.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target,
    data = new FormData(form);
  if (form.id === "chore-form")
    mutate(
      {
        type: "saveChore",
        id: form.dataset.id || undefined,
        title: data.get("title"),
        kind: data.get("kind"),
        days: data.getAll("days").map(Number),
      },
      "Your routine, updated.",
    );
  if (form.id === "move-form")
    mutate(
      { type: "move", id: form.dataset.id, date: data.get("date") },
      "Moved. A little more breathing room.",
    );
  if (form.id === "settings-form")
    mutate(
      {
        type: "settings",
        anchor: data.get("anchor"),
        reducedMotion: data.has("reducedMotion"),
      },
      "Preferences saved.",
    );
  if (form.id === "invitation-form")
    mutate(
      {
        type: "addInvitation",
        title: data.get("title"),
        message: data.get("message"),
      },
      "A lovely thing to look forward to.",
    );
});
async function initialLoad() {
  try {
    await refresh();
  } catch (e) {
    if (!document.querySelector(".login"))
      app.innerHTML = `<main id="main" class="login">${panda()}<h1>A little pause.</h1><p>We couldn’t reach your space. Check your connection and try again.</p><button class="primary" id="retry">Try again</button></main>`;
    document.querySelector("#retry")?.addEventListener("click", initialLoad);
  }
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && state && !busy && !dialog.open && tab !== "settings")
    refresh().catch((e) => notify(e.message));
});
setInterval(() => {
  if (state && !document.hidden && !busy && !dialog.open && tab !== "settings")
    refresh().catch(() => {});
}, 60000);
initialLoad();
