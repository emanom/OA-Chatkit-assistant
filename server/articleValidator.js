/**
 * Article URL Validator
 * 
 * Validates article URLs to prevent hallucinated/invalid links from being shown to users.
 * Supports two validation methods:
 * 1. Zendesk API (if credentials provided) - most reliable
 * 2. Sitemap checking - fallback method
 */

const SUPPORT_FYI_DOMAIN = "support.fyi.app";
const SITEMAP_URL = `https://${SUPPORT_FYI_DOMAIN}/sitemap.xml`;
const ZENDESK_API_BASE = `https://${SUPPORT_FYI_DOMAIN}/api/v2`;

// Cache for validated URLs to avoid repeated API calls
const validationCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Cache for sitemap URLs (refreshed periodically)
let sitemapUrls = null;
let sitemapLastFetched = null;
const SITEMAP_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Extract article ID from a support.fyi.app URL
 * @param {string} url - The article URL
 * @returns {string|null} - Article ID or null if not found
 */
function extractArticleId(url) {
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname !== SUPPORT_FYI_DOMAIN) {
      return null;
    }
    
    // Match patterns like:
    // /hc/en-us/articles/123456789
    // /hc/en-us/articles/123456789-Title-Text
    const articleMatch = urlObj.pathname.match(/\/hc\/[^\/]+\/articles\/(\d+)/);
    if (articleMatch) {
      return articleMatch[1];
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Check if URL is a support.fyi.app article URL
 * @param {string} url - The URL to check
 * @returns {boolean}
 */
function isArticleUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname === SUPPORT_FYI_DOMAIN && 
           urlObj.pathname.includes('/articles/');
  } catch {
    return false;
  }
}

/**
 * Validate article using Zendesk API
 * @param {string} articleId - The article ID
 * @param {string} zendeskEmail - Zendesk API email
 * @param {string} zendeskToken - Zendesk API token
 * @returns {Promise<boolean>}
 */
async function validateViaZendesk(articleId, zendeskEmail, zendeskToken) {
  if (!zendeskEmail || !zendeskToken || !articleId) {
    return false;
  }

  try {
    const auth = Buffer.from(`${zendeskEmail}/token:${zendeskToken}`).toString('base64');
    const response = await fetch(`${ZENDESK_API_BASE}/help_center/articles/${articleId}.json`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 404) {
      return false;
    }

    if (!response.ok) {
      // Log but don't fail validation on API errors (rate limits, etc.)
      console.warn(`[articleValidator] Zendesk API error for article ${articleId}: ${response.status}`);
      return false;
    }

    const data = await response.json();
    // Check if article exists and is published
    return data?.article?.draft === false;
  } catch (error) {
    console.warn(`[articleValidator] Zendesk validation error for article ${articleId}:`, error.message);
    return false;
  }
}

/**
 * Fetch and parse sitemap
 * @returns {Promise<Set<string>>} - Set of article URLs from sitemap
 */
async function fetchSitemapUrls() {
  const now = Date.now();
  
  // Return cached sitemap if still valid
  if (sitemapUrls && sitemapLastFetched && (now - sitemapLastFetched) < SITEMAP_CACHE_TTL_MS) {
    return sitemapUrls;
  }

  try {
    const response = await fetch(SITEMAP_URL, {
      headers: {
        'User-Agent': 'FYI-Support-Assistant/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const xml = await response.text();
    const articleUrls = new Set();
    
    // Extract article URLs from sitemap XML
    // Match <loc>https://support.fyi.app/hc/en-us/articles/...</loc>
    const locMatches = xml.matchAll(/<loc>(https?:\/\/[^<]+)<\/loc>/gi);
    for (const match of locMatches) {
      const url = match[1];
      if (isArticleUrl(url)) {
        // Normalize URL (remove trailing slash, query params, fragments)
        try {
          const urlObj = new URL(url);
          urlObj.search = '';
          urlObj.hash = '';
          const normalized = urlObj.toString().replace(/\/$/, '');
          articleUrls.add(normalized);
        } catch {
          // Skip malformed URLs
        }
      }
    }

    sitemapUrls = articleUrls;
    sitemapLastFetched = now;
    
    console.log(`[articleValidator] Loaded ${articleUrls.size} article URLs from sitemap`);
    return articleUrls;
  } catch (error) {
    console.warn(`[articleValidator] Failed to fetch sitemap:`, error.message);
    // Return cached sitemap if available, even if expired
    return sitemapUrls || new Set();
  }
}

/**
 * Validate article using sitemap
 * @param {string} url - The article URL
 * @returns {Promise<boolean>}
 */
async function validateViaSitemap(url) {
  try {
    const sitemapUrls = await fetchSitemapUrls();
    if (sitemapUrls.size === 0) {
      // If sitemap fetch failed, be permissive (don't block valid articles)
      return true;
    }

    // Normalize URL for comparison
    const urlObj = new URL(url);
    urlObj.search = '';
    urlObj.hash = '';
    const normalized = urlObj.toString().replace(/\/$/, '');
    
    return sitemapUrls.has(normalized);
  } catch (error) {
    console.warn(`[articleValidator] Sitemap validation error:`, error.message);
    // On error, be permissive to avoid blocking valid articles
    return true;
  }
}

/**
 * Validate an article URL
 * @param {string} url - The article URL to validate
 * @param {Object} options - Validation options
 * @param {string} options.zendeskEmail - Zendesk API email (optional)
 * @param {string} options.zendeskToken - Zendesk API token (optional)
 * @returns {Promise<boolean>} - True if valid, false otherwise
 */
async function validateArticleUrl(url, options = {}) {
  if (!url || typeof url !== 'string') {
    return false;
  }

  // Check if it's an article URL
  if (!isArticleUrl(url)) {
    return false;
  }

  // Check cache first
  const cacheKey = url;
  const cached = validationCache.get(cacheKey);
  if (cached) {
    const { isValid, timestamp } = cached;
    if (Date.now() - timestamp < CACHE_TTL_MS) {
      return isValid;
    }
    validationCache.delete(cacheKey);
  }

  let isValid = false;

  // Try Zendesk API first if credentials provided
  const articleId = extractArticleId(url);
  if (articleId && options.zendeskEmail && options.zendeskToken) {
    isValid = await validateViaZendesk(articleId, options.zendeskEmail, options.zendeskToken);
  }

  // Fall back to sitemap if Zendesk not available or failed
  if (!isValid) {
    isValid = await validateViaSitemap(url);
  }

  // Cache the result
  validationCache.set(cacheKey, {
    isValid,
    timestamp: Date.now(),
  });

  return isValid;
}

/**
 * Extract all article URLs from markdown text
 * @param {string} markdown - The markdown text
 * @returns {Array<{url: string, fullMatch: string}>} - Array of URL objects
 */
function extractArticleUrls(markdown) {
  if (!markdown || typeof markdown !== 'string') {
    return [];
  }

  const urls = [];
  
  // Match markdown links: [text](https://support.fyi.app/...)
  const markdownLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/gi;
  let match;
  while ((match = markdownLinkRegex.exec(markdown)) !== null) {
    const url = match[2];
    if (isArticleUrl(url)) {
      urls.push({
        url,
        fullMatch: match[0],
        text: match[1],
      });
    }
  }

  // Also match plain URLs in text
  const plainUrlRegex = /https?:\/\/[^\s\)]+/gi;
  while ((match = plainUrlRegex.exec(markdown)) !== null) {
    const url = match[0];
    if (isArticleUrl(url)) {
      // Avoid duplicates
      if (!urls.some(u => u.url === url)) {
        urls.push({
          url,
          fullMatch: url,
          text: null,
        });
      }
    }
  }

  return urls;
}

/**
 * Validate article URLs and return invalid ones
 * @param {string} markdown - The markdown text
 * @param {Object} options - Validation options
 * @returns {Promise<{invalidUrls: Array<{url: string, text: string|null}>, hasInvalid: boolean}>}
 */
async function validateArticleUrlsInMarkdown(markdown, options = {}) {
  if (!markdown || typeof markdown !== 'string') {
    return { invalidUrls: [], hasInvalid: false };
  }

  const articleUrls = extractArticleUrls(markdown);
  if (articleUrls.length === 0) {
    return { invalidUrls: [], hasInvalid: false };
  }

  // Validate all URLs in parallel
  const validationResults = await Promise.all(
    articleUrls.map(async ({ url, text }) => ({
      url,
      text,
      isValid: await validateArticleUrl(url, options),
    }))
  );

  // Extract invalid URLs with their link text
  const invalidUrls = validationResults
    .filter(result => !result.isValid)
    .map(({ url, text }) => ({ url, text }));

  return {
    invalidUrls,
    hasInvalid: invalidUrls.length > 0,
  };
}

/**
 * Filter invalid article URLs from markdown text
 * @param {string} markdown - The markdown text
 * @param {Object} options - Validation options
 * @returns {Promise<string>} - Markdown with invalid links removed
 */
async function filterInvalidArticleUrls(markdown, options = {}) {
  if (!markdown || typeof markdown !== 'string') {
    return markdown;
  }

  const articleUrls = extractArticleUrls(markdown);
  if (articleUrls.length === 0) {
    return markdown;
  }

  // Validate all URLs in parallel
  const validationResults = await Promise.all(
    articleUrls.map(async ({ url }) => ({
      url,
      isValid: await validateArticleUrl(url, options),
    }))
  );

  // Build a map of invalid URLs
  const invalidUrls = new Set(
    validationResults
      .filter(result => !result.isValid)
      .map(result => result.url)
  );

  if (invalidUrls.size === 0) {
    return markdown;
  }

  // Remove invalid links from markdown
  let filtered = markdown;
  
  for (const { url, fullMatch } of articleUrls) {
    if (invalidUrls.has(url)) {
      // Remove the markdown link, keeping just the text if available
      if (fullMatch.includes('](')) {
        // Markdown link: [text](url) -> just "text"
        const textMatch = fullMatch.match(/\[([^\]]+)\]/);
        if (textMatch) {
          filtered = filtered.replace(fullMatch, textMatch[1]);
        } else {
          filtered = filtered.replace(fullMatch, '');
        }
      } else {
        // Plain URL: remove it
        filtered = filtered.replace(url, '');
      }
    }
  }

  // Clean up empty list items that might result from removing links
  filtered = filtered.replace(/^[\s]*-[\s]*$/gm, '');
  filtered = filtered.replace(/\n{3,}/g, '\n\n');

  return filtered.trim();
}

export {
  validateArticleUrl,
  extractArticleUrls,
  validateArticleUrlsInMarkdown,
  filterInvalidArticleUrls,
  isArticleUrl,
  extractArticleId,
};

