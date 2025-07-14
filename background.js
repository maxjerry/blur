// Constants
const CSS_FILES = {
  BLUR: "blur.css",
  LINKEDIN: "linkedin.css"
};

const BADGE_STATES = {
  ON: "ON",
  OFF: "OFF"
};

const EXCLUDED_URLS = [
  "chrome://",
  "meet.google.com",
  "localhost"
];

// Utility functions
const isUrlExcluded = (url, excludeLocalhost = false) => {
  if (!url) return true;
  
  const exclusions = excludeLocalhost ? EXCLUDED_URLS : EXCLUDED_URLS.slice(0, 2);
  return exclusions.some(excluded => url.includes(excluded));
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

// NEW: Function to handle restored tabs
const handleRestoredTab = async (tabId, url) => {
  if (isUrlExcluded(url, true)) return;
  
  // Reset badge state for restored tabs
  await setBadgeText(tabId, BADGE_STATES.OFF);
  
  if (isLinkedInUrl(url)) {
    await applyLinkedInCSS(tabId);
  }
  
  // Don't automatically enable blur for restored tabs
  // Let user toggle it manually
};

// Event listeners
chrome.runtime.onInstalled.addListener(async () => {
  await chrome.action.setBadgeText({
    text: BADGE_STATES.OFF
  });
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "toggle-blur") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!isUrlExcluded(tab.url)) {
      await toggleBlurEffect(tab.id);
    }
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!isUrlExcluded(tab.url)) {
    await toggleBlurEffect(tab.id);
  }
});

chrome.tabs.onActivated.addListener(async (tabInfo) => {
  const tab = await chrome.tabs.get(tabInfo.tabId);
  
  if (isUrlExcluded(tab.url, true)) return;
  
  if (isLinkedInUrl(tab.url)) {
    await applyLinkedInCSS(tabInfo.tabId);
  }
  
  await enableBlurEffect(tabInfo.tabId);
});

chrome.webNavigation.onCommitted.addListener(async (details) => {
  if (details.frameType !== "outermost_frame") return;
  
  const tab = await chrome.tabs.get(details.tabId);
  
  if (isUrlExcluded(tab.url, true)) return;
  
  if (isLinkedInUrl(tab.url)) {
    await applyLinkedInCSS(details.tabId);
  }
  
  await enableBlurEffect(details.tabId);
});

// NEW: Handle tab updates (including restored tabs)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only handle when the tab is completely loaded
  if (changeInfo.status === 'complete' && tab.url) {
    // Check if this might be a restored tab by checking if badge is inconsistent
    const badgeText = await chrome.action.getBadgeText({ tabId });
    
    if (badgeText === BADGE_STATES.ON) {
      // If badge shows ON but tab was restored, CSS might be missing
      // Re-apply the CSS to ensure consistency
      if (!isUrlExcluded(tab.url, true)) {
        if (isLinkedInUrl(tab.url)) {
          await applyLinkedInCSS(tabId);
        }
        await enableBlurEffect(tabId);
      }
    }
  }
});

// NEW: Handle startup - reset all badge states
chrome.runtime.onStartup.addListener(async () => {
  // Reset all tabs' badge states on browser startup
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!isUrlExcluded(tab.url, true)) {
      await setBadgeText(tab.id, BADGE_STATES.OFF);
    }
  }
});