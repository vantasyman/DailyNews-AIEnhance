// js/app.js

// 1. 从我们的 supabase_client.js 模块中导入客户端
import { supabase } from './supabase_client.js';

// --- [新增] 全局变量 ---
let modalOverlay;
let modalBody;
let currentReport = null; // 存储当前加载的 L2 报告

// 2. DOM 加载完毕后，立即执行主函数
document.addEventListener('DOMContentLoaded', () => {
  // [新增] 获取模态框 DOM 元素
  modalOverlay = document.getElementById('drilldown-modal');
  modalBody = document.getElementById('modal-body');
  const modalCloseBtn = document.getElementById('modal-close-btn');

  // [新增] 绑定模态框关闭事件
  modalCloseBtn.addEventListener('click', hideModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      hideModal();
    }
  });

  // 运行主函数
  loadDailyReport();
});

// --- [新增] 模态框控制函数 ---
function showModal() {
  modalOverlay.style.display = 'flex';
  setTimeout(() => {
    modalOverlay.style.opacity = 1;
    modalOverlay.querySelector('.modal-content').style.transform = 'scale(1)';
  }, 10);
}

function hideModal() {
  modalOverlay.style.opacity = 0;
  modalOverlay.querySelector('.modal-content').style.transform = 'scale(0.9)';
  setTimeout(() => {
    modalOverlay.style.display = 'none';
    modalBody.innerHTML = '<div class="loading-spinner"></div>'; // 清空内容
  }, 300);
}

// 3. 定义主函数：获取并渲染数据 (已合并)
async function loadDailyReport() {
  // 从原始 app.js 中获取所有 DOM 元素
  const loadingSpinner = document.getElementById('loading-spinner');
  const errorMessage = document.getElementById('error-message');
  const reportDateEl = document.getElementById('report-date');
  const summaryEl = document.getElementById('report-summary');
  const treemapEl = document.getElementById('treemap-container');

  try {
    // 隐藏错误，显示加载
    loadingSpinner.style.display = 'flex';
    errorMessage.style.display = 'none';
    treemapEl.style.display = 'none';
    summaryEl.style.display = 'none';

    // 4. 【核心查询】(来自原始 app.js)
    const { data, error } = await supabase
      .from('daily_reports')
      .select('*')
      .order('report_date', { ascending: false })
      .limit(1);

    if (error) throw error; // 抛出错误，被 catch 捕获

    if (!data || data.length === 0) {
      throw new Error("数据库中没有找到任何报告。请先运行后端自动化脚本 (GitHub Action)。");
    }

    // 5. [修改] 渲染数据，使用全局变量
    currentReport = data[0]; // 获取最新的报告并存入全局

    // 格式化日期
    const date = new Date(currentReport.report_date);
    reportDateEl.textContent = `报告日期: ${date.toLocaleDateString()}`;

    // 渲染 L2 报告摘要 (支持换行符)
    summaryEl.innerHTML = currentReport.report_summary.replace(/\n/g, '<br />');
    
    // 6. 渲染“热点预览图”
    if (currentReport.trending_topics && currentReport.trending_topics.length > 0) {
      treemapEl.style.display = 'block';
      // [修改] 传入 L2 报告的分类
      renderTreemap(currentReport.trending_topics, currentReport.category);
    } else {
      treemapEl.innerHTML = "<p>今日无热点话题数据。</p>";
    }

    // 隐藏加载，显示内容
    loadingSpinner.style.display = 'none';
    summaryEl.style.display = 'block';

  } catch (error) {
    console.error('加载报告失败:', error.message);
    loadingSpinner.style.display = 'none';
    errorMessage.textContent = `加载报告失败: ${error.message}`;
    errorMessage.style.display = 'block';
  }
}

// 7. 【“惊艳”核心】使用 D3.js 渲染热点预览图 (Treemap)
// [修改] 接收 category 参数
function renderTreemap(topicsData, category) {
  // 1. 准备 D3 Treemap 需要的数据格式
  const root = {
    name: "root",
    children: topicsData.map(topic => ({
      name: topic.topic,
      value: topic.count, // 'value' 决定方块大小
      sentiment: topic.average_sentiment // 自定义数据，用于着色
    }))
  };

  // 2. 设置 Treemap 尺寸
  const container = document.getElementById('treemap-container');
  const width = container.clientWidth;
  const height = 400; // 固定高度

  // 3. 创建颜色比例尺
  const colorScale = d3.scaleLinear()
    .domain([-1.0, 0, 1.0])
    .range(["#d90000", "#aaa", "#009e49"]); // 红 -> 灰 -> 绿

  // 4. 初始化 Treemap
  const treemap = d3.treemap()
    .size([width, height])
    .padding(2); // 方块间的间距

  // 5. 生成层级数据
  const hierarchy = d3.hierarchy(root)
    .sum(d => d.value) // 告诉 D3 使用 'value' 字段来计算大小
    .sort((a, b) => b.value - a.value);

  // 6. 计算 Treemap 布局
  const treeData = treemap(hierarchy);

  // 7. 清空容器并创建 SVG
  d3.select("#treemap-container").selectAll("*").remove(); // 清空旧图
  const svg = d3.select("#treemap-container")
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  // 8. [修改] 绘制所有方块 (cell)，并添加点击事件
  const cell = svg.selectAll("g")
    .data(treeData.leaves()) // leaves() 只获取最底层的方块
    .enter().append("g")
    .attr("class", "treemap-cell")
    .attr("transform", d => `translate(${d.x0},${d.y0})`)
    .on("click", (event, d) => { // ⬅️ [核心新增] 添加点击事件
      // d.data 包含了 {name, value, sentiment}
      // 我们还需要 L2 摘要，它在 currentReport
      showTopicModal(d.data, category, currentReport.report_summary);
    });

  // 9. 为方块添加带颜色的矩形
  cell.append("rect")
    .attr("width", d => d.x1 - d.x0)
    .attr("height", d => d.y1 - d.y0)
    .attr("fill", d => colorScale(d.data.sentiment)) // ⬅️ 用情感分数上色
    .attr("stroke", "white");

  // 10. 为方块添加文字
  cell.append("text")
    .attr("class", "treemap-text")
    .selectAll("tspan")
    .data(d => d.data.name.split(/(?=[A-Z][^A-Z])/g)) // 简单的词换行
    .enter().append("tspan")
    .attr("x", 4)
    .attr("y", (d, i) => 15 + i * 15) // 逐行显示
    .text(d => d);

  // 11. (可选) 添加 tooltip
  cell.append("title")
    .text(d => `${d.data.name}\n提及次数: ${d.data.value}\n平均情感: ${d.data.sentiment.toFixed(2)}`);
}


// --- [全新] 第 4 步: L2 模态框 - 显示话题详情和文章列表 ---

async function showTopicModal(topicData, category, l2Summary) {
  // 1. 准备 L2 模态框内容
  modalBody.innerHTML = `
    <h2>${topicData.name} (L2 宏观)</h2>
    
    <h3>所属分类 (${category}) 宏观分析</h3>
    <div class="l1-analysis-card">
      <p>${l2Summary.replace(/\n/g, '<br />')}</p>
    </div>

    <h3>相关新闻列表 (提及次数: ${topicData.value})</h3>
    <div id="article-list-container">
      <div class="loading-spinner"></div>
      <p>正在查询相关新闻...</p>
    </div>
  `;
  showModal(); // 显示模态框

  // 2. [核心查询] 异步获取关联的文章
  // RLS 策略 允许 public_api_role 执行此 SELECT
  try {
    const { data, error } = await supabase
      .from('l1_analysis_entities') // 从实体表开始
      .select(`
        article_entity_map (
          raw_articles (
            article_id,
            title,
            url
          )
        )
      `) // 深入查询到原始文章
      .eq('entity_name', topicData.name) // 匹配实体名称
      .single();

    if (error) throw error;

    // 3. 渲染文章列表
    const articles = data.article_entity_map.map(entry => entry.raw_articles);
    const listContainer = document.getElementById('article-list-container');
    
    if (articles.length === 0) {
      listContainer.innerHTML = "<p>未找到关联的详细新闻。</p>";
      return;
    }

    const listHtml = articles.map(article => 
      // [新增] 为每个 li 添加 data-* 属性来存储文章数据
      `<li class="article-list-item" 
           data-article-id="${article.article_id}" 
           data-article-title="${escape(article.title)}"
           data-article-url="${article.url}">
        ${article.title}
      </li>`
    ).join('');
    
    listContainer.innerHTML = `<ul class="article-list">${listHtml}</ul>`;
    
    // 4. [新增] 为新的列表项添加点击事件
    document.querySelectorAll('.article-list-item').forEach(item => {
      item.addEventListener('click', () => {
        const article = {
          id: item.dataset.articleId,
          title: unescape(item.dataset.articleTitle),
          url: item.dataset.articleUrl
        };
        // 传入 topicData 和 category 以便“返回”
        showArticleDetail(article, topicData, category, l2Summary); 
      });
    });

  } catch (err) {
    document.getElementById('article-list-container').innerHTML = 
      `<p style="color: red;">查询文章列表失败: ${err.message}</p>`;
  }
}


// --- [全新] 第 5 步: L1 模态框 - 显示单篇新闻的 AI 分析 ---

async function showArticleDetail(article, topicData, category, l2Summary) {
  // 1. 准备 L1 模态框内容 (带加载状态)
  modalBody.innerHTML = `
    <button id="modal-back-btn" class="modal-back-btn">
      &larr; 返回 "${topicData.name}" 列表
    </button>
    
    <h2>${article.title} (L1 微观)</h2>
    
    <h3>L1-AI 分析结果</h3>
    <div id="l1-analysis-container">
      <div class="loading-spinner"></div>
      <p>正在查询 AI 分析数据...</p>
    </div>
  `;
  
  // [新增] 为返回按钮添加事件
  document.getElementById('modal-back-btn').addEventListener('click', () => {
    showTopicModal(topicData, category, l2Summary);
  });

  // 2. [核心查询] 异步获取 L1 分析数据
  // RLS 策略 允许 public_api_role 执行此 SELECT
  try {
    const { data: l1Data, error: l1Error } = await supabase
      .from('l1_analysis_sentiment') // 查询 L1 情感表
      .select('ai_summary, sentiment_label, sentiment_score')
      .eq('article_id', article.id) // 匹配文章 ID
      .single();

    if (l1Error) throw l1Error;

    // 3. 渲染 L1 分析结果
    const container = document.getElementById('l1-analysis-container');
    const sentimentClass = l1Data.sentiment_label.toLowerCase(); // 'positive', 'negative', 'neutral'

    container.innerHTML = `
      <div class="l1-analysis-card">
        <p><strong>AI 摘要:</strong></p>
        <p>${l1Data.ai_summary}</p>
        <p class="l1-sentiment ${sentimentClass}">
          情感: ${l1Data.sentiment_label} (分数: ${l1Data.sentiment_score.toFixed(2)})
        </p>
      </div>
      
      <h3>原文链接</h3>
      <a href="${article.url}" target="_blank" rel="noopener noreferrer">
        点击跳转到原文 ( ${article.url.substring(0, 50)}... )
      </a>
    `;

  } catch (err) {
    document.getElementById('l1-analysis-container').innerHTML = 
      `<p style="color: red;">查询 L1 分析失败: ${err.message}</p>`;
  }
}

// [新增] 用于转义 HTML 属性的辅助函数
function escape(str) {
  // 基本的转义，防止属性被破坏
  if (!str) return "";
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}