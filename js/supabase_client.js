// js/supabase_client.js

// 【修复】
// 1. 不再 import '@supabase/supabase-js'。
// 2. 'supabase' 全局变量由 index.html 中的 CDN 脚本提供。
// 3. 我们从全局 'supabase' 对象中解构出 'createClient'。
const { createClient } = supabase;

// ⬇️ 这些是将被 GitHub Action 自动替换的占位符
const SUPABASE_URL = '%SUPABASE_URL%';
const SUPABASE_ANON_KEY = '%SUPABASE_ANON_KEY%';

if (SUPABASE_URL.includes('%')) {
  console.error(
    'Supabase 客户端未配置。请确保 GitHub Action 工作流已正确运行并替换了占位符。'
  );
}

// 4. 'createClient' 函数现在可用，因为我们已在第 6 行将其解构
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);