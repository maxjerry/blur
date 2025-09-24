class PopupManager {
  constructor() {
    this.state = {
      currentUrl: "",
      currentHostname: "",
      currentTabId: null,
      blurStatus: "OFF",
      backgroundBlurStatus: false,
      canvasBlurStatus: true,
      blurIntensity: 50,
      excludedUrls: ["chrome://", "meet.google.com", "localhost"]
    };

    this.elements = {};
    this.init();
  }

  // === INITIALIZATION ===
  async init() {
    try {
      this.cacheElements();
      await this.loadInitialData();
      this.setupEventListeners();
      this.setupMessageListener();
      this.render();
    } catch (error) {
      console.error("Failed to initialize PopupManager:", error);
      this.showMessage("Failed to initialize popup", "error");
    }
  }

  cacheElements() {
    const elementIds = [
      'addUrlBtn', 'newUrlInput', 'toggleCurrentSite', 'toggleBlurSwitch',
      'toggleBackgroundBlurSwitch', 'toggleCanvasBlurSwitch', 'intensitySlider', 'currentUrl',
      'currentStatus', 'toggleBlurLabel', 'toggleBackgroundBlurLabel', 'toggleCanvasBlurLabel',
      'excludedList', 'intensityValue', 'previewText', 'message', 'mainTab', 'settingsTab',
      'mainTabContent', 'settingsTabContent'
    ];

    elementIds.forEach(id => {
      this.elements[id] = document.getElementById(id);
    });
  }

  async loadInitialData() {
    await Promise.all([
      this.loadCurrentTab(),
      this.loadExcludedUrls(),
      this.loadBlurIntensity(),
      this.loadBackgroundBlurState(),
      this.loadCanvasBlurState()
    ]);
  }

  // === DATA LOADING ===
  async loadCurrentTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      this.state.currentUrl = tab.url || "";
      this.state.currentHostname = this.extractHostname(this.state.currentUrl);
      this.state.currentTabId = tab.id;

      if (this.state.currentTabId) {
        const badgeText = await chrome.action.getBadgeText({ tabId: this.state.currentTabId });
        this.state.blurStatus = badgeText || "OFF";
      }
    } catch (error) {
      console.error("Failed to load current tab:", error);
      throw error;
    }
  }

  async loadExcludedUrls() {
    const response = await this.sendMessage({ action: "getExcludedUrls" });
    if (response.success) {
      this.state.excludedUrls = response.urls;
    }
  }

  async loadBlurIntensity() {
    const response = await this.sendMessage({ action: "getBlurIntensity" });
    if (response.success) {
      this.state.blurIntensity = response.intensity;
    }
  }

  async loadBackgroundBlurState() {
    const response = await this.sendMessage({ action: "getBackgroundBlurStatus" });
    if (response.success) {
      this.state.backgroundBlurStatus = response.backgroundBlurStatus;
    }
  }

  async loadCanvasBlurState() {
    const response = await this.sendMessage({ action: "getCanvasBlurStatus" });
    if (response.success) {
      this.state.canvasBlurStatus = response.canvasBlurStatus;
    }
  }

  // === BLUR OPERATIONS ===
  async toggleBlur() {
    if (!this.validateActiveTab()) return;

    if (this.isCurrentSiteExcluded()) {
      await this.removeCurrentSiteFromExclusion();
      return;
    }

    try {
      const response = await this.sendMessage({
        action: "toggleBlur",
        tabId: this.state.currentTabId
      });

      if (response.success) {
        this.state.blurStatus = response.newStatus;
        this.showMessage(
          `Blur ${this.state.blurStatus === "ON" ? "enabled" : "disabled"}`,
          "success"
        );
        this.render();
      } else {
        this.showMessage(response.error || "Failed to toggle blur", "error");
      }
    } catch (error) {
      this.showMessage("Failed to toggle blur", "error");
    }
  }

  async setBlurIntensity(intensity) {
    if (!this.validateActiveTab()) return;

    try {
      const response = await this.sendMessage({
        action: "setBlurIntensity",
        tabId: this.state.currentTabId,
        intensity: parseInt(intensity)
      });

      if (response.success) {
        this.state.blurStatus = "ON";
        this.state.blurIntensity = parseInt(intensity);
        this.render();
      } else {
        this.showMessage(response.error || "Failed to set blur intensity", "error");
      }
    } catch (error) {
      this.showMessage("Failed to set blur intensity", "error");
    }
  }

  async toggleBackgroundBlur() {
    if (!this.validateActiveTab()) return;

    try {
      const response = await this.sendMessage({
        action: "toggleBackgroundBlur",
        tabId: this.state.currentTabId
      });

      if (response.success) {
        this.state.backgroundBlurStatus = response.newStatus;
        this.showMessage(
          `Background Blur ${this.state.backgroundBlurStatus ? "enabled" : "disabled"}`,
          "success"
        );
        this.render();
      } else {
        this.showMessage(response.error || "Failed to toggle background blur", "error");
      }
    } catch (error) {
      this.showMessage("Failed to toggle background blur", "error");
    }
  }

  async toggleCanvasBlur() {
    if (!this.validateActiveTab()) return;

    try {
      const response = await this.sendMessage({
        action: "toggleCanvasBlur",
        tabId: this.state.currentTabId
      });

      if (response.success) {
        this.state.canvasBlurStatus = response.newStatus;
        this.showMessage(
          `Canvas Blur ${this.state.canvasBlurStatus ? "enabled" : "disabled"}`,
          "success"
        );
        this.render();
      } else {
        this.showMessage(response.error || "Failed to toggle canvas blur", "error");
      }
    } catch (error) {
      this.showMessage("Failed to toggle canvas blur", "error");
    }
  }

  // === URL MANAGEMENT ===
  async addUrl() {
    const url = this.elements.newUrlInput.value.trim();

    if (!url) {
      this.showMessage("Please enter a URL or domain", "error");
      return;
    }

    try {
      const response = await this.sendMessage({
        action: "addExcludedUrl",
        url: url
      });

      if (response.success) {
        this.state.excludedUrls = response.urls;
        this.elements.newUrlInput.value = "";
        this.showMessage(`Added "${url}" to excluded URLs`, "success");
        this.render();
      } else {
        this.showMessage(response.error || "Failed to add URL", "error");
      }
    } catch (error) {
      this.showMessage("Failed to add URL", "error");
    }
  }

  async removeUrl(url) {
    try {
      const response = await this.sendMessage({
        action: "removeExcludedUrl",
        url: url
      });

      if (response.success) {
        this.state.excludedUrls = response.urls;
        this.showMessage(`Removed "${url}" from excluded URLs`, "success");

        if (this.isUrlMatchingCurrentSite(url)) {
          await this.enableBlurForCurrentSite();
        }

        this.render();
      } else {
        this.showMessage(response.error || "Failed to remove URL", "error");
      }
    } catch (error) {
      this.showMessage("Failed to remove URL", "error");
    }
  }

  async toggleCurrentSite() {
    if (!this.state.currentHostname) {
      this.showMessage("No valid hostname found", "error");
      return;
    }

    if (this.isCurrentSiteExcluded()) {
      await this.removeCurrentSiteFromExclusion();
    } else {
      await this.addCurrentSiteToExclusion();
    }
  }

  async removeCurrentSiteFromExclusion() {
    const matchingUrl = this.findMatchingExcludedUrl();
    if (matchingUrl) {
      await this.removeUrl(matchingUrl);
    }
  }

  async addCurrentSiteToExclusion() {
    try {
      const response = await this.sendMessage({ action: "addCurrentUrl" });
      
      if (response.success) {
        this.state.excludedUrls = response.urls;
        this.showMessage(`Added "${response.addedUrl}" to excluded URLs`, "success");
        this.render();
      } else {
        this.showMessage(response.error || "Failed to add current site", "error");
      }
    } catch (error) {
      this.showMessage("Failed to add current site", "error");
    }
  }

  async enableBlurForCurrentSite() {
    if (!this.state.currentTabId) return;

    try {
      const response = await this.sendMessage({
        action: "enableBlur",
        tabId: this.state.currentTabId
      });

      if (response.success) {
        this.state.blurStatus = "ON";
        this.showMessage("Blur automatically enabled", "success");
      }
    } catch (error) {
      console.error("Failed to enable blur automatically:", error);
    }
  }

  // === EVENT LISTENERS ===
  setupEventListeners() {
    const eventMappings = [
      { element: 'addUrlBtn', event: 'click', handler: () => this.addUrl() },
      { element: 'newUrlInput', event: 'keypress', handler: (e) => e.key === 'Enter' && this.addUrl() },
      { element: 'toggleCurrentSite', event: 'click', handler: () => this.toggleCurrentSite() },
      { element: 'toggleBlurSwitch', event: 'change', handler: () => this.toggleBlur() },
      { element: 'toggleBackgroundBlurSwitch', event: 'change', handler: () => this.toggleBackgroundBlur() },
      { element: 'toggleCanvasBlurSwitch', event: 'change', handler: () => this.toggleCanvasBlur() },
      { element: 'intensitySlider', event: 'input', handler: (e) => this.setBlurIntensity(e.target.value) },
      { element: 'mainTab', event: 'click', handler: () => this.switchTab('main') },
      { element: 'settingsTab', event: 'click', handler: () => this.switchTab('settings') }
    ];

    eventMappings.forEach(({ element, event, handler }) => {
      if (this.elements[element]) {
        this.elements[element].addEventListener(event, handler);
      }
    });

    // Delegation for remove buttons
    document.addEventListener("click", (e) => {
      if (e.target.classList.contains("removeExcludedUrlBtn")) {
        this.removeUrl(e.target.dataset.url);
      }
    });
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.tabId !== this.state.currentTabId) return;

      const handlers = {
        blurStateChanged: () => {
          this.state.blurStatus = request.newStatus;
          this.render();
        },
        siteRemovedFromExclusion: () => {
          this.state.excludedUrls = this.state.excludedUrls.filter(url => url !== request.removedUrl);
          this.state.blurStatus = "ON";
          this.state.backgroundBlurStatus = request.backgroundBlurStatus;
          this.showMessage(`Removed "${request.removedUrl}" from excluded URLs and enabled blur`, "success");
          this.render();
        },
        loadSettings: () => {
          this.state.excludedUrls = request.excludedUrls;
          this.state.backgroundBlurStatus = request.backgroundBlurStatus;
          this.state.canvasBlurStatus = request.canvasBlurStatus;
          this.state.blurIntensity = request.blurIntensity;
          this.render();
        }
      };

      const handler = handlers[request.action];
      if (handler) {
        handler();
        sendResponse({ success: true });
      }
    });
  }

  // === RENDERING ===
  render() {
    this.renderCurrentSite();
    this.renderExcludedList();
    this.renderBlurIntensity();
    this.renderBackgroundBlur();
    this.renderCanvasBlur();
  }

  renderCurrentSite() {
    if (!this.state.currentHostname) {
      this.renderInvalidSite();
      return;
    }

    this.elements.currentUrl.textContent = this.state.currentHostname;

    const isExcluded = this.isCurrentSiteExcluded();
    const siteConfig = this.getSiteRenderConfig(isExcluded);
    
    this.applySiteConfig(siteConfig);
  }

  renderInvalidSite() {
    this.elements.currentUrl.textContent = "No valid URL";
    this.elements.currentStatus.textContent = "N/A";
    this.elements.currentStatus.className = "status";
    this.elements.toggleCurrentSite.style.display = "none";
    
    if (this.elements.toggleBlurSwitch) {
      this.elements.toggleBlurSwitch.parentElement.style.display = "none";
    }
  }

  getSiteRenderConfig(isExcluded) {
    if (isExcluded) {
      return {
        statusText: "Excluded",
        statusClass: "status excluded",
        buttonText: "Remove from Excluded",
        buttonClass: "btn btn-danger btn-small",
        blurSwitchChecked: false,
        blurLabelText: "Blur (Excluded)"
      };
    }

    return {
      statusText: `Blur: ${this.state.blurStatus}`,
      statusClass: this.state.blurStatus === "ON" ? "status active" : "status",
      buttonText: "Add to Excluded",
      buttonClass: "btn btn-secondary btn-small",
      blurSwitchChecked: this.state.blurStatus === "ON",
      blurLabelText: this.state.blurStatus === "ON" ? "Blur Enabled" : "Blur Disabled"
    };
  }

  applySiteConfig(config) {
    this.elements.currentStatus.textContent = config.statusText;
    this.elements.currentStatus.className = config.statusClass;
    this.elements.toggleCurrentSite.textContent = config.buttonText;
    this.elements.toggleCurrentSite.className = config.buttonClass;
    this.elements.toggleCurrentSite.style.display = "block";

    if (this.elements.toggleBlurSwitch) {
      this.elements.toggleBlurSwitch.parentElement.style.display = "flex";
      this.elements.toggleBlurSwitch.checked = config.blurSwitchChecked;
      
      if (this.elements.toggleBlurLabel) {
        this.elements.toggleBlurLabel.textContent = config.blurLabelText;
      }
    }
  }

  renderExcludedList() {
    if (this.state.excludedUrls.length === 0) {
      this.elements.excludedList.innerHTML = '<div class="empty-state">No excluded URLs</div>';
      return;
    }

    this.elements.excludedList.innerHTML = this.state.excludedUrls
      .map(url => this.createExcludedItemHTML(url))
      .join("");
  }

  createExcludedItemHTML(url) {
    return `
      <div class="excluded-item">
        <div class="excluded-url">${this.escapeHtml(url)}</div>
        <button class="btn btn-danger btn-small removeExcludedUrlBtn" data-url="${this.escapeHtml(url)}">
          Remove
        </button>
      </div>
    `;
  }

  renderBlurIntensity() {
    const isExcluded = this.isCurrentSiteExcluded();
    
    this.elements.intensityValue.textContent = `${this.state.blurIntensity}px`;
    this.elements.previewText.style.filter = `blur(${this.state.blurIntensity}px)`;
    this.elements.intensitySlider.value = this.state.blurIntensity;
    this.elements.intensitySlider.disabled = isExcluded;
    
    const intensityContainer = document.querySelector(".blur-intensity-section");
    if (intensityContainer) {
      intensityContainer.style.display = isExcluded ? "none" : "block";
    }
  }

  renderBackgroundBlur() {
    this.elements.toggleBackgroundBlurSwitch.checked = this.state.backgroundBlurStatus;
    this.elements.toggleBackgroundBlurLabel.textContent = 
      `Background Blur ${this.state.backgroundBlurStatus ? "Enabled" : "Disabled"}`;
  }

  renderCanvasBlur() {
    this.elements.toggleCanvasBlurSwitch.checked = this.state.canvasBlurStatus;
    this.elements.toggleCanvasBlurLabel.textContent = 
      `Canvas Blur ${this.state.canvasBlurStatus ? "Enabled" : "Disabled"}`;
  }

  // === UTILITY METHODS ===
  extractHostname(url) {
    try {
      return url ? new URL(url).hostname : "";
    } catch {
      return "";
    }
  }

  validateActiveTab() {
    if (!this.state.currentTabId) {
      this.showMessage("No active tab found", "error");
      return false;
    }
    return true;
  }

  isCurrentSiteExcluded() {
    return this.state.excludedUrls.some(url => this.isUrlMatchingCurrentSite(url));
  }

  isUrlMatchingCurrentSite(url) {
    return this.state.currentHostname.includes(url) || url.includes(this.state.currentHostname);
  }

  findMatchingExcludedUrl() {
    return this.state.excludedUrls.find(url => this.isUrlMatchingCurrentSite(url));
  }

  async sendMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, resolve);
    });
  }

  showMessage(text, type) {
    this.elements.message.textContent = text;
    this.elements.message.className = type === "error" ? "error-message" : "success-message";

    setTimeout(() => {
      this.elements.message.textContent = "";
      this.elements.message.className = "";
    }, 3000);
  }

  // === TAB SWITCHING ===
  switchTab(tabName) {
    // Remove active class from all tabs and content
    document.querySelectorAll('.tab-button').forEach(tab => {
      tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });

    // Add active class to selected tab and content
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`${tabName}TabContent`).classList.add('active');
  }

  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  window.popupManager = new PopupManager();
});