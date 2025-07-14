// Constants
const CSS_FILES = {
  BLUR: "blur.css",
  LINKEDIN: "linkedin.css"
};

const BADGE_STATES = {
  ON: "ON",
  OFF: "OFF"
};

const DEFAULT_EXCLUDED_URLS = [
  "chrome://",
  "meet.google.com",
  "localhost"
];

const STORAGE_KEYS = {
  EXCLUDED_URLS: "excludedUrls"
};

// Storage functions
const getExcludedUrls = async () => {
  const result = await chrome.storage.sync.get(STORAGE_KEYS.EXCLUDED_URLS);
  return result[STORAGE_KEYS.EXCLUDED_URLS] || DEFAULT_EXCLUDED_URLS;
};

const setExcludedUrls = async (urls) => {
  await chrome.storage.sync.set({
    [STORAGE_KEYS.EXCLUDED_URLS]: urls
  });
};

const addExcludedUrl = async (url) => {
  const currentUrls = await getExcludedUrls();
  const normalizedUrl = url.trim().toLowerCase();
  
  if (!currentUrls.includes(normalizedUrl)) {
    currentUrls.push(normalizedUrl);
    await setExcludedUrls(currentUrls);
  }
  
  return currentUrls;
};

const removeExcludedUrl = async (url) => {
  const currentUrls = await getExcludedUrls();
  const normalizedUrl = url.trim().toLowerCase();
  const filteredUrls = currentUrls.filter(excludedUrl => excludedUrl !== normalizedUrl);
  
  await setExcludedUrls(filteredUrls);
  return filteredUrls;
};

// Utility functions
const isUrlExcluded = async (url, excludeLocalhost = false) => {
  if (!url) return true;
  
  const excludedUrls = await getExcludedUrls();
  const urlsToCheck = excludeLocalhost ? excludedUrls : excludedUrls.filter(u => u !== "localhost");
  
  return urlsToCheck.some(excluded => url.toLowerCase().includes(excluded));
};

const isLinkedInUrl = (url) => {
  return url?.startsWith("https://www.linkedin.com/");
};

const setBadgeText = async (tabId, text) => {
  await chrome.action.setBadgeText({
    tabId,
    text
  });
};

const toggleCSS = async (tabId, cssFile, enable) => {
  const target = { tabId };
  const options = { files: [cssFile], target };
  
  try {
    if (enable) {
      await chrome.scripting.insertCSS(options);
    } else {
      await chrome.scripting.removeCSS(options);
    }
  } catch (error) {
    console.log(`CSS operation failed for tab ${tabId}:`, error);
  }
};

const applyLinkedInCSS = async (tabId) => {
  try {
    await chrome.scripting.removeCSS({
      files: [CSS_FILES.LINKEDIN],
      target: { tabId }
    });
    await chrome.scripting.insertCSS({
      files: [CSS_FILES.LINKEDIN],
      target: { tabId }
    });
  } catch (error) {
    console.log(`LinkedIn CSS operation failed for tab ${tabId}:`, error);
  }
};

const toggleBlurEffect = async (tabId) => {
  const prevState = await chrome.action.getBadgeText({ tabId });
  const nextState = prevState === BADGE_STATES.ON ? BADGE_STATES.OFF : BADGE_STATES.ON;
  
  await setBadgeText(tabId, nextState);
  await toggleCSS(tabId, CSS_FILES.BLUR, nextState === BADGE_STATES.ON);
  
  return nextState;
};

const enableBlurEffect = async (tabId) => {
  await setBadgeText(tabId, BADGE_STATES.ON);
  await toggleCSS(tabId, CSS_FILES.BLUR, false); // Remove first
  await toggleCSS(tabId, CSS_FILES.BLUR, true);  // Then insert
};

// Message handling for popup communication
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    try {
      switch (request.action) {
        case 'getExcludedUrls':
          const urls = await getExcludedUrls();
          sendResponse({ success: true, urls });
          break;
          
        case 'addExcludedUrl':
          const updatedUrls = await addExcludedUrl(request.url);
          sendResponse({ success: true, urls: updatedUrls });
          break;
          
        case 'removeExcludedUrl':
          const filteredUrls = await removeExcludedUrl(request.url);
          sendResponse({ success: true, urls: filteredUrls });
          break;
          
        case 'addCurrentUrl':
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab.url) {
            const hostname = new URL(tab.url).hostname;
            const newUrls = await addExcludedUrl(hostname);
            
            // Turn off blur for current tab if it's on
            const badgeText = await chrome.action.getBadgeText({ tabId: tab.id });
            if (badgeText === BADGE_STATES.ON) {
              await setBadgeText(tab.id, BADGE_STATES.OFF);
              await toggleCSS(tab.id, CSS_FILES.BLUR, false);
            }
            
            sendResponse({ success: true, urls: newUrls, addedUrl: hostname });
          } else {
            sendResponse({ success: false, error: 'No valid URL found' });
          }
          break;
          
        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  })();
  
  return true; // Keep message channel open for async response
});

// Event listeners
chrome.runtime.onInstalled.addListener(async () => {
  await chrome.action.setBadgeText({
    text: BADGE_STATES.OFF
  });
  
  // Initialize excluded URLs if not set
  const existingUrls = await chrome.storage.sync.get(STORAGE_KEYS.EXCLUDED_URLS);
  if (!existingUrls[STORAGE_KEYS.EXCLUDED_URLS]) {
    await setExcludedUrls(DEFAULT_EXCLUDED_URLS);
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "toggle-blur") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!(await isUrlExcluded(tab.url))) {
      await toggleBlurEffect(tab.id);
    }
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!(await isUrlExcluded(tab.url))) {
    await toggleBlurEffect(tab.id);
  }
});

chrome.tabs.onActivated.addListener(async (tabInfo) => {
  const tab = await chrome.tabs.get(tabInfo.tabId);
  
  if (await isUrlExcluded(tab.url, true)) return;
  
  if (isLinkedInUrl(tab.url)) {
    await applyLinkedInCSS(tabInfo.tabId);
  }
  
  await enableBlurEffect(tabInfo.tabId);
});

chrome.webNavigation.onCommitted.addListener(async (details) => {
  if (details.frameType !== "outermost_frame") return;
  
  const tab = await chrome.tabs.get(details.tabId);
  
  if (await isUrlExcluded(tab.url, true)) return;
  
  if (isLinkedInUrl(tab.url)) {
    await applyLinkedInCSS(details.tabId);
  }
  
  await enableBlurEffect(details.tabId);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    const badgeText = await chrome.action.getBadgeText({ tabId });
    
    if (badgeText === BADGE_STATES.ON) {
      if (!(await isUrlExcluded(tab.url, true))) {
        if (isLinkedInUrl(tab.url)) {
          await applyLinkedInCSS(tabId);
        }
        await enableBlurEffect(tabId);
      }
    }
  }
});

chrome.runtime.onStartup.addListener(async () => {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!(await isUrlExcluded(tab.url, true))) {
      await setBadgeText(tab.id, BADGE_STATES.OFF);
    }
  }
});