// Free RSS feeds - no API key needed, unlimited requests. RSS feed URLs
// occasionally get retired or moved by the publisher without notice - if a
// source starts returning 0 headlines, check the feed URL manually in a
// browser first before assuming something's broken in the parsing code.

export const NEWS_FEEDS = [
  { url: "https://www.marketwatch.com/rss/topstories", source: "MarketWatch" },
  { url: "https://finance.yahoo.com/news/rssindex", source: "Yahoo Finance" },
  { url: "https://www.cnbc.com/id/20910258/device/rss/rss.html", source: "CNBC Markets" },
  { url: "https://www.investing.com/rss/news.rss", source: "Investing.com" },
  { url: "https://www.di.se/rss", source: "Dagens Industri" },
];