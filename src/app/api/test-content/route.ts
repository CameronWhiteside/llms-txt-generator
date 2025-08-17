import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { ContentHashManager } from "@/lib/softHash";
import { createUrlMetaStoreClient } from "@/durable-objects/UrlMetaStore";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      urls: string[];
      originalContent: string;
      updatedContent: string;
    };
    const { urls, originalContent, updatedContent } = body;

    if (!urls || !originalContent || !updatedContent) {
      return new NextResponse(
        JSON.stringify(
          {
            error: "urls, originalContent, and updatedContent are required",
          },
          null,
          2
        ),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const env = getCloudflareContext().env;

    // Generate hashes for comparison
    const originalHash = ContentHashManager.hashContent(originalContent, { urls });
    const updatedHash = ContentHashManager.hashContent(updatedContent, { urls, updated: true });

    // Store original content in Durable Object
    console.log(`💾 Storing original content in Durable Object`);
    if (env?.URL_META_STORE) {
      try {
        const dbClient = createUrlMetaStoreClient();
        await dbClient.storeContent(urls[0], originalContent, originalContent, 0.8, {
          test: true,
          original: true,
          contentLength: originalContent.length,
          urls,
        });
        console.log(`✅ Successfully stored original content in Durable Object`);
      } catch (dbError) {
        console.log(`❌ Failed to store original content in Durable Object:`, dbError);
      }
    }

    // Update content using the content endpoint
    console.log(`🔄 Testing update functionality`);
    const updateRes = await fetch(`${new URL(request.url).origin}/api/content`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        urls,
        content: updatedContent,
        originalHash: originalHash.hash,
      }),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateResult = (await updateRes.json()) as any;

    // Get the updated content from Durable Object to verify
    let retrievedContent = null;
    if (env?.URL_META_STORE) {
      try {
        const dbClient = createUrlMetaStoreClient();
        const cacheResult = await dbClient.checkCache(urls[0], updatedContent, 0.8);
        if (cacheResult.cached && cacheResult.llmsTxt) {
          retrievedContent = cacheResult.llmsTxt;
        }
      } catch (dbError) {
        console.log(`❌ Failed to retrieve updated content from Durable Object:`, dbError);
      }
    }

    return new NextResponse(
      JSON.stringify(
        {
          test: {
            urls,
            originalContent: {
              length: originalContent.length,
              preview: originalContent.substring(0, 100) + (originalContent.length > 100 ? "..." : ""),
              hash: originalHash.hash,
            },
            updatedContent: {
              length: updatedContent.length,
              preview: updatedContent.substring(0, 100) + (updatedContent.length > 100 ? "..." : ""),
              hash: updatedHash.hash,
            },
            updateResult,
            retrievedContent: retrievedContent
              ? {
                  content: retrievedContent.substring(0, 100) + (retrievedContent.length > 100 ? "..." : ""),
                  length: retrievedContent.length,
                }
              : null,
            analysis: {
              "Update API call successful": updateRes.ok,
              "Update result success": updateResult.success,
              "Content retrieved after update": !!retrievedContent,
              "Content matches updated content": retrievedContent === updatedContent,
            },
          },
        },
        null,
        2
      ),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new NextResponse(
      JSON.stringify(
        {
          error: "Failed to test update functionality",
          details: error instanceof Error ? error.message : String(error),
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

export async function GET() {
  return new NextResponse(
    JSON.stringify(
      {
        demo: {
          description: "Test the content update functionality",
          instructions: "POST to this endpoint with urls, originalContent, and updatedContent",
          example: {
            urls: ["https://example.com"],
            originalContent: "This is the original llms.txt content.",
            updatedContent: "This is the updated llms.txt content with changes.",
          },
          expectedBehavior: {
            "Store original": "Original content should be stored in R2",
            "Update content": "Update API should overwrite the content",
            "Retrieve updated": "Retrieved content should match the updated content",
            "Key consistency": "Should use the same key (based on original hash) for both store and update",
          },
        },
      },
      null,
      2
    ),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}
