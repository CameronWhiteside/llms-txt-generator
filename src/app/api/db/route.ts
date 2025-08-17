import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createUrlMetaStoreClient } from "@/durable-objects/UrlMetaStore";

interface RequestWithEnv extends Request {
  env?: CloudflareEnv;
}

export async function GET(request: RequestWithEnv) {
  const env = getCloudflareContext().env;

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbClient = createUrlMetaStoreClient();
    const url = new URL(request.url);
    const action = url.searchParams.get("action");

    switch (action) {
      case "stats":
        const stats = await dbClient.getStats();
        return new NextResponse(JSON.stringify(stats, null, 2), {
          headers: { "Content-Type": "application/json" },
        });

      case "url":
        const targetUrl = url.searchParams.get("url");
        if (!targetUrl) {
          return new NextResponse(
            JSON.stringify(
              {
                error: "URL parameter required for 'url' action",
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

        const record = await dbClient.getLatestRecordForUrl(targetUrl);
        return new NextResponse(JSON.stringify({ record }, null, 2), {
          headers: { "Content-Type": "application/json" },
        });

      default:
        return new NextResponse(
          JSON.stringify(
            {
              error: "Invalid action",
              availableActions: ["stats - Get URL metadata statistics", "url?url=<url> - Get specific URL record"],
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
  } catch (error) {
    return new NextResponse(
      JSON.stringify(
        {
          error: "URL Meta Store operation failed",
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

export async function POST(request: RequestWithEnv) {
  if (!request.env?.URL_META_STORE) {
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
    const dbClient = createUrlMetaStoreClient();
    const url = new URL(request.url);
    const action = url.searchParams.get("action");

    if (action === "clear") {
      await dbClient.clearAll();
      return new NextResponse(JSON.stringify({ success: true }, null, 2), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new NextResponse(
      JSON.stringify(
        {
          error: "Invalid action",
          availableActions: ["clear - Clear all records"],
        },
        null,
        2
      ),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new NextResponse(
      JSON.stringify(
        {
          error: "URL Meta Store operation failed",
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
