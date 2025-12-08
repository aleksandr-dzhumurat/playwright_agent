# LinkedIn Connections Search Service

A FastAPI-based search service that indexes LinkedIn connections using TF-IDF with character trigrams for fuzzy matching on job descriptions.

## Features

- **TF-IDF Indexing**: Character trigram-based indexing for robust fuzzy matching
- **FastAPI Backend**: High-performance async API
- **Similarity Search**: Cosine similarity-based ranking
- **Case-insensitive**: Automatically lowercases all text

## Prerequisites

- Python 3.8+
- [uv](https://github.com/astral-sh/uv) package manager

## Setup

### 1. Install uv (if not already installed)

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### 2. Create virtual environment with uv

```bash
uv venv
```

### 3. Activate the virtual environment

**On macOS/Linux:**
```bash
source .venv/bin/activate
```

**On Windows:**
```bash
.venv\Scripts\activate
```

### 4. Install dependencies

```bash
uv pip install -r requirements.txt
```

## Running the Service

### Start the FastAPI server

```bash
python search_service.py
```

The service will start on **http://localhost:8002**

### Alternative: Run with uvicorn directly

```bash
uvicorn search_service:app --host 0.0.0.0 --port 8002 --reload
```

## API Endpoints

### 1. Root - GET `/`

Get API information and statistics.

```bash
curl http://localhost:8002/
```

**Response:**
```json
{
  "message": "LinkedIn Connections Search API",
  "endpoints": {
    "/search": "Search connections by description",
    "/stats": "Get index statistics"
  },
  "total_connections": 20
}
```

### 2. Search - POST `/search`

Search connections by description.

**Request Body (JSON):**
- `q` (required): Search query string
- `limit` (optional): Maximum results to return (default: 10, max: 100)

**Example:**
```bash
curl -X POST "http://localhost:8002/search" \
  -H "Content-Type: application/json" \
  -d '{"q": "data scientist", "limit": 5}'
```

**Response:**
```json
{
  "query": "data scientist",
  "total_results": 5,
  "results": [
    {
      "name": "Narek Vardanian",
      "description": "Senior Data Scientist (Product) @ inDrive",
      "url": "https://www.linkedin.com/in/narek-vardanian/",
      "score": 0.85
    }
  ]
}
```

### 3. Statistics - GET `/stats`

Get index statistics.

```bash
curl http://localhost:8002/stats
```

**Response:**
```json
{
  "total_connections": 20,
  "vocabulary_size": 1523,
  "index_built": true
}
```

## How It Works

1. **Data Loading**: Loads connections from `linkedin-connections.jsonl`
2. **TF-IDF Indexing**:
   - Extracts descriptions from all connections
   - Builds character trigram vectors (e.g., "data" → ["dat", "ata"])
   - Creates TF-IDF matrix for efficient similarity search
3. **Search**:
   - Converts query to same character trigram representation
   - Calculates cosine similarity with all indexed descriptions
   - Returns top-k matches ranked by similarity score

## Testing the Service

### Test search functionality

```bash
# Search for AI-related connections
curl -X POST "http://localhost:8002/search" \
  -H "Content-Type: application/json" \
  -d '{"q": "ai", "limit": 10}'

# Search for product managers
curl -X POST "http://localhost:8002/search" \
  -H "Content-Type: application/json" \
  -d '{"q": "product manager", "limit": 5}'

# Search for engineers
curl -X POST "http://localhost:8002/search" \
  -H "Content-Type: application/json" \
  -d '{"q": "engineer"}'
```

### Interactive API documentation

Visit **http://localhost:8002/docs** for interactive Swagger UI documentation.

## Telegram Bot

### Setup Telegram Bot

1. **Create a bot `ProfileSearchBot` with BotFather:**
   - Open Telegram and search for [@BotFather](https://t.me/botfather)
   - Send `/newbot` and follow instructions
   - Copy the bot token

2. **Set environment variable:**

   **Option A: Using .env file (recommended):**
   ```bash
   cp .env.example .env
   # Edit .env and add your token
   ```

   **Option B: Export in terminal:**
   ```bash
   export TG_BOT_TOKEN='your-bot-token-here'
   ```

3. **Make sure the search service is running:**
   ```bash
   # In terminal 1
   python search_service.py
   ```

4. **Run the bot:**
   ```bash
   # In terminal 2
   python telegram_bot.py
   ```

### Bot Commands

- `/start` - Welcome message and instructions
- Send any text message - Bot searches connections and returns top 5 matches

### Example Usage

1. Start the bot: `/start`
2. Send a search query: "data scientist"
3. Bot responds with top 5 matching connections:
   ```
   Found 3 matching connections:

   1. Narek Vardanian
      Senior Data Scientist (Product) @ inDrive
      Score: 0.85
      https://www.linkedin.com/in/narek-vardanian/

   2. Renat Shigapov
      Lead Data Scientist, Project Manager
      Score: 0.72
      https://www.linkedin.com/in/renat-shigapov/
   ...
   ```

## Project Structure

```
.
├── data/                          # Data directory (created automatically)
│   └── linkedin-connections.jsonl # Scraped connections data
├── linkedin-automation.js         # LinkedIn scraper
├── search_service.py             # FastAPI search service
├── telegram_bot.py               # Telegram bot
├── requirements.txt              # Python dependencies
└── README.md                     # This file
```

## Troubleshooting

### Port already in use

If port 8002 is already in use, you can change it in `search_service.py`:

```python
uvicorn.run(app, host="0.0.0.0", port=8003)  # Use different port
```

### File not found error

Ensure the scraped data exists at `data/linkedin-connections.jsonl`. Run the scraper first:
```bash
node linkedin-automation.js run
```

### No results returned

- Check if the JSONL file has data
- Try broader search queries
- Visit `/stats` endpoint to verify index is built

## Development

### Run in development mode with auto-reload

```bash
uvicorn search_service:app --reload --port 8002
```

### Add more dependencies

```bash
uv pip install <package-name>
uv pip freeze > requirements.txt
```
