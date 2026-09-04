import json
import re
import asyncio
import logging
from typing import Any, Dict, List, Optional
import httpx

try:
    from .config import OPENAI_API_KEY, OPENAI_API_URL, OPENAI_MODEL
    from .prompts import SYSTEM_PROMPT
except ImportError:
    from config import OPENAI_API_KEY, OPENAI_API_URL, OPENAI_MODEL
    from prompts import SYSTEM_PROMPT


class AIServiceError(Exception):
    """The configured provider did not return a usable AI response."""


logger = logging.getLogger(__name__)


async def call_openai(
    prompt: str,
    conversation: Optional[List[Dict[str, str]]] = None,
    max_tokens: int = 12000,
    timeout_seconds: float = 90.0,
) -> Dict[str, Any]:
    if not OPENAI_API_KEY:
        raise AIServiceError("未配置 OPENAI_API_KEY")
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    if conversation:
        messages.extend(conversation)
    messages.append({"role": "user", "content": prompt})
    payload = {"model": OPENAI_MODEL,
               "messages": messages,
               "temperature": 0.7, "max_tokens": max_tokens, "response_format": {"type": "json_object"}}
    headers = {"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=timeout_seconds) as client:
            for attempt in range(3):
                try:
                    response = await client.post(OPENAI_API_URL, headers=headers, json=payload)
                    response.raise_for_status()
                    content = response.json()["choices"][0]["message"]["content"]
                    break
                except httpx.HTTPStatusError as error:
                    status_code = error.response.status_code
                    if status_code == 429 and attempt < 2:
                        retry_after = error.response.headers.get("Retry-After", "")
                        try:
                            delay = min(max(float(retry_after), 1.0), 8.0)
                        except ValueError:
                            delay = 2 ** attempt
                        await asyncio.sleep(delay)
                        continue
                    if status_code in {502, 503, 504} and attempt < 2:
                        await asyncio.sleep(2 ** attempt)
                        continue
                    if "no healthy upstream" in error.response.text.lower():
                        raise AIServiceError(f"AI 服务上游不可用：模型 {OPENAI_MODEL} 没有可用上游") from error
                    if status_code == 429:
                        raise AIServiceError(
                            "AI 服务限流（HTTP 429），请稍后重试；若持续出现请检查服务商额度或并发限制") from error
                    provider_detail = re.sub(r"\s+", " ", error.response.text).strip()
                    provider_detail = provider_detail[:240]
                    logger.warning("AI provider HTTP %s: %s", status_code, provider_detail or "no response body")
                    suffix = f"：{provider_detail}" if provider_detail else ""
                    raise AIServiceError(f"AI 服务返回 HTTP {status_code}{suffix}") from error
    except AIServiceError:
        raise
    except httpx.RequestError as error:
        logger.warning("AI provider request failed (%s): %s", type(error).__name__, error)
        if isinstance(error, httpx.TimeoutException):
            raise AIServiceError(f"AI 服务响应超时（{int(timeout_seconds)} 秒）") from error
        raise AIServiceError("无法连接 AI 服务，请检查 OPENAI_API_URL") from error
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", content)
        if match:
            return json.loads(match.group())
        raise AIServiceError("AI 服务未返回有效 JSON")


def parse_init(output: Dict[str, Any]) -> Dict[str, Any]:
    suggested_actions = normalize_text_list(output.get("suggested_actions"), ["观察所在地区", "拜访一位熟人", "处理眼前生计"])
    return {"world_background": output.get("world_background", "历史世界已建立。"),
            "character_intro": output.get("character_intro", "你的人生从此开始。"),
            "initial_state": output.get("initial_state", {}),
            "suggested_actions": suggested_actions}


def normalize_text_list(value: Any, fallback: Optional[List[str]] = None) -> List[str]:
    """Convert compatible-model list objects into the API's string lists."""
    if isinstance(value, str):
        values = [value]
    elif isinstance(value, list):
        values = value
    else:
        values = []
    text_values = []
    for item in values:
        if isinstance(item, str):
            text = item.strip()
        elif isinstance(item, dict):
            text = str(item.get("action") or item.get("title") or item.get("name") or item.get("goal") or item.get("description") or "").strip()
        else:
            text = str(item or "").strip()
        if text:
            text_values.append(text)
    return text_values or list(fallback or [])


def parse_play(output: Dict[str, Any]) -> Dict[str, Any]:
    new_characters = output.get("new_characters", output.get("new_people", []))
    if isinstance(new_characters, dict):
        new_characters = list(new_characters.values())
    if not isinstance(new_characters, list):
        new_characters = []
    appeared = output.get("new_person_appeared", output.get("has_new_person", bool(new_characters)))
    if isinstance(appeared, str):
        appeared = appeared.strip().lower() in {"true", "1", "yes", "是", "有"}
    return {"narrative": output.get("narrative", "世界安静地继续运行。"),
            "state_updates": output.get("state_updates", {}),
            "suggested_actions": normalize_text_list(output.get("suggested_actions"), ["继续前行"]),
            "suggested_goals": normalize_text_list(output.get("suggested_goals")), "time_elapsed": output.get("time_elapsed", "片刻"),
            "location_changed": output.get("location_changed"), "new_info": output.get("new_info", []),
            "memory_update": output.get("memory_update", {}),
            "new_person_appeared": bool(appeared),
            "new_characters": new_characters,
            "action_assessment": output.get("action_assessment", {}) if isinstance(output.get("action_assessment", {}), dict) else {}}
