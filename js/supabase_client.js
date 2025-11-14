// js/supabase_client.js

// 1. 导入 Supabase 官方库
// (我们将在 index.html 中通过 CDN 引入这个库)
// import { createClient } from '@supabase/supabase-js'

// 2. 填入你 Supabase 项目的公开密钥
// ‼️ 重要提示:
//    - SUPABASE_URL 可以在项目设置 -> API -> Project URL 中找到
//    - SUPABASE_ANON_KEY 可以在项目设置 -> API -> 'anon' 'public' 密钥中找到
const SUPABASE_URL = 'https://[你的Supabase项目ID].supabase.co';
const SUPABASE_ANON_KEY = '[你的 ANON Key]';

// 3. 检查密钥是否已填写
if (SUPABASE_URL.includes('[') || SUPABASE_ANON_KEY.includes('[')) {
  alert(
    '错误：Supabase 客户端未配置。\n' +
    '请编辑 js/supabase_client.js 文件，填入你的 Supabase URL 和 ANON 密钥。'
  );
}

// 4. 创建并导出唯一的、可复用的客户端实例
// 这个客户端使用了 'public_api_role' 的权限，只能 "SELECT" (读取) 数据。
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);