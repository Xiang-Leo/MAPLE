from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class TreeNode(BaseModel):
    id: str
    label: Optional[str] = Field(default=None, description="Original tip or internal node label from the MCC tree.")
    parent_id: Optional[str] = Field(default=None, description="Identifier of the parent node; the root has no parent.")
    branch_length: Optional[float] = Field(default=None, description="Branch length leading to this node in time units.")
    time_from_root: float = Field(..., description="Distance from the root along the tree (older values are larger).")
    time_before_present: float = Field(..., description="Distance from the present; useful for plotting on a real timeline.")
    traits: Dict[str, Any] = Field(default_factory=dict)


class TreeEdge(BaseModel):
    parent_id: str
    child_id: str


class TreeMetadata(BaseModel):
    name: Optional[str] = None
    root_height: Optional[float] = None
    tip_count: int = 0


class TreePayload(BaseModel):
    nodes: List[TreeNode]
    edges: List[TreeEdge]
    metadata: TreeMetadata
