# backend\ai_model.py
import os
import logging
from typing import Generator, List, Dict, Any
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY")
OPENROUTER_BASE_URL = os.environ.get("OPENROUTER_BASE_URL")
DEFAULT_MODEL = os.environ.get("AI_MODEL", "qwen/qwen3-coder:free")

if not OPENROUTER_API_KEY:
    raise RuntimeError("OPENROUTER_API_KEY environment variable is required")

client = OpenAI(base_url=OPENROUTER_BASE_URL, api_key=OPENROUTER_API_KEY)

SYSTEM_PROMPT = os.path.join(os.path.dirname(__file__), "system_prompt.txt")

try:
    with open(SYSTEM_PROMPT, "r", encoding="utf-8") as f:
        SYSTEM_PROMPT = f.read()
except Exception as e:
    raise RuntimeError(f"Failed to load system_prompt.txt: {e}")

def _normalize_messages(payload: Dict[str, Any]) -> tuple[List[Dict[str, Any]], Any]:
    """Normalize message payload and extract prior reasoning."""
    msgs = payload.get("messages") or [{"role": "user", "content": payload.get("message", "")}]
    out = [{"role": "system", "content": SYSTEM_PROMPT}]
    last_assistant_reasoning = None
    for m in msgs:
        role = m.get("role", "user")
        content = m.get("content", "")
        out.append({"role": role, "content": content})
        if role == "assistant" and "reasoning_details" in m:
            last_assistant_reasoning = m.get("reasoning_details")
    return out, last_assistant_reasoning

def generate_chat_response(payload: Dict[str, Any]) -> Generator[str, None, None]:
    """Generate a streaming response from the AI model."""
    model = payload.get("model", DEFAULT_MODEL)
    messages, prior_reasoning = _normalize_messages(payload)
    extra_body = {"reasoning": {"enabled": True}}
    if prior_reasoning:
        extra_body["reasoning"]["previous"] = prior_reasoning

    try:
        logging.info("Calling model=%s messages=%d with streaming", model, len(messages))
        response_stream = client.chat.completions.create(
            model=model,
            messages=messages,
            extra_body=extra_body,
            stream=True, 
        )
        
        for chunk in response_stream:
            delta_content = chunk.choices[0].delta.content
            if delta_content:
                yield f"data: {delta_content}\n\n"
        
        yield "data: [DONE]\n\n" 

    except Exception as e:
        logging.exception("model call failed during streaming")
        yield f"data: [ERROR] {str(e)}\n\n"