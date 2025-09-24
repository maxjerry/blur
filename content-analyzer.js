// === NSFW CONTENT ANALYZER ===
// Prevent redeclaration if script is injected multiple times
if (typeof window.NSFWAnalyzer !== 'undefined') {
  console.log('NSFW Analyzer already loaded');
} else {

class NSFWAnalyzer {
  constructor() {
    this.isInitialized = false;
    this.model = null;
    this.analysisCache = new Map();
    this.maxCacheSize = 1000;
    this.confidenceThreshold = 0.7;
  }

  // Initialize the NSFW detection system
  async initialize() {
    if (this.isInitialized) return true;
    
    try {
      // Use a lightweight approach with heuristic detection
      // This can be enhanced with TensorFlow.js model in the future
      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error('NSFW Analyzer failed to initialize:', error);
      return false;
    }
  }

  // Analyze image content for NSFW material
  async analyzeImage(imageElement) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {      
      // Create a unique key for caching
      const cacheKey = this.generateCacheKey(imageElement);
      
      // Check cache first
      if (this.analysisCache.has(cacheKey)) {
        return this.analysisCache.get(cacheKey);
      }

      // Get image data for analysis
      const imageData = await this.extractImageData(imageElement);
      if (!imageData) {
        return { isNSFW: false, confidence: 0, reasons: ['No image data'] };
      }

      // Perform analysis
      const result = await this.performAnalysis(imageData, imageElement);
      
      // Simple console log for NSFW detection
      if (result.isNSFW) {
        console.log(`🔴 NSFW Content Detected - ${(result.confidence * 100).toFixed(1)}% confidence`);
        console.log(`📍 Image: ${imageElement.src?.substring(0, 80)}...`);
        console.log(`🎯 Reasons: ${result.reasons.join(', ')}`);
      }
      
      // Cache the result
      this.cacheResult(cacheKey, result);
      
      return result;
    } catch (error) {
      return { isNSFW: false, confidence: 0, reasons: ['Analysis error: ' + error.message] };
    }
  }

  // Generate cache key for image
  generateCacheKey(element) {
    const src = element.src || element.currentSrc;
    const size = `${element.width}x${element.height}`;
    return `${src}_${size}`.substring(0, 100);
  }

  // Extract image data for analysis
  async extractImageData(imageElement) {
    try {
      // Skip if image is too small or likely an icon
      if (imageElement.width < 50 || imageElement.height < 50) {
        return null;
      }

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      canvas.width = Math.min(imageElement.width, 224);
      canvas.height = Math.min(imageElement.height, 224);
      
      try {
        // Try to draw image to canvas
        ctx.drawImage(imageElement, 0, 0, canvas.width, canvas.height);
        
        // Try to get image data - this will fail for cross-origin images
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        return imageData;
      } catch (securityError) {
        // Handle cross-origin (tainted canvas) error
        if (securityError.name === 'SecurityError') {
          // Try to create a CORS-enabled version of the image
          const corsResult = await this.tryCORSImage(imageElement);
          if (corsResult) {
            return corsResult;
          }
          
          return this.handleCrossOriginImage(imageElement);
        }
        throw securityError;
      }
    } catch (error) {
      return null;
    }
  }

  // Handle cross-origin images with heuristic analysis
  handleCrossOriginImage(imageElement) {
    // Return a mock imageData object that will trigger heuristic-only analysis
    return {
      isCrossOrigin: true,
      width: imageElement.width,
      height: imageElement.height,
      data: null // No pixel data available
    };
  }

  // Attempt to load image with CORS enabled
  async tryCORSImage(originalElement) {
    return new Promise((resolve) => {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        const timeout = setTimeout(() => {
          resolve(null);
        }, 3000); // 3 second timeout
        
        img.onload = () => {
          clearTimeout(timeout);
          try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            canvas.width = Math.min(img.width, 224);
            canvas.height = Math.min(img.height, 224);
            
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            
            resolve(imageData);
          } catch (error) {
            resolve(null);
          }
        };
        
        img.onerror = () => {
          clearTimeout(timeout);
          resolve(null);
        };
        
        // Use the same source URL
        img.src = originalElement.src || originalElement.currentSrc;
      } catch (error) {
        resolve(null);
      }
    });
  }

  // Perform heuristic-based analysis
  async performAnalysis(imageData, element) {
    // Heuristic-based detection (can be replaced with ML model)
    const analysis = {
      skinToneAnalysis: this.analyzeSkinTones(imageData),
      contextualAnalysis: this.analyzeContext(element),
      urlAnalysis: this.analyzeURL(element.src || element.currentSrc)
    };

    // Combine analysis results
    let confidence = 0;
    let reasons = [];

    // Skin tone analysis (skip if cross-origin)
    if (!analysis.skinToneAnalysis.crossOriginSkipped && analysis.skinToneAnalysis.skinPercentage > 0.4) {
      const skinConfidence = 0.3;
      confidence += skinConfidence;
      reasons.push(`High skin tone percentage (${(analysis.skinToneAnalysis.skinPercentage * 100).toFixed(1)}%)`);
    }

    // Contextual analysis (increased weight for cross-origin images)
    if (analysis.contextualAnalysis.suspiciousContext) {
      const contextConfidence = analysis.skinToneAnalysis.crossOriginSkipped ? 0.5 : 0.4;
      confidence += contextConfidence;
      reasons.push(`Suspicious context (${analysis.contextualAnalysis.reasons.join(', ')})`);
    }

    // URL analysis (increased weight for cross-origin images)
    if (analysis.urlAnalysis.suspiciousURL) {
      const urlConfidence = analysis.skinToneAnalysis.crossOriginSkipped ? 0.4 : 0.3;
      confidence += urlConfidence;
      reasons.push(`Suspicious URL pattern (${analysis.urlAnalysis.reasons.join(', ')})`);
    }

    // Add cross-origin specific detection
    if (analysis.skinToneAnalysis.crossOriginSkipped) {
      // Check for additional heuristics for cross-origin images
      const crossOriginHeuristics = this.analyzeCrossOriginHeuristics(element);
      if (crossOriginHeuristics.suspicious) {
        confidence += 0.2;
        reasons.push(`Cross-origin heuristics (${crossOriginHeuristics.reasons.join(', ')})`);
      }
    }

    const isNSFW = confidence >= this.confidenceThreshold;

    return {
      isNSFW,
      confidence,
      reasons,
      details: analysis
    };
  }

  // Analyze skin tones in image
  analyzeSkinTones(imageData) {
    // Handle cross-origin images that don't have pixel data
    if (!imageData.data || imageData.isCrossOrigin) {
      return {
        skinPercentage: 0,
        skinPixels: 0,
        totalPixels: imageData.width * imageData.height,
        crossOriginSkipped: true
      };
    }

    const data = imageData.data;
    let skinPixels = 0;
    let totalPixels = data.length / 4;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // Skin tone detection algorithm
      if (this.isSkinTone(r, g, b)) {
        skinPixels++;
      }
    }

    return {
      skinPercentage: skinPixels / totalPixels,
      skinPixels,
      totalPixels
    };
  }

  // Check if RGB values represent skin tone
  isSkinTone(r, g, b) {
    // Various skin tone ranges
    const skinRanges = [
      // Light skin tones
      { rMin: 95, rMax: 255, gMin: 40, gMax: 200, bMin: 20, bMax: 150 },
      // Medium skin tones
      { rMin: 80, rMax: 220, gMin: 50, gMax: 150, bMin: 30, bMax: 120 },
      // Dark skin tones
      { rMin: 45, rMax: 130, gMin: 30, gMax: 100, bMin: 15, bMax: 80 }
    ];

    return skinRanges.some(range => 
      r >= range.rMin && r <= range.rMax &&
      g >= range.gMin && g <= range.gMax &&
      b >= range.bMin && b <= range.bMax
    );
  }

  // Analyze contextual clues
  analyzeContext(element) {
    let suspiciousContext = false;
    const reasons = [];

    // Check parent element classes and IDs
    const parent = element.parentElement;
    if (parent) {
      const parentText = (parent.className + ' ' + parent.id).toLowerCase();
      const suspiciousTerms = ['adult', 'nsfw', 'xxx', 'porn', 'sexy', 'nude'];
      
      if (suspiciousTerms.some(term => parentText.includes(term))) {
        suspiciousContext = true;
        reasons.push('Suspicious parent context');
      }
    }

    // Check alt text and title
    const altText = (element.alt || '').toLowerCase();
    const titleText = (element.title || '').toLowerCase();
    const combinedText = altText + ' ' + titleText;
    
    const suspiciousWords = ['nude', 'naked', 'sexy', 'adult', 'xxx', 'porn'];
    if (suspiciousWords.some(word => combinedText.includes(word))) {
      suspiciousContext = true;
      reasons.push('Suspicious alt/title text');
    }

    return { suspiciousContext, reasons };
  }

  // Analyze URL for suspicious patterns
  analyzeURL(url) {
    if (!url) return { suspiciousURL: false, reasons: [] };

    const urlLower = url.toLowerCase();
    const reasons = [];
    let suspiciousURL = false;

    // Check for adult domains
    const adultDomains = [
      'pornhub', 'xvideos', 'redtube', 'youporn', 'xhamster',
      'xxx', 'adult', 'porn', 'sex', 'nude', 'nsfw'
    ];

    if (adultDomains.some(domain => urlLower.includes(domain))) {
      suspiciousURL = true;
      reasons.push('Adult domain detected');
    }

    // Check URL path for suspicious terms
    const suspiciousTerms = ['adult', 'xxx', 'porn', 'nude', 'nsfw', 'sexy'];
    if (suspiciousTerms.some(term => urlLower.includes(term))) {
      suspiciousURL = true;
      reasons.push('Suspicious URL path');
    }

    return { suspiciousURL, reasons };
  }

  // Analyze cross-origin images with additional heuristics
  analyzeCrossOriginHeuristics(element) {
    let suspicious = false;
    let reasons = [];

    // Check image dimensions - very large images might be content
    const area = element.width * element.height;
    if (area > 300000) { // 300k pixels (e.g., 600x500)
      suspicious = true;
      reasons.push('Large image dimensions');
    }

    // Check image aspect ratio - extreme ratios less likely to be NSFW
    const aspectRatio = element.width / element.height;
    if (aspectRatio > 0.3 && aspectRatio < 3.0) {
      // Normal aspect ratios are more suspicious than extreme ones
      if (area > 50000) { // Only for reasonably sized images
        suspicious = true;
        reasons.push('Typical content aspect ratio');
      }
    }

    // Check parent element context for additional clues
    const parent = element.parentElement;
    if (parent) {
      const parentClass = parent.className?.toLowerCase() || '';
      const parentId = parent.id?.toLowerCase() || '';
      
      const suspiciousTerms = ['gallery', 'photo', 'image', 'picture', 'media', 'content'];
      if (suspiciousTerms.some(term => parentClass.includes(term) || parentId.includes(term))) {
        suspicious = true;
        reasons.push('Image container context');
      }
    }

    // Check for data attributes that might indicate content type
    const dataAttrs = Object.keys(element.dataset);
    const suspiciousDataAttrs = ['content', 'media', 'photo', 'image'];
    if (dataAttrs.some(attr => suspiciousDataAttrs.includes(attr.toLowerCase()))) {
      suspicious = true;
      reasons.push('Suspicious data attributes');
    }

    return { suspicious, reasons };
  }

  // Cache analysis results
  cacheResult(key, result) {
    if (this.analysisCache.size >= this.maxCacheSize) {
      // Remove oldest entries
      const firstKey = this.analysisCache.keys().next().value;
      this.analysisCache.delete(firstKey);
    }
    
    this.analysisCache.set(key, result);
  }

  // Clear analysis cache
  clearCache() {
    this.analysisCache.clear();
  }

  // Set confidence threshold
  setConfidenceThreshold(threshold) {
    this.confidenceThreshold = Math.max(0, Math.min(1, threshold));
  }
}

// Global instance
window.nsfwAnalyzer = new NSFWAnalyzer();

// Content observer for dynamic content
class NSFWContentObserver {
  constructor() {
    this.observer = null;
    this.isObserving = false;
    this.processedElements = new WeakSet();
  }

  start() {
    if (this.isObserving) {
      return;
    }

    this.observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            this.processNewContent(node);
          }
        });
      });
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    this.isObserving = true;

    // Process existing content
    this.processExistingContent();
  }

  stop() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.isObserving = false;
  }

  async processNewContent(element) {
    // Find images, videos, and canvas elements
    const mediaElements = [
      ...element.querySelectorAll('img, video, canvas'),
      ...(element.matches && element.matches('img, video, canvas') ? [element] : [])
    ];

    for (const mediaElement of mediaElements) {
      if (!this.processedElements.has(mediaElement)) {
        await this.analyzeAndMarkElement(mediaElement);
        this.processedElements.add(mediaElement);
      }
    }
  }

  async processExistingContent() {
    const mediaElements = document.querySelectorAll('img, video, canvas');
    
    for (const element of mediaElements) {
      if (!this.processedElements.has(element)) {
        await this.analyzeAndMarkElement(element);
        this.processedElements.add(element);
      }
    }
  }

  async analyzeAndMarkElement(element) {
    try {
      // Only analyze images for now (can extend to videos)
      if (element.tagName.toLowerCase() === 'img' && element.complete) {
        const analysis = await window.nsfwAnalyzer.analyzeImage(element);
        
        if (analysis.isNSFW) {
          element.classList.add('nsfw-content');
          element.dataset.nsfwConfidence = analysis.confidence.toFixed(2);
          element.dataset.nsfwReason = analysis.reasons ? analysis.reasons.join('; ') : 'NSFW content detected';
          
          // Simple console log for NSFW detections
          console.log(`NSFW content detected and blurred - ${(analysis.confidence * 100).toFixed(1)}% confidence`, element.src?.substring(0, 80));
        }
      }
    } catch (error) {
      // Silent error handling - no logging unless it's critical
    }
  }
}

// Initialize content observer and make it globally accessible
const nsfwObserver = new NSFWContentObserver();
window.nsfwObserver = nsfwObserver;

// Start observing when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => nsfwObserver.start());
} else {
  nsfwObserver.start();
}

} // End of conditional block to prevent redeclaration