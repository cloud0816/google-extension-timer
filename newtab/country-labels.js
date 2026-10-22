/**
 * Atlas-style country labels: sit in the landmass, not on the capital pin.
 * Coordinates are visual centers on an equirectangular map.
 */

import { MAP_CITIES, capitalOfCountry } from "./cities.js";

/** Countries whose capital sits on the edge of the landmass. */
const CENTER_OVERRIDE = {
  Russia: [62.0, 90.0],
  USA: [39.8, -98.6],
  Canada: [56.2, -96.0],
  China: [35.8, 103.5],
  Brazil: [-10.8, -53.0],
  Australia: [-25.0, 134.0],
  Kazakhstan: [48.0, 67.0],
  India: [22.5, 79.0],
  Argentina: [-34.5, -64.5],
  Algeria: [28.0, 3.0],
  "DR Congo": [-2.5, 23.5],
  "Saudi Arabia": [24.0, 44.5],
  Mexico: [23.5, -102.5],
  Indonesia: [-2.0, 117.5],
  Mongolia: [46.8, 103.0],
  Iran: [32.4, 54.0],
  Libya: [27.0, 17.5],
  Mali: [17.5, -2.0],
  Niger: [17.6, 9.4],
  Chad: [15.4, 18.7],
  Sudan: [16.0, 30.0],
  "South Sudan": [7.3, 30.0],
  Angola: [-12.3, 17.6],
  Namibia: [-22.0, 17.2],
  Mozambique: [-18.2, 35.0],
  Madagascar: [-19.4, 46.7],
  Ukraine: [49.0, 32.0],
  Türkiye: [39.0, 35.2],
  Sweden: [62.8, 15.2],
  Norway: [64.5, 12.5],
  Finland: [64.2, 26.0],
  France: [46.6, 2.2],
  Spain: [40.0, -4.0],
  Germany: [51.1, 10.4],
  Poland: [52.1, 19.4],
  UK: [53.5, -1.5],
  Japan: [36.4, 138.2],
  Vietnam: [16.0, 107.8],
  Thailand: [15.5, 101.0],
  Myanmar: [21.2, 96.5],
  Pakistan: [30.0, 69.0],
  Afghanistan: [33.9, 66.0],
  Egypt: [26.8, 29.8],
  "South Africa": [-28.5, 24.8],
  Colombia: [4.5, -73.0],
  Peru: [-9.2, -75.0],
  Chile: [-35.5, -71.3],
  Bolivia: [-16.7, -64.7],
  Venezuela: [7.0, -66.0],
  "New Zealand": [-41.5, 172.5],
  Greenland: [72.0, -42.0],
  Mauritania: [20.3, -10.3],
  Ethiopia: [8.6, 39.6],
  Somalia: [6.5, 45.7],
  Tanzania: [-6.3, 35.0],
  Zambia: [-14.3, 27.8],
  Botswana: [-22.2, 24.0],
  Nigeria: [9.6, 8.0],
  Cameroon: [5.7, 12.4],
  "Central African Republic": [6.6, 20.9],
  Congo: [-0.7, 15.2],
  Gabon: [-0.6, 11.8],
  Ghana: [7.9, -1.2],
  "Côte d'Ivoire": [7.5, -5.6],
  Guinea: [10.4, -10.7],
  Senegal: [14.5, -14.5],
  Morocco: [31.8, -7.1],
  Iraq: [33.0, 43.8],
  Yemen: [15.6, 47.5],
  Oman: [21.0, 57.0],
  Uzbekistan: [41.4, 64.6],
  Turkmenistan: [39.1, 59.2],
  Kyrgyzstan: [41.2, 74.8],
  Tajikistan: [38.6, 71.2],
  Nepal: [28.3, 84.1],
  Bangladesh: [23.8, 90.3],
  "North Korea": [40.0, 127.3],
  "South Korea": [36.4, 128.0],
  Philippines: [11.8, 122.9],
  Malaysia: [3.8, 109.5],
  "Papua New Guinea": [-6.3, 144.6],
  Italy: [42.8, 12.6],
  Romania: [45.9, 25.0],
  Belarus: [53.5, 28.0],
  "Czechia": [49.8, 15.5],
  Hungary: [47.2, 19.4],
  Austria: [47.6, 14.1],
  Greece: [39.1, 22.0],
  Portugal: [39.6, -8.0],
  Ireland: [53.2, -8.0],
  Iceland: [64.9, -18.6],
  Cuba: [21.5, -79.0],
  Ecuador: [-1.4, -78.2],
  Paraguay: [-23.4, -58.4],
  Uruguay: [-32.5, -55.8],
  Guatemala: [15.7, -90.4],
  Honduras: [14.8, -86.6],
  Nicaragua: [12.9, -85.0],
};

function uniqueCountries() {
  const seen = new Set();
  const names = [];
  for (const city of MAP_CITIES) {
    if (!city.country || seen.has(city.country)) continue;
    seen.add(city.country);
    names.push(city.country);
  }
  return names;
}

/** One label per catalogue country: visual center + capital name. */
export const COUNTRY_LABELS = uniqueCountries()
  .map((country) => {
    const capital = capitalOfCountry(country);
    const override = CENTER_OVERRIDE[country];
    const lat = override ? override[0] : capital?.lat;
    const lon = override ? override[1] : capital?.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return {
      country,
      capital: capital?.name && capital.name !== country ? capital.name : "",
      lat,
      lon,
    };
  })
  .filter(Boolean);
