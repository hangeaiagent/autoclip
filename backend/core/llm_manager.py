"""
LLM管理器 - 通过OpenAI兼容接口调用大模型
通过 .env 中的 API_BASE_URL、API_KEY、API_MODEL_NAME 配置
"""
import json
import logging
import os
import time
from pathlib import Path
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from openai import OpenAI

# 确保 .env 被加载（Celery worker 不会自动加载）
_env_path = Path(__file__).parent.parent.parent / ".env"
if _env_path.exists():
    load_dotenv(_env_path)

logger = logging.getLogger(__name__)


class LLMManager:
    """LLM管理器 - OpenAI兼容接口"""

    def __init__(self):
        self.base_url = os.environ.get("API_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1")
        self.api_key = os.environ.get("API_KEY", "")
        self.model_name = os.environ.get("API_MODEL_NAME", "qwen-plus")
        self.client: Optional[OpenAI] = None
        self._initialize()

    def _initialize(self):
        if not self.api_key:
            logger.warning("未找到API密钥，请在 .env 中设置 API_KEY")
            return
        self.client = OpenAI(base_url=self.base_url, api_key=self.api_key)
        logger.info(f"LLM已初始化: base_url={self.base_url}, model={self.model_name}")

    @staticmethod
    def _build_full_input(prompt: str, input_data: Any = None) -> str:
        if input_data:
            if isinstance(input_data, dict):
                return f"{prompt}\n\n输入内容：\n{json.dumps(input_data, ensure_ascii=False, indent=2)}"
            return f"{prompt}\n\n输入内容：\n{input_data}"
        return prompt

    def call(self, prompt: str, input_data: Any = None, **kwargs) -> str:
        if not self.client:
            raise ValueError("未配置API密钥，请在 .env 中设置 API_KEY 和 API_BASE_URL")

        full_input = self._build_full_input(prompt, input_data)

        response = self.client.chat.completions.create(
            model=self.model_name,
            messages=[{"role": "user", "content": full_input}],
            **kwargs
        )

        content = response.choices[0].message.content
        return content or ""

    def call_with_retry(self, prompt: str, input_data: Any = None, max_retries: int = 3, **kwargs) -> str:
        for attempt in range(max_retries):
            try:
                return self.call(prompt, input_data, **kwargs)
            except ValueError:
                raise
            except Exception as e:
                if attempt == max_retries - 1:
                    logger.error(f"LLM调用在{max_retries}次重试后失败")
                    raise
                logger.warning(f"第{attempt + 1}次调用失败，准备重试: {str(e)}")
                time.sleep(2 ** attempt)
        return ""

    def get_current_provider_info(self) -> Dict[str, Any]:
        return {
            "base_url": self.base_url,
            "model": self.model_name,
            "available": self.client is not None,
        }


_llm_manager: Optional[LLMManager] = None


def get_llm_manager() -> LLMManager:
    global _llm_manager
    if _llm_manager is None:
        _llm_manager = LLMManager()
    return _llm_manager
