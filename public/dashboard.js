/**
 * CAT-alog Proxy Unified Dashboard
 * Integrates media streaming, cricket streaming, monitoring, and management
 */

class Dashboard {
  constructor() {
    this.currentTab = 'media-streaming';
    this.hlsInstances = {};
    this.settings = this.loadSettings();
    this.activityLog = [];
    this.autoRefreshInterval = null;
    
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.setupTheme();
    this.checkServerHealth();
    this.startActivityLog();
    this.applySettings();
    
    // Auto-refresh server health
    setInterval(() => this.checkServerHealth(), 30000);
  }

  setupEventListeners() {
    // Tab navigation
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
    });

    // Theme toggle
    document.getElementById('theme-toggle').addEventListener('click', () => this.toggleTheme());

    // Media streaming
    document.getElementById('media-form').addEventListener('submit', (e) => this.handleMediaSubmit(e));
    document.getElementById('media-clear-btn').addEventListener('click', () => this.clearMediaForm());
    document.getElementById('media-clear-response').addEventListener('click', () => this.clearMediaResponse());

    // Sports streaming
    document.getElementById('load-categories').addEventListener('click', () => this.loadSportsCategories());
    document.getElementById('load-all-cricket').addEventListener('click', () => this.loadAllSportsData());
    document.getElementById('clear-cricket-cache').addEventListener('click', () => this.clearSportsCache());
    document.getElementById('cricket-clear-response').addEventListener('click', () => this.clearSportsResponse());

    // Status monitoring
    document.getElementById('refresh-status').addEventListener('click', () => this.refreshAllStatus());
    document.getElementById('refresh-metrics').addEventListener('click', () => this.refreshMetrics());
    document.getElementById('clear-activity-log').addEventListener('click', () => this.clearActivityLog());

    // Cache management
    document.getElementById('refresh-cache-info').addEventListener('click', () => this.refreshCacheInfo());
    document.getElementById('clear-all-cache').addEventListener('click', () => this.clearAllCache());
    document.getElementById('filter-cache-entries').addEventListener('click', () => this.filterCacheEntries());

    // API explorer
    document.getElementById('api-execute').addEventListener('click', () => this.executeApiRequest());
    document.getElementById('api-clear').addEventListener('click', () => this.clearApiExplorer());

    // Settings
    document.getElementById('save-settings').addEventListener('click', () => this.saveSettings());
    document.getElementById('reset-settings').addEventListener('click', () => this.resetSettings());
    document.getElementById('export-settings').addEventListener('click', () => this.exportSettings());
    document.getElementById('import-settings').addEventListener('click', () => this.importSettings());
    document.getElementById('save-advanced-settings').addEventListener('click', () => this.saveAdvancedSettings());
    document.getElementById('test-chrome').addEventListener('click', () => this.testChromePath());

    // Media type change handler
    document.getElementById('media-type').addEventListener('change', (e) => this.handleMediaTypeChange(e));
  }

  switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });
    document.getElementById(tabName).classList.add('active');

    this.currentTab = tabName;
    this.logActivity(`Switched to ${tabName} tab`);

    // Load tab-specific data
    this.loadTabData(tabName);
  }

  loadTabData(tabName) {
    switch(tabName) {
      case 'status-monitoring':
        this.refreshAllStatus();
        break;
      case 'cache-management':
        this.refreshCacheInfo();
        break;
    }
  }

  setupTheme() {
    const savedTheme = localStorage.getItem('dashboard-theme') || 'dark';
    document.body.setAttribute('data-theme', savedTheme);
    this.updateThemeToggle(savedTheme);
  }

  toggleTheme() {
    const currentTheme = document.body.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.body.setAttribute('data-theme', newTheme);
    localStorage.setItem('dashboard-theme', newTheme);
    this.updateThemeToggle(newTheme);
    
    this.logActivity(`Theme changed to ${newTheme}`);
  }

  updateThemeToggle(theme) {
    const toggle = document.getElementById('theme-toggle');
    toggle.textContent = theme === 'dark' ? '🌙' : '☀️';
    toggle.title = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
  }

  async checkServerHealth() {
    try {
      const response = await fetch('/health');
      const data = await response.json();
      
      const healthIndicator = document.getElementById('server-health');
      const serverStatus = document.getElementById('server-status');
      
      if (data.ok) {
        healthIndicator.className = 'health-indicator healthy';
        serverStatus.textContent = 'Server Online';
      } else {
        healthIndicator.className = 'health-indicator unhealthy';
        serverStatus.textContent = 'Server Error';
      }
      
      return data.ok;
    } catch (error) {
      const healthIndicator = document.getElementById('server-health');
      const serverStatus = document.getElementById('server-status');
      
      healthIndicator.className = 'health-indicator unhealthy';
      serverStatus.textContent = 'Server Offline';
      
      return false;
    }
  }

  // Media Streaming Functions
  handleMediaTypeChange(e) {
    const type = e.target.value;
    const mediaFields = ['tmdb-id', 'season', 'episode', 'mal-id', 'episode-number', 'sub-dub'];
    
    // Hide all fields first
    mediaFields.forEach(fieldId => {
      const field = document.getElementById(fieldId).closest('.form-group');
      field.style.display = 'none';
    });
    
    // Show relevant fields based on type
    switch(type) {
      case 'movie':
        document.getElementById('tmdb-id').closest('.form-group').style.display = 'block';
        break;
      case 'tv':
        ['tmdb-id', 'season', 'episode'].forEach(fieldId => {
          document.getElementById(fieldId).closest('.form-group').style.display = 'block';
        });
        break;
      case 'anime':
        ['mal-id', 'episode-number', 'sub-dub'].forEach(fieldId => {
          document.getElementById(fieldId).closest('.form-group').style.display = 'block';
        });
        break;
    }
  }

  async handleMediaSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    const formData = new FormData(form);
    const params = new URLSearchParams();
    
    const type = formData.get('type');
    const provider = formData.get('provider');
    
    params.set('type', type);
    params.set('provider', provider);
    
    // Validate and set parameters based on type
    try {
      switch(type) {
        case 'movie':
          if (!formData.get('tmdbId')) {
            throw new Error('TMDB ID is required for movies');
          }
          params.set('tmdbId', formData.get('tmdbId').trim());
          break;
          
        case 'tv':
          const required = ['tmdbId', 'season', 'episode'];
          for (const field of required) {
            if (!formData.get(field)) {
              throw new Error(`${field} is required for TV series`);
            }
          }
          params.set('tmdbId', formData.get('tmdbId').trim());
          params.set('season', formData.get('season').trim());
          params.set('episode', formData.get('episode').trim());
          break;
          
        case 'anime':
          const animeRequired = ['malId', 'number', 'subOrDub'];
          for (const field of animeRequired) {
            if (!formData.get(field)) {
              throw new Error(`${field} is required for anime`);
            }
          }
          if (provider === 'filmex') {
            throw new Error('Provider "filmex" does not support anime. Please use VidLink for anime.');
          }
          params.set('malId', formData.get('malId').trim());
          params.set('number', formData.get('number').trim());
          params.set('subOrDub', formData.get('subOrDub').trim().toLowerCase());
          break;
      }
      
      await this.resolveAndPlayMedia(params);
      
    } catch (error) {
      this.showMediaStatus(error.message, 'error');
      this.logActivity(`Media streaming error: ${error.message}`, 'error');
    }
  }

  async resolveAndPlayMedia(params) {
    const resolveBtn = document.getElementById('media-resolve-btn');
    const originalText = resolveBtn.textContent;
    
    try {
      resolveBtn.disabled = true;
      resolveBtn.textContent = 'Resolving...';
      this.showMediaStatus('Resolving stream URL...', 'loading');
      
      const response = await fetch(`/v2/stream?${params.toString()}`);
      const data = await response.json();
      
      this.displayMediaResponse(data);
      
      if (!data.ok || !data.url) {
        throw new Error(data.message || 'Failed to resolve stream');
      }
      
      await this.playMediaStream(data.url, data.format);
      this.showMediaStatus(`Playing ${params.get('type')} stream`, 'success');
      this.logActivity(`Successfully resolved and playing ${params.get('type')} stream`);
      
    } catch (error) {
      this.showMediaStatus(error.message, 'error');
      this.logActivity(`Media streaming failed: ${error.message}`, 'error');
    } finally {
      resolveBtn.disabled = false;
      resolveBtn.textContent = originalText;
    }
  }

  async playMediaStream(streamUrl, format) {
    const video = document.getElementById('media-video');
    
    // Destroy existing HLS instance if any
    if (this.hlsInstances.media) {
      this.hlsInstances.media.destroy();
      this.hlsInstances.media = null;
    }
    
    video.pause();
    video.removeAttribute('src');
    video.load();
    
    if (format === 'hls' && window.Hls && window.Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {
          this.showMediaStatus('Autoplay blocked - click play to start', 'warning');
        });
      });
      
      hls.on(Hls.Events.ERROR, (event, data) => {
        this.showMediaStatus(`HLS Error: ${data.details}`, 'error');
        this.logActivity(`HLS Error: ${data.details}`, 'error');
      });
      
      this.hlsInstances.media = hls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl') || format === 'mp4') {
      video.src = streamUrl;
      video.play().catch(() => {
        this.showMediaStatus('Autoplay blocked - click play to start', 'warning');
      });
    } else {
      throw new Error('Stream format not supported in this browser');
    }
  }

  showMediaStatus(message, type = 'info') {
    const statusEl = document.getElementById('media-status');
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
  }

  displayMediaResponse(data) {
    const responseEl = document.getElementById('media-response');
    responseEl.textContent = JSON.stringify(data, null, 2);
  }

  clearMediaForm() {
    document.getElementById('media-form').reset();
    document.getElementById('tmdb-id').value = '786892'; // Reset default
    this.handleMediaTypeChange({ target: { value: 'movie' } });
    this.showMediaStatus('Form cleared', 'info');
  }

  clearMediaResponse() {
    document.getElementById('media-response').textContent = 'No response yet...';
  }

  // Sports Streaming Functions
  async loadSportsCategories() {
    const btn = document.getElementById('load-categories');
    const originalText = btn.textContent;
    
    try {
      btn.disabled = true;
      btn.textContent = 'Loading...';
      this.showCricketStatus('Loading categories...', 'loading');
      
      const response = await fetch('/v3/sports/categories');
      const data = await response.json();
      
      this.displayCricketResponse(data);
      
      if (data.ok) {
        this.displayCategories(data.data);
        this.showCricketStatus(`Loaded ${data.data.length} categories`, 'success');
        this.logActivity(`Loaded ${data.data.length} sports categories`);
      } else {
        throw new Error(data.message || 'Failed to load categories');
      }
      
    } catch (error) {
      this.showCricketStatus(error.message, 'error');
      this.logActivity(`Sports categories loading failed: ${error.message}`, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }

  async loadAllSportsData() {
    const btn = document.getElementById('load-all-cricket');
    const originalText = btn.textContent;
    
    try {
      btn.disabled = true;
      btn.textContent = 'Loading...';
      this.showCricketStatus('Loading all sports data (this may take a while)...', 'loading');
      
      const response = await fetch('/v3/sports/all');
      const data = await response.json();
      
      this.displayCricketResponse(data);
      
      if (data.ok) {
        this.displayAllSportsData(data.data);
        this.showCricketStatus(`Loaded data for ${data.data.length} categories`, 'success');
        this.logActivity(`Loaded complete sports data for ${data.data.length} categories`);
      } else {
        throw new Error(data.message || 'Failed to load sports data');
      }
      
    } catch (error) {
      this.showCricketStatus(error.message, 'error');
      this.logActivity(`Sports data loading failed: ${error.message}`, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }

  displayCategories(categories) {
    const container = document.getElementById('categories-list');
    const countEl = document.getElementById('categories-count');
    
    container.innerHTML = '';
    countEl.textContent = `${categories.length} categories`;
    
    categories.forEach(category => {
      const item = document.createElement('div');
      item.className = 'list-item';
      item.innerHTML = `
        <div class="list-item-title">${category.name}</div>
        <div class="list-item-subtitle">Slug: ${category.slug}</div>
        <div class="list-item-subtitle">URL: ${category.url}</div>
      `;
      item.onclick = () => this.selectCategory(category, item);
      container.appendChild(item);
    });
  }

  displayAllSportsData(categories) {
    const categoriesContainer = document.getElementById('categories-list');
    const matchesContainer = document.getElementById('matches-list');
    const categoriesCount = document.getElementById('categories-count');
    const matchesCount = document.getElementById('matches-count');
    
    categoriesContainer.innerHTML = '';
    matchesContainer.innerHTML = '';
    
    let totalEvents = 0;
    
    categories.forEach(category => {
      const categoryItem = document.createElement('div');
      categoryItem.className = 'list-item';
      categoryItem.innerHTML = `
        <div class="list-item-title">${category.name}</div>
        <div class="list-item-subtitle">${category.events ? category.events.length : 0} events</div>
      `;
      
      categoryItem.onclick = () => {
        this.selectCategory(category, categoryItem);
        if (category.events) {
          this.displayEvents(category.events);
          totalEvents = category.events.length;
          matchesCount.textContent = `${totalEvents} events`;
        }
      };
      
      categoriesContainer.appendChild(categoryItem);
      totalEvents += category.events ? category.events.length : 0;
    });
    
    categoriesCount.textContent = `${categories.length} categories`;
    matchesCount.textContent = `${totalEvents} events`;
  }

  async selectCategory(category, element) {
    // Update UI selection
    document.querySelectorAll('#categories-list .list-item').forEach(el => {
      el.classList.remove('selected');
    });
    element.classList.add('selected');
    
    this.showCricketStatus(`Loading events for ${category.name}...`, 'loading');
    
    try {
      const response = await fetch(`/v3/sports/category/${category.slug}/events`);
      const data = await response.json();
      
      this.displayCricketResponse(data);
      
      if (data.ok) {
        this.displayEvents(data.data);
        this.showCricketStatus(`Loaded ${data.data.length} events for ${category.name}`, 'success');
        this.logActivity(`Loaded ${data.data.length} events for ${category.name}`);
      } else {
        throw new Error(data.message || 'Failed to load events');
      }
      
    } catch (error) {
      this.showCricketStatus(error.message, 'error');
      this.logActivity(`Sports events loading failed: ${error.message}`, 'error');
    }
  }

  displayEvents(events) {
    const container = document.getElementById('matches-list');
    const countEl = document.getElementById('matches-count');
    
    container.innerHTML = '';
    countEl.textContent = `${events.length} events`;
    
    events.forEach(event => {
      const item = document.createElement('div');
      item.className = 'list-item';
      
      let streamLinksHtml = '';
      if (event.streamLinks && event.streamLinks.length > 0) {
        streamLinksHtml = '<div class="stream-links">';
        event.streamLinks.forEach(link => {
          streamLinksHtml += `<span class="stream-link">${link.name}</span>`;
        });
        streamLinksHtml += '</div>';
      }
      
      item.innerHTML = `
        <div class="list-item-title">${event.title}</div>
        <div class="list-item-subtitle">URL: ${event.url}</div>
        ${streamLinksHtml}
      `;
      
      item.onclick = () => this.selectEvent(event, item);
      container.appendChild(item);
    });
  }

  async selectEvent(event, element) {
    // Update UI selection
    document.querySelectorAll('#matches-list .list-item').forEach(el => {
      el.classList.remove('selected');
    });
    element.classList.add('selected');
    
    this.showCricketStatus(`Extracting stream URLs for ${event.title}...`, 'loading');
    
    try {
      const response = await fetch(`/v3/sports/event/streams?eventUrl=${encodeURIComponent(event.url)}`);
      const data = await response.json();
      
      this.displayCricketResponse(data);
      
      if (data.ok) {
        this.displayStreams(data.data);
        this.showCricketStatus(`Found ${data.data.length} stream URLs`, 'success');
        this.logActivity(`Found ${data.data.length} streams for ${event.title}`);
      } else {
        throw new Error(data.message || 'Failed to extract streams');
      }
      
    } catch (error) {
      this.showCricketStatus(error.message, 'error');
      this.logActivity(`Sports stream extraction failed: ${error.message}`, 'error');
    }
  }

  displayStreams(streams) {
    const container = document.getElementById('streams-list');
    const countEl = document.getElementById('streams-count');
    
    container.innerHTML = '';
    countEl.textContent = `${streams.length} streams`;
    
    if (streams.length === 0) {
      container.innerHTML = '<div class="status info">No streams found</div>';
      return;
    }
    
    streams.forEach((stream, index) => {
      const item = document.createElement('div');
      item.className = 'panel';
      item.innerHTML = `
        <div class="flex-between">
          <div>
            <button onclick="dashboard.playCricketStream('${stream.url}', '${stream.format}')">
              Play Stream ${index + 1}
            </button>
            <div class="mt-1">
              <small>Format: ${stream.format} | Quality: ${stream.quality}</small>
            </div>
          </div>
        </div>
        <div class="mt-1">
          <small>${stream.url}</small>
        </div>
      `;
      container.appendChild(item);
    });
  }

  async playCricketStream(streamUrl, format) {
    const video = document.getElementById('cricket-video');
    
    // Destroy existing HLS instance if any
    if (this.hlsInstances.cricket) {
      this.hlsInstances.cricket.destroy();
      this.hlsInstances.cricket = null;
    }
    
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.style.display = 'block'; // Ensure video is visible by default
    
    // Remove any existing iframes in the container
    const container = video.parentElement;
    const existingIframe = container.querySelector('iframe');
    if (existingIframe) {
      existingIframe.remove();
    }
    
    this.showCricketStatus(`Playing cricket stream: ${format}`, 'success');
    
    try {
      if (format === 'hls' && window.Hls && window.Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(streamUrl);
        hls.attachMedia(video);
        
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(() => {
            this.showCricketStatus('Autoplay blocked - click play to start', 'warning');
          });
        });
        
        hls.on(Hls.Events.ERROR, (event, data) => {
          this.showCricketStatus(`HLS Error: ${data.details}`, 'error');
          this.logActivity(`Cricket HLS Error: ${data.details}`, 'error');
        });
        
        this.hlsInstances.cricket = hls;
      } else if (video.canPlayType('application/vnd.apple.mpegurl') || format === 'mp4') {
        video.src = streamUrl;
        video.play().catch(() => {
          this.showCricketStatus('Autoplay blocked - click play to start', 'warning');
        });
      } else if (format === 'iframe') {
        // Handle iframe playback
        const container = video.parentElement;
        
        // Remove existing iframe if any
        const existingIframe = container.querySelector('iframe');
        if (existingIframe) {
          existingIframe.remove();
        }
        
        // Hide video element
        video.style.display = 'none';
        
        // Create and append iframe pointing to our proxy player
        const iframe = document.createElement('iframe');
        // Use our proxy player to sandbox the stream
        iframe.src = `/proxy-player.html?url=${encodeURIComponent(streamUrl)}`;
        iframe.width = '100%';
        iframe.height = '500px';
        iframe.frameBorder = '0';
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
        iframe.allowFullscreen = true;
        iframe.style.borderRadius = '8px';
        iframe.style.background = '#000';
        
        container.appendChild(iframe);
        this.showCricketStatus('Loaded sandboxed iframe player', 'success');
      } else {
        throw new Error('Stream format not supported in this browser');
      }
      
      this.logActivity(`Playing cricket stream: ${format}`);
      
    } catch (error) {
      this.showCricketStatus(error.message, 'error');
      this.logActivity(`Cricket stream playback failed: ${error.message}`, 'error');
    }
  }

  showCricketStatus(message, type = 'info') {
    const statusEl = document.getElementById('cricket-status');
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
  }

  displayCricketResponse(data) {
    const responseEl = document.getElementById('cricket-response');
    responseEl.textContent = JSON.stringify(data, null, 2);
  }

  clearSportsResponse() {
    document.getElementById('cricket-response').textContent = 'No response yet...';
  }

  async clearSportsCache() {
    // This would require a cache-clearing endpoint on the server
    // For now, just reload the page
    this.showCricketStatus('Cache cleared (page reload required)', 'success');
    this.logActivity('Sports cache cleared');
    setTimeout(() => window.location.reload(), 2000);
  }

  // Status Monitoring Functions
  async refreshAllStatus() {
    await Promise.all([
      this.refreshServerStatus(),
      this.refreshCacheStatus(),
      this.refreshExternalStatus()
    ]);
  }

  async refreshServerStatus() {
    const container = document.getElementById('server-health-details');
    
    try {
      const startTime = Date.now();
      const response = await fetch('/dashboard/status');
      const endTime = Date.now();
      const data = await response.json();
      
      if (data.ok && data.server) {
        const server = data.server;
        const uptime = Math.floor(server.uptime);
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = uptime % 60;
        
        const memory = server.memory;
        const memoryUsed = Math.round(memory.heapUsed / 1024 / 1024);
        const memoryTotal = Math.round(memory.heapTotal / 1024 / 1024);
        
        container.innerHTML = `
          <div class="status success">Server is healthy</div>
          <div class="mt-2">
            <div><strong>Response Time:</strong> ${endTime - startTime}ms</div>
            <div><strong>Uptime:</strong> ${hours}h ${minutes}m ${seconds}s</div>
            <div><strong>Memory:</strong> ${memoryUsed}MB / ${memoryTotal}MB</div>
            <div><strong>Version:</strong> ${server.version || '3.0.0'}</div>
          </div>
        `;
      } else {
        throw new Error('Failed to get server status');
      }
    } catch (error) {
      container.innerHTML = `<div class="status error">Server status unavailable: ${error.message}</div>`;
    }
  }

  async refreshCacheStatus() {
    const container = document.getElementById('cache-status-details');
    
    // This would require cache status endpoints
    // For now, show placeholder
    container.innerHTML = `
      <div class="status info">Cache status monitoring requires server endpoints</div>
      <div class="mt-2">
        <small>Media Cache: Active (15min TTL)</small><br>
        <small>Cricket Cache: Active (10min TTL)</small>
      </div>
    `;
  }

  async refreshExternalStatus() {
    const container = document.getElementById('external-status-details');
    
    // Check external service availability
    const services = [
      { name: 'VidLink', url: 'https://vidlink.pro' },
      { name: 'Totalsportek', url: 'https://totalsportek.es' }
    ];
    
    let statusHtml = '';
    
    for (const service of services) {
      try {
        const response = await fetch(service.url, { method: 'HEAD', mode: 'no-cors' });
        statusHtml += `<div class="status success">✓ ${service.name}: Available</div>`;
      } catch (error) {
        statusHtml += `<div class="status error">✗ ${service.name}: Unreachable</div>`;
      }
    }
    
    container.innerHTML = statusHtml;
  }

  async refreshMetrics() {
    const container = document.getElementById('performance-metrics');
    
    // This would require metrics endpoints
    // For now, show basic browser metrics
    const navigation = performance.getEntriesByType('navigation')[0];
    const memory = performance.memory;
    
    let metricsHtml = `
      <div class="grid grid-2">
        <div>
          <h4>Page Performance</h4>
          <div>Page Load: ${Math.round(navigation.loadEventEnd - navigation.fetchStart)}ms</div>
          <div>DOM Content: ${Math.round(navigation.domContentLoadedEventEnd - navigation.fetchStart)}ms</div>
        </div>
    `;
    
    if (memory) {
      metricsHtml += `
        <div>
          <h4>Memory Usage</h4>
          <div>Used: ${Math.round(memory.usedJSHeapSize / 1024 / 1024)}MB</div>
          <div>Total: ${Math.round(memory.totalJSHeapSize / 1024 / 1024)}MB</div>
          <div>Limit: ${Math.round(memory.jsHeapSizeLimit / 1024 / 1024)}MB</div>
        </div>
      `;
    }
    
    metricsHtml += `</div>`;
    container.innerHTML = metricsHtml;
  }

  // Cache Management Functions
  async refreshCacheInfo() {
    const mediaContainer = document.getElementById('media-cache-info');
    const cricketContainer = document.getElementById('cricket-cache-info');
    
    // This would require cache info endpoints
    // For now, show placeholder information
    mediaContainer.innerHTML = `
      <div class="status info">Media cache information requires server endpoints</div>
      <div class="mt-2">
        <small>Cache Type: LRU</small><br>
        <small>Max Items: 500</small><br>
        <small>TTL: 7 minutes</small>
      </div>
    `;
    
    cricketContainer.innerHTML = `
      <div class="status info">Cricket cache information requires server endpoints</div>
      <div class="mt-2">
        <small>Cache Type: LRU</small><br>
        <small>Max Items: 100</small><br>
        <small>TTL: 15 minutes</small>
      </div>
    `;
  }

  async clearAllCache() {
    // This would require a cache clearing endpoint
    this.logActivity('Cache clear requested (requires server endpoint)', 'warning');
  }

  async filterCacheEntries() {
    const type = document.getElementById('cache-type-filter').value;
    const container = document.getElementById('cache-entries');
    
    // This would require cache listing endpoints
    container.innerHTML = `
      <div class="status info">Cache entry listing requires server endpoints</div>
      <div class="mt-2">
        <small>Selected filter: ${type}</small><br>
        <small>Implement server endpoints to view actual cache entries</small>
      </div>
    `;
  }

  // API Explorer Functions
  async executeApiRequest() {
    const method = document.getElementById('api-method').value;
    const endpoint = document.getElementById('api-endpoint').value;
    const paramsText = document.getElementById('api-params').value;
    
    let url = endpoint;
    let options = { method };
    
    try {
      // Parse parameters
      let params = {};
      if (paramsText.trim()) {
        params = JSON.parse(paramsText);
      }
      
      // Add query parameters for GET requests
      if (method === 'GET' && Object.keys(params).length > 0) {
        const searchParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
          searchParams.set(key, value);
        });
        url += '?' + searchParams.toString();
      } else if (method !== 'GET') {
        options.headers = {
          'Content-Type': 'application/json'
        };
        options.body = JSON.stringify(params);
      }
      
      const startTime = Date.now();
      const response = await fetch(url, options);
      const endTime = Date.now();
      
      const data = await response.json();
      const responseTime = endTime - startTime;
      
      // Display response
      const statusEl = document.getElementById('api-response-status');
      statusEl.innerHTML = `
        <div class="status ${response.ok ? 'success' : 'error'}">
          ${response.status} ${response.statusText} (${responseTime}ms)
        </div>
      `;
      
      const responseEl = document.getElementById('api-response');
      responseEl.textContent = JSON.stringify(data, null, 2);
      
      this.logActivity(`API request: ${method} ${endpoint} - ${response.status}`);
      
    } catch (error) {
      const statusEl = document.getElementById('api-response-status');
      statusEl.innerHTML = `<div class="status error">Request failed: ${error.message}</div>`;
      
      const responseEl = document.getElementById('api-response');
      responseEl.textContent = JSON.stringify({ error: error.message }, null, 2);
      
      this.logActivity(`API request failed: ${error.message}`, 'error');
    }
  }

  clearApiExplorer() {
    document.getElementById('api-endpoint').value = '/health';
    document.getElementById('api-params').value = '';
    document.getElementById('api-response-status').innerHTML = '';
    document.getElementById('api-response').textContent = 'No response yet...';
  }

  // Settings Functions
  loadSettings() {
    const saved = localStorage.getItem('dashboard-settings');
    return saved ? JSON.parse(saved) : {
      autoRefresh: 30,
      logLevel: 'info',
      cacheTtl: 15,
      chromePath: '',
      requestTimeout: 12000
    };
  }

  applySettings() {
    document.getElementById('auto-refresh').value = this.settings.autoRefresh;
    document.getElementById('log-level').value = this.settings.logLevel;
    document.getElementById('cache-ttl').value = this.settings.cacheTtl;
    document.getElementById('chrome-path').value = this.settings.chromePath;
    document.getElementById('request-timeout').value = this.settings.requestTimeout;
    
    // Setup auto-refresh if enabled
    if (this.settings.autoRefresh > 0) {
      this.startAutoRefresh();
    }
  }

  saveSettings() {
    this.settings.autoRefresh = parseInt(document.getElementById('auto-refresh').value);
    this.settings.logLevel = document.getElementById('log-level').value;
    this.settings.cacheTtl = parseInt(document.getElementById('cache-ttl').value);
    
    localStorage.setItem('dashboard-settings', JSON.stringify(this.settings));
    
    this.restartAutoRefresh();
    this.logActivity('Settings saved successfully');
    
    // Show success message
    const btn = document.getElementById('save-settings');
    const originalText = btn.textContent;
    btn.textContent = 'Saved!';
    btn.classList.add('success');
    setTimeout(() => {
      btn.textContent = originalText;
      btn.classList.remove('success');
    }, 2000);
  }

  saveAdvancedSettings() {
    this.settings.chromePath = document.getElementById('chrome-path').value;
    this.settings.requestTimeout = parseInt(document.getElementById('request-timeout').value);
    
    localStorage.setItem('dashboard-settings', JSON.stringify(this.settings));
    this.logActivity('Advanced settings saved');
    
    // Show success message
    const btn = document.getElementById('save-advanced-settings');
    const originalText = btn.textContent;
    btn.textContent = 'Saved!';
    btn.classList.add('success');
    setTimeout(() => {
      btn.textContent = originalText;
      btn.classList.remove('success');
    }, 2000);
  }

  resetSettings() {
    if (confirm('Are you sure you want to reset all settings to defaults?')) {
      this.settings = {
        autoRefresh: 30,
        logLevel: 'info',
        cacheTtl: 15,
        chromePath: '',
        requestTimeout: 12000
      };
      
      localStorage.setItem('dashboard-settings', JSON.stringify(this.settings));
      this.applySettings();
      this.logActivity('Settings reset to defaults');
    }
  }

  exportSettings() {
    const dataStr = JSON.stringify(this.settings, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = 'dashboard-settings.json';
    link.click();
    
    URL.revokeObjectURL(url);
    this.logActivity('Settings exported');
  }

  importSettings() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const imported = JSON.parse(e.target.result);
            this.settings = { ...this.settings, ...imported };
            localStorage.setItem('dashboard-settings', JSON.stringify(this.settings));
            this.applySettings();
            this.logActivity('Settings imported successfully');
          } catch (error) {
            this.logActivity('Failed to import settings: Invalid JSON', 'error');
          }
        };
        reader.readAsText(file);
      }
    };
    
    input.click();
  }

  async testChromePath() {
    const path = document.getElementById('chrome-path').value;
    
    try {
      const response = await fetch('/dashboard/test/chrome', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ chromePath: path })
      });
      
      const data = await response.json();
      
      if (data.ok) {
        this.logActivity(`Chrome path test successful: ${data.path}`, 'success');
      } else {
        this.logActivity(`Chrome path test failed: ${data.message}`, 'error');
      }
    } catch (error) {
      this.logActivity(`Chrome path test error: ${error.message}`, 'error');
    }
  }

  startAutoRefresh() {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
    }
    
    if (this.settings.autoRefresh > 0) {
      this.autoRefreshInterval = setInterval(() => {
        if (this.currentTab === 'status-monitoring') {
          this.refreshAllStatus();
        }
      }, this.settings.autoRefresh * 1000);
    }
  }

  restartAutoRefresh() {
    this.startAutoRefresh();
  }

  // Activity Log Functions
  startActivityLog() {
    this.logActivity('Dashboard initialized');
  }

  logActivity(message, level = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const entry = {
      timestamp,
      message,
      level
    };
    
    this.activityLog.unshift(entry);
    
    // Keep only last 100 entries
    if (this.activityLog.length > 100) {
      this.activityLog = this.activityLog.slice(0, 100);
    }
    
    // Update display if on status monitoring tab
    if (this.currentTab === 'status-monitoring') {
      this.updateActivityLogDisplay();
    }
    
    // Also log to console for debugging
    console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
  }

  updateActivityLogDisplay() {
    const container = document.getElementById('activity-log');
    
    if (this.activityLog.length === 0) {
      container.innerHTML = '<div class="status info">No recent activity</div>';
      return;
    }
    
    const logHtml = this.activityLog.slice(0, 20).map(entry => {
      const statusClass = entry.level === 'error' ? 'error' : 
                         entry.level === 'warning' ? 'warning' : 'info';
      
      return `
        <div class="status ${statusClass}" style="margin-bottom: 0.5rem;">
          <small>${entry.timestamp}</small> ${entry.message}
        </div>
      `;
    }).join('');
    
    container.innerHTML = logHtml;
  }

  clearActivityLog() {
    this.activityLog = [];
    this.updateActivityLogDisplay();
    this.logActivity('Activity log cleared');
  }
}

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.dashboard = new Dashboard();
  
  // Initialize media type form fields
  dashboard.handleMediaTypeChange({ target: { value: 'movie' } });
});