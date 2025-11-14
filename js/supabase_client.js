// js/supabase_client.js
import { createClient } from '@supabase/supabase-js';

// ⬇️ 这些是将被 GitHub Action 自动替换的占位符
const SUPABASE_URL = '%SUPABASE_URL%';
const SUPABASE_ANON_KEY = '%SUPABASE_ANON_KEY%';

if (SUPABASE_URL.includes('%')) {
  console.error(
    'Supabase 客户端未配置。请确保 GitHub Action 工作流已正确运行并替换了占位符。'
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);