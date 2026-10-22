# AI server

Turns recorded local-government meetings into transcripts and structured summaries, and powers the in-app meeting chat. It ran as two Google Colab GPU notebooks, each exposed through its own ngrok tunnel:

| Notebook | Role in the demo | Models |
|---|---|---|
| [`notebooks/hackathon.ipynb`](notebooks/hackathon.ipynb) | **Transcription and summaries.** `populate_db.py` sends it meeting audio and writes the results to Supabase. | faster-whisper `large-v3-turbo` (CUDA, fp16) and Qwen2.5-32B-Instruct (4-bit NF4) |
| [`notebooks/chatapi.ipynb`](notebooks/chatapi.ipynb) | **Meeting chat.** The mobile app's `MeetingChat` calls its `/chat`. | Qwen2.5-3B-Instruct (4-bit NF4) and `BAAI/bge-small-en-v1.5` embeddings |

[`colab_server.py`](colab_server.py) is an earlier single-file version of the transcription server: Qwen2.5-14B, a single-pass summary, no `executive_summary`, and no `/resummarize`. It's kept for reference. The client scripts here target the notebook version.

## How it works

**Transcription and summaries** (`hackathon.ipynb`)
1. faster-whisper transcribes the upload with the VAD filter on, producing lines like `[03:12.40 --> 03:18.02] ...`. Whisper is then unloaded to free GPU memory for the LLM.
2. The transcript is split into chunks of about 80,000 characters. For each chunk, Qwen is prompted to return JSON: a list of topics (`topic`, `discussion`, `outcome`) and a list of attendees (`name`, `title`).
3. Topics are merged across chunks and attendees are deduplicated by name. A final "reduce" prompt then turns the topic list into a 2–3 paragraph `executive_summary`.

**Chat** (`chatapi.ipynb`)
1. The caller sends the meeting `context` (the transcript) and the conversation so far.
2. The context is split into 400-word chunks with a 60-word overlap and embedded with bge-small. The embeddings are cached in memory, keyed by an MD5 hash of the context.
3. The 5 chunks most similar to the user's latest message are placed in the system prompt, in their original order. The model is told to answer only from those excerpts and to say it doesn't know otherwise.

All state (jobs and the embedding cache) is held in memory. Nothing is stored in a vector database.

## Endpoints

### Transcription server (`hackathon.ipynb`, port 8000)

**`POST /transcribe`**: multipart upload with field `file` (audio or video). Starts a background job and returns `{ "job_id": "uuid" }`.

**`POST /resummarize`**: JSON `{ "transcript": "..." }`. Re-runs only the summary step as a background job and returns `{ "job_id": "uuid" }`.

**`GET /result/{job_id}`**: returns the job's status, which is `processing`, `done`, `error` (with a `message` traceback), or `not_found`. When the job is done:
```json
{
  "status": "done",
  "transcript": "[00:00.00 --> 00:04.20] ...",
  "summary":   [{ "topic": "...", "discussion": "...", "outcome": "... or null" }],
  "attendees": [{ "name": "...", "title": "..." }],
  "executive_summary": "2-3 paragraphs of prose"
}
```
`/resummarize` results don't include `transcript`. If a chunk fails to parse, the server adds a `"Processing Error (Chunk N)"` entry to `summary` or `attendees` instead of failing the job.

**`POST /chat`**: the same request and response shape as below. It sends the full context to the 32B model with no retrieval step. The app doesn't use this endpoint.

### Chat server (`chatapi.ipynb`, port 8001)

**`POST /chat`**
```json
{
  "context": "meeting transcript",
  "messages": [{ "role": "user", "content": "What did they decide about housing?" }]
}
```
Returns `{ "reply": "..." }`. Any role other than `user` or `assistant` is treated as `user`.

**`GET /health`**: returns `{ "ok": true, "cached_transcripts": <n> }`.

Both servers allow CORS from any origin.

## Client scripts

| File | What it does |
|---|---|
| `populate_db.py` | Finds Supabase `meetings` rows that have a `video_file_url` but no `transcript`, downloads the audio, sends it to `/transcribe`, polls `/result`, and writes `transcript`, `ai_summary` (from `executive_summary`), and `attendees` back to the row. |
| `resummarize.py` | Finds meetings whose `ai_summary` is empty or an error message, sends the transcript to `/resummarize`, and writes the new `executive_summary` back. |
| `main.py` | One-off test that downloads a single Monterey meeting and sends it to `/transcribe` (see Known issues). |
| `scripts/video_downloader.py` | `download_audio(url, output_path)`: uses yt-dlp to download a video and extract a 32 kbps MP3. |
| `scripts/transcriber.py` | `transcribe(audio_path)`: a CPU (int8) faster-whisper helper. Nothing else here uses it. |

## Setup

### 1. Start the servers (Colab)
1. Open a notebook in Colab and choose a GPU runtime. The notebooks were saved with an A100 for transcription and an L4 for chat.
2. Add `NGROK_AUTH_TOKEN` in **Colab Secrets** (the key icon in the sidebar) and allow the notebook to access it.
3. Run the cells in this order: **install → load models → server**. Skip the "Cleanup" cell on first start: it calls `kill_everything()`, which unloads the models. Use it only to reset before reloading.
4. Each server cell prints its ngrok URL when it starts.

### 2. Point clients at them
```bash
cd services/ai-server
python -m venv venv && source venv/bin/activate
pip install requests python-dotenv supabase yt-dlp   # plus ffmpeg on PATH
cp .env.example .env   # COLAB_URL = transcription server URL; plus Supabase values

python populate_db.py --limit 1
python populate_db.py --limit 2 --jurisdiction-id <uuid>   # or --body-id <uuid>
python resummarize.py
```
For the mobile app, set `EXPO_PUBLIC_COLAB_URL` in `apps/mobile/.env` to the **chat** server URL.

`requirements.txt` lists everything, including the GPU packages the notebooks install for themselves.

## Demo note

For the hackathon, both servers ran in Google Colab GPU notebooks and were exposed through ngrok tunnels. That got us free GPU time over a weekend, but it isn't a deployment: URLs change on every restart, jobs and caches live in memory and disappear when the runtime stops, and the endpoints have no authentication. A production version would run on a dedicated GPU inference host and add authentication, persistent job storage, and request limits.

## Known issues

These are left as they were at the end of the hackathon:

- **The notebooks don't run top to bottom.** The Cleanup cell calls `kill_everything()` as soon as it's defined, so the next cell's model `assert` fails. See the run order above.
- **`main.py` reads `response.json()["transcript"]`**, but `/transcribe` returns only a `job_id`, so it raises a `KeyError`. It would need to poll `/result/{job_id}` the way `populate_db.py` does.
- **`colab_server.py`** passes `bnf_4bit_compute_dtype` to `BitsAndBytesConfig`. The real parameter is `bnb_4bit_compute_dtype`, so the fp16 compute dtype probably isn't applied. The notebook spells it correctly.
- **No authentication, upload size limit, or concurrency control.** On the transcription server, `/chat` and background jobs can call `llm.generate` on the same GPU at the same time.
