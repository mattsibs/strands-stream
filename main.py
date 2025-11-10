import json
import asyncio
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from strands import Agent, tool
from typing import AsyncGenerator

from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

app = FastAPI()

# Enable CORS (allow all for dev)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static files (for index.html)
app.mount("/static", StaticFiles(directory="static"), name="static")

import os
from dotenv import load_dotenv
from strands.models.openai import OpenAIModel

load_dotenv()  # Load .env file

openai_api_key = str(os.environ.get("OPENAI_API_KEY"))
print(openai_api_key)
openai_model = OpenAIModel(
    client_args={
        "api_key": openai_api_key,
    },
    # **model_config
    model_id="gpt-4",  # or "gpt-4", etc.
    params={
        "max_tokens": 1000,
        "temperature": 0.7,
    }
)
# Sub-agent specialized in suggestions
suggestion_agent = Agent(
    model=openai_model,
    system_prompt="You are an expert at suggesting 3 relevant follow-up questions for a given answer. Return only the questions as a Python list of strings."
)

@tool
def suggest_next_questions(answer: str) -> list:
    """
    Suggest 3 relevant follow-up questions based on the given answer.
    """
    result = ""
    for event in suggestion_agent.stream(f"Suggest 3 relevant follow-up questions for: {answer}"):
        if "data" in event:
            result += event["data"]
    try:
        suggestions = eval(result)
        if isinstance(suggestions, list):
            return suggestions
    except Exception:
        pass
    return [result]

agent = Agent(model=openai_model, tools=[suggest_next_questions])

async def stream_agent(prompt: str) -> AsyncGenerator[str, None]:
    # Stream answer first, then suggestions
    answer = ""
    async for event in agent.stream_async(prompt):
        if "data" in event:
            answer += event["data"]
            yield json.dumps({"data": event["data"]}) + "\n"
        else:
            print("[agent event]", event)
    # After answer is complete, call the tool for suggestions
    suggestions = agent.tools[0](answer)
    yield json.dumps({"suggestions": suggestions}) + "\n"

@app.post("/stream")
async def stream_endpoint(request: Request):
    data = await request.json()
    prompt = data["prompt"]
    return StreamingResponse(stream_agent(prompt), media_type="application/json")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=9001, reload=True)
