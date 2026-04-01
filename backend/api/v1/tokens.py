"""AgentPit Token 消耗上报"""

import logging
from datetime import datetime

from fastapi import APIRouter, Header, HTTPException, Depends
from pydantic import BaseModel, validator
from typing import Optional
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.models.token_usage import TokenUsage

logger = logging.getLogger(__name__)
router = APIRouter()


class TokenReportRequest(BaseModel):
    agent_id: str
    app_id: Optional[str] = None
    tokens_total: int
    tokens_input: Optional[int] = None
    tokens_output: Optional[int] = None
    started_at: datetime
    ended_at: datetime
    model_name: Optional[str] = None
    request_id: Optional[str] = None
    extra_data: Optional[dict] = None

    @validator("ended_at")
    def end_after_start(cls, v, values):
        if "started_at" in values and v < values["started_at"]:
            raise ValueError("ended_at must be after started_at")
        return v

    @validator("tokens_total")
    def positive_tokens(cls, v):
        if v < 0:
            raise ValueError("tokens_total must be non-negative")
        return v


@router.post("/tokens/report")
async def report_token_usage(
    body: TokenReportRequest,
    authorization: str = Header(...),
    db: Session = Depends(get_db),
):
    """上报Token消耗数据"""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")

    usage = TokenUsage(
        agent_id=body.agent_id,
        app_id=body.app_id,
        user_id="system",
        tokens_total=body.tokens_total,
        tokens_input=body.tokens_input,
        tokens_output=body.tokens_output,
        started_at=body.started_at,
        ended_at=body.ended_at,
        model_name=body.model_name,
        request_id=body.request_id,
        extra_data=body.extra_data,
    )
    db.add(usage)
    db.commit()
    db.refresh(usage)

    return {"success": True, "data": {"id": usage.id, "tokens_total": usage.tokens_total}}
