chrome.runtime.onInstalled.addListener(async () => {
  await chrome.action.setBadgeText({
    text: "OFF",
  });
});

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.url?.startsWith("chrome://")) return;
  if (tab.url?.includes("localhost")) return;
  if (tab.url?.includes("127.0.0.1")) return;
  if (tab.url?.includes("meet.google.com")) return;
  const prevState = await chrome.action.getBadgeText({ tabId: tab.id });
  const nextState = prevState === "ON" ? "OFF" : "ON";

  await chrome.action.setBadgeText({
    tabId: tab.id,
    text: nextState,
  });

  if (nextState === "ON") {
    await chrome.scripting.insertCSS({
      files: ["blur.css"],
      target: { tabId: tab.id },
    });
  } else if (nextState === "OFF") {
    await chrome.scripting.removeCSS({
      files: ["blur.css"],
      target: { tabId: tab.id },
    });
  }
});

chrome.tabs.onActivated.addListener(async (tabInfo) => {
  const tab = await chrome.tabs.get(tabInfo.tabId);
  if (!tab.url) return;
  if (tab.url?.includes("localhost")) return;
  if (tab.url?.includes("127.0.0.1")) return;
  if (tab.url?.startsWith("chrome://")) return;
  if (tab.url?.includes("meet.google.com")) return;
  if (tab.url?.startsWith("https://www.linkedin.com/")) {
    await chrome.scripting.removeCSS({
      files: ["linkedin.css"],
      target: { tabId: tabInfo.tabId },
    });
    await chrome.scripting.insertCSS({
      files: ["linkedin.css"],
      target: { tabId: tabInfo.tabId },
    });
  }
  await chrome.action.setBadgeText({
    tabId: tabInfo.tabId,
    text: "ON",
  });
  await chrome.scripting.removeCSS({
    files: ["blur.css"],
    target: { tabId: tabInfo.tabId },
  });
  await chrome.scripting.insertCSS({
    files: ["blur.css"],
    target: { tabId: tabInfo.tabId },
  });
});

chrome.webNavigation.onCommitted.addListener(async (details) => {
  const tab = await chrome.tabs.get(details.tabId);
  if (tab.url?.includes("localhost")) return;
  if (tab.url?.includes("127.0.0.1")) return;
  if (tab.url?.startsWith("chrome://")) return;
  if (tab.url?.includes("meet.google.com")) return;
  if (!tab.url) return;
  if (tab.url?.startsWith("https://www.linkedin.com/")) {
    await chrome.scripting.removeCSS({
      files: ["linkedin.css"],
      target: { tabId: details.tabId },
    });
    await chrome.scripting.insertCSS({
      files: ["linkedin.css"],
      target: { tabId: details.tabId },
    });
  }
  if (details.frameType == "outermost_frame") {
    await chrome.action.setBadgeText({
      tabId: details.tabId,
      text: "ON",
    });
    await chrome.scripting.removeCSS({
      files: ["blur.css"],
      target: { tabId: details.tabId },
    });
    await chrome.scripting.insertCSS({
      files: ["blur.css"],
      target: { tabId: details.tabId },
    });
  }
});
