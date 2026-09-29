/**
 * Focus Clock — new tab app
 * Data in localStorage; Chrome clears extension origin on uninstall.
 */

import { ALL_CITIES, CITY_BY_ID, DEFAULT_CITY_IDS, searchCities } from "./cities.js";
import { subsolarPoint } from "./solar.js";
import { createWorldMap, cityReadout } from "./world-clock.js";
import {
  defaultTempUnit,
  describeCode,
  fetchPointWeather,
  fetchWeather,
  formatTemp,
  iconMarkup,
  reverseGeocode,
} from "./weather.js";
import {
  fetchDisasters,
  formatDisasterMeta,
  formatDisasterWhen,
} from "./disasters.js";

const STORAGE_KEY = "focusClockData";

// Weather lives in its own key: it is a disposable cache, not user settings, so
// it stays out of the payload mirrored to chrome.storage and the alarm sync.
const WEATHER_KEY = "focusClockWeather";
const WEATHER_MAX_AGE_MS = 30 * 60 * 1000;
const WEATHER_RETRY_MS = 5 * 60 * 1000;

const DISASTERS_KEY = "focusClockDisasters";
const DISASTERS_MAX_AGE_MS = 30 * 60 * 1000;
const DISASTERS_RETRY_MS = 5 * 60 * 1000;

const CLOCK_FORMATS = ["auto", "12", "24"];
const TEMP_UNITS = ["celsius", "fahrenheit"];
const MAP_STYLES = ["political", "terrestrial", "nautical"];
const TIME_OFFSET_MIN = -96;
const TIME_OFFSET_MAX = 96;
const MAX_DROPPED_PINS = 3;
const PIN_HINT_PLACE = "Click a point on the map";
const PIN_HINT_FULL = "Maximum 3 pins — remove one first";

let timeOffsetHours = 0;
let scrubSyncing = false;
let scrubDrag = null;

function viewNow() {
  return new Date(Date.now() + timeOffsetHours * 3600 * 1000);
}

function offsetHoursLabel(hours) {
  if (hours === 0) return "now";
  const sign = hours > 0 ? "+" : "−";
  const abs = Math.abs(hours);
  const days = Math.floor(abs / 24);
  const rest = abs % 24;
  if (days && rest) return `${sign}${days}d ${rest}h`;
  if (days) return `${sign}${days}d`;
  return `${sign}${abs}h`;
}

const defaultWorld = () => ({
  enabled: true,
  cities: [...DEFAULT_CITY_IDS],
  clockFormat: "auto",
  showPins: true,
  showWeather: true,
  showDisasters: false,
  mapStyle: "political",
  droppedPins: [],
  tempUnit: defaultTempUnit(),
});

const defaultState = () => ({
  theme: "system",
  background: { type: "default", color: null, image: null },
  alarms: [],
  timers: [],
  stopwatches: [],
  world: defaultWorld(),
});

function formatCoords(lat, lon) {
  const ns = `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? "N" : "S"}`;
  const ew = `${Math.abs(lon).toFixed(1)}°${lon >= 0 ? "E" : "W"}`;
  return `${ns}, ${ew}`;
}

function normalizeDroppedPin(pin) {
  if (!pin || typeof pin !== "object") return null;
  const lat = Number(pin.lat);
  const lon = Number(pin.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    id: typeof pin.id === "string" && pin.id ? pin.id : uid(),
    lat,
    lon,
    name: typeof pin.name === "string" && pin.name.trim() ? pin.name.trim() : formatCoords(lat, lon),
    city: typeof pin.city === "string" ? pin.city : "",
    country: typeof pin.country === "string" ? pin.country : "",
    tz: typeof pin.tz === "string" && pin.tz ? pin.tz : "UTC",
  };
}

function normalizeDroppedPins(world) {
  const raw = Array.isArray(world?.droppedPins)
    ? world.droppedPins
    : world?.droppedPin
      ? [world.droppedPin]
      : [];
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    const pin = normalizeDroppedPin(item);
    if (!pin || seen.has(pin.id)) continue;
    seen.add(pin.id);
    out.push(pin);
    if (out.length >= MAX_DROPPED_PINS) break;
  }
  return out;
}

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
    showWeather: world.showWeather !== false,
    showDisasters: world.showDisasters === true,
    mapStyle: MAP_STYLES.includes(world.mapStyle) ? world.mapStyle : "political",
    droppedPins: normalizeDroppedPins(world),
    tempUnit: TEMP_UNITS.includes(world.tempUnit) ? world.tempUnit : base.tempUnit,
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
  const resolved = resolveTheme(state.theme);
  document.documentElement.setAttribute("data-theme", resolved);
  document.getElementById("themeBtn").dataset.themePref = state.theme;
  syncActionIcon(resolved);
}

function syncActionIcon(resolved) {
  try {
    if (!chrome?.runtime?.sendMessage) return;
    chrome.runtime.sendMessage({ type: "SET_ICON_THEME", theme: resolved }, () => {
      void chrome.runtime.lastError;
    });
  } catch (_) {
    /* extension context may be unavailable during local file preview */
  }
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
  const now = viewNow();
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
  const offsetEl = document.getElementById("wallOffset");
  if (timeOffsetHours === 0) {
    offsetEl.hidden = true;
    offsetEl.textContent = "";
  } else {
    offsetEl.hidden = false;
    offsetEl.textContent = `${offsetHoursLabel(timeOffsetHours)} from now`;
  }
}

/* ---------- Weather ---------- */

let weatherCache = loadWeatherCache();
let weatherPending = false;
let weatherRetryAfter = 0;
let weatherFailed = false;

function loadWeatherCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(WEATHER_KEY) || "null");
    if (!raw || typeof raw.byCity !== "object" || !raw.byCity) throw new Error("empty");
    return { fetchedAt: Number(raw.fetchedAt) || 0, byCity: raw.byCity };
  } catch {
    return { fetchedAt: 0, byCity: {} };
  }
}

function selectedCities() {
  return state.world.cities.map((id) => CITY_BY_ID.get(id)).filter(Boolean);
}

let mapLabelCities = [];
let mapLabelWeatherTimer = 0;
let hoverWeatherCity = null;

function weatherTargetCities() {
  const byId = new Map();
  for (const city of selectedCities()) byId.set(city.id, city);
  for (const city of mapLabelCities) {
    if (city?.id) byId.set(city.id, city);
  }
  if (hoverWeatherCity?.id) byId.set(hoverWeatherCity.id, hoverWeatherCity);
  return [...byId.values()];
}

/**
 * Fetches only when something is actually stale or missing, so this is safe to
 * call from `persist()`. A failure backs off rather than retrying every change.
 */
async function refreshWeather({ force = false } = {}) {
  const world = state.world;
  if (!world.showWeather) return;

  const cities = weatherTargetCities();
  if (!cities.length || weatherPending) return;

  const stale = Date.now() - weatherCache.fetchedAt > WEATHER_MAX_AGE_MS;
  const missing = cities.some((c) => !weatherCache.byCity[c.id]);
  if (!force && !stale && !missing) return;
  if (!force && Date.now() < weatherRetryAfter) return;

  weatherPending = true;
  try {
    const readings = await fetchWeather(cities);
    if (readings.size) {
      const keep = new Set(cities.map((c) => c.id));
      const byCity = {};
      for (const id of keep) {
        const hit = readings.get(id) || weatherCache.byCity[id];
        if (hit) byCity[id] = hit;
      }
      weatherCache = { fetchedAt: Date.now(), byCity };
      weatherFailed = false;
      weatherRetryAfter = 0;
      try {
        localStorage.setItem(WEATHER_KEY, JSON.stringify(weatherCache));
      } catch {
        /* quota or private mode: the in-memory copy still works for this tab */
      }
      renderWorldClock(viewNow(), true);
      renderWorldSettings();
    }
  } catch {
    // Offline, blocked, or the API is unhappy. Keep whatever we already have.
    weatherFailed = true;
    weatherRetryAfter = Date.now() + WEATHER_RETRY_MS;
    renderWorldSettings();
  } finally {
    weatherPending = false;
  }
}

function weatherFor(cityId) {
  return state.world.showWeather ? weatherCache.byCity[cityId] || null : null;
}

/** Short readings keyed by city, for the map pin labels. */
function weatherForMap() {
  const out = {};
  if (!state.world.showWeather) return out;
  for (const city of weatherTargetCities()) {
    const reading = weatherCache.byCity[city.id];
    if (!reading) continue;
    const short = formatTemp(reading.tempC, state.world.tempUnit);
    if (!short) continue;
    const desc = describeCode(reading.code);
    out[city.id] = { short, label: desc.label, icon: desc.icon };
  }
  return out;
}

function relativeAge(ms) {
  const minutes = Math.floor(Math.max(0, ms) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function weatherStatusText() {
  if (!state.world.showWeather) return "Weather is off.";
  if (!weatherCache.fetchedAt) {
    return weatherFailed
      ? "Weather unavailable — check your connection."
      : "Fetching weather from Open-Meteo…";
  }
  const when = relativeAge(Date.now() - weatherCache.fetchedAt);
  return weatherFailed
    ? `Showing weather from ${when}; the last refresh failed.`
    : `Weather from Open-Meteo, updated ${when}.`;
}

/* ---------- Natural disasters ---------- */

let disasterCache = loadDisasterCache();
let disasterPending = false;
let disasterRetryAfter = 0;
let disasterFailed = false;

function loadDisasterCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(DISASTERS_KEY) || "null");
    if (!raw || !Array.isArray(raw.events)) throw new Error("empty");
    return { fetchedAt: Number(raw.fetchedAt) || 0, events: raw.events };
  } catch {
    return { fetchedAt: 0, events: [] };
  }
}

async function refreshDisasters({ force = false } = {}) {
  if (!state.world.showDisasters) return;
  if (disasterPending) return;

  const stale = Date.now() - disasterCache.fetchedAt > DISASTERS_MAX_AGE_MS;
  if (!force && !stale && disasterCache.events.length) return;
  if (!force && Date.now() < disasterRetryAfter) return;

  disasterPending = true;
  try {
    const events = await fetchDisasters();
    disasterCache = { fetchedAt: Date.now(), events };
    disasterFailed = false;
    disasterRetryAfter = 0;
    try {
      localStorage.setItem(DISASTERS_KEY, JSON.stringify(disasterCache));
    } catch {
      /* quota or private mode */
    }
    renderWorldClock(viewNow(), true);
    renderWorldSettings();
  } catch {
    disasterFailed = true;
    disasterRetryAfter = Date.now() + DISASTERS_RETRY_MS;
    renderWorldSettings();
  } finally {
    disasterPending = false;
  }
}

function disastersForMap() {
  return state.world.showDisasters ? disasterCache.events : [];
}

function disasterStatusText() {
  if (!state.world.showDisasters) return "Major natural disasters are off.";
  if (!disasterCache.fetchedAt) {
    return disasterFailed
      ? "Disasters unavailable — check your connection."
      : "Fetching major natural disasters…";
  }
  const when = relativeAge(Date.now() - disasterCache.fetchedAt);
  const count = disasterCache.events.length;
  const summary =
    count === 0
      ? "No major open events right now"
      : `${count} major event${count === 1 ? "" : "s"} on the map`;
  return disasterFailed
    ? `${summary} from ${when}; the last refresh failed.`
    : `${summary} · NASA EONET / USGS · updated ${when}.`;
}

function renderDisasterList() {
  const list = document.getElementById("worldDisasterList");
  const on = state.world.showDisasters;
  list.hidden = !on;
  if (!on) {
    list.replaceChildren();
    return;
  }
  const events = disasterCache.events;
  if (!events.length) {
    list.innerHTML = `<li class="empty-note">${
      disasterFailed ? "Could not load disasters" : "No major events right now"
    }</li>`;
    return;
  }
  list.replaceChildren(
    ...events.slice(0, 12).map((event) => {
      const li = document.createElement("li");
      li.className = "list-item";
      const info = document.createElement("div");
      info.className = "info";
      const title = document.createElement("div");
      title.className = "title";
      title.textContent = event.title;
      const sub = document.createElement("div");
      sub.className = "sub";
      sub.textContent = `${formatDisasterMeta(event)} · ${formatDisasterWhen(event)} · ${event.source}`;
      info.append(title, sub);
      li.appendChild(info);
      return li;
    })
  );
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
    worldMap.setHoverHandler(updateMapHover);
    worldMap.setVisibleCitiesHandler(onMapVisibleCities);
    worldMap.setDroppedPinClickHandler(onDroppedPinClick);
  }
  return worldMap;
}

function onMapVisibleCities(cities) {
  const next = cities || [];
  const same =
    next.length === mapLabelCities.length &&
    next.every((c, i) => c.id === mapLabelCities[i]?.id);
  mapLabelCities = next;
  if (same) return;
  clearTimeout(mapLabelWeatherTimer);
  mapLabelWeatherTimer = setTimeout(() => refreshWeather(), 280);
}

function updateMapHover(hit) {
  const el = document.getElementById("mapHover");
  const cityEl = document.getElementById("mapHoverCity");
  const countryEl = document.getElementById("mapHoverCountry");
  const metaEl = document.getElementById("mapHoverMeta");
  const weatherEl = document.getElementById("mapHoverWeather");
  const focus = hit?.city;
  if (!focus) {
    el.hidden = true;
    hoverWeatherCity = null;
    return;
  }
  cityEl.textContent = focus.name;
  countryEl.textContent = focus.country || "";
  countryEl.hidden = !focus.country;

  let readout = null;
  try {
    readout = cityReadout(focus, viewNow(), state.world.clockFormat);
  } catch {
    readout = null;
  }
  metaEl.textContent = readout?.time || "";
  metaEl.hidden = !metaEl.textContent;
  const reading = weatherFor(focus.id);
  if (reading) {
    const { label, icon } = describeCode(reading.code);
    const temp = formatTemp(reading.tempC, state.world.tempUnit);
    weatherEl.innerHTML = `${iconMarkup(icon, readout?.phase !== "day")}<span>${[temp, label].filter(Boolean).join(" ")}</span>`;
    weatherEl.hidden = false;
  } else {
    weatherEl.replaceChildren();
    weatherEl.hidden = true;
    if (state.world.showWeather) {
      hoverWeatherCity = focus;
      clearTimeout(mapLabelWeatherTimer);
      mapLabelWeatherTimer = setTimeout(() => {
        refreshWeather().then(() => {
          if (hoverWeatherCity?.id === focus.id && !el.hidden) {
            updateMapHover(hit);
          }
        });
      }, 180);
    }
  }
  el.hidden = false;
  const pad = 14;
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  let left = hit.clientX + pad;
  let top = hit.clientY + pad;
  if (left + w > window.innerWidth - 8) left = hit.clientX - w - 10;
  if (top + h > window.innerHeight - 8) top = hit.clientY - h - 10;
  el.style.left = `${Math.max(8, left)}px`;
  el.style.top = `${Math.max(8, top)}px`;
}

let pickMode = false;
let droppedWeatherById = {};
let selectedDroppedPinId = null;
let pinHintTimer = 0;

function droppedPins() {
  return state.world.droppedPins || [];
}

function selectedDroppedPin() {
  const pins = droppedPins();
  if (!pins.length) return null;
  return pins.find((p) => p.id === selectedDroppedPinId) || pins[pins.length - 1];
}

function pruneDroppedWeather() {
  const keep = new Set(droppedPins().map((p) => p.id));
  for (const id of Object.keys(droppedWeatherById)) {
    if (!keep.has(id)) delete droppedWeatherById[id];
  }
}

function flashPinHint(text) {
  const hint = document.getElementById("pinHint");
  hint.textContent = text;
  hint.hidden = false;
  clearTimeout(pinHintTimer);
  pinHintTimer = setTimeout(() => {
    if (pickMode) {
      hint.textContent = PIN_HINT_PLACE;
      return;
    }
    hint.hidden = true;
    hint.textContent = PIN_HINT_PLACE;
  }, 2200);
}

function updatePinButton() {
  const btn = document.getElementById("pinBtn");
  const n = droppedPins().length;
  const full = n >= MAX_DROPPED_PINS;
  btn.title = full ? PIN_HINT_FULL : "Drop a pin";
  btn.setAttribute("aria-label", full ? PIN_HINT_FULL : "Drop a pin on the map");
  btn.classList.toggle("is-full", full);
}

function setPickMode(on) {
  pickMode = Boolean(on);
  const btn = document.getElementById("pinBtn");
  const hint = document.getElementById("pinHint");
  btn.classList.toggle("is-active", pickMode);
  btn.setAttribute("aria-pressed", pickMode ? "true" : "false");
  hint.textContent = PIN_HINT_PLACE;
  hint.hidden = !pickMode;
  document.body.classList.toggle("is-pin-picking", pickMode);
  if (pickMode && state.background.type !== "world") {
    state.background = { ...state.background, type: "world" };
    persist();
  }
  ensureWorldMap().setPickMode(pickMode, pickMode ? onMapPick : null);
  updatePinButton();
}

function droppedPinView(pin, now = viewNow()) {
  if (!pin) return null;
  const city = {
    id: pin.id || "drop",
    name: pin.name,
    lat: pin.lat,
    lon: pin.lon,
    tz: pin.tz || "UTC",
    country: pin.country || "",
  };
  let readout;
  try {
    readout = cityReadout(city, now, state.world.clockFormat);
  } catch {
    readout = cityReadout({ ...city, tz: "UTC" }, now, state.world.clockFormat);
  }
  const cached = droppedWeatherById[pin.id];
  const temp = cached && formatTemp(cached.tempC, state.world.tempUnit);
  const weather = cached
    ? {
        short: temp,
        ...describeCode(cached.code),
      }
    : null;
  return {
    ...pin,
    readout,
    timeText: weather?.short ? `${readout.time} · ${weather.short}` : readout.time,
    weather,
    selected: pin.id === selectedDroppedPin()?.id,
  };
}

function inspectPinLabel(pin) {
  return pin.city && pin.country ? `${pin.city}, ${pin.country}` : pin.name;
}

function inspectCardEl(pin, now, selected) {
  const view = droppedPinView(pin, now);
  const card = document.createElement("article");
  card.className = selected ? "inspect-card is-selected" : "inspect-card";
  card.dataset.pinId = pin.id;

  const head = document.createElement("header");
  head.className = "inspect-head";
  const name = document.createElement("strong");
  name.textContent = inspectPinLabel(pin);
  const close = document.createElement("button");
  close.type = "button";
  close.className = "icon-btn inspect-close";
  close.setAttribute("aria-label", "Remove pin");
  close.innerHTML =
    '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M6 6l12 12M18 6 6 18" /></svg>';
  head.append(name, close);

  const time = document.createElement("div");
  time.className = "inspect-time mono";
  time.textContent = view.readout.time;

  const weatherEl = document.createElement("div");
  weatherEl.className = "inspect-weather";
  paintInspectWeather(weatherEl, pin, view);

  const meta = document.createElement("div");
  meta.className = "inspect-meta";
  meta.textContent = `${view.readout.dayLabel} · ${view.readout.offsetLabel} · ${formatCoords(pin.lat, pin.lon)}`;

  card.append(head, time, weatherEl, meta);
  return card;
}

function paintInspectWeather(weatherEl, pin, view) {
  const cached = droppedWeatherById[pin.id];
  if (cached) {
    const { label, icon } = describeCode(cached.code);
    const temp = formatTemp(cached.tempC, state.world.tempUnit, true);
    weatherEl.innerHTML = `${iconMarkup(icon, view.readout.phase !== "day")}<span>${temp} ${label}</span>`;
  } else {
    weatherEl.textContent = "Fetching weather…";
  }
}

let lastInspectKey = "";

function renderInspectCard(now = viewNow()) {
  const stack = document.getElementById("inspectStack");
  pruneDroppedWeather();
  const pins = droppedPins();
  updatePinButton();
  if (worldMap) worldMap.setDroppedPins(pins.map((p) => droppedPinView(p, now)));
  if (!pins.length) {
    lastInspectKey = "";
    stack.hidden = true;
    stack.replaceChildren();
    return;
  }
  const selectedId = selectedDroppedPin()?.id || "";
  selectedDroppedPinId = selectedId || null;
  const weatherKey = pins
    .map((p) => `${p.id}:${droppedWeatherById[p.id]?.at || 0}:${p.name}`)
    .join("|");
  const key =
    `${pins.map((p) => p.id).join(",")}|${selectedId}|${weatherKey}|` +
    `${Math.floor(now.getTime() / 60000)}|${state.world.tempUnit}|${state.world.clockFormat}`;
  if (key === lastInspectKey) return;
  lastInspectKey = key;
  stack.hidden = false;
  stack.replaceChildren(...pins.map((pin) => inspectCardEl(pin, now, pin.id === selectedId)));
}

async function refreshDroppedWeather({ force = false } = {}) {
  const pins = droppedPins();
  if (!pins.length) {
    droppedWeatherById = {};
    return;
  }
  await Promise.all(
    pins.map(async (pin) => {
      const cached = droppedWeatherById[pin.id];
      if (!force && cached && Date.now() - cached.at < WEATHER_MAX_AGE_MS) return;
      try {
        const reading = await fetchPointWeather(pin.lat, pin.lon);
        droppedWeatherById[pin.id] = {
          tempC: reading.tempC,
          code: reading.code,
          at: Date.now(),
        };
        if (reading.timezone && reading.timezone !== pin.tz) {
          state.world.droppedPins = droppedPins().map((p) =>
            p.id === pin.id ? { ...p, tz: reading.timezone } : p
          );
          saveState(state);
        }
      } catch {
        /* keep whatever we already have for this pin */
      }
    })
  );
  renderInspectCard();
}

async function onMapPick({ lat, lon }) {
  setPickMode(false);
  if (droppedPins().length >= MAX_DROPPED_PINS) {
    flashPinHint(PIN_HINT_FULL);
    return;
  }
  const id = uid();
  const coords = formatCoords(lat, lon);
  const pin = { id, lat, lon, name: coords, city: "", country: "", tz: "UTC" };
  state.world.droppedPins = [...droppedPins(), pin];
  selectedDroppedPinId = id;
  persist();
  renderInspectCard();
  const [weatherHit, placeHit] = await Promise.allSettled([
    fetchPointWeather(lat, lon),
    reverseGeocode(lat, lon),
  ]);
  if (!droppedPins().some((p) => p.id === id)) return;
  const reading = weatherHit.status === "fulfilled" ? weatherHit.value : null;
  const place = placeHit.status === "fulfilled" ? placeHit.value : null;
  if (reading) {
    droppedWeatherById[id] = {
      tempC: reading.tempC,
      code: reading.code,
      at: Date.now(),
    };
  }
  state.world.droppedPins = droppedPins().map((p) =>
    p.id === id
      ? {
          ...p,
          name: place?.name || coords,
          city: place?.city || "",
          country: place?.country || "",
          tz: reading?.timezone || p.tz || "UTC",
        }
      : p
  );
  saveState(state);
  renderInspectCard();
}

function onDroppedPinClick(id) {
  if (pickMode) return;
  if (!droppedPins().some((p) => p.id === id)) return;
  selectedDroppedPinId = id;
  renderInspectCard();
}

function clearDroppedPin(id) {
  const pinId = id || selectedDroppedPin()?.id;
  if (!pinId) {
    state.world.droppedPins = [];
  } else {
    state.world.droppedPins = droppedPins().filter((p) => p.id !== pinId);
    delete droppedWeatherById[pinId];
  }
  selectedDroppedPinId = droppedPins().at(-1)?.id || null;
  persist();
  renderInspectCard();
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

  const reading = weatherFor(city.id);
  if (reading) {
    const { label, icon } = describeCode(reading.code);
    const row = document.createElement("div");
    row.className = "world-weather";

    const glyph = document.createElement("span");
    glyph.className = "world-weather-icon";
    glyph.innerHTML = iconMarkup(icon, readout.phase !== "day");

    const temp = document.createElement("span");
    temp.className = "world-temp";
    temp.textContent = formatTemp(reading.tempC, state.world.tempUnit, true);

    const condition = document.createElement("span");
    condition.className = "world-cond";
    condition.textContent = label;

    row.append(glyph, temp, condition);
    card.appendChild(row);
  }

  return card;
}

/**
 * Cards only change once a minute and the terminator crawls a quarter of a
 * degree per minute, so both are keyed rather than rebuilt on every 200ms tick.
 */
function renderWorldClock(now = viewNow(), force = false) {
  const world = state.world;
  const settingsKey =
    `${world.enabled}|${world.showPins}|${world.clockFormat}|` +
    `${world.cities.join(",")}|${state.background.type}|` +
    `${world.showWeather}|${world.tempUnit}|${world.mapStyle}|${weatherCache.fetchedAt}|` +
    `${world.showDisasters}|${disasterCache.fetchedAt}|${disasterCache.events.length}|` +
    `${timeOffsetHours}`;
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
        weather: weatherForMap(),
        showDisasters: world.showDisasters,
        disasters: disastersForMap(),
        mapStyle: world.mapStyle,
      });
    }
  }
}

function renderWorldSettings() {
  const world = state.world;
  document.getElementById("worldEnabled").checked = world.enabled;
  document.getElementById("worldShowPins").checked = world.showPins;
  document.getElementById("worldShowWeather").checked = world.showWeather;
  document.getElementById("worldShowDisasters").checked = world.showDisasters;
  document.getElementById("worldFormat").value = world.clockFormat;
  document.getElementById("worldTempUnit").value = world.tempUnit;
  document.getElementById("worldMapStyle").value = world.mapStyle;
  document.getElementById("worldWeatherStatus").textContent = weatherStatusText();
  document.getElementById("worldDisasterStatus").textContent = disasterStatusText();
  renderDisasterList();

  syncCityPicker();

  const list = document.getElementById("worldList");
  if (!world.cities.length) {
    list.innerHTML = `<li class="empty-note">No cities yet</li>`;
    return;
  }
  const now = viewNow();
  const sub = subsolarPoint(now);
  list.replaceChildren(
    ...worldEntries(now, sub).map(({ city, readout }) => {
      const reading = weatherFor(city.id);
      const temp = reading && formatTemp(reading.tempC, world.tempUnit, true);
      return listItem(
        `${city.name}, ${city.country}`,
        readout.phase,
        `${readout.time} · ${readout.dayLabel} · ${readout.offsetLabel} (${readout.relativeLabel})` +
          (reading ? ` · ${temp} ${describeCode(reading.code).label}` : ""),
        [
          actionBtn("Remove", "danger", () => {
            state.world.cities = state.world.cities.filter((id) => id !== city.id);
            persist();
          }),
        ]
      );
    })
  );
}

const CITY_PICKER_LIMIT = 12;
let cityPickerHits = [];
let cityPickerActive = -1;
let cityPickerOpen = false;

function availableWorldCities() {
  const chosen = new Set(state.world.cities);
  return ALL_CITIES.filter((c) => !chosen.has(c.id));
}

function addWorldCity(id) {
  if (!id || !CITY_BY_ID.has(id) || state.world.cities.includes(id)) return false;
  state.world.cities.push(id);
  const search = document.getElementById("worldCitySearch");
  if (search) search.value = "";
  closeCityPicker();
  persist();
  return true;
}

function syncCityPicker() {
  const search = document.getElementById("worldCitySearch");
  const addBtn = document.getElementById("worldAddBtn");
  const leftover = availableWorldCities().length > 0;
  if (search) {
    search.disabled = !leftover;
    if (!leftover) {
      search.placeholder = "All catalogue cities added";
      closeCityPicker();
    } else {
      search.placeholder = "Search city, country, or timezone";
    }
  }
  if (addBtn) addBtn.disabled = !leftover;
  if (cityPickerOpen) paintCityResults();
}

function closeCityPicker() {
  cityPickerOpen = false;
  cityPickerActive = -1;
  const results = document.getElementById("worldCityResults");
  const search = document.getElementById("worldCitySearch");
  if (results) {
    results.hidden = true;
    results.replaceChildren();
  }
  search?.setAttribute("aria-expanded", "false");
  search?.removeAttribute("aria-activedescendant");
}

function placeCityResults() {
  const search = document.getElementById("worldCitySearch");
  const results = document.getElementById("worldCityResults");
  if (!search || !results || results.hidden) return;
  const box = search.getBoundingClientRect();
  const maxH = Math.min(264, window.innerHeight * 0.42);
  const gap = 6;
  const spaceBelow = window.innerHeight - box.bottom - gap - 8;
  const openUp = spaceBelow < 120 && box.top > spaceBelow;
  const height = Math.max(96, openUp ? box.top - gap - 8 : spaceBelow);
  results.style.left = `${Math.round(box.left)}px`;
  results.style.width = `${Math.round(box.width)}px`;
  results.style.maxHeight = `${Math.round(Math.min(height, maxH))}px`;
  if (openUp) {
    results.style.top = "auto";
    results.style.bottom = `${Math.round(window.innerHeight - box.top + gap)}px`;
  } else {
    results.style.bottom = "auto";
    results.style.top = `${Math.round(box.bottom + gap)}px`;
  }
}

function setCityPickerActive(index) {
  const results = document.getElementById("worldCityResults");
  const search = document.getElementById("worldCitySearch");
  if (!results) return;
  const buttons = [...results.querySelectorAll(".city-result")];
  if (!buttons.length) {
    cityPickerActive = -1;
    search?.removeAttribute("aria-activedescendant");
    return;
  }
  cityPickerActive = ((index % buttons.length) + buttons.length) % buttons.length;
  buttons.forEach((btn, i) => {
    const on = i === cityPickerActive;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-selected", String(on));
    if (on) {
      search?.setAttribute("aria-activedescendant", btn.id);
      btn.scrollIntoView({ block: "nearest" });
    }
  });
}

function paintCityResults() {
  const search = document.getElementById("worldCitySearch");
  const results = document.getElementById("worldCityResults");
  if (!search || !results || !cityPickerOpen) return;

  const leftover = availableWorldCities();
  cityPickerHits = leftover.length
    ? searchCities(search.value, leftover, { limit: CITY_PICKER_LIMIT })
    : [];

  if (!cityPickerHits.length) {
    const empty = document.createElement("li");
    empty.className = "city-results-empty";
    empty.textContent = leftover.length
      ? "No matching city, country, or timezone"
      : "All catalogue cities added";
    results.replaceChildren(empty);
    cityPickerActive = -1;
    search.removeAttribute("aria-activedescendant");
    results.hidden = false;
    search.setAttribute("aria-expanded", "true");
    placeCityResults();
    return;
  }

  const frag = document.createDocumentFragment();
  cityPickerHits.forEach((hit) => {
    const { city, meta } = hit;
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "city-result";
    btn.id = `worldCityOpt-${city.id}`;
    btn.setAttribute("role", "option");
    btn.dataset.id = city.id;
    btn.setAttribute("aria-selected", "false");

    const name = document.createElement("span");
    name.className = "city-result-name";
    name.textContent = `${city.name}, ${city.country}`;

    const tzBits = [city.tz];
    if (meta.tzShort && !/^(utc|gmt)/i.test(meta.tzShort.replace(/\s/g, ""))) {
      tzBits.push(meta.tzShort);
    }
    tzBits.push(meta.offsetLabel);
    const unique = [...new Set(tzBits.filter(Boolean))];
    const metaLine = document.createElement("span");
    metaLine.className = "city-result-meta";
    metaLine.textContent = unique.join(" · ");

    btn.append(name, metaLine);
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", () => addWorldCity(city.id));
    li.appendChild(btn);
    frag.appendChild(li);
  });
  results.replaceChildren(frag);
  results.hidden = false;
  search.setAttribute("aria-expanded", "true");
  setCityPickerActive(cityPickerActive < 0 ? 0 : Math.min(cityPickerActive, cityPickerHits.length - 1));
  placeCityResults();
}

function openCityPicker() {
  if (document.getElementById("worldCitySearch")?.disabled) return;
  cityPickerOpen = true;
  paintCityResults();
}

function bindCityPicker() {
  const search = document.getElementById("worldCitySearch");
  const picker = document.getElementById("worldCityPicker");
  const sheet = document.querySelector(".settings-sheet");
  if (!search) return;

  search.addEventListener("focus", () => openCityPicker());
  search.addEventListener("input", () => {
    cityPickerActive = 0;
    openCityPicker();
  });
  search.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (cityPickerOpen) {
        e.preventDefault();
        closeCityPicker();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!cityPickerOpen) openCityPicker();
      else setCityPickerActive(cityPickerActive + 1);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!cityPickerOpen) openCityPicker();
      else setCityPickerActive(cityPickerActive - 1);
      return;
    }
    if (e.key === "Enter" && cityPickerOpen) {
      const hit = cityPickerHits[cityPickerActive] || cityPickerHits[0];
      if (hit) {
        e.preventDefault();
        addWorldCity(hit.city.id);
      }
    }
  });

  document.addEventListener("pointerdown", (e) => {
    if (!cityPickerOpen) return;
    if (picker?.contains(e.target) || document.getElementById("worldCityResults")?.contains(e.target)) {
      return;
    }
    closeCityPicker();
  });
  sheet?.addEventListener(
    "scroll",
    () => {
      if (cityPickerOpen) placeCityResults();
    },
    { passive: true }
  );
  window.addEventListener("resize", () => {
    if (cityPickerOpen) placeCityResults();
  });
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

  const cards = [];
  if (alarms.length) {
    cards.push(
      buildStatusCard("Alarm", alarms, (a) => {
        if (a.status === "fired") {
          return { value: "Ringing", meta: a.label };
        }
        const left = Math.max(0, new Date(a.at).getTime() - Date.now());
        return {
          value: formatHMS(left),
          meta: `${a.label} · ${formatDateTime(a.at)}`,
        };
      })
    );
  }
  if (timers.length) {
    cards.push(
      buildStatusCard("Timer", timers, (t) => {
        const left = timerRemainingMs(t);
        const value =
          t.status === "finished" || left === 0 ? "00:00:00" : formatHMS(left);
        let meta = t.label;
        if (t.status === "paused") meta += " · paused";
        else if (t.status === "finished") meta += " · finished";
        else if (t.method === "end" && t.endsAt) meta += ` · until ${formatDateTime(t.endsAt)}`;
        else meta += " · running";
        return { value, meta };
      })
    );
  }
  if (stopwatches.length) {
    cards.push(
      buildStatusCard("Stopwatch", stopwatches, (s) => ({
        value: formatHMS(stopwatchElapsed(s), true),
        meta: `${s.label} · ${s.status === "running" ? "running" : s.status === "paused" ? "paused" : "stopped"}`,
      }))
    );
  }

  row.hidden = cards.length === 0;
  row.replaceChildren(...cards);
}

function buildStatusCard(label, items, mapItem) {
  const card = document.createElement("article");
  card.className = "status-card has-items";

  const lab = document.createElement("div");
  lab.className = "status-label";
  lab.textContent = label;
  card.appendChild(lab);

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

/* ---------- Time offset scrubber ---------- */

function isEditableTarget(el) {
  if (!el || el === document.body) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function anyDialogOpen() {
  return Boolean(document.querySelector("dialog[open]"));
}

function scrubTickWidth() {
  const tick = document.querySelector("#timeScrubTrack .time-scrub-tick");
  return tick ? tick.getBoundingClientRect().width : 38.4;
}

function hoursFromScrubScroll(scrollLeft) {
  const w = scrubTickWidth();
  if (!w) return timeOffsetHours;
  return TIME_OFFSET_MIN + Math.round(scrollLeft / w);
}

function scrollLeftToCenterHour(hours) {
  const scroller = document.getElementById("timeScrubScroller");
  const tick = document.querySelector(
    `#timeScrubTrack .time-scrub-tick[data-hour="${hours}"]`
  );
  if (!scroller || !tick) return (hours - TIME_OFFSET_MIN) * scrubTickWidth();
  const sRect = scroller.getBoundingClientRect();
  const tRect = tick.getBoundingClientRect();
  if (!sRect.width || !tRect.width) {
    return (hours - TIME_OFFSET_MIN) * scrubTickWidth();
  }
  return scroller.scrollLeft + (tRect.left + tRect.width / 2) - (sRect.left + sRect.width / 2);
}

function applyTimeOffsetUi() {
  const scrub = document.getElementById("timeScrub");
  const show = state.world.enabled;
  scrub.hidden = !show;
  document.body.classList.toggle("has-time-scrub", show);
  document.body.classList.toggle("has-time-offset", timeOffsetHours !== 0);
  document.getElementById("timeScrubNow").hidden = timeOffsetHours === 0;
  const label = offsetHoursLabel(timeOffsetHours);
  document.getElementById("timeScrubReadout").textContent = label;
  const scroller = document.getElementById("timeScrubScroller");
  scroller.setAttribute("aria-valuenow", String(timeOffsetHours));
  scroller.setAttribute("aria-valuetext", label);
}

function syncTimeScrubScroll() {
  const scroller = document.getElementById("timeScrubScroller");
  if (!scroller || document.getElementById("timeScrub").hidden) return;
  const apply = () => {
    if (document.getElementById("timeScrub").hidden) return;
    scrubSyncing = true;
    scroller.scrollLeft = scrollLeftToCenterHour(timeOffsetHours);
    requestAnimationFrame(() => {
      scrubSyncing = false;
    });
  };
  apply();
  requestAnimationFrame(apply);
}

function setTimeOffset(hours, { fromScroll = false } = {}) {
  const next = Math.min(
    TIME_OFFSET_MAX,
    Math.max(TIME_OFFSET_MIN, Math.round(Number(hours) || 0))
  );
  const changed = next !== timeOffsetHours;
  timeOffsetHours = next;
  applyTimeOffsetUi();
  if (!fromScroll) syncTimeScrubScroll();
  if (changed) {
    tickWallClock();
    renderWorldClock(viewNow(), true);
    if (droppedPins().length) renderInspectCard(viewNow());
  }
}

function buildTimeScrub() {
  const track = document.getElementById("timeScrubTrack");
  const frag = document.createDocumentFragment();
  for (let h = TIME_OFFSET_MIN; h <= TIME_OFFSET_MAX; h++) {
    const tick = document.createElement("div");
    tick.className = "time-scrub-tick";
    if (h === 0) tick.classList.add("is-zero");
    if (h % 6 === 0) tick.classList.add("is-major");
    if (h !== 0 && h % 24 === 0) tick.classList.add("is-day");
    tick.dataset.hour = String(h);
    if (h !== 0 && h % 24 === 0) {
      const day = document.createElement("span");
      day.className = "time-scrub-day";
      const d = h / 24;
      day.textContent = d > 0 ? `+${d}d` : `${d}d`;
      tick.appendChild(day);
    }
    const hour = document.createElement("span");
    hour.className = "time-scrub-hour";
    hour.textContent = String(h);
    tick.appendChild(hour);
    frag.appendChild(tick);
  }
  track.replaceChildren(frag);
}

function bindTimeScrub() {
  const scroller = document.getElementById("timeScrubScroller");

  scroller.addEventListener("scroll", () => {
    if (scrubSyncing) return;
    const w = scrubTickWidth();
    if (!w) return;
    setTimeOffset(hoursFromScrubScroll(scroller.scrollLeft), { fromScroll: true });
  });

  scroller.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      scroller.scrollLeft += delta;
    },
    { passive: false }
  );

  scroller.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    scrubDrag = { x: e.clientX, sl: scroller.scrollLeft, moved: false };
    scroller.classList.add("is-dragging");
    scroller.setPointerCapture(e.pointerId);
  });

  scroller.addEventListener("pointermove", (e) => {
    if (!scrubDrag) return;
    const dx = e.clientX - scrubDrag.x;
    if (Math.abs(dx) > 4) scrubDrag.moved = true;
    scroller.scrollLeft = scrubDrag.sl - dx;
  });

  function endScrubDrag(e) {
    if (!scrubDrag) return;
    const moved = scrubDrag.moved;
    const tick = e.target.closest?.(".time-scrub-tick");
    scrubDrag = null;
    scroller.classList.remove("is-dragging");
    if (!moved && tick) setTimeOffset(Number(tick.dataset.hour));
    else setTimeOffset(timeOffsetHours);
  }

  scroller.addEventListener("pointerup", endScrubDrag);
  scroller.addEventListener("pointercancel", endScrubDrag);

  document.getElementById("timeScrubNow").addEventListener("click", () => setTimeOffset(0));

  window.addEventListener("keydown", (e) => {
    if (!state.world.enabled) return;
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    if (!e.ctrlKey && !e.metaKey) return;
    if (isEditableTarget(e.target)) return;
    if (anyDialogOpen()) return;
    e.preventDefault();
    const step = e.shiftKey ? 24 : 1;
    setTimeOffset(timeOffsetHours + (e.key === "ArrowRight" ? step : -step));
  });
}

/* ---------- Persist / render ---------- */

function persist() {
  saveState(state);
  renderAll();
  // Cheap unless a newly added city has no reading yet, or the cache went stale.
  refreshWeather();
  refreshDisasters();
}

function renderAll() {
  applyTheme();
  applyBackground();
  renderStatus();
  applyTimeOffsetUi();
  syncTimeScrubScroll();
  renderWorldClock(viewNow(), true);
  renderInspectCard();
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
  if (name !== "world") closeCityPicker();
}

/* ---------- Init ---------- */

function init() {
  ensureDefaults();
  buildTimeScrub();
  bindTimeScrub();
  renderAll();
  tickWallClock();
  syncTimeScrubScroll();
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

  bindCityPicker();

  // World clock
  document.getElementById("worldEnabled").addEventListener("change", (e) => {
    state.world.enabled = e.target.checked;
    persist();
  });
  document.getElementById("worldShowPins").addEventListener("change", (e) => {
    state.world.showPins = e.target.checked;
    persist();
  });
  document.getElementById("worldShowWeather").addEventListener("change", (e) => {
    state.world.showWeather = e.target.checked;
    persist();
  });
  document.getElementById("worldShowDisasters").addEventListener("change", (e) => {
    state.world.showDisasters = e.target.checked;
    persist();
    if (state.world.showDisasters) refreshDisasters({ force: true });
    else {
      renderWorldClock(viewNow(), true);
      renderWorldSettings();
    }
  });
  document.getElementById("worldFormat").addEventListener("change", (e) => {
    state.world.clockFormat = CLOCK_FORMATS.includes(e.target.value) ? e.target.value : "auto";
    persist();
  });
  document.getElementById("worldTempUnit").addEventListener("change", (e) => {
    // Readings are cached in Celsius, so this is a display change only.
    state.world.tempUnit = TEMP_UNITS.includes(e.target.value) ? e.target.value : "celsius";
    persist();
  });
  document.getElementById("worldMapStyle").addEventListener("change", (e) => {
    state.world.mapStyle = MAP_STYLES.includes(e.target.value) ? e.target.value : "political";
    persist();
  });
  document.getElementById("worldForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const leftover = availableWorldCities();
    const query = document.getElementById("worldCitySearch")?.value || "";
    if (!query.trim() && !cityPickerOpen) return;
    const hits =
      cityPickerOpen && cityPickerHits.length
        ? cityPickerHits
        : searchCities(query, leftover, { limit: CITY_PICKER_LIMIT });
    const hit = hits[Math.max(0, cityPickerActive)] || hits[0];
    if (hit) addWorldCity(hit.city.id);
  });
  document.getElementById("worldRow").addEventListener(
    "wheel",
    (e) => {
      const row = e.currentTarget;
      if (row.scrollWidth <= row.clientWidth) return;
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      row.scrollLeft += e.deltaY;
    },
    { passive: false }
  );

  document.getElementById("pinBtn").addEventListener("click", () => {
    if (pickMode) {
      setPickMode(false);
      return;
    }
    if (droppedPins().length >= MAX_DROPPED_PINS) {
      flashPinHint(PIN_HINT_FULL);
      return;
    }
    setPickMode(true);
  });
  document.getElementById("inspectStack").addEventListener("click", (e) => {
    const card = e.target.closest(".inspect-card");
    if (!card?.dataset.pinId) return;
    if (e.target.closest(".inspect-close")) {
      clearDroppedPin(card.dataset.pinId);
      return;
    }
    onDroppedPinClick(card.dataset.pinId);
  });

  const googleSearch = document.getElementById("googleSearch");
  const googleSearchInput = document.getElementById("googleSearchInput");

  function looksLikeUrl(q) {
    if (!q || /\s/.test(q)) return false;
    try {
      const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(q) ? q : `https://${q}`);
      return url.hostname.includes(".");
    } catch {
      return false;
    }
  }

  googleSearch.addEventListener("submit", (e) => {
    const q = googleSearchInput.value.trim();
    if (!q) {
      e.preventDefault();
      return;
    }
    if (looksLikeUrl(q)) {
      e.preventDefault();
      location.assign(/^[a-z][a-z0-9+.-]*:\/\//i.test(q) ? q : `https://${q}`);
    }
  });

  window.addEventListener("keydown", (e) => {
    if (anyDialogOpen() || isEditableTarget(e.target)) return;
    if (e.key === "/" || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) {
      e.preventDefault();
      googleSearchInput.focus();
    }
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
  settingsDialog.addEventListener("close", () => closeCityPicker());
  settingsDialog.addEventListener("click", (e) => {
    if (e.target === settingsDialog) settingsDialog.close();
  });

  // Theme
  const themeBtn = document.getElementById("themeBtn");
  const themeMenu = document.getElementById("themeMenu");
  themeBtn.addEventListener("click", () => {
    const r = themeBtn.getBoundingClientRect();
    const menuW = 168;
    themeMenu.style.top = `${r.top}px`;
    themeMenu.style.left = `${Math.max(8, r.left - menuW - 8)}px`;
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

  refreshWeather();
  setInterval(() => refreshWeather(), 5 * 60 * 1000);
  refreshDisasters();
  setInterval(() => refreshDisasters(), 5 * 60 * 1000);
  refreshDroppedWeather();
  setInterval(() => refreshDroppedWeather(), 5 * 60 * 1000);

  // Label placement depends on where the content lands, so redo it on resize.
  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      renderWorldClock(viewNow(), true);
      syncTimeScrubScroll();
    }, 150);
  });

  setInterval(() => {
    tickWallClock();
    checkExpirations();
    renderStatus();
    renderWorldClock();
    if (droppedPins().length) renderInspectCard();
    const settingsOpen = document.getElementById("settingsDialog").open;
    if (settingsOpen) {
      renderAlarmList();
      renderTimerList();
      renderStopwatchList();
    }
  }, 200);
}

init();
