/**
 * Major natural disasters — NASA EONET (multi-hazard) plus USGS earthquakes
 * when reachable. Both are free, keyless, and CORS-open for browser fetch.
 */

const EONET_BASE = "https://eonet.gsfc.nasa.gov/api/v3/events";

const EONET_QUERIES = [
  { category: "earthquakes", limit: 20 },
  { category: "severeStorms", limit: 20 },
  { category: "volcanoes", limit: 15 },
  { category: "floods", limit: 15 },
  { category: "landslides", limit: 10 },
  { category: "wildfires", limit: 40 },
];

const USGS_URL =
  "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minmagnitude=5.5&orderby=time&limit=40";

/** Cap how many markers we draw so the map stays readable. */
export const DISASTER_DISPLAY_LIMIT = 28;

const TYPE_META = {
  earthquake: { label: "Earthquake", rank: 5 },
  storm: { label: "Severe storm", rank: 4 },
  volcano: { label: "Volcano", rank: 4 },
  wildfire: { label: "Wildfire", rank: 3 },
  flood: { label: "Flood", rank: 3 },
  landslide: { label: "Landslide", rank: 2 },
};

export function disasterTypeLabel(type) {
  return TYPE_META[type]?.label || "Disaster";
}

function lastGeometry(event) {
  const list = Array.isArray(event.geometry) ? event.geometry : [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const g = list[i];
    if (!g) continue;
    if (g.type === "Point" && Array.isArray(g.coordinates) && g.coordinates.length >= 2) {
      return g;
    }
  }
  return null;
}

function mapEonetCategory(id) {
  switch (id) {
    case "earthquakes":
      return "earthquake";
    case "wildfires":
      return "wildfire";
    case "severeStorms":
      return "storm";
    case "volcanoes":
      return "volcano";
    case "floods":
      return "flood";
    case "landslides":
      return "landslide";
    default:
      return null;
  }
}

/** Keep only events that read as major for the map overlay. */
function isMajorEonet(type, title, geom) {
  const mag = typeof geom.magnitudeValue === "number" ? geom.magnitudeValue : null;
  const unit = String(geom.magnitudeUnit || "").toLowerCase();
  const name = String(title || "");

  if (type === "earthquake") {
    return mag == null || mag >= 5.5;
  }
  if (type === "wildfire") {
    if (unit.includes("acre") && mag != null) return mag >= 1000;
    return /wildfire|fire/i.test(name);
  }
  if (type === "storm") {
    if (unit.includes("kt") && mag != null) return mag >= 30;
    return /hurricane|typhoon|cyclone|tropical|storm/i.test(name);
  }
  return true;
}

function severityScore(event) {
  const base = TYPE_META[event.type]?.rank || 1;
  const mag = typeof event.magnitude === "number" ? event.magnitude : 0;
  const ageHours = Math.max(0, (Date.now() - event.when) / 3600000);
  const freshness = Math.max(0, 72 - ageHours) / 72;
  return base * 10 + mag + freshness * 5;
}

function fromEonet(payload) {
  const out = [];
  for (const event of payload?.events || []) {
    const catId = event.categories?.[0]?.id;
    const type = mapEonetCategory(catId);
    if (!type) continue;
    const geom = lastGeometry(event);
    if (!geom) continue;
    if (!isMajorEonet(type, event.title, geom)) continue;

    const [lon, lat] = geom.coordinates;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const when = Date.parse(geom.date || event.geometry?.[0]?.date || "") || Date.now();
    out.push({
      id: `eonet:${event.id}`,
      type,
      title: event.title || disasterTypeLabel(type),
      lat,
      lon,
      magnitude: typeof geom.magnitudeValue === "number" ? geom.magnitudeValue : null,
      magnitudeUnit: geom.magnitudeUnit || null,
      when,
      source: "NASA EONET",
      url: event.sources?.[0]?.url || `https://eonet.gsfc.nasa.gov/api/v3/events/${event.id}`,
    });
  }
  return out;
}

function fromUsgs(payload) {
  const out = [];
  for (const feature of payload?.features || []) {
    const props = feature.properties || {};
    const coords = feature.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const [lon, lat] = coords;
    const mag = typeof props.mag === "number" ? props.mag : null;
    if (mag != null && mag < 5.5) continue;
    out.push({
      id: `usgs:${feature.id || props.code || `${lat},${lon},${props.time}`}`,
      type: "earthquake",
      title: props.title || props.place || `M${mag} earthquake`,
      lat,
      lon,
      magnitude: mag,
      magnitudeUnit: "magnitude",
      when: Number(props.time) || Date.now(),
      source: "USGS",
      url: props.url || null,
    });
  }
  return out;
}

async function fetchJson(url, signal) {
  const res = await fetch(url, { signal, credentials: "omit" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Merges EONET + USGS (USGS optional), sorts by severity, and caps the list.
 * USGS failures are ignored so a blocked host does not hide other hazards.
 */
export async function fetchDisasters({ signal } = {}) {
  const eonetPromises = EONET_QUERIES.map(({ category, limit }) => {
    const url = `${EONET_BASE}?status=open&limit=${limit}&category=${category}`;
    return fetchJson(url, signal).catch(() => ({ events: [] }));
  });
  const usgsPromise = fetchJson(USGS_URL, signal).catch(() => null);

  const [usgs, ...eonetChunks] = await Promise.all([usgsPromise, ...eonetPromises]);
  const eonetEvents = eonetChunks.flatMap((chunk) => chunk?.events || []);
  const merged = [...fromEonet({ events: eonetEvents }), ...(usgs ? fromUsgs(usgs) : [])];

  // Prefer USGS quakes over EONET duplicates near the same spot/time.
  const seen = new Set();
  const unique = [];
  for (const event of merged.sort((a, b) => severityScore(b) - severityScore(a))) {
    const key =
      event.type === "earthquake"
        ? `eq:${event.lat.toFixed(1)},${event.lon.toFixed(1)},${Math.round(event.when / 86400000)}`
        : event.id;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(event);
  }

  // Keep a mix of hazard types so large wildfires do not crowd out storms/quakes.
  const perType = {
    earthquake: 8,
    storm: 6,
    volcano: 4,
    flood: 4,
    landslide: 3,
    wildfire: 10,
  };
  const counts = Object.fromEntries(Object.keys(perType).map((k) => [k, 0]));
  const picked = [];
  for (const event of unique) {
    const cap = perType[event.type] ?? 4;
    if ((counts[event.type] || 0) >= cap) continue;
    counts[event.type] = (counts[event.type] || 0) + 1;
    picked.push(event);
    if (picked.length >= DISASTER_DISPLAY_LIMIT) break;
  }
  return picked.sort((a, b) => severityScore(b) - severityScore(a));
}

export function formatDisasterMeta(event) {
  const bits = [disasterTypeLabel(event.type)];
  if (event.type === "earthquake" && event.magnitude != null) {
    bits.push(`M${event.magnitude.toFixed(1)}`);
  } else if (event.magnitude != null && event.magnitudeUnit) {
    const unit = event.magnitudeUnit;
    if (unit.toLowerCase().includes("acre")) {
      bits.push(`${Math.round(event.magnitude).toLocaleString()} acres`);
    } else if (unit.toLowerCase().includes("kt")) {
      bits.push(`${Math.round(event.magnitude)} kts`);
    } else {
      bits.push(`${event.magnitude} ${unit}`);
    }
  }
  return bits.join(" · ");
}

export function formatDisasterWhen(event, now = Date.now()) {
  const minutes = Math.floor(Math.max(0, now - event.when) / 60000);
  if (minutes < 60) return minutes < 1 ? "just now" : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
