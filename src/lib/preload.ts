/**
 * Wraps a dynamic import so it starts at most once at a time. Calling `load()` early (on idle, or when a
 * tab is touched) means the chunk is already there when React asks for it. A failed load (offline before
 * the service worker cached the chunk) is forgotten rather than handed back to every later call.
 */
export function preloadable<T>(loader: () => Promise<T>) {
  let pending: Promise<T> | null = null
  return () => {
    pending ??= loader().catch((error: unknown) => {
      pending = null
      throw error
    })
    return pending
  }
}
