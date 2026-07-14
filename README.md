# Focus Clock — Chrome New Tab Extension

Replace Chrome’s new tab with **Alarm**, **Timer**, and **Stopwatch**, plus theme and background controls. All data is stored locally.

## Features

- **Alarm** — set a label, date, and time; see countdown on the new tab; desktop notification when it fires
- **Timer** — two modes:
  - **Set duration** (hours / minutes / seconds)
  - **Set end date & time**
- **Stopwatch** — start / pause / resume / lap / reset
- **Status cards** — live Alarm, Timer, and Stopwatch summary at the top of the new tab
- **Theme** — Light / Dark / **System** (default)
- **Background** — solid color or custom image
- **Persistence** — `localStorage` on the extension new-tab page (mirrored to `chrome.storage` for notifications)
- **Uninstall cleanup** — Chrome automatically deletes all extension data (including `localStorage` and `chrome.storage`) when you remove the extension

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
| Theme | Top-right monitor / sun / moon button → System, Light, or Dark |
| Background | Top-right image button → color or upload |
| Alarm / Timer / Stopwatch | Tabs below the status cards |

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
