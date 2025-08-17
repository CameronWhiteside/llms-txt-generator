import { NextResponse } from "next/server";
import { z } from "zod";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { STATUS_CODES, ERROR_MESSAGES, DEFAULT_HEADERS } from "@/lib/errors";
import { efwAsync } from "@/lib/efw";
import { ContentHashManager } from "@/lib/softHash";
import { generateText, AI_MODELS } from "@/lib/ai";
import { createUrlMetaStoreClient } from "@/durable-objects/UrlMetaStore";

const updateWithFeedbackSchema = z.object({
  urls: z.union([z.url(), z.array(z.url())]),
  currentContent: z.string().min(1, "Current content cannot be empty"),
  feedback: z.string().min(1, "Feedback cannot be empty"),
  model: z.string().optional(),
  originalHash: z.string().optional(), // Optional: if provided, use this as the key
});

interface UpdateWithFeedbackResult {
  success: boolean;
  error?: string;
  originalContent?: string;
  revisedContent?: string;
  feedback?: string;
  aiTokens?: number;
  aiLatency?: number;
  contentHash?: {
    hash: string;
    timestamp: number;
    metadata?: Record<string, unknown>;
  };
}

export async function POST(request: Request) {
  console.log("🤖 Update with Feedback API called");

  const [jsonError, body] = await efwAsync(request.json());

  if (jsonError) {
    console.log("❌ JSON parse error:", jsonError);
    return new NextResponse(ERROR_MESSAGES.INVALID_REQUEST_FORMAT, {
      status: STATUS_CODES.BAD_REQUEST,
      headers: DEFAULT_HEADERS,
    });
  }

  const parsedBody = updateWithFeedbackSchema.safeParse(body);

  if (!parsedBody.success) {
    console.log("❌ Request validation error:", parsedBody.error);
    return new NextResponse(ERROR_MESSAGES.INVALID_REQUEST_FORMAT, {
      status: STATUS_CODES.BAD_REQUEST,
      headers: DEFAULT_HEADERS,
    });
  }

  const { urls, currentContent, feedback, model = AI_MODELS.LLAMA_3_8B, originalHash } = parsedBody.data;
  console.log("📋 Update with feedback params:", {
    urls,
    currentContentLength: currentContent.length,
    feedbackLength: feedback.length,
    model,
    hasOriginalHash: !!originalHash,
  });

  // Convert single URL to array for consistent handling
  const urlArray = Array.isArray(urls) ? urls : [urls];
  console.log("🔗 URLs to update:", urlArray);

  const env = getCloudflareContext().env;

  try {
    // Generate AI prompt for content revision
    const revisionPrompt = `You are an expert at creating llms.txt files. You have been given the current content and specific feedback for improvement.

CURRENT LLMS.TXT CONTENT:
${currentContent}

USER FEEDBACK FOR IMPROVEMENT:
${feedback}

IMPORTANT: Revise the llms.txt content according to the user's feedback. Maintain the llms.txt format and structure while incorporating the requested changes.

CRITICAL: Return ONLY the revised llms.txt content. Do not include any explanatory text, introductions, or meta-commentary. Do not say "Here is the revised content:" or anything similar. Return ONLY the pure markdown content.

REVISED LLMS.TXT CONTENT:`;

    console.log(`🤖 Generating revised content with ${model}...`);
    const aiResult = await generateText(revisionPrompt, { model });

    if ("error" in aiResult) {
      console.log(`❌ AI generation failed:`, aiResult.error);
      const result: UpdateWithFeedbackResult = {
        success: false,
        error: `AI generation failed: ${aiResult.error}`,
      };

      return new NextResponse(JSON.stringify(result, null, 2), {
        status: STATUS_CODES.INTERNAL_SERVER_ERROR,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    console.log(`✅ AI generation successful, response length: ${aiResult.response.length}`);

    // Generate content hash for the revised content
    const contentHash = ContentHashManager.hashContent(aiResult.response, {
      urls: urlArray,
      updated: true,
      revised: true,
      feedback: feedback,
      contentLength: aiResult.response.length,
      processingTime: Date.now(),
    });
    console.log(`🔐 Revised content hash:`, contentHash.hash);

    // Update the Durable Object with the revised content
    if (env?.URL_META_STORE) {
      try {
        const dbClient = createUrlMetaStoreClient();
        await dbClient.updateLlmsTxt(urlArray[0], aiResult.response, {
          model,
          aiTokens: aiResult.tokens,
          aiLatency: aiResult.latency,
          contentLength: aiResult.response.length,
          processingTime: Date.now(),
          revised: true,
          feedback: feedback,
        });
        console.log(`✅ Successfully updated Durable Object with revised content`);
      } catch (dbError) {
        console.log(`❌ Failed to update Durable Object:`, dbError);
        // Don't fail the request if Durable Object update fails
      }
    }

    const result: UpdateWithFeedbackResult = {
      success: true,
      originalContent: currentContent,
      revisedContent: aiResult.response,
      feedback: feedback,
      aiTokens: aiResult.tokens,
      aiLatency: aiResult.latency,
      contentHash,
    };

    console.log(`💾 Durable Object revision completed`);

    console.log(`✅ Successfully revised content in Durable Object`);
    return new NextResponse(JSON.stringify(result, null, 2), {
      status: STATUS_CODES.OK,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.log("❌ Update with feedback error:", error);
    const result: UpdateWithFeedbackResult = {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };

    return new NextResponse(JSON.stringify(result, null, 2), {
      status: STATUS_CODES.INTERNAL_SERVER_ERROR,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }
}
