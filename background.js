// Constants
const CSS_FILES = { BLUR: "blur.css" };
const BADGE_STATES = { ON: "ON", OFF: "OFF" };
const DEFAULT_EXCLUDED_URLS = ["chrome://", "meet.google.com", "localhost"];
const STORAGE_KEYS = { EXCLUDED_URLS: "excludedUrls" };

// --- Storage Management ---
const getExcludedUrls = async () => {
  const result = await chrome.storage.sync.get(STORAGE_KEYS.EXCLUDED_URLS);
  return result[STORAGE_KEYS.EXCLUDED_URLS] || DEFAULT_EXCLUDED_URLS;
};

const setExcludedUrls = (urls) =>
  chrome.storage.sync.set({ [STORAGE_KEYS.EXCLUDED_URLS]: urls });

const updateExcludedUrls = async (url, action) => {
  const urls = await getExcludedUrls();
  const normalizedUrl = url.trim().toLowerCase();
  let updated;

  if (action === "add" && !urls.includes(normalizedUrl)) {
    updated = [...urls, normalizedUrl];
  } else if (action === "remove") {
    updated = urls.filter((u) => u !== normalizedUrl);
  } else {
    updated = urls;
  }

  await setExcludedUrls(updated);
  return updated;
};

const isUrlExcluded = async (url, excludeLocalhost = false) => {
  if (!url) return true;
  const urls = await getExcludedUrls();
  const list = excludeLocalhost ? urls : urls.filter((u) => u !== "localhost");
  return list.some((u) => url.toLowerCase().includes(u));
};

// --- UI Effects ---
const setBadgeText = (tabId, text) =>
  chrome.action.setBadgeText({ tabId, text });

const setBlurIntensity = (tabId, intensity) =>
  chrome.scripting.executeScript({
    target: { tabId },
    func: (val) => document.documentElement.style.setProperty("--blur-intensity", val),
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
      await chrome.scripting.insertCSS({ target: { tabId }, files: [CSS_FILES.BLUR] });
    }
  } catch (err) {
    console.warn("injectCSS error:", err);
  }
};

const applyBlurEffect = async (tabId, enable) => {
  if (enable) {
    await injectCSS(tabId);
    await setBlurIntensity(tabId, "30px");
  } else {
    await setBlurIntensity(tabId, "0px");
  }
};

const toggleBlurEffect = async (tabId) => {
  const prevState = await chrome.action.getBadgeText({ tabId });
  const newState = prevState === BADGE_STATES.ON ? BADGE_STATES.OFF : BADGE_STATES.ON;
  await setBadgeText(tabId, newState);
  await applyBlurEffect(tabId, newState === BADGE_STATES.ON);
  return newState;
};

const enableBlurEffect = async (tabId) => {
  await setBadgeText(tabId, BADGE_STATES.ON);
  await injectCSS(tabId);
  await setBlurIntensity(tabId, "30px");
};

// --- Message Listener ---
chrome.runtime.onMessage.addListener((req, _, sendRes) => {
  (async () => {
    try {
      switch (req.action) {
        case "getExcludedUrls":
          return sendRes({ success: true, urls: await getExcludedUrls() });
        case "addExcludedUrl":
          return sendRes({ success: true, urls: await updateExcludedUrls(req.url, "add") });
        case "removeExcludedUrl":
          return sendRes({ success: true, urls: await updateExcludedUrls(req.url, "remove") });
        case "addCurrentUrl": {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab.url) return sendRes({ success: false, error: "No valid URL found" });

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
          if (!req.tabId) return sendRes({ success: false, error: "No tab ID provided" });
          const status = await toggleBlurEffect(req.tabId);
          return sendRes({ success: true, newStatus: status });
        case "enableBlur":
          if (!req.tabId) return sendRes({ success: false, error: "No tab ID provided" });
          await enableBlurEffect(req.tabId);
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
  if (!existing[STORAGE_KEYS.EXCLUDED_URLS]) await setExcludedUrls(DEFAULT_EXCLUDED_URLS);
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
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return;

  const isExcluded = await isUrlExcluded(tab.url);
  const hostname = new URL(tab.url).hostname;

  if (isExcluded) {
    await updateExcludedUrls(hostname, "remove");
    await enableBlurEffect(tab.id);
    chrome.runtime.sendMessage({ action: "siteRemovedFromExclusion", tabId: tab.id, removedUrl: hostname }).catch(() => {});
  } else {
    const status = await toggleBlurEffect(tab.id);
    chrome.runtime.sendMessage({ action: "blurStateChanged", tabId: tab.id, newStatus: status }).catch(() => {});
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.url && !(await isUrlExcluded(tab.url))) {
    await toggleBlurEffect(tab.id);
  }
});

// --- Tab Events ---
const shouldProcess = (url) => url && (url.startsWith("http") || url.startsWith("https"));

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId);
  if (shouldProcess(tab.url) && !(await isUrlExcluded(tab.url, true))) {
    await enableBlurEffect(tabId);
  }
});

chrome.webNavigation.onCommitted.addListener(async ({ tabId, frameType }) => {
  if (frameType !== "outermost_frame") return;
  const tab = await chrome.tabs.get(tabId);
  if (shouldProcess(tab.url) && !(await isUrlExcluded(tab.url, true))) {
    await enableBlurEffect(tabId);
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    const badge = await chrome.action.getBadgeText({ tabId });
    if (badge === BADGE_STATES.ON && !(await isUrlExcluded(tab.url, true))) {
      await enableBlurEffect(tabId);
    }
  }
});