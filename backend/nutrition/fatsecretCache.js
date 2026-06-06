// In-memory TTL cache for FatSecret lookups.
function withCache(fn, { ttlMs = 5 * 60_000 } = {}) {
  const cache = new Map()
  return async function cached(key) {
    const hit = cache.get(key)
    if (hit && Date.now() - hit.ts < ttlMs) return hit.value
    const value = await fn(key)
    cache.set(key, { value, ts: Date.now() })
    return value
  }
}

// Concurrency limiter — at most maxConcurrent calls in-flight at once.
function withConcurrencyLimit(fn, { maxConcurrent = 1 } = {}) {
  let active = 0
  const queue = []

  function dequeue() {
    if (queue.length === 0 || active >= maxConcurrent) return
    const { args, resolve, reject } = queue.shift()
    active++
    fn(...args)
      .then(resolve, reject)
      .finally(() => { active--; dequeue() })
  }

  return function limited(...args) {
    return new Promise((resolve, reject) => {
      queue.push({ args, resolve, reject })
      dequeue()
    })
  }
}

module.exports = { withCache, withConcurrencyLimit }
