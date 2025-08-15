import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function GET() {
  try {
    const ai = getCloudflareContext().env.AI;

    if (!ai) {
      return new NextResponse(
        JSON.stringify(
          {
            error: "AI binding not found",
            debug: "No AI binding available",
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

    // Test with a very simple prompt
    try {
      const result = await ai.run("@cf/meta/llama-3.1b-instruct", {
        prompt: "Say hello",
        max_tokens: 5,
      });

      return new NextResponse(
        JSON.stringify(
          {
            success: true,
            result: result,
            aiBinding: {
              hasAI: !!ai,
              aiType: typeof ai,
              aiMethods: Object.getOwnPropertyNames(ai),
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
    } catch (aiError) {
      return new NextResponse(
        JSON.stringify(
          {
            error: "AI call failed",
            aiError: aiError instanceof Error ? aiError.message : String(aiError),
            aiBinding: {
              hasAI: !!ai,
              aiType: typeof ai,
              aiMethods: Object.getOwnPropertyNames(ai),
            },
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
  } catch (error) {
    return new NextResponse(
      JSON.stringify(
        {
          error: "Failed to access AI binding",
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
