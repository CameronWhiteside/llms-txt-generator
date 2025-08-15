import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createUrlMetaStoreClient } from "@/durable-objects/UrlMetaStore";

export async function GET() {
  const { env } = getCloudflareContext();

  if (!env?.URL_META_STORE) {
    return new NextResponse(
      JSON.stringify(
        {
          error: "URL Meta Store not available",
          message: "Durable Object binding not found",
        },
        null,
        2
      ),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  try {
    const dbClient = createUrlMetaStoreClient();
    const stats = await dbClient.getStats();

    return new NextResponse(
      JSON.stringify(
        {
          success: true,
          message: "Durable Object is working!",
          stats,
          timestamp: new Date().toISOString(),
        },
        null,
        2
      ),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new NextResponse(
      JSON.stringify(
        {
          error: "Durable Object test failed",
          details: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        },
        null,
        2
      ),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

export async function POST(request: Request) {
  const { env } = getCloudflareContext();

  if (!env?.URL_META_STORE) {
    return new NextResponse(
      JSON.stringify(
        {
          error: "URL Meta Store not available",
        },
        null,
        2
      ),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  try {
    const body = (await request.json()) as {
      url: string;
      content: string;
      llmsTxt: string;
      threshold?: number;
    };
    const { url, content, llmsTxt, threshold = 0.8 } = body;

    const dbClient = createUrlMetaStoreClient();

    // Test storing content
    await dbClient.storeContent(url, content, llmsTxt, threshold, {
      test: true,
      timestamp: Date.now(),
    });

    // Test checking cache
    const cacheResult = await dbClient.checkCache(url, content, threshold);

    return new NextResponse(
      JSON.stringify(
        {
          success: true,
          message: "Content stored and cache checked successfully",
          stored: {
            url,
            contentLength: content.length,
            llmsTxtLength: llmsTxt.length,
            threshold,
          },
          cacheResult,
          timestamp: new Date().toISOString(),
        },
        null,
        2
      ),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new NextResponse(
      JSON.stringify(
        {
          error: "Durable Object operation failed",
          details: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        },
        null,
        2
      ),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
