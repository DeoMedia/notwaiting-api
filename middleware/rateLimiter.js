// server/middleware/rateLimiter.js
import rateLimit from 'express-rate-limit'

// General API rate limit — 100 requests per IP per 15 minutes
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again in a few minutes.' }
})

// Strict limit for manifesto signing — 3 per IP per hour
// Prevents spam sign-ups. Not a substitute for email verification,
// but a meaningful deterrent for casual abuse.
export const manifestoLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'You have signed recently. Thank you for your enthusiasm!' }
})

// Claude caption generation — 10 per IP per hour
// Each call costs ~$0.003–$0.01. This caps worst-case abuse at ~$0.10/IP/hour.
export const claudeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Caption limit reached (10/hour). Come back later!' }
})
