from pydantic import BaseModel, Field
from typing import List, Dict, Literal

# 定义“实体”的数据结构
class ExtractedEntity(BaseModel):
    name: str = Field(description="The specific name of the entity, e.g., 'NVIDIA' or 'Blackwell GPU'")
    type: Literal['COMPANY', 'PRODUCT', 'PERSON', 'TECHNOLOGY', 'OTHER'] = Field(description="The type of the entity.")

# 定义 AI 调用的总输出结构
# 这对应我们 schema.sql 中的 l1_analysis_sentiment 和 l1_analysis_entities 表
class L1AnalysisStructure(BaseModel):
    """
    A structured analysis of a single news article.
    """
    ai_summary: str = Field(description="A concise, neutral summary of the article in the requested language (under 50 words).")
    sentiment_label: Literal['Positive', 'Negative', 'Neutral'] = Field(description="The single, most accurate sentiment label.")
    sentiment_score: float = Field(description="The sentiment score from -1.0 to 1.0.")
    entities: List[ExtractedEntity] = Field(description="A list of key entities extracted from the text.")