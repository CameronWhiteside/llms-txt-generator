/**
 * SimHash Library
 * Uses SimHash algorithm for content similarity detection and drift scoring
 * Perfect for detecting small changes in content while being robust to minor variations
 */

// Constants
const HASH_BITS = 64;
const KGRAM_SIZE = 5; // Size of k-grams for feature extraction
const EMPTY_HASH = "0".repeat(16);

export const HASH_MASK = 0xffffffffffffffff;
export const HASH_SHIFT = 5;

// Exported constants
export const MAX_RECORDS = 1000;
export const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Similarity threshold constants
export const SIMILARITY_THRESHOLD_DEFAULT = 0.8;
export const SIMILARITY_THRESHOLD_STRICT = 0.9;
export const SIMILARITY_THRESHOLD_LOOSE = 0.7;
export const SIMILARITY_THRESHOLD_NONE = 0.95;
export const SIMILARITY_THRESHOLD_MINOR = 0.8;
export const SIMILARITY_THRESHOLD_MODERATE = 0.6;

// Change level constants
const CHANGE_LEVEL_NONE = "none";
const CHANGE_LEVEL_MINOR = "minor";
const CHANGE_LEVEL_MODERATE = "moderate";
const CHANGE_LEVEL_MAJOR = "major";

// SimHash implementation for soft content hashing
export class SimHash {
  /**
   * Generate a soft hash for content that's sensitive to changes but robust to minor variations
   * @param content - The content to hash
   * @returns 64-bit hash as a string
   */
  static hash(content: string): string {
    if (!content || content.length === 0) {
      return this.emptyHash();
    }

    // Normalize content
    const normalized = this.normalizeContent(content);

    // Extract features (k-grams)
    const features = this.extractFeatures(normalized);

    // Generate hash
    const hash = this.computeSimHash(features);

    return hash.toString(16).padStart(16, "0");
  }

  /**
   * Calculate similarity score between two hashes (0-1, where 1 is identical)
   * @param hash1 - First hash
   * @param hash2 - Second hash
   * @returns Similarity score between 0 and 1
   */
  static similarity(hash1: string, hash2: string): number {
    const h1 = BigInt(`0x${hash1}`);
    const h2 = BigInt(`0x${hash2}`);

    // Calculate Hamming distance
    const xor = h1 ^ h2;
    const hammingDistance = this.countBits(xor);

    // Convert to similarity score (0-1)
    return 1 - hammingDistance / HASH_BITS;
  }

  /**
   * Calculate difference score between two hashes (0-1, where 0 is identical)
   * @param hash1 - First hash
   * @param hash2 - Second hash
   * @returns Difference score between 0 and 1
   */
  static difference(hash1: string, hash2: string): number {
    return 1 - this.similarity(hash1, hash2);
  }

  /**
   * Check if two hashes are similar within a threshold
   * @param hash1 - First hash
   * @param hash2 - Second hash
   * @param threshold - Similarity threshold (default: 0.8)
   * @returns True if hashes are similar above threshold
   */
  static isSimilar(hash1: string, hash2: string, threshold: number = SIMILARITY_THRESHOLD_DEFAULT): boolean {
    return this.similarity(hash1, hash2) >= threshold;
  }

  /**
   * Get detailed comparison information between two hashes
   * @param hash1 - First hash
   * @param hash2 - Second hash
   * @returns Detailed comparison object
   */
  static compare(
    hash1: string,
    hash2: string
  ): {
    similarity: number;
    difference: number;
    hammingDistance: number;
    isSimilar: boolean;
    changeLevel: "none" | "minor" | "moderate" | "major";
  } {
    const similarity = this.similarity(hash1, hash2);
    const difference = 1 - similarity;
    const hammingDistance = Math.round(difference * HASH_BITS);

    let changeLevel: "none" | "minor" | "moderate" | "major";
    if (similarity >= SIMILARITY_THRESHOLD_NONE) changeLevel = CHANGE_LEVEL_NONE;
    else if (similarity >= SIMILARITY_THRESHOLD_MINOR) changeLevel = CHANGE_LEVEL_MINOR;
    else if (similarity >= SIMILARITY_THRESHOLD_MODERATE) changeLevel = CHANGE_LEVEL_MODERATE;
    else changeLevel = CHANGE_LEVEL_MAJOR;

    return {
      similarity,
      difference,
      hammingDistance,
      isSimilar: similarity >= SIMILARITY_THRESHOLD_DEFAULT,
      changeLevel,
    };
  }

  /**
   * Generate hash for empty content
   */
  private static emptyHash(): string {
    return EMPTY_HASH;
  }

  /**
   * Normalize content for consistent hashing
   */
  private static normalizeContent(content: string): string {
    return content
      .toLowerCase()
      .replace(/\s+/g, " ") // Normalize whitespace
      .replace(/[^\w\s]/g, "") // Remove punctuation
      .trim();
  }

  /**
   * Extract k-gram features from content
   */
  private static extractFeatures(content: string): Map<string, number> {
    const features = new Map<string, number>();

    for (let i = 0; i <= content.length - KGRAM_SIZE; i++) {
      const kgram = content.slice(i, i + KGRAM_SIZE);
      features.set(kgram, (features.get(kgram) || 0) + 1);
    }

    return features;
  }

  /**
   * Compute SimHash from features
   */
  private static computeSimHash(features: Map<string, number>): bigint {
    const weights = new Array(HASH_BITS).fill(0);

    for (const [feature, count] of features) {
      const hash = this.simpleHash(feature);

      for (let i = 0; i < HASH_BITS; i++) {
        const bit = (hash >> i) & 1;
        if (bit === 1) {
          weights[i] += count;
        } else {
          weights[i] -= count;
        }
      }
    }

    let result = BigInt(0);
    for (let i = 0; i < HASH_BITS; i++) {
      if (weights[i] > 0) {
        result |= BigInt(1) << BigInt(i);
      }
    }

    return result;
  }

  /**
   * Simple hash function for features
   */
  private static simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << HASH_SHIFT) - hash + char) >>> 0; // Use unsigned 32-bit
    }
    return hash;
  }

  /**
   * Count set bits in a BigInt
   */
  private static countBits(n: bigint): number {
    let count = 0;
    while (n > BigInt(0)) {
      count += Number(n & BigInt(1));
      n = n >> BigInt(1);
    }
    return count;
  }
}

/**
 * Content Hash Manager
 * Manages content hashing and comparison for tracking changes
 */
export class ContentHashManager {
  /**
   * Generate hash for content with metadata
   */
  static hashContent(
    content: string,
    metadata?: Record<string, unknown>
  ): {
    hash: string;
    timestamp: number;
    metadata?: Record<string, unknown>;
  } {
    return {
      hash: SimHash.hash(content),
      timestamp: Date.now(),
      metadata,
    };
  }

  /**
   * Compare two content hashes and return detailed analysis
   */
  static compareContent(
    content1: string,
    content2: string,
    metadata1?: Record<string, unknown>,
    metadata2?: Record<string, unknown>
  ): {
    hash1: string;
    hash2: string;
    comparison: ReturnType<typeof SimHash.compare>;
    timeDiff?: number;
    metadataDiff?: Record<string, unknown>;
  } {
    const hash1 = SimHash.hash(content1);
    const hash2 = SimHash.hash(content2);
    const comparison = SimHash.compare(hash1, hash2);

    const result: {
      hash1: string;
      hash2: string;
      comparison: ReturnType<typeof SimHash.compare>;
      timeDiff?: number;
      metadataDiff?: Record<string, unknown>;
    } = {
      hash1,
      hash2,
      comparison,
    };

    // Add time difference if metadata includes timestamps
    if (metadata1?.timestamp && metadata2?.timestamp && typeof metadata1.timestamp === "number" && typeof metadata2.timestamp === "number") {
      result.timeDiff = Math.abs(metadata1.timestamp - metadata2.timestamp);
    }

    // Add metadata differences
    if (metadata1 || metadata2) {
      result.metadataDiff = this.compareMetadata(metadata1, metadata2);
    }

    return result;
  }

  /**
   * Compare metadata objects
   */
  private static compareMetadata(metadata1?: Record<string, unknown>, metadata2?: Record<string, unknown>): Record<string, unknown> {
    if (!metadata1 && !metadata2) return {};

    const allKeys = new Set([...Object.keys(metadata1 || {}), ...Object.keys(metadata2 || {})]);

    const diff: Record<string, unknown> = {};

    for (const key of allKeys) {
      const val1 = metadata1?.[key];
      const val2 = metadata2?.[key];

      if (val1 !== val2) {
        diff[key] = {
          from: val1,
          to: val2,
          changed: true,
        };
      }
    }

    return diff;
  }

  /**
   * Batch compare multiple content items
   */
  static batchCompare(contents: Array<{ content: string; id: string; metadata?: Record<string, unknown> }>): Array<{
    id1: string;
    id2: string;
    comparison: ReturnType<typeof SimHash.compare>;
  }> {
    const results = [];

    for (let i = 0; i < contents.length; i++) {
      for (let j = i + 1; j < contents.length; j++) {
        const item1 = contents[i];
        const item2 = contents[j];

        results.push({
          id1: item1.id,
          id2: item2.id,
          comparison: SimHash.compare(SimHash.hash(item1.content), SimHash.hash(item2.content)),
        });
      }
    }

    return results;
  }
}
