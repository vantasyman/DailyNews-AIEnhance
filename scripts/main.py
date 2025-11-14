import sys
import os
from time import time

# 确保 Python 可以找到我们的同级模块 (crawler, analysis, report)
sys.path.append(os.path.dirname(__file__))

try:
    # 导入我们将要编排的三个模块
    from . import crawler
    from . import analysis
    from . import report
except ImportError:
    print("🔴 错误：无法作为模块导入。请确保你在项目根目录使用 `python -m scripts.main` 来运行。")
    # 尝试直接导入（适用于某些本地测试）
    import crawler
    import analysis
    import report

def main_workflow():
    """
    按顺序执行整个 AI 趋势分析流水线。
    这是我们 GitHub Action 的唯一入口点。
    """
    print("--- 自动化工作流 (main.py) 启动 ---")
    start_time = time()
    
    try:
        # --- 阶段 1: L0 爬取 ---
        print("\n[阶段 1/3] 正在启动爬虫 (crawler.py)...")
        crawler_start = time()
        crawler.main()
        print(f"[阶段 1/3] 爬虫执行完毕。 (耗时: {time() - crawler_start:.2f} 秒)")
        
        # --- 阶段 2: L1 分析 ---
        print("\n[阶段 2/3] 正在启动 L1 分析 (analysis.py)...")
        analysis_start = time()
        analysis.main()
        print(f"[阶段 2/3] L1 分析执行完毕。 (耗时: {time() - analysis_start:.2f} 秒)")
        
        # --- 阶段 3: L2 报告 ---
        print("\n[阶段 3/3] 正在启动 L2 报告 (report.py)...")
        report_start = time()
        report.main()
        print(f"[阶段 3/3] L2 报告执行完毕。 (耗时: {time() - report_start:.2f} 秒)")
        
        print("\n--- 自动化工作流 (main.py) 成功完成 ---")
        
    except Exception as e:
        print(f"🔴 致命错误：工作流在执行中失败: {e}")
        # 在 GitHub Actions 中，非零退出代码将标记工作流为 "failed"
        sys.exit(1)
    finally:
        print(f"总耗时: {time() - start_time:.2f} 秒。")

if __name__ == "__main__":
    # 当我们通过 `python -m scripts.main` 运行时，这将是入口
    main_workflow()