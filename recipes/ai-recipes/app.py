import os, json
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from openai import OpenAI

app = FastAPI(title="ai-recipes")
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

class RecipeLite(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    tags: List[str] = []
    servings: Optional[int] = None
    prep_minutes: Optional[int] = None
    cook_minutes: Optional[int] = None

class SuggestIn(BaseModel):
    prompt: str
    recipes: List[RecipeLite]
    k: int = 3

@app.post("/api/ai/suggest")
def suggest(req: SuggestIn):
    if not os.environ.get("OPENAI_API_KEY"):
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not set")

    allowed_ids = {r.id for r in req.recipes}

    system = "Return ONLY valid JSON. No markdown, no extra text."

    user = f"""
Pick the best {req.k} matches from the recipes list for the user's request.
Return ONLY JSON:
{{"suggestions":[{{"id":<number>,"title":<string>,"reason":<string>}}]}}

User request: {req.prompt}

Recipes JSON:
{json.dumps([r.model_dump() for r in req.recipes], ensure_ascii=False)}
""".strip()

    try:
        resp = client.responses.create(
            model=os.environ.get("OPENAI_MODEL", "gpt-4.1-mini"),
            input=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )

        text = resp.output_text or ""
        data = json.loads(text)

        # Filter to only allowed IDs
        suggestions = []
        for s in data.get("suggestions", []):
            if isinstance(s, dict) and s.get("id") in allowed_ids:
                suggestions.append(s)

        return {"suggestions": suggestions[: req.k]}
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="Model returned non-JSON output")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
