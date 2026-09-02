import json
import uuid
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

try:
    from .ai_engine import AIServiceError, call_openai, parse_init, parse_play
    from .config import HOST, MAX_HISTORY_LENGTH, MAX_MEMORY_ITEMS_PER_CATEGORY, PORT, OPENAI_API_KEY, \
        RECENT_CONVERSATION_MESSAGES
    from .models import CreateGameRequest, GameInitResponse, PlayRequest, PlayResponse, ResolveTimeRequest, \
        ResolveTimeResponse
    from .prompts import build_init_prompt, build_play_prompt, build_time_resolve_prompt, load_reference_document
except ImportError:
    from ai_engine import AIServiceError, call_openai, parse_init, parse_play
    from config import HOST, MAX_HISTORY_LENGTH, MAX_MEMORY_ITEMS_PER_CATEGORY, PORT, OPENAI_API_KEY, \
        RECENT_CONVERSATION_MESSAGES
    from models import CreateGameRequest, GameInitResponse, PlayRequest, PlayResponse, ResolveTimeRequest, \
        ResolveTimeResponse
    from prompts import build_init_prompt, build_play_prompt, build_time_resolve_prompt, load_reference_document

app = FastAPI(title="历史人生模拟器 API", version="1.2.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
sessions: Dict[str, Dict[str, Any]] = {}
SESSION_DIR = Path(__file__).resolve().parent.parent / "data" / "sessions"


def session_file(session_id: str) -> Path:
    return SESSION_DIR / f"{session_id}.json"


def save_session(session_id: str) -> None:
    SESSION_DIR.mkdir(parents=True, exist_ok=True)
    session_file(session_id).write_text(
        json.dumps(sessions[session_id], ensure_ascii=False), encoding="utf-8"
    )


def load_session(session_id: str) -> Optional[Dict[str, Any]]:
    path = session_file(session_id)
    if not path.is_file():
        return None
    try:
        session = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(session, dict):
        return None
    sessions[session_id] = session
    return session


MEMORY_CATEGORIES = ("character_facts", "world_changes", "relationship_changes", "important_events", "open_threads")

ATTRIBUTE_DEFAULTS = {
    "health": ("健康", "正常体魄，能胜任日常劳动"),
    "energy": ("充裕", "正常状态，能应对日常工作"),
    "mood": ("平宁", "情绪平稳，无大波澜"),
    "reputation": ("无名", "乡野小民，无人知晓"),
    "knowledge": ("粗识", "认识一些字，能写简单文书"),
    "martial": ("文弱", "不通武艺，提刀手软"),
}
ATTRIBUTE_ALIASES = {
    "health": {"强健": "魁健", "健康": "健康", "良好": "健康", "正常": "健康", "不佳": "尚可", "病弱": "虚弱", "重伤": "尚可", "危重": "濒危", "濒死": "濒危"},
    "energy": {"充足": "充裕", "正常": "充裕", "疲劳": "疲惫", "力竭": "衰竭"},
    "mood": {"平静": "平宁", "稳定": "平宁", "焦虑": "忧思", "恐惧": "惶惑"},
    "reputation": {"默默无闻": "无名", "小有名气": "乡闻", "有名": "县知"},
    "knowledge": {"有限": "粗识", "未入门": "未学", "识字": "粗识"},
    "martial": {"未入门": "文弱", "略懂": "粗习", "熟练": "精熟"},
}


def normalize_character_attributes(character: Any, fallback: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    result = dict(character) if isinstance(character, dict) else {}
    fallback = fallback if isinstance(fallback, dict) else {}
    for key, (default_level, default_detail) in ATTRIBUTE_DEFAULTS.items():
        value = result.get(key, fallback.get(key))
        if isinstance(value, dict):
            level = str(value.get("level") or value.get("summary") or default_level)
            detail = str(value.get("detail") or default_detail)
        else:
            level = str(value or default_level)
            detail = default_detail
        level = ATTRIBUTE_ALIASES.get(key, {}).get(level, level)
        if level not in {
            "health": {"魁健", "健康", "尚可", "虚弱", "衰微", "濒危"},
            "energy": {"充沛", "充裕", "渐疲", "疲惫", "衰竭"},
            "mood": {"静明", "平宁", "忧思", "愤懑", "惶惑", "崩溃"},
            "reputation": {"无名", "乡闻", "县知", "郡闻", "州望", "天下知"},
            "knowledge": {"未学", "粗识", "通文", "经学", "博学", "大家"},
            "martial": {"文弱", "粗习", "精熟", "骁勇", "虎将", "武圣"},
        }.get(key, set()):
            level = default_level
        result[key] = {"level": level, "detail": detail}
    return result


def normalize_memory(memory: Any) -> Dict[str, list]:
    memory = memory if isinstance(memory, dict) else {}
    return {
        category: list(memory.get(category, []))[-MAX_MEMORY_ITEMS_PER_CATEGORY:]
        if isinstance(memory.get(category, []), list) else []
        for category in MEMORY_CATEGORIES
    }


def update_long_term_memory(session: Dict[str, Any], memory_update: Any) -> None:
    memory = normalize_memory(session.get("long_term_memory"))
    if isinstance(memory_update, dict):
        for category in MEMORY_CATEGORIES:
            values = memory_update.get(category, [])
            if isinstance(values, str):
                values = [values]
            if isinstance(values, list):
                memory[category].extend(str(value).strip() for value in values if str(value).strip())
                memory[category] = memory[category][-MAX_MEMORY_ITEMS_PER_CATEGORY:]
    session["long_term_memory"] = memory


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
    return {"ok": True, "ai_configured": bool(OPENAI_API_KEY), "model": "configured" if OPENAI_API_KEY else "missing",
            "model_name": OPENAI_MODEL}


@app.post("/api/time/resolve", response_model=ResolveTimeResponse)
async def resolve_time(request: ResolveTimeRequest):
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=503, detail="AI配置失败：未配置 OPENAI_API_KEY")
    try:
        output = await call_openai(
            build_time_resolve_prompt(request.era, request.selected_year or "", request.historical_event))
    except AIServiceError as error:
        raise HTTPException(status_code=502, detail=f"AI配置失败：{error}")
    if not output.get("valid") or not output.get("year") or not output.get("year_label"):
        raise HTTPException(status_code=422, detail="AI配置失败：无法根据历史事件确定有效年份")
    return ResolveTimeResponse(era=output.get("era", request.era), year=str(output["year"]),
                               year_label=str(output["year_label"]), reasoning=str(output.get("reasoning", "")),
                               confidence=str(output.get("confidence", "中")))


@app.post("/api/game/init", response_model=GameInitResponse)
async def init_game(request: CreateGameRequest):
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=503, detail="AI配置失败：未配置 OPENAI_API_KEY，不能开始人生")
    try:
        reference_document = load_reference_document()
    except FileNotFoundError as error:
        raise HTTPException(status_code=503, detail=f"AI配置失败：{error}，不能开始人生")
    prompt = build_init_prompt(request.mode, request.era, request.year or "", request.character_type, request.character,
                               request.world_context, reference_document)
    try:
        output = await call_openai(prompt)
    except AIServiceError as error:
        raise HTTPException(status_code=502, detail=f"AI配置失败：{error}，不能开始人生")
    if not output.get("initial_state") or not output.get("world_background"):
        raise HTTPException(status_code=422, detail="AI配置失败：未返回有效的人生初始状态，不能开始人生")
    parsed = parse_init(output)
    # Normalize provider responses and re-apply player-authored fields. Some
    # compatible models return a flat initial_state instead of currentCharacter.
    initial_state = parsed["initial_state"] if isinstance(parsed["initial_state"], dict) else {}
    nested_character = initial_state.get("currentCharacter") or initial_state.get(
        "current_character") or initial_state.get("character") or {}
    flat_character = {
        key: initial_state[key] for key in (
            "name", "age", "gender", "origin", "location", "role", "personality",
            "health", "education", "knowledge", "martial", "marital", "family", "energy", "reputation", "mood", "status"
        ) if key in initial_state
    }
    ai_character = {**flat_character, **(nested_character if isinstance(nested_character, dict) else {})}
    if not isinstance(ai_character, dict):
        ai_character = {}
    player_character = {
        key: value for key, value in request.character.items()
        if key not in {"initial_relationships", "history_event"} and value not in (None, "")
    }
    # Keep the player's creation fields in the canonical character shape used
    # by the rest of the game.  The API accepts descriptive field names from
    # the setup form, while gameplay/rendering consistently reads role/family.
    if request.character.get("occupation"):
        player_character["role"] = request.character["occupation"]
    if request.character.get("family_background"):
        player_character["family"] = request.character["family_background"]
    initial_state["currentCharacter"] = normalize_character_attributes({**ai_character, **player_character})
    ai_relationships = initial_state.get("relationships") or initial_state.get("relations") or []
    if isinstance(ai_relationships, dict):
        ai_relationships = list(ai_relationships.values())
    if not isinstance(ai_relationships, list):
        ai_relationships = []
    player_relationships = request.character.get("initial_relationships") or []
    relationships_by_name = {
        str(item.get("name")).strip(): item for item in ai_relationships
        if isinstance(item, dict) and item.get("name")
    }
    for item in player_relationships:
        if isinstance(item, dict) and item.get("name"):
            name = str(item["name"]).strip()
            relationships_by_name[name] = {**relationships_by_name.get(name, {}), **item}
    initial_state["relationships"] = list(relationships_by_name.values())
    if request.character.get("life_goal"):
        existing_goals = initial_state.get("long_term_goals") or initial_state.get("longTermGoals") or []
        if isinstance(existing_goals, str):
            existing_goals = [existing_goals]
        if not isinstance(existing_goals, list):
            existing_goals = []
        initial_state["long_term_goals"] = [request.character["life_goal"],
                                              *[goal for goal in existing_goals if goal != request.character["life_goal"]]]
    initial_state["worldContext"] = request.world_context
    context_dynamics = request.world_context.get("worldDynamics") or request.world_context.get("world_dynamics") or {
        "local": "\n".join(request.world_context.get("local_dynamics", [])),
        "regional": "\n".join(request.world_context.get("political_situation", [])),
        "national": "\n".join(request.world_context.get("historical_background", [])),
        "nearby": "\n".join(request.world_context.get("reasonable_knowledge", [])),
    }
    if isinstance(initial_state.get("worldDynamics"), dict):
        initial_state["worldDynamics"] = {**context_dynamics, **initial_state["worldDynamics"]}
    elif context_dynamics:
        initial_state["worldDynamics"] = context_dynamics
    context_map = request.world_context.get("knownMap") or request.world_context.get("map")
    if isinstance(initial_state.get("knownMap"), dict):
        initial_state["knownMap"] = {**(context_map or {}), **initial_state["knownMap"]}
    elif context_map:
        initial_state["knownMap"] = context_map
    elif request.world_context.get("nearby_places"):
        initial_state["knownMap"] = {
            "currentLocation": request.world_context.get("current_location", "未知"),
            "nearbyPlaces": request.world_context.get("nearby_places", []),
            "knownRoads": request.world_context.get("known_roads", []),
            "knownCities": request.world_context.get("nearby_places", []),
            "knownRegions": [],
            "unknownRegions": request.world_context.get("unknown_regions", []),
        }
    if not isinstance(initial_state.get("time"), dict):
        initial_state["time"] = {
            "era": request.era,
            "year": request.year or "",
            "month": "正月",
            "day": "初一",
            "season": "春",
            "solar": "",
            "hour": "辰时",
            "dayIndex": 0,
        }
    parsed["initial_state"] = initial_state
    session_id = str(uuid.uuid4())
    sessions[session_id] = {
        "state": parsed["initial_state"],
        "history": [],
        "long_term_memory": normalize_memory({
            "character_facts": [
                f"人物由玩家创建：{request.character.get('name', '无名')}，职业/擅长为{request.character.get('occupation', '未指定')}。",
                *([f"家庭背景：{request.character['family_background']}" ] if request.character.get('family_background') else []),
                *([f"最终人生目标：{request.character['life_goal']}" ] if request.character.get('life_goal') else []),
            ],
            "world_changes": [],
            "relationship_changes": [f"初始关系：{item.get('name')}（{item.get('relation', '相识')}）" for item in
                                     request.character.get("initial_relationships", []) if
                                     isinstance(item, dict) and item.get("name")],
            "important_events": [],
            "open_threads": [],
        }),
        "reference_document_loaded": True,
        "reference_document_path": str(Path(__file__).resolve().parents[1] / "data" / "历史人物模拟.txt"),
        "conversation": [
            {"role": "user", "content": prompt},
            {"role": "assistant", "content": json.dumps(output, ensure_ascii=False)},
        ],
    }
    save_session(session_id)
    return GameInitResponse(session_id=session_id, **parsed)


@app.post("/api/play", response_model=PlayResponse)
async def play(request: PlayRequest):
    if request.session_id not in sessions:
        load_session(request.session_id)
    if request.session_id not in sessions:
        raise HTTPException(status_code=404, detail="会话不存在")
    session = sessions[request.session_id]
    # The model has no guaranteed memory between HTTP calls. Rebuild the
    # prompt from the server-side session plus the latest client state.
    prompt_state = {**session.get("state", {}), **request.current_state}
    prompt_history = (session.get("history", []) + request.history)[-MAX_HISTORY_LENGTH:]
    recent_conversation = session.get("conversation", [])[-RECENT_CONVERSATION_MESSAGES:]
    prompt = build_play_prompt(prompt_state, prompt_history, request.player_input, request.pace,
                               session.get("long_term_memory"))
    try:
        output = await call_openai(prompt, conversation=recent_conversation)
    except AIServiceError as error:
        raise HTTPException(status_code=502, detail=f"AI配置失败：{error}")
    parsed = parse_play(output)
    update_long_term_memory(session, parsed.get("memory_update"))
    session.setdefault("conversation", []).extend([
        {"role": "user", "content": prompt},
        {"role": "assistant", "content": json.dumps(output, ensure_ascii=False)},
    ])
    if not isinstance(parsed.get("state_updates"), dict):
        parsed["state_updates"] = {}
    update_character = parsed["state_updates"].get("currentCharacter") or parsed["state_updates"].get("current_character")
    parsed["state_updates"]["currentCharacter"] = normalize_character_attributes(
        update_character if update_character is not None else prompt_state.get("currentCharacter", {}),
        prompt_state.get("currentCharacter", {}))
    session["state"] = prompt_state
    session["history"] += [{"role": "user", "content": request.player_input},
                           {"role": "system", "content": parsed["narrative"]}]
    session["history"] = session["history"][-MAX_HISTORY_LENGTH:]
    if parsed["state_updates"]:
        session["state"].update(parsed["state_updates"])
    save_session(request.session_id)
    return PlayResponse(**parsed)


FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=HOST, port=PORT)
