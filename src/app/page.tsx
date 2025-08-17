"use client";

import { useState } from "react";
import { AI_MODELS } from "@/lib/ai";

export default function Home() {
  const [response, setResponse] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState<string>("");
  const [paths, setPaths] = useState<string[]>(["", "", ""]);
  const [selectedModel, setSelectedModel] = useState<string>(AI_MODELS.LLAMA_3_2_3B);
  const [generatedContent, setGeneratedContent] = useState<string>("");
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [lastGeneratedUrls, setLastGeneratedUrls] = useState<string[]>([]);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedback, setFeedback] = useState<string>("");
  const [revising, setRevising] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    setResponse("");
    setGeneratedContent("");
    setIsEditing(false);
    setEditedContent("");

    try {
      // Build URLs array with base URL + paths, ensuring no duplicates
      const baseUrl = url.endsWith("/") ? url : url + "/";
      const additionalPaths = paths
        .filter((path) => path.trim())
        .map((path) => {
          const cleanPath = path.startsWith("/") ? path : "/" + path;
          return baseUrl + cleanPath.substring(1); // Remove leading slash to avoid double slashes
        });

      const urls = [baseUrl, ...additionalPaths].filter((url) => url.trim());
      setLastGeneratedUrls(urls);

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          urls: urls,
          model: selectedModel,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        setResponse(`Error: ${res.status} - ${errorText}`);
        return;
      }

      // Check if the response is markdown (successful generation)
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("text/markdown")) {
        // This is a successful generation - get the content
        const content = await res.text();
        setGeneratedContent(content);
        setEditedContent(content); // Initialize edited content with generated content
        return;
      }

      // Otherwise, parse as JSON (error response)
      const data = await res.json();
      setResponse(JSON.stringify(data, null, 2));
    } catch (error) {
      setResponse("Error: " + error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    const contentToDownload = isEditing ? editedContent : generatedContent;
    if (contentToDownload) {
      const blob = new Blob([contentToDownload], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "llms.txt";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
    setEditedContent(generatedContent);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedContent(generatedContent);
  };

  const handleSave = async () => {
    if (!lastGeneratedUrls.length) {
      setResponse("Error: No URLs available for update. Please generate content first.");
      return;
    }

    console.log("💾 Manual save initiated");
    console.log("📋 URLs being updated:", lastGeneratedUrls);
    console.log("📝 Content length:", editedContent.length);
    console.log("📄 Content preview:", editedContent.substring(0, 200) + "...");

    setSaving(true);
    setResponse("");

    try {
      const res = await fetch("/api/content", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          urls: lastGeneratedUrls,
          content: editedContent,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.log("❌ Save failed:", res.status, errorText);
        setResponse(`Error: ${res.status} - ${errorText}`);
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      console.log("📊 Save response:", data);

      if (data.success) {
        console.log("✅ Manual save successful");
        console.log("🔑 R2 Key:", data.r2Key);
        console.log("💾 R2 Stored:", data.r2Stored);
        console.log("🔐 Content Hash:", data.contentHash?.hash);

        setGeneratedContent(editedContent);
        setIsEditing(false);
        setResponse("✅ Content updated successfully!");
        // Clear success message after 3 seconds
        setTimeout(() => setResponse(""), 3000);
      } else {
        console.log("❌ Save failed:", data.error);
        setResponse(`Error: ${data.error || "Failed to update content"}`);
      }
    } catch (error) {
      console.log("❌ Save error:", error);
      setResponse("Error: " + error);
    } finally {
      setSaving(false);
    }
  };

  const handleFeedback = () => {
    setShowFeedbackModal(true);
    setFeedback("");
  };

  const handleCancelFeedback = () => {
    setShowFeedbackModal(false);
    setFeedback("");
  };

  const handleSubmitFeedback = async () => {
    if (!feedback.trim()) {
      setResponse("Error: Please provide feedback for the AI revision.");
      return;
    }

    if (!lastGeneratedUrls.length) {
      setResponse("Error: No URLs available for update. Please generate content first.");
      return;
    }

    console.log("🤖 AI revision initiated");
    console.log("📋 URLs being revised:", lastGeneratedUrls);
    console.log("📝 Current content length:", generatedContent.length);
    console.log("📄 Current content preview:", generatedContent.substring(0, 200) + "...");
    console.log("💬 Feedback:", feedback);
    console.log("🤖 AI Model:", selectedModel);

    setRevising(true);
    setResponse("");

    try {
      const res = await fetch("/api/content/revise", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          urls: lastGeneratedUrls,
          currentContent: generatedContent,
          feedback: feedback,
          model: selectedModel,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.log("❌ AI revision failed:", res.status, errorText);
        setResponse(`Error: ${res.status} - ${errorText}`);
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any;
      console.log("📊 AI revision response:", data);

      if (data.success) {
        console.log("✅ AI revision successful");
        console.log("🔑 R2 Key:", data.r2Key);
        console.log("💾 R2 Stored:", data.r2Stored);
        console.log("🔐 Content Hash:", data.contentHash?.hash);
        console.log("🤖 AI Tokens:", data.aiTokens);
        console.log("⚡ AI Latency:", data.aiLatency);
        console.log("📝 Revised content length:", data.revisedContent?.length);
        console.log("📄 Revised content preview:", data.revisedContent?.substring(0, 200) + "...");

        setGeneratedContent(data.revisedContent);
        setEditedContent(data.revisedContent);
        setShowFeedbackModal(false);
        setFeedback("");
        setResponse(`✅ Content revised successfully with AI! (${data.aiTokens} tokens, ${data.aiLatency}ms)`);
        // Clear success message after 5 seconds
        setTimeout(() => setResponse(""), 5000);
      } else {
        console.log("❌ AI revision failed:", data.error);
        setResponse(`Error: ${data.error || "Failed to revise content"}`);
      }
    } catch (error) {
      console.log("❌ AI revision error:", error);
      setResponse("Error: " + error);
    } finally {
      setRevising(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50"></div>
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gradient-to-br rounded-full blur-3xl from-purple-400/20 to-pink-400/20"></div>
        <div className="absolute right-1/4 bottom-1/4 w-96 h-96 bg-gradient-to-br rounded-full blur-3xl from-orange-400/20 to-yellow-400/20"></div>
        <div className="absolute top-1/2 left-1/2 w-80 h-80 bg-gradient-to-br rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 from-emerald-400/10 to-teal-400/10"></div>
      </div>

      {/* Header */}
      <header className="relative z-10 px-6 py-6">
        <div className="flex justify-center items-center mx-auto max-w-7xl">{/* Logo removed */}</div>
      </header>

      {/* Main Content - Centered */}
      <main className="flex relative z-10 flex-1 justify-center items-center px-6">
        <div className="mx-auto w-full max-w-7xl">
          {/* Hero Section */}
          <div className="mb-12 text-center">
            <h1 className="mb-6 text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 via-pink-600 to-orange-600 md:text-6xl">Generate llms.txt Files</h1>
            <p className="mx-auto mb-4 max-w-3xl text-xl leading-relaxed text-gray-600">Create llms.txt files from any website to help AI models understand your content.</p>
          </div>

          {/* Side-by-side Layout */}
          <div className="grid gap-8 lg:grid-cols-2">
            {/* Input Form */}
            <div className="p-8 rounded-3xl border shadow-2xl backdrop-blur-xl bg-white/70 border-white/20">
              <div className="space-y-6">
                {/* URL Input */}
                <div>
                  <label htmlFor="url" className="block mb-3 text-sm font-semibold text-left text-gray-700">
                    Website URL
                  </label>
                  <input
                    type="url"
                    id="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://example.com"
                    className="px-4 py-3 w-full placeholder-gray-500 text-gray-800 rounded-xl border border-gray-300 backdrop-blur-sm transition-all focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white/80"
                  />
                </div>

                {/* Path Input */}
                <div>
                  <label htmlFor="paths" className="block mb-3 text-sm font-semibold text-left text-gray-700">
                    Additional Pages (optional)
                  </label>
                  <textarea
                    id="paths"
                    value={paths.join("\n")}
                    onChange={(e) => setPaths(e.target.value.split("\n").map((path) => path.trim()))}
                    placeholder="about&#10;contact&#10;services"
                    className="px-4 py-3 w-full placeholder-gray-500 text-gray-800 rounded-xl border border-gray-300 backdrop-blur-sm transition-all resize-none focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white/80"
                    rows={3}
                  />
                  <p className="mt-2 text-xs text-left text-gray-600">Enter one path per line (e.g., about, contact, services)</p>
                </div>

                {/* Model Selection */}
                <div>
                  <label htmlFor="model" className="block mb-3 text-sm font-semibold text-left text-gray-700">
                    AI Model
                  </label>
                  <select
                    id="model"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="px-4 py-3 w-full text-gray-800 rounded-xl border border-gray-300 backdrop-blur-sm transition-all focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white/80"
                  >
                    <option value={AI_MODELS.LLAMA_3_2_3B}>Llama 3.2 3B (Fastest)</option>
                    <option value={AI_MODELS.LLAMA_3_8B}>Llama 3.8B (High Quality)</option>
                  </select>
                </div>

                {/* Generate Button */}
                <button
                  onClick={handleGenerate}
                  disabled={loading || !url.trim()}
                  className={`w-full py-4 px-8 rounded-xl font-semibold text-lg transition-all ${
                    loading || !url.trim()
                      ? "bg-gradient-to-r from-purple-600 via-pink-600 to-orange-600 text-white opacity-30 cursor-not-allowed"
                      : "bg-gradient-to-r from-purple-600 via-pink-600 to-orange-600 text-white hover:from-purple-700 hover:via-pink-700 hover:to-orange-700 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                  }`}
                >
                  {loading ? (
                    <div className="flex justify-center items-center space-x-2">
                      <div className="w-5 h-5 rounded-full border-2 border-white animate-spin border-t-transparent"></div>
                      <span>Generating...</span>
                    </div>
                  ) : (
                    "Generate llms.txt"
                  )}
                </button>
              </div>
            </div>

            {/* Results Panel */}
            <div className={`backdrop-blur-xl rounded-3xl shadow-2xl border p-8 transition-all ${isEditing ? "bg-blue-50/70 border-blue-200/20" : "bg-white/70 border-white/20"}`}>
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center space-x-2">
                  <h3 className="text-lg font-semibold text-gray-800">{isEditing ? "📝 Editing Results" : "Results"}</h3>
                  {isEditing && <span className="px-2 py-1 text-xs font-medium text-blue-800 bg-blue-100 rounded-full">Edit Mode</span>}
                </div>
                <div className="flex items-center space-x-1">
                  {generatedContent && !isEditing && (
                    <>
                      <button
                        onClick={handleEdit}
                        className="p-2 text-sm font-medium text-white bg-blue-600 rounded-lg shadow-md transition-all hover:bg-blue-700 hover:shadow-lg"
                        title="Edit content"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={handleFeedback}
                        className="p-2 text-sm font-medium text-white bg-purple-600 rounded-lg shadow-md transition-all hover:bg-purple-700 hover:shadow-lg"
                        title="AI Revise"
                      >
                        🤖
                      </button>
                    </>
                  )}
                  {isEditing && (
                    <>
                      <button
                        onClick={handleCancelEdit}
                        className="p-2 text-sm font-medium text-white bg-gray-600 rounded-lg shadow-md transition-all hover:bg-gray-700 hover:shadow-lg"
                        title="Cancel edit"
                      >
                        ❌
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className={`p-2 rounded-lg font-medium text-sm transition-all ${
                          saving ? "text-white bg-green-600 opacity-30 cursor-not-allowed" : "text-white bg-green-600 shadow-md hover:bg-green-700 hover:shadow-lg"
                        }`}
                        title="Save changes"
                      >
                        {saving ? <div className="w-4 h-4 rounded-full border border-white animate-spin border-t-transparent"></div> : "💾"}
                      </button>
                    </>
                  )}
                  <div className="mx-1 w-px h-6 bg-gray-300"></div>
                  <button
                    onClick={handleDownload}
                    disabled={!generatedContent && !isEditing}
                    className={`px-3 py-2 rounded-lg font-medium text-sm transition-all ${
                      !generatedContent && !isEditing
                        ? "bg-gradient-to-r from-purple-600 via-pink-600 to-orange-600 text-white opacity-30 cursor-not-allowed"
                        : "bg-gradient-to-r from-purple-600 via-pink-600 to-orange-600 text-white hover:from-purple-700 hover:via-pink-700 hover:to-orange-700 shadow-md hover:shadow-lg"
                    }`}
                    title="Download llms.txt"
                  >
                    📥
                  </button>
                </div>
              </div>
              <div className={`h-[400px] backdrop-blur-sm border rounded-xl p-4 overflow-y-auto custom-scrollbar ${isEditing ? "border-blue-200 bg-blue-50/80" : "border-gray-200 bg-gray-50/80"}`}>
                {isEditing ? (
                  <div className="relative h-full">
                    <textarea
                      value={editedContent}
                      onChange={(e) => setEditedContent(e.target.value)}
                      className="w-full h-full font-mono text-sm placeholder-gray-500 text-gray-800 bg-transparent border-none outline-none resize-none focus:ring-0"
                      placeholder="Edit your llms.txt content here..."
                    />
                    <div className="absolute right-2 bottom-2 px-2 py-1 text-xs text-gray-500 rounded bg-white/80">{editedContent.length} characters</div>
                  </div>
                ) : generatedContent ? (
                  <pre className="font-mono text-sm text-gray-800 whitespace-pre-wrap">{generatedContent}</pre>
                ) : (
                  <div className="flex justify-center items-center h-full">
                    <p className="text-lg text-gray-500">Results appear here</p>
                  </div>
                )}
              </div>
              {response && (
                <div className={`mt-4 p-4 rounded-xl ${response.includes("✅") ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
                  <pre className={`text-sm whitespace-pre-wrap ${response.includes("✅") ? "text-green-800" : "text-red-800"}`}>{response}</pre>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Feedback Modal */}
      {showFeedbackModal && (
        <div className="flex fixed inset-0 z-50 justify-center items-center p-4 backdrop-blur-sm bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-semibold text-gray-800">🤖 AI Content Revision</h3>
                <button onClick={handleCancelFeedback} className="text-gray-400 transition-colors hover:text-gray-600">
                  ✕
                </button>
              </div>
              <p className="mt-2 text-gray-600">Provide feedback to revise your llms.txt content. Be specific about what you would like to change or improve.</p>
            </div>

            <div className="p-6">
              <div className="mb-4">
                <label htmlFor="feedback" className="block mb-2 text-sm font-medium text-gray-800">
                  Your Feedback
                </label>
                <textarea
                  id="feedback"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="e.g., 'Make the tone more professional', 'Add more technical details', 'Simplify the language', 'Include more examples'..."
                  className="px-4 py-3 w-full h-32 placeholder-gray-500 text-gray-800 rounded-xl border border-gray-300 transition-all resize-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  disabled={revising}
                />
                <p className="mt-1 text-xs text-gray-600">{feedback.length} characters</p>
              </div>

              <div className="p-4 mb-4 bg-gray-50 rounded-xl">
                <h4 className="mb-2 text-sm font-medium text-gray-800">Current Content Preview:</h4>
                <div className="overflow-y-auto max-h-24 text-sm text-gray-700">{generatedContent.substring(0, 200)}...</div>
              </div>

              <div className="flex justify-end items-center space-x-3">
                <button onClick={handleCancelFeedback} disabled={revising} className="px-4 py-2 text-gray-600 transition-colors hover:text-gray-800">
                  Cancel
                </button>
                <button
                  onClick={handleSubmitFeedback}
                  disabled={revising || !feedback.trim()}
                  className={`px-6 py-2 rounded-lg font-medium transition-all ${
                    revising || !feedback.trim() ? "bg-purple-600 text-white opacity-30 cursor-not-allowed" : "bg-purple-600 text-white hover:bg-purple-700 shadow-md hover:shadow-lg"
                  }`}
                >
                  {revising ? (
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 rounded-full border border-white animate-spin border-t-transparent"></div>
                      <span>Revising...</span>
                    </div>
                  ) : (
                    "🤖 Revise with AI"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer - Sticky to bottom */}
      <footer className="relative z-10 px-6 py-8 mt-auto">
        <div className="mx-auto max-w-7xl text-center">
          <p className="text-sm text-gray-600">
            Based on the{" "}
            <a href="https://llmstxt.org" target="_blank" rel="noopener noreferrer" className="text-purple-600 underline hover:text-purple-700">
              llms.txt standard
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
