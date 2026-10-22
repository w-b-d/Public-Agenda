# Run this first in a separate Colab cell:
# !pip install faster-whisper fastapi uvicorn pyngrok nest-asyncio transformers bitsandbytes accelerate

import json
import nest_asyncio
import uvicorn
from fastapi import FastAPI, UploadFile, File, BackgroundTasks
from pydantic import BaseModel
from typing import List
from faster_whisper import WhisperModel
from pyngrok import ngrok
from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig
import torch
import tempfile
import os
import threading
import uuid

nest_asyncio.apply()

from google.colab import userdata
NGROK_AUTH_TOKEN = userdata.get('NGROK_AUTH_TOKEN')

app = FastAPI()

print("Loading Whisper...", flush=True)
whisper = WhisperModel("large-v3-turbo", device="cuda", compute_type="float16")

print("Loading Qwen...", flush=True)
quant_config = BitsAndBytesConfig(load_in_4bit=True, bnf_4bit_compute_dtype=torch.float16)
tokenizer = AutoTokenizer.from_pretrained("Qwen/Qwen2.5-14B-Instruct")
llm = AutoModelForCausalLM.from_pretrained(
    "Qwen/Qwen2.5-14B-Instruct",
    quantization_config=quant_config,
    device_map="auto"
)
print("Models ready.", flush=True)

jobs = {}


def extract_json(text: str):
    text = text.strip()
    if text.startswith("```json"):
        text = text[7:]
    elif text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    return json.loads(text.strip())


def run_prompt(prompt: str, max_new_tokens: int = 2048) -> str:
    inputs = tokenizer(prompt, return_tensors="pt").to("cuda")
    with torch.no_grad():
        outputs = llm.generate(**inputs, max_new_tokens=max_new_tokens, temperature=0.1, do_sample=True)
    return tokenizer.decode(outputs[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True)


def summarize(transcript: str) -> dict:
    summary_prompt = f"""<|im_start|>user
You are analyzing minutes from a local government meeting. Be thorough and detailed.

Return ONLY a JSON array of ALL agenda items and discussion topics, each with:
- "topic": short topic title
- "discussion": 3-5 sentence detailed explanation of what was discussed, including key points raised 
- "outcome": the final decision, vote result, or conclusion, or null if none

Rules:
- Capture every topic discussed, even brief ones
- Be specific about vote counts and outcomes
- Return raw JSON array only, no other keys

Transcript:
{transcript}<|im_end|>
<|im_start|>assistant"""

    attendees_prompt = f"""<|im_start|>user
You are analyzing minutes from a local government meeting.

Return ONLY a JSON array of people who were PRESENT and spoke or participated, each with:
- "name": full name as stated
- "title": their role (e.g. "Chair", "Commissioner", "Staff Planner", "Architect") inferred from context

Rules:
- DO NOT include people who were stated as absent
- Deduplicate names
- Return raw JSON array only, no other keys

Transcript:
{transcript}<|im_end|>
<|im_start|>assistant"""

    try:
        summary = extract_json(run_prompt(summary_prompt))
    except Exception:
        summary = []

    try:
        attendees = extract_json(run_prompt(attendees_prompt))
    except Exception:
        attendees = []

    return {"summary": summary, "attendees": attendees}


def process(job_id: str, tmp_path: str):
    try:
        print(f"[{job_id}] Transcribing...", flush=True)
        segments, _ = whisper.transcribe(tmp_path, vad_filter=True)
        lines = []
        for segment in segments:
            start = f"{int(segment.start // 60):02d}:{segment.start % 60:05.2f}"
            end = f"{int(segment.end // 60):02d}:{segment.end % 60:05.2f}"
            lines.append(f"[{start} --> {end}] {segment.text.strip()}")
        transcript = "\n".join(lines)

        print(f"[{job_id}] Summarizing...", flush=True)
        parsed = summarize(transcript)

        jobs[job_id] = {
            "status": "done",
            "transcript": transcript,
            "summary": parsed.get("summary", []),
            "attendees": parsed.get("attendees", [])
        }
        print(f"[{job_id}] Done.", flush=True)
    except Exception as e:
        import traceback
        jobs[job_id] = {"status": "error", "message": traceback.format_exc()}
        print(f"[{job_id}] Error: {e}", flush=True)
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


@app.post("/transcribe")
async def transcribe(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    suffix = os.path.splitext(file.filename or "")[1] or ".tmp"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    job_id = str(uuid.uuid4())
    jobs[job_id] = {"status": "processing"}
    background_tasks.add_task(process, job_id, tmp_path)
    print(f"Job {job_id} started", flush=True)
    return {"job_id": job_id}


@app.get("/result/{job_id}")
def result(job_id: str):
    return jobs.get(job_id, {"status": "not_found"})


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    context: str
    messages: List[ChatMessage]


@app.post("/chat")
def chat(req: ChatRequest):
    system = (
        "You are a helpful assistant answering questions about a local government meeting. "
        "Use ONLY the meeting context below. If the answer isn't in the context, say you don't know.\n\n"
        f"MEETING CONTEXT:\n{req.context}"
    )

    prompt = f"<|im_start|>system\n{system}<|im_end|>\n"
    for m in req.messages:
        role = m.role if m.role in ("user", "assistant") else "user"
        prompt += f"<|im_start|>{role}\n{m.content}<|im_end|>\n"
    prompt += "<|im_start|>assistant\n"

    inputs = tokenizer(prompt, return_tensors="pt").to("cuda")
    with torch.no_grad():
        outputs = llm.generate(
            **inputs,
            max_new_tokens=512,
            temperature=0.3,
            do_sample=True,
            pad_token_id=tokenizer.eos_token_id,
        )
    reply = tokenizer.decode(
        outputs[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True
    ).strip()
    return {"reply": reply}


ngrok.set_auth_token(NGROK_AUTH_TOKEN)
public_url = ngrok.connect(8000)
print(f"Ngrok URL: {public_url}", flush=True)

def run_uvicorn():
    uvicorn.run(app, host="0.0.0.0", port=8000)

thr = threading.Thread(target=run_uvicorn)
thr.start()
