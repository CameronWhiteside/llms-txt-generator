/**
 * URL Meta Store Durable Object
 * Acts as an in-place database for storing URL metadata, hashes, and query history
 */

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { SimHash } from "../lib/softHash";

// Constants
const MAX_RECORDS = 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export interface UrlMetaRecord {
  url: string;
  contentHash: string;
  llmsTxt?: string;
  llmsTxtHash?: string;
  timestamp: number;
  lastQueried: number;
  queryCount: number;
  comparisonThreshold: number; // Default threshold for content similarity
  metadata?: {
    model?: string;
    contentLength?: number;
    aiTokens?: number;
    aiLatency?: number;
    processingTime?: number;
    userAgent?: string;
    referrer?: string;
    ipAddress?: string;
  };
}

export interface UrlMetaHistory {
  records: UrlMetaRecord[];
  totalQueries: number;
  uniqueUrls: number;
  lastUpdated: number;
}

export interface CacheResult {
  cached: boolean;
  llmsTxt?: string;
  record?: UrlMetaRecord;
  similarity?: number;
  threshold?: number;
}

export class UrlMetaStore {
  private state: DurableObjectState;
  private env: CloudflareEnv;

  constructor(state: DurableObjectState, env: CloudflareEnv) {
    this.state = state;
    this.env = env;
  }

  /**
   * Check if content is cached and return cached llms.txt if within threshold
   */
  async checkCache(url: string, sanitizedContent: string, threshold: number = 0.8): Promise<CacheResult> {
    const history = await this.getHistory();
    const existingRecord = history.records.find((r) => r.url === url);

    if (!existingRecord) {
      return { cached: false };
    }

    // Generate soft hash for the new sanitized content
    const newContentHash = SimHash.hash(sanitizedContent);

    // Compare with stored hash
    const similarity = SimHash.similarity(existingRecord.contentHash, newContentHash);

    if (similarity >= threshold) {
      // Content is similar enough, return cached llms.txt
      return {
        cached: true,
        llmsTxt: existingRecord.llmsTxt,
        record: existingRecord,
        similarity,
        threshold,
      };
    }

    return {
      cached: false,
      similarity,
      threshold,
    };
  }

  /**
   * Store new content with llms.txt and update cache
   */
  async storeContent(url: string, sanitizedContent: string, llmsTxt: string, threshold: number = 0.8, metadata?: Record<string, unknown>): Promise<void> {
    const contentHash = SimHash.hash(sanitizedContent);
    const llmsTxtHash = SimHash.hash(llmsTxt);

    const record: UrlMetaRecord = {
      url,
      contentHash,
      llmsTxt,
      llmsTxtHash,
      timestamp: Date.now(),
      lastQueried: Date.now(),
      queryCount: 1,
      comparisonThreshold: threshold,
      metadata: {
        contentLength: sanitizedContent.length,
        processingTime: Date.now(),
        ...metadata,
      },
    };

    await this.storeRecord(record);
  }

  /**
   * Store or update a URL metadata record
   */
  async storeRecord(record: UrlMetaRecord): Promise<void> {
    const history = await this.getHistory();
    const existingRecordIndex = history.records.findIndex((r) => r.url === record.url);

    if (existingRecordIndex >= 0) {
      // Update existing record
      const existing = history.records[existingRecordIndex];
      history.records[existingRecordIndex] = {
        ...record,
        queryCount: existing.queryCount + 1,
        lastQueried: Date.now(),
      };
    } else {
      // Add new record
      history.records.push({
        ...record,
        queryCount: 1,
        lastQueried: Date.now(),
      });
      history.uniqueUrls++;
    }

    history.totalQueries++;
    history.lastUpdated = Date.now();

    // Keep only last MAX_RECORDS to prevent memory issues
    if (history.records.length > MAX_RECORDS) {
      history.records = history.records.slice(-MAX_RECORDS);
    }

    await this.state.storage.put("url_meta_history", history);
  }

  /**
   * Get URL metadata history
   */
  async getHistory(): Promise<UrlMetaHistory> {
    const history = await this.state.storage.get<UrlMetaHistory>("url_meta_history");
    return (
      history || {
        records: [],
        totalQueries: 0,
        uniqueUrls: 0,
        lastUpdated: Date.now(),
      }
    );
  }

  /**
   * Get records for a specific URL
   */
  async getRecordsForUrl(url: string): Promise<UrlMetaRecord[]> {
    const history = await this.getHistory();
    return history.records.filter((record) => record.url === url);
  }

  /**
   * Get the latest record for a URL
   */
  async getLatestRecordForUrl(url: string): Promise<UrlMetaRecord | null> {
    const records = await this.getRecordsForUrl(url);
    if (records.length === 0) return null;

    // Sort by timestamp and return the latest
    return records.sort((a, b) => b.timestamp - a.timestamp)[0];
  }

  /**
   * Check if URL has been queried before
   */
  async hasUrlBeenQueried(url: string): Promise<boolean> {
    const records = await this.getRecordsForUrl(url);
    return records.length > 0;
  }

  /**
   * Get URL metadata statistics
   */
  async getStats(): Promise<{
    totalQueries: number;
    uniqueUrls: number;
    lastUpdated: number;
    recentActivity: number; // queries in last 24 hours
  }> {
    const history = await this.getHistory();
    const uniqueUrls = new Set(history.records.map((r) => r.url)).size;

    const oneDayAgo = Date.now() - ONE_DAY_MS;
    const recentActivity = history.records.filter((r) => r.lastQueried > oneDayAgo).length;

    return {
      totalQueries: history.totalQueries,
      uniqueUrls,
      lastUpdated: history.lastUpdated,
      recentActivity,
    };
  }

  /**
   * Clear all records (useful for testing)
   */
  async clearAll(): Promise<void> {
    await this.state.storage.delete("url_meta_history");
  }

  /**
   * Handle fetch requests to the Durable Object
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      switch (path) {
        case "/check-cache":
          if (method === "POST") {
            const body = (await request.json()) as { url: string; sanitizedContent: string; threshold?: number };
            const { url: targetUrl, sanitizedContent, threshold = 0.8 } = body;
            const cacheResult = await this.checkCache(targetUrl, sanitizedContent, threshold);
            return new Response(JSON.stringify(cacheResult), {
              headers: { "Content-Type": "application/json" },
            });
          }
          break;

        case "/store-content":
          if (method === "POST") {
            const body = (await request.json()) as {
              url: string;
              sanitizedContent: string;
              llmsTxt: string;
              threshold?: number;
              metadata?: Record<string, unknown>;
            };
            const { url: targetUrl, sanitizedContent, llmsTxt, threshold = 0.8, metadata } = body;
            await this.storeContent(targetUrl, sanitizedContent, llmsTxt, threshold, metadata);
            return new Response(JSON.stringify({ success: true }), {
              headers: { "Content-Type": "application/json" },
            });
          }
          break;

        case "/store":
          if (method === "POST") {
            const record: UrlMetaRecord = await request.json();
            await this.storeRecord(record);
            return new Response(JSON.stringify({ success: true }), {
              headers: { "Content-Type": "application/json" },
            });
          }
          break;

        case "/history":
          if (method === "GET") {
            const history = await this.getHistory();
            return new Response(JSON.stringify(history), {
              headers: { "Content-Type": "application/json" },
            });
          }
          break;

        case "/url":
          if (method === "GET") {
            const urlParam = url.searchParams.get("url");
            if (!urlParam) {
              return new Response(JSON.stringify({ error: "URL parameter required" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
              });
            }

            const records = await this.getRecordsForUrl(urlParam);
            return new Response(JSON.stringify({ records }), {
              headers: { "Content-Type": "application/json" },
            });
          }
          break;

        case "/latest":
          if (method === "GET") {
            const urlParam = url.searchParams.get("url");
            if (!urlParam) {
              return new Response(JSON.stringify({ error: "URL parameter required" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
              });
            }

            const record = await this.getLatestRecordForUrl(urlParam);
            return new Response(JSON.stringify({ record }), {
              headers: { "Content-Type": "application/json" },
            });
          }
          break;

        case "/stats":
          if (method === "GET") {
            const stats = await this.getStats();
            return new Response(JSON.stringify(stats), {
              headers: { "Content-Type": "application/json" },
            });
          }
          break;

        case "/clear":
          if (method === "POST") {
            await this.clearAll();
            return new Response(JSON.stringify({ success: true }), {
              headers: { "Content-Type": "application/json" },
            });
          }
          break;

        default:
          return new Response(
            JSON.stringify({
              error: "Not found",
              availableEndpoints: [
                "POST /check-cache - Check if content is cached and return cached llms.txt if within threshold",
                "POST /store-content - Store new content with llms.txt and update cache",
                "POST /store - Store a URL metadata record",
                "GET /history - Get all URL metadata history",
                "GET /url?url=<url> - Get records for specific URL",
                "GET /latest?url=<url> - Get latest record for URL",
                "GET /stats - Get URL metadata statistics",
                "POST /clear - Clear all records",
              ],
            }),
            {
              status: 404,
              headers: { "Content-Type": "application/json" },
            }
          );
      }
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: "Internal server error",
          details: error instanceof Error ? error.message : String(error),
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/**
 * Client for interacting with the URL Meta Store Durable Object
 */
export class UrlMetaStoreClient {
  private durableObject: DurableObjectStub;

  constructor(durableObject: DurableObjectStub) {
    this.durableObject = durableObject;
  }

  /**
   * Check if content is cached and return cached llms.txt if within threshold
   */
  async checkCache(url: string, sanitizedContent: string, threshold: number = 0.8): Promise<CacheResult> {
    console.log("🔧 checkCache called with URL:", url);
    console.log("🔧 Durable Object stub:", this.durableObject);

    try {
      const response = await this.durableObject.fetch("http://internal/check-cache", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, sanitizedContent, threshold }),
      });

      if (!response.ok) {
        throw new Error(`Failed to check cache: ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      console.log("🔧 checkCache error:", error);
      throw error;
    }
  }

  /**
   * Store new content with llms.txt and update cache
   */
  async storeContent(url: string, sanitizedContent: string, llmsTxt: string, threshold: number = 0.8, metadata?: Record<string, unknown>): Promise<void> {
    const response = await this.durableObject.fetch("http://internal/store-content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, sanitizedContent, llmsTxt, threshold, metadata }),
    });

    if (!response.ok) {
      throw new Error(`Failed to store content: ${response.statusText}`);
    }
  }

  /**
   * Store a URL metadata record
   */
  async storeRecord(record: UrlMetaRecord): Promise<void> {
    const response = await this.durableObject.fetch("http://internal/store", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    });

    if (!response.ok) {
      throw new Error(`Failed to store record: ${response.statusText}`);
    }
  }

  /**
   * Get URL metadata history
   */
  async getHistory(): Promise<UrlMetaHistory> {
    const response = await this.durableObject.fetch("http://internal/history");

    if (!response.ok) {
      throw new Error(`Failed to get history: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get records for a specific URL
   */
  async getRecordsForUrl(url: string): Promise<UrlMetaRecord[]> {
    const response = await this.durableObject.fetch(`http://internal/url?url=${encodeURIComponent(url)}`);

    if (!response.ok) {
      throw new Error(`Failed to get records for URL: ${response.statusText}`);
    }

    const result = (await response.json()) as { records: UrlMetaRecord[] };
    return result.records;
  }

  /**
   * Get the latest record for a URL
   */
  async getLatestRecordForUrl(url: string): Promise<UrlMetaRecord | null> {
    const response = await this.durableObject.fetch(`http://internal/latest?url=${encodeURIComponent(url)}`);

    if (!response.ok) {
      throw new Error(`Failed to get latest record for URL: ${response.statusText}`);
    }

    const result = (await response.json()) as { record: UrlMetaRecord | null };
    return result.record;
  }

  /**
   * Get URL metadata statistics
   */
  async getStats(): Promise<{
    totalQueries: number;
    uniqueUrls: number;
    lastUpdated: number;
    recentActivity: number;
  }> {
    const response = await this.durableObject.fetch("http://internal/stats");

    if (!response.ok) {
      throw new Error(`Failed to get stats: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Clear all records
   */
  async clearAll(): Promise<void> {
    const response = await this.durableObject.fetch("http://internal/clear", {
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(`Failed to clear all records: ${response.statusText}`);
    }
  }

  /**
   * Legacy method for backward compatibility
   */
  async storeUrl(url: string, contentHash: string): Promise<void> {
    const record: UrlMetaRecord = {
      url,
      contentHash,
      timestamp: Date.now(),
      lastQueried: Date.now(),
      queryCount: 1,
      comparisonThreshold: 0.8,
    };
    await this.storeRecord(record);
  }

  /**
   * Legacy method for backward compatibility
   */
  async getUrl(url: string): Promise<UrlMetaRecord | null> {
    return this.getLatestRecordForUrl(url);
  }

  /**
   * Legacy method for backward compatibility
   */
  async getAllUrls(): Promise<UrlMetaRecord[]> {
    const history = await this.getHistory();
    return history.records;
  }
}

/**
 * Durable Object class that implements the DurableObject interface
 */
export class UrlMetaStoreDO implements DurableObject {
  private store: UrlMetaStore;

  constructor(state: DurableObjectState, env: CloudflareEnv) {
    this.store = new UrlMetaStore(state, env);
  }

  async fetch(request: Request): Promise<Response> {
    return this.store.fetch(request);
  }
}

/**
 * Factory function to create a URL Meta Store client
 */
export function createUrlMetaStoreClient(): UrlMetaStoreClient {
  const env = getCloudflareContext().env;
  const id = env.URL_META_STORE.idFromName("default");
  const durableObject = env.URL_META_STORE.get(id);
  return new UrlMetaStoreClient(durableObject);
}
