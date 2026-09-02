from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class CreateGameRequest(BaseModel):
    mode: str
    era: str
    year: Optional[str] = ""
    character_type: str = "fictional"
    character: Dict[str, Any] = Field(default_factory=dict)
    world_context: Dict[str, Any] = Field(default_factory=dict)


class ResolveTimeRequest(BaseModel):
    era: str
    selected_year: Optional[str] = ""
    historical_event: str


class ResolveTimeResponse(BaseModel):
    era: str
    year: str
    year_label: str
    reasoning: str = ""
    confidence: str = "中"


class PlayRequest(BaseModel):
    session_id: str
    player_input: str
    current_state: Dict[str, Any] = Field(default_factory=dict)
    history: List[Dict[str, str]] = Field(default_factory=list)
    pace: str = "immersive"


class GameInitResponse(BaseModel):
    session_id: str
    world_background: str
    character_intro: str
    initial_state: Dict[str, Any]
    suggested_actions: List[str]


class PlayResponse(BaseModel):
    narrative: str
    state_updates: Dict[str, Any] = Field(default_factory=dict)
    suggested_actions: List[str] = Field(default_factory=lambda: ["继续前行"])
    suggested_goals: List[str] = Field(default_factory=list)
    time_elapsed: str = "片刻"
    location_changed: Optional[str] = None
    new_info: List[str] = Field(default_factory=list)
    memory_update: Dict[str, Any] = Field(default_factory=dict)
    new_person_appeared: bool = False
    new_characters: List[Dict[str, Any]] = Field(default_factory=list)
    action_assessment: Dict[str, Any] = Field(default_factory=dict)
