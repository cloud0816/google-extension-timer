# Focus Clock — Chrome New Tab Extension

Replace Chrome’s new tab with **Alarm**, **Timer**, and **Stopwatch**, plus theme and background controls. All data is stored locally.

## Features

- **New tab = status only** — large clock plus live Alarm / Timer / Stopwatch cards
- **Settings** — gear button to add and manage items (not on the home view)
- **Multi alarm** — as many as you want; date + time; notifications when they fire
- **Multi timer** — duration **or** end date/time; pause / resume each one
- **Multi stopwatch** — add several; start / pause / lap / reset / delete
- **Theme** — Light / Dark / **System** (default)
- **Background** — solid color or custom image
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
| Background | Top-right image button → color or upload |
| Add / manage Alarm, Timer, Stopwatch | Top-right **gear** → Settings |

## Project layout

```
manifest.json          Chrome MV3 manifest (overrides new tab)
background.js          Alarms + notifications service worker
newtab/index.html      New tab UI
newtab/styles.css      Themes and layout
newtab/app.js          Alarm / timer / stopwatch + localStorage
icons/                 Extension icons
```

## Notes

- Background images are stored as data URLs in `localStorage` (keep under ~4.5 MB).
- Removing the extension from `chrome://extensions` clears all saved alarms, timers, stopwatch state, theme, and background data.
