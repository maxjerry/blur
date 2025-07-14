const DEFAULT_EXCLUDED_URLS = [
  "chrome://",
  "meet.google.com",
  "localhost"
];

class PopupManager {
  constructor() {
    this.currentUrl = '';
    this.currentHostname = '';
    this.excludedUrls = [];
    
    this.init();
  }
  
  async init() {
    await this.loadCurrentTab();
    await this.loadExcludedUrls();
    this.setupEventListeners();
    this.render();
  }
  
  async loadCurrentTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      this.currentUrl = tab.url || '';
      this.currentHostname = this.currentUrl ? new URL(this.currentUrl).hostname : '';
    } catch (error) {
      console.error('Failed to load current tab:', error);
    }
  }
  
  async loadExcludedUrls() {
    try {
      const response = await this.sendMessage({ action: 'getExcludedUrls' });
      if (response.success) {
        this.excludedUrls = response.urls;
      }
    } catch (error) {
      console.error('Failed to load excluded URLs:', error);
    }
  }
  
  async sendMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, resolve);
    });
  }
  
  setupEventListeners() {
    // Add URL button
    document.getElementById('addUrlBtn').addEventListener('click', () => {
      this.addUrl();
    });
    
    // Enter key on input
    document.getElementById('newUrlInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.addUrl();
      }
    });
    
    // Toggle current site
    document.getElementById('toggleCurrentSite').addEventListener('click', () => {
      this.toggleCurrentSite();
    });
  }
  
  async addUrl() {
    const input = document.getElementById('newUrlInput');
    const url = input.value.trim();
    
    if (!url) {
      this.showMessage('Please enter a URL or domain', 'error');
      return;
    }
    
    try {
      const response = await this.sendMessage({ 
        action: 'addExcludedUrl', 
        url: url 
      });
      
      if (response.success) {
        this.excludedUrls = response.urls;
        input.value = '';
        this.showMessage(`Added "${url}" to excluded URLs`, 'success');
        this.render();
      } else {
        this.showMessage(response.error || 'Failed to add URL', 'error');
      }
    } catch (error) {
      this.showMessage('Failed to add URL', 'error');
    }
  }
  
  async removeUrl(url) {
    try {
      const response = await this.sendMessage({ 
        action: 'removeExcludedUrl', 
        url: url 
      });
      
      if (response.success) {
        this.excludedUrls = response.urls;
        this.showMessage(`Removed "${url}" from excluded URLs`, 'success');
        this.render();
      } else {
        this.showMessage(response.error || 'Failed to remove URL', 'error');
      }
    } catch (error) {
      this.showMessage('Failed to remove URL', 'error');
    }
  }
  
  async toggleCurrentSite() {
    if (!this.currentHostname) {
      this.showMessage('No valid hostname found', 'error');
      return;
    }
    
    const isCurrentlyExcluded = this.excludedUrls.some(url => 
      this.currentHostname.includes(url) || url.includes(this.currentHostname)
    );
    
    if (isCurrentlyExcluded) {
      // Find and remove the matching URL
      const matchingUrl = this.excludedUrls.find(url => 
        this.currentHostname.includes(url) || url.includes(this.currentHostname)
      );
      if (matchingUrl) {
        await this.removeUrl(matchingUrl);
      }
    } else {
      // Add current hostname
      try {
        const response = await this.sendMessage({ action: 'addCurrentUrl' });
        if (response.success) {
          this.excludedUrls = response.urls;
          this.showMessage(`Added "${response.addedUrl}" to excluded URLs`, 'success');
          this.render();
        } else {
          this.showMessage(response.error || 'Failed to add current site', 'error');
        }
      } catch (error) {
        this.showMessage('Failed to add current site', 'error');
      }
    }
  }
  
  showMessage(text, type) {
    const messageDiv = document.getElementById('message');
    messageDiv.textContent = text;
    messageDiv.className = type === 'error' ? 'error-message' : 'success-message';
    
    setTimeout(() => {
      messageDiv.textContent = '';
      messageDiv.className = '';
    }, 3000);
  }
  
  render() {
    this.renderCurrentSite();
    this.renderExcludedList();
  }
  
  renderCurrentSite() {
    const urlElement = document.getElementById('currentUrl');
    const statusElement = document.getElementById('currentStatus');
    const toggleButton = document.getElementById('toggleCurrentSite');
    
    if (!this.currentHostname) {
      urlElement.textContent = 'No valid URL';
      statusElement.textContent = 'N/A';
      statusElement.className = 'status';
      toggleButton.style.display = 'none';
      return;
    }
    
    urlElement.textContent = this.currentHostname;
    
    const isExcluded = this.excludedUrls.some(url => 
      this.currentHostname.includes(url) || url.includes(this.currentHostname)
    );
    
    if (isExcluded) {
      statusElement.textContent = 'Excluded';
      statusElement.className = 'status excluded';
      toggleButton.textContent = 'Remove from Excluded';
      toggleButton.className = 'btn btn-danger btn-small';
    } else {
      statusElement.textContent = 'Active';
      statusElement.className = 'status active';
      toggleButton.textContent = 'Add to Excluded';
      toggleButton.className = 'btn btn-secondary btn-small';
    }
    
    toggleButton.style.display = 'block';
  }
  
  renderExcludedList() {
    const listElement = document.getElementById('excludedList');
    
    if (this.excludedUrls.length === 0) {
      listElement.innerHTML = '<div class="empty-state">No excluded URLs</div>';
      return;
    }
    
    listElement.innerHTML = this.excludedUrls.map(url => {
      const isDefault = DEFAULT_EXCLUDED_URLS.includes(url);
      return `
        <div class="excluded-item">
          <div class="excluded-url">
            ${isDefault ? '<span class="default-tag">DEFAULT</span>' : ''}
            ${this.escapeHtml(url)}
          </div>
          ${!isDefault ? `<button class="btn btn-danger btn-small" onclick="popupManager.removeUrl('${this.escapeHtml(url)}')">Remove</button>` : ''}
        </div>
      `;
    }).join('');
  }
  
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.popupManager = new PopupManager();
});