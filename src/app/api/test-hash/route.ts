import { NextResponse } from "next/server";
import { SimHash, ContentHashManager } from "@/lib/softHash";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { content1: string; content2: string };
    const { content1, content2 } = body;

    if (!content1 || !content2) {
      return new NextResponse(
        JSON.stringify(
          {
            error: "Both content1 and content2 are required",
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

    // Generate hashes
    const hash1 = SimHash.hash(content1);
    const hash2 = SimHash.hash(content2);

    // Compare content
    const comparison = ContentHashManager.compareContent(
      content1,
      content2,
      {
        source: "test1",
        timestamp: Date.now(),
      },
      {
        source: "test2",
        timestamp: Date.now(),
      }
    );

    // Test similarity thresholds
    const similarityTests = {
      isSimilar: SimHash.isSimilar(hash1, hash2),
      isSimilarStrict: SimHash.isSimilar(hash1, hash2, 0.9),
      isSimilarLoose: SimHash.isSimilar(hash1, hash2, 0.7),
    };

    return new NextResponse(
      JSON.stringify(
        {
          content1: {
            length: content1.length,
            preview: content1.substring(0, 100) + (content1.length > 100 ? "..." : ""),
          },
          content2: {
            length: content2.length,
            preview: content2.substring(0, 100) + (content2.length > 100 ? "..." : ""),
          },
          hashes: {
            hash1,
            hash2,
          },
          comparison,
          similarityTests,
          analysis: {
            similarity: comparison.comparison.similarity,
            difference: comparison.comparison.difference,
            changeLevel: comparison.comparison.changeLevel,
            hammingDistance: comparison.comparison.hammingDistance,
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
          error: "Failed to process content",
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
  const sampleContent1 = "This is a sample content for testing soft hashing. It contains some text that we want to compare.";
  const sampleContent2 = "This is a sample content for testing soft hashing. It contains some text that we want to compare with minor changes.";
  const sampleContent3 = "This is completely different content that should have a very low similarity score.";

  const hash1 = SimHash.hash(sampleContent1);
  const hash2 = SimHash.hash(sampleContent2);
  const hash3 = SimHash.hash(sampleContent3);

  const comparison12 = SimHash.compare(hash1, hash2);
  const comparison13 = SimHash.compare(hash1, hash3);

  return new NextResponse(
    JSON.stringify(
      {
        demo: {
          content1: sampleContent1,
          content2: sampleContent2,
          content3: sampleContent3,
          hashes: {
            hash1,
            hash2,
            hash3,
          },
          comparisons: {
            content1_vs_content2: comparison12,
            content1_vs_content3: comparison13,
          },
          analysis: {
            "content1 vs content2": {
              similarity: comparison12.similarity,
              difference: comparison12.difference,
              changeLevel: comparison12.changeLevel,
              isSimilar: comparison12.isSimilar,
            },
            "content1 vs content3": {
              similarity: comparison13.similarity,
              difference: comparison13.difference,
              changeLevel: comparison13.changeLevel,
              isSimilar: comparison13.isSimilar,
            },
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
