// Constants
const CSS_FILES = { BLUR: "blur.css" };
const BADGE_STATES = { ON: "ON", OFF: "OFF" };
const DEFAULT_EXCLUDED_URLS = ["chrome://", "meet.google.com", "localhost"];
const STORAGE_KEYS = {
  EXCLUDED_URLS: "excludedUrls",
  BLUR_INTENSITY: "blurIntensity",
};
const DEFAULT_BLUR_INTENSITY = 50;

// --- Storage Management ---
const loadExcludedUrls = async () => {
  const result = await chrome.storage.sync.get(STORAGE_KEYS.EXCLUDED_URLS);
  return result[STORAGE_KEYS.EXCLUDED_URLS] || DEFAULT_EXCLUDED_URLS;
};

const saveExcludedUrls = (urls) =>
  chrome.storage.sync.set({ [STORAGE_KEYS.EXCLUDED_URLS]: urls });

const loadBlurIntensity = async () => {
  const result = await chrome.storage.sync.get(STORAGE_KEYS.BLUR_INTENSITY);
  return result[STORAGE_KEYS.BLUR_INTENSITY] || DEFAULT_BLUR_INTENSITY;
};

const saveBlurIntensity = (intensity) =>
  chrome.storage.sync.set({ [STORAGE_KEYS.BLUR_INTENSITY]: intensity });

const updateExcludedUrls = async (url, action) => {
  const urls = await loadExcludedUrls();
  const normalizedUrl = url.trim().toLowerCase();
  let updated;

  if (action === "add" && !urls.includes(normalizedUrl)) {
    updated = [...urls, normalizedUrl];
  } else if (action === "remove") {
    updated = urls.filter((u) => u !== normalizedUrl);
  } else {
    updated = urls;
  }

  await saveExcludedUrls(updated);
  return updated;
};

const isUrlExcluded = async (url, excludeLocalhost = false) => {
  if (!url) return true;
  const urls = await loadExcludedUrls();
  const list = excludeLocalhost ? urls : urls.filter((u) => u !== "localhost");
  return list.some((u) => url.toLowerCase().includes(u));
};

// --- UI Effects ---
const setBadgeText = (tabId, text) =>
  chrome.action.setBadgeText({ tabId, text });

const setBlurIntensity = (tabId, intensity) =>
  chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: (val) =>
      document.documentElement.style.setProperty(
        "--blur-intensity",
        `${val}px`
      ),
    args: [intensity],
  });
const setFrameBlurIntensity = (tabId, frameId, intensity) =>
  chrome.scripting.executeScript({
    target: { tabId, frameIds: [frameId] },
    func: (val) =>
      document.documentElement.style.setProperty(
        "--blur-intensity",
        `${val}px`
      ),
    args: [intensity],
  });

const injectCSS = async (tabId) => {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        if (window.__blurCSSInjected) return true;
        window.__blurCSSInjected = true;
        return false;
      },
    });
    if (!res.result) {
      await chrome.scripting.insertCSS({
        target: { tabId },
        files: [CSS_FILES.BLUR],
      });
    }
  } catch (err) {
    console.warn("injectCSS error:", err);
  }
};

const injectFrameCSS = async (tabId, frameId) => {
  try {
    await chrome.scripting.insertCSS({
      target: { tabId, frameIds: [frameId] },
      files: [CSS_FILES.BLUR],
    });
  } catch (err) {
    console.warn("injectCSS error:", err);
  }
};

const applyBlurEffect = async (tabId, enable) => {
  const blurIntensity = await loadBlurIntensity();
  if (enable) {
    await injectCSS(tabId);
    await setBlurIntensity(tabId, blurIntensity);
  } else {
    await setBlurIntensity(tabId, 0);
  }
};

const toggleBlurEffect = async (tabId) => {
  const prevState = await chrome.action.getBadgeText({ tabId });
  const newState =
    prevState === BADGE_STATES.ON ? BADGE_STATES.OFF : BADGE_STATES.ON;
  await setBadgeText(tabId, newState);
  await applyBlurEffect(tabId, newState === BADGE_STATES.ON);
  return newState;
};

const enableBlurEffect = async (tabId) => {
  const blurIntensity = await loadBlurIntensity();
  await setBadgeText(tabId, BADGE_STATES.ON);
  await injectCSS(tabId);
  await setBlurIntensity(tabId, blurIntensity);
};

const disableBlurEffect = async (tabId) => {
  await setBadgeText(tabId, BADGE_STATES.OFF);
  await setBlurIntensity(tabId, 0);
};

const enableFrameBlurEffect = async (tabId, frameId) => {
  const blurIntensity = await loadBlurIntensity();
  await injectFrameCSS(tabId, frameId);
  await setFrameBlurIntensity(tabId, frameId, blurIntensity);
};

const getCurrentTab = async () => {
  let queryOptions = { active: true, lastFocusedWindow: true };
  let [tab] = await chrome.tabs.query(queryOptions);
  return tab;
};

// --- Message Listener ---
chrome.runtime.onMessage.addListener((req, _, sendRes) => {
  (async () => {
    try {
      switch (req.action) {
        case "getExcludedUrls":
          return sendRes({ success: true, urls: await loadExcludedUrls() });
        case "addExcludedUrl":
          return sendRes({
            success: true,
            urls: await updateExcludedUrls(req.url, "add"),
          });
        case "removeExcludedUrl":
          return sendRes({
            success: true,
            urls: await updateExcludedUrls(req.url, "remove"),
          });
        case "addCurrentUrl": {
          const tab = await getCurrentTab();
          if (!tab.url)
            return sendRes({ success: false, error: "No valid URL found" });

          const hostname = new URL(tab.url).hostname;
          const urls = await updateExcludedUrls(hostname, "add");

          const badge = await chrome.action.getBadgeText({ tabId: tab.id });
          if (badge === BADGE_STATES.ON) {
            await setBadgeText(tab.id, BADGE_STATES.OFF);
            await applyBlurEffect(tab.id, false);
          }

          return sendRes({ success: true, urls, addedUrl: hostname });
        }
        case "toggleBlur":
          if (!req.tabId)
            return sendRes({ success: false, error: "No tab ID provided" });
          const status = await toggleBlurEffect(req.tabId);
          return sendRes({ success: true, newStatus: status });
        case "enableBlur":
          if (!req.tabId)
            return sendRes({ success: false, error: "No tab ID provided" });
          await enableBlurEffect(req.tabId);
          return sendRes({ success: true });
        case "getBlurIntensity":
          const intensity = await loadBlurIntensity();
          return sendRes({ success: true, intensity });
        case "setBlurIntensity":
          const tab = await getCurrentTab();
          await setBadgeText(tab.id, BADGE_STATES.ON);
          saveBlurIntensity(req.intensity);
          if (!(await isUrlExcluded(tab.url, true))) {
            await setBlurIntensity(tab.id, req.intensity);
          }
          return sendRes({ success: true });
        default:
          return sendRes({ success: false, error: "Unknown action" });
      }
    } catch (err) {
      return sendRes({ success: false, error: err.message });
    }
  })();
  return true;
});

// --- Lifecycle Events ---
chrome.runtime.onInstalled.addListener(async () => {
  await chrome.action.setBadgeText({ text: BADGE_STATES.OFF });
  const existing = await chrome.storage.sync.get(STORAGE_KEYS.EXCLUDED_URLS);
  if (!existing[STORAGE_KEYS.EXCLUDED_URLS])
    await saveExcludedUrls(DEFAULT_EXCLUDED_URLS);
});

chrome.runtime.onStartup.addListener(async () => {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.url && !(await isUrlExcluded(tab.url, true))) {
      await setBadgeText(tab.id, BADGE_STATES.OFF);
    }
  }
});

chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd !== "toggle-blur") return;
  const tab = await getCurrentTab();
  if (!tab || !tab.url) return;

  const isExcluded = await isUrlExcluded(tab.url);
  const hostname = new URL(tab.url).hostname;

  if (isExcluded) {
    await updateExcludedUrls(hostname, "remove");
    await enableBlurEffect(tab.id);
    chrome.runtime
      .sendMessage({
        action: "siteRemovedFromExclusion",
        tabId: tab.id,
        removedUrl: hostname,
      })
      .catch(() => {});
  } else {
    const status = await toggleBlurEffect(tab.id);
    chrome.runtime
      .sendMessage({
        action: "blurStateChanged",
        tabId: tab.id,
        newStatus: status,
      })
      .catch(() => {});
  }
});

const shouldProcess = (url) =>
  url && (url.startsWith("http") || url.startsWith("https"));


chrome.webNavigation.onCommitted.addListener(async ({ tabId, frameId, url }) => {
  try {
    const isExcluded = await isUrlExcluded(url);
    if (shouldProcess(url)) {
      if (!isExcluded) {
        if (frameId == 0) {
          await enableBlurEffect(tabId);
        }
        else{
          await enableFrameBlurEffect(tabId, frameId);
        }
      } else {
        await disableBlurEffect(tabId);
      }
    }
  } catch (error) {
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId);
  const isExcluded = await isUrlExcluded(tab.url);
  if (shouldProcess(tab.url)) {
    if (!isExcluded) {
      await enableBlurEffect(tabId);
    } else {
      await disableBlurEffect(tabId);
    }
  }
});


chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading" && shouldProcess(tab.url)) {
    const isExcluded = await isUrlExcluded(tab.url);
    if (!isExcluded) {
      await enableBlurEffect(tabId);
    } else {
      await disableBlurEffect(tabId);
    }
  }
});
