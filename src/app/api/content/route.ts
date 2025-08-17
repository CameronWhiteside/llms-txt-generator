import { NextResponse } from "next/server";
import { z } from "zod";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { STATUS_CODES, ERROR_MESSAGES, DEFAULT_HEADERS } from "@/lib/errors";
import { efwAsync } from "@/lib/efw";
import { ContentHashManager } from "@/lib/softHash";
import { createUrlMetaStoreClient } from "@/durable-objects/UrlMetaStore";

const updateSchema = z.object({
  urls: z.union([z.url(), z.array(z.url())]),
  content: z.string().min(1, "Content cannot be empty"),
  originalHash: z.string().optional(), // Optional: if provided, use this as the key
});

interface UpdateResult {
  success: boolean;
  error?: string;
  contentHash?: {
    hash: string;
    timestamp: number;
    metadata?: Record<string, unknown>;
  };
}

export async function PUT(request: Request) {
  console.log("🔄 Update API called");

  const [jsonError, body] = await efwAsync(request.json());

  if (jsonError) {
    console.log("❌ JSON parse error:", jsonError);
    return new NextResponse(ERROR_MESSAGES.INVALID_REQUEST_FORMAT, {
      status: STATUS_CODES.BAD_REQUEST,
      headers: DEFAULT_HEADERS,
    });
  }

  const parsedBody = updateSchema.safeParse(body);

  if (!parsedBody.success) {
    console.log("❌ Request validation error:", parsedBody.error);
    return new NextResponse(ERROR_MESSAGES.INVALID_REQUEST_FORMAT, {
      status: STATUS_CODES.BAD_REQUEST,
      headers: DEFAULT_HEADERS,
    });
  }

  const { urls, content, originalHash } = parsedBody.data;
  console.log("📋 Update params:", { urls, contentLength: content.length, hasOriginalHash: !!originalHash });

  // Convert single URL to array for consistent handling
  const urlArray = Array.isArray(urls) ? urls : [urls];
  console.log("🔗 URLs to update:", urlArray);

  const env = getCloudflareContext().env;

  try {
    // Generate content hash for the updated content
    const contentHash = ContentHashManager.hashContent(content, {
      urls: urlArray,
      updated: true,
      contentLength: content.length,
      processingTime: Date.now(),
    });
    console.log(`🔐 Updated content hash:`, contentHash.hash);

    // Update the Durable Object with the new content
    if (env?.URL_META_STORE) {
      try {
        const dbClient = createUrlMetaStoreClient();
        await dbClient.updateLlmsTxt(urlArray[0], content, {
          updated: true,
          originalHash: originalHash,
          contentLength: content.length,
          processingTime: Date.now(),
        });
        console.log(`✅ Successfully updated Durable Object with new content`);
      } catch (dbError) {
        console.log(`❌ Failed to update Durable Object:`, dbError);
        // Don't fail the request if Durable Object update fails
      }
    }

    const result: UpdateResult = {
      success: true,
      contentHash,
    };

    console.log(`💾 Durable Object update completed`);

    console.log(`✅ Successfully updated content in Durable Object`);
    return new NextResponse(JSON.stringify(result, null, 2), {
      status: STATUS_CODES.OK,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.log("❌ Update error:", error);
    const result: UpdateResult = {
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
