/**
 * World clock city catalogue.
 *
 * id   stable key stored in state
 * tz   IANA zone — Intl handles DST, so offsets are never hard-coded
 * lat/lon  used to place the pin on the map and to work out day vs night
 * rank map zoom gate: 1 = always at world view, 5 = only when well zoomed in
 * capital  national capital — distinct map color and earlier zoom gate
 */

import { COUNTRY_CITIES } from "./country-cities.js";

/** Watch-list cities that are national (or SAR) capitals. */
const WATCH_CAPITALS = new Set([
  "mexico_city",
  "bogota",
  "santiago",
  "buenos_aires",
  "reykjavik",
  "lisbon",
  "london",
  "dublin",
  "madrid",
  "paris",
  "amsterdam",
  "berlin",
  "rome",
  "stockholm",
  "warsaw",
  "cairo",
  "athens",
  "helsinki",
  "nairobi",
  "moscow",
  "tehran",
  "delhi",
  "dhaka",
  "bangkok",
  "jakarta",
  "singapore",
  "hong_kong",
  "beijing",
  "taipei",
  "seoul",
  "tokyo",
]);

/** Entries in COUNTRY_CITIES that are major cities, not capitals. */
const COUNTRY_NON_CAPITALS = new Set([
  "zurich",
  "almaty",
  "ho_chi_minh",
  "yangon",
  "abidjan",
]);

function withCapitalFlag(city, fromCountryList) {
  const capital = fromCountryList
    ? !COUNTRY_NON_CAPITALS.has(city.id)
    : WATCH_CAPITALS.has(city.id);
  return capital ? { ...city, capital: true } : city;
}

export const CITIES = [
  // Americas
  { id: "honolulu", name: "Honolulu", country: "USA", tz: "Pacific/Honolulu", lat: 21.31, lon: -157.86, rank: 3, region: "Americas" },
  { id: "anchorage", name: "Anchorage", country: "USA", tz: "America/Anchorage", lat: 61.22, lon: -149.9, rank: 3, region: "Americas" },
  { id: "vancouver", name: "Vancouver", country: "Canada", tz: "America/Vancouver", lat: 49.28, lon: -123.12, rank: 2, region: "Americas" },
  { id: "los_angeles", name: "Los Angeles", country: "USA", tz: "America/Los_Angeles", lat: 34.05, lon: -118.24, rank: 1, region: "Americas" },
  { id: "denver", name: "Denver", country: "USA", tz: "America/Denver", lat: 39.74, lon: -104.99, rank: 3, region: "Americas" },
  { id: "mexico_city", name: "Mexico City", country: "Mexico", tz: "America/Mexico_City", lat: 19.43, lon: -99.13, rank: 1, region: "Americas" },
  { id: "chicago", name: "Chicago", country: "USA", tz: "America/Chicago", lat: 41.88, lon: -87.63, rank: 2, region: "Americas" },
  { id: "bogota", name: "Bogotá", country: "Colombia", tz: "America/Bogota", lat: 4.71, lon: -74.07, rank: 2, region: "Americas" },
  { id: "new_york", name: "New York", country: "USA", tz: "America/New_York", lat: 40.71, lon: -74.01, rank: 1, region: "Americas" },
  { id: "toronto", name: "Toronto", country: "Canada", tz: "America/Toronto", lat: 43.65, lon: -79.38, rank: 1, region: "Americas" },
  { id: "santiago", name: "Santiago", country: "Chile", tz: "America/Santiago", lat: -33.45, lon: -70.67, rank: 2, region: "Americas" },
  { id: "buenos_aires", name: "Buenos Aires", country: "Argentina", tz: "America/Argentina/Buenos_Aires", lat: -34.6, lon: -58.38, rank: 1, region: "Americas" },
  { id: "sao_paulo", name: "São Paulo", country: "Brazil", tz: "America/Sao_Paulo", lat: -23.55, lon: -46.63, rank: 1, region: "Americas" },

  // Europe & Africa
  { id: "reykjavik", name: "Reykjavík", country: "Iceland", tz: "Atlantic/Reykjavik", lat: 64.15, lon: -21.94, rank: 3, region: "Europe" },
  { id: "lisbon", name: "Lisbon", country: "Portugal", tz: "Europe/Lisbon", lat: 38.72, lon: -9.14, rank: 2, region: "Europe" },
  { id: "london", name: "London", country: "UK", tz: "Europe/London", lat: 51.51, lon: -0.13, rank: 1, region: "Europe" },
  { id: "dublin", name: "Dublin", country: "Ireland", tz: "Europe/Dublin", lat: 53.35, lon: -6.26, rank: 2, region: "Europe" },
  { id: "lagos", name: "Lagos", country: "Nigeria", tz: "Africa/Lagos", lat: 6.52, lon: 3.38, rank: 1, region: "Africa" },
  { id: "madrid", name: "Madrid", country: "Spain", tz: "Europe/Madrid", lat: 40.42, lon: -3.7, rank: 1, region: "Europe" },
  { id: "paris", name: "Paris", country: "France", tz: "Europe/Paris", lat: 48.86, lon: 2.35, rank: 1, region: "Europe" },
  { id: "amsterdam", name: "Amsterdam", country: "Netherlands", tz: "Europe/Amsterdam", lat: 52.37, lon: 4.9, rank: 2, region: "Europe" },
  { id: "berlin", name: "Berlin", country: "Germany", tz: "Europe/Berlin", lat: 52.52, lon: 13.4, rank: 1, region: "Europe" },
  { id: "rome", name: "Rome", country: "Italy", tz: "Europe/Rome", lat: 41.9, lon: 12.5, rank: 1, region: "Europe" },
  { id: "stockholm", name: "Stockholm", country: "Sweden", tz: "Europe/Stockholm", lat: 59.33, lon: 18.07, rank: 2, region: "Europe" },
  { id: "warsaw", name: "Warsaw", country: "Poland", tz: "Europe/Warsaw", lat: 52.23, lon: 21.01, rank: 2, region: "Europe" },
  { id: "cape_town", name: "Cape Town", country: "South Africa", tz: "Africa/Johannesburg", lat: -33.92, lon: 18.42, rank: 3, region: "Africa" },
  { id: "johannesburg", name: "Johannesburg", country: "South Africa", tz: "Africa/Johannesburg", lat: -26.2, lon: 28.05, rank: 1, region: "Africa" },
  { id: "cairo", name: "Cairo", country: "Egypt", tz: "Africa/Cairo", lat: 30.04, lon: 31.24, rank: 1, region: "Africa" },
  { id: "athens", name: "Athens", country: "Greece", tz: "Europe/Athens", lat: 37.98, lon: 23.73, rank: 2, region: "Europe" },
  { id: "helsinki", name: "Helsinki", country: "Finland", tz: "Europe/Helsinki", lat: 60.17, lon: 24.94, rank: 2, region: "Europe" },
  { id: "istanbul", name: "Istanbul", country: "Türkiye", tz: "Europe/Istanbul", lat: 41.01, lon: 28.98, rank: 1, region: "Europe" },
  { id: "nairobi", name: "Nairobi", country: "Kenya", tz: "Africa/Nairobi", lat: -1.29, lon: 36.82, rank: 2, region: "Africa" },
  { id: "moscow", name: "Moscow", country: "Russia", tz: "Europe/Moscow", lat: 55.76, lon: 37.62, rank: 1, region: "Europe" },

  // Middle East & Asia
  { id: "dubai", name: "Dubai", country: "UAE", tz: "Asia/Dubai", lat: 25.2, lon: 55.27, rank: 1, region: "Asia" },
  { id: "tehran", name: "Tehran", country: "Iran", tz: "Asia/Tehran", lat: 35.69, lon: 51.39, rank: 2, region: "Asia" },
  { id: "karachi", name: "Karachi", country: "Pakistan", tz: "Asia/Karachi", lat: 24.86, lon: 67.01, rank: 2, region: "Asia" },
  { id: "mumbai", name: "Mumbai", country: "India", tz: "Asia/Kolkata", lat: 19.08, lon: 72.88, rank: 1, region: "Asia" },
  { id: "delhi", name: "New Delhi", country: "India", tz: "Asia/Kolkata", lat: 28.61, lon: 77.21, rank: 1, region: "Asia" },
  { id: "dhaka", name: "Dhaka", country: "Bangladesh", tz: "Asia/Dhaka", lat: 23.81, lon: 90.41, rank: 2, region: "Asia" },
  { id: "bangkok", name: "Bangkok", country: "Thailand", tz: "Asia/Bangkok", lat: 13.76, lon: 100.5, rank: 1, region: "Asia" },
  { id: "jakarta", name: "Jakarta", country: "Indonesia", tz: "Asia/Jakarta", lat: -6.21, lon: 106.85, rank: 1, region: "Asia" },
  { id: "singapore", name: "Singapore", country: "Singapore", tz: "Asia/Singapore", lat: 1.35, lon: 103.82, rank: 1, region: "Asia" },
  { id: "hong_kong", name: "Hong Kong", country: "Hong Kong", tz: "Asia/Hong_Kong", lat: 22.32, lon: 114.17, rank: 2, region: "Asia" },
  { id: "shanghai", name: "Shanghai", country: "China", tz: "Asia/Shanghai", lat: 31.23, lon: 121.47, rank: 1, region: "Asia" },
  { id: "beijing", name: "Beijing", country: "China", tz: "Asia/Shanghai", lat: 39.9, lon: 116.41, rank: 1, region: "Asia" },
  { id: "taipei", name: "Taipei", country: "Taiwan", tz: "Asia/Taipei", lat: 25.03, lon: 121.57, rank: 2, region: "Asia" },
  { id: "seoul", name: "Seoul", country: "South Korea", tz: "Asia/Seoul", lat: 37.57, lon: 126.98, rank: 1, region: "Asia" },
  { id: "tokyo", name: "Tokyo", country: "Japan", tz: "Asia/Tokyo", lat: 35.68, lon: 139.69, rank: 1, region: "Asia" },
  { id: "osaka", name: "Osaka", country: "Japan", tz: "Asia/Tokyo", lat: 34.69, lon: 135.5, rank: 2, region: "Asia" },

  // Oceania
  { id: "perth", name: "Perth", country: "Australia", tz: "Australia/Perth", lat: -31.95, lon: 115.86, rank: 3, region: "Oceania" },
  { id: "adelaide", name: "Adelaide", country: "Australia", tz: "Australia/Adelaide", lat: -34.93, lon: 138.6, rank: 3, region: "Oceania" },
  { id: "brisbane", name: "Brisbane", country: "Australia", tz: "Australia/Brisbane", lat: -27.47, lon: 153.03, rank: 3, region: "Oceania" },
  { id: "melbourne", name: "Melbourne", country: "Australia", tz: "Australia/Melbourne", lat: -37.81, lon: 144.96, rank: 2, region: "Oceania" },
  { id: "sydney", name: "Sydney", country: "Australia", tz: "Australia/Sydney", lat: -33.87, lon: 151.21, rank: 1, region: "Oceania" },
  { id: "auckland", name: "Auckland", country: "New Zealand", tz: "Pacific/Auckland", lat: -36.85, lon: 174.76, rank: 2, region: "Oceania" },

  // Reference
  { id: "utc", name: "UTC", country: "Coordinated Universal Time", tz: "UTC", lat: 0, lon: 0, rank: 5, region: "Reference" },
];

const byId = new Map();
for (const city of CITIES) {
  if (!byId.has(city.id)) byId.set(city.id, withCapitalFlag(city, false));
}
for (const city of COUNTRY_CITIES) {
  if (!byId.has(city.id)) byId.set(city.id, withCapitalFlag(city, true));
}

export const CITY_BY_ID = byId;

/** Watch list plus every country capital — used by the map and the add-city picker. */
export const ALL_CITIES = [...byId.values()];

/** Map gazetteer: every real city, ranked for zoom. */
export const MAP_CITIES = ALL_CITIES.filter((c) => c.id !== "utc");

export const CITY_REGIONS = ["Americas", "Europe", "Africa", "Asia", "Oceania", "Reference"];

/** Lowest zoom at which a rank is drawn. */
export const RANK_MIN_ZOOM = { 1: 1, 2: 1.55, 3: 2.4, 4: 3.7, 5: 5.2 };

/** Capitals unlock one zoom level earlier than their catalogue rank. */
export function mapRank(city) {
  const rank = city.rank ?? 3;
  return city.capital ? Math.max(1, rank - 1) : rank;
}

export function cityMinZoom(city) {
  return RANK_MIN_ZOOM[mapRank(city)] ?? RANK_MIN_ZOOM[3];
}

/** Shown on a fresh install — the ones most people actually watch. */
export const DEFAULT_CITY_IDS = [
  "los_angeles",
  "new_york",
  "london",
  "dubai",
  "tokyo",
  "sydney",
];

const COUNTRY_ALIASES = {
  USA: ["united states", "united states of america", "us"],
  UK: ["united kingdom", "britain", "great britain", "england"],
  UAE: ["united arab emirates"],
  Türkiye: ["turkey"],
  Czechia: ["czech republic", "czech"],
  "DR Congo": ["congo", "drc"],
  "Côte d'Ivoire": ["ivory coast", "cote divoire"],
  "South Korea": ["korea"],
};

const tzMetaCache = new Map();

export function foldText(value) {
  return String(value)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[−–—]/g, "-")
    .replace(/[_/,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

export function formatOffsetLabel(minutes) {
  if (!minutes) return "UTC";
  const sign = minutes < 0 ? "−" : "+";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? `:${pad2(m)}` : ""}`;
}

function offsetSearchForms(minutes) {
  const sign = minutes < 0 ? "-" : minutes > 0 ? "+" : "+";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const forms = ["utc", "gmt"];
  if (!minutes) {
    forms.push("utc+0", "gmt+0", "utc+00:00", "gmt+00:00", "utc-0");
    return forms;
  }
  const hm = m ? `${h}:${pad2(m)}` : String(h);
  const padded = `${pad2(h)}:${m ? pad2(m) : "00"}`;
  for (const prefix of ["utc", "gmt"]) {
    forms.push(`${prefix}${sign}${hm}`, `${prefix}${sign}${padded}`);
    if (!m) forms.push(`${prefix}${sign}${h}`, `${prefix}${sign}${h}:00`);
  }
  forms.push(`${sign}${hm}`);
  if (!m) forms.push(`${sign}${h}`);
  return forms;
}

function zoneOffsetMinutes(tz, date) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = {};
  for (const { type, value } of dtf.formatToParts(date)) parts[type] = value;
  const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUTC - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

function tzName(tz, date, name) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: name,
    }).formatToParts(date);
    return parts.find((p) => p.type === "timeZoneName")?.value || "";
  } catch {
    return "";
  }
}

function cityTzMeta(city, date) {
  const bucket = `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}-${Math.floor(date.getUTCHours() / 6)}`;
  const key = `${city.id}|${bucket}`;
  const cached = tzMetaCache.get(key);
  if (cached) return cached;

  let offsetMinutes = 0;
  let offsetLabel = "UTC";
  let tzShort = "";
  let tzLong = "";
  let tzNames = "";
  try {
    offsetMinutes = zoneOffsetMinutes(city.tz, date);
    offsetLabel = formatOffsetLabel(offsetMinutes);
    const winter = new Date(Date.UTC(date.getUTCFullYear(), 0, 15, 12));
    const summer = new Date(Date.UTC(date.getUTCFullYear(), 6, 15, 12));
    tzShort = tzName(city.tz, date, "short");
    tzLong =
      tzName(city.tz, date, "longGeneric") ||
      tzName(city.tz, date, "long") ||
      tzName(city.tz, winter, "long") ||
      tzName(city.tz, summer, "long");
    const winterShort = tzName(city.tz, winter, "short");
    const summerShort = tzName(city.tz, summer, "short");
    const labels = [
      tzShort,
      tzLong,
      winterShort,
      summerShort,
      tzName(city.tz, date, "shortGeneric"),
      tzName(city.tz, winter, "long"),
      tzName(city.tz, summer, "long"),
    ].filter(Boolean);
    const realShorts = [tzShort, winterShort, summerShort].filter((s) => s && !looksLikeOffsetName(s));
    const derived = looksLikeOffsetName(tzShort)
      ? labels
          .map(abbrevFromLabel)
          .filter((abbr) => abbr && !WELL_KNOWN_US_ABBREV.has(abbr))
      : [];
    tzNames = `${labels.join(" ")} ${realShorts.join(" ")} ${derived.join(" ")}`;
  } catch {
    offsetMinutes = 0;
    offsetLabel = "UTC";
  }

  const aliases = COUNTRY_ALIASES[city.country] || [];
  const search = foldText(
    [
      city.name,
      city.country,
      city.region,
      city.tz,
      city.tz.replaceAll("_", " "),
      offsetLabel,
      tzNames,
      ...offsetSearchForms(offsetMinutes),
      ...aliases,
    ].join(" ")
  );

  const meta = { offsetMinutes, offsetLabel, tzShort, tzLong, search };
  tzMetaCache.set(key, meta);
  if (tzMetaCache.size > 800) tzMetaCache.clear();
  return meta;
}

function looksLikeOffsetName(label) {
  return /^(utc|gmt)/i.test(String(label).replace(/\s/g, ""));
}

const WELL_KNOWN_US_ABBREV = new Set(["pst", "pdt", "pt", "est", "edt", "et", "cst", "cdt", "ct", "mst", "mdt", "mt"]);

function abbrevFromLabel(label) {
  const words = String(label).match(/[A-Za-z]+/g) || [];
  if (words.length < 2) return "";
  return words.map((w) => w[0]).join("").toLowerCase();
}

function containsToken(hay, token) {
  if (!token || !hay) return false;
  if (hay === token) return true;
  const parts = hay.split(" ");
  if (parts.includes(token)) return true;
  if (token.length < 4 || /[+-]/.test(token)) return false;
  return hay.includes(token);
}

function matchesQuery(hay, query) {
  return query.split(" ").every((token) => token && containsToken(hay, token));
}

function fieldScore(field, query) {
  if (!field) return 0;
  if (field === query) return 100;
  if (field.startsWith(query)) return 72;
  if (field.includes(` ${query}`)) return 48;
  if (field.includes(query)) return 28;
  return 0;
}

/**
 * Rank catalogue cities for the add-location picker. Matches city name,
 * country, IANA timezone, UTC offset, and common zone abbreviations.
 */
export function searchCities(query, cities = ALL_CITIES, { limit = 12 } = {}) {
  const q = foldText(query);
  const now = new Date();
  const ranked = [];

  for (const city of cities) {
    const meta = cityTzMeta(city, now);
    if (!q) {
      ranked.push({ city, meta, score: (6 - (city.rank || 3)) * 10 });
      continue;
    }
    if (!matchesQuery(meta.search, q)) {
      continue;
    }
    const name = foldText(city.name);
    const country = foldText(city.country);
    const tz = foldText(city.tz);
    let score =
      fieldScore(name, q) * 3 +
      fieldScore(country, q) * 2 +
      fieldScore(tz, q) +
      fieldScore(foldText(city.region), q) +
      fieldScore(meta.search, q) +
      (6 - (city.rank || 3));
    if (foldText(meta.tzShort) === q || foldText(meta.offsetLabel) === q) score += 40;
    ranked.push({ city, meta, score });
  }

  ranked.sort((a, b) => b.score - a.score || a.city.name.localeCompare(b.city.name));
  return ranked.slice(0, limit);
}
