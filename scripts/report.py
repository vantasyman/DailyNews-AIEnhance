import os
import sys
import json
from datetime import datetime, timedelta
from tqdm import tqdm
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from pydantic_core import PydanticException
from collections import defaultdict
from typing import List, Dict
# 导入我们自己的模块
from .db import get_db_client
from .l2_structure import L2ReportStructure

# -----------------------------------------------------------------
# 常量定义 (Constants)
# -----------------------------------------------------------------
MODEL_NAME = os.environ.get("MODEL_NAME", "deepseek-chat")
LANGUAGE = os.environ.get("LANGUAGE", "Chinese") # ⬅️ **【实现你的要求】**

def load_prompt() -> str:
    """从文件加载 L2 提示词"""
    prompt_path = os.path.join(os.path.dirname(__file__), 'prompts', 'l2_report.txt')
    with open(prompt_path, 'r', encoding='utf-8') as f:
        return f.read()

def get_l1_data_for_report() -> Dict[str, List[Dict]]:
    """
    获取过去24小时内所有“新”的 L1 分析数据，并按 'category' 分组。
    """
    print("  (Report Step 1/3) 正在从数据库获取过去 24h 的 L1 分析数据...")
    db = get_db_client()
    
    # 设置时间范围为过去 24 小时
    time_threshold = (datetime.now() - timedelta(days=1)).isoformat()
    
    try:
        # 这是一个复杂的 JOIN 查询，用于收集 L1 分析数据
        # SQL 等价于:
        # SELECT 
        #   t.category, a.title, s.ai_summary, s.sentiment_score
        # FROM l1_analysis_sentiment s
        # JOIN raw_articles a ON s.article_id = a.article_id
        # JOIN tracked_topics t ON a.topic_id = t.topic_id
        # WHERE s.analyzed_at >= [24小时前];
        
        response = db.table("l1_analysis_sentiment").select(
            """
            analyzed_at,
            raw_articles (
                title,
                tracked_topics ( category )
            ),
            ai_summary,
            sentiment_score
            """
        ).gte("analyzed_at", time_threshold).execute()

        data = response.data
        
        # 按 category 分组数据
        grouped_data = defaultdict(list)
        for item in data:
            if not item.get('raw_articles') or not item['raw_articles'].get('tracked_topics'):
                continue
                
            category = item['raw_articles']['tracked_topics']['category']
            grouped_data[category].append({
                "title": item['raw_articles']['title'],
                "summary": item['ai_summary'],
                "sentiment_score": item['sentiment_score']
            })
            
        tqdm.write(f"  > 成功获取 {len(data)} 条 L1 分析，分属 {len(grouped_data)} 个分类。")
        return grouped_data

    except Exception as e:
        tqdm.write(f"🔴 错误: 无法获取 L1 分析数据: {e}")
        return {}

def generate_l2_report(category: str, l1_data: List[Dict], chain) -> L2ReportStructure | None:
    """
    为单个分类调用 AI 生成 L2 宏观报告。
    """
    try:
        # 将 L1 数据列表转换为 JSON 字符串以注入提示
        l1_data_json = json.dumps(l1_data, ensure_ascii=False, indent=2)
        
        ai_input = {
            "language": LANGUAGE, # ⬅️ **【实现你的要求】**
            "category": category,
            "l1_data_json": l1_data_json
        }
        
        response: L2ReportStructure = chain.invoke(ai_input)
        return response
        
    except PydanticException as e:
        tqdm.write(f"🟡 AI 输出解析失败 (分类: {category}): {e}")
    except Exception as e:
        tqdm.write(f"🔴 AI 调用失败 (分类: {category}): {e}")
    
    return None

def save_l2_report_to_db(category: str, report: L2ReportStructure):
    """
    将 L2 报告存入数据库 'daily_reports' (表 6)。
    """
    db = get_db_client()
    today = datetime.now().date()
    
    try:
        report_data = {
            "report_date": str(today),
            "category": category,
            "report_summary": report.report_summary,
            "overall_sentiment_score": report.overall_sentiment_score,
            # 'trending_topics' 是一个 Pydantic 模型列表，需转换为 JSON
            "trending_topics": [t.model_dump() for t in report.trending_topics] 
        }
        
        # 'upsert' 会在 (report_date, category) 冲突时“更新”报告
        db.table("daily_reports").upsert(
            report_data, 
            on_conflict="report_date, category"
        ).execute()
        return True
        
    except Exception as e:
        tqdm.write(f"🔴 数据库写入 L2 报告失败 (分类: {category}): {e}")
        return False

def main():
    """
    L2 报告脚本主函数
    """
    print("--- L2 报告脚本 (report.py) 启动 ---")
    
    # 1. 初始化 AI
    try:
        l2_prompt_template = load_prompt()
        prompt = ChatPromptTemplate.from_template(l2_prompt_template)
        llm = ChatOpenAI(model=MODEL_NAME).with_structured_output(L2ReportStructure)
        chain = prompt | llm
        print(f"  > L2 AI 模型 ({MODEL_NAME}) 和提示词已加载。")
    except Exception as e:
        print(f"🔴 致命错误: 无法初始化 L2 AI: {e}")
        return

    # 2. 获取 L1 数据 (按分类)
    grouped_l1_data = get_l1_data_for_report()
    if not grouped_l1_data:
        print("⏹️ 过去 24 小时没有新的 L1 分析数据。脚本退出。")
        return
        
    print(f"  (Report Step 2/3) 开始为 {len(grouped_l1_data)} 个分类生成 L2 报告...")
    
    successful_reports = 0
    
    # 3. 遍历每个分类，生成并存储报告
    with tqdm(total=len(grouped_l1_data), desc="生成 L2 报告") as pbar:
        for category, l1_data in grouped_l1_data.items():
            pbar.set_description(f"L2 报告: {category}")
            
            # 4. 调用 AI 生成报告
            report = generate_l2_report(category, l1_data, chain)
            
            # 5. 存入数据库
            if report:
                if save_l2_report_to_db(category, report):
                    successful_reports += 1
            
            pbar.update(1)

    print(f"  (Report Step 3/3) L2 报告处理完成。")
    print("--- L2 报告脚本 (report.py) 结束 ---")
    print(f"🟢 总结：总共 {successful_reports} 份 L2 每日报告已成功存入数据库。")

if __name__ == "__main__":
    main()