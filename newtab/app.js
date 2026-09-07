/**
 * Focus Clock — new tab app
 * Data in localStorage; Chrome clears extension origin on uninstall.
 */

import { CITIES, CITY_BY_ID, DEFAULT_CITY_IDS } from "./cities.js";
import { subsolarPoint } from "./solar.js";
import { createWorldMap, cityReadout } from "./world-clock.js";

const STORAGE_KEY = "focusClockData";

const CLOCK_FORMATS = ["auto", "12", "24"];

const defaultWorld = () => ({
  enabled: true,
  cities: [...DEFAULT_CITY_IDS],
  clockFormat: "auto",
  showPins: true,
});

const defaultState = () => ({
  theme: "system",
  background: { type: "default", color: null, image: null },
  alarms: [],
  timers: [],
  stopwatches: [],
  world: defaultWorld(),
});

/** Drops cities that are no longer in the catalogue and keeps an empty list empty. */
function normalizeWorld(world) {
  const base = defaultWorld();
  if (!world || typeof world !== "object") return base;
  const cities = Array.isArray(world.cities)
    ? [...new Set(world.cities.filter((id) => CITY_BY_ID.has(id)))]
    : base.cities;
  return {
    enabled: world.enabled !== false,
    cities,
    clockFormat: CLOCK_FORMATS.includes(world.clockFormat) ? world.clockFormat : "auto",
    showPins: world.showPins !== false,
  };
}

function migrateState(parsed) {
  const base = defaultState();
  const next = {
    ...base,
    ...parsed,
    background: { ...base.background, ...(parsed.background || {}) },
    alarms: Array.isArray(parsed.alarms) ? parsed.alarms : [],
    timers: Array.isArray(parsed.timers) ? parsed.timers : [],
    stopwatches: Array.isArray(parsed.stopwatches) ? parsed.stopwatches : [],
    world: normalizeWorld(parsed.world),
  };

  // Migrate old single timer / stopwatch
  if (!parsed.timers && parsed.timer) {
    const t = parsed.timer;
    next.timers = [
      {
        id: uid(),
        label: t.label || "Timer",
        method: t.method || "duration",
        status: t.status === "idle" ? "finished" : t.status,
        durationMs: t.durationMs || 0,
        remainingMs: t.remainingMs || 0,
        endsAt: t.endsAt || null,
      },
    ];
  }
  if (!parsed.stopwatches && parsed.stopwatch) {
    const s = parsed.stopwatch;
    next.stopwatches = [
      {
        id: uid(),
        label: "Stopwatch",
        status: s.status || "idle",
        elapsedMs: s.elapsedMs || 0,
        startedAt: s.startedAt || null,
        laps: Array.isArray(s.laps) ? s.laps : [],
      },
    ];
  }

  return next;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return migrateState(JSON.parse(raw));
  } catch {
    return defaultState();
  }
}

function toPayload(state) {
  return {
    theme: state.theme,
    background: state.background,
    alarms: state.alarms,
    timers: state.timers,
    stopwatches: state.stopwatches,
    world: state.world,
  };
}

function saveState(state) {
  const payload = toPayload(state);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  mirrorToChromeStorage(payload);
  syncChromeAlarms(payload);
}

function mirrorToChromeStorage(payload) {
  try {
    chrome.runtime?.sendMessage?.({ type: "MIRROR_STORAGE", payload });
  } catch {
    /* ignore */
  }
}

function syncChromeAlarms(payload) {
  try {
    chrome.runtime?.sendMessage?.({
      type: "SYNC_ALARMS",
      payload: { alarms: payload.alarms, timers: payload.timers },
    });
  } catch {
    /* ignore */
  }
}

let state = loadState();

/* ---------- Utils ---------- */

function pad(n, w = 2) {
  return String(n).padStart(w, "0");
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
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
  return new Date(iso).toLocaleString(undefined, {
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

function timerRemainingMs(t) {
  if (!t) return 0;
  if (t.status === "paused") return t.remainingMs ?? 0;
  if (t.status === "running" && t.endsAt) {
    return Math.max(0, new Date(t.endsAt).getTime() - Date.now());
  }
  return t.remainingMs ?? 0;
}

function stopwatchElapsed(sw) {
  if (sw.status === "running" && sw.startedAt) {
    return sw.elapsedMs + (Date.now() - sw.startedAt);
  }
  return sw.elapsedMs;
}

/* ---------- Theme / background ---------- */

function resolveTheme(pref) {
  if (pref === "light" || pref === "dark") return pref;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme() {
  document.documentElement.setAttribute("data-theme", resolveTheme(state.theme));
  document.getElementById("themeBtn").dataset.themePref = state.theme;
}

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (state.theme === "system") applyTheme();
});

function applyBackground() {
  const layer = document.getElementById("bgLayer");
  const worldBg = document.getElementById("worldBg");
  const bg = state.background;
  layer.style.backgroundImage = "";
  layer.style.backgroundColor = "";

  const useWorld = bg.type === "world";
  document.body.classList.toggle("has-world-bg", useWorld);
  worldBg.hidden = !useWorld;
  if (useWorld) ensureWorldMap();

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

/* ---------- Wall clock ---------- */

function tickWallClock() {
  const now = new Date();
  const clock = document.getElementById("wallClock");
  clock.textContent = now.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  clock.setAttribute("datetime", now.toISOString());
  document.getElementById("wallDate").textContent = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/* ---------- World clock ---------- */

const PHASE_ICON = {
  day: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round">
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
    </svg>`,
  twilight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round">
      <path d="M3 17h18" />
      <path d="M7.5 17a4.5 4.5 0 0 1 9 0" />
      <path d="M12 4.5v2.2M5.6 7.1l1.6 1.6M18.4 7.1l-1.6 1.6M2.5 12.5h2.2M19.3 12.5h2.2" />
    </svg>`,
  night: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round">
      <path d="M20.5 14.3A8.6 8.6 0 1 1 9.7 3.5a6.9 6.9 0 0 0 10.8 10.8z" />
    </svg>`,
};

const PHASE_TEXT = { day: "Daytime", twilight: "Twilight", night: "Night" };

let worldMap = null;
let lastCardsKey = "";
let lastMapKey = "";

function ensureWorldMap() {
  if (!worldMap) {
    worldMap = createWorldMap();
    document.getElementById("worldBg").appendChild(worldMap.el);
  }
  return worldMap;
}

/**
 * Areas the map should keep its labels out of, so a city name never ends up
 * half-hidden behind the clock or a card.
 */
function contentRects() {
  return [".top-bar", ".hero", ".world-row", ".status-row"]
    .map((sel) => document.querySelector(sel))
    .filter((node) => node && !node.hidden)
    .map((node) => node.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0);
}

/** Chosen cities with their current readouts, ordered west to east. */
function worldEntries(now, sub) {
  return state.world.cities
    .map((id) => CITY_BY_ID.get(id))
    .filter(Boolean)
    .map((city) => ({ city, readout: cityReadout(city, now, state.world.clockFormat, sub) }))
    .sort(
      (a, b) =>
        a.readout.offsetMinutes - b.readout.offsetMinutes ||
        a.city.name.localeCompare(b.city.name)
    );
}

function worldCard({ city, readout }) {
  const card = document.createElement("article");
  card.className = `world-card is-${readout.phase}`;
  card.title = `${city.name}, ${city.country} — ${PHASE_TEXT[readout.phase]}`;

  const top = document.createElement("div");
  top.className = "world-card-top";

  const icon = document.createElement("span");
  icon.className = "world-phase";
  icon.innerHTML = PHASE_ICON[readout.phase];

  const name = document.createElement("span");
  name.className = "world-city";
  name.textContent = city.name;

  const rel = document.createElement("span");
  rel.className = "world-rel";
  rel.textContent = readout.relativeLabel;

  top.append(icon, name, rel);

  const time = document.createElement("div");
  time.className = "world-time mono";
  time.textContent = readout.time;

  const meta = document.createElement("div");
  meta.className = "world-meta";
  meta.textContent = `${readout.dayLabel} · ${readout.offsetLabel}`;

  card.append(top, time, meta);
  return card;
}

/**
 * Cards only change once a minute and the terminator crawls a quarter of a
 * degree per minute, so both are keyed rather than rebuilt on every 200ms tick.
 */
function renderWorldClock(now = new Date(), force = false) {
  const world = state.world;
  const settingsKey =
    `${world.enabled}|${world.showPins}|${world.clockFormat}|` +
    `${world.cities.join(",")}|${state.background.type}`;
  const cardsKey = `${settingsKey}|${Math.floor(now.getTime() / 60000)}`;
  const mapKey = `${settingsKey}|${Math.floor(now.getTime() / 15000)}`;
  if (!force && cardsKey === lastCardsKey && mapKey === lastMapKey) return;

  const sub = subsolarPoint(now);
  const entries = worldEntries(now, sub);

  if (force || cardsKey !== lastCardsKey) {
    lastCardsKey = cardsKey;
    const row = document.getElementById("worldRow");
    const show = world.enabled && entries.length > 0;
    row.hidden = !show;
    row.replaceChildren(...(show ? entries.map(worldCard) : []));
  }

  if (force || mapKey !== lastMapKey) {
    lastMapKey = mapKey;
    if (state.background.type === "world") {
      ensureWorldMap().update({
        date: now,
        cities: entries.map((e) => e.city),
        showPins: world.showPins,
        clockFormat: world.clockFormat,
        avoid: contentRects(),
      });
    }
  }
}

function renderWorldSettings() {
  const world = state.world;
  document.getElementById("worldEnabled").checked = world.enabled;
  document.getElementById("worldShowPins").checked = world.showPins;
  document.getElementById("worldFormat").value = world.clockFormat;

  const select = document.getElementById("worldCitySelect");
  const chosen = new Set(world.cities);
  const available = CITIES.filter((c) => !chosen.has(c.id));
  const keep = select.value;
  select.replaceChildren(
    ...available.map((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = `${c.name} — ${c.country}`;
      return opt;
    })
  );
  if (available.some((c) => c.id === keep)) select.value = keep;
  select.disabled = available.length === 0;

  const list = document.getElementById("worldList");
  if (!world.cities.length) {
    list.innerHTML = `<li class="empty-note">No cities yet</li>`;
    return;
  }
  const now = new Date();
  const sub = subsolarPoint(now);
  list.replaceChildren(
    ...worldEntries(now, sub).map(({ city, readout }) =>
      listItem(
        `${city.name}, ${city.country}`,
        readout.phase,
        `${readout.time} · ${readout.dayLabel} · ${readout.offsetLabel} (${readout.relativeLabel})`,
        [
          actionBtn("Remove", "danger", () => {
            state.world.cities = state.world.cities.filter((id) => id !== city.id);
            persist();
          }),
        ]
      )
    )
  );
}

/* ---------- Status (home) ---------- */

function renderStatus() {
  const row = document.getElementById("statusRow");
  const alarms = state.alarms
    .filter((a) => a.status === "active" || a.status === "fired")
    .sort((a, b) => new Date(a.at) - new Date(b.at));
  const timers = state.timers.filter((t) =>
    ["running", "paused", "finished"].includes(t.status)
  );
  const stopwatches = state.stopwatches.filter(
    (s) => s.status === "running" || s.status === "paused" || s.elapsedMs > 0
  );

  row.replaceChildren(
    buildStatusCard(
      "Alarm",
      alarms,
      (a) => {
        if (a.status === "fired") {
          return { value: "Ringing", meta: a.label };
        }
        const left = Math.max(0, new Date(a.at).getTime() - Date.now());
        return {
          value: formatHMS(left),
          meta: `${a.label} · ${formatDateTime(a.at)}`,
        };
      },
      "No active alarm"
    ),
    buildStatusCard(
      "Timer",
      timers,
      (t) => {
        const left = timerRemainingMs(t);
        const value =
          t.status === "finished" || left === 0 ? "00:00:00" : formatHMS(left);
        let meta = t.label;
        if (t.status === "paused") meta += " · paused";
        else if (t.status === "finished") meta += " · finished";
        else if (t.method === "end" && t.endsAt) meta += ` · until ${formatDateTime(t.endsAt)}`;
        else meta += " · running";
        return { value, meta };
      },
      "No active timer"
    ),
    buildStatusCard(
      "Stopwatch",
      stopwatches,
      (s) => ({
        value: formatHMS(stopwatchElapsed(s), true),
        meta: `${s.label} · ${s.status === "running" ? "running" : s.status === "paused" ? "paused" : "stopped"}`,
      }),
      "Not started"
    )
  );
}

function buildStatusCard(label, items, mapItem, emptyText) {
  const card = document.createElement("article");
  card.className = "status-card";
  if (items.length) card.classList.add("has-items");

  const lab = document.createElement("div");
  lab.className = "status-label";
  lab.textContent = label;
  card.appendChild(lab);

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "status-empty";
    empty.textContent = emptyText;
    card.appendChild(empty);
    return card;
  }

  const ul = document.createElement("ul");
  ul.className = "status-items";
  for (const item of items) {
    const { value, meta } = mapItem(item);
    const li = document.createElement("li");
    li.className = "status-item";
    li.innerHTML = `<div class="status-value">${value}</div><div class="status-meta">${escapeHtml(meta)}</div>`;
    ul.appendChild(li);
  }
  card.appendChild(ul);
  return card;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ---------- Settings lists ---------- */

function ensureDefaults() {
  const alarmDate = document.getElementById("alarmDate");
  const alarmTime = document.getElementById("alarmTime");
  if (!alarmDate.value) alarmDate.value = todayInputValue();
  if (!alarmTime.value) {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    alarmTime.value = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  const endDate = document.getElementById("timerEndDate");
  const endTime = document.getElementById("timerEndTime");
  if (!endDate.value) endDate.value = todayInputValue();
  if (!endTime.value) {
    const d = new Date(Date.now() + 30 * 60 * 1000);
    endTime.value = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
}

function renderAlarmList() {
  const list = document.getElementById("alarmList");
  const alarms = [...state.alarms].sort((a, b) => new Date(a.at) - new Date(b.at));
  if (!alarms.length) {
    list.innerHTML = `<li class="empty-note">No alarms yet</li>`;
    return;
  }
  list.replaceChildren(
    ...alarms.map((a) => {
      const left = new Date(a.at).getTime() - Date.now();
      const sub =
        a.status === "active"
          ? `${formatDateTime(a.at)} · in ${formatHMS(Math.max(0, left))}`
          : formatDateTime(a.at);
      return listItem(a.label, a.status, sub, [
        actionBtn("Delete", "danger", () => {
          state.alarms = state.alarms.filter((x) => x.id !== a.id);
          persist();
        }),
      ]);
    })
  );
}

function renderTimerList() {
  const list = document.getElementById("timerList");
  if (!state.timers.length) {
    list.innerHTML = `<li class="empty-note">No timers yet</li>`;
    return;
  }
  list.replaceChildren(
    ...state.timers.map((t) => {
      const left = timerRemainingMs(t);
      const sub =
        t.status === "finished"
          ? "Finished"
          : t.status === "paused"
            ? `Paused · ${formatHMS(left)} left`
            : `${formatHMS(left)} left${t.endsAt ? ` · ends ${formatDateTime(t.endsAt)}` : ""}`;

      const actions = [];
      if (t.status === "running" || t.status === "paused") {
        actions.push(
          actionBtn(t.status === "running" ? "Pause" : "Resume", "ghost", () => {
            toggleTimerPause(t.id);
          })
        );
      }
      actions.push(
        actionBtn("Delete", "danger", () => {
          state.timers = state.timers.filter((x) => x.id !== t.id);
          persist();
        })
      );

      return listItem(t.label, t.status, sub, actions);
    })
  );
}

function renderStopwatchList() {
  const list = document.getElementById("stopwatchList");
  if (!state.stopwatches.length) {
    list.innerHTML = `<li class="empty-note">No stopwatches yet</li>`;
    return;
  }
  list.replaceChildren(
    ...state.stopwatches.map((s) => {
      const elapsed = formatHMS(stopwatchElapsed(s), true);
      const lapNote =
        s.laps.length > 0 ? ` · ${s.laps.length} lap${s.laps.length === 1 ? "" : "s"}` : "";
      const sub = `${elapsed} · ${s.status}${lapNote}`;

      const actions = [];
      if (s.status === "running") {
        actions.push(actionBtn("Pause", "ghost", () => toggleStopwatch(s.id)));
        actions.push(actionBtn("Lap", "ghost", () => lapStopwatch(s.id)));
      } else if (s.status === "paused" || (s.status === "idle" && s.elapsedMs > 0)) {
        actions.push(actionBtn("Resume", "ghost", () => toggleStopwatch(s.id)));
        actions.push(
          actionBtn("Reset", "ghost", () => {
            const sw = state.stopwatches.find((x) => x.id === s.id);
            if (!sw) return;
            sw.status = "idle";
            sw.elapsedMs = 0;
            sw.startedAt = null;
            sw.laps = [];
            persist();
          })
        );
      } else {
        actions.push(actionBtn("Start", "ghost", () => toggleStopwatch(s.id)));
      }
      actions.push(
        actionBtn("Delete", "danger", () => {
          state.stopwatches = state.stopwatches.filter((x) => x.id !== s.id);
          persist();
        })
      );

      return listItem(s.label, s.status, sub, actions, lapsLine(s.laps));
    })
  );
}

/** Most recent laps, newest first, with each split alongside the total. */
function lapsLine(laps) {
  if (!laps.length) return null;
  const el = document.createElement("div");
  el.className = "laps-inline mono";
  el.textContent = laps
    .map((total, i) => ({ n: i + 1, total, split: total - (i > 0 ? laps[i - 1] : 0) }))
    .slice(-4)
    .reverse()
    .map((lap) => `#${lap.n} ${formatHMS(lap.total, true)} (+${formatHMS(lap.split, true)})`)
    .join("   ");
  return el;
}

function listItem(title, status, sub, actions, extra = null) {
  const li = document.createElement("li");
  li.className = "list-item";

  const info = document.createElement("div");
  info.className = "info";

  const titleEl = document.createElement("div");
  titleEl.className = "title";
  titleEl.textContent = title;
  const badge = document.createElement("span");
  badge.className = `badge ${status}`;
  badge.textContent = status;
  titleEl.appendChild(badge);

  const subEl = document.createElement("div");
  subEl.className = "sub mono";
  subEl.textContent = sub;

  info.append(titleEl, subEl);
  if (extra) info.appendChild(extra);

  const act = document.createElement("div");
  act.className = "item-actions";
  actions.forEach((b) => act.appendChild(b));

  li.append(info, act);
  return li;
}

function actionBtn(label, kind, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `btn ${kind} sm`;
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

/* ---------- Mutations ---------- */

function onAlarmSubmit(e) {
  e.preventDefault();
  const label =
    document.getElementById("alarmLabel").value.trim() ||
    `Alarm ${state.alarms.length + 1}`;
  const date = document.getElementById("alarmDate").value;
  const time = document.getElementById("alarmTime").value;
  const at = new Date(`${date}T${time}`);
  if (Number.isNaN(at.getTime()) || at.getTime() <= Date.now()) {
    alert("Choose a future date and time.");
    return;
  }
  state.alarms.push({ id: uid(), label, at: at.toISOString(), status: "active" });
  document.getElementById("alarmLabel").value = "";
  persist();
}

function setTimerMethod(method) {
  document.querySelectorAll(".method-toggle .chip").forEach((c) => {
    c.classList.toggle("is-active", c.dataset.method === method);
  });
  document.querySelectorAll(".method-form").forEach((form) => {
    const on = form.dataset.method === method;
    form.classList.toggle("is-active", on);
    form.hidden = !on;
  });
}

function addDurationTimer(e) {
  e.preventDefault();
  const h = Number(document.getElementById("timerHours").value) || 0;
  const m = Number(document.getElementById("timerMinutes").value) || 0;
  const s = Number(document.getElementById("timerSeconds").value) || 0;
  const totalMs = (h * 3600 + m * 60 + s) * 1000;
  if (totalMs <= 0) {
    alert("Set a duration greater than zero.");
    return;
  }
  const label =
    document.getElementById("timerLabel").value.trim() ||
    `Timer ${state.timers.length + 1}`;
  state.timers.push({
    id: uid(),
    label,
    method: "duration",
    status: "running",
    durationMs: totalMs,
    remainingMs: totalMs,
    endsAt: new Date(Date.now() + totalMs).toISOString(),
  });
  document.getElementById("timerLabel").value = "";
  persist();
}

function addEndTimer(e) {
  e.preventDefault();
  const label =
    document.getElementById("timerEndLabel").value.trim() ||
    `Timer ${state.timers.length + 1}`;
  const date = document.getElementById("timerEndDate").value;
  const time = document.getElementById("timerEndTime").value;
  const ends = new Date(`${date}T${time}`);
  const remainingMs = ends.getTime() - Date.now();
  if (Number.isNaN(ends.getTime()) || remainingMs <= 0) {
    alert("End time must be in the future.");
    return;
  }
  state.timers.push({
    id: uid(),
    label,
    method: "end",
    status: "running",
    durationMs: remainingMs,
    remainingMs,
    endsAt: ends.toISOString(),
  });
  document.getElementById("timerEndLabel").value = "";
  persist();
}

function toggleTimerPause(id) {
  const t = state.timers.find((x) => x.id === id);
  if (!t) return;
  if (t.status === "running") {
    t.remainingMs = timerRemainingMs(t);
    t.status = "paused";
    t.endsAt = null;
  } else if (t.status === "paused") {
    t.endsAt = new Date(Date.now() + (t.remainingMs || 0)).toISOString();
    t.status = "running";
  }
  persist();
}

function addStopwatch(e) {
  e.preventDefault();
  const label =
    document.getElementById("swLabel").value.trim() ||
    `Stopwatch ${state.stopwatches.length + 1}`;
  state.stopwatches.push({
    id: uid(),
    label,
    status: "idle",
    elapsedMs: 0,
    startedAt: null,
    laps: [],
  });
  document.getElementById("swLabel").value = "";
  persist();
}

function toggleStopwatch(id) {
  const sw = state.stopwatches.find((x) => x.id === id);
  if (!sw) return;
  if (sw.status === "running") {
    sw.elapsedMs = stopwatchElapsed(sw);
    sw.startedAt = null;
    sw.status = "paused";
  } else {
    sw.startedAt = Date.now();
    sw.status = "running";
  }
  persist();
}

function lapStopwatch(id) {
  const sw = state.stopwatches.find((x) => x.id === id);
  if (!sw || sw.status !== "running") return;
  sw.laps.push(stopwatchElapsed(sw));
  persist();
}

/* ---------- Expiry ---------- */

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

  state.timers = state.timers.map((t) => {
    if (t.status === "running" && t.endsAt && new Date(t.endsAt).getTime() <= now) {
      changed = true;
      return { ...t, status: "finished", remainingMs: 0 };
    }
    return t;
  });

  if (changed) saveState(state);
}

/* ---------- Persist / render ---------- */

function persist() {
  saveState(state);
  renderAll();
}

function renderAll() {
  applyTheme();
  applyBackground();
  renderStatus();
  renderWorldClock(new Date(), true);
  renderWorldSettings();
  renderAlarmList();
  renderTimerList();
  renderStopwatchList();
}

function switchPanel(name) {
  document.querySelectorAll(".tool-tabs .tab").forEach((tab) => {
    const on = tab.dataset.panel === name;
    tab.classList.toggle("active", on);
    tab.setAttribute("aria-selected", String(on));
  });
  document.querySelectorAll(".panel").forEach((panel) => {
    const on = panel.id === `panel-${name}`;
    panel.classList.toggle("is-active", on);
    panel.hidden = !on;
  });
}

/* ---------- Init ---------- */

function init() {
  ensureDefaults();
  renderAll();
  tickWallClock();
  syncChromeAlarms(state);
  mirrorToChromeStorage(state);

  document.querySelectorAll(".tool-tabs .tab").forEach((tab) => {
    tab.addEventListener("click", () => switchPanel(tab.dataset.panel));
  });

  document.getElementById("alarmForm").addEventListener("submit", onAlarmSubmit);
  document.querySelectorAll(".method-toggle .chip").forEach((chip) => {
    chip.addEventListener("click", () => setTimerMethod(chip.dataset.method));
  });
  document.getElementById("timerDurationForm").addEventListener("submit", addDurationTimer);
  document.getElementById("timerEndForm").addEventListener("submit", addEndTimer);
  document.getElementById("stopwatchForm").addEventListener("submit", addStopwatch);

  // World clock
  document.getElementById("worldEnabled").addEventListener("change", (e) => {
    state.world.enabled = e.target.checked;
    persist();
  });
  document.getElementById("worldShowPins").addEventListener("change", (e) => {
    state.world.showPins = e.target.checked;
    persist();
  });
  document.getElementById("worldFormat").addEventListener("change", (e) => {
    state.world.clockFormat = CLOCK_FORMATS.includes(e.target.value) ? e.target.value : "auto";
    persist();
  });
  document.getElementById("worldForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const id = document.getElementById("worldCitySelect").value;
    if (!id || !CITY_BY_ID.has(id) || state.world.cities.includes(id)) return;
    state.world.cities.push(id);
    persist();
  });

  // Settings
  const settingsDialog = document.getElementById("settingsDialog");
  document.getElementById("settingsBtn").addEventListener("click", () => {
    ensureDefaults();
    settingsDialog.showModal();
  });
  document.getElementById("settingsCloseBtn").addEventListener("click", () => {
    settingsDialog.close();
  });
  settingsDialog.addEventListener("click", (e) => {
    if (e.target === settingsDialog) settingsDialog.close();
  });

  // Theme
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

  // Background
  const bgModal = document.getElementById("bgModal");
  const bgImage = document.getElementById("bgImage");
  const bgImageName = document.getElementById("bgImageName");

  // Which sub-panel the modal is showing. Picking "Default" or "World clock"
  // applies straight away; colour and image need a second step, so selecting
  // them only reveals their controls.
  function showBgPanel(style) {
    document.querySelectorAll(".bg-style").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.style === style);
      btn.setAttribute("aria-pressed", String(btn.dataset.style === style));
    });
    document.querySelectorAll(".bg-option").forEach((opt) => {
      opt.hidden = opt.dataset.style !== style;
    });
  }

  document.querySelectorAll(".bg-style").forEach((btn) => {
    btn.addEventListener("click", () => {
      const style = btn.dataset.style;
      showBgPanel(style);
      if (style === "default") {
        state.background = { type: "default", color: null, image: null };
        persist();
      } else if (style === "world") {
        state.background = { type: "world", color: null, image: null };
        persist();
      }
    });
  });

  document.getElementById("bgBtn").addEventListener("click", () => {
    if (state.background.color) {
      document.getElementById("bgColor").value = state.background.color;
    }
    bgImageName.textContent =
      state.background.type === "image" ? "Custom image set" : "No file chosen";
    showBgPanel(state.background.type);
    bgModal.showModal();
  });
  document.getElementById("applyColorBtn").addEventListener("click", () => {
    state.background = {
      type: "color",
      color: document.getElementById("bgColor").value,
      image: null,
    };
    bgImageName.textContent = "No file chosen";
    bgImage.value = "";
    persist();
  });
  document.getElementById("pickImageBtn").addEventListener("click", () => bgImage.click());
  bgImage.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4.5 * 1024 * 1024) {
      alert("Please choose an image under ~4.5 MB.");
      e.target.value = "";
      return;
    }
    bgImageName.textContent = file.name;
    const reader = new FileReader();
    reader.onload = () => {
      state.background = { type: "image", color: null, image: reader.result };
      persist();
    };
    reader.readAsDataURL(file);
  });
  document.getElementById("resetBgBtn").addEventListener("click", () => {
    state.background = { type: "default", color: null, image: null };
    bgImage.value = "";
    bgImageName.textContent = "No file chosen";
    showBgPanel("default");
    persist();
  });

  try {
    chrome.storage?.onChanged?.addListener((changes, area) => {
      if (area !== "local" || !changes[STORAGE_KEY]) return;
      const next = changes[STORAGE_KEY].newValue;
      if (!next) return;
      state = migrateState(next);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toPayload(state)));
      renderAll();
    });
  } catch {
    /* ignore */
  }

  // Label placement depends on where the content lands, so redo it on resize.
  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => renderWorldClock(new Date(), true), 150);
  });

  setInterval(() => {
    tickWallClock();
    checkExpirations();
    renderStatus();
    renderWorldClock();
    const settingsOpen = document.getElementById("settingsDialog").open;
    if (settingsOpen) {
      renderAlarmList();
      renderTimerList();
      renderStopwatchList();
    }
  }, 200);
}

init();
