// Global test setup — runs before every test file.
// Sets dummy env vars so getSupabase() and adminAuth don't throw.
process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
process.env.SUPABASE_ANON_KEY = 'test-anon-key'
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key'
process.env.DASHBOARD_SECRET = 'test-dashboard-secret'
process.env.ADMIN_URL = 'http://localhost:5200'
process.env.FRONTEND_URL = 'http://localhost:5173'
process.env.PORT = '3099'
