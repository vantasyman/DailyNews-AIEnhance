-- AI-Trend-Engine 数据库表结构 (V2 - Data-Centric)
-- 数据库类型: PostgreSQL (兼容 Supabase)

-- -------------------------------
-- 表 1: 追踪主题配置表 (Config)
-- 告诉系统要关心什么
-- -------------------------------
CREATE TABLE public.tracked_topics (
  topic_id SERIAL PRIMARY KEY,
  keyword TEXT NOT KEY NULL UNIQUE,   -- 追踪的关键词, e.g., "NVIDIA", "原神"
  category TEXT NOT NULL,         -- 用于分类, e.g., "财经", "游戏", "体育"
  is_active BOOLEAN DEFAULT true  -- 是否启用此关键词
);

-- -------------------------------
-- 表 2: 原始文章表 (L0 - Raw Data)
-- 爬虫抓取的数据存放区
-- -------------------------------
CREATE TABLE public.raw_articles (
  article_id SERIAL PRIMARY KEY,
  -- 关联到主题表，让我们知道这篇文章是为什么被爬取的
  topic_id INT REFERENCES public.tracked_topics(topic_id) ON DELETE SET NULL,
  
  url TEXT NOT NULL UNIQUE,         -- 用 URL 作为唯一键，实现自动去重
  title TEXT NOT NULL,
  snippet TEXT,                     -- 原始摘要/片段
  source_name TEXT NOT NULL,        -- 来源, e.g., "路透社", "IGN"
  publication_date TIMESTAMPTZ,
  crawl_date TIMESTAMPTZ DEFAULT now()
);

-- -------------------------------
-- 表 3: L1 分析 - 情感摘要表 (L1 - Analysis)
-- 存储对“每篇”文章的 AI 分析结果 (一对一关系)
-- -------------------------------
CREATE TABLE public.l1_analysis_sentiment (
  analysis_id SERIAL PRIMARY KEY,
  
  -- 建立严格的一对一关系，确保每篇文章只被分析一次
  article_id INT NOT NULL UNIQUE REFERENCES public.raw_articles(article_id) ON DELETE CASCADE,
  
  ai_summary TEXT,                  -- AI 生成的摘要
  sentiment_score FLOAT,            -- 情感评分 (e.g., -1.0 到 1.0)
  sentiment_label TEXT,             -- 'Positive', 'Negative', 'Neutral'
  analyzed_at TIMESTAMPTZ DEFAULT now()
);

-- -------------------------------
-- 表 4: L1 分析 - 实体表 (L1 - Entities)
-- 规范化存储所有 AI 提取出的实体 (公司, 产品, 人物)
-- -------------------------------
CREATE TABLE public.l1_analysis_entities (
  entity_id SERIAL PRIMARY KEY,
  entity_name TEXT NOT NULL UNIQUE,   -- 实体名称, e.g., "英伟达", "Blackwell 架构"
  entity_type TEXT NOT NULL           -- 实体类型, e.g., "COMPANY", "PRODUCT"
);

-- -------------------------------
-- 表 5: 文章-实体-连接表 (Junction Table)
-- 建立 'raw_articles' 和 'l1_analysis_entities' 之间的多对多关系
-- -------------------------------
CREATE TABLE public.article_entity_map (
  article_id INT NOT NULL REFERENCES public.raw_articles(article_id) ON DELETE CASCADE,
  entity_id INT NOT NULL REFERENCES public.l1_analysis_entities(entity_id) ON DELETE CASCADE,
  
  -- 复合主键，确保同一篇文章和实体的组合只出现一次
  PRIMARY KEY (article_id, entity_id)
);

-- -------------------------------
-- 表 6: L2 每日报告表 (L2 - Reports)
-- 存储最终的“每日简报”
-- -------------------------------
CREATE TABLE public.daily_reports (
  report_id SERIAL PRIMARY KEY,
  report_date DATE NOT NULL,
  category TEXT NOT NULL,                 -- 报告的分类 (e.g., "财经", "游戏")
  report_summary TEXT,                    -- AI 生成的当日总结
  overall_sentiment_score FLOAT,        -- 当日该分类的平均情感
  trending_entities JSONB,                -- 热门实体 (e.g., [{"name": "英伟达", "count": 25}])
  generated_at TIMESTAMPTZ DEFAULT now(),
  
  -- 确保每天每个分类只有一份报告
  UNIQUE(report_date, category)
);