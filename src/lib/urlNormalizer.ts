/**
 * URL Normalizer
 * Normalizes URLs for consistent cache key generation
 * Removes protocols (http://, https://), www, and normalizes trailing slashes
 */

export class UrlNormalizer {
  /**
   * Normalize a URL for cache key generation
   * @param url - The URL to normalize
   * @returns Normalized URL string
   */
  static normalize(url: string): string {
    if (!url || typeof url !== "string") {
      return "";
    }

    let normalized = url.trim().toLowerCase();

    // Remove protocol (http:// or https://)
    normalized = normalized.replace(/^https?:\/\//, "");

    // Remove www. prefix
    normalized = normalized.replace(/^www\./, "");

    // Ensure trailing slash
    if (!normalized.endsWith("/")) {
      normalized += "/";
    }

    // Remove any duplicate slashes (except for the protocol part)
    normalized = normalized.replace(/\/+/g, "/");

    return normalized;
  }

  /**
   * Normalize an array of URLs
   * @param urls - Array of URLs to normalize
   * @returns Array of normalized URLs
   */
  static normalizeArray(urls: string[]): string[] {
    return urls.map((url) => this.normalize(url)).filter((url) => url.length > 0);
  }

  /**
   * Generate a cache key from normalized URLs
   * @param urls - Array of URLs to generate cache key from
   * @returns Normalized cache key string
   */
  static generateCacheKey(urls: string[]): string {
    const normalizedUrls = this.normalizeArray(urls);
    return normalizedUrls.sort().join("|");
  }

  /**
   * Compare two URLs for equality after normalization
   * @param url1 - First URL
   * @param url2 - Second URL
   * @returns True if URLs are equivalent after normalization
   */
  static areEquivalent(url1: string, url2: string): boolean {
    return this.normalize(url1) === this.normalize(url2);
  }

  /**
   * Get the domain from a normalized URL
   * @param url - The URL to extract domain from
   * @returns Domain string
   */
  static getDomain(url: string): string {
    const normalized = this.normalize(url);
    return normalized.split("/")[0];
  }

  /**
   * Get the path from a normalized URL
   * @param url - The URL to extract path from
   * @returns Path string (with leading slash)
   */
  static getPath(url: string): string {
    const normalized = this.normalize(url);
    const parts = normalized.split("/");
    if (parts.length <= 1) {
      return "/";
    }
    return "/" + parts.slice(1).join("/");
  }

  /**
   * Check if a URL is the root URL (domain only)
   * @param url - The URL to check
   * @returns True if URL is root
   */
  static isRoot(url: string): boolean {
    const normalized = this.normalize(url);
    return normalized.split("/").length === 2; // domain + empty string
  }

  /**
   * Debug function to show normalization steps
   * @param url - The URL to debug
   * @returns Object showing each normalization step
   */
  static debug(url: string): {
    original: string;
    trimmed: string;
    lowercase: string;
    noProtocol: string;
    noWww: string;
    withTrailingSlash: string;
    final: string;
  } {
    const original = url;
    const trimmed = url.trim();
    const lowercase = trimmed.toLowerCase();
    const noProtocol = lowercase.replace(/^https?:\/\//, "");
    const noWww = noProtocol.replace(/^www\./, "");
    const withTrailingSlash = noWww.endsWith("/") ? noWww : noWww + "/";
    const final = withTrailingSlash.replace(/\/+/g, "/");

    return {
      original,
      trimmed,
      lowercase,
      noProtocol,
      noWww,
      withTrailingSlash,
      final,
    };
  }
}
