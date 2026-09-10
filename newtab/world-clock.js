/**
 * World clock — an equirectangular map with a live day/night terminator, plus
 * per-city local time readouts.
 */

import { LAND_PATH, BORDERS_PATH } from "./world-map-data.js";
import { subsolarPoint, terminatorPath, daylightPhase } from "./solar.js";

const SVG_NS = "http://www.w3.org/2000/svg";

function svg(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** Equirectangular projection into the "0 0 360 180" viewBox. */
export const projectX = (lon) => lon + 180;
export const projectY = (lat) => 90 - lat;

/* ---------- Time helpers ---------- */

const formatterCache = new Map();

function cached(key, build) {
  let f = formatterCache.get(key);
  if (!f) {
    f = build();
    formatterCache.set(key, f);
  }
  return f;
}

function zoneParts(tz, date) {
  const dtf = cached(`parts:${tz}`, () =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
  );
  const out = {};
  for (const { type, value } of dtf.formatToParts(date)) out[type] = value;
  return out;
}

/** Minutes east of UTC for a zone at a given instant, DST included. */
export function zoneOffsetMinutes(tz, date) {
  const p = zoneParts(tz, date);
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  // formatToParts resolves to whole seconds, so compare against whole seconds.
  return Math.round((asUTC - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

function offsetLabel(minutes) {
  if (minutes === 0) return "UTC";
  const sign = minutes < 0 ? "−" : "+";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
}

function relativeLabel(minutes) {
  if (minutes === 0) return "local";
  const sign = minutes < 0 ? "−" : "+";
  const abs = Math.abs(minutes);
  const h = abs / 60;
  return `${sign}${Number.isInteger(h) ? h : h.toFixed(1)}h`;
}

function dayShift(days) {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  return days > 0 ? `+${days} days` : `${days} days`;
}

/**
 * Everything the UI needs about one city right now: local time, how far its
 * calendar day sits from yours, its UTC offset, and whether the sun is up.
 */
export function cityReadout(city, date = new Date(), clockFormat = "auto", sub = subsolarPoint(date)) {
  const timeFmt = cached(`time:${city.tz}:${clockFormat}`, () => {
    const hour12 = clockFormat === "auto" ? {} : { hour12: clockFormat === "12" };
    // "2-digit" reads well on a 24-hour clock (09:05) but not on a 12-hour one
    // (01:05 PM), so ask the resolved options which one we ended up with.
    const probe = new Intl.DateTimeFormat(undefined, {
      timeZone: city.tz,
      hour: "2-digit",
      minute: "2-digit",
      ...hour12,
    });
    return new Intl.DateTimeFormat(undefined, {
      timeZone: city.tz,
      hour: probe.resolvedOptions().hour12 ? "numeric" : "2-digit",
      minute: "2-digit",
      ...hour12,
    });
  });
  const dateFmt = cached(`date:${city.tz}`, () =>
    new Intl.DateTimeFormat(undefined, {
      timeZone: city.tz,
      weekday: "short",
      month: "short",
      day: "numeric",
    })
  );

  const there = zoneParts(city.tz, date);
  const thereDay = Date.UTC(+there.year, +there.month - 1, +there.day);
  const hereDay = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDelta = Math.round((thereDay - hereDay) / 86400000);

  const offset = zoneOffsetMinutes(city.tz, date);
  const localOffset = -date.getTimezoneOffset();

  return {
    time: timeFmt.format(date),
    date: dateFmt.format(date),
    phase: daylightPhase(city.lat, city.lon, sub),
    dayDelta,
    dayLabel: dayShift(dayDelta),
    offsetLabel: offsetLabel(offset),
    relativeLabel: relativeLabel(offset - localOffset),
    offsetMinutes: offset,
  };
}

/* ---------- Map ---------- */

const PHASE_TITLE = { day: "daytime", twilight: "twilight", night: "night" };
const MAP_W = 360;
const MAP_H = 180;
const MIN_ZOOM = 1;
const MAX_ZOOM = 8;

export function createWorldMap() {
  const root = svg("svg", {
    class: "world-map",
    viewBox: `0 0 ${MAP_W} ${MAP_H}`,
    preserveAspectRatio: "xMidYMid meet",
    role: "img",
    "aria-label": "World map showing daylight and night. Scroll to zoom, drag to pan.",
  });

  const defs = svg("defs");

  // Softens the terminator into something closer to a twilight band. The night
  // polygon overshoots the viewBox, so this never feathers the edges of the map.
  const blur = svg("filter", {
    id: "wm-night-blur",
    x: "-15%",
    y: "-15%",
    width: "130%",
    height: "130%",
    "color-interpolation-filters": "sRGB",
  });
  blur.appendChild(svg("feGaussianBlur", { stdDeviation: "2.4" }));
  defs.appendChild(blur);

  const glow = svg("radialGradient", { id: "wm-sun-glow" });
  glow.appendChild(svg("stop", { offset: "0%", "stop-color": "#ffd76a", "stop-opacity": "0.8" }));
  glow.appendChild(svg("stop", { offset: "55%", "stop-color": "#ffb02e", "stop-opacity": "0.2" }));
  glow.appendChild(svg("stop", { offset: "100%", "stop-color": "#ffb02e", "stop-opacity": "0" }));
  defs.appendChild(glow);

  const terrain = svg("linearGradient", {
    id: "wm-terrain",
    x1: "0",
    y1: "0",
    x2: "0",
    y2: "1",
  });
  for (const [offset, color] of [
    ["0%", "#d9e6ef"],
    ["10%", "#7d9a5c"],
    ["28%", "#3f7a36"],
    ["42%", "#c2a04d"],
    ["50%", "#d2b56a"],
    ["58%", "#c2a04d"],
    ["72%", "#3a7340"],
    ["90%", "#8aa36a"],
    ["100%", "#e6eef4"],
  ]) {
    terrain.appendChild(svg("stop", { offset, "stop-color": color }));
  }
  defs.appendChild(terrain);

  const terrainDark = svg("linearGradient", {
    id: "wm-terrain-dark",
    x1: "0",
    y1: "0",
    x2: "0",
    y2: "1",
  });
  for (const [offset, color] of [
    ["0%", "#8fa4b3"],
    ["10%", "#3d5330"],
    ["28%", "#24522a"],
    ["42%", "#7a6230"],
    ["50%", "#8a7040"],
    ["58%", "#7a6230"],
    ["72%", "#1f4a2c"],
    ["90%", "#4a5c38"],
    ["100%", "#9aafbb"],
  ]) {
    terrainDark.appendChild(svg("stop", { offset, "stop-color": color }));
  }
  defs.appendChild(terrainDark);

  const oceanDeep = svg("linearGradient", {
    id: "wm-ocean-deep",
    x1: "0",
    y1: "0",
    x2: "0",
    y2: "1",
  });
  oceanDeep.appendChild(svg("stop", { offset: "0%", "stop-color": "#163d5c" }));
  oceanDeep.appendChild(svg("stop", { offset: "50%", "stop-color": "#0b2a44" }));
  oceanDeep.appendChild(svg("stop", { offset: "100%", "stop-color": "#163d5c" }));
  defs.appendChild(oceanDeep);

  const oceanDeepLight = svg("linearGradient", {
    id: "wm-ocean-deep-light",
    x1: "0",
    y1: "0",
    x2: "0",
    y2: "1",
  });
  oceanDeepLight.appendChild(svg("stop", { offset: "0%", "stop-color": "#6ea8c9" }));
  oceanDeepLight.appendChild(svg("stop", { offset: "50%", "stop-color": "#3d7ea8" }));
  oceanDeepLight.appendChild(svg("stop", { offset: "100%", "stop-color": "#6ea8c9" }));
  defs.appendChild(oceanDeepLight);

  root.appendChild(defs);
  root.appendChild(svg("rect", { class: "wm-ocean", x: 0, y: 0, width: 360, height: 180 }));

  const graticule = svg("g", { class: "wm-graticule" });
  for (let lon = 0; lon <= 360; lon += 30) {
    graticule.appendChild(svg("line", { x1: lon, y1: 0, x2: lon, y2: 180 }));
  }
  for (let lat = 0; lat <= 180; lat += 30) {
    graticule.appendChild(svg("line", { x1: 0, y1: lat, x2: 360, y2: lat }));
  }
  graticule.appendChild(svg("line", { class: "wm-equator", x1: 0, y1: 90, x2: 360, y2: 90 }));
  root.appendChild(graticule);

  root.appendChild(svg("path", { class: "wm-land", d: LAND_PATH }));
  root.appendChild(svg("path", { class: "wm-borders", d: BORDERS_PATH }));

  const night = svg("path", { class: "wm-night", filter: "url(#wm-night-blur)", d: "" });
  root.appendChild(night);

  const sun = svg("g", { class: "wm-sun" });
  sun.appendChild(svg("circle", { class: "wm-sun-glow", r: 26, fill: "url(#wm-sun-glow)" }));
  sun.appendChild(svg("circle", { class: "wm-sun-core", r: 2.2 }));
  root.appendChild(sun);

  const pins = svg("g", { class: "wm-pins" });
  root.appendChild(pins);

  const disastersLayer = svg("g", { class: "wm-disasters" });
  root.appendChild(disastersLayer);

  const dropLayer = svg("g", { class: "wm-drop" });
  root.appendChild(dropLayer);

  let zoom = 1;
  let vx = 0;
  let vy = 0;
  let lastOpts = null;
  let drag = null;
  let pickMode = false;
  let pickHandler = null;
  let droppedPin = null;
  const slotByCity = new Map();
  const pinByCity = new Map();

  function viewSize() {
    return { w: MAP_W / zoom, h: MAP_H / zoom };
  }

  function applyView() {
    const { w, h } = viewSize();
    vx = Math.min(Math.max(0, vx), MAP_W - w);
    vy = Math.min(Math.max(0, vy), MAP_H - h);
    root.setAttribute("viewBox", `${vx} ${vy} ${w} ${h}`);
  }

  function viewport() {
    const box = root.getBoundingClientRect();
    const { w, h } = viewSize();
    if (!box.width || !box.height) return null;
    const scale = Math.min(box.width / w, box.height / h);
    return {
      box,
      w,
      h,
      scale,
      originX: box.left + (box.width - w * scale) / 2,
      originY: box.top + (box.height - h * scale) / 2,
    };
  }

  function clientToMap(clientX, clientY) {
    const vp = viewport();
    if (!vp) return { x: 0, y: 0 };
    return {
      x: vx + (clientX - vp.originX) / vp.scale,
      y: vy + (clientY - vp.originY) / vp.scale,
    };
  }

  function setZoomAt(nextZoom, clientX, clientY) {
    const before = clientToMap(clientX, clientY);
    zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
    const vp = viewport();
    if (vp) {
      vx = before.x - (clientX - vp.originX) / vp.scale;
      vy = before.y - (clientY - vp.originY) / vp.scale;
    }
    applyView();
  }

  function resetView() {
    zoom = 1;
    vx = 0;
    vy = 0;
    applyView();
  }

  // Above / below / side placements. Positions stay cached per city so pan
  // and zoom never reshuffle the labels.
  const LABEL_SLOTS = [
    { dx: 0, name: -8.8, time: -4.4, top: -11.6, bottom: -2.2 },
    { dx: 16, name: -8.8, time: -4.4, top: -11.6, bottom: -2.2 },
    { dx: -16, name: -8.8, time: -4.4, top: -11.6, bottom: -2.2 },
    { dx: 18, name: -2.2, time: 2.2, top: -5.6, bottom: 6 },
    { dx: -18, name: -2.2, time: 2.2, top: -5.6, bottom: 6 },
    { dx: 0, name: 6.4, time: 10.8, top: 3.4, bottom: 12.8 },
    { dx: 16, name: 6.4, time: 10.8, top: 3.4, bottom: 12.8 },
    { dx: -16, name: 6.4, time: 10.8, top: 3.4, bottom: 12.8 },
  ];

  function overlapArea(a, b) {
    const x = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
    const y = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
    return x * y;
  }

  function labelBox(entry, slot) {
    const nameW = entry.name.length * 1.75;
    const timeW = (entry.timeText?.length || 0) * 2.05;
    const half = Math.max(nameW, timeW, 14) / 2 + 2.2;
    return {
      x1: entry.x + slot.dx - half,
      x2: entry.x + slot.dx + half,
      y1: entry.y + slot.top,
      y2: entry.y + slot.bottom,
    };
  }

  /**
   * Assign a slot once per city. Later ticks only reuse the cached offset so
   * labels never jump when the map is panned or zoomed.
   */
  function placeLabels(entries) {
    const boxes = [];
    const northFirst = [...entries].sort((a, b) => a.y - b.y || a.x - b.x);
    for (const entry of northFirst) {
      const cached = slotByCity.get(entry.city.id);
      if (cached) {
        entry.slot = cached;
        boxes.push(labelBox(entry, cached));
        continue;
      }
      let best = null;
      for (const candidate of LABEL_SLOTS) {
        const box = labelBox(entry, candidate);
        const offMap =
          box.y1 < -6 || box.y2 > MAP_H + 6 || box.x1 < -10 || box.x2 > MAP_W + 10;
        const hit = boxes.reduce((sum, b) => sum + overlapArea(box, b), 0);
        const score = hit * 3 + (offMap ? 40 : 0);
        if (!best || score < best.score) best = { candidate, box, score };
        if (score === 0) break;
      }
      entry.slot = best.candidate;
      slotByCity.set(entry.city.id, best.candidate);
      boxes.push(best.box);
    }
    return entries;
  }

  function pinTitle(entry) {
    return (
      `${entry.city.name}, ${entry.city.country} — ` +
      `${entry.readout.time} ${entry.readout.offsetLabel}, ${PHASE_TITLE[entry.readout.phase]}` +
      (entry.reading ? ` — ${entry.reading.short} ${entry.reading.label}` : "")
    );
  }

  function createPin(entry) {
    const g = svg("g", { class: `wm-pin is-${entry.readout.phase}` });
    g.appendChild(svg("circle", { class: "wm-pin-halo", cx: entry.x, cy: entry.y, r: 3.1 }));
    g.appendChild(svg("circle", { class: "wm-pin-dot", cx: entry.x, cy: entry.y, r: 1.2 }));

    const title = svg("title");
    title.textContent = pinTitle(entry);
    g.appendChild(title);

    const lx = entry.x + (entry.slot?.dx || 0);
    const name = svg("text", {
      class: "wm-pin-name",
      x: lx,
      y: entry.y + entry.slot.name,
      "text-anchor": "middle",
    });
    name.textContent = entry.name;

    const time = svg("text", {
      class: "wm-pin-time",
      x: lx,
      y: entry.y + entry.slot.time,
      "text-anchor": "middle",
    });
    time.textContent = entry.timeText;

    g.append(name, time);
    pins.appendChild(g);
    pinByCity.set(entry.city.id, { group: g, title, name, time });
  }

  function renderPins(cities, date, clockFormat, sub, weather) {
    const live = new Set(cities.map((c) => c.id));
    for (const [id, node] of pinByCity) {
      if (live.has(id)) continue;
      node.group.remove();
      pinByCity.delete(id);
      slotByCity.delete(id);
    }

    const entries = cities.map((city) => {
      const readout = cityReadout(city, date, clockFormat, sub);
      const reading = weather[city.id];
      return {
        city,
        name: city.name,
        timeText: reading ? `${readout.time} · ${reading.short}` : readout.time,
        reading,
        x: projectX(city.lon),
        y: projectY(city.lat),
        readout,
      };
    });

    placeLabels(entries);

    for (const entry of entries) {
      const node = pinByCity.get(entry.city.id);
      if (!node) {
        createPin(entry);
        continue;
      }
      node.group.setAttribute("class", `wm-pin is-${entry.readout.phase}`);
      node.title.textContent = pinTitle(entry);
      node.time.textContent = entry.timeText;
    }
  }

  function renderDisasters(events) {
    const frag = document.createDocumentFragment();
    for (const event of events) {
      if (!Number.isFinite(event.lat) || !Number.isFinite(event.lon)) continue;
      const x = projectX(event.lon);
      const y = projectY(event.lat);
      const g = svg("g", {
        class: `wm-disaster is-${event.type}`,
        transform: `translate(${x.toFixed(2)} ${y.toFixed(2)})`,
      });

      // Diamond marker — distinct from circular city pins.
      g.appendChild(
        svg("polygon", {
          class: "wm-disaster-halo",
          points: "0,-3.4 3.4,0 0,3.4 -3.4,0",
        })
      );
      g.appendChild(
        svg("polygon", {
          class: "wm-disaster-core",
          points: "0,-1.55 1.55,0 0,1.55 -1.55,0",
        })
      );

      const title = svg("title");
      const magBit =
        event.type === "earthquake" && event.magnitude != null
          ? ` M${Number(event.magnitude).toFixed(1)}`
          : event.magnitude != null && event.magnitudeUnit
            ? ` · ${event.magnitude} ${event.magnitudeUnit}`
            : "";
      title.textContent = `${event.title}${magBit} — ${event.source || "Alert"}`;
      g.appendChild(title);
      frag.appendChild(g);
    }
    disastersLayer.replaceChildren(frag);
  }

  function applyMapStyle(style) {
    root.classList.toggle("is-terrestrial", style === "terrestrial");
  }

  function refreshOverlays() {
    if (!lastOpts) return;
    const {
      date = new Date(),
      cities = [],
      showPins = true,
      clockFormat = "auto",
      weather = {},
      showDisasters = false,
      disasters = [],
    } = lastOpts;
    const sub = subsolarPoint(date);
    if (showPins && cities.length) {
      renderPins(cities, date, clockFormat, sub, weather);
    } else {
      pins.replaceChildren();
      pinByCity.clear();
    }
    if (showDisasters && disasters.length) {
      renderDisasters(disasters);
    } else {
      disastersLayer.replaceChildren();
    }
    renderDroppedPin();
  }

  function lonLatFromClient(clientX, clientY) {
    const p = clientToMap(clientX, clientY);
    return {
      lon: Math.min(180, Math.max(-180, p.x - 180)),
      lat: Math.min(90, Math.max(-90, 90 - p.y)),
    };
  }

  function renderDroppedPin() {
    dropLayer.replaceChildren();
    if (!droppedPin || !Number.isFinite(droppedPin.lat) || !Number.isFinite(droppedPin.lon)) {
      return;
    }
    const x = projectX(droppedPin.lon);
    const y = projectY(droppedPin.lat);
    const g = svg("g", {
      class: "wm-drop-pin",
      transform: `translate(${x.toFixed(2)} ${y.toFixed(2)})`,
    });
    const mark = svg("g", { class: "wm-drop-mark-wrap", transform: "scale(0.42)" });
    mark.appendChild(svg("path", {
      class: "wm-drop-mark",
      d: "M0 0c3.6-4.6 6.2-8 6.2-11.2A6.2 6.2 0 0 0-6.2-11.2C-6.2-8-3.6-4.6 0 0z",
    }));
    mark.appendChild(svg("circle", { class: "wm-drop-dot", cx: 0, cy: -11.2, r: 1.7 }));
    g.appendChild(mark);

    const name = svg("text", {
      class: "wm-pin-name",
      x: 0,
      y: -9.4,
      "text-anchor": "middle",
    });
    name.textContent = droppedPin.name || "Pinned";

    const time = svg("text", {
      class: "wm-pin-time",
      x: 0,
      y: -5.4,
      "text-anchor": "middle",
    });
    time.textContent = droppedPin.timeText || "";

    g.append(name, time);
    const title = svg("title");
    title.textContent = [droppedPin.name, droppedPin.timeText].filter(Boolean).join(" — ");
    g.appendChild(title);
    dropLayer.appendChild(g);
  }

  function setPickMode(on, handler = null) {
    pickMode = Boolean(on);
    pickHandler = pickMode ? handler : null;
    root.classList.toggle("is-picking", pickMode);
  }

  function setDroppedPin(pin) {
    droppedPin = pin;
    renderDroppedPin();
  }

  function update({
    date = new Date(),
    cities = [],
    showPins = true,
    clockFormat = "auto",
    weather = {},
    showDisasters = false,
    disasters = [],
    mapStyle = "political",
  } = {}) {
    lastOpts = { date, cities, showPins, clockFormat, weather, showDisasters, disasters, mapStyle };
    applyMapStyle(mapStyle);
    const sub = subsolarPoint(date);
    night.setAttribute("d", terminatorPath(sub));
    sun.setAttribute(
      "transform",
      `translate(${projectX(sub.lon).toFixed(2)} ${projectY(sub.lat).toFixed(2)})`
    );
    refreshOverlays();
  }

  root.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const step = e.deltaY > 0 ? 1 / 1.18 : 1.18;
      setZoomAt(zoom * step, e.clientX, e.clientY);
    },
    { passive: false }
  );

  root.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    document.getSelection()?.removeAllRanges();
    drag = { x: e.clientX, y: e.clientY, vx, vy, moved: false, pick: pickMode };
    root.setPointerCapture(e.pointerId);
    if (!pickMode) {
      document.body.classList.add("is-map-panning");
      root.classList.add("is-panning");
    }
  });

  root.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dist = Math.hypot(e.clientX - drag.x, e.clientY - drag.y);
    if (dist > 5) {
      if (!drag.moved && drag.pick) {
        document.body.classList.add("is-map-panning");
        root.classList.add("is-panning");
      }
      drag.moved = true;
    }
    if (!drag.moved && drag.pick) return;
    const vp = viewport();
    if (!vp) return;
    vx = drag.vx - (e.clientX - drag.x) / vp.scale;
    vy = drag.vy - (e.clientY - drag.y) / vp.scale;
    applyView();
  });

  function endPan(e) {
    if (!drag) return;
    const wasClick = !drag.moved && drag.pick && pickHandler;
    const point = wasClick ? lonLatFromClient(e.clientX, e.clientY) : null;
    drag = null;
    root.classList.remove("is-panning");
    document.body.classList.remove("is-map-panning");
    if (e?.pointerId != null && root.hasPointerCapture?.(e.pointerId)) {
      root.releasePointerCapture(e.pointerId);
    }
    if (point) pickHandler(point);
  }

  root.addEventListener("selectstart", (e) => e.preventDefault());
  root.addEventListener("pointerup", endPan);
  root.addEventListener("pointercancel", endPan);
  root.addEventListener("dblclick", (e) => {
    e.preventDefault();
    resetView();
  });

  return { el: root, update, setPickMode, setDroppedPin };
}
