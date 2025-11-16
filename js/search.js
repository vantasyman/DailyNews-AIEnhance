// js/search.js
import { supabaseClient as supabase } from './supabase_client.js';

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('search-input');
    const searchButton = document.getElementById('search-button');
    
    searchButton.addEventListener('click', performSearch);
    searchInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
            performSearch();
        }
    });
});

async function performSearch() {
    const searchTerm = document.getElementById('search-input').value;
    const loading = document.getElementById('loading-spinner');
    const errorEl = document.getElementById('error-message');
    const resultsContainer = document.getElementById('results-container');

    if (!searchTerm || searchTerm.trim().length < 2) {
        errorEl.textContent = "请输入至少 2 个字符进行搜索。";
        errorEl.style.display = 'block';
        resultsContainer.innerHTML = '';
        return;
    }

    // 1. 开始搜索
    loading.style.display = 'flex';
    errorEl.style.display = 'none';
    resultsContainer.innerHTML = '';

    try {
        // 2. 【核心查询】使用 Supabase 的全文搜索 (textSearch)
        // 我们同时搜索 1) 原始文章的标题和 2) AI 生成的摘要
        // 注意: 你需要在 Supabase 数据库后台为 'title' 和 'ai_summary' 开启全文搜索索引才能使其工作
        
        const { data, error } = await supabase
            .from('l1_analysis_sentiment') // 从 L1 分析表开始
            .select(`
                ai_summary,
                sentiment_label,
                sentiment_score,
                raw_articles (
                    title,
                    url,
                    publication_date
                )
            `)
            .textSearch('ai_summary', `'${searchTerm.trim()}'`) // 搜索 AI 摘要
            // .textSearch('raw_articles.title', `'${searchTerm.trim()}'`) // 搜索原始标题 (需要更复杂的 RPC 查询)
            .limit(20);
            
        if (error) throw error;

        if (!data || data.length === 0) {
            resultsContainer.innerHTML = '<p style="text-align: center;">没有找到相关结果。</p>';
            loading.style.display = 'none';
            return;
        }

        // 3. 渲染结果
        renderResults(data);

    } catch (err) {
        console.error('搜索失败:', err.message);
        errorEl.textContent = `搜索失败: ${err.message}。(提示: 你可能需要为 'ai_summary' 列在数据库中添加全文搜索索引。)`;
        errorEl.style.display = 'block';
    } finally {
        loading.style.display = 'none';
    }
}

function renderResults(data) {
    const resultsContainer = document.getElementById('results-container');
    
    const html = data.map(item => {
        const article = item.raw_articles;
        const sentimentClass = item.sentiment_label.toLowerCase();
        
        return `
        <div class="l1-analysis-card" style="margin-bottom: 16px;">
            <h4>
                <a href="${article.url}" target="_blank" rel="noopener">
                    ${article.title}
                </a>
            </h4>
            <p style="font-size: 14px; color: var(--text-secondary);">${new Date(article.publication_date).toLocaleString()}</p>
            <p style="margin-top: 8px;"><strong>AI 摘要:</strong> ${item.ai_summary}</p>
            <p class="l1-sentiment ${sentimentClass}" style="font-size: 16px; margin-top: 8px;">
              情感: ${item.sentiment_label} (分数: ${item.sentiment_score.toFixed(2)})
            </p>
        </div>
        `;
    }).join('');

    resultsContainer.innerHTML = `<h2>搜索结果 (${data.length} 条)</h2>${html}`;
}