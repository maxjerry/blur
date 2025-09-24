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
    this.debounceTimers = {};
    this.isUpdatingSlider = false;
    this.init();
  }

  // === INITIALIZATION ===
  async init() {
    try {
      this.cacheElements();
      await this.loadInitialData();
      this.setupEventListeners();
      this.render();
    } catch (error) {
      console.error("Failed to initialize PopupManager:", error);
    }
  }

  cacheElements() {
    const elementIds = [
      'addUrlBtn', 'newUrlInput', 'toggleCurrentSite', 'toggleBlurSwitch',
      'toggleBackgroundBlurSwitch', 'toggleCanvasBlurSwitch', 'intensitySlider', 'currentUrl',
      'currentStatus', 'toggleBlurLabel', 'toggleBackgroundBlurLabel', 'toggleCanvasBlurLabel',
      'excludedList', 'intensityValue', 'previewText', 'mainTab', 'settingsTab',
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
        this.render();
      } else {
        
      }
    } catch (error) {
      
    }
  }

  async setBlurIntensity(intensity) {
    if (!this.validateActiveTab() || this.isUpdatingSlider) return;

    // Parse and validate intensity value
    const parsedIntensity = parseInt(intensity);
    if (isNaN(parsedIntensity) || parsedIntensity < 10 || parsedIntensity > 200) {
      console.warn("Invalid blur intensity value:", intensity);
      return;
    }

    // Update UI immediately for responsive feedback
    this.updateSliderUI(parsedIntensity);

    // Debounce the actual API call to prevent excessive requests
    this.debounceSliderUpdate(parsedIntensity);
  }

  debounceSliderUpdate(intensity) {
    // Clear any existing timer
    if (this.debounceTimers.sliderUpdate) {
      clearTimeout(this.debounceTimers.sliderUpdate);
    }

    // Set new timer for API call
    this.debounceTimers.sliderUpdate = setTimeout(async () => {
      await this.updateBlurIntensityAPI(intensity);
    }, 150); // 150ms debounce delay
  }

  updateSliderUI(intensity) {
    // Update state and UI elements immediately
    this.state.blurIntensity = intensity;
    this.elements.intensityValue.textContent = `${intensity}px`;
    this.elements.previewText.style.filter = `blur(${intensity}px)`;
    
    // Ensure slider value is synced
    if (this.elements.intensitySlider.value != intensity) {
      this.elements.intensitySlider.value = intensity;
    }
  }

  async updateBlurIntensityAPI(intensity) {
    if (!this.validateActiveTab()) return;

    this.isUpdatingSlider = true;
    
    try {
      const response = await this.sendMessage({
        action: "setBlurIntensity",
        tabId: this.state.currentTabId,
        intensity: intensity
      });

      if (response.success) {
        this.state.blurStatus = "ON";
        this.state.blurIntensity = intensity;
        // Re-render other components that might depend on blur state
        this.renderCurrentSite();
        this.renderBackgroundBlur();
        this.renderCanvasBlur();
      } else {
        console.error("Failed to set blur intensity:", response.error);
        // Revert to previous state if API call failed
        this.loadBlurIntensity();
      }
    } catch (error) {
      console.error("Error setting blur intensity:", error);
      // Revert to previous state if API call failed
      this.loadBlurIntensity();
    } finally {
      this.isUpdatingSlider = false;
    }
  }

  forceSliderUpdate(intensity) {
    // Cancel any pending debounced update
    if (this.debounceTimers.sliderUpdate) {
      clearTimeout(this.debounceTimers.sliderUpdate);
      this.debounceTimers.sliderUpdate = null;
    }
    
    // Force immediate API update
    this.updateBlurIntensityAPI(parseInt(intensity));
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
        this.render();
      } else {
        
      }
    } catch (error) {
      
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
        this.render();
      } else {
        
      }
    } catch (error) {
      
    }
  }

  // === URL MANAGEMENT ===
  async addUrl() {
    const url = this.elements.newUrlInput.value.trim();

    if (!url) {
      
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
        
        this.render();
      } else {
        
      }
    } catch (error) {
      
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
        

        if (this.isUrlMatchingCurrentSite(url)) {
          await this.enableBlurForCurrentSite();
        }

        this.render();
      } else {
        
      }
    } catch (error) {
      
    }
  }

  async toggleCurrentSite() {
    if (!this.state.currentHostname) {
      
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
        
        this.render();
      } else {
        
      }
    } catch (error) {
      
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
      { element: 'mainTab', event: 'click', handler: () => this.switchTab('main') },
      { element: 'settingsTab', event: 'click', handler: () => this.switchTab('settings') }
    ];

    eventMappings.forEach(({ element, event, handler }) => {
      if (this.elements[element]) {
        this.elements[element].addEventListener(event, handler);
      }
    });

    // Enhanced slider event handling
    if (this.elements.intensitySlider) {
      // Handle input event for real-time feedback during drag
      this.elements.intensitySlider.addEventListener('input', (e) => {
        this.setBlurIntensity(e.target.value);
      });
      
      // Handle change event for when dragging ends
      this.elements.intensitySlider.addEventListener('change', (e) => {
        // Force immediate update when user finishes dragging
        this.forceSliderUpdate(e.target.value);
      });
      
      // Handle focus events to ensure slider stays responsive
      this.elements.intensitySlider.addEventListener('focus', () => {
        this.elements.intensitySlider.setAttribute('data-focused', 'true');
      });
      
      this.elements.intensitySlider.addEventListener('blur', () => {
        this.elements.intensitySlider.removeAttribute('data-focused');
      });
    }

    // Delegation for remove buttons
    document.addEventListener("click", (e) => {
      if (e.target.classList.contains("removeExcludedUrlBtn")) {
        this.removeUrl(e.target.dataset.url);
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
    
    // Update UI elements
    this.elements.intensityValue.textContent = `${this.state.blurIntensity}px`;
    this.elements.previewText.style.filter = `blur(${this.state.blurIntensity}px)`;
    
    // Only update slider value if not currently being dragged by user
    if (!this.elements.intensitySlider.getAttribute('data-focused') && 
        !this.isUpdatingSlider &&
        this.elements.intensitySlider.value != this.state.blurIntensity) {
      this.elements.intensitySlider.value = this.state.blurIntensity;
    }
    
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

  // === CLEANUP ===
  cleanup() {
    // Clear any pending debounce timers
    Object.values(this.debounceTimers).forEach(timer => {
      if (timer) clearTimeout(timer);
    });
    this.debounceTimers = {};
    this.isUpdatingSlider = false;
  }
}

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  window.popupManager = new PopupManager();
});

// Cleanup when popup is closed
window.addEventListener("beforeunload", () => {
  if (window.popupManager) {
    window.popupManager.cleanup();
  }
});
