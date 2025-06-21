import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;

// Use fallback for key: try backend key first, then frontend one
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  throw new Error("❌ supabaseKey is missing in .env");
}

export const supabase = createClient(supabaseUrl, supabaseKey);
