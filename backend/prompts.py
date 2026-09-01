import json
from typing import Any, Dict, List

SYSTEM_PROMPT = """你是中国历史连续人生模拟器的世界系统。
最高规则：历史先于玩家存在；玩家不是世界中心；不得透露当前时代无法知道的未来历史；历史人物有独立意志；世界不会因玩家不行动而暂停；行动必须有合理的时间消耗、可行性检查、资源变化、关系变化、世界推进和保存结果；宏观朝代时间线不因玩家改变。
叙事节奏：沉浸 150-350 字，快速 60-120 字，跳跃 30-80 字。
知识边界：不确定信息使用“据说”“有人传言”；不知道时回答“我没有听说过”。
输出：必须返回纯 JSON。"""

def build_init_prompt(mode: str, era: str, year: str, character_type: str, character: Dict[str, Any]) -> str:
    return f"""{SYSTEM_PROMPT}
请初始化一段连续历史人生。
模式：{mode}\n时代：{era}\n年份：{year or '由系统按时代确定'}\n人物模式：{character_type}
玩家提供的人物信息：\n{json.dumps(character, ensure_ascii=False, indent=2)}
请返回 JSON：{{"world_background":"...","character_intro":"...","initial_state":{{}},"suggested_actions":["行动1","行动2","行动3"]}}"""

def build_play_prompt(state: Dict[str, Any], history: List[Dict[str, str]], player_input: str, pace: str) -> str:
    pace_text = {"immersive": "沉浸", "quick": "快速", "jump": "跳跃"}.get(pace, "沉浸")
    return f"""{SYSTEM_PROMPT}
按{pace_text}节奏结算玩家行动。
当前状态：\n{json.dumps(state, ensure_ascii=False, indent=2)}
最近记录：\n{json.dumps(history[-10:], ensure_ascii=False, indent=2)}
玩家行动：{player_input}
必须说明时间变化、行动结果、生活/财务/关系/职业身份变化、玩家新知、当地动态、未完成事项和自动保存状态，并返回严格 JSON。"""

def build_time_resolve_prompt(era: str, selected_year: str, historical_event: str) -> str:
    return f"""{SYSTEM_PROMPT}
请根据历史时代和玩家输入，确定人生开始的具体历史年份。
时代：{era}
玩家选择的年份：{selected_year or '未选择'}
玩家输入的历史事件或相对时间：{historical_event}
如果事件能对应明确年份，使用该年份；如果是“某事件后第N年”，按史实换算；如果无法确定，返回 valid=false。
只返回 JSON：{{"valid":true,"era":"{era}","year":"公元191年","year_label":"初平二年","reasoning":"简短说明依据","confidence":"高"}}"""
