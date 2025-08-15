import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function GET() {
  try {
    const ai = getCloudflareContext().env.AI;

    // Test a simple model to see what's available
    const testModels = ["@cf/meta/llama-3-8b-instruct", "@cf/meta/llama-3.2-3b-instruct"];

    const results = [];

    for (const model of testModels) {
      try {
        const result = await ai.run(model, {
          prompt: "Hello",
          max_tokens: 10,
        });
        results.push({ model, status: "success", response: result.response });
      } catch (error: unknown) {
        if (error instanceof Error) {
          results.push({ model, status: "error", error: error.message });
        } else {
          results.push({ model, status: "error", error: "Unknown error occurred" });
        }
      }
    }

    return new NextResponse(
      JSON.stringify(
        {
          available: results.filter((r) => r.status === "success"),
          unavailable: results.filter((r) => r.status === "error"),
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
          error: "Failed to test models",
          details: error instanceof Error ? error.message : "Unknown error",
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
