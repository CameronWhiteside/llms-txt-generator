"use client";

import { useState } from "react";
import { AI_MODELS } from "@/lib/ai";

export default function Home() {
  const [response, setResponse] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState<string>("");
  const [paths, setPaths] = useState<string[]>(["/", "", ""]);
  const [selectedModel, setSelectedModel] = useState<string>(AI_MODELS.LLAMA_3_2_3B);
  const [generatedContent, setGeneratedContent] = useState<string>("");

  const handleGenerate = async () => {
    setLoading(true);
    setResponse("");
    setGeneratedContent("");

    try {
      // Build URLs array with base URL + paths
      const urls = [url, ...paths.filter((path) => path.trim())].map((path) => (path.startsWith("/") ? `${url}${path}` : path)).filter((url) => url.trim());

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
    if (generatedContent) {
      const blob = new Blob([generatedContent], { type: "text/markdown" });
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

  return (
    <div className="min-h-screen flex flex-col">
      {/* Background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50"></div>
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gradient-to-br from-purple-400/20 to-pink-400/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-gradient-to-br from-orange-400/20 to-yellow-400/20 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 w-80 h-80 bg-gradient-to-br from-emerald-400/10 to-teal-400/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2"></div>
      </div>

      {/* Header */}
      <header className="relative z-10 px-6 py-6">
        <div className="max-w-7xl mx-auto flex items-center justify-center">{/* Logo removed */}</div>
      </header>

      {/* Main Content - Centered */}
      <main className="relative z-10 px-6 flex-1 flex items-center justify-center">
        <div className="max-w-7xl mx-auto w-full">
          {/* Hero Section */}
          <div className="text-center mb-12">
            <h1 className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-orange-600 bg-clip-text text-transparent mb-6">Generate llms.txt Files</h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed mb-4">Create llms.txt files from any website to help AI models understand your content.</p>
          </div>

          {/* Side-by-side Layout */}
          <div className="grid lg:grid-cols-2 gap-8">
            {/* Input Form */}
            <div className="backdrop-blur-xl bg-white/70 rounded-3xl shadow-2xl border border-white/20 p-8">
              <div className="space-y-6">
                {/* URL Input */}
                <div>
                  <label htmlFor="url" className="block text-left text-sm font-semibold text-gray-700 mb-3">
                    Website URL
                  </label>
                  <input
                    type="url"
                    id="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://example.com"
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all bg-white/80 backdrop-blur-sm text-gray-800 placeholder-gray-500"
                  />
                </div>

                {/* Path Input */}
                <div>
                  <label htmlFor="paths" className="block text-left text-sm font-semibold text-gray-700 mb-3">
                    Additional Pages (optional)
                  </label>
                  <textarea
                    id="paths"
                    value={paths.join("\n")}
                    onChange={(e) => setPaths(e.target.value.split("\n").map((path) => path.trim()))}
                    placeholder="/about&#10;/contact&#10;/services"
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all resize-none bg-white/80 backdrop-blur-sm text-gray-800 placeholder-gray-500"
                    rows={3}
                  />
                  <p className="text-xs text-gray-600 mt-2 text-left">Enter one path per line (e.g., /about, /contact)</p>
                </div>

                {/* Model Selection */}
                <div>
                  <label htmlFor="model" className="block text-left text-sm font-semibold text-gray-700 mb-3">
                    AI Model
                  </label>
                  <select
                    id="model"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all bg-white/80 backdrop-blur-sm text-gray-800"
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
                    <div className="flex items-center justify-center space-x-2">
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Generating...</span>
                    </div>
                  ) : (
                    "Generate llms.txt"
                  )}
                </button>
              </div>
            </div>

            {/* Results Panel */}
            <div className="backdrop-blur-xl bg-white/70 rounded-3xl shadow-2xl border border-white/20 p-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-800">Results</h3>
                <button
                  onClick={handleDownload}
                  disabled={!generatedContent}
                  className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                    !generatedContent
                      ? "bg-gradient-to-r from-purple-600 via-pink-600 to-orange-600 text-white opacity-30 cursor-not-allowed"
                      : "bg-gradient-to-r from-purple-600 via-pink-600 to-orange-600 text-white hover:from-purple-700 hover:via-pink-700 hover:to-orange-700 shadow-md hover:shadow-lg"
                  }`}
                >
                  Download llms.txt
                </button>
              </div>
              <div className="h-[400px] bg-gray-50/80 backdrop-blur-sm border border-gray-200 rounded-xl p-4 overflow-y-auto custom-scrollbar">
                {generatedContent ? (
                  <pre className="whitespace-pre-wrap text-sm text-gray-800 font-mono">{generatedContent}</pre>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-gray-500 text-lg">Results appear here</p>
                  </div>
                )}
              </div>
              {response && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl">
                  <pre className="text-sm text-red-800 whitespace-pre-wrap">{response}</pre>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Footer - Sticky to bottom */}
      <footer className="relative z-10 px-6 py-8 mt-auto">
        <div className="max-w-7xl mx-auto text-center">
          <p className="text-gray-600 text-sm">
            Based on the{" "}
            <a href="https://llmstxt.org" target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:text-purple-700 underline">
              llms.txt standard
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
