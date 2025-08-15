import { z } from "zod";
import { efw } from "./efw";

const urlSchema = z.url();

export interface ValidationResult {
  isValid: boolean;
  validUrls: string[];
  invalidUrls: string[];
}

/**
 * Validates an array of URLs and returns validation results
 * @param urls - Array of URLs to validate
 * @returns ValidationResult with valid and invalid URLs separated
 */
export function validateUrls(urls: string[]): ValidationResult {
  const validUrls: string[] = [];
  const invalidUrls: string[] = [];

  for (const url of urls) {
    const [error] = efw(() => urlSchema.parse(url));
    if (error) {
      invalidUrls.push(url);
    } else {
      validUrls.push(url);
    }
  }

  return {
    isValid: invalidUrls.length === 0,
    validUrls,
    invalidUrls,
  };
}

/**
 * Validates a single URL
 * @param url - URL to validate
 * @returns boolean indicating if URL is valid
 */
export function validateUrl(url: string): boolean {
  const [error] = efw(() => urlSchema.parse(url));
  return !error;
}
