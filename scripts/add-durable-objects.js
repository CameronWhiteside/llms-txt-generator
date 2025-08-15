#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

// Path to the generated worker file
const workerPath = path.join(__dirname, "..", ".open-next", "worker.js");

// Check if the worker file exists
if (!fs.existsSync(workerPath)) {
  console.error('Worker file not found. Make sure to run "opennextjs-cloudflare build" first.');
  process.exit(1);
}

// Read the current worker content
let workerContent = fs.readFileSync(workerPath, "utf8");

// Check if Durable Objects are already exported
if (workerContent.includes("UrlMetaStoreDO")) {
  console.log("Durable Objects already exported in worker file.");
  process.exit(0);
}

// Add Durable Objects export at the beginning of the file
const durableObjectsExport = `
// Durable Objects exports
export { UrlMetaStoreDO } from '../src/durable-objects/UrlMetaStore.js';

`;

// Insert the export at the beginning of the file
workerContent = durableObjectsExport + workerContent;

// Write the updated content back to the file
fs.writeFileSync(workerPath, workerContent, "utf8");

console.log("✅ Durable Objects successfully added to worker file.");
