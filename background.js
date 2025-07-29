// === CONSTANTS ===
const CONFIG = {
  CSS_FILES: { BLUR: "blur.css" },
  BADGE_STATES: { ON: "ON", OFF: "OFF" },
  STORAGE_KEYS: {
    EXCLUDED_URLS: "excludedUrls",
    BLUR_INTENSITY: "blurIntensity",
    BACKGROUND_BLUR_STATE: "backgroundBlurState",
  },
  DEFAULTS: {
    EXCLUDED_URLS: ["chrome://", "meet.google.com", "localhost"],
    BLUR_INTENSITY: 50,
    BACKGROUND_BLUR_STATE: false,
  }
};

// === STORAGE MANAGER ===
class StorageManager {
  static async get(key, defaultValue) {
    const result = await chrome.storage.sync.get(key);
    return result[key] ?? defaultValue;
  }

  static async set(key, value) {
    return chrome.storage.sync.set({ [key]: value });
  }

  static async getExcludedUrls() {
    return this.get(CONFIG.STORAGE_KEYS.EXCLUDED_URLS, CONFIG.DEFAULTS.EXCLUDED_URLS);
  }

  static async setExcludedUrls(urls) {
    return this.set(CONFIG.STORAGE_KEYS.EXCLUDED_URLS, urls);
  }

  static async getBlurIntensity() {
    return this.get(CONFIG.STORAGE_KEYS.BLUR_INTENSITY, CONFIG.DEFAULTS.BLUR_INTENSITY);
  }

  static async setBlurIntensity(intensity) {
    return this.set(CONFIG.STORAGE_KEYS.BLUR_INTENSITY, intensity);
  }

  static async getBackgroundBlurStatus() {
    return this.get(CONFIG.STORAGE_KEYS.BACKGROUND_BLUR_STATE, CONFIG.DEFAULTS.BACKGROUND_BLUR_STATE);
  }

  static async setBackgroundBlurStatus(state) {
    return this.set(CONFIG.STORAGE_KEYS.BACKGROUND_BLUR_STATE, state);
  }
}

// === URL MANAGER ===
class URLManager {
  static async updateExcludedUrls(url, action) {
    const urls = await StorageManager.getExcludedUrls();
    const normalizedUrl = url.trim().toLowerCase();
    
    let updated;
    if (action === "add" && !urls.includes(normalizedUrl)) {
      updated = [...urls, normalizedUrl];
    } else if (action === "remove") {
      updated = urls.filter((u) => u !== normalizedUrl);
    } else {
      updated = urls;
    }

    await StorageManager.setExcludedUrls(updated);
    return updated;
  }

  static async isUrlExcluded(url, excludeLocalhost = false) {
    if (!url) return true;
    
    const urls = await StorageManager.getExcludedUrls();
    const list = excludeLocalhost ? urls : urls.filter((u) => u !== "localhost");
    
    return list.some((u) => url.toLowerCase().includes(u));
  }

  static shouldProcessUrl(url) {
    return url && (url.startsWith("http") || url.startsWith("https"));
  }

  static extractHostname(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return null;
    }
  }
}

// === SCRIPT INJECTOR ===
class ScriptInjector {
  static async executeScript(tabId, func, args = [], options = {}) {
    try {
      const target = { tabId, ...options };
      return await chrome.scripting.executeScript({
        target,
        func,
        args
      });
    } catch (error) {
      console.warn(`Script execution failed for tab ${tabId}:`, error);
      return null;
    }
  }

  static async insertCSS(tabId, files, options = {}) {
    try {
      const target = { tabId, ...options };
      await chrome.scripting.insertCSS({ target, files });
      return true;
    } catch (error) {
      console.warn(`CSS insertion failed for tab ${tabId}:`, error);
      return false;
    }
  }

  static async injectBlurCSS(tabId) {
    const [result] = await this.executeScript(tabId, () => {
      if (window["__blurCSSInjected"]) return true;
      window["__blurCSSInjected"] = true;
      return false;
    }) || [{ result: false }];

    if (!result.result) {
      return await this.insertCSS(tabId, [CONFIG.CSS_FILES.BLUR]);
    }
    return true;
  }

  static async injectFrameCSS(tabId, frameId) {
    return await this.insertCSS(tabId, [CONFIG.CSS_FILES.BLUR], { frameIds: [frameId] });
  }

  static async setBlurIntensity(tabId, intensity, frameId = null) {
    const options = frameId ? { frameIds: [frameId] } : { allFrames: true };
    
    return await this.executeScript(tabId, (val) => {
      document.documentElement.style.setProperty("--blur-intensity", `${val}px`);
    }, [intensity], options);
  }
}

// === BLUR EFFECT MANAGER ===
class BlurEffectManager {
  static async setBadgeText(tabId, text) {
    try {
      await chrome.action.setBadgeText({ tabId, text });
    } catch (error) {
      console.warn(`Failed to set badge text for tab ${tabId}:`, error);
    }
  }

  static async getBadgeText(tabId) {
    try {
      return await chrome.action.getBadgeText({ tabId });
    } catch (error) {
      console.warn(`Failed to get badge text for tab ${tabId}:`, error);
      return CONFIG.BADGE_STATES.OFF;
    }
  }

  static async applyBlurEffect(tabId, enable) {
    const blurIntensity = await StorageManager.getBlurIntensity();
    
    if (enable) {
      await ScriptInjector.injectBlurCSS(tabId);
      await ScriptInjector.setBlurIntensity(tabId, blurIntensity);
    } else {
      await ScriptInjector.setBlurIntensity(tabId, 0);
    }
  }

  static async toggleBlurEffect(tabId) {
    const prevState = await this.getBadgeText(tabId);
    const newState = prevState === CONFIG.BADGE_STATES.ON 
      ? CONFIG.BADGE_STATES.OFF 
      : CONFIG.BADGE_STATES.ON;
    
    await this.setBadgeText(tabId, newState);
    await this.applyBlurEffect(tabId, newState === CONFIG.BADGE_STATES.ON);
    
    return newState;
  }

  static async enableBlurEffect(tabId) {
    const blurIntensity = await StorageManager.getBlurIntensity();
    const backgroundBlurState = await StorageManager.getBackgroundBlurStatus();
    
    await this.setBadgeText(tabId, CONFIG.BADGE_STATES.ON);
    await ScriptInjector.injectBlurCSS(tabId);
    await ScriptInjector.setBlurIntensity(tabId, blurIntensity);
    await BackgroundBlurManager.setBackgroundBlurEffect(tabId, backgroundBlurState);
  }

  static async disableBlurEffect(tabId) {
    await this.setBadgeText(tabId, CONFIG.BADGE_STATES.OFF);
    await ScriptInjector.setBlurIntensity(tabId, 0);
  }

  static async enableFrameBlurEffect(tabId, frameId) {
    const blurIntensity = await StorageManager.getBlurIntensity();
    await ScriptInjector.injectFrameCSS(tabId, frameId);
    await ScriptInjector.setBlurIntensity(tabId, blurIntensity, frameId);
  }
}

// === BACKGROUND BLUR MANAGER ===
class BackgroundBlurManager {
  static async setBackgroundBlurEffect(tabId, state = true) {
    await ScriptInjector.executeScript(tabId, (newState) => {
      function hasBackgroundImage(element) {
        const computedStyle = window.getComputedStyle(element);
        const backgroundImage = computedStyle.backgroundImage;
        return backgroundImage && backgroundImage !== "none";
      }

      const intersectionObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const element = entry.target;

              if (hasBackgroundImage(element) && !element.classList.contains("has-background-image")) {
                element.classList.add("has-background-image");
              }

              const childElements = element.querySelectorAll("*");
              childElements.forEach((child) => {
                if (hasBackgroundImage(child) && !child.classList.contains("has-background-image")) {
                  child.classList.add("has-background-image");
                }
              });
            }
          });
        },
        {
          root: null,
          rootMargin: "50px",
          threshold: 0.1,
        }
      );

      if (newState && !window["__BackgroundBlurEnabled"]) {
        const allElements = document.querySelectorAll("*");
        allElements.forEach((element) => {
          intersectionObserver.observe(element);
        });
        window["__BackgroundBlurEnabled"] = true;
      }

      if (!newState && window["__BackgroundBlurEnabled"]) {
        intersectionObserver.disconnect();
        const allElements = document.querySelectorAll("*");
        allElements.forEach((element) => {
          if (element.classList.contains("has-background-image")) {
            element.classList.remove("has-background-image");
          }
        });
        window["__BackgroundBlurEnabled"] = false;
      }
    }, [state]);

    await StorageManager.setBackgroundBlurStatus(state);
    return state;
  }

  static async toggleBackgroundBlurEffect(tabId) {
    const currentState = await StorageManager.getBackgroundBlurStatus();
    return await this.setBackgroundBlurEffect(tabId, !currentState);
  }
}

// === TAB MANAGER ===
class TabManager {
  static async getCurrentTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      return tab;
    } catch (error) {
      console.warn("Failed to get current tab:", error);
      return null;
    }
  }

  static async getTab(tabId) {
    try {
      return await chrome.tabs.get(tabId);
    } catch (error) {
      console.warn(`Failed to get tab ${tabId}:`, error);
      return null;
    }
  }

  static async handleTabNavigation(tabId, url, frameId = 0) {
    if (!URLManager.shouldProcessUrl(url)) return;

    const isExcluded = await URLManager.isUrlExcluded(url);
    
    if (!isExcluded) {
      if (frameId === 0) {
        await BlurEffectManager.enableBlurEffect(tabId);
      } else {
        await BlurEffectManager.enableFrameBlurEffect(tabId, frameId);
      }
    } else {
      await BlurEffectManager.disableBlurEffect(tabId);
    }
  }

  static async sendMessageToPopup(message) {
    try {
      await chrome.runtime.sendMessage(message);
    } catch (error) {
      // Popup might not be open, ignore error
    }
  }
}

// === MESSAGE HANDLER ===
class MessageHandler {
  static async handleMessage(request, sender, sendResponse) {
    try {
      const response = await this.processMessage(request);
      sendResponse(response);
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }

  static async processMessage(req) {
    const handlers = {
      getExcludedUrls: async () => ({ success: true, urls: await StorageManager.getExcludedUrls() }),
      
      addExcludedUrl: async () => ({ 
        success: true, 
        urls: await URLManager.updateExcludedUrls(req.url, "add") 
      }),
      
      removeExcludedUrl: async () => ({ 
        success: true, 
        urls: await URLManager.updateExcludedUrls(req.url, "remove") 
      }),
      
      addCurrentUrl: async () => {
        const tab = await TabManager.getCurrentTab();
        if (!tab?.url) {
          return { success: false, error: "No valid URL found" };
        }

        const hostname = URLManager.extractHostname(tab.url);
        if (!hostname) {
          return { success: false, error: "Invalid URL" };
        }

        const urls = await URLManager.updateExcludedUrls(hostname, "add");
        
        const badge = await BlurEffectManager.getBadgeText(tab.id);
        if (badge === CONFIG.BADGE_STATES.ON) {
          await BlurEffectManager.setBadgeText(tab.id, CONFIG.BADGE_STATES.OFF);
          await BlurEffectManager.applyBlurEffect(tab.id, false);
        }
        
        return { success: true, urls, addedUrl: hostname };
      },
      
      toggleBlur: async () => {
        if (!req.tabId) {
          return { success: false, error: "No tab ID provided" };
        }
        const status = await BlurEffectManager.toggleBlurEffect(req.tabId);
        return { success: true, newStatus: status };
      },
      
      getBackgroundBlurStatus: async () => ({
        success: true,
        backgroundBlurStatus: await StorageManager.getBackgroundBlurStatus()
      }),
      
      toggleBackgroundBlur: async () => {
        const newStatus = await BackgroundBlurManager.toggleBackgroundBlurEffect(req.tabId);
        return { success: true, newStatus };
      },
      
      enableBlur: async () => {
        if (!req.tabId) {
          return { success: false, error: "No tab ID provided" };
        }
        await BlurEffectManager.enableBlurEffect(req.tabId);
        return { success: true };
      },
      
      getBlurIntensity: async () => ({
        success: true,
        intensity: await StorageManager.getBlurIntensity()
      }),
      
      setBlurIntensity: async () => {
        const tab = await TabManager.getCurrentTab();
        if (!tab) {
          return { success: false, error: "No active tab found" };
        }

        await BlurEffectManager.setBadgeText(tab.id, CONFIG.BADGE_STATES.ON);
        await StorageManager.setBlurIntensity(req.intensity);
        
        if (!(await URLManager.isUrlExcluded(tab.url, true))) {
          await ScriptInjector.setBlurIntensity(tab.id, req.intensity);
        }
        
        return { success: true };
      }
    };

    const handler = handlers[req.action];
    if (!handler) {
      return { success: false, error: "Unknown action" };
    }

    return await handler();
  }
}

// === EVENT HANDLERS ===
class EventHandlers {
  static async handleInstall() {
    await chrome.action.setBadgeText({ text: CONFIG.BADGE_STATES.OFF });
    
    const existing = await chrome.storage.sync.get(CONFIG.STORAGE_KEYS.EXCLUDED_URLS);
    if (!existing[CONFIG.STORAGE_KEYS.EXCLUDED_URLS]) {
      await StorageManager.setExcludedUrls(CONFIG.DEFAULTS.EXCLUDED_URLS);
    }
  }

  static async handleStartup() {
    const tab = await TabManager.getCurrentTab();
    if (!tab?.url) return;
    if (URLManager.shouldProcessUrl(tab.url) && !(await URLManager.isUrlExcluded(tab.url, true))) {
      await BlurEffectManager.setBadgeText(tab.id, CONFIG.BADGE_STATES.ON);
    }
  }

  static async handleCommand(command) {
    if (command !== "toggle-blur") return;
    
    const tab = await TabManager.getCurrentTab();
    if (!tab?.url) return;

    const isExcluded = await URLManager.isUrlExcluded(tab.url);
    const hostname = URLManager.extractHostname(tab.url);
    
    if (!hostname) return;

    if (isExcluded) {
      await URLManager.updateExcludedUrls(hostname, "remove");
      await BlurEffectManager.enableBlurEffect(tab.id);
      
      await TabManager.sendMessageToPopup({
        action: "siteRemovedFromExclusion",
        tabId: tab.id,
        removedUrl: hostname,
      });
    } else {
      const status = await BlurEffectManager.toggleBlurEffect(tab.id);
      
      await TabManager.sendMessageToPopup({
        action: "blurStateChanged",
        tabId: tab.id,
        newStatus: status,
      });
    }
  }

  static async handleWebNavigation({ tabId, frameId, url }) {
    await TabManager.handleTabNavigation(tabId, url, frameId);
  }

  static async handleTabActivated({ tabId }) {
    const tab = await TabManager.getTab(tabId);
    if (!tab) return;

    await TabManager.handleTabNavigation(tabId, tab.url);
    
    // Send settings to popup
    const [excludedUrls, blurIntensity, backgroundBlurStatus] = await Promise.all([
      StorageManager.getExcludedUrls(),
      StorageManager.getBlurIntensity(),
      StorageManager.getBackgroundBlurStatus()
    ]);

    await TabManager.sendMessageToPopup({
      action: "loadSettings",
      tabId: tab.id,
      excludedUrls,
      blurIntensity,
      backgroundBlurStatus,
    });
  }

  static async handleTabUpdated(tabId, changeInfo, tab) {
    if (changeInfo.status === "loading" && URLManager.shouldProcessUrl(tab.url)) {
      await TabManager.handleTabNavigation(tabId, tab.url);
    }
  }
}

// === EVENT LISTENERS ===
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  MessageHandler.handleMessage(req, sender, sendResponse);
  return true; // Keep message channel open for async response
});

chrome.runtime.onInstalled.addListener(EventHandlers.handleInstall);
chrome.runtime.onStartup.addListener(EventHandlers.handleStartup);
chrome.commands.onCommand.addListener(EventHandlers.handleCommand);
chrome.webNavigation.onCommitted.addListener(EventHandlers.handleWebNavigation);
chrome.tabs.onActivated.addListener(EventHandlers.handleTabActivated);
chrome.tabs.onUpdated.addListener(EventHandlers.handleTabUpdated);