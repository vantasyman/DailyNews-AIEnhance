import os
from supabase import create_client, Client
from dotenv import load_dotenv

# -----------------------------------------------------------------
# 本地测试设置 (Local Testing Setup)
# -----------------------------------------------------------------
#
# 这段代码会查找你项目根目录 (scripts/ 目录的上一级)
# 是否有一个 '.env' 文件。
# 如果有 (用于本地测试)，它会加载该文件中的环境变量。
# 在 GitHub Actions 中运行时，.env 文件不存在，代码会跳过，
# 并直接使用 GitHub Secrets 设置的环境变量。
#
dotenv_path = os.path.join(os.path.dirname(__file__), '..', '.env')
if os.path.exists(dotenv_path):
    load_dotenv(dotenv_path)
    print("加载本地 .env 文件... (仅供本地测试)")


# -----------------------------------------------------------------
# Supabase 客户端初始化 (Supabase Client Initialization)
# -----------------------------------------------------------------

# 1. 从环境变量中读取数据库连接信息
supabase_url: str = os.environ.get("SUPABASE_URL")
supabase_key: str = os.environ.get("SUPABASE_SERVICE_KEY")

# 2. 初始化一个全局客户端变量
db_client: Client | None = None

# 3. 检查变量是否存在并尝试连接
if not supabase_url or not supabase_key:
    # 这是一个严重错误，脚本无法在没有数据库的情况下运行。
    print("🔴 错误：SUPABASE_URL 或 SUPABASE_SERVICE_KEY 环境变量未设置。")
    print("   请在 GitHub Secrets (用于生产) 和 .env 文件 (用于本地) 中设置它们。")
else:
    try:
        # 4. 创建唯一的、可复用的 Supabase 客户端实例
        # 这个客户端使用 'service_role' 密钥，拥有完全的管理员权限。
        # 它会绕过我们为 'public_api_role' 设置的 RLS 策略，
        # 这对于我们的后端自动化脚本 (A) 来说是必需的。
        db_client = create_client(supabase_url, supabase_key)
        print("🟢 数据库客户端初始化成功。")
    except Exception as e:
        print(f"🔴 数据库连接失败: {e}")
        print("   请检查你的 SUPABASE_URL 和 SUPABASE_SERVICE_KEY 是否正确。")

# --- 供其他脚本导入的函数 ---

def get_db_client() -> Client:
    """
    一个辅助函数，用于获取已初始化的数据库客户端。
    如果客户端未初始化 (e.g., 缺少密钥)，将引发异常。
    """
    if db_client is None:
        raise ConnectionError("数据库客户端未初始化。请检查环境变量。")
    return db_client