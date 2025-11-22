# 🚀 AI 趋势分析引擎 (DailyNews-AIEnhance)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python](https://img.shields.io/badge/Python-3.12-blue)](https://www.python.org/)
[![Supabase](https://img.shields.io/badge/Database-Supabase-green)](https://supabase.com/)
[![LangChain](https://img.shields.io/badge/AI-LangChain-orange)](https://www.langchain.com/)

> **从碎片化新闻到宏观市场洞察。** > 本项目不仅仅是一个新闻聚合器，更是一个全自动化的**AI 商业情报分析系统**。它利用 LLM 将海量原始新闻转化为结构化的情感数据和执行简报。

---

## ✨ 核心特色 (Unique Features)

本项目采用独特的 **"L0-L1-L2" 三层数据架构**，实现从原始数据到高层洞察的自动化提炼：

### 1. 🧠 双层 AI 分析架构 (Micro & Macro Analysis)
不同于普通的摘要工具，我们模拟了人类分析师的思维过程：
* **L1 微观分析 (Micro):** 对每一篇抓取的新闻进行独立分析。
    * **情感量化：** 计算 -1.0 到 1.0 的情感得分。
    * **实体提取 (NER)：** 自动识别并规范化新闻中的“公司”、“产品”、“人物”等关键实体。
* **L2 宏观报告 (Macro):** 基于 L1 的数据聚合，生成每日**行业执行简报 (Executive Briefing)**。
    * 自动计算当日行业综合情感指数。
    * 生成 Top 5 热点话题分布。

### 2. 📊 深度交互可视化 (D3.js Treemap)
前端采用 **D3.js** 构建动态热力矩形图：
* **颜色编码：** 绿色代表积极趋势，红色代表消极趋势，直观展示市场情绪。
* **下钻交互 (Drill-down)：** 1.  点击**分类 Tab** 查看宏观简报。
    2.  点击**热力图块** 查看特定实体（如 NVIDIA）的聚合分析。
    3.  进一步点击查看具体的 **L1 AI 摘要**及原文链接。

### 3. ☁️ 完全 Serverless 与自动化
* **零运维成本：** 后端逻辑完全托管在 **GitHub Actions** 上，利用 CRON 定时任务触发。
* **BaaS 架构：** 数据库与鉴权完全依赖 **Supabase**。
* **静态部署：** 前端直接托管于 **GitHub Pages**。

---

## 🛠️ 技术栈 (Tech Stack)

* **后端 / AI 流水线:**
    * `Python 3.12`
    * `LangChain` (AI 编排)
    * `OpenAI / DeepSeek API` (LLM 支持)
    * `Pydantic` (严格的数据结构验证)
    * `NewsAPI` / `GNews` (数据源)
* **数据库:**
    * `Supabase (PostgreSQL)`
    * **RLS (Row Level Security):** 严格的角色级数据安全策略。
* **前端:**
    * `HTML5 / CSS3` (原生开发，无框架依赖)
    * `D3.js v7` (数据可视化)
    * `Supabase JS Client`

---

## 🏗️ 系统架构图

```mermaid
graph TD
    A[Cron Schedule] -->|触发| B(GitHub Actions)
    B --> C{Sync Topics}
    C -->|同步配置| D[(Supabase DB)]
    B --> E[Crawler L0]
    E -->|Fetch| F[NewsAPI]
    E -->|存储原始新闻| D
    B --> G[Analysis L1]
    G -->|读取未处理新闻| D
    G -->|LLM 微观分析| H[AI Model]
    H -->|情感/实体/摘要| D
    B --> I[Report L2]
    I -->|聚合 L1 数据| D
    I -->|LLM 宏观总结| H
    I -->|生成每日简报| D
    J[Web Frontend] -->|读取只读视图| D
