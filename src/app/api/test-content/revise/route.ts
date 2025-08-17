import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { ContentHashManager } from "@/lib/softHash";
import { createUrlMetaStoreClient } from "@/durable-objects/UrlMetaStore";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      urls: string[];
      originalContent: string;
      feedback: string;
      model?: string;
    };
    const { urls, originalContent, feedback, model } = body;

    if (!urls || !originalContent || !feedback) {
      return new NextResponse(
        JSON.stringify(
          {
            error: "urls, originalContent, and feedback are required",
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

    // Test feedback revision using the content/revise endpoint
    console.log(`🤖 Testing feedback revision functionality`);
    const feedbackRes = await fetch(`${new URL(request.url).origin}/api/content/revise`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        urls,
        currentContent: originalContent,
        feedback: feedback,
        model: model,
        originalHash: originalHash.hash,
      }),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const feedbackResult = (await feedbackRes.json()) as any;

    // Get the revised content from Durable Object to verify
    let revisedContent = null;
    if (env?.URL_META_STORE) {
      try {
        const dbClient = createUrlMetaStoreClient();
        const cacheResult = await dbClient.checkCache(urls[0], originalContent, 0.8);
        if (cacheResult.cached && cacheResult.llmsTxt) {
          revisedContent = cacheResult.llmsTxt;
        }
      } catch (dbError) {
        console.log(`❌ Failed to retrieve revised content from Durable Object:`, dbError);
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
            feedback: {
              text: feedback,
              length: feedback.length,
            },
            feedbackResult,
            revisedContent: revisedContent
              ? {
                  content: revisedContent.substring(0, 100) + (revisedContent.length > 100 ? "..." : ""),
                  length: revisedContent.length,
                }
              : null,
            analysis: {
              "Feedback API call successful": feedbackRes.ok,
              "Feedback result success": feedbackResult.success,
              "Content retrieved after revision": !!revisedContent,
              "Content was revised": revisedContent !== originalContent,
              "AI tokens used": feedbackResult.aiTokens,
              "AI latency": feedbackResult.aiLatency,
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
          error: "Failed to test feedback functionality",
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
          description: "Test the AI content revision functionality",
          instructions: "POST to this endpoint with urls, originalContent, and feedback",
          example: {
            urls: ["https://example.com"],
            originalContent: "This is a sample llms.txt content that needs improvement.",
            feedback: "Make the tone more professional and add more technical details about the services offered.",
            model: "llama-3.2-3b-instruct",
          },
          expectedBehavior: {
            "Store original": "Original content should be stored in R2",
            "AI revision": "AI should revise content based on feedback",
            "Store revised": "Revised content should be stored in R2",
            "Key consistency": "Should use the same key (based on original hash) for both store and revision",
            "Metadata tracking": "Should track feedback, AI tokens, and latency in metadata",
          },
          feedbackExamples: [
            "Make the tone more professional and formal",
            "Add more technical details about the API endpoints",
            "Simplify the language for a general audience",
            "Include more examples of use cases",
            "Make it more concise and to the point",
            "Add information about pricing and plans",
          ],
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
