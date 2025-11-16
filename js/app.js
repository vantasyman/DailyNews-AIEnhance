// js/app.js
import { supabaseClient as supabase } from './supabase_client.js';

// --- 全局变量 ---
let modalOverlay;
let modalBody;
let reportMap = new Map(); // 存储当前加载日期的报告
let currentVisibleCategory = null; 
let datePicker; // 日期选择器的 DOM 元素

// --- 辅助函数：获取 'YYYY-MM-DD' 格式的日期字符串 ---
function getLocalDateString(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0'); // 月份从 0 开始
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

// --- 1. DOM 加载完毕 ---
document.addEventListener('DOMContentLoaded', () => {
  // 模态框初始化
  modalOverlay = document.getElementById('drilldown-modal');
  modalBody = document.getElementById('modal-body');
  const modalCloseBtn = document.getElementById('modal-close-btn');

  if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', hideModal);
  }
  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        hideModal();
      }
    });
  }

  // 【新】日期选择器初始化
  datePicker = document.getElementById('report-date-picker');
  const todayStr = getLocalDateString(new Date()); // 获取今天的日期
  datePicker.value = todayStr; // 默认设置为今天
  
  // 【新】添加事件监听：当日期改变时，重新加载数据
  datePicker.addEventListener('change', () => {
    const selectedDate = datePicker.value;
    loadReportsForDate(selectedDate);
  });

  // 运行主函数：加载今天的数据
  loadReportsForDate(todayStr);
});


// --- 2. 【重构】主函数：获取并渲染“指定日期”的数据 ---
async function loadReportsForDate(dateStr) {
  const loadingSpinner = document.getElementById('loading-spinner');
  const errorMessage = document.getElementById('error-message');
  const treemapEl = document.getElementById('treemap-container');
  const summaryEl = document.getElementById('report-summary');
  const tabsContainer = document.getElementById('category-tabs-container');

  // A. 开始加载
  loadingSpinner.style.display = 'flex';
  errorMessage.style.display = 'none';
  treemapEl.style.display = 'none';
  summaryEl.style.display = 'none';
  tabsContainer.innerHTML = ''; // 清空旧的 Tab
  clearReportDetails(); // 清空报告详情

  try {
    // B. 【核心查询修改】使用 .eq() 来精确匹配所选日期
    const { data, error } = await supabase
      .from('daily_reports')
      .select('*')
      .eq('report_date', dateStr) // ⬅️ 核心修改！
      .order('category', { ascending: true });

    if (error) throw error;

    if (!data || data.length === 0) {
      // 该日期没有报告
      tabsContainer.innerHTML = `<p style="text-align: center;">${dateStr} 没有可用的报告。</p>`;
      clearReportDetails();
      loadingSpinner.style.display = 'none';
      return;
    }

    // C. 渲染 Tab
    renderCategoryTabs(data);
    
    // D. 默认显示第一个报告
    if (data.length > 0) {
      renderReportDetails(data[0].category);
      summaryEl.style.display = 'block';
      treemapEl.style.display = 'block';
    }
    
  } catch (error) {
    console.error(`加载 ${dateStr} 的报告失败:`, error.message);
    errorMessage.textContent = `加载报告失败: ${error.message}`;
    errorMessage.style.display = 'block';
  } finally {
    loadingSpinner.style.display = 'none';
  }
}

// --- 3. 【新增】清空报告详情的辅助函数 ---
function clearReportDetails() {
    document.getElementById('report-title').textContent = '热点简报';
    document.getElementById('report-summary').innerHTML = '';
    document.getElementById('treemap-container').innerHTML = '';
}

// --- 4. 渲染分类 Tab (逻辑不变) ---
function renderCategoryTabs(reportsData) {
    const tabsContainer = document.getElementById('category-tabs-container');
    tabsContainer.innerHTML = ''; 
    reportMap.clear(); 

    reportsData.forEach((report, index) => {
        reportMap.set(report.category, report);

        const tab = document.createElement('div');
        tab.className = 'category-tab';
        tab.textContent = report.category;
        tab.dataset.category = report.category;
        
        if (index === 0) {
            tab.classList.add('active');
            currentVisibleCategory = report.category;
        }

        tab.addEventListener('click', () => {
            document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            renderReportDetails(report.category);
        });
        
        tabsContainer.appendChild(tab);
    });
}

// --- 5. 渲染特定分类的报告详情 (逻辑不变) ---
function renderReportDetails(category) {
    const report = reportMap.get(category);
    if (!report) return;

    currentVisibleCategory = category; 
    
    const titleEl = document.getElementById('report-title');
    const summaryEl = document.getElementById('report-summary');
    const treemapEl = document.getElementById('treemap-container');

    titleEl.textContent = `${report.category} - ${report.report_date} 热点简报`;
    summaryEl.innerHTML = report.report_summary.replace(/\n/g, '<br />');
    
    if (report.trending_topics && report.trending_topics.length > 0) {
      treemapEl.style.display = 'block';
      renderTreemap(report.trending_topics, report.category);
    } else {
      treemapEl.innerHTML = "<p>当日无热点话题数据。</p>";
      treemapEl.style.display = 'block';
    }
}


// --- 6. 模态框控制函数 (逻辑不变) ---
function showModal() {
  if (modalOverlay) {
    modalOverlay.style.display = 'flex';
  }
}
function hideModal() {
  if (modalOverlay) {
    modalOverlay.style.display = 'none';
  }
  if (modalBody) {
    modalBody.innerHTML = ''; 
  }
}

// --- 7. Treemap 渲染函数 (使用你上次美化后的版本) ---
function renderTreemap(topicsData, category) {
  // 1. 准备数据 (不变)
  const root = {
    name: "root",
    children: topicsData.map(topic => ({
      name: topic.topic,
      value: topic.count, 
      sentiment: topic.average_sentiment 
    }))
  };

  // 2. 设置尺寸 (不变, 响应式)
  const width = 1000;
  const height = 600;

  // 3. 颜色 (不变)
  const colorScale = d3.scaleLinear()
    .domain([-1.0, 0, 1.0])
    .range(["#d90000", "#aaa", "#009e49"]);

  // 4. 初始化 (不变)
  const treemap = d3.treemap()
    .size([width, height])
    .padding(4); // 稍微增加一点 padding

  // 5. & 6. 层级和布局 (不变)
  const hierarchy = d3.hierarchy(root)
    .sum(d => d.value) 
    .sort((a, b) => b.value - a.value);
  const treeData = treemap(hierarchy);

  // 7. 创建 SVG (不变, 响应式)
  d3.select("#treemap-container").selectAll("*").remove();
  const svg = d3.select("#treemap-container")
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .style("width", "100%")
    .style("height", "auto");

  // 8. 绘制方块 (cell)
  const cell = svg.selectAll("g")
    .data(treeData.leaves()) 
    .enter().append("g")
    .attr("class", "treemap-cell")
    .attr("transform", d => `translate(${d.x0},${d.y0})`)
    .on("click", (event, d) => {
        // 【重要】确保从 reportMap 获取正确的报告
        const currentReport = reportMap.get(category);
        if (currentReport) {
          showTopicModal(d.data, category, currentReport.report_summary);
        } else {
          console.error("无法找到报告摘要: ", category);
        }
    });

  // 9. 添加矩形 (使用你上次的美化)
  cell.append("rect")
    .attr("width", d => d.x1 - d.x0)
    .attr("height", d => d.y1 - d.y0)
    .attr("fill", d => colorScale(d.data.sentiment))
    //.attr("stroke", "white") // 你可以在 CSS 中控制
    ;

  // 10. 添加文字 (使用你上次的美化)
  cell.append("text")
    .attr("x", d => (d.x1 - d.x0) / 2)
    .attr("y", d => (d.y1 - d.y0) / 2)
    .attr("dy", "-0.7em")
    .attr("text-anchor", "middle")
    .attr("class", "topic-name")
    .text(d => {
      if (d.x1 - d.x0 < 60 || d.y1 - d.y0 < 30) return ""; 
      return truncateText(d.data.name, d.x1 - d.x0, 14);
    });

  cell.append("text")
    .attr("x", d => (d.x1 - d.x0) / 2)
    .attr("y", d => (d.y1 - d.y0) / 2)
    .attr("dy", "0.6em")
    .attr("text-anchor", "middle")
    .attr("class", "topic-value")
    .text(d => {
      if (d.x1 - d.x0 < 60 || d.y1 - d.y0 < 30) return ""; 
      return `文章数: ${d.data.value}`;
    });
}

// 辅助函数：截断文本 (放在 renderTreemap 外部，作为全局辅助函数)
function truncateText(text, width, fontSize) {
  const charWidth = fontSize * 0.6; 
  const maxChars = Math.floor(width / charWidth);
  if (text.length > maxChars && maxChars > 5) {
    return text.substring(0, maxChars - 3) + "...";
  }
  return text;
}


// --- 8. L2 模态框 (showTopicModal) (逻辑不变) ---
async function showTopicModal(topicData, category, l2Summary) {
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
  showModal(); 

  try {
    const { data, error } = await supabase
      .from('l1_analysis_entities') 
      .select(`
        article_entity_map (
          raw_articles (
            article_id,
            title,
            url
          )
        )
      `) 
      .eq('entity_name', topicData.name) 
      .single();

    if (error) throw error;

    const articles = data.article_entity_map.map(entry => entry.raw_articles);
    const listContainer = document.getElementById('article-list-container');
    
    if (articles.length === 0) {
      listContainer.innerHTML = "<p>未找到关联的详细新闻。</p>";
      return;
    }

    const listHtml = articles.map(article => 
      `<li class="article-list-item" 
           data-article-id="${article.article_id}" 
           data-article-title="${escape(article.title)}"
           data-article-url="${article.url}">
        ${article.title}
      </li>`
    ).join('');
    
    listContainer.innerHTML = `<ul class="article-list">${listHtml}</ul>`;
    
    document.querySelectorAll('.article-list-item').forEach(item => {
      item.addEventListener('click', () => {
        const article = {
          id: item.dataset.articleId,
          title: unescape(item.dataset.articleTitle),
          url: item.dataset.articleUrl
        };
        showArticleDetail(article, topicData, category, l2Summary); 
      });
    });

  } catch (err) {
    document.getElementById('article-list-container').innerHTML = 
      `<p style="color: red;">查询文章列表失败: ${err.message}</p>`;
  }
}

// --- 9. L1 模态框 (showArticleDetail) (逻辑不变) ---
async function showArticleDetail(article, topicData, category, l2Summary) {
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
  
  document.getElementById('modal-back-btn').addEventListener('click', () => {
    showTopicModal(topicData, category, l2Summary);
  });

  try {
    const { data: l1Data, error: l1Error } = await supabase
      .from('l1_analysis_sentiment') 
      .select('ai_summary, sentiment_label, sentiment_score')
      .eq('article_id', article.id) 
      .single();

    if (l1Error) throw l1Error;

    const container = document.getElementById('l1-analysis-container');
    const sentimentClass = l1Data.sentiment_label.toLowerCase(); 

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

// --- 10. 辅助函数 (escape/unescape) ---
function escape(str) {
  if (!str) return "";
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function unescape(str) {
  if (!str) return "";
  return str.replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}