// js/app.js

// 1. 从我们的 supabase_client.js 模块中导入客户端
//    (必须在 index.html 中将 script 标签设为 type="module")
import { supabase } from './supabase_client.js';

// 2. DOM 加载完毕后，立即执行主函数
document.addEventListener('DOMContentLoaded', () => {
  loadDailyReport();
});

// 3. 定义主函数：获取并渲染数据
async function loadDailyReport() {
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

    // 4. 【核心查询】
    // 从 'daily_reports' 表中，按日期降序，只取最新的一条记录
    const { data, error } = await supabase
      .from('daily_reports')
      .select('*')
      .order('report_date', { ascending: false })
      .limit(1);

    if (error) throw error; // 抛出错误，被 catch 捕获

    if (!data || data.length === 0) {
      throw new Error("数据库中没有找到任何报告。请先运行后端自动化脚本 (GitHub Action)。");
    }

    // 5. 渲染数据
    const report = data[0]; // 获取最新的报告

    // 格式化日期
    const date = new Date(report.report_date);
    reportDateEl.textContent = `报告日期: ${date.toLocaleDateString()}`;

    // 渲染 L2 报告摘要 (支持换行符)
    summaryEl.innerHTML = report.report_summary.replace(/\n/g, '<br />');
    
    // 6. 渲染“热点预览图”
    if (report.trending_topics && report.trending_topics.length > 0) {
      treemapEl.style.display = 'block';
      renderTreemap(report.trending_topics);
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
function renderTreemap(topicsData) {
  // 1. 准备 D3 Treemap 需要的数据格式
  // D3 需要一个层级结构 (root)，我们伪造一个
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
  // 情感分数从 -1.0 (消极) 到 1.0 (积极)
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

  // 8. 绘制所有方块 (cell)
  const cell = svg.selectAll("g")
    .data(treeData.leaves()) // leaves() 只获取最底层的方块
    .enter().append("g")
    .attr("class", "treemap-cell")
    .attr("transform", d => `translate(${d.x0},${d.y0})`);

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