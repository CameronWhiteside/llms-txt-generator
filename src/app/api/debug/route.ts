import { NextResponse } from "next/server";

interface RequestWithEnv extends Request {
  env?: CloudflareEnv;
}

export async function GET(request: Request) {
  const env = (request as RequestWithEnv).env;

  const debugInfo = {
    hasEnv: !!env,
    hasAI: !!env?.AI,
    envKeys: env ? Object.keys(env) : [],
    aiType: env?.AI ? typeof env.AI : "undefined",
    aiMethods: env?.AI ? Object.getOwnPropertyNames(env.AI) : [],
  };

  return new NextResponse(JSON.stringify(debugInfo, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
