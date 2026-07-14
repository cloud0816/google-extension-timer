/**
 * Service worker: chrome.alarms + notifications.
 * Extension data is wiped by Chrome on uninstall.
 */

const STORAGE_KEY = "focusClockData";

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(null, (items) => {
    const keys = Object.keys(items || {}).filter((k) => k.startsWith("focusClock"));
    if (keys.length) chrome.storage.local.remove(keys);
  });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  let title = "Focus Clock";
  let message = "Time is up.";

  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const data = result[STORAGE_KEY] || {};
    let changed = false;

    if (alarm.name.startsWith("alarm:") && Array.isArray(data.alarms)) {
      const id = alarm.name.slice(6);
      data.alarms = data.alarms.map((a) => {
        if (a.id === id && a.status === "active") {
          changed = true;
          title = "Alarm";
          message = `Alarm "${a.label}" is ringing.`;
          return { ...a, status: "fired" };
        }
        return a;
      });
    }

    if (alarm.name.startsWith("timer:") && Array.isArray(data.timers)) {
      const id = alarm.name.slice(6);
      data.timers = data.timers.map((t) => {
        if (t.id === id && t.status === "running") {
          changed = true;
          title = "Timer";
          message = `Timer "${t.label || "Timer"}" finished.`;
          return { ...t, status: "finished", remainingMs: 0 };
        }
        return t;
      });
    }

    chrome.notifications.create(`notify-${alarm.name}-${Date.now()}`, {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title,
      message,
      priority: 2,
      requireInteraction: true,
    });

    if (changed) {
      await chrome.storage.local.set({ [STORAGE_KEY]: data });
    }
  } catch (_) {
    chrome.notifications.create(`notify-${alarm.name}-${Date.now()}`, {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title,
      message,
      priority: 2,
      requireInteraction: true,
    });
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "SYNC_ALARMS") {
    syncChromeAlarms(msg.payload)
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg?.type === "MIRROR_STORAGE") {
    chrome.storage.local
      .set({ [STORAGE_KEY]: msg.payload })
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  return false;
});

async function syncChromeAlarms(payload) {
  const existing = await chrome.alarms.getAll();
  await Promise.all(
    existing
      .filter((a) => a.name.startsWith("alarm:") || a.name.startsWith("timer:"))
      .map((a) => chrome.alarms.clear(a.name))
  );

  const now = Date.now();

  if (payload?.alarms) {
    for (const a of payload.alarms) {
      if (a.status !== "active" || !a.id) continue;
      const when = new Date(a.at).getTime();
      if (when > now) chrome.alarms.create(`alarm:${a.id}`, { when });
    }
  }

  if (payload?.timers) {
    for (const t of payload.timers) {
      if (t.status !== "running" || !t.id || !t.endsAt) continue;
      const when = new Date(t.endsAt).getTime();
      if (when > now) chrome.alarms.create(`timer:${t.id}`, { when });
    }
  }
}
