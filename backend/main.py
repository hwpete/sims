import uuid
from typing import Any, Dict

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

try:
    from .ai_engine import call_openai, parse_init, parse_play
    from .config import HOST, MAX_HISTORY_LENGTH, PORT, OPENAI_API_KEY
    from .models import CreateGameRequest, GameInitResponse, PlayRequest, PlayResponse, ResolveTimeRequest, ResolveTimeResponse
    from .prompts import build_init_prompt, build_play_prompt, build_time_resolve_prompt
except ImportError:
    from ai_engine import call_openai, parse_init, parse_play
    from config import HOST, MAX_HISTORY_LENGTH, PORT, OPENAI_API_KEY
    from models import CreateGameRequest, GameInitResponse, PlayRequest, PlayResponse, ResolveTimeRequest, ResolveTimeResponse
    from prompts import build_init_prompt, build_play_prompt, build_time_resolve_prompt

app = FastAPI(title="历史人生模拟器 API", version="1.2.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
sessions: Dict[str, Dict[str, Any]] = {}

ERAS = [
    {"name": "夏", "period": "约前2070—前1600"}, {"name": "商", "period": "约前1600—前1046"},
    {"name": "西周", "period": "前1046—前771"}, {"name": "春秋", "period": "前770—前476"},
    {"name": "战国", "period": "前475—前221"}, {"name": "秦", "period": "前221—前207"},
    {"name": "西汉", "period": "前202—公元9"}, {"name": "新", "period": "公元9—23"},
    {"name": "东汉", "period": "公元25—220"}, {"name": "三国", "period": "公元220—280"},
    {"name": "西晋", "period": "公元265—316"}, {"name": "东晋十六国", "period": "公元317—420"},
    {"name": "南北朝", "period": "公元420—589"}, {"name": "隋", "period": "公元581—618"},
    {"name": "唐", "period": "公元618—907"}, {"name": "五代十国", "period": "公元907—960"},
    {"name": "北宋", "period": "公元960—1127"}, {"name": "南宋", "period": "公元1127—1279"},
    {"name": "辽", "period": "公元907—1125"}, {"name": "西夏", "period": "公元1038—1227"},
    {"name": "金", "period": "公元1115—1234"}, {"name": "元", "period": "公元1271—1368"},
    {"name": "明", "period": "公元1368—1644"}, {"name": "清", "period": "公元1644—1911"},
    {"name": "清末", "period": "公元1840—1911"},
]


@app.get("/api/eras")
async def get_eras():
    return {"eras": ERAS}

@app.get("/api/health")
async def health():
    try:
        from .config import OPENAI_MODEL
    except ImportError:
        from config import OPENAI_MODEL
    return {"ok": True, "ai_configured": bool(OPENAI_API_KEY), "model": "configured" if OPENAI_API_KEY else "missing", "model_name": OPENAI_MODEL}

@app.post("/api/time/resolve", response_model=ResolveTimeResponse)
async def resolve_time(request: ResolveTimeRequest):
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=503, detail="AI配置失败：未配置 OPENAI_API_KEY")
    try:
        output = await call_openai(build_time_resolve_prompt(request.era, request.selected_year or "", request.historical_event))
    except Exception:
        raise HTTPException(status_code=502, detail="AI配置失败：年份计算服务不可用")
    if not output.get("valid") or not output.get("year") or not output.get("year_label"):
        raise HTTPException(status_code=422, detail="AI配置失败：无法根据历史事件确定有效年份")
    return ResolveTimeResponse(era=output.get("era", request.era), year=str(output["year"]), year_label=str(output["year_label"]), reasoning=str(output.get("reasoning", "")), confidence=str(output.get("confidence", "中")))


@app.post("/api/game/init", response_model=GameInitResponse)
async def init_game(request: CreateGameRequest):
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=503, detail="AI配置失败：未配置 OPENAI_API_KEY，不能开始人生")
    prompt = build_init_prompt(request.mode, request.era, request.year or "", request.character_type, request.character)
    try:
        output = await call_openai(prompt)
    except Exception:
        raise HTTPException(status_code=502, detail="AI配置失败：世界初始化服务不可用，不能开始人生")
    if not output.get("initial_state") or not output.get("world_background"):
        raise HTTPException(status_code=422, detail="AI配置失败：未返回有效的人生初始状态，不能开始人生")
    parsed = parse_init(output)
    session_id = str(uuid.uuid4())
    sessions[session_id] = {"state": parsed["initial_state"], "history": []}
    return GameInitResponse(session_id=session_id, **parsed)


@app.post("/api/play", response_model=PlayResponse)
async def play(request: PlayRequest):
    if request.session_id not in sessions:
        raise HTTPException(status_code=404, detail="会话不存在")
    prompt = build_play_prompt(request.current_state, request.history, request.player_input, request.pace)
    parsed = parse_play(await call_openai(prompt))
    session = sessions[request.session_id]
    session["history"] += [{"role": "user", "content": request.player_input}, {"role": "system", "content": parsed["narrative"]}]
    session["history"] = session["history"][-MAX_HISTORY_LENGTH:]
    if parsed["state_updates"]:
        session["state"].update(parsed["state_updates"])
    return PlayResponse(**parsed)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT)
