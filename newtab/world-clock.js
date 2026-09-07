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

export function createWorldMap() {
  const root = svg("svg", {
    class: "world-map",
    viewBox: "0 0 360 180",
    preserveAspectRatio: "xMidYMid meet",
    role: "img",
    "aria-label": "World map showing daylight and night",
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

  // Candidate label positions, tried in order, so pins packed close together
  // (Europe, east Asia) do not stack their labels on top of each other.
  const LABEL_SLOTS = [
    { name: -8.6, time: -4.2, top: -11.2, bottom: -2.4 },
    { name: 6.2, time: 10.6, top: 3.6, bottom: 12.4 },
    { name: -17.2, time: -12.8, top: -19.8, bottom: -11 },
    { name: 14.8, time: 19.2, top: 12.2, bottom: 21 },
  ];

  /**
   * `blocked` holds rectangles already occupied by the page content, in map
   * units. A label that cannot find a free slot is dropped and only its dot is
   * drawn, which reads better than a name half-hidden behind a card.
   */
  function placeLabels(entries, blocked = []) {
    const boxes = [...blocked];
    for (const entry of entries) {
      const halfWidth = Math.max(entry.name.length * 1.05, 9);
      entry.slot = null;
      for (const candidate of LABEL_SLOTS) {
        const box = {
          x1: entry.x - halfWidth,
          x2: entry.x + halfWidth,
          y1: entry.y + candidate.top,
          y2: entry.y + candidate.bottom,
        };
        const clash = boxes.some(
          (b) => box.x1 < b.x2 && box.x2 > b.x1 && box.y1 < b.y2 && box.y2 > b.y1
        );
        if (!clash) {
          entry.slot = candidate;
          boxes.push(box);
          break;
        }
      }
    }
    return entries;
  }

  /** Viewport rect -> map units, matching viewBox 0 0 360 180 + xMidYMid meet. */
  function toMapUnits(rect) {
    const box = root.getBoundingClientRect();
    if (!box.width || !box.height) return null;
    const scale = Math.min(box.width / 360, box.height / 180);
    const originX = box.left + (box.width - 360 * scale) / 2;
    const originY = box.top + (box.height - 180 * scale) / 2;
    return {
      x1: (rect.left - originX) / scale,
      y1: (rect.top - originY) / scale,
      x2: (rect.right - originX) / scale,
      y2: (rect.bottom - originY) / scale,
    };
  }

  function renderPins(cities, date, clockFormat, sub, blocked) {
    const entries = cities
      .map((city) => ({
        city,
        name: city.name,
        x: projectX(city.lon),
        y: projectY(city.lat),
        readout: cityReadout(city, date, clockFormat, sub),
      }))
      .sort((a, b) => a.x - b.x);

    const frag = document.createDocumentFragment();
    for (const entry of placeLabels(entries, blocked)) {
      const g = svg("g", { class: `wm-pin is-${entry.readout.phase}` });
      g.appendChild(svg("circle", { class: "wm-pin-halo", cx: entry.x, cy: entry.y, r: 3.1 }));
      g.appendChild(svg("circle", { class: "wm-pin-dot", cx: entry.x, cy: entry.y, r: 1.2 }));

      const title = svg("title");
      title.textContent =
        `${entry.city.name}, ${entry.city.country} — ` +
        `${entry.readout.time} ${entry.readout.offsetLabel}, ${PHASE_TITLE[entry.readout.phase]}`;
      g.appendChild(title);

      if (entry.slot) {
        const name = svg("text", {
          class: "wm-pin-name",
          x: entry.x,
          y: entry.y + entry.slot.name,
          "text-anchor": "middle",
        });
        name.textContent = entry.name;

        const time = svg("text", {
          class: "wm-pin-time",
          x: entry.x,
          y: entry.y + entry.slot.time,
          "text-anchor": "middle",
        });
        time.textContent = entry.readout.time;

        g.append(name, time);
      }
      frag.appendChild(g);
    }
    pins.replaceChildren(frag);
  }

  function update({
    date = new Date(),
    cities = [],
    showPins = true,
    clockFormat = "auto",
    avoid = [],
  } = {}) {
    const sub = subsolarPoint(date);
    night.setAttribute("d", terminatorPath(sub));
    sun.setAttribute(
      "transform",
      `translate(${projectX(sub.lon).toFixed(2)} ${projectY(sub.lat).toFixed(2)})`
    );
    if (showPins && cities.length) {
      const blocked = avoid.map(toMapUnits).filter(Boolean);
      renderPins(cities, date, clockFormat, sub, blocked);
    } else {
      pins.replaceChildren();
    }
  }

  return { el: root, update };
}
