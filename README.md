# PromptShield: AI Jailbreak & Prompt Injection Defense Platform

PromptShield is an end-to-end multi-layer defense platform designed to protect LLM-integrated applications (such as Retrieval-Augmented Generation / RAG systems) against direct jailbreaks and indirect prompt injection attacks. 

The repository includes a victim RAG chatbot, a frozen attack library, an adaptive adversarial mutator, an automated evaluation harness, and a modern cybersecurity SaaS web console.

---

## Architecture Overview

```
               ┌────────────────────────────────────────────────────────┐
               │           PromptShield Web Console (React + Vite)      │
               │   Live Chat · Dashboard · Attack Library · Results ·   │
               │                    Query History                       │
               └───────────────────────────┬────────────────────────────┘
                                           │ HTTP /api (Port 8080)
                                           ▼
               ┌────────────────────────────────────────────────────────┐
               │       App Backend Server (FastAPI / app_server.py)     │
               │    - SQLite DB (backend/data/promptshield.db)          │
               │    - ChromaDB Document Retrieval (target/retriever.py) │
               │    - Ollama Chatbot Controller (target/chatbot.py)     │
               └───────────────┬────────────────────────┬───────────────┘
                               │                        │
       (In-process or Remote)  │                        │ HTTP (Port 11434)
                               ▼                        ▼
     ┌───────────────────────────────────┐    ┌───────────────────────────┐
     │      Layered Defense Gate         │    │     Target LLM Server     │
     │      (defense/service.py)         │    │          (Ollama)         │
     │  1. Classifier (DistilBERT)       │    │    Model: llama3.1:8b     │
     │  2. Perplexity (GPT-2)            │    └───────────────────────────┘
     │  3. Segregator (Rule Normalizer)  │
     │  4. Prompt Hardening (<tags>)     │
     └───────────────────────────────────┘
```

### Defense Pipeline Signals

The defense gate evaluates inputs through multiple decoupled layers. A request is blocked if **any** layer triggers:

| Signal / Layer | Scope | Mechanism | Target Threats |
|---|---|---|---|
| **DistilBERT Classifier** | Query text | Fine-tuned transformer binary classifier on jailbreak patterns | Direct jailbreak attempts |
| **Perplexity Filter** | Query text | GPT-2 language model perplexity scoring | Obfuscated payloads, ciphered prompts, token-bombing |
| **Segregator & Normalizer** | Retrieved context | Normalizes invisible chars, leetspeak, homoglyphs, base64; applies regex heuristic safety rules | Indirect prompt injection within retrieved documents |
| **Prompt Hardening** | System / Context | Wraps retrieved data in `<retrieved_data>` boundary tags with strict system instructions | Prevents the model from interpreting retrieved data as instructions |

---

## Directory Structure

```
├── attacks/                  # Attack generation & benchmarks
│   ├── seeds.py              # Frozen attack library generator
│   ├── seeds.json            # 54 frozen attack vectors (direct & indirect)
│   ├── templates.py          # Attack prompt templates
│   ├── canary_templates.py   # Canary injection templates & validation logic
│   ├── judge.py              # LLM-as-a-judge for evaluating direct jailbreak success
│   └── mutator.py            # Adaptive mutator for adversarial search
├── backend/                  # Application backend and API services
│   ├── app_server.py         # Main FastAPI server (serves API & React dist)
│   ├── history.py            # SQLite database manager for query logs
│   ├── runs_api.py           # Evaluation runs manager and sync
│   └── data/                 # SQLite database storage (promptshield.db)
├── defense/                  # Layered defense implementation
│   ├── gate.py               # Core defense gate logic (classifier, perplexity, segregator)
│   ├── service.py            # Standalone defense microservice (FastAPI on port 8000)
│   ├── client.py             # Client wrapper supporting remote HTTP or in-process gate
│   ├── tools/                # Classifier training, dataset prep, and calibration tools
│   └── logs/                 # Tamper-evident cryptographic audit logs (audit.jsonl)
├── evaluation/               # Automated benchmarking & metrics
│   ├── runner.py             # Static evaluation runner across all defense configs
│   ├── run_adaptive.py       # Adaptive attack evaluation runner
│   ├── metrics.py            # Statistical analysis (Wilson 95% confidence intervals)
│   └── benign_queries.py     # Benign query dataset for false-positive rate (FPR) testing
├── frontend/                 # PromptShield React 18 Web Console
│   ├── src/                  # React source (LiveChat, Dashboard, Results, etc.)
│   ├── dist/                 # Production-built web assets
│   ├── package.json          # Node dependencies & scripts
│   └── vite.config.js        # Vite dev server configuration (proxies /api to 8080)
├── target/                   # Target system under evaluation
│   ├── chatbot.py            # Ollama RAG chatbot controller
│   ├── retriever.py          # ChromaDB document store builder & search
│   ├── generate_poisoned_docs.py # Injects canaries into indirect attack documents
│   └── documents/            # Clean and poisoned document collections
├── results/                  # CSV and JSONL outputs from evaluation runs
└── requirements.txt          # Python dependencies
```

---

## Prerequisites

1. **Python 3.10+** (64-bit recommended)
2. **Node.js 18+** & `npm`
3. **Ollama**:
   - Install from [ollama.com](https://ollama.com)
   - Pull the default target model:
     ```bash
     ollama pull llama3.1:8b
     ```

---

## Configuration & Environment Variables

All configuration settings have sensible defaults, but can be customized via environment variables:

| Variable | Default | Description |
|---|---|---|
| `OLLAMA_URL` | `http://localhost:11434/api/generate` | Target Ollama generation endpoint |
| `OLLAMA_MODEL` | `llama3.1:8b` | Ollama model identifier (e.g., `llama3.1:8b`, `mistral:7b`) |
| `OLLAMA_NUM_CTX` | `8192` | Model context window size in tokens |
| `DEFENSE_URL` | *(empty / unset)* | URL of remote defense service (e.g., `http://127.0.0.1:8000`). If unset, the defense gate runs **in-process**. |
| `DEFENSE_API_KEY` | *(empty / unset)* | Shared secret key for authenticating with the defense microservice |

### Port Allocations

- **`8080`**: FastAPI App Server (`backend/app_server.py`) — serves `/api/*` and the compiled frontend.
- **`5173`**: Vite Frontend Dev Server (`frontend/`) — used for live UI development.
- **`8000`**: Defense Microservice (`defense/service.py`) — used in distributed/two-machine setups.
- **`11434`**: Ollama local LLM daemon.

### Persistent Storage

- **SQLite Database**: `backend/data/promptshield.db`  
  Automatically initialized on first start. Persists user query history (`queries` table) and evaluation run metadata (`runs` table).
- **ChromaDB Vector Store**: `target/chroma_db/`  
  Stores document embeddings for semantic context retrieval.
- **Audit Logs**: `defense/logs/audit.jsonl`  
  Stores hash-chained decision records for tamper-evident defense auditing.

---

## One-Time Initialization & Data Preparation

Before launching the platform or running evaluations for the first time, build the local models and datasets:

### 1. Install Dependencies

```bash
# Install Python packages
pip install -r requirements.txt

# Install Frontend packages
cd frontend
npm install
cd ..
```

### 2. Prepare Datasets & Document Store

```bash
# 1. Freeze attack dataset (creates attacks/seeds.json)
python attacks/seeds.py --freeze

# 2. Generate poisoned documents for indirect attack testing
python target/generate_poisoned_docs.py

# 3. Build ChromaDB document store
python target/retriever.py
```

### 3. Prepare & Calibrate Defense Models (Optional if pre-trained)

```bash
# Prepare training data for DistilBERT
python defense/tools/data_prep.py

# Train the DistilBERT jailbreak classifier
python defense/tools/train_classifier.py

# Calibrate detection thresholds (FPR target)
python defense/tools/calibrate_thresholds.py

# Verify clean documents against segregator rules
python defense/tools/scan_documents.py
```

---

## Execution Guide

### Option 1: Running the PromptShield Web Console (Recommended)

You can run the web console in **Production Mode** (single unified server) or **Development Mode** (with hot-reloading).

#### Production Mode (Single Port 8080)

1. **Ensure Ollama is running**:
   ```bash
   ollama serve
   ```

2. **Build the frontend**:
   ```bash
   cd frontend
   npm run build
   cd ..
   ```

3. **Start the backend server**:
   ```bash
   python -m uvicorn backend.app_server:app --host 127.0.0.1 --port 8080
   ```

4. **Access the application**:
   Open your browser and navigate to:
   **[http://127.0.0.1:8080](http://127.0.0.1:8080)**

---

#### Development Mode (FastAPI + Vite Hot Reload)

1. **Terminal 1 — Backend API Server**:
   ```bash
   python -m uvicorn backend.app_server:app --host 127.0.0.1 --port 8080 --reload
   ```

2. **Terminal 2 — Frontend Dev Server**:
   ```bash
   cd frontend
   npm run dev
   ```

3. **Access the application**:
   Open your browser and navigate to:
   **[http://localhost:5173](http://localhost:5173)**  
   *(Vite automatically proxies all `/api/*` calls to port 8080)*.

---

### Option 2: Distributed Two-Laptop Execution

For strict separation between the application and defense layers (e.g. running on two separate laptops over a local network or VPN like Tailscale):

#### Laptop 1: Defense Laptop
```bash
# Set a shared secret API key
$env:DEFENSE_API_KEY = "your-secure-random-secret-key"

# Run the standalone defense service (Port 8000)
python defense/service.py
```

#### Laptop 2: App & Evaluation Laptop
```bash
# Point to the defense laptop's IP address
$env:DEFENSE_URL     = "http://<DEFENSE_LAPTOP_IP>:8000"
$env:DEFENSE_API_KEY = "your-secure-random-secret-key"

# Run connectivity and fail-closed smoke test
python defense/tools/smoke_test_remote.py

# Launch the web console or evaluation runner
python -m uvicorn backend.app_server:app --host 127.0.0.1 --port 8080
```

*Note: If the defense service goes down or is unreachable, PromptShield fails closed (refuses unsafe execution) and logs a `defense_unavailable` status.*

---

### Option 3: Command-Line Evaluation & Benchmarking

#### 1. Static Evaluation Runner
Evaluates all 54 attacks and benign control queries across all defense configurations:
```bash
python evaluation/runner.py
```
Outputs are written to `results/results_<timestamp>.csv` and `results/transcripts_<timestamp>.jsonl`.

#### 2. Adaptive Attacker Evaluation
Simulates an intelligent adversary attempting mutations against specific defense configurations:
```bash
python evaluation/run_adaptive.py --configs hardened,all --max-attempts 5 --seed 7
```

#### 3. Metric Calculations & Wilson Confidence Intervals
Computes Attack Success Rate (ASR), False Positive Rate (FPR), and Wilson 95% score intervals:
```bash
python evaluation/metrics.py
```

---

## Web Console Features

The PromptShield Web Console includes 5 dedicated modules:

1. **Live Chat (Default Landing Page)**:
   - High-capacity prompt input for long, complex jailbreaks.
   - Side-by-side comparison: **Without Defense** vs **With Defense**.
   - Granular Defense Layer breakdown table detailing decision, score, threshold, and execution latency for:
     - Classifier Layer
     - Perplexity Layer
     - Segregator Layer
   - Canary tracking indicating whether an injected payload successfully exfiltrated or took control.
   - Single-click clipboard copying for both prompt and responses.
2. **Dashboard**:
   - System connectivity health (Ollama status, Defense mode, active attack set count, clean documents).
   - High-level telemetry and recent evaluation summaries.
3. **Attack Library**:
   - Interactive repository of direct and indirect attack vectors.
   - Filtering by category (`Direct Jailbreak`, `Indirect Matched`, `Indirect Dev`, `Indirect Held-Out`).
   - Prompt inspect modal displaying full seed payloads and canaries.
4. **Evaluation Results**:
   - Dynamic evaluation explorer connected directly to the backend results API.
   - SVG-rendered Attack Success Rate (ASR) and False Positive Rate (FPR) charts with Wilson 95% confidence intervals.
   - Category-by-category breakdown table.
   - Searchable and inspectable evaluation transcripts with LLM judge reasoning.
5. **Query History**:
   - Full tabular audit trail of all queries submitted via Live Chat.
   - Filter by canary detection, defense verdict (Blocked / Allowed), and text search.
   - Backed by persistent SQLite storage.

---

## API Endpoints Reference

The `backend/app_server.py` exposes the following REST endpoints:

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/status` | Returns system telemetry (Ollama, Defense, Attack Set, Docs, Runs) |
| `GET` | `/api/attacks` | Returns the frozen library of attacks grouped by category |
| `POST` | `/api/chat` | Executes a dual-test (undefended vs defended) and logs results to SQLite |
| `GET` | `/api/history` | Fetches saved query records from SQLite (`?limit=50&search=...`) |
| `GET` | `/api/results` | Returns list of all available CSV benchmark runs |
| `GET` | `/api/results/{name}` | Returns detailed metrics, intervals, and breakdowns for a run |
| `GET` | `/api/transcripts/{run_id}` | Returns full model transcripts and judge evaluations |

---

## Security & Operational Considerations

- **Fail-Closed Behavior**: When configured with a remote `DEFENSE_URL`, any network error, timeout, or authentication failure triggers an immediate block (`defense_unavailable`).
- **Audit Trail**: Every defense decision generates a cryptographically hashed log line in `defense/logs/audit.jsonl`.
- **API Key Hygiene**: Do not commit `DEFENSE_API_KEY` to source control. Set it as an environment variable in both defense and app environments.
- **Network Boundaries**: In two-machine setups, use an encrypted overlay network (e.g. Tailscale or WireGuard) as the microservice uses standard HTTP.
