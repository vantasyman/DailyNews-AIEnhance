// js/supabase_client.js

// 1. 【修复】从全局的 'supabase' 对象 (来自CDN) 中解构
//    我们明确使用 window.supabase 来避免命名冲突。
const { createClient } = window.supabase;

// ⬇️ 这些是将被 GitHub Action 自动替换的占位符
const SUPABASE_URL = '%SUPABASE_URL%';
const SUPABASE_ANON_KEY = '%SUPABASE_ANON_KEY%';

if (SUPABASE_URL.includes('%')) {
  console.error(
    'Supabase 客户端未配置。请确保 GitHub Action 工作流已正确运行并替换了占位符。'
  );
}

// 2. 【修复】导出一个新名字的客户端，例如 'supabaseClient'
//    这样就不会与全局的 'supabase' 变量冲突了。
export const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 注意：我已移除了你原始文件 末尾多余的 '}' 符号。