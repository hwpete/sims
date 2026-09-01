import json
import re
import asyncio
from typing import Any, Dict
import httpx
try:
    from .config import OPENAI_API_KEY, OPENAI_API_URL, OPENAI_MODEL
    from .prompts import SYSTEM_PROMPT
except ImportError:
    from config import OPENAI_API_KEY, OPENAI_API_URL, OPENAI_MODEL
    from prompts import SYSTEM_PROMPT

class AIServiceError(Exception):
    """The configured provider did not return a usable AI response."""

async def call_openai(prompt: str) -> Dict[str, Any]:
    if not OPENAI_API_KEY:
        raise AIServiceError("未配置 OPENAI_API_KEY")
    payload = {"model": OPENAI_MODEL, "messages": [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": prompt}], "temperature": 0.7, "max_tokens": 4096, "response_format": {"type": "json_object"}}
    headers = {"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            for attempt in range(3):
                try:
                    response = await client.post(OPENAI_API_URL, headers=headers, json=payload)
                    response.raise_for_status()
                    content = response.json()["choices"][0]["message"]["content"]
                    break
                except httpx.HTTPStatusError as error:
                    if error.response.status_code == 429 and attempt < 2:
                        retry_after = error.response.headers.get("Retry-After", "")
                        try:
                            delay = min(max(float(retry_after), 1.0), 8.0)
                        except ValueError:
                            delay = 2 ** attempt
                        await asyncio.sleep(delay)
                        continue
                    if "no healthy upstream" in error.response.text.lower():
                        raise AIServiceError(f"AI 服务上游不可用：模型 {OPENAI_MODEL} 没有可用上游") from error
                    if error.response.status_code == 429:
                        raise AIServiceError("AI 服务限流（HTTP 429），请稍后重试；若持续出现请检查服务商额度或并发限制") from error
                    raise AIServiceError(f"AI 服务返回 HTTP {error.response.status_code}") from error
    except AIServiceError:
        raise
    except httpx.RequestError as error:
        raise AIServiceError("无法连接 AI 服务，请检查 OPENAI_API_URL") from error
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", content)
        if match:
            return json.loads(match.group())
        raise AIServiceError("AI 服务未返回有效 JSON")

def parse_init(output: Dict[str, Any]) -> Dict[str, Any]:
    return {"world_background": output.get("world_background", "历史世界已建立。"), "character_intro": output.get("character_intro", "你的人生从此开始。"), "initial_state": output.get("initial_state", {}), "suggested_actions": output.get("suggested_actions", ["观察所在地区", "拜访一位熟人", "处理眼前生计"])}

def parse_play(output: Dict[str, Any]) -> Dict[str, Any]:
    return {"narrative": output.get("narrative", "世界安静地继续运行。"), "state_updates": output.get("state_updates", {}), "suggested_actions": output.get("suggested_actions", ["继续前行"]), "suggested_goals": output.get("suggested_goals", []), "time_elapsed": output.get("time_elapsed", "片刻"), "location_changed": output.get("location_changed"), "new_info": output.get("new_info", [])}
