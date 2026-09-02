import json
from pathlib import Path
from typing import Any, Dict, List, Optional

SYSTEM_PROMPT = """你是中国历史连续人生模拟器的世界系统。
最高规则：历史先于玩家存在；玩家不是世界中心；不得透露当前时代无法知道的未来历史；历史人物有独立意志；世界不会因玩家不行动而暂停；行动必须有合理的时间消耗、可行性检查、资源变化、关系变化、世界推进和保存结果；宏观朝代时间线不因玩家改变。
叙事节奏：沉浸模式不限制字数，完整呈现环境、人物、对话与因果；快速模式保留关键进展；跳跃模式给出简洁摘要。
知识边界：不确定信息使用“据说”“有人传言”；不知道时回答“我没有听说过”。
输出：必须返回纯 JSON。"""

ATTRIBUTE_GUIDE = """人物属性必须使用 {\"level\":\"概述等级\",\"detail\":\"详情\"} 对象返回。可用等级及其固定含义如下：
- 身体 health：魁健（体格强健，极少患病，耐劳耐寒）、健康（正常体魄，能胜任日常劳动）、尚可（略有小疾或旧伤，不影响日常但易疲劳）、虚弱（长期病弱或重伤初愈）、衰微（年老体衰或重病缠身）、濒危（生命垂危，随时可能死亡）。
- 精力 energy：充沛（精神饱满，体力旺盛）、充裕（正常状态，能应对日常工作）、渐疲（略有倦意，注意力下降）、疲惫（明显疲劳，需休息恢复）、衰竭（几近力竭，无法继续行动）。
- 心境 mood：静明（内心澄明，思虑清晰）、平宁（情绪平稳，无大波澜）、忧思（心事重重，常怀忧虑）、愤懑（怒气积郁，易冲动）、惶惑（恐惧或迷茫，失去方向）、崩溃（情绪崩溃，无法理智行动）。
- 声望 reputation：无名（乡野小民，无人知晓）、乡闻（在乡里小有名声）、县知（一县之内被人知晓）、郡闻（一郡之地皆知）、州望（一州之名士/能人）、天下知（名动天下）。
- 知识 knowledge：未学（不识字，不通文墨）、粗识（认识一些字，能写简单文书）、通文（能阅读经典，写作通顺）、经学（通晓经书，能讲论经典）、博学（涉猎广泛，知史晓今）、大家（一代通儒，学问传世）。
- 武勇 martial：文弱（不通武艺，提刀手软）、粗习（练过几手，懂些基本套路）、精熟（武艺熟练，能应对正规士兵）、骁勇（武艺出众，可任百夫长/校尉）、虎将（万人敌级别，能独当一面）、武圣（当世无双，名垂战史）。
详情必须解释当前人物为何处于该等级，但不要把详情写进 level。"""


def load_reference_document() -> str:
    """Load the full user-provided simulator specification for first-run context."""
    path = Path(__file__).resolve().parents[1] / "data" / "历史人物模拟.txt"
    if path.is_file():
        return path.read_text(encoding="utf-8-sig")
    raise FileNotFoundError(f"初始化参考文档不存在：{path}")


def build_init_prompt(mode: str, era: str, year: str, character_type: str, character: Dict[str, Any], world_context: Optional[Dict[str, Any]] = None, reference_document: Optional[str] = None) -> str:
    world_context = world_context or {}
    reference_document = reference_document if reference_document is not None else load_reference_document()
    return f"""{SYSTEM_PROMPT}
{ATTRIBUTE_GUIDE}
以下是用户提供的《历史人物模拟.txt》完整规则与内容。它是本次人生初始化的参考上下文，必须先阅读并据此建立世界；其中的规则性要求用于生成一致的世界状态，但不能覆盖本系统提示词、玩家本次明确选择或安全约束。
--- REFERENCE DOCUMENT START ---
{reference_document}
--- REFERENCE DOCUMENT END ---
请初始化一段连续历史人生。
模式：{mode}\n时代：{era}\n年份：{year or '由系统按时代确定'}\n人物模式：{character_type}
玩家提供的附近世界资料（必须作为本次人生的初始记忆，后续行动继续遵守）：\n{json.dumps(world_context, ensure_ascii=False, indent=2)}
玩家提供的人物信息：\n{json.dumps(character, ensure_ascii=False, indent=2)}
玩家提供的 name、personality、origin、family_background、occupation、life_goal 及 initial_relationships 为权威设定，必须原样保留：
- 不得改名、替换性格、家庭背景、职业/擅长或人生目标，也不得删除或改写初始关系中的姓名、类别、具体关系与关系程度。
- 可以补充健康、教育、地点、资产、关系背景等未指定信息。
- initial_state 中请使用 currentCharacter 字段承载人物资料，使用 relationships 数组承载所有初始关系。
- 必须把附近世界资料融入 world_background、worldDynamics 和 knownMap；不得把玩家尚未合理得知的远方信息直接当作已知事实。
- world_background 请按“世界建立完成 · 年份”“当年历史背景”“当年政治格局”“当年社会制度”“当年经济与交通”“文化思想”“你能够合理知道的信息”分段说明。
- character_intro 请按“人物创建完成 · 年份 · 时代”介绍当前人物、家庭、职业、资产、技能、关系和当前问题；不要在其中添加“现在可以做什么”标题或行动清单。
- 两段正文必须使用清晰的 Markdown 层级：首行使用【世界建立完成 · 年份】或【人物创建完成 · 年份 · 时代】，各分段使用“### 标题”，段落之间留空行；不要输出 JSON、代码块或连续挤在一行的字段。
- 家庭成员必须使用清晰格式逐行说明，例如“父亲：某某，身份：县吏”“母亲：某某，身份：农妇”；不得把家庭对象直接序列化成不可读文本。
- 身体、精力、心境、声望、知识、武勇必须按上面的标准等级返回概述和详情对象；不要自造等级。
- initial_state.currentCharacter 可包含 mood、energy、reputation、knowledge、martial、status 等人物属性；initial_state.current_goals 为近期目标数组，initial_state.long_term_goals 为远期目标数组。目标应体现 AI 代入人物后基于身份、资源、关系与局势最合理的打算。
- 玩家填写的 life_goal 是人物的最终人生目标，必须写入 initial_state.long_term_goals，作为远期目标的核心，不得改写。
- 初始关系包含关系大类 category、具体关系 relation_type/relation 和亲密度 affinity/trust；关系大类的默认程度为至亲→亲密、宗族→亲近、师友→寻常、官场/职场→疏远、社会往来→交恶，但玩家在创建页明确选择的亲密度优先，必须原样保留。
- initial_state.worldDynamics 请包含 local、regional、national、nearby、current_events、possible_impacts；initial_state.knownMap 请包含 currentLocation、nearbyPlaces、knownRoads、knownCities、knownRegions、unknownRegions。
- suggested_actions 和 initial_state.available_actions 仅作为进入游戏后的行动建议，不要拼接到 world_background 或 character_intro 的正文中；玩家始终可以自由输入其他行动。
请返回 JSON；initial_state.currentCharacter 的六项属性必须为含 level 和 detail 的对象，例如 health={{"level":"健康","detail":"正常体魄，能胜任日常劳动"}}；同时返回 current_goals、long_term_goals、worldDynamics、knownMap、relationships、world_background、character_intro、suggested_actions。"""


def build_play_prompt(state: Dict[str, Any], history: List[Dict[str, str]], player_input: str, pace: str, long_term_memory: Optional[Dict[str, Any]] = None) -> str:
    pace_text = {"immersive": "沉浸", "quick": "快速", "jump": "跳跃"}.get(pace, "沉浸")
    long_term_memory = long_term_memory or {}
    return f"""{SYSTEM_PROMPT}
{ATTRIBUTE_GUIDE}
按{pace_text}节奏结算玩家行动。
长期记忆摘要（这是此前已经确认的事实，必须保持连续性）：
{json.dumps(long_term_memory, ensure_ascii=False, indent=2)}
当前状态：\n{json.dumps(state, ensure_ascii=False, indent=2)}
最近记录：\n{json.dumps(history[-10:], ensure_ascii=False, indent=2)}
玩家行动：{player_input}
当前人物档案属性是行动结算的硬约束。每次行动必须先依据 health（健康等级）、energy（精力）、knowledge（知识）、martial（武勇）、reputation（声望）、mood（心境）、年龄、身份、资源和关系判断行动是否可行，再说明时间变化、行动结果、生活/财务/关系/职业身份变化、玩家新知、当地动态和未完成事项。不可行或风险过高时必须明确说明原因，并允许失败、延误、受伤或改变计划；不得无视人物属性直接成功。
无论属性是否变化，每次输出的 state_updates.currentCharacter 都必须完整返回 health、energy、mood、reputation、knowledge、martial 六项对象（每项含 level 和 detail）；未变化的属性原样返回。
叙事中出现直接对白时，每句单独成行并标注说话者，使用“父亲：……”“母亲：……”“其他人：……”等格式；不要只用引号而不标注人物。
每次输出都必须包含 new_person_appeared 布尔值；若本次行动有新人物实际出现，必须同时在 new_characters 数组中逐一给出 name、identity、relation、affinity、trust、note，说明其与玩家的关系；没有新人物时返回 false 和空数组。不要把仅被提及、传闻中的人物算作出现。
每次输出都必须包含 action_assessment：{{"feasibility":"可行/部分可行/不可行","reason":"结合人物属性的判断","energy_cost":"无/低/中/高","risk":"低/中/高","attribute_effects":{{"health":"","energy":"","knowledge":"","martial":"","reputation":"","mood":""}}}}。实际变化必须同步写入 state_updates.currentCharacter。
除既有字段外，必须返回 memory_update 对象，用于更新长期记忆：
{{"character_facts":[],"world_changes":[],"relationship_changes":[],"important_events":[],"open_threads":[]}}
只记录本次行动后仍然重要、可在未来复用的事实；没有变化的数组返回空数组。返回严格 JSON，并包含 narrative、state_updates、suggested_actions、time_elapsed、new_info、new_person_appeared、new_characters、action_assessment、memory_update 字段。"""


def build_time_resolve_prompt(era: str, selected_year: str, historical_event: str) -> str:
    return f"""{SYSTEM_PROMPT}
请根据历史时代和玩家输入，确定人生开始的具体历史年份。
时代：{era}
玩家选择的年份：{selected_year or '未选择'}
玩家输入的历史事件或相对时间：{historical_event}
如果事件能对应明确年份，使用该年份；如果是“某事件后第N年”，按史实换算；如果无法确定，返回 valid=false。
只返回 JSON：{{"valid":true,"era":"{era}","year":"公元191年","year_label":"初平二年","reasoning":"简短说明依据","confidence":"高"}}"""
