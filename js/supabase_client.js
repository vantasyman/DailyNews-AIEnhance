// js/supabase_client.js

// 1. 【修复】从全局的 'supabase' 对象 (来自CDN) 中解构
//    我们明确使用 window.supabase 来避免命名冲突。
const { createClient } = window.supabase;

// ⬇️ 这些是将被 GitHub Action 自动替换的占位符
const SUPABASE_URL = 'https://cmgphbvuoebxfufjzwpa.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtZ3BoYnZ1b2VieGZ1Zmp6d3BhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMxNzA5NjIsImV4cCI6MjA3ODc0Njk2Mn0.nQvnDtbublyN-V9RmIoxP5L-PVRkC9inNtAWyONV-Nk';

if (SUPABASE_URL.includes('%')) {
  console.error(
    'Supabase 客户端未配置。请确保 GitHub Action 工作流已正确运行并替换了占位符。'
  );
}

// 2. 【修复】导出一个新名字的客户端，例如 'supabaseClient'
//    这样就不会与全局的 'supabase' 变量冲突了。
export const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 注意：我已移除了你原始文件 末尾多余的 '}' 符号。