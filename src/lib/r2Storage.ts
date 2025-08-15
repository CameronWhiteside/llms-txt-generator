/**
 * R2 Storage Utilities
 * Handles storage and retrieval of llms.txt files in R2
 */

import { SimHash } from "./softHash";

export interface R2StorageConfig {
  bucket: R2Bucket;
  prefix?: string;
}

export interface StoredDocument {
  key: string;
  content: string;
  url: string;
  hash: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/**
 * Generate a unique key for storing documents in R2
 * @param urls - Array of URLs that were processed
 * @param contentHash - Hash of the processed content
 * @returns Unique key for R2 storage
 */
export function generateDocumentKey(urls: string[], contentHash: string): string {
  // Create a simple hash of the URLs for the file path
  const urlHash = SimHash.hash(urls.sort().join("|")).slice(0, 8); // Use first 8 characters for shorter path
  return `${urlHash}/llms.txt`;
}

/**
 * Store a markdown document in R2
 * @param config - R2 storage configuration
 * @param document - Document to store
 * @returns Promise<boolean> - Success status
 */
export async function storeDocument(config: R2StorageConfig, document: Omit<StoredDocument, "key"> & { key: string }): Promise<boolean> {
  try {
    const key = document.key;
    const content = document.content;

    // Store the markdown content
    await config.bucket.put(key, content, {
      httpMetadata: {
        contentType: "text/markdown",
        cacheControl: "public, max-age=3600", // Cache for 1 hour
      },
      customMetadata: {
        url: document.url,
        hash: document.hash,
        timestamp: document.timestamp.toString(),
        ...(document.metadata && { metadata: JSON.stringify(document.metadata) }),
      },
    });

    return true;
  } catch (error) {
    console.error("Failed to store document in R2:", error);
    return false;
  }
}

/**
 * Retrieve a document from R2
 * @param config - R2 storage configuration
 * @param key - Document key
 * @returns Promise<StoredDocument | null>
 */
export async function retrieveDocument(config: R2StorageConfig, key: string): Promise<StoredDocument | null> {
  try {
    const object = await config.bucket.get(key);

    if (!object) {
      return null;
    }

    const content = await object.text();
    const metadata = object.customMetadata ?? {};

    return {
      key,
      content,
      url: metadata.url || "",
      hash: metadata.hash || "",
      timestamp: parseInt(metadata.timestamp || "0"),
      metadata: metadata.metadata ? JSON.parse(metadata.metadata) : undefined,
    };
  } catch (error) {
    console.error("Failed to retrieve document from R2:", error);
    return null;
  }
}

/**
 * Check if a document exists in R2
 * @param config - R2 storage configuration
 * @param key - Document key
 * @returns Promise<boolean>
 */
export async function documentExists(config: R2StorageConfig, key: string): Promise<boolean> {
  try {
    const object = await config.bucket.head(key);
    return object !== null;
  } catch (error) {
    return false;
  }
}

/**
 * Delete a document from R2
 * @param config - R2 storage configuration
 * @param key - Document key
 * @returns Promise<boolean>
 */
export async function deleteDocument(config: R2StorageConfig, key: string): Promise<boolean> {
  try {
    await config.bucket.delete(key);
    return true;
  } catch (error) {
    console.error("Failed to delete document from R2:", error);
    return false;
  }
}

/**
 * List documents in R2 with optional filtering
 * @param config - R2 storage configuration
 * @param prefix - Optional prefix filter
 * @param limit - Maximum number of results
 * @returns Promise<StoredDocument[]>
 */
export async function listDocuments(config: R2StorageConfig, prefix?: string, limit: number = 100): Promise<StoredDocument[]> {
  try {
    const listOptions: R2ListOptions = {
      limit,
      ...(prefix && { prefix }),
    };

    const objects = await config.bucket.list(listOptions);
    const documents: StoredDocument[] = [];

    for (const object of objects.objects) {
      const document = await retrieveDocument(config, object.key);
      if (document) {
        documents.push(document);
      }
    }

    return documents;
  } catch (error) {
    console.error("Failed to list documents from R2:", error);
    return [];
  }
}
