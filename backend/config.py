import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name(".env"))

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_API_URL = os.getenv("OPENAI_API_URL", "https://shunfen6.win/v1/chat/completions")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5.6-terra")
HOST = os.getenv("HOST", "127.0.0.1")
PORT = int(os.getenv("PORT", "8000"))
MAX_HISTORY_LENGTH = 15
RECENT_CONVERSATION_MESSAGES = 10
MAX_MEMORY_ITEMS_PER_CATEGORY = 60
