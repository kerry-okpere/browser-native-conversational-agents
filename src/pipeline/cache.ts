// Helpers for model files kept in the browser's Cache Storage.

/** Where Transformers.js keeps downloaded model files. Shared by every model that uses it. */
export const TRANSFORMERS_CACHE = "transformers-cache";

/**
 * Whether the cache holds a model's weights: a `.onnx` or any file whose url is a match
 */
export async function hasCached(cacheName: string, match: string) {
  if (!(await caches.has(cacheName))) return false;
  const keys = await (await caches.open(cacheName)).keys();
  return keys.some((request) => request.url.includes(match) && request.url.endsWith(".onnx"));
}

/** Delete only the files whose URL contains `match`, leaving other models' files alone. */
export async function deleteCached(cacheName: string, match: string) {
  if (!(await caches.has(cacheName))) return;
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  await Promise.all(
    keys.filter((request) => request.url.includes(match)).map((request) => cache.delete(request)),
  );
}
