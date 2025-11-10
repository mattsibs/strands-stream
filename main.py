import json
import asyncio
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from strands import Agent, tool
from typing import AsyncGenerator

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# Enable CORS (allow all for dev)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
# Main agent for answering user prompts
main_agent = Agent(
    model=openai_model,
    system_prompt="You are a helpful assistant. Answer the user's question clearly and concisely."
)

# Suggestion agent for generating follow-up questions
suggestion_agent = Agent(
    model=openai_model,
    system_prompt="You are an expert at suggesting 3 relevant follow-up questions for a given answer. Return only the questions as a Python list of strings."
)

async def stream_agent(prompt: str) -> AsyncGenerator[str, None]:
    # 1. Call main_agent and stream partial responses
    answer = ""
    async for event in main_agent.stream_async(prompt):
        if "data" in event:
            answer += event["data"]
            yield json.dumps({"type": "partial_response", "value": event["data"]}) + "\n"
        else:
            print("[main_agent event]", event)
    # 2. After answer is complete, send the full response
    yield json.dumps({"type": "response", "value": answer}) + "\n"
    # 3. Call suggestion_agent with the answer and stream suggestions
    suggestions_text = ""
    async for event in suggestion_agent.stream_async(f"Suggest 3 relevant follow-up questions for: {answer}"):
        if "data" in event:
            suggestions_text += event["data"]
        else:
            print("[suggestion_agent event]", event)
    # Try to parse suggestions as a Python list
    try:
        suggestions = eval(suggestions_text)
        if not isinstance(suggestions, list):
            suggestions = [suggestions_text]
    except Exception:
        suggestions = [suggestions_text]
    yield json.dumps({"type": "suggestions", "value": suggestions}) + "\n"

@app.post("/stream")
async def stream_endpoint(request: Request):
    # Log headers
    print("[FastAPI] Incoming headers:", dict(request.headers))
    # Log raw body
    raw_body = await request.body()
    print("[FastAPI] Raw body:", raw_body)
    try:
        data = await request.json()
        print("[FastAPI] Parsed JSON:", data)
        prompt = data["prompt"]
    except Exception as e:
        print("[FastAPI] Error parsing JSON or missing 'prompt':", str(e))
        return {"error": "Invalid request: must be JSON with a 'prompt' field."}, 400
    return StreamingResponse(stream_agent(prompt), media_type="application/json")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=9001, reload=True)
