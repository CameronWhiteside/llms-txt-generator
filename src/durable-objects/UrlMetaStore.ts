/**
 * URL Meta Store Durable Object
 * Acts as an in-place database for storing URL metadata, hashes, and query history
 */

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { SimHash } from "../lib/softHash";
import { UrlNormalizer } from "../lib/urlNormalizer";

// Constants
const MAX_RECORDS = 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export interface UrlMetaRecord {
  url: string;
  contentHash: string;
  llmsTxt?: string; // Store the actual llms.txt content
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
    originalUrl?: string;
  };
}

export interface UrlMetaHistory {
  records: Map<string, UrlMetaRecord>; // Key is normalized URL
  totalQueries: number;
  lastUpdated: number;
}

export interface CacheResult {
  cached: boolean;
  llmsTxt?: string; // The cached llms.txt content
  record?: UrlMetaRecord;
  similarity?: number;
  threshold?: number;
  contentHash?: string;
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
   * Similarity is calculated dynamically each time, not stored
   */
  async checkCache(url: string, sanitizedContent: string, threshold: number = 0.8): Promise<CacheResult> {
    const history = await this.getHistory();

    // Normalize the URL for cache lookup
    const normalizedUrl = UrlNormalizer.normalize(url);
    console.log("🔍 Cache check - Original URL:", url);
    console.log("🔍 Cache check - Normalized URL:", normalizedUrl);

    // Find existing record by normalized URL
    const existingRecord = history.records.get(normalizedUrl);

    if (!existingRecord) {
      console.log("❌ No cache found for URL:", normalizedUrl);
      return { cached: false };
    }

    console.log("✅ Cache found for URL:", normalizedUrl);
    console.log("📊 Existing record hash:", existingRecord.contentHash);

    // Generate soft hash for the new sanitized content
    const newContentHash = SimHash.hash(sanitizedContent);
    console.log("🔐 New content hash:", newContentHash);

    // Compare with stored hash - similarity calculated dynamically
    const similarity = SimHash.similarity(existingRecord.contentHash, newContentHash);
    console.log("📈 Similarity score:", similarity, "Threshold:", threshold);

    if (similarity >= threshold) {
      // Content is similar enough, return cached llms.txt
      console.log("✅ Cache hit! Similarity above threshold");
      return {
        cached: true,
        llmsTxt: existingRecord.llmsTxt,
        record: existingRecord,
        similarity,
        threshold,
        contentHash: newContentHash, // Return the current content hash for reference
      };
    }

    console.log("❌ Cache miss! Similarity below threshold");
    return {
      cached: false,
      similarity,
      threshold,
      contentHash: newContentHash, // Return the current content hash for reference
    };
  }

  /**
   * Store new content with llms.txt and update cache
   * Only stores content hash and llms.txt, similarity is calculated dynamically
   */
  async storeContent(url: string, sanitizedContent: string, llmsTxt: string, threshold: number = 0.8, metadata?: Record<string, unknown>): Promise<void> {
    // Normalize the URL for storage
    const normalizedUrl = UrlNormalizer.normalize(url);
    console.log("💾 Storing content - Original URL:", url);
    console.log("💾 Storing content - Normalized URL:", normalizedUrl);

    const contentHash = SimHash.hash(sanitizedContent);

    const record: UrlMetaRecord = {
      url: normalizedUrl, // Store the normalized URL
      contentHash,
      llmsTxt, // Store the actual llms.txt content
      timestamp: Date.now(),
      lastQueried: Date.now(),
      queryCount: 1,
      comparisonThreshold: threshold,
      metadata: {
        contentLength: sanitizedContent.length,
        processingTime: Date.now(),
        originalUrl: url, // Keep original URL in metadata for reference
        ...metadata,
      },
    };

    console.log("💾 Storing record:", {
      url: record.url,
      contentHash: record.contentHash,
      contentLength: record.metadata?.contentLength,
    });

    await this.storeRecord(record);
  }

  /**
   * Update only the llms.txt content without changing the content hash
   * Used for AI revisions and manual edits
   */
  async updateLlmsTxt(url: string, newLlmsTxt: string, metadata?: Record<string, unknown>): Promise<void> {
    // Normalize the URL for lookup
    const normalizedUrl = UrlNormalizer.normalize(url);
    console.log("🔄 Updating llms.txt - Original URL:", url);
    console.log("🔄 Updating llms.txt - Normalized URL:", normalizedUrl);

    const history = await this.getHistory();
    const existingRecord = history.records.get(normalizedUrl);

    if (!existingRecord) {
      console.log("❌ No existing record found for URL:", normalizedUrl);
      throw new Error(`No existing record found for URL: ${url}`);
    }

    // Update only the llms.txt content and metadata, keep the original content hash
    const updatedRecord: UrlMetaRecord = {
      ...existingRecord,
      llmsTxt: newLlmsTxt,
      lastQueried: Date.now(),
      queryCount: existingRecord.queryCount + 1,
      metadata: {
        ...existingRecord.metadata,
        ...metadata,
        processingTime: Date.now(),
      },
    };

    console.log("🔄 Updating record:", {
      url: updatedRecord.url,
      contentHash: updatedRecord.contentHash, // Unchanged
      contentLength: updatedRecord.metadata?.contentLength,
    });

    await this.storeRecord(updatedRecord);
  }

  /**
   * Store or update a URL metadata record
   */
  async storeRecord(record: UrlMetaRecord): Promise<void> {
    const history = await this.getHistory();
    const normalizedUrl = record.url; // URL is already normalized when stored

    if (history.records.has(normalizedUrl)) {
      // Update existing record
      const existing = history.records.get(normalizedUrl)!;
      history.records.set(normalizedUrl, {
        ...record,
        queryCount: existing.queryCount + 1,
        lastQueried: Date.now(),
      });
    } else {
      // Add new record
      history.records.set(normalizedUrl, {
        ...record,
        queryCount: 1,
        lastQueried: Date.now(),
      });
    }

    history.totalQueries++;
    history.lastUpdated = Date.now();

    // Keep only last MAX_RECORDS to prevent memory issues
    if (history.records.size > MAX_RECORDS) {
      const entries = Array.from(history.records.entries());
      const sortedEntries = entries.sort((a, b) => b[1].lastQueried - a[1].lastQueried);
      const trimmedEntries = sortedEntries.slice(0, MAX_RECORDS);
      history.records = new Map(trimmedEntries);
    }

    await this.state.storage.put("url_meta_history", history);
  }

  /**
   * Get URL metadata history (internal use only)
   */
  private async getHistory(): Promise<UrlMetaHistory> {
    const history = await this.state.storage.get<UrlMetaHistory>("url_meta_history");
    return (
      history || {
        records: new Map<string, UrlMetaRecord>(),
        totalQueries: 0,
        lastUpdated: Date.now(),
      }
    );
  }

  /**
   * Get the latest record for a URL
   */
  async getLatestRecordForUrl(url: string): Promise<UrlMetaRecord | null> {
    const history = await this.getHistory();
    const normalizedUrl = UrlNormalizer.normalize(url);
    const record = history.records.get(normalizedUrl);
    return record || null;
  }

  /**
   * Check if URL has been queried before
   */
  async hasUrlBeenQueried(url: string): Promise<boolean> {
    const history = await this.getHistory();
    const normalizedUrl = UrlNormalizer.normalize(url);
    return history.records.has(normalizedUrl);
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
    const uniqueUrls = history.records.size;

    const oneDayAgo = Date.now() - ONE_DAY_MS;
    const recentActivity = Array.from(history.records.values()).filter((r) => r.lastQueried > oneDayAgo).length;

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

        case "/update-llms-txt":
          if (method === "POST") {
            const body = (await request.json()) as {
              url: string;
              newLlmsTxt: string;
              metadata?: Record<string, unknown>;
            };
            const { url: targetUrl, newLlmsTxt, metadata } = body;
            await this.updateLlmsTxt(targetUrl, newLlmsTxt, metadata);
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

        case "/url":
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
                "GET /url?url=<url> - Get latest record for specific URL",
                "GET /latest?url=<url> - Get latest record for URL",
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
   * Update only the llms.txt content without changing the content hash
   */
  async updateLlmsTxt(url: string, newLlmsTxt: string, metadata?: Record<string, unknown>): Promise<void> {
    const response = await this.durableObject.fetch("http://internal/update-llms-txt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, newLlmsTxt, metadata }),
    });

    if (!response.ok) {
      throw new Error(`Failed to update llms.txt: ${response.statusText}`);
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
