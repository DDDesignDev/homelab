from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, HttpUrl
from main import scrape_recipe

app = FastAPI(title="Recipe Scraper", version="1.0")

class ScrapeRequest(BaseModel):
    url: HttpUrl

@app.post("/api/scrape")
def scrape(req: ScrapeRequest):
    try:
        recipe = scrape_recipe(str(req.url))
        return recipe.model_dump()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
