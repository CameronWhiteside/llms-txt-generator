import { efwAsync } from "./efw";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// Cloudflare Workers AI Models
export const AI_MODELS = {
  // Text Generation Models
  LLAMA_3_8B: "@cf/meta/llama-3-8b-instruct",
  LLAMA_3_2_3B: "@cf/meta/llama-3.2-3b-instruct",
} as const;

// AI Configuration
export interface AIConfig {
  model: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stream?: boolean;
}

// Default AI Configuration
export const DEFAULT_AI_CONFIG: AIConfig = {
  model: AI_MODELS.LLAMA_3_8B,
  maxTokens: 4096,
  temperature: 0.7,
  topP: 0.9,
  stream: false,
};

// AI Response Types
export interface AIResponse {
  response: string;
  model: string;
  tokens: number;
  latency: number;
}

export interface AIError {
  error: string;
  model: string;
  details?: string;
}

/**
 * Generate text using Cloudflare Workers AI
 * @param prompt - The prompt to send to the AI
 * @param config - AI configuration options
 * @param ai - Cloudflare AI binding
 * @returns Promise<AIResponse | AIError>
 */
export async function generateText(prompt: string, config: Partial<AIConfig> = {}): Promise<AIResponse | AIError> {
  const finalConfig = { ...DEFAULT_AI_CONFIG, ...config };
  const ai = getCloudflareContext().env.AI;

  const [error, response] = await efwAsync(
    ai.run(finalConfig.model, {
      prompt,
      max_tokens: finalConfig.maxTokens,
      temperature: finalConfig.temperature,
      top_p: finalConfig.topP,
      stream: finalConfig.stream,
    })
  );

  if (error) {
    console.log("OPE AI ERROR", error);

    return {
      error: "AI generation failed",
      model: finalConfig.model,
      details: error.message,
    };
  }

  return {
    response: typeof response === "string" ? response : response.response,
    model: finalConfig.model,
    tokens: response.tokens || 0,
    latency: response.latency || 0,
  };
}

/**
 * Generate text with streaming support
 * @param prompt - The prompt to send to the AI
 * @param config - Partial<AIConfig> - AI configuration options
 * @param ai - Cloudflare AI binding
 * @returns Promise<ReadableStream | AIError>
 */
export async function generateTextStream(prompt: string, config: Partial<AIConfig> = {}): Promise<ReadableStream | AIError> {
  const finalConfig = { ...DEFAULT_AI_CONFIG, ...config, stream: true };
  const ai = getCloudflareContext().env.AI;

  const [error, stream] = await efwAsync(
    ai.run(finalConfig.model, {
      prompt,
      max_tokens: finalConfig.maxTokens,
      temperature: finalConfig.temperature,
      top_p: finalConfig.topP,
      stream: true,
    })
  );

  if (error) {
    throw new Error(`AI streaming failed: ${error.message}`);
  }

  return stream as unknown as ReadableStream;
}

/**
 * Validate if a model is supported
 * @param model - Model name to validate
 * @returns boolean indicating if model is supported
 */
export function isValidModel(model: string): boolean {
  return Object.values(AI_MODELS).includes(model as (typeof AI_MODELS)[keyof typeof AI_MODELS]);
}

/**
 * Get model information
 * @param model - Model name
 * @returns Model information or null if not found
 */
export function getModelInfo(model: string): { name: string; type: string } | null {
  const modelMap: Record<string, { name: string; type: string }> = {
    [AI_MODELS.LLAMA_3_2_3B]: { name: "Llama 3.2 3B", type: "text" },
    [AI_MODELS.LLAMA_3_8B]: { name: "Llama 3.8B", type: "text" },
  };

  return modelMap[model] || null;
}
