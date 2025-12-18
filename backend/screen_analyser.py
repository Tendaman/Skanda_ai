# backend\screen_analyser.py

"""
Screen analyser: send screenshot bytes to Qwen3-VL-8B-Instruct
and return a structured JSON representation.

The screenshot NEVER touches disk.
"""

import os
import re
import json
import base64
import logging
from typing import Dict, Any, Optional

from dotenv import load_dotenv

# Reuse the OpenRouter client from ai_model.py
try:
    from ai_model import client
except Exception as e:
    client = None
    logging.error("Could not import OpenAI client from ai_model.py: %s", e)

load_dotenv()
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

VISION_MODEL = os.environ.get("VISION_MODEL", "qwen/qwen3-vl-8b-instruct")


def _vision_prompt() -> str:
    """
    Returns the prompt instructing the vision model to output ONLY clean JSON.
    """
    return (
        "You will receive an image. Return ONLY valid JSON with the schema:\n"
        "{\n"
        '  "ocr_text": string,\n'
        '  "ui_elements": [ { "type": string, "text": string, "confidence": number, "bounding_box": [x,y,w,h] } ],\n'
        '  "errors": [ { "text": string, "severity": "info"|"warning"|"error" } ],\n'
        '  "code_snippets": [ { "language": string, "code": string } ],\n'
        '  "summary": string,\n'
        '  "likely_intent": string,\n'
        '  "suggested_actions": [ string ]\n'
        "}\n\n"
        "Output ONLY JSON. No explanation. No markdown."
    )


def extract_json_from_text(text: str) -> Optional[Dict[str, Any]]:
    """
    Extracts a JSON object from a possibly messy model output.
    """
    text = text.strip()

    # Attempt direct load
    try:
        return json.loads(text)
    except Exception:
        pass

    # Try to locate { ... } JSON block
    brace_stack = []
    start_idx = None
    for i, ch in enumerate(text):
        if ch == "{":
            if start_idx is None:
                start_idx = i
            brace_stack.append(i)
        elif ch == "}":
            if brace_stack:
                brace_stack.pop()
                if not brace_stack and start_idx is not None:
                    candidate = text[start_idx:i + 1]
                    try:
                        return json.loads(candidate)
                    except Exception:
                        start_idx = None
                        brace_stack = []
    return None


def analyze_screenshot(image_bytes: bytes) -> Dict[str, Any]:
    """
    Sends screenshot bytes to Qwen3-VL-8B-Instruct and returns parsed JSON.
    Screenshot is NOT saved to disk.
    """

    if client is None:
        raise RuntimeError("Vision model client not initialized.")

    # Encode screenshot into base64 Data URL
    b64 = base64.b64encode(image_bytes).decode("utf-8")
    data_url = f"data:image/png;base64,{b64}"

    messages = [
        {"role": "system", "content": _vision_prompt()},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "Analyze this image and return ONLY JSON."},
                {"type": "image_url", "image_url": data_url},
            ],
        },
    ]

    logger.info("Calling vision model=%s", VISION_MODEL)

    try:
        res = client.chat.completions.create(
            model=VISION_MODEL,
            messages=messages,
            temperature=0.0,
            max_tokens=2000,
        )
    except Exception as e:
        logger.exception("Vision model error:")
        raise RuntimeError(f"Vision model failed: {e}")

    # Extract assistant text
    try:
        text = res.choices[0].message.content.strip()
    except Exception:
        text = str(res)

    parsed = extract_json_from_text(text)
    if parsed is None:
        return {
            "_error": "JSON_PARSE_FAILED",
            "_raw": text,
        }

    return parsed


if __name__ == "__main__":
    # For manual testing ONLY
    import sys
    if len(sys.argv) < 2:
        print("Usage: python backend/screen_analyser.py <image_path>")
        exit(1)
    with open(sys.argv[1], "rb") as f:
        img = f.read()
    out = analyze_screenshot(img)
    print(json.dumps(out, indent=2, ensure_ascii=False))
