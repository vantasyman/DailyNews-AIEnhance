import os
import httpx
from datetime import datetime, timedelta
from tqdm import tqdm
from typing import List, Dict, Any

# 导入我们自己的数据库客户端
# .db 会自动找到同目录下的 db.py
from .db import get_db_client

# -----------------------------------------------------------------
# 常量定义 (Constants)
# -----------------------------------------------------------------
NEWS_API_BASE_URL = "https://gnews.io/api/v4/search"
# 为避免 API 滥用和控制 AI 成本，我们只取每个主题最新的 20 篇文章
ARTICLES_PER_TOPIC = 30


def fetch_topics_from_db() -> List[Dict[str, Any]]:
    """
    从数据库 'tracked_topics' 表中获取所有激活的关键词。
    [对应 schema.sql 表 1]
    """
    print("  (Crawler Step 1/3) 正在从数据库获取追踪主题...")
    db = get_db_client()
    try:
        response = db.table("tracked_topics").select("*").eq("is_active", True).execute()
        topics = response.data
        tqdm.write(f"  > 成功获取 {len(topics)} 个激活的主题。")
        return topics
    except Exception as e:
        tqdm.write(f"🔴 错误: 无法从 'tracked_topics' 表获取数据: {e}")
        return []

def fetch_articles_from_api(topic: Dict[str, Any], api_key: str) -> List[Dict[str, Any]]:
    """
    根据单个主题，调用 NewsAPI 获取文章。
    """
    db_keyword = topic.get('keyword', '')
    db_category = topic.get('category', '')
    
    # NewsAPI 允许使用 'q' (关键词) 和 'category' (分类)
    # 我们将它们组合使用，并用 'NOT 政治' 来规避风险
    query = db_keyword
    
    # 计算一天前的时间，只看最新的
    yesterday = (datetime.now() - timedelta(days=1)).isoformat()
    
    params = {
        "q": query,
        "lang": "en",
        "max": ARTICLES_PER_TOPIC,
        "sortby": "publishedAt",
        "apikey": api_key,   # ✅ 官方推荐命名
    }

    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.get(NEWS_API_BASE_URL, params=params)
            response.raise_for_status() # 如果 API 返回 4xx 或 5xx，将引发异常
            
            api_data = response.json()
            articles = api_data.get("articles", [])
            tqdm.write(f"  > API 返回: 主题 '{db_keyword}' 找到 {len(articles)} 篇文章。")
            return articles
            
    except httpx.HTTPStatusError as e:
        tqdm.write(f"🔴 错误: NewsAPI 请求失败 (HTTP {e.response.status_code})，主题: {db_keyword}")
    except httpx.RequestError as e:
        tqdm.write(f"🔴 错误: 网络请求失败: {e}")
    except Exception as e:
        tqdm.write(f"🔴 错误: API 数据解析失败: {e}")
    
    return []

def save_articles_to_db(articles: List[Dict[str, Any]], topic_id: int):
    """
    将从 API 获取的文章列表存入数据库。
    [对应 schema.sql 表 2]
    """
    if not articles:
        return 0
        
    db = get_db_client()
    new_articles_to_insert = []
    
    for article in articles:
        # 格式化数据以匹配我们的 'raw_articles' 表
        new_articles_to_insert.append({
            "topic_id": topic_id,
            "url": article.get("url"),
            "title": article.get("title"),
            "snippet": article.get("description") or article.get("content"),
            "source_name": article.get("source", {}).get("name"),
            "publication_date": article.get("publishedAt"),
            # crawl_date 会自动由数据库的 'DEFAULT now()' 填充
        })

    try:
        # **【核心成本控制】**
        # on_conflict="url" 告诉数据库：如果 'url' 字段已存在，就忽略这行数据。
        # 'ignore_duplicates=True' 是 Supabase-Python 库的写法。
        # 这确保我们永远不会重复插入同一篇文章。
        response = db.table("raw_articles").insert(
            new_articles_to_insert, 
            on_conflict="url", 
            ignore_duplicates=True
        ).execute()
        
        # response.data 包含了 "新" 插入的数据条目
        inserted_count = len(response.data)
        return inserted_count
        
    except Exception as e:
        tqdm.write(f"🔴 错误: 插入文章到 'raw_articles' 表失败: {e}")
        return 0

def main():
    """
    爬虫主函数
    """
    print("--- 爬虫脚本 (crawler.py) 启动 ---")
    
    news_api_key = os.environ.get("NEWS_API_KEY")
    if not news_api_key:
        print("🔴 错误: NEWS_API_KEY 环境变量未设置！爬虫无法运行。")
        return

    # 1. 获取要追踪的主题
    topics = fetch_topics_from_db()
    if not topics:
        print("⏹️ 数据库中没有激活的主题。爬虫退出。")
        return
        
    total_new_articles = 0
    
    # 2. 遍历每个主题并爬取
    print("  (Crawler Step 2/3) 正在从 NewsAPI 获取文章...")
    with tqdm(total=len(topics), desc="处理主题") as pbar:
        for topic in topics:
            pbar.set_description(f"处理中: {topic['keyword']}")
            
            # 3. 从 API 获取文章
            articles = fetch_articles_from_api(topic, news_api_key)
            
            if articles:
                # 4. 保存到数据库 (此步骤会自动去重)
                new_count = save_articles_to_db(articles, topic['topic_id'])
                total_new_articles += new_count
                tqdm.write(f"  > 存储: 主题 '{topic['keyword']}' 新增 {new_count} 篇文章到数据库。")
            
            pbar.update(1)

    print("  (Crawler Step 3/3) 爬取完成。")
    print(f"--- 爬虫脚本 (crawler.py) 结束 ---")
    print(f"🟢 总结：总共发现 {total_new_articles} 篇新文章并存入数据库。")


if __name__ == "__main__":
    main()