import os

# must be set before the app (and its settings) are imported
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:5173")
