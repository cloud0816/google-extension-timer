# Focus Clock — Chrome New Tab Extension

Replace Chrome’s new tab with a **World clock**, **Alarm**, **Timer**, and **Stopwatch**, plus theme and background controls. All data is stored locally.

## Features

- **New tab = status only** — large clock plus live World / Alarm / Timer / Stopwatch cards
- **World clock** — local time for any of 56 cities, with a day / twilight / night marker, the day offset (Today / Tomorrow / Yesterday) and the UTC offset
- **World map background** — an equirectangular map that shades the half of the planet where the sun is down, marks the point it is directly overhead, and pins your cities with their local time
- **Settings** — gear button to add and manage items (not on the home view)
- **Multi alarm** — as many as you want; date + time; notifications when they fire
- **Multi timer** — duration **or** end date/time; pause / resume each one
- **Multi stopwatch** — add several; start / pause / lap / reset / delete
- **Theme** — Light / Dark / **System** (default)
- **Background** — default, solid color, custom image, or the live world map
- **Persistence** — `localStorage` (cleared automatically on uninstall)

## Install (developer mode)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this project folder (`google-extension-timer`)
5. Open a **new tab** — Focus Clock loads instead of the default page

Allow notifications when Chrome prompts you so alarms and timers can alert you even if the tab is closed.

## Usage

| Control | Where |
|--------|--------|
| Theme | Top-right (monitor / sun / moon) → System, Light, or Dark |
| Background | Top-right image button → default, color, image, or **World clock** |
| Add / manage Alarm, Timer, Stopwatch, cities | Top-right **gear** → Settings |

## Project layout

```
manifest.json            Chrome MV3 manifest (overrides new tab)
background.js            Alarms + notifications service worker
newtab/index.html        New tab UI
newtab/styles.css        Themes and layout
newtab/app.js            State, rendering, and event wiring
newtab/solar.js          Sun position + day/night terminator maths
newtab/world-clock.js    Map rendering and per-city time readouts
newtab/cities.js         City catalogue (IANA zone, latitude, longitude)
newtab/world-map-data.js Generated country outlines (see Credits)
icons/                   Extension icons
```

## How the day/night map works

Times come from `Intl.DateTimeFormat` with IANA zone names, so daylight saving is
always handled by the browser rather than by hard-coded offsets.

The shading comes from the sun’s own position. `solar.js` computes the subsolar
point — the latitude and longitude where the sun is directly overhead — and the
terminator is the set of points where the solar zenith angle is 90°, which on an
equirectangular map is `tan(lat) = -cos(hourAngle) / tan(declination)`. A city
counts as being in daylight once the sun is more than 0.833° above the horizon
(the usual allowance for refraction and the sun’s radius), and as twilight down
to 6° below it.

## Notes

- Background images are stored as data URLs in `localStorage` (keep under ~4.5 MB).
- Removing the extension from `chrome://extensions` clears all saved alarms, timers, stopwatch state, chosen cities, theme, and background data.
- The map is inline SVG with no network requests, so it works offline and needs no extra host permissions.

## Credits

`newtab/world-map-data.js` is generated from Natural Earth 110m country
boundaries by way of [world-atlas](https://github.com/topojson/world-atlas)
(ISC). Natural Earth data is public domain.
