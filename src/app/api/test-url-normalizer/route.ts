import { NextResponse } from "next/server";
import { UrlNormalizer } from "@/lib/urlNormalizer";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { urls: string[] };
    const { urls } = body;

    if (!urls || !Array.isArray(urls)) {
      return new NextResponse(
        JSON.stringify(
          {
            error: "urls array is required",
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

    const results = urls.map((url) => ({
      original: url,
      normalized: UrlNormalizer.normalize(url),
      debug: UrlNormalizer.debug(url),
      domain: UrlNormalizer.getDomain(url),
      path: UrlNormalizer.getPath(url),
      isRoot: UrlNormalizer.isRoot(url),
    }));

    const cacheKey = UrlNormalizer.generateCacheKey(urls);
    const normalizedUrls = UrlNormalizer.normalizeArray(urls);

    return new NextResponse(
      JSON.stringify(
        {
          test: {
            originalUrls: urls,
            normalizedUrls,
            cacheKey,
            results,
            analysis: {
              "Total URLs": urls.length,
              "Normalized URLs": normalizedUrls.length,
              "Cache Key": cacheKey,
              "URLs with www": urls.filter((url) => url.toLowerCase().includes("www.")).length,
              "URLs with https": urls.filter((url) => url.toLowerCase().startsWith("https://")).length,
              "URLs with http": urls.filter((url) => url.toLowerCase().startsWith("http://")).length,
              "Root URLs": results.filter((r) => r.isRoot).length,
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
          error: "Failed to test URL normalization",
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
  // Demo with sample URLs
  const sampleUrls = [
    "https://www.example.com",
    "http://example.com",
    "https://example.com/",
    "www.example.com",
    "example.com",
    "https://www.example.com/about",
    "http://example.com/contact/",
    "https://example.com/services",
  ];

  const results = sampleUrls.map((url) => ({
    original: url,
    normalized: UrlNormalizer.normalize(url),
    debug: UrlNormalizer.debug(url),
    domain: UrlNormalizer.getDomain(url),
    path: UrlNormalizer.getPath(url),
    isRoot: UrlNormalizer.isRoot(url),
  }));

  const cacheKey = UrlNormalizer.generateCacheKey(sampleUrls);
  const normalizedUrls = UrlNormalizer.normalizeArray(sampleUrls);

  return new NextResponse(
    JSON.stringify(
      {
        demo: {
          description: "Test URL normalization functionality",
          instructions: "POST to this endpoint with an array of URLs to test normalization",
          sampleUrls,
          results,
          cacheKey,
          normalizedUrls,
          examples: {
            "Protocol removal": {
              "https://example.com": "example.com/",
              "http://example.com": "example.com/",
            },
            "WWW removal": {
              "www.example.com": "example.com/",
              "https://www.example.com": "example.com/",
            },
            "Trailing slash": {
              "example.com": "example.com/",
              "example.com/": "example.com/",
            },
            "Path handling": {
              "example.com/about": "example.com/about/",
              "example.com/contact/": "example.com/contact/",
            },
          },
          expectedBehavior: {
            "Normalize protocols": "Remove http:// and https://",
            "Remove www": "Remove www. prefix",
            "Add trailing slash": "Ensure all URLs end with /",
            "Consistent cache keys": "Same cache key for equivalent URLs",
            "Case insensitive": "Convert to lowercase",
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
