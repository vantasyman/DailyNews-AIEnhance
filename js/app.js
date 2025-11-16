import { supabaseClient as supabase } from './supabase_client.js';

// --- 全局变量 ---
let modalOverlay;
let modalBody;
// let currentReport = null; // <- 不再需要，改为 reportMap
let reportMap = new Map(); // 存储所有报告，按分类索引
let currentVisibleCategory = null; // 当前显示的分类


// 2. DOM 加载完毕
document.addEventListener('DOMContentLoaded', () => {
  // 获取模态框 DOM 元素
  modalOverlay = document.getElementById('drilldown-modal');
  modalBody = document.getElementById('modal-body');
  const modalCloseBtn = document.getElementById('modal-close-btn');

  // 绑定模态框关闭事件
  modalCloseBtn.addEventListener('click', hideModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      hideModal();
    }
  });

  // 运行主函数
  loadAllDailyReports();
});

// --- 模态框控制函数 (不变) ---
function showModal() { /* ... (代码不变) ... */ }
function hideModal() { /* ... (代码不变) ... */ }
// ... (复制粘贴你原来的 showModal 和 hideModal 函数) ...

// 3. 【重构】获取“所有”今日报告
async function loadAllDailyReports() {
  const loadingSpinner = document.getElementById('loading-spinner');
  const errorMessage = document.getElementById('error-message');
  const reportDateEl = document.getElementById('report-date');
  const summaryEl = document.getElementById('report-summary');
  const treemapEl = document.getElementById('treemap-container');

  try {
    loadingSpinner.style.display = 'flex';
    errorMessage.style.display = 'none';
    treemapEl.style.display = 'none';
    summaryEl.style.display = 'none';

    // 4. 【核心查询修改】获取过去 24h 的所有报告，不再 limit(1)
    const yesterday = new Date(new Date().setDate(new Date().getDate() - 1)).toISOString();

    const { data, error } = await supabase
      .from('daily_reports')
      .select('*')
      .gte('report_date', yesterday) // 大于等于 24h 前
      .order('category', { ascending: true }); // 按分类名排序

    if (error) throw error;

    if (!data || data.length === 0) {
      throw new Error("数据库中没有找到任何报告。请先运行后端自动化脚本 (GitHub Action)。");
    }

    // 5. 渲染 Tab
    renderCategoryTabs(data);
    
    // 6. 默认显示第一个报告
    if (data.length > 0) {
      renderReportDetails(data[0].category);
    }
    
    loadingSpinner.style.display = 'none';
    summaryEl.style.display = 'block';
    treemapEl.style.display = 'block'; // 确保 treemap 容器可见

  } catch (error) {
    console.error('加载报告失败:', error.message);
    loadingSpinner.style.display = 'none';
    errorMessage.textContent = `加载报告失败: ${error.message}`;
    errorMessage.style.display = 'block';
  }
}

// 4. 【新增】渲染分类 Tab
function renderCategoryTabs(reportsData) {
    const tabsContainer = document.getElementById('category-tabs-container');
    tabsContainer.innerHTML = ''; // 清空
    reportMap.clear(); // 清空旧数据

    reportsData.forEach((report, index) => {
        // 存储报告数据
        reportMap.set(report.category, report);

        // 创建 Tab 按钮
        const tab = document.createElement('div');
        tab.className = 'category-tab';
        tab.textContent = report.category;
        tab.dataset.category = report.category;
        
        // 默认激活第一个
        if (index === 0) {
            tab.classList.add('active');
            currentVisibleCategory = report.category;
        }

        // 添加点击事件
        tab.addEventListener('click', () => {
            // 移除所有 Tab 的 active 状态
            document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
            // 激活当前点击的
            tab.classList.add('active');
            // 渲染该分类的数据
            renderReportDetails(report.category);
        });
        
        tabsContainer.appendChild(tab);
    });
}

// 5. 【新增】渲染特定分类的报告详情
function renderReportDetails(category) {
    const report = reportMap.get(category);
    if (!report) return;

    currentVisibleCategory = category; // 更新全局状态
    
    // 获取 DOM 元素
    const titleEl = document.getElementById('report-title');
    const dateEl = document.getElementById('report-date');
    const summaryEl = document.getElementById('report-summary');
    const treemapEl = document.getElementById('treemap-container');

    // 1. 渲染标题和日期
    titleEl.textContent = `${report.category} - 今日热点简报`;
    const date = new Date(report.report_date);
    dateEl.textContent = `报告日期: ${date.toLocaleDateString()}`;

    // 2. 渲染 L2 报告摘要
    summaryEl.innerHTML = report.report_summary.replace(/\n/g, '<br />');
    
    // 3. 渲染“热点预览图”
    if (report.trending_topics && report.trending_topics.length > 0) {
      treemapEl.style.display = 'block';
      renderTreemap(report.trending_topics, report.category); // 调用我们修改过的 treemap 函数
    } else {
      treemapEl.innerHTML = "<p>今日无热点话题数据。</p>";
      treemapEl.style.display = 'block';
    }
}

// 7. 【“惊艳”核心】使用 D3.js 渲染热点预览图 (Treemap)
// [修改] 接收 category 参数
// 7. 【“惊艳”核心】使用 D3.js 渲染热点预览图 (Treemap)
function renderTreemap(topicsData, category) {
  // 1. 准备 D3 Treemap 需要的数据格式 (不变)
  const root = {
    name: "root",
    children: topicsData.map(topic => ({
      name: topic.topic,
      value: topic.count, 
      sentiment: topic.average_sentiment 
    }))
  };

  // 2. 设置 Treemap 尺寸
  const container = document.getElementById('treemap-container');
  // 【修复】我们不再读取 clientWidth，而是使用一个固定的“画布”尺寸
  const width = 1000; // 假设我们的理想宽度是 1000px
  const height = 600; // 假设我们的理想高度是 600px

  // 3. 创建颜色比例尺 (不变)
  const colorScale = d3.scaleLinear()
    .domain([-1.0, 0, 1.0])
    .range(["#d90000", "#aaa", "#009e49"]); // 红 -> 灰 -> 绿

  // 4. 初始化 Treemap (不变)
  const treemap = d3.treemap()
    .size([width, height])
    .padding(2); 

  // 5. 生成层级数据 (不变)
  const hierarchy = d3.hierarchy(root)
    .sum(d => d.value) 
    .sort((a, b) => b.value - a.value);

  // 6. 计算 Treemap 布局 (不变)
  const treeData = treemap(hierarchy);

  // 7. 清空容器并创建 SVG
  d3.select("#treemap-container").selectAll("*").remove(); // 清空旧图
  
  // ⬇️ --- 【核心修复】 --- ⬇️
  const svg = d3.select("#treemap-container")
    .append("svg")
    // 1. 设置 "viewBox"，告诉 SVG 我们的“内部坐标系”
    .attr("viewBox", `0 0 ${width} ${height}`)
    // 2. 移除固定的 width/height 属性，让 CSS 来控制它
    // .attr("width", width)  <- 移除
    // .attr("height", height) <- 移除
    // 3. (可选) 添加 CSS 样式以确保它占满容器
    .style("width", "100%")
    .style("height", "auto"); 
  // ⬆️ --- 【核心修复】 --- ⬆️

  // 8. 绘制所有方块 (cell) (不变)
  const cell = svg.selectAll("g")
    .data(treeData.leaves()) 
    .enter().append("g")
    .attr("class", "treemap-cell")
    .attr("transform", d => `translate(${d.x0},${d.y0})`)
    .on("click", (event, d) => { 
      showTopicModal(d.data, category, currentReport.report_summary);
    });

  // 9. 为方块添加带颜色的矩形 (不变)
  cell.append("rect")
    .attr("width", d => d.x1 - d.x0)
    .attr("height", d => d.y1 - d.y0)
    .attr("fill", d => colorScale(d.data.sentiment)) 
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