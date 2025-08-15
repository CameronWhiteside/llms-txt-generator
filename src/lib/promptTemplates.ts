/**
 * Prompt Templates for AI interactions
 * Contains structured prompts for different use cases
 */

// Base prompt template for llms.txt generation
const LLMS_TXT_BASE_PROMPT = `You are an expert at analyzing web content and creating comprehensive llms.txt files in Markdown format.

CRITICAL: You must ONLY use information that is explicitly present in the provided content. Do NOT add any information, facts, or details that are not directly stated in the content. Do NOT make assumptions, inferences, or creative interpretations beyond what is reasonable to infer from the content itself.

Your task is to analyze the provided HTML content and create an llms.txt file that accurately represents what is actually stated in the content.

IMPORTANT: Respond ONLY with the markdown content. Do not include any introductory text, explanations, or wrapper text. Start directly with the markdown headers and content.`;

// Instructions for llms.txt structure
const LLMS_TXT_INSTRUCTIONS = `
Please create an llms.txt file in Markdown format with the following structure:

# [Title]
Use the actual title from the content, or create a descriptive title based on what is explicitly stated

## Summary
ALWAYS include a summary section. Write a concise 2-3 sentence summary based on the main content provided. Even if the content is minimal, create a brief summary of what is available.

## Key Topics
- List the main topics, themes, or subjects that are explicitly mentioned in the content
- If no specific topics are mentioned, omit this section

## Important Information
- Extract and organize key facts, data, or important details that are explicitly stated
- If no specific information is provided, omit this section

## Contact Information
- Include contact details, social media, or communication channels that are explicitly mentioned
- If no contact information is provided, omit this section

## Services/Products
- List services, products, or offerings that are explicitly described in the content
- If no services/products are mentioned, omit this section

## Target Audience
- If the content explicitly states who it is intended for, include that information
- If not explicitly stated, you may make reasonable assumptions about the target audience based on the content type, language, and context
- If no reasonable inference can be made, omit this section

## Call to Action
- Include specific actions that are explicitly mentioned in the content
- If no call to action is provided, omit this section

## Additional Notes
- Include other relevant information that is explicitly stated in the content
- If no additional information is available, omit this section

IMPORTANT:
- ALWAYS include the Summary section, even if brief
- Only include other sections if relevant information is available
- For Target Audience, you may make reasonable assumptions based on content context
- Remove sections entirely if no relevant information is present`;

// Content analysis instructions
const CONTENT_ANALYSIS_INSTRUCTIONS = `
When analyzing the content:
- Extract information that is explicitly stated in the provided content
- For the Summary section, always provide a brief overview even if content is minimal
- For Target Audience, you may make reasonable assumptions based on content type, language, and context
- Do NOT add information that is not present or reasonably inferable from the content
- Use the exact facts, names, dates, numbers, and locations that are provided
- If information is unclear or incomplete, do NOT fill in gaps beyond reasonable inference
- Maintain accuracy while allowing for reasonable contextual understanding
- If a section has no relevant information, omit it entirely`;

/**
 * Generate a comprehensive prompt for creating llms.txt files
 * @param htmlContent - The sanitized HTML content to analyze
 * @param additionalContext - Optional additional context or requirements
 * @returns Formatted prompt string
 */
export function generateLLMSTxtPrompt(htmlContent: string, additionalContext?: string): string {
  const contextSection = additionalContext ? `\n\nAdditional Context:\n${additionalContext}` : "";

  return `${LLMS_TXT_BASE_PROMPT}

${LLMS_TXT_INSTRUCTIONS}

${CONTENT_ANALYSIS_INSTRUCTIONS}

${contextSection}

Content to Analyze:
${htmlContent}

CRITICAL REMINDER: Only use information that is explicitly present in the content above. Do not add any information that is not directly stated.

Generate ONLY the markdown content:`;
}

/**
 * Generate a prompt for summarizing content
 * @param htmlContent - The sanitized HTML content to summarize
 * @param maxLength - Maximum length for the summary (default: 200 words)
 * @returns Formatted prompt string
 */
export function generateSummaryPrompt(htmlContent: string, maxLength: number = 200): string {
  return `You are an expert content summarizer. Please create a concise, informative summary of the following content.

Requirements:
- Maximum ${maxLength} words
- Capture the main points and key information
- Use clear, professional language
- Maintain factual accuracy
- Focus on the most important details

Content to summarize:
${htmlContent}

Summary:`;
}

/**
 * Generate a prompt for extracting key information
 * @param htmlContent - The sanitized HTML content
 * @param informationType - Type of information to extract (e.g., "contact details", "pricing", "features")
 * @returns Formatted prompt string
 */
export function generateExtractionPrompt(htmlContent: string, informationType: string): string {
  return `You are an expert at extracting specific information from web content.

Please extract all ${informationType} from the following content. Format your response as a clear, organized list.

Content to analyze:
${htmlContent}

Extracted ${informationType}:`;
}

/**
 * Generate a prompt for content categorization
 * @param htmlContent - The sanitized HTML content
 * @param categories - Array of possible categories
 * @returns Formatted prompt string
 */
export function generateCategorizationPrompt(htmlContent: string, categories: string[]): string {
  return `You are an expert at categorizing web content.

Please analyze the following content and categorize it into one or more of the provided categories. You may select multiple categories if appropriate.

Available categories:
${categories.map((cat) => `- ${cat}`).join("\n")}

Content to categorize:
${htmlContent}

Selected categories (explain your reasoning):`;
}

/**
 * Generate a custom prompt with specific instructions
 * @param htmlContent - The sanitized HTML content
 * @param instructions - Custom instructions for the AI
 * @returns Formatted prompt string
 */
export function generateCustomPrompt(htmlContent: string, instructions: string): string {
  return `You are an expert content analyst. Please follow the specific instructions below to analyze the provided content.

Instructions:
${instructions}

Content to analyze:
${htmlContent}

Response:`;
}
