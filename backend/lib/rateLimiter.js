const rateLimit = require('express-rate-limit')

function makeRateLimiter({ max, windowMs, message } = {}) {
  return rateLimit({
    max,
    windowMs,
    standardHeaders: true,
    legacyHeaders: false,
    message: message || { error: 'Too many requests, please try again later.' },
  })
}

// Inbound limiters — caps from env vars with safe defaults.
const globalLimiter = makeRateLimiter({
  windowMs: Number(process.env.RATE_WINDOW_MS) || 60_000,
  max: Number(process.env.RATE_GLOBAL_MAX) || 120,
})

const scrapeLimiter = makeRateLimiter({
  windowMs: Number(process.env.RATE_WINDOW_MS) || 60_000,
  max: Number(process.env.RATE_SCRAPE_MAX) || 10,
})

const foodSearchLimiter = makeRateLimiter({
  windowMs: Number(process.env.RATE_WINDOW_MS) || 60_000,
  max: Number(process.env.RATE_FOOD_SEARCH_MAX) || 60,
})

const nutritionLimiter = makeRateLimiter({
  windowMs: Number(process.env.RATE_WINDOW_MS) || 60_000,
  max: Number(process.env.RATE_NUTRITION_MAX) || 60,
})

module.exports = { makeRateLimiter, globalLimiter, scrapeLimiter, foodSearchLimiter, nutritionLimiter }
