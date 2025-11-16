-- AI-Trend-Engine 数据库安全策略 (V2 - Data-Centric)
-- 描述：为 3 个服务角色创建权限，并启用行级安全 (RLS)

-- -------------------------------
-- 1. 创建 3 个服务角色
-- -------------------------------
-- 注意：我们假设这些角色在 Supabase/Postgres 中已被创建。
-- CREATE ROLE crawler_role;
-- CREATE ROLE analyzer_role;
-- CREATE ROLE public_api_role;

-- -------------------------------
-- 2. 授予基本 USAGE 权限
-- -------------------------------
-- 允许角色“看到” public 模式中的表和函数
GRANT USAGE ON SCHEMA public TO crawler_role, analyzer_role, public_api_role;

-- 允许角色使用表的主键序列 (e.g., SERIAL PRIMARY KEY)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO crawler_role, analyzer_role;


-- -------------------------------
-- 3. 启用所有表的 RLS (行级安全)
-- -------------------------------
-- 默认情况下，启用 RLS 会“拒绝所有”访问，直到我们明确创建策略来“允许”
ALTER TABLE public.tracked_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.l1_analysis_sentiment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.l1_analysis_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.article_entity_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;


-- -------------------------------
-- 4. public_api_role (前端访客) 的策略
-- 目标：只读。不能写、改、删任何东西。
-- -------------------------------

-- 授予权限：只允许 SELECT (读取)


GRANT SELECT ON public.raw_articles TO anon;
GRANT SELECT ON public.l1_analysis_sentiment TO anon;
GRANT SELECT ON public.l1_analysis_entities TO anon;
GRANT SELECT ON public.article_entity_map TO anon;
GRANT SELECT ON public.daily_reports TO anon;
-- (注意：我们故意“不”授予对 'tracked_topics' 的读取权限，因为这是内部配置)

-- 创建策略：允许 public_api_role 读取所有行
CREATE POLICY "Allow public read-access to articles" ON public.raw_articles
  FOR SELECT TO anon USING (true);
  
CREATE POLICY "Allow public read-access to sentiment" ON public.l1_analysis_sentiment
  FOR SELECT TO anon USING (true);
  
CREATE POLICY "Allow public read-access to entities" ON public.l1_analysis_entities
  FOR SELECT TO anon USING (true);
  
CREATE POLICY "Allow public read-access to map" ON public.article_entity_map
  FOR SELECT TO anon USING (true);

CREATE POLICY "Allow public read-access to reports" ON public.daily_reports
  FOR SELECT TO anon USING (true);


-- -------------------------------
-- 5. crawler_role (爬虫脚本) 的策略
-- 目标：读配置 (topics)，写原始数据 (articles)。
-- -------------------------------

-- 授予权限：

GRANT SELECT, INSERT, UPDATE ON public.tracked_topics TO crawler_role;
-- 创建策略：
CREATE POLICY "Allow crawler to read active topics" ON public.tracked_topics
  FOR SELECT TO crawler_role USING (is_active = true); -- 只能读 "is_active" 的配置

CREATE POLICY "Allow crawler to insert new articles" ON public.raw_articles
  FOR INSERT TO crawler_role WITH CHECK (true); -- 允许插入任何新文章


-- -------------------------------
-- 6. analyzer_role (AI分析脚本) 的策略
-- 目标：读原始文章 (articles)，写所有分析表 (L1/L2)。
-- -------------------------------

-- 授予权限：
GRANT SELECT, INSERT, UPDATE ON public.daily_reports TO analyzer_role; -- 读 L0
GRANT SELECT, INSERT ON public.l1_analysis_sentiment TO analyzer_role; -- 写 L1 情感
GRANT SELECT, INSERT ON public.l1_analysis_entities TO analyzer_role;  -- 读/写 L1 实体 (需要读以防重复)
GRANT SELECT, INSERT ON public.article_entity_map TO analyzer_role;    -- 写 L1 关系
GRANT SELECT, INSERT ON public.daily_reports TO analyzer_role;       -- 写 L2 报告

-- 创建策略：(允许 AI 脚本读写所有相关数据)
CREATE POLICY "Allow analyzer to read raw articles" ON public.raw_articles
  FOR SELECT TO analyzer_role USING (true);

CREATE POLICY "Allow analyzer to write L1 sentiment" ON public.l1_analysis_sentiment
  FOR ALL TO analyzer_role USING (true) WITH CHECK (true);

CREATE POLICY "Allow analyzer to write L1 entities" ON public.l1_analysis_entities
  FOR ALL TO analyzer_role USING (true) WITH CHECK (true);
  
CREATE POLICY "Allow analyzer to write L1 map" ON public.article_entity_map
  FOR ALL TO analyzer_role USING (true) WITH CHECK (true);

CREATE POLICY "Allow analyzer to write L2 reports" ON public.daily_reports
  FOR ALL TO analyzer_role USING (true) WITH CHECK (true);