# CAT-alog Proxy - Unified Dashboard

A comprehensive, feature-rich dashboard that combines media streaming, cricket streaming, monitoring, and management capabilities into a single unified interface.

## 🚀 Features

### 📺 Media Streaming
- **Multi-provider support**: VidLink and Filmex (fmovies4u)
- **Content types**: Movies, TV Series, and Anime
- **Smart form validation**: Dynamic form fields based on content type
- **Integrated video player**: HLS.js support with fallback to native HTML5
- **Real-time stream resolution**: Direct integration with CAT-alog proxy endpoints
- **API response viewer**: Detailed JSON responses for debugging

### 🏏 Cricket Streaming
- **Category browsing**: Browse cricket categories from cricwatch.io
- **Match discovery**: View matches within each category
- **Stream extraction**: Extract multiple stream URLs per match
- **Integrated player**: Same video player as media streaming
- **Bulk data loading**: Load all cricket data at once
- **Cache management**: Optimized caching for cricket data

### 📊 Status Monitoring
- **Server health**: Real-time server status and uptime
- **Memory usage**: Monitor server memory consumption
- **Cache status**: Track cache usage and performance
- **External service checks**: Verify availability of external services
- **Performance metrics**: Browser and server performance data
- **Activity logging**: Real-time activity log with filtering

### 💾 Cache Management
- **Dual cache system**: Separate caches for media and cricket data
- **Cache statistics**: Size, usage, and TTL information
- **Entry inspection**: View individual cache entries
- **Bulk operations**: Clear all or specific cache types
- **Performance monitoring**: Cache hit/miss tracking

### 🔧 API Explorer
- **HTTP method support**: GET, POST, PUT, DELETE
- **Parameter builder**: JSON-based parameter input
- **Response analysis**: Status codes, timing, and detailed responses
- **Request history**: Track API calls for debugging
- **Error handling**: Comprehensive error reporting

### ⚙️ Settings & Configuration
- **Dashboard preferences**: Auto-refresh intervals, log levels
- **Advanced settings**: Chrome path, request timeouts
- **Theme support**: Dark/light theme toggle with persistence
- **Import/Export**: Backup and restore dashboard settings
- **Configuration validation**: Test settings before applying

## 🛠️ Technical Architecture

### Frontend Components
- **Modular JavaScript**: Class-based architecture with clear separation of concerns
- **Responsive Design**: Mobile-first CSS Grid and Flexbox layouts
- **Theme System**: CSS custom properties for dynamic theming
- **Component Reuse**: Shared UI components across all tabs
- **Error Handling**: Comprehensive error catching and user feedback

### Backend Integration
- **RESTful API**: Clean endpoint structure with consistent responses
- **Caching Layer**: LRU cache with configurable TTL
- **Health Monitoring**: Built-in health checks and metrics
- **Error Recovery**: Graceful degradation and retry mechanisms
- **Security**: Input validation and sanitization

### Performance Optimizations
- **Lazy Loading**: Load data only when needed
- **Debounced Requests**: Prevent excessive API calls
- **Memory Management**: Proper cleanup of video players and event listeners
- **Caching Strategy**: Intelligent caching with expiration
- **Network Optimization**: Request interception and resource blocking

## 📁 File Structure

```
public/
├── dashboard.html          # Main dashboard HTML (717 lines)
├── dashboard.js           # Dashboard JavaScript (1024 lines)
├── cricket-test.html       # Legacy cricket interface
└── test-player.html        # Legacy media player interface

src/
├── server.js              # Enhanced server with dashboard endpoints
├── cricwatch-scraper.js   # Cricket data scraping logic
└── debug-*.js            # Debug utilities

DASHBOARD_README.md         # This documentation
```

## 🚀 Getting Started

### Prerequisites
- Node.js 14+ 
- Chrome/Chromium browser for Puppeteer
- Internet connection for external services

### Installation
```bash
# Install dependencies
npm install

# Start the server
npm start
```

### Access
- **Dashboard**: http://localhost:4000/dashboard.html
- **Legacy Interfaces**: 
  - http://localhost:4000/test-player.html
  - http://localhost:4000/cricket-test.html
- **API Endpoints**: http://localhost:4000/health

## 📚 API Endpoints

### Media Streaming
- `GET /stream` - Legacy media streaming endpoint
- `GET /v2/stream` - Enhanced media streaming with provider support

### Cricket Streaming
- `GET /v3/cricket/categories` - Get cricket categories
- `GET /v3/cricket/category/:slug/matches` - Get matches for category
- `GET /v3/cricket/match/streams` - Extract stream URLs from match
- `GET /v3/cricket/all` - Get complete cricket data

### Dashboard Management
- `GET /health` - Basic health check
- `GET /dashboard/status` - Comprehensive server status
- `DELETE /dashboard/cache` - Clear cache (supports ?type=media|cricket|all)
- `GET /dashboard/cache/entries` - List cache entries (supports ?type filter)
- `POST /dashboard/test/chrome` - Test Chrome executable path

## 🎯 Usage Examples

### Media Streaming
1. Navigate to **Media Streaming** tab
2. Select content type (Movie/TV/Anime)
3. Choose provider (VidLink/Filmex)
4. Enter required IDs (TMDB ID for movies/TV, MAL ID for anime)
5. Click **Resolve & Play**

### Cricket Streaming
1. Navigate to **Cricket Streaming** tab
2. Click **Load Categories** to browse available categories
3. Select a category to view matches
4. Choose a match to extract stream URLs
5. Click **Play Stream** on available streams

### Status Monitoring
1. Navigate to **Status Monitoring** tab
2. View real-time server health and cache status
3. Check external service availability
4. Monitor performance metrics
5. Review activity log

### Cache Management
1. Navigate to **Cache Management** tab
2. View cache statistics for media and cricket data
3. Filter cache entries by type
4. Clear cache as needed

### API Explorer
1. Navigate to **API Explorer** tab
2. Select HTTP method and endpoint
3. Add JSON parameters if needed
4. Click **Execute Request** to test API

## 🔧 Configuration

### Dashboard Settings
- **Auto Refresh**: Set automatic refresh interval (5-300 seconds)
- **Log Level**: Choose logging verbosity (error/warn/info/debug)
- **Cache TTL**: Default cache time-to-live (1-1440 minutes)

### Advanced Settings
- **Chrome Path**: Custom Chrome executable path
- **Request Timeout**: API request timeout in milliseconds (1000-60000)

## 🐛 Troubleshooting

### Common Issues

**Media Streaming Fails**
- Check TMDB/MAL IDs are correct
- Verify provider supports content type
- Ensure Chrome is installed and accessible
- Check network connectivity

**Cricket Data Not Loading**
- Verify cricwatch.io is accessible
- Check Chrome path in advanced settings
- Review cache status and clear if needed
- Monitor server logs for errors

**Dashboard Not Responding**
- Check server is running (http://localhost:4000/health)
- Verify browser console for JavaScript errors
- Clear browser cache and reload
- Check network connectivity

**Cache Issues**
- Use cache management to clear problematic entries
- Verify cache TTL settings
- Monitor memory usage
- Restart server if needed

### Debug Mode
Enable debug logging in settings to get detailed information:
1. Go to **Settings** tab
2. Set **Log Level** to **Debug**
3. Check **Status Monitoring** → **Activity Log** for detailed logs

## 🔄 Migration from Legacy Interfaces

### From test-player.html
- All functionality preserved in **Media Streaming** tab
- Enhanced with provider selection and better error handling
- Integrated API response viewer
- Added settings persistence

### From cricket-test.html
- All functionality preserved in **Cricket Streaming** tab
- Enhanced with bulk data loading
- Better stream management
- Integrated with unified cache system

## 🚀 Performance Tips

### Server Optimization
- Monitor memory usage in **Status Monitoring**
- Clear cache periodically if memory is high
- Adjust cache TTL based on usage patterns
- Use appropriate Chrome path for faster startup

### Browser Optimization
- Use modern browsers (Chrome, Firefox, Safari)
- Enable hardware acceleration for video playback
- Close unnecessary tabs to free memory
- Use dark theme to reduce eye strain

### Network Optimization
- Use stable internet connection
- Consider VPN for external service access
- Monitor external service status
- Cache frequently accessed content

## 📈 Future Enhancements

### Planned Features
- [ ] Real-time notifications for new cricket matches
- [ ] Stream quality selection
- [ ] Favorites/bookmarks system
- [ ] Advanced search functionality
- [ ] User authentication and profiles
- [ ] Mobile app version
- [ ] Stream recording capability
- [ ] Analytics and usage statistics

### API Improvements
- [ ] GraphQL support
- [ ] WebSocket for real-time updates
- [ ] Rate limiting and quotas
- [ ] API versioning
- [ ] OpenAPI documentation

## 📄 License

MIT License - See package.json for details

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Make changes with tests
4. Submit pull request
5. Follow coding standards

## 📞 Support

For issues and support:
- Check this documentation first
- Review browser console for errors
- Check server logs
- Create GitHub issue with details

---

**Version**: 3.0.0  
**Last Updated**: 2025-11-29  
**Compatibility**: Node.js 14+, Modern Browsers