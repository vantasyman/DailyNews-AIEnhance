import os
import sys
from typing import List, Dict, Any

# 导入我们自己的数据库客户端
try:
    from .db import get_db_client
except ImportError:
    from db import get_db_client

def parse_topics_from_env() -> List[Dict[str, str]]:
    """
    从环境变量 TRACKED_TOPICS 中解析主题。
    格式: "分类1:关键词1, 分类2:关键词2"
    """
    topics_str = os.environ.get("TRACKED_TOPICS", "")
    if not topics_str:
        print("  (Sync) 🟡 警告: 环境变量 'TRACKED_TOPICS' 未设置或为空。")
        return []

    parsed_topics = []
    topics_list = topics_str.split(',')
    
    for topic_pair in topics_list:
        if ':' not in topic_pair:
            print(f"  (Sync) 🟡 警告: 忽略格式错误的条目: '{topic_pair}'")
            continue
            
        parts = topic_pair.split(':', 1) # 只在第一个冒号处分割
        category = parts[0].strip()
        keyword = parts[1].strip()
        
        if category and keyword:
            parsed_topics.append({"category": category, "keyword": keyword})
        
    return parsed_topics

def sync_topics_to_db(topics: List[Dict[str, str]]):
    """
    将解析出的主题列表 'Upsert' (插入或更新) 到数据库中。
    """
    if not topics:
        print("  (Sync) ⏹️ 没有要同步到数据库的主题。")
        return

    db = get_db_client()
    
    # 准备 'upsert' 的数据
    # 我们将 'is_active' 设为 True，
    # 'keyword' 是我们 schema.sql 中的 UNIQUE 键
    data_to_upsert = [
        {
            "category": topic['category'],
            "keyword": topic['keyword'],
            "is_active": True
        }
        for topic in topics
    ]
    
    try:
        print(f"  (Sync) 正在将 {len(data_to_upsert)} 个主题同步 (Upsert) 到 'tracked_topics' 表...")
        
        # 'upsert' 是关键：
        # 1. 如果 'keyword' 已存在，它会更新 'category' 和 'is_active' 字段。
        # 2. 如果 'keyword' 不存在，它会插入新行。
        response = db.table("tracked_topics").upsert(
            data_to_upsert,
            on_conflict="keyword" # 冲突时依赖 'keyword' 键
        ).execute()
        
        print(f"  (Sync) 🟢 数据库同步成功。处理了 {len(response.data)} 条记录。")

    except Exception as e:
        print(f"  (Sync) 🔴 错误: 同步 'tracked_topics' 失败: {e}")
        sys.exit(1) # 同步失败是严重错误，终止工作流

def main():
    """
    同步脚本的主函数
    """
    print("--- 关键词同步脚本 (sync_topics.py) 启动 ---")
    
    # 1. 解析环境变量
    topics_to_sync = parse_topics_from_env()
    
    # 2. 同步到数据库
    sync_topics_to_db(topics_to_sync)
    
    print("--- 关键词同步脚本 (sync_topics.py) 结束 ---")

if __name__ == "__main__":
    main()