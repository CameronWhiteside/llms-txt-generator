// Durable Objects entrypoint for OpenNext
// This file exports all Durable Object classes that should be available in the worker

import { UrlMetaStoreDO } from "./durable-objects/UrlMetaStore";

// Export the Durable Object class
// This makes it available to the worker runtime
export { UrlMetaStoreDO };

// Also export as default for compatibility
export default { UrlMetaStoreDO };
