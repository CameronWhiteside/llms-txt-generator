/**
 * Basic HTML sanitization library
 * Removes potentially dangerous HTML tags and attributes
 */

// Tags that are considered safe
export const ALLOWED_TAGS = ["p", "div", "span", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "br", "hr", "strong", "em", "b", "i", "blockquote", "pre", "code", "a", "img"];

// Attributes that are considered safe
export const ALLOWED_ATTRIBUTES = ["href", "src", "alt", "title", "class", "id", "style"];

/**
 * Sanitizes HTML content by removing dangerous tags and attributes
 * @param html - Raw HTML string to sanitize
 * @returns Sanitized HTML string
 */
export function sanitizeHTML(html: string): string {
  if (!html || typeof html !== "string") {
    return "";
  }

  // Remove script tags and their content
  let sanitized = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");

  // Remove style tags and their content
  sanitized = sanitized.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");

  // Remove iframe tags
  sanitized = sanitized.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "");

  // Remove object tags
  sanitized = sanitized.replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, "");

  // Remove embed tags
  sanitized = sanitized.replace(/<embed\b[^>]*>/gi, "");

  // Remove on* event handlers from all tags
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, "");

  // Remove javascript: URLs
  sanitized = sanitized.replace(/javascript:/gi, "");

  // Remove data: URLs (except for images)
  sanitized = sanitized.replace(/data:(?!image\/)/gi, "");

  return sanitized;
}

/**
 * Extracts text content from HTML, removing all HTML tags
 * @param html - HTML string to extract text from
 * @returns Plain text content
 */
export function extractTextFromHTML(html: string): string {
  if (!html || typeof html !== "string") {
    return "";
  }

  // Remove HTML tags
  let text = html.replace(/<[^>]*>/g, "");

  // Decode HTML entities
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, " ");

  // Remove extra whitespace
  text = text.replace(/\s+/g, " ").trim();

  return text;
}

/**
 * Sanitizes HTML and extracts text content
 * @param html - Raw HTML string
 * @returns Object containing both sanitized HTML and plain text
 */
export function processHTML(html: string): { sanitizedHTML: string; plainText: string } {
  const sanitizedHTML = sanitizeHTML(html);
  const plainText = extractTextFromHTML(sanitizedHTML);

  return {
    sanitizedHTML,
    plainText,
  };
}
