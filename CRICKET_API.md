# Cricket Streaming API v3 Documentation

This document describes the v3 API endpoints for cricket streaming data scraped from cricwatch.io.

## Base URL
```
http://localhost:4000
```

## Authentication
No authentication required. All endpoints are publicly accessible.

## Rate Limiting
No explicit rate limiting is implemented, but caching is used to reduce server load and improve response times.

## Endpoints

### 1. Get Cricket Categories
Retrieve all available cricket categories (World Cup, The Ashes, Test Match, etc.).

**Endpoint:** `GET /v3/cricket/categories`

**Response:**
```json
{
  "ok": true,
  "data": [
    {
      "name": "World Cup",
      "slug": "world-cup",
      "url": "https://cricwatch.io/category/world-cup"
    },
    {
      "name": "The Ashes",
      "slug": "the-ashes",
      "url": "https://cricwatch.io/category/the-ashes"
    }
  ],
  "fromCache": false
}
```

**Cache Duration:** 15 minutes

### 2. Get Matches from Category
Retrieve all matches within a specific category.

**Endpoint:** `GET /v3/cricket/category/{slug}/matches`

**Parameters:**
- `slug` (path): Category slug (e.g., "world-cup", "the-ashes")

**Response:**
```json
{
  "ok": true,
  "data": [
    {
      "title": "Australia vs England - World Cup Final",
      "url": "https://cricwatch.io/watch/australia-vs-england-final",
      "streamLinks": [
        {
          "name": "Link 1",
          "url": "https://cricwatch.io/link/123"
        },
        {
          "name": "Link 2",
          "url": "https://cricwatch.io/link/124"
        }
      ]
    }
  ],
  "fromCache": false
}
```

**Cache Duration:** 10 minutes

### 3. Extract Stream URLs from Match
Extract actual streaming URLs from a match page using network interception.

**Endpoint:** `GET /v3/cricket/match/streams`

**Parameters:**
- `matchUrl` (query): Full URL of the match page

**Example:** `GET /v3/cricket/match/streams?matchUrl=https://cricwatch.io/watch/australia-vs-england-final`

**Response:**
```json
{
  "ok": true,
  "data": [
    {
      "url": "https://example.com/live/stream1.m3u8",
      "format": "hls",
      "quality": "unknown"
    },
    {
      "url": "https://example.com/live/stream2.mp4",
      "format": "mp4",
      "quality": "unknown"
    }
  ],
  "fromCache": false
}
```

**Cache Duration:** 5 minutes (streams expire quickly)

### 4. Get All Cricket Data
Retrieve complete cricket data including categories, matches, and stream URLs in a single request.

**Endpoint:** `GET /v3/cricket/all`

**Response:**
```json
{
  "ok": true,
  "data": [
    {
      "name": "World Cup",
      "slug": "world-cup",
      "url": "https://cricwatch.io/category/world-cup",
      "matches": [
        {
          "title": "Australia vs England - World Cup Final",
          "url": "https://cricwatch.io/watch/australia-vs-england-final",
          "streams": [
            {
              "url": "https://example.com/live/stream1.m3u8",
              "format": "hls",
              "quality": "unknown"
            }
          ]
        }
      ]
    }
  ],
  "fromCache": false
}
```

**Cache Duration:** 10 minutes

## Error Responses

All endpoints return consistent error responses:

```json
{
  "ok": false,
  "error": "error_code",
  "message": "Human-readable error message",
  "details": {
    "internalMessage": "Technical error details",
    "additionalInfo": "..."
  }
}
```

### Common Error Codes

- `validation_error`: Invalid request parameters
- `scraping_error`: Failed to scrape data from cricwatch.io
- `category_not_found`: Requested category slug doesn't exist
- `not_found`: Endpoint not found

## Caching Strategy

The API implements intelligent caching to improve performance:

- **Categories:** 15 minutes (categories change infrequently)
- **Matches:** 10 minutes (match schedules change moderately)
- **Stream URLs:** 5 minutes (stream URLs expire quickly)
- **Complete Data:** 10 minutes

Cached responses include `fromCache: true` and `cachedAt` timestamp.

## Stream Formats

The API supports multiple stream formats:

- **HLS (.m3u8):** Adaptive bitrate streaming, most common for live sports
- **MP4:** Direct video streams
- **Unknown:** Format couldn't be determined

## Usage Examples

### Basic Usage with JavaScript

```javascript
// Get categories
const categoriesResponse = await fetch('/v3/cricket/categories');
const categoriesData = await categoriesResponse.json();

// Get matches for a category
const matchesResponse = await fetch(`/v3/cricket/category/${categorySlug}/matches`);
const matchesData = await matchesResponse.json();

// Get stream URLs for a match
const streamsResponse = await fetch(`/v3/cricket/match/streams?matchUrl=${encodeURIComponent(matchUrl)}`);
const streamsData = await streamsResponse.json();

// Play the first stream
if (streamsData.ok && streamsData.data.length > 0) {
  const streamUrl = streamsData.data[0].url;
  const video = document.getElementById('video');
  video.src = streamUrl;
  video.play();
}
```

### Testing

Use the built-in test interface at `http://localhost:4000/cricket-test.html` to explore the API and test streaming functionality.

## Technical Implementation

### Web Scraping Strategy

1. **Category Discovery:** Parses navigation and category links from the main page
2. **Match Extraction:** Identifies match items and their associated stream links
3. **Stream URL Resolution:** Uses Puppeteer with network interception to capture actual streaming URLs
4. **Fallback Methods:** Attempts to extract URLs from page content if network interception fails

### Browser Automation

- Uses Puppeteer with Chrome/Chromium
- Blocks unnecessary resources (images, stylesheets) for performance
- Implements realistic user agents and headers
- Handles anti-bot measures and rate limiting

### Error Handling

- Graceful degradation when scraping fails
- Detailed error messages for debugging
- Automatic retry logic for transient failures
- Comprehensive logging for monitoring

## Performance Considerations

- **Concurrent Requests:** Limited to avoid overwhelming cricwatch.io
- **Resource Usage:** Puppeteer instances are properly cleaned up
- **Memory Management:** LRU cache prevents memory leaks
- **Network Efficiency:** Unnecessary resources are blocked

## Legal and Ethical Considerations

This API scrapes public information from cricwatch.io. Users should:

- Respect the website's terms of service
- Implement appropriate rate limiting
- Consider the impact on the source website
- Use the API responsibly and ethically

## Support

For issues or questions about the cricket streaming API:

1. Check the browser console for detailed error messages
2. Verify Chrome/Chromium is installed and accessible
3. Ensure network connectivity to cricwatch.io
4. Review the API response details for specific error information