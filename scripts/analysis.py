import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Any
from tqdm import tqdm
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from pydantic import ValidationError

# 导入我们自己的模块
from .db import get_db_client
from .l1_structure import L1AnalysisStructure

# -----------------------------------------------------------------
# 常量定义 (Constants)
# -----------------------------------------------------------------
# 从环境变量中获取 AI 配置，使用原仓库的变量名
MODEL_NAME = os.environ.get("MODEL_NAME", "deepseek-chat")
LANGUAGE = os.environ.get("LANGUAGE", "Chinese")
# 并行处理的工作线程数，就像原仓库的 'max_workers'
MAX_WORKERS = 2 

def load_prompt() -> str:
    """从文件加载 L1 提示词"""
    prompt_path = os.path.join(os.path.dirname(__file__), 'prompts', 'l1_analysis.txt')
    with open(prompt_path, 'r', encoding='utf-8') as f:
        return f.read()

def get_unanalyzed_articles() -> List[Dict[str, Any]]:
    """
    从数据库获取所有“未被分析过”的文章 (L0)。
    这是通过 'LEFT JOIN' 实现的：我们查找所有在 'raw_articles' 中
    但“不在” 'l1_analysis_sentiment' 表中的文章。
    """
    print("  (Analysis Step 1/3) 正在从数据库获取“未分析”的文章...")
    db = get_db_client()
    try:
        # 使用 PostgREST 的 RPC (远程过程调用) 或视图 (View) 是最高效的
        # 但为简单起见，我们使用一个等效的 'left_join' 查询
        # (注意: Supabase-py v2+ 可能需要调整此查询语法)
        #
        # SQL 等价于:
        # SELECT a.article_id, a.title, a.snippet, t.keyword 
        # FROM raw_articles a
        # JOIN tracked_topics t ON a.topic_id = t.topic_id
        # LEFT JOIN l1_analysis_sentiment s ON a.article_id = s.article_id
        # WHERE s.analysis_id IS NULL;

        response = db.table("raw_articles").select(
            "article_id, title, snippet, tracked_topics(keyword), l1_analysis_sentiment(analysis_id)"
        ).is_("l1_analysis_sentiment.analysis_id", None).execute()
        
        articles = response.data
        tqdm.write(f"  > 成功获取 {len(articles)} 篇新文章待分析。")
        return articles
    except Exception as e:
        tqdm.write(f"🔴 错误: 无法获取未分析的文章: {e}")
        return []

def process_single_article(article: Dict[str, Any], chain) -> Dict[str, Any] | None:
    """
    使用 AI chain 处理单篇文章，并返回结构化数据。
    """
    try:
        # 准备 AI 模型的输入
        # (注意：'tracked_topics' 是一个字典列表，我们需要提取第一个)
        topic_keyword = "general"
        if article.get('tracked_topics'):
            topic_keyword = article['tracked_topics']['keyword']
            
        ai_input = {
            "language": LANGUAGE,
            "topic_keyword": topic_keyword,
            "article_title": article['title'],
            "article_snippet": article['snippet']
        }
        
        # 调用 AI (这步最耗时)
        response: L1AnalysisStructure = chain.invoke(ai_input)
        
        # 将结果与文章 ID 绑定，以便稍后存入数据库
        return {"article_id": article['article_id'], "analysis": response}
        
    except ValidationError as e:
        tqdm.write(f"🟡 AI 输出解析失败 (ID: {article['article_id']}): {e}")
    except Exception as e:
        tqdm.write(f"🔴 AI 调用失败 (ID: {article['article_id']}): {e}")
    
    return None

def save_analysis_to_db(result: Dict[str, Any]):
    """
    将单篇 AI 分析结果（L1）存入数据库的三个表中。
    [对应 schema.sql 表 3, 4, 5]
    """
    db = get_db_client()
    article_id = result['article_id']
    analysis = result['analysis']

    try:
        # 1. 写入 'l1_analysis_sentiment' 表 (表 3)
        db.table("l1_analysis_sentiment").insert({
            "article_id": article_id,
            "ai_summary": analysis.ai_summary,
            "sentiment_score": analysis.sentiment_score,
            "sentiment_label": analysis.sentiment_label
        }).execute()
        
        # 2. & 3. 写入 'l1_analysis_entities' (表 4) 和 'article_entity_map' (表 5)
        if analysis.entities:
            entity_ids_to_map = []
            
            # 准备实体数据
            entities_to_upsert = [
                {"entity_name": e.name, "entity_type": e.type} 
                for e in analysis.entities
            ]
            
            # 'upsert' 会插入新实体，或在 'entity_name' 冲突时更新现有实体
            # 这能确保 'NVIDIA' 在 'l1_analysis_entities' 中只存在一次 (规范化)
            entity_response = db.table("l1_analysis_entities").upsert(
                entities_to_upsert, 
                on_conflict="entity_name"
            ).execute()
            
            entity_ids = [e['entity_id'] for e in entity_response.data]
            
            # 准备连接表数据 (多对多关系)
            map_data_to_insert = [
                {"article_id": article_id, "entity_id": eid}
                for eid in entity_ids
            ]

            # 插入连接表，'ignore_duplicates=True' 防止重复
            db.table("article_entity_map").insert(
                map_data_to_insert,
                on_conflict="article_id, entity_id",
                ignore_duplicates=True
            ).execute()

        return True # 表示成功
        
    except Exception as e:
        tqdm.write(f"🔴 数据库写入失败 (ID: {article_id}): {e}")
        # (可选) 在这里添加逻辑，删除已插入的 l1_analysis_sentiment，以实现事务回滚
        db.table("l1_analysis_sentiment").delete().eq("article_id", article_id).execute()
        return False # 表示失败

def main():
    """
    L1 分析脚本主函数
    """
    print("--- L1 分析脚本 (analysis.py) 启动 ---")
    
    # 1. 初始化 AI
    try:
        l1_prompt_template = load_prompt()
        prompt = ChatPromptTemplate.from_template(l1_prompt_template)
        
        # 使用 Pydantic 模型强制 AI 输出 JSON
        llm = ChatOpenAI(model=MODEL_NAME).with_structured_output(L1AnalysisStructure)
        
        chain = prompt | llm
        print(f"  > AI 模型 ({MODEL_NAME}) 和提示词已加载。")
    except Exception as e:
        print(f"🔴 致命错误: 无法初始化 AI: {e}")
        return

    # 2. 获取待处理的文章
    articles_to_process = get_unanalyzed_articles()
    if not articles_to_process:
        print("⏹️ 没有新文章需要分析。脚本退出。")
        return
        
    print(f"  (Analysis Step 2/3) 开始使用 {MAX_WORKERS} 个并行线程处理 {len(articles_to_process)} 篇文章...")
    
    successful_analyses = 0
    
    # 3. 并行调用 AI (复用原仓库的多线程逻辑)
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        # 提交所有 AI 分析任务
        future_to_article = {
            executor.submit(process_single_article, article, chain): article
            for article in articles_to_process
        }
        
        # 收集 AI 分析结果 (带进度条)
        ai_results = []
        for future in tqdm(as_completed(future_to_article), total=len(articles_to_process), desc="AI 分析 (L1)"):
            result = future.result()
            if result:
                ai_results.append(result)

    print(f"  > AI 分析完成。成功 {len(ai_results)} 篇，失败 {len(articles_to_process) - len(ai_results)} 篇。")

    # 4. 将 AI 结果存入数据库
    if ai_results:
        print(f"  (Analysis Step 3/3) 正在将 {len(ai_results)} 篇分析结果存入数据库...")
        with tqdm(total=len(ai_results), desc="数据库写入 (L1)") as pbar:
            for result in ai_results:
                if save_analysis_to_db(result):
                    successful_analyses += 1
                pbar.update(1)

    print("--- L1 分析脚本 (analysis.py) 结束 ---")
    print(f"🟢 总结：总共 {successful_analyses} 篇新文章的 L1 分析已成功存入数据库。")

if __name__ == "__main__":
    main()