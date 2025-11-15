import os
import sys
import json
from datetime import datetime, timedelta
from tqdm import tqdm
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from pydantic import ValidationError
from collections import defaultdict
from typing import List, Dict, Any # ⬅️ 导入 Any

# 导入我们自己的模块
from .db import get_db_client
from .l2_structure import L2ReportStructure

# -----------------------------------------------------------------
# 常量定义 (Constants)
# -----------------------------------------------------------------
MODEL_NAME = os.environ.get("MODEL_NAME", "deepseek-chat")
LANGUAGE = os.environ.get("LANGUAGE", "Chinese")
# 【新】定义 L2 报告要显示的热门实体数量
TOP_N_ENTITIES = 5 

def load_prompt() -> str:
    """从文件加载 L2 提示词"""
    prompt_path = os.path.join(os.path.dirname(__file__), 'prompts', 'l2_report.txt')
    with open(prompt_path, 'r', encoding='utf-8') as f:
        return f.read()

def get_l1_data_for_report() -> Dict[str, List[Dict]]:
    """
    【修改】获取过去24h的 L1 摘要数据 (与之前相同)
    """
    print("  (Report Step 1/4) 正在从数据库获取过去 24h 的 L1 摘要数据...")
    db = get_db_client()
    
    time_threshold = (datetime.now() - timedelta(days=1)).isoformat()
    
    try:
        # 此查询保持不变
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
            
        tqdm.write(f"  > 成功获取 {len(data)} 条 L1 摘要，分属 {len(grouped_data)} 个分类。")
        return grouped_data

    except Exception as e:
        tqdm.write(f"🔴 错误: 无法获取 L1 摘要数据: {e}")
        return {}

def get_grouped_trending_entities() -> Dict[str, List[Dict]]:
    """
    【新增】从 'daily_trending_entities' 视图中获取已聚合的热门实体数据。
    """
    print("  (Report Step 2/4) 正在从数据库视图获取热门实体数据...")
    db = get_db_client()
    try:
        # 直接查询我们创建的视图
        response = db.table("daily_trending_entities").select("*").execute()
        
        grouped_entities = defaultdict(list)
        for entity in response.data:
            # 视图返回的数据字段已完美匹配 l2_structure.py 中的 TrendingTopic 模型
            #
            grouped_entities[entity['category']].append(entity)
            
        tqdm.write(f"  > 成功获取 {len(response.data)} 条热门实体数据。")
        return grouped_entities
        
    except Exception as e:
        # 如果视图不存在 (e.g., SQL 未运行)，这里会报错
        tqdm.write(f"🔴 错误: 无法从 'daily_trending_entities' 视图获取数据: {e}")
        tqdm.write("   请确保你已在数据库中运行了 schema.sql 中的 CREATE VIEW 语句。")
        return {}

def generate_l2_report(
    category: str, 
    l1_article_data: List[Dict], 
    l1_entity_data: List[Dict], 
    chain
) -> L2ReportStructure | None:
    """
    【修改】为单个分类调用 AI，同时注入“摘要”和“实体”
    """
    try:
        # 1. 准备 L1 摘要 JSON
        l1_data_json = json.dumps(l1_article_data, ensure_ascii=False, indent=2)
        
        # 2. 【新】准备 L1 实体 JSON (只取 Top N)
        top_entities = l1_entity_data[:TOP_N_ENTITIES]
        entity_data_json = json.dumps(top_entities, ensure_ascii=False, indent=2)

        # 3. 准备 AI 输入
        ai_input = {
            "language": LANGUAGE,
            "category": category,
            "l1_data_json": l1_data_json,
            "entity_data_json": entity_data_json # ⬅️ 【新】注入实体数据
        }
        
        response: L2ReportStructure = chain.invoke(ai_input)
        
        # 4. 【新】将我们预先计算的实体数据“覆盖”回 AI 响应
        #    我们信任自己的聚合数据，AI 的职责是基于这些数据写摘要。
        #    (这也防止了 AI 在此步骤中产生幻觉或格式错误)
        
        # 确保 AI 返回的结构是我们想要的
        final_report = response.model_copy() # 复制 AI 的输出
        
        # 将 Pydantic 模型列表转换为字典列表，以便存入 JSONB
        #
        final_report.trending_topics = [
            {"topic": e['topic'], "count": e['count'], "average_sentiment": e['average_sentiment']}
            for e in top_entities
        ]

        return final_report
        
    except ValidationError as e:
        tqdm.write(f"🟡 AI 输出解析失败 (分类: {category}): {e}")
    except Exception as e:
        tqdm.write(f"🔴 AI 调用失败 (分类: {category}): {e}")
    
    return None

def save_l2_report_to_db(category: str, report: L2ReportStructure):
    """
    将 L2 报告存入数据库 'daily_reports' (表 6)。
    (此函数无需修改，但请注意我们修复了 schema.sql 中的字段名)
    """
    db = get_db_client()
    today = datetime.now().date()
    
    try:
        report_data = {
            "report_date": str(today),
            "category": category,
            "report_summary": report.report_summary,
            "overall_sentiment_score": report.overall_sentiment_score,
            # 'trending_topics' 是一个字典列表 (我们已在 generate_l2_report 中处理)
            "trending_topics": report.trending_topics 
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
    
    # 1. 初始化 AI (不变)
    try:
        # 【新】导入 Pydantic 解析器
        from langchain_core.output_parsers import PydanticOutputParser
        
        # 1. 加载原始提示词字符串
        l2_prompt_template_str = load_prompt()
        
        # 2. 设置我们的解析器
        parser = PydanticOutputParser(pydantic_object=L2ReportStructure)
        
        # 3. 从解析器获取 JSON 格式化指令
        format_instructions = parser.get_format_instructions()
        
        # 4. 【关键】将格式化指令附加到原始提示词的末尾
        l2_prompt_template_str += "\n\n{format_instructions}\n"
        
        # 5. 创建新的、包含格式化指令的 PromptTemplate
        prompt = ChatPromptTemplate.from_template(
            l2_prompt_template_str,
            partial_variables={"format_instructions": format_instructions}
        )
        
        # 6. 【修复】初始化 LLM，但*不*使用 .with_structured_output()
        llm = ChatOpenAI(model=MODEL_NAME)
        
        # 7. 创建新的 chain
        chain = prompt | llm | parser

        print(f"  > L2 AI 模型 ({MODEL_NAME}) 和提示词已加载 (使用 PydanticParser)。")
    except Exception as e:
        print(f"🔴 致命错误: 无法初始化 L2 AI: {e}")
        return

    # 2. 【修改】获取 L1 摘要 和 L1 实体
    grouped_l1_data = get_l1_data_for_report()
    grouped_entity_data = get_grouped_trending_entities() # ⬅️ 【新】
    
    if not grouped_l1_data:
        print("⏹️ 过去 24 小时没有新的 L1 分析数据。脚本退出。")
        return
        
    print(f"  (Report Step 3/4) 开始为 {len(grouped_l1_data)} 个分类生成 L2 报告...")
    
    successful_reports = 0
    
    # 3. 遍历每个分类
    with tqdm(total=len(grouped_l1_data), desc="生成 L2 报告") as pbar:
        for category, l1_data in grouped_l1_data.items():
            pbar.set_description(f"L2 报告: {category}")
            
            # 【新】获取该分类对应的实体数据
            entities_for_category = grouped_entity_data.get(category, [])
            
            # 4. 调用 AI 生成报告 (传入两种数据)
            report = generate_l2_report(category, l1_data, entities_for_category, chain)
            
            # 5. 存入数据库
            if report:
                if save_l2_report_to_db(category, report):
                    successful_reports += 1
            
            pbar.update(1)

    print(f"  (Report Step 4/4) L2 报告处理完成。")
    print("--- L2 报告脚本 (report.py) 结束 ---")
    print(f"🟢 总结：总共 {successful_reports} 份 L2 每日报告已成功存入数据库。")

if __name__ == "__main__":
    main()