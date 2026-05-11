// Canonical wave/sector definitions for the entire backend.
// Keep in sync with src/app/constants/sectors.ts in the frontend.

// Valid sector tag values that match the frontend SECTORS list.
// Custom "other" text is also accepted after sanitisation.
export const KNOWN_WAVE_TAGS = new Set([
  'fintech', 'tech', 'health', 'music', 'agriculture',
  'education', 'climate', 'media', 'fashion', 'sports', 'film', 'policy', 'other',
])

// Maps free-text keywords → canonical frontend sector tag.
// Ordered so more-specific keywords are checked first.
export const TAG_KEYWORDS = [
  ['fintech',     'fintech'],
  ['finance',     'fintech'],  // "finance" → canonical "fintech"
  ['tech',        'tech'],     // also catches "technology"
  ['health',      'health'],
  ['music',       'music'],
  ['agriculture', 'agriculture'],
  ['education',   'education'],
  ['climate',     'climate'],
  ['media',       'media'],
  ['fashion',     'fashion'],
  ['sports',      'sports'],
  ['film',        'film'],
  ['policy',      'policy'],
]

export const ALLOWED_ACTIONS = ['got_mark', 'shared_social', 'shared_story']
