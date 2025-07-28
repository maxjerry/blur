class PopupManager {
  constructor() {
    this.currentUrl = "";
    this.currentHostname = "";
    this.excludedUrls = ["chrome://", "meet.google.com", "localhost"];
    this.currentTabId = null;
    this.blurStatus = "OFF";
    this.backgroundBlurStatus = false;
    this.blurIntensity = 50;

    this.init();
  }

  async init() {
    await this.loadCurrentTab();
    await this.loadExcludedUrls();
    await this.loadBlurIntensity();
    await this.loadBackgroundBlurState();
    this.setupEventListeners();
    this.setupMessageListener();
    this.render();
  }

  async loadCurrentTab() {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      this.currentUrl = tab.url || "";
      this.currentHostname = this.currentUrl
        ? new URL(this.currentUrl).hostname
        : "";
      this.currentTabId = tab.id;

      // Get current blur status
      if (this.currentTabId) {
        const badgeText = await chrome.action.getBadgeText({
          tabId: this.currentTabId,
        });
        this.blurStatus = badgeText || "OFF";
      }
    } catch (error) {
      console.error("Failed to load current tab:", error);
    }
  }

  async setBlurIntensity(intensity) {
    if (!this.currentTabId) {
      this.showMessage("No active tab found", "error");
      return;
    }

    try {
      const response = await this.sendMessage({
        action: "setBlurIntensity",
        tabId: this.currentTabId,
        intensity: intensity,
      });

      if (response.success) {
        this.blurStatus = "ON";
        this.blurIntensity = intensity;
        this.render();
      } else {
        this.showMessage(
          response.error || "Failed to set blur intensity",
          "error"
        );
      }
    } catch (error) {
      this.showMessage("Failed to set blur intensity", "error");
    }
  }

  async toggleBlur() {
    if (!this.currentTabId) {
      this.showMessage("No active tab found", "error");
      return;
    }

    const isExcluded = this.excludedUrls.some(
      (url) =>
        this.currentHostname.includes(url) || url.includes(this.currentHostname)
    );

    if (isExcluded) {
      // Remove from excluded list and enable blur
      const matchingUrl = this.excludedUrls.find(
        (url) =>
          this.currentHostname.includes(url) ||
          url.includes(this.currentHostname)
      );
      if (matchingUrl) {
        await this.removeUrl(matchingUrl);
        // removeUrl will handle enabling blur automatically
      }
      return;
    }

    try {
      const response = await this.sendMessage({
        action: "toggleBlur",
        tabId: this.currentTabId,
      });

      if (response.success) {
        this.blurStatus = response.newStatus;
        this.showMessage(
          `Blur ${this.blurStatus === "ON" ? "enabled" : "disabled"}`,
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

  async loadBackgroundBlurState() {
    try {
      const response = await this.sendMessage({
        action: "getBackgroundBlurStatus",
      });
      if (response.success) {
        this.backgroundBlurStatus = response.backgroundBlurStatus;
      }
    } catch (error) {
      console.error("Failed to load background blur state:", error);
    }
  }

  async toggleBackgroundBlur() {
    if (!this.currentTabId) {
      this.showMessage("No active tab found", "error");
      return;
    }
    try {
      const response = await this.sendMessage({
        action: "toggleBackgroundBlur",
        tabId: this.currentTabId,
      });
      if (response.success) {
        this.backgroundBlurStatus = response.newStatus;
        this.showMessage(
          `Background Blur ${
            this.backgroundBlurStatus ? "enabled" : "disabled"
          }`,
          "success"
        );
        this.render();
      } else {
        this.showMessage(
          response.error || "Failed to toggle background blur",
          "error"
        );
      }
    } catch (error) {
      this.showMessage("Failed to toggle background blur", "error");
    }
  }

  async enableBlurForCurrentSite() {
    if (!this.currentTabId) return;

    try {
      const response = await this.sendMessage({
        action: "enableBlur",
        tabId: this.currentTabId,
      });

      if (response.success) {
        this.blurStatus = "ON";
        this.showMessage("Blur automatically enabled", "success");
      }
    } catch (error) {
      console.error("Failed to enable blur automatically:", error);
    }
  }

  async loadExcludedUrls() {
    try {
      const response = await this.sendMessage({ action: "getExcludedUrls" });
      if (response.success) {
        this.excludedUrls = response.urls;
      }
    } catch (error) {
      console.error("Failed to load excluded URLs:", error);
    }
  }

  async loadBlurIntensity() {
    try {
      const response = await this.sendMessage({ action: "getBlurIntensity" });
      if (response.success) {
        this.blurIntensity = response.intensity;
      }
    } catch (error) {
      console.error("Failed to load Blur Intensity:", error);
    }
  }

  async sendMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, resolve);
    });
  }

  setupEventListeners() {
    // Add URL button
    document.getElementById("addUrlBtn").addEventListener("click", () => {
      this.addUrl();
    });

    // Enter key on input
    document.getElementById("newUrlInput").addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        this.addUrl();
      }
    });

    // Toggle current site
    document
      .getElementById("toggleCurrentSite")
      .addEventListener("click", () => {
        this.toggleCurrentSite();
      });

    // Toggle blur switch
    document
      .getElementById("toggleBlurSwitch")
      .addEventListener("change", () => {
        this.toggleBlur();
      });
    // Toggle background blur switch
    document
      .getElementById("toggleBackgroundBlurSwitch")
      .addEventListener("change", () => {
        this.toggleBackgroundBlur();
      });

    // Blur intensity slider
    document
      .getElementById("intensitySlider")
      .addEventListener("input", (e) => {
        this.setBlurIntensity(e.target.value);
      });

    document.addEventListener("click", (e) => {
      if (e.target.classList.contains("removeExcludedUrlBtn")) {
        const url = e.target.dataset.url;
        this.removeUrl(url);
      }
    });
  }

  setupMessageListener() {
    // Listen for blur state changes from background script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      console.log(request);
      if (request.tabId === this.currentTabId) {
        if (request.action === "blurStateChanged") {
          this.blurStatus = request.newStatus;
          this.render();
        } else if (request.action === "siteRemovedFromExclusion") {
          // Site was removed from exclusion list
          this.excludedUrls = this.excludedUrls.filter(
            (url) => url !== request.removedUrl
          );
          this.blurStatus = "ON";
          this.backgroundBlurStatus = request.backgroundBlurStatus;
          this.showMessage(
            `Removed "${request.removedUrl}" from excluded URLs and enabled blur`,
            "success"
          );
          this.render();
        } else if (request.action === "loadSettings") {
          // Site was removed from exclusion list
          this.excludedUrls = request.excludedUrls;
          this.backgroundBlurStatus = request.backgroundBlurStatus;
          this.blurIntensity = request.blurIntensity;
          this.render();
        }
        sendResponse({ success: true });
      }
    });
  }

  async addUrl() {
    const input = document.getElementById("newUrlInput");
    const url = input.value.trim();

    if (!url) {
      this.showMessage("Please enter a URL or domain", "error");
      return;
    }

    try {
      const response = await this.sendMessage({
        action: "addExcludedUrl",
        url: url,
      });

      if (response.success) {
        this.excludedUrls = response.urls;
        input.value = "";
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
        url: url,
      });

      if (response.success) {
        this.excludedUrls = response.urls;
        this.showMessage(`Removed "${url}" from excluded URLs`, "success");

        // If current site was removed from excluded, automatically enable blur
        if (
          this.currentHostname &&
          (this.currentHostname.includes(url) ||
            url.includes(this.currentHostname))
        ) {
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
    if (!this.currentHostname) {
      this.showMessage("No valid hostname found", "error");
      return;
    }

    const isCurrentlyExcluded = this.excludedUrls.some(
      (url) =>
        this.currentHostname.includes(url) || url.includes(this.currentHostname)
    );

    if (isCurrentlyExcluded) {
      // Find and remove the matching URL
      const matchingUrl = this.excludedUrls.find(
        (url) =>
          this.currentHostname.includes(url) ||
          url.includes(this.currentHostname)
      );
      if (matchingUrl) {
        await this.removeUrl(matchingUrl);
        // removeUrl will handle enabling blur automatically
      }
    } else {
      // Add current hostname
      try {
        const response = await this.sendMessage({ action: "addCurrentUrl" });
        if (response.success) {
          this.excludedUrls = response.urls;
          this.showMessage(
            `Added "${response.addedUrl}" to excluded URLs`,
            "success"
          );
          this.render();
        } else {
          this.showMessage(
            response.error || "Failed to add current site",
            "error"
          );
        }
      } catch (error) {
        this.showMessage("Failed to add current site", "error");
      }
    }
  }

  showMessage(text, type) {
    const messageDiv = document.getElementById("message");
    messageDiv.textContent = text;
    messageDiv.className =
      type === "error" ? "error-message" : "success-message";

    setTimeout(() => {
      messageDiv.textContent = "";
      messageDiv.className = "";
    }, 3000);
  }

  render() {
    this.renderCurrentSite();
    this.renderExcludedList();
    this.renderBlurIntensity();
    this.renderBackgroundBlur();
  }

  renderCurrentSite() {
    const urlElement = document.getElementById("currentUrl");
    const statusElement = document.getElementById("currentStatus");
    const toggleButton = document.getElementById("toggleCurrentSite");
    const toggleBlurSwitch = document.getElementById("toggleBlurSwitch");
    const toggleBackgroundBlurSwitch = document.getElementById(
      "toggleBackgroundBlurSwitch"
    );
    const toggleBlurLabel = document.getElementById("toggleBlurLabel");

    if (!this.currentHostname) {
      urlElement.textContent = "No valid URL";
      statusElement.textContent = "N/A";
      statusElement.className = "status";
      toggleButton.style.display = "none";
      if (toggleBlurSwitch)
        toggleBlurSwitch.parentElement.style.display = "none";
      return;
    }

    urlElement.textContent = this.currentHostname;

    const isExcluded = this.excludedUrls.some(
      (url) =>
        this.currentHostname.includes(url) || url.includes(this.currentHostname)
    );

    if (isExcluded) {
      statusElement.textContent = "Excluded";
      statusElement.className = "status excluded";
      toggleButton.textContent = "Remove from Excluded";
      toggleButton.className = "btn btn-danger btn-small";
      if (toggleBlurSwitch) {
        toggleBlurSwitch.parentElement.style.display = "flex";
        toggleBlurSwitch.checked = false;
        toggleBackgroundBlurSwitch.checked = false;
        toggleBackgroundBlurSwitch.parentElement.style.display = "none";
        if (toggleBlurLabel) toggleBlurLabel.textContent = "Blur (Excluded)";
      }
    } else {
      statusElement.textContent = `Blur: ${this.blurStatus}`;
      statusElement.className =
        this.blurStatus === "ON" ? "status active" : "status";
      toggleButton.textContent = "Add to Excluded";
      toggleButton.className = "btn btn-secondary btn-small";
      if (toggleBlurSwitch) {
        toggleBlurSwitch.parentElement.style.display = "flex";
        toggleBlurSwitch.checked = this.blurStatus === "ON";
        if (toggleBlurLabel)
          toggleBlurLabel.textContent =
            this.blurStatus === "ON" ? "Blur Enabled" : "Blur Disabled";
        toggleBackgroundBlurSwitch.parentElement.style.display = "flex";
        if (this.blurStatus === "OFF") {
          toggleBackgroundBlurSwitch.parentElement.style.display = "none";
        } else {
          toggleBackgroundBlurSwitch.parentElement.style.display = "flex";
        }
      }
    }

    toggleButton.style.display = "block";
  }

  renderExcludedList() {
    const listElement = document.getElementById("excludedList");

    if (this.excludedUrls.length === 0) {
      listElement.innerHTML = '<div class="empty-state">No excluded URLs</div>';
      return;
    }

    listElement.innerHTML = this.excludedUrls
      .map((url) => {
        return `
        <div class="excluded-item">
          <div class="excluded-url">
            ${this.escapeHtml(url)}
          </div>
          <button class="btn btn-danger btn-small removeExcludedUrlBtn" data-url="${this.escapeHtml(
            url
          )}">Remove</button>
        </div>
      `;
      })
      .join("");
  }

  renderBlurIntensity() {
    const isCurrentlyExcluded = this.excludedUrls.some(
      (url) =>
        this.currentHostname.includes(url) || url.includes(this.currentHostname)
    );
    const intensityValueElement = document.getElementById("intensityValue");
    const previewElement = document.getElementById("previewText");
    const sliderElement = document.getElementById("intensitySlider");

    intensityValueElement.innerHTML = `${this.blurIntensity}px`;
    previewElement.style.filter = `blur(${this.blurIntensity}px)`;
    sliderElement.value = this.blurIntensity;
    sliderElement.disabled = isCurrentlyExcluded;
    const intensityContainerElement = document.querySelector(
      ".blur-intensity-section"
    );
    intensityContainerElement.style.display = isCurrentlyExcluded
      ? "none"
      : "block";
  }

  renderBackgroundBlur() {
    const toggleBackgroundBlurSwitch = document.getElementById(
      "toggleBackgroundBlurSwitch"
    );
    toggleBackgroundBlurSwitch.checked = this.backgroundBlurStatus;
    const toggleBackgroundBlurLabel = document.getElementById(
      "toggleBackgroundBlurLabel"
    );
    if (this.backgroundBlurStatus) {
      toggleBackgroundBlurLabel.textContent = "Background Blur Enabled";
    } else {
      toggleBackgroundBlurLabel.textContent = "Background Blur Disabled";
    }
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
