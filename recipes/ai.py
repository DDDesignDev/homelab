import os
import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

router = APIRouter(prefix="/api/ai", tags=["ai"])

AI_RECIPES_URL = os.environ.get("AI_RECIPES_URL", "http://ai-recipes:8020")

# Optional: set this if your recipes service is not the same host
# but usually you can call your own app internally with request.base_url.
RECIPES_INTERNAL_URL = os.environ.get("RECIPES_INTERNAL_URL")  # e.g. "http://recipes:8000"

class AiSuggestRequest(BaseModel):
    prompt: str
    limit: int = 30
    k: int = 3

class AiSuggestResponse(BaseModel):
    suggestions: List[Dict[str, Any]]

async def fetch_recipes_for_ai(request: Request, limit: int) -> List[dict]:
    """
    Fastest approach: reuse your existing /api/recipes endpoint so you don't need DB code here.
    We request recipes, then 'lite' them down to fields the AI needs.
    """
    base = RECIPES_INTERNAL_URL or str(request.base_url).rstrip("/")
    url = f"{base}/api/recipes"

    async with httpx.AsyncClient(timeout=20.0) as client:
      r = await client.get(url)
      r.raise_for_status()
      items = r.json()

    # "Lite" the recipes so you're not sending huge payloads
    lite = []
    for x in (items or [])[:limit]:
        lite.append({
            "id": x.get("id"),
            "title": x.get("title"),
            "description": x.get("description"),
            "tags": x.get("tags") or [],
            "servings": x.get("servings"),
            "prep_minutes": x.get("prep_minutes"),
            "cook_minutes": x.get("cook_minutes"),
        })

    # Filter out anything missing required fields
    lite = [r for r in lite if r.get("id") is not None and r.get("title")]
    return lite[:limit]

@router.post("/suggest", response_model=AiSuggestResponse)
async def suggest(req: AiSuggestRequest, request: Request):
    recipes = await fetch_recipes_for_ai(request, req.limit)
    if not recipes:
        return {"suggestions": []}

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(
                f"{AI_RECIPES_URL}/api/ai/suggest",
                json={"prompt": req.prompt, "recipes": recipes, "k": req.k},
            )
        r.raise_for_status()
        return r.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI suggest failed: {e}")
