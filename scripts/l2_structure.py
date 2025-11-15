from pydantic import BaseModel, Field
from typing import List, Dict

class TrendingTopic(BaseModel):
    topic: str = Field(description="The name of the trending topic or entity.")
    count: int = Field(description="The number of articles mentioning this topic.")
    average_sentiment: float = Field(description="The average sentiment score for this topic.")

class L2ReportStructure(BaseModel):
    """
    The final L2 Daily Executive Briefing.
    """
    report_summary: str = Field(description="The 150-word executive summary in the requested language, explaining the 'why'.")
    overall_sentiment_score: float = Field(description="The calculated average sentiment score for the entire day/category.")
    trending_topics: List[TrendingTopic] = Field(description="A list of the Top 3-5 trending topics for the day.")