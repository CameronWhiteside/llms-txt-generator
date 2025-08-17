import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createUrlMetaStoreClient } from "@/durable-objects/UrlMetaStore";
import { SimHash } from "@/lib/softHash";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      url: string;
      originalContent: string;
      newContent: string;
      threshold?: number;
    };
    const { url, originalContent, newContent, threshold = 0.8 } = body;

    if (!url || !originalContent || !newContent) {
      return new NextResponse(
        JSON.stringify(
          {
            error: "url, originalContent, and newContent are required",
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
    if (!env?.URL_META_STORE) {
      return new NextResponse(
        JSON.stringify(
          {
            error: "URL_META_STORE not available",
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

    // Generate hashes for comparison
    const originalHash = SimHash.hash(originalContent);
    const newHash = SimHash.hash(newContent);
    const similarity = SimHash.similarity(originalHash, newHash);

    // Store original content in cache
    const dbClient = createUrlMetaStoreClient();
    const sampleLLMsTxt = "This is a sample llms.txt content for testing.";

    console.log(`💾 Storing original content for ${url}`);
    await dbClient.storeContent(url, originalContent, sampleLLMsTxt, threshold, {
      test: true,
      timestamp: Date.now(),
    });

    // Test cache check with new content
    console.log(`🔍 Testing cache check with new content for ${url}`);
    const cacheResult = await dbClient.checkCache(url, newContent, threshold);

    // Get the stored record to verify
    const storedRecord = await dbClient.getLatestRecordForUrl(url);

    return new NextResponse(
      JSON.stringify(
        {
          test: {
            url,
            threshold,
            originalContent: {
              length: originalContent.length,
              preview: originalContent.substring(0, 100) + (originalContent.length > 100 ? "..." : ""),
              hash: originalHash,
            },
            newContent: {
              length: newContent.length,
              preview: newContent.substring(0, 100) + (newContent.length > 100 ? "..." : ""),
              hash: newHash,
            },
            directComparison: {
              similarity,
              difference: 1 - similarity,
              isSimilar: similarity >= threshold,
            },
            cacheResult: {
              cached: cacheResult.cached,
              similarity: cacheResult.similarity,
              threshold: cacheResult.threshold,
              contentHash: cacheResult.contentHash,
              llmsTxt: cacheResult.llmsTxt ? "Cached llms.txt returned" : "No llms.txt returned",
            },
            storedRecord: storedRecord
              ? {
                  url: storedRecord.url,
                  contentHash: storedRecord.contentHash,
                  timestamp: storedRecord.timestamp,
                  queryCount: storedRecord.queryCount,
                }
              : null,
            analysis: {
              "Direct similarity calculation": similarity,
              "Cache similarity calculation": cacheResult.similarity,
              "Similarity match": Math.abs(similarity - (cacheResult.similarity || 0)) < 0.001,
              "Cache hit expected": similarity >= threshold,
              "Cache hit actual": cacheResult.cached,
              "Test passed": similarity >= threshold === cacheResult.cached,
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
          error: "Failed to test cache similarity",
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
  // Demo with sample content
  const sampleUrl = "https://example.com/test";
  const originalContent = "This is the original content for testing cache similarity. It contains some text that we want to compare.";
  const similarContent = "This is the original content for testing cache similarity. It contains some text that we want to compare with minor changes.";
  const differentContent = "This is completely different content that should have a very low similarity score and not trigger a cache hit.";

  const originalHash = SimHash.hash(originalContent);
  const similarHash = SimHash.hash(similarContent);
  const differentHash = SimHash.hash(differentContent);

  const similarityOriginalVsSimilar = SimHash.similarity(originalHash, similarHash);
  const similarityOriginalVsDifferent = SimHash.similarity(originalHash, differentHash);

  return new NextResponse(
    JSON.stringify(
      {
        demo: {
          url: sampleUrl,
          originalContent: {
            content: originalContent,
            hash: originalHash,
          },
          similarContent: {
            content: similarContent,
            hash: similarHash,
            similarity: similarityOriginalVsSimilar,
            shouldCacheHit: similarityOriginalVsSimilar >= 0.8,
          },
          differentContent: {
            content: differentContent,
            hash: differentHash,
            similarity: similarityOriginalVsDifferent,
            shouldCacheHit: similarityOriginalVsDifferent >= 0.8,
          },
          thresholds: {
            default: 0.8,
            strict: 0.9,
            loose: 0.7,
          },
          instructions: {
            "To test cache similarity": "POST to this endpoint with url, originalContent, newContent, and optional threshold",
            "Expected behavior": "Similarity should be calculated dynamically each time, not stored in cache",
            "Cache hit": "Should occur when similarity >= threshold",
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
