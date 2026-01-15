import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from openai import OpenAI

app = FastAPI(title="ai-recipes")

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

class PingRequest(BaseModel):
    text: str = "Say 'pong' in one word."

@app.get("/health")
def health():
    return {"ok": True}

@app.post("/api/ai/ping")
def ping(req: PingRequest):
    if not os.environ.get("OPENAI_API_KEY"):
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not set")

    try:
        # Responses API (recommended)
        resp = client.responses.create(
            model=os.environ.get("OPENAI_MODEL", "gpt-4.1-mini"),
            input=req.text,
        )
        return {
            "model": os.environ.get("OPENAI_MODEL", "gpt-4.1-mini"),
            "output_text": resp.output_text,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    

    


