import { NextResponse } from "next/server";
import { z } from "zod";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { validateUrls } from "@/lib/validation";
import { STATUS_CODES, ERROR_MESSAGES, DEFAULT_HEADERS } from "@/lib/errors";
import { efwAsync } from "@/lib/efw";
import { processHTML } from "@/lib/cleanHTML";
import { generateText, AI_MODELS } from "@/lib/ai";
import { generateLLMSTxtPrompt } from "@/lib/promptTemplates";
import { ContentHashManager, SIMILARITY_THRESHOLD_DEFAULT } from "@/lib/softHash";
import { generateDocumentKey, storeDocument, retrieveDocument, documentExists } from "@/lib/r2Storage";
import { createUrlMetaStoreClient } from "@/durable-objects/UrlMetaStore";

const requestSchema = z.object({
  urls: z.union([z.url(), z.array(z.url())]),
  model: z.string().optional(),
  additionalContext: z.string().optional(),
  threshold: z.number().min(0).max(1).optional(), // Similarity threshold for caching
});

interface FetchResult {
  url: string;
  success: boolean;
  content?: string;
  error?: string;
  llmsTxt?: string;
  contentHash?: {
    hash: string;
    timestamp: number;
    metadata?: Record<string, unknown>;
  };
  llmsTxtHash?: {
    hash: string;
    timestamp: number;
    metadata?: Record<string, unknown>;
  };
  cached?: boolean;
  similarity?: number;
  threshold?: number;
  r2Key?: string;
  r2Stored?: boolean;
}

interface RequestWithEnv extends Request {
  env?: CloudflareEnv;
}

export async function POST(request: RequestWithEnv) {
  console.log("🚀 Generate API called");

  const [jsonError, body] = await efwAsync(request.json());

  if (jsonError) {
    console.log("❌ JSON parse error:", jsonError);
    return new NextResponse(ERROR_MESSAGES.INVALID_REQUEST_FORMAT, {
      status: STATUS_CODES.BAD_REQUEST,
      headers: DEFAULT_HEADERS,
    });
  }

  const parsedBody = requestSchema.safeParse(body);

  if (!parsedBody.success) {
    console.log("❌ Request validation error:", parsedBody.error);
    return new NextResponse(ERROR_MESSAGES.INVALID_REQUEST_FORMAT, {
      status: STATUS_CODES.BAD_REQUEST,
      headers: DEFAULT_HEADERS,
    });
  }

  const { urls, model = AI_MODELS.LLAMA_3_8B, additionalContext, threshold = SIMILARITY_THRESHOLD_DEFAULT } = parsedBody.data;
  console.log("📋 Request params:", { urls, model, threshold, hasAdditionalContext: !!additionalContext });

  // Convert single URL to array for consistent handling
  const urlArray = Array.isArray(urls) ? urls : [urls];
  console.log("🔗 URLs to process:", urlArray);

  // Validate URLs using the validation library
  const validationResult = validateUrls(urlArray);

  if (!validationResult.isValid) {
    console.log("❌ URL validation failed:", validationResult);
    return new NextResponse(ERROR_MESSAGES.INVALID_URLS, {
      status: STATUS_CODES.BAD_REQUEST,
      headers: DEFAULT_HEADERS,
    });
  }

  console.log("✅ URLs validated successfully");

  // Fetch content from each valid URL
  const fetchResults: FetchResult[] = [];

  for (const url of validationResult.validUrls) {
    console.log(`🌐 Fetching URL: ${url}`);
    const [fetchError, response] = await efwAsync(fetch(url));

    if (fetchError) {
      console.log(`❌ Fetch error for ${url}:`, fetchError.message);
      fetchResults.push({
        url,
        success: false,
        error: fetchError.message,
      });
      continue;
    }

    if (!response.ok) {
      console.log(`❌ HTTP error for ${url}: ${response.status} - ${response.statusText}`);
      fetchResults.push({
        url,
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      });
      continue;
    }

    const [textError, htmlContent] = await efwAsync(response.text());

    if (textError) {
      console.log(`❌ Text extraction error for ${url}:`, textError.message);
      fetchResults.push({
        url,
        success: false,
        error: textError.message,
      });
      continue;
    }

    console.log(`✅ Successfully fetched ${url}, content length: ${htmlContent.length}`);

    // Sanitize the HTML content
    const { plainText } = processHTML(htmlContent);
    console.log(`🧹 Sanitized content length: ${plainText.length}`);

    // Generate content hash for the sanitized content
    const contentHash = ContentHashManager.hashContent(plainText, {
      url,
      model,
      contentLength: plainText.length,
      processingTime: Date.now(),
    });
    console.log(`🔐 Content hash for ${url}:`, contentHash.hash);

    const result: FetchResult = {
      url,
      success: true,
      content: plainText,
      contentHash,
    };

    // Check cache first if URL_META_STORE is available
    const env = getCloudflareContext().env;
    console.log(`🔍 Checking cache for ${url}, threshold: ${threshold}`);
    if (env?.URL_META_STORE) {
      try {
        const dbClient = createUrlMetaStoreClient();
        console.log(`📡 Calling checkCache for ${url}`);
        const cacheResult = await dbClient.checkCache(url, plainText, threshold);
        console.log(`📊 Cache result for ${url}:`, { cached: cacheResult.cached, similarity: cacheResult.similarity });

        if (cacheResult.cached && cacheResult.llmsTxt) {
          console.log(`✅ CACHE HIT for ${url}! Using cached llms.txt`);
          // Return cached llms.txt
          result.llmsTxt = cacheResult.llmsTxt;
          result.cached = true;
          result.similarity = cacheResult.similarity;
          result.threshold = cacheResult.threshold;

          // Generate hash for the cached llms.txt
          result.llmsTxtHash = ContentHashManager.hashContent(cacheResult.llmsTxt, {
            url,
            model,
            cached: true,
            contentLength: cacheResult.llmsTxt.length,
            processingTime: Date.now(),
          });

          // Check if the cached result already exists in R2, if not store it
          if (env?.LLMS_TXT_STORAGE) {
            try {
              const documentKey = generateDocumentKey(urlArray, contentHash.hash);
              console.log(`📁 R2 document key for cached content: ${documentKey}`);
              const exists = await documentExists({ bucket: env.LLMS_TXT_STORAGE }, documentKey);
              console.log(`📁 R2 document exists: ${exists}`);

              if (!exists) {
                console.log(`💾 Storing cached llms.txt to R2: ${documentKey}`);
                const stored = await storeDocument(
                  { bucket: env.LLMS_TXT_STORAGE },
                  {
                    key: documentKey,
                    content: cacheResult.llmsTxt,
                    url: url,
                    hash: contentHash.hash,
                    timestamp: Date.now(),
                    metadata: {
                      model,
                      cached: true,
                      similarity: cacheResult.similarity,
                      threshold: cacheResult.threshold,
                      contentLength: plainText.length,
                      llmsTxtLength: cacheResult.llmsTxt.length,
                      processingTime: Date.now(),
                      urls: urlArray,
                    },
                  }
                );

                result.r2Key = documentKey;
                result.r2Stored = stored;
                console.log(`💾 R2 storage result: ${stored}`);
              } else {
                console.log(`📁 Cached llms.txt already exists in R2: ${documentKey}`);
                result.r2Key = documentKey;
                result.r2Stored = true;
              }
            } catch (r2Error) {
              // Don't fail the request if R2 storage fails
            }
          }

          fetchResults.push(result);
          continue;
        }
      } catch (dbError) {
        console.log(`❌ Cache check failed for ${url}:`, dbError);
        // Continue with AI generation if cache check fails
      }
    } else {
      console.log(`⚠️ No URL_META_STORE available, skipping cache check for ${url}`);
    }

    // Generate llms.txt using AI if not cached
    console.log(`🤖 CACHE MISS for ${url}. Generating new llms.txt with AI...`);
    const prompt = generateLLMSTxtPrompt(plainText, additionalContext);

    const aiResult = await generateText(prompt, { model });

    if ("error" in aiResult) {
      console.log(`❌ AI generation failed for ${url}:`, aiResult.error);
      result.error = aiResult.error;
    } else {
      console.log(`✅ AI generation successful for ${url}, response length: ${aiResult.response.length}`);
      result.llmsTxt = aiResult.response;
      result.cached = false;

      // Generate hash for the AI-generated llms.txt
      result.llmsTxtHash = ContentHashManager.hashContent(aiResult.response, {
        url,
        model,
        aiTokens: aiResult.tokens,
        aiLatency: aiResult.latency,
        contentLength: aiResult.response.length,
        processingTime: Date.now(),
      });

      // Store the new content and llms.txt in the database
      if (env?.URL_META_STORE) {
        try {
          console.log(`💾 Storing new content in Durable Object for ${url}`);
          const dbClient = createUrlMetaStoreClient();
          await dbClient.storeContent(url, plainText, aiResult.response, threshold, {
            model,
            aiTokens: aiResult.tokens,
            aiLatency: aiResult.latency,
            contentLength: plainText.length,
            llmsTxtLength: aiResult.response.length,
            processingTime: Date.now(),
          });
          console.log(`✅ Successfully stored in Durable Object for ${url}`);
        } catch (dbError) {
          console.log(`❌ Failed to store in Durable Object for ${url}:`, dbError);
          // Don't fail the request if database storage fails
        }
      }

      // Store the markdown document in R2
      if (env?.LLMS_TXT_STORAGE) {
        try {
          const documentKey = generateDocumentKey(urlArray, contentHash.hash);
          console.log(`💾 Storing new llms.txt to R2: ${documentKey}`);
          const stored = await storeDocument(
            { bucket: env.LLMS_TXT_STORAGE },
            {
              key: documentKey,
              content: aiResult.response,
              url: url,
              hash: contentHash.hash,
              timestamp: Date.now(),
              metadata: {
                model,
                aiTokens: aiResult.tokens,
                aiLatency: aiResult.latency,
                contentLength: plainText.length,
                llmsTxtLength: aiResult.response.length,
                processingTime: Date.now(),
                urls: urlArray,
              },
            }
          );

          result.r2Key = documentKey;
          result.r2Stored = stored;
          console.log(`💾 R2 storage result for new content: ${stored}`);
        } catch (r2Error) {
          console.log(`❌ R2 storage failed for ${url}:`, r2Error);
          // Don't fail the request if R2 storage fails
        }
      }
    }

    fetchResults.push(result);
  }

  console.log("📊 Final results summary:", {
    totalResults: fetchResults.length,
    successful: fetchResults.filter((r) => r.success).length,
    cached: fetchResults.filter((r) => r.cached).length,
    errors: fetchResults.filter((r) => !r.success).length,
  });

  // Check if we have a successful llms.txt generation
  const successfulResult = fetchResults.find((r) => r.success && r.llmsTxt);

  if (successfulResult && successfulResult.llmsTxt) {
    console.log(`🎯 Returning successful result for ${successfulResult.url}, cached: ${successfulResult.cached}`);
    // Create a simple hash of the URL for the file path
    const urlHash = ContentHashManager.hashContent(urlArray.join("|"), {
      urls: urlArray,
      timestamp: Date.now(),
    }).hash.slice(0, 8); // Use first 8 characters for shorter path

    // Return the llms.txt as a downloadable markdown file
    const filename = `llms.txt`;

    return new NextResponse(successfulResult.llmsTxt, {
      status: STATUS_CODES.OK,
      headers: {
        "Content-Type": "text/markdown",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-cache",
      },
    });
  }

  // If no successful generation, return error response
  const responseData = {
    processedUrls: fetchResults.length,
    successfulFetches: fetchResults.filter((r) => r.success).length,
    failedFetches: fetchResults.filter((r) => !r.success).length,
    cachedResults: fetchResults.filter((r) => r.cached).length,
    model: model,
    threshold: threshold,
    results: fetchResults,
  };

  return new NextResponse(JSON.stringify(responseData, null, 2), {
    status: STATUS_CODES.OK,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
