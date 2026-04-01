"""Token消耗记录模型"""

from sqlalchemy import Column, String, Integer, DateTime, JSON
from .base import BaseModel


class TokenUsage(BaseModel):
    __tablename__ = "token_usage"

    agent_id = Column(String(100), nullable=False, index=True)
    app_id = Column(String(100), nullable=True)
    user_id = Column(String(100), nullable=False, index=True)
    tokens_total = Column(Integer, nullable=False)
    tokens_input = Column(Integer, nullable=True)
    tokens_output = Column(Integer, nullable=True)
    started_at = Column(DateTime, nullable=False)
    ended_at = Column(DateTime, nullable=False)
    model_name = Column(String(100), nullable=True)
    request_id = Column(String(200), nullable=True)
    extra_data = Column(JSON, nullable=True)
