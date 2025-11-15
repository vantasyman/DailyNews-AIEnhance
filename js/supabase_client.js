// js/supabase_client.js
import { createClient } from '@supabase/supabase-js';

// ⬇️ 这些是将被 GitHub Action 自动替换的占位符
const SUPABASE_URL = 'https://cmgphbvuoebxfufjzwpa.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtZ3BoYnZ1b2VieGZ1Zmp6d3BhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMxNzA5NjIsImV4cCI6MjA3ODc0Njk2Mn0.nQvnDtbublyN-V9RmIoxP5L-PVRkC9inNtAWyONV-Nk';

if (SUPABASE_URL.includes('%')) {
  console.error(
    'Supabase 客户端未配置。请确保 GitHub Action 工作流已正确运行并替换了占位符。'
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);