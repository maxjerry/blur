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
  
  if (enable) {
    await chrome.scripting.insertCSS(options);
  } else {
    await chrome.scripting.removeCSS(options);
  }
};

const applyLinkedInCSS = async (tabId) => {
  await chrome.scripting.removeCSS({
    files: [CSS_FILES.LINKEDIN],
    target: { tabId }
  });
  await chrome.scripting.insertCSS({
    files: [CSS_FILES.LINKEDIN],
    target: { tabId }
  });
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
