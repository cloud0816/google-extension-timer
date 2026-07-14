/**
 * Focus Clock — new tab app
 * All user data lives in localStorage under STORAGE_KEY.
 * Chrome removes this extension origin (including localStorage) on uninstall.
 */

const STORAGE_KEY = "focusClockData";

const defaultState = () => ({
  theme: "system", // system | light | dark
  background: { type: "default", color: null, image: null },
  alarms: [],
  timer: null,
  stopwatch: {
    status: "idle", // idle | running | paused
    elapsedMs: 0,
    startedAt: null,
    laps: [],
  },
});

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return {
      ...defaultState(),
      ...parsed,
      stopwatch: { ...defaultState().stopwatch, ...(parsed.stopwatch || {}) },
      background: { ...defaultState().background, ...(parsed.background || {}) },
      alarms: Array.isArray(parsed.alarms) ? parsed.alarms : [],
    };
  } catch {
    return defaultState();
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  mirrorToChromeStorage(state);
  syncChromeAlarms(state);
}

function mirrorToChromeStorage(state) {
  try {
    chrome.runtime?.sendMessage?.({ type: "MIRROR_STORAGE", payload: state });
  } catch {
    /* popup / offline */
  }
}

function syncChromeAlarms(state) {
  try {
    chrome.runtime?.sendMessage?.({
      type: "SYNC_ALARMS",
      payload: { alarms: state.alarms, timer: state.timer },
    });
  } catch {
    /* ignore */
  }
}

let state = loadState();

/* ---------- Theme ---------- */

function resolveTheme(pref) {
  if (pref === "light" || pref === "dark") return pref;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme() {
  const resolved = resolveTheme(state.theme);
  document.documentElement.setAttribute("data-theme", resolved);

  const btn = document.getElementById("themeBtn");
  btn.querySelector(".theme-icon-system").hidden = state.theme !== "system";
  btn.querySelector(".theme-icon-light").hidden = state.theme !== "light";
  btn.querySelector(".theme-icon-dark").hidden = state.theme !== "dark";
}

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (state.theme === "system") applyTheme();
});

/* ---------- Background ---------- */

function applyBackground() {
  const layer = document.getElementById("bgLayer");
  const bg = state.background;

  layer.style.backgroundImage = "";
  layer.style.backgroundColor = "";

  if (bg.type === "color" && bg.color) {
    layer.style.backgroundColor = bg.color;
  } else if (bg.type === "image" && bg.image) {
    layer.style.backgroundImage = `url(${bg.image})`;
    layer.style.backgroundColor = "#000";
  } else {
    layer.style.backgroundColor = getComputedStyle(document.documentElement)
      .getPropertyValue("--bg")
      .trim();
  }
}

/* ---------- Utils ---------- */

function pad(n, w = 2) {
  return String(n).padStart(w, "0");
}

function formatHMS(ms, withCentis = false) {
  const safe = Math.max(0, Math.floor(ms));
  const centis = Math.floor((safe % 1000) / 10);
  const totalSec = Math.floor(safe / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const base = `${pad(h)}:${pad(m)}:${pad(s)}`;
  return withCentis ? `${base}.${pad(centis)}` : base;
}

function formatDateTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function todayInputValue() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function stopwatchElapsed() {
  const sw = state.stopwatch;
  if (sw.status === "running" && sw.startedAt) {
    return sw.elapsedMs + (Date.now() - sw.startedAt);
  }
  return sw.elapsedMs;
}

function timerRemainingMs() {
  const t = state.timer;
  if (!t) return 0;
  if (t.status === "paused") return t.remainingMs ?? 0;
  if (t.status === "running" && t.endsAt) {
    return Math.max(0, new Date(t.endsAt).getTime() - Date.now());
  }
  if (t.status === "finished") return 0;
  return t.remainingMs ?? 0;
}

/* ---------- Wall clock ---------- */

function tickWallClock() {
  const now = new Date();
  const clock = document.getElementById("wallClock");
  const dateEl = document.getElementById("wallDate");
  clock.textContent = now.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: undefined,
  });
  clock.setAttribute("datetime", now.toISOString());
  dateEl.textContent = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/* ---------- Status cards ---------- */

function renderStatus() {
  const row = document.getElementById("statusRow");

  const nextAlarm = state.alarms
    .filter((a) => a.status === "active")
    .sort((a, b) => new Date(a.at) - new Date(b.at))[0];

  const alarmCard = (() => {
    if (!nextAlarm) {
      return statusCard("Alarm", null, "No active alarm");
    }
    const left = Math.max(0, new Date(nextAlarm.at).getTime() - Date.now());
    return statusCard(
      "Alarm",
      formatHMS(left),
      `${nextAlarm.label} · ${formatDateTime(nextAlarm.at)}`,
      true
    );
  })();

  const timerCard = (() => {
    const t = state.timer;
    if (!t || t.status === "idle") {
      return statusCard("Timer", null, "No active timer");
    }
    if (t.status === "finished") {
      return statusCard("Timer", "00:00:00", `${t.label} · finished`, true);
    }
    const left = timerRemainingMs();
    const meta =
      t.status === "paused"
        ? `${t.label} · paused`
        : `${t.label} · ${t.method === "end" ? "until " + formatDateTime(t.endsAt) : "running"}`;
    return statusCard("Timer", formatHMS(left), meta, true);
  })();

  const swCard = (() => {
    const sw = state.stopwatch;
    if (sw.status === "idle" && sw.elapsedMs === 0) {
      return statusCard("Stopwatch", null, "Not started");
    }
    return statusCard(
      "Stopwatch",
      formatHMS(stopwatchElapsed(), true),
      sw.status === "running" ? "Running" : sw.status === "paused" ? "Paused" : "Stopped",
      sw.status !== "idle"
    );
  })();

  row.replaceChildren(alarmCard, timerCard, swCard);
}

function statusCard(label, value, meta, active = false) {
  const el = document.createElement("article");
  el.className = "status-card";
  el.dataset.active = String(!!active && value != null);

  const lab = document.createElement("div");
  lab.className = "status-label";
  lab.textContent = label;

  if (value == null) {
    const empty = document.createElement("div");
    empty.className = "status-empty";
    empty.textContent = meta;
    el.append(lab, empty);
  } else {
    const val = document.createElement("div");
    val.className = "status-value";
    val.textContent = value;
    const m = document.createElement("div");
    m.className = "status-meta";
    m.textContent = meta;
    el.append(lab, val, m);
  }
  return el;
}

/* ---------- Alarm UI ---------- */

function ensureAlarmDefaults() {
  const date = document.getElementById("alarmDate");
  const time = document.getElementById("alarmTime");
  if (!date.value) date.value = todayInputValue();
  if (!time.value) {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    time.value = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
}

function renderAlarms() {
  const list = document.getElementById("alarmList");
  const alarms = [...state.alarms].sort((a, b) => new Date(a.at) - new Date(b.at));

  if (!alarms.length) {
    list.innerHTML = `<li class="empty-note">No alarms yet</li>`;
    return;
  }

  list.replaceChildren(
    ...alarms.map((a) => {
      const li = document.createElement("li");
      li.className = "list-item";

      const info = document.createElement("div");
      info.className = "info";

      const title = document.createElement("div");
      title.className = "title";
      title.textContent = a.label;
      const badge = document.createElement("span");
      badge.className = `badge${a.status === "fired" ? " fired" : ""}`;
      badge.textContent = a.status;
      title.appendChild(badge);

      const sub = document.createElement("div");
      sub.className = "sub mono";
      const left = new Date(a.at).getTime() - Date.now();
      sub.textContent =
        a.status === "active"
          ? `${formatDateTime(a.at)} · in ${formatHMS(Math.max(0, left))}`
          : formatDateTime(a.at);

      info.append(title, sub);

      const actions = document.createElement("div");
      actions.className = "item-actions";

      if (a.status === "fired") {
        const dismiss = document.createElement("button");
        dismiss.type = "button";
        dismiss.className = "btn ghost sm";
        dismiss.textContent = "Dismiss";
        dismiss.addEventListener("click", () => {
          state.alarms = state.alarms.filter((x) => x.id !== a.id);
          persist();
        });
        actions.appendChild(dismiss);
      }

      const del = document.createElement("button");
      del.type = "button";
      del.className = "btn danger sm";
      del.textContent = "Delete";
      del.addEventListener("click", () => {
        state.alarms = state.alarms.filter((x) => x.id !== a.id);
        persist();
      });
      actions.appendChild(del);

      li.append(info, actions);
      return li;
    })
  );
}

function onAlarmSubmit(e) {
  e.preventDefault();
  const label =
    document.getElementById("alarmLabel").value.trim() ||
    `Alarm ${state.alarms.length + 1}`;
  const date = document.getElementById("alarmDate").value;
  const time = document.getElementById("alarmTime").value;
  const at = new Date(`${date}T${time}`);

  if (Number.isNaN(at.getTime())) {
    alert("Please choose a valid date and time.");
    return;
  }
  if (at.getTime() <= Date.now()) {
    alert("Alarm must be in the future.");
    return;
  }

  state.alarms.push({
    id: uid(),
    label,
    at: at.toISOString(),
    status: "active",
  });
  document.getElementById("alarmLabel").value = "";
  persist();
}

/* ---------- Timer ---------- */

function setTimerMethod(method) {
  document.querySelectorAll(".method-toggle .chip").forEach((c) => {
    c.classList.toggle("active", c.dataset.method === method);
  });
  document.getElementById("timerDurationForm").hidden = method !== "duration";
  document.getElementById("timerEndForm").hidden = method !== "end";
}

function renderTimer() {
  const display = document.getElementById("timerDisplay");
  const remaining = document.getElementById("timerRemaining");
  const meta = document.getElementById("timerMeta");
  const pauseBtn = document.getElementById("timerPauseBtn");
  const resetBtn = document.getElementById("timerResetBtn");
  const t = state.timer;

  const active = t && (t.status === "running" || t.status === "paused" || t.status === "finished");
  display.hidden = !active;
  pauseBtn.hidden = !t || (t.status !== "running" && t.status !== "paused");
  resetBtn.hidden = !active;

  if (!active) return;

  const left = timerRemainingMs();
  remaining.textContent = formatHMS(left);

  if (t.status === "finished" || left === 0) {
    meta.textContent = `${t.label} finished`;
    pauseBtn.hidden = true;
    if (t.status !== "finished") {
      t.status = "finished";
      t.remainingMs = 0;
      saveState(state);
    }
  } else if (t.status === "paused") {
    meta.textContent = `${t.label} · paused`;
    pauseBtn.textContent = "Resume";
  } else {
    meta.textContent =
      t.method === "end"
        ? `${t.label} · ends ${formatDateTime(t.endsAt)}`
        : `${t.label} · running`;
    pauseBtn.textContent = "Pause";
  }
}

function startDurationTimer(e) {
  e.preventDefault();
  const h = Number(document.getElementById("timerHours").value) || 0;
  const m = Number(document.getElementById("timerMinutes").value) || 0;
  const s = Number(document.getElementById("timerSeconds").value) || 0;
  const totalMs = ((h * 3600 + m * 60 + s) * 1000) | 0;
  if (totalMs <= 0) {
    alert("Set a duration greater than zero.");
    return;
  }
  const label = document.getElementById("timerLabel").value.trim() || "Timer";
  const endsAt = new Date(Date.now() + totalMs).toISOString();
  state.timer = {
    label,
    method: "duration",
    status: "running",
    durationMs: totalMs,
    remainingMs: totalMs,
    endsAt,
  };
  persist();
}

function startEndTimer(e) {
  e.preventDefault();
  const label = document.getElementById("timerEndLabel").value.trim() || "Timer";
  const date = document.getElementById("timerEndDate").value;
  const time = document.getElementById("timerEndTime").value;
  const ends = new Date(`${date}T${time}`);
  if (Number.isNaN(ends.getTime())) {
    alert("Please choose a valid end date and time.");
    return;
  }
  const remainingMs = ends.getTime() - Date.now();
  if (remainingMs <= 0) {
    alert("End time must be in the future.");
    return;
  }
  state.timer = {
    label,
    method: "end",
    status: "running",
    durationMs: remainingMs,
    remainingMs,
    endsAt: ends.toISOString(),
  };
  persist();
}

function toggleTimerPause() {
  const t = state.timer;
  if (!t) return;
  if (t.status === "running") {
    t.remainingMs = timerRemainingMs();
    t.status = "paused";
    t.endsAt = null;
  } else if (t.status === "paused") {
    t.endsAt = new Date(Date.now() + (t.remainingMs || 0)).toISOString();
    t.status = "running";
  }
  persist();
}

function resetTimer() {
  state.timer = null;
  persist();
}

function ensureTimerEndDefaults() {
  const date = document.getElementById("timerEndDate");
  const time = document.getElementById("timerEndTime");
  if (!date.value) date.value = todayInputValue();
  if (!time.value) {
    const d = new Date(Date.now() + 30 * 60 * 1000);
    time.value = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
}

/* ---------- Stopwatch ---------- */

function renderStopwatch() {
  const el = document.getElementById("stopwatchTime");
  el.textContent = formatHMS(stopwatchElapsed(), true);

  const sw = state.stopwatch;
  const startBtn = document.getElementById("swStartBtn");
  const lapBtn = document.getElementById("swLapBtn");
  const resetBtn = document.getElementById("swResetBtn");

  if (sw.status === "running") {
    startBtn.textContent = "Pause";
    lapBtn.disabled = false;
    resetBtn.disabled = false;
  } else if (sw.status === "paused") {
    startBtn.textContent = "Resume";
    lapBtn.disabled = true;
    resetBtn.disabled = false;
  } else {
    startBtn.textContent = "Start";
    lapBtn.disabled = true;
    resetBtn.disabled = sw.elapsedMs === 0 && sw.laps.length === 0;
  }

  const lapList = document.getElementById("lapList");
  if (!sw.laps.length) {
    lapList.replaceChildren();
    return;
  }
  lapList.replaceChildren(
    ...[...sw.laps].reverse().map((lap, idx, arr) => {
      const li = document.createElement("li");
      li.className = "lap-item";
      const n = arr.length - idx;
      li.innerHTML = `<span>Lap ${n}</span><span class="mono">${formatHMS(lap, true)}</span>`;
      return li;
    })
  );
}

function toggleStopwatch() {
  const sw = state.stopwatch;
  if (sw.status === "running") {
    sw.elapsedMs = stopwatchElapsed();
    sw.startedAt = null;
    sw.status = "paused";
  } else {
    sw.startedAt = Date.now();
    sw.status = "running";
  }
  persist();
}

function lapStopwatch() {
  if (state.stopwatch.status !== "running") return;
  state.stopwatch.laps.push(stopwatchElapsed());
  persist();
}

function resetStopwatch() {
  state.stopwatch = {
    status: "idle",
    elapsedMs: 0,
    startedAt: null,
    laps: [],
  };
  persist();
}

/* ---------- Expire checks ---------- */

function checkExpirations() {
  let changed = false;
  const now = Date.now();

  state.alarms = state.alarms.map((a) => {
    if (a.status === "active" && new Date(a.at).getTime() <= now) {
      changed = true;
      return { ...a, status: "fired" };
    }
    return a;
  });

  if (state.timer?.status === "running" && state.timer.endsAt) {
    if (new Date(state.timer.endsAt).getTime() <= now) {
      state.timer.status = "finished";
      state.timer.remainingMs = 0;
      changed = true;
    }
  }

  if (changed) saveState(state);
}

/* ---------- Persist + render ---------- */

function persist() {
  saveState(state);
  renderAll();
}

function renderAll() {
  applyTheme();
  applyBackground();
  renderStatus();
  renderAlarms();
  renderTimer();
  renderStopwatch();
}

/* ---------- Tabs ---------- */

function switchPanel(name) {
  document.querySelectorAll(".tool-tabs .tab").forEach((tab) => {
    const on = tab.dataset.panel === name;
    tab.classList.toggle("active", on);
    tab.setAttribute("aria-selected", String(on));
  });
  document.querySelectorAll(".panel").forEach((panel) => {
    const on = panel.id === `panel-${name}`;
    panel.classList.toggle("active", on);
    panel.hidden = !on;
  });
}

/* ---------- Wire up ---------- */

function init() {
  applyTheme();
  applyBackground();
  ensureAlarmDefaults();
  ensureTimerEndDefaults();
  renderAll();
  tickWallClock();

  // Sync chrome alarms / mirror on load
  syncChromeAlarms(state);
  mirrorToChromeStorage(state);

  document.querySelectorAll(".tool-tabs .tab").forEach((tab) => {
    tab.addEventListener("click", () => switchPanel(tab.dataset.panel));
  });

  document.getElementById("alarmForm").addEventListener("submit", onAlarmSubmit);

  document.querySelectorAll(".method-toggle .chip").forEach((chip) => {
    chip.addEventListener("click", () => setTimerMethod(chip.dataset.method));
  });
  document.getElementById("timerDurationForm").addEventListener("submit", startDurationTimer);
  document.getElementById("timerEndForm").addEventListener("submit", startEndTimer);
  document.getElementById("timerPauseBtn").addEventListener("click", toggleTimerPause);
  document.getElementById("timerResetBtn").addEventListener("click", resetTimer);

  document.getElementById("swStartBtn").addEventListener("click", toggleStopwatch);
  document.getElementById("swLapBtn").addEventListener("click", lapStopwatch);
  document.getElementById("swResetBtn").addEventListener("click", resetStopwatch);

  // Theme menu
  const themeBtn = document.getElementById("themeBtn");
  const themeMenu = document.getElementById("themeMenu");
  themeBtn.addEventListener("click", () => {
    const r = themeBtn.getBoundingClientRect();
    themeMenu.style.top = `${r.bottom + 8}px`;
    themeMenu.style.left = `${Math.min(r.left, window.innerWidth - 180)}px`;
    themeMenu.showModal();
  });
  themeMenu.addEventListener("close", () => {
    const val = themeMenu.returnValue;
    if (val === "system" || val === "light" || val === "dark") {
      state.theme = val;
      persist();
    }
  });
  themeMenu.addEventListener("click", (e) => {
    if (e.target === themeMenu) themeMenu.close("cancel");
  });

  // Background modal
  const bgModal = document.getElementById("bgModal");
  document.getElementById("bgBtn").addEventListener("click", () => {
    const color = document.getElementById("bgColor");
    if (state.background.color) color.value = state.background.color;
    bgModal.showModal();
  });
  document.getElementById("applyColorBtn").addEventListener("click", () => {
    state.background = {
      type: "color",
      color: document.getElementById("bgColor").value,
      image: null,
    };
    persist();
  });
  document.getElementById("bgImage").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4.5 * 1024 * 1024) {
      alert("Please choose an image under ~4.5 MB (localStorage limit).");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      state.background = {
        type: "image",
        color: null,
        image: reader.result,
      };
      persist();
    };
    reader.readAsDataURL(file);
  });
  document.getElementById("resetBgBtn").addEventListener("click", () => {
    state.background = { type: "default", color: null, image: null };
    document.getElementById("bgImage").value = "";
    persist();
  });

  // Listen for fired events from service worker
  try {
    chrome.storage?.onChanged?.addListener((changes, area) => {
      if (area !== "local" || !changes[STORAGE_KEY]) return;
      const next = changes[STORAGE_KEY].newValue;
      if (!next) return;
      state = {
        ...defaultState(),
        ...next,
        stopwatch: { ...defaultState().stopwatch, ...(next.stopwatch || {}) },
        background: { ...defaultState().background, ...(next.background || {}) },
        alarms: Array.isArray(next.alarms) ? next.alarms : [],
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      renderAll();
    });
  } catch {
    /* ignore */
  }

  setInterval(() => {
    tickWallClock();
    checkExpirations();
    renderStatus();
    renderTimer();
    if (state.stopwatch.status === "running") renderStopwatch();
    // Refresh alarm countdowns occasionally
    if (state.alarms.some((a) => a.status === "active")) renderAlarms();
  }, 200);
}

init();
