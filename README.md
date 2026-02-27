# LinkedIn Connections Search Service

Playwright-based linkedin scraping

[![Demo: playwrigt agent](http://img.youtube.com/vi/fENXGEganHI/0.jpg)](https://www.youtube.com/watch?v=fENXGEganHI "Demo: playwright agent")


# Run profiles scraping

Prepare cookies
```shell
make setup
```

Collect profiles list

```shell
make connections
```

Start scraping according to connections list, imit scraping to first N profiles:

```shell
make scrape-profiles LIMIT=20
```



To enable authenticated scraping, you must generate a LinkedIn session file (`linkedin-auth.json`) containing your cookies and user agent. This file is required for all Playwright-based LinkedIn automation.

1. **Install Node.js dependencies:**
  ```bash
  cd linkedin_automation
  npm install
  ```

2. **Run the authentication setup:**
  ```bash
  node linkedin-automation.js setup
  ```

  - A Chromium browser window will open.
  - Log in to your LinkedIn account manually in the opened window.
  - Once you are on your LinkedIn feed, return to the terminal and press ENTER as instructed.

3. **Result:**
  - The script will save your session cookies and the actual user agent string to `linkedin-auth.json` in the `linkedin_automation` directory.
  - This file will be used for all subsequent scraping sessions to ensure correct fingerprinting and authentication.


### Extract Single Profile

The script can extract detailed information from individual LinkedIn profiles.

**Command:**
```bash
cd linkedin_automation
node linkedin-automation.js profile --linkedin_profile https://www.linkedin.com/in/aleksandr-dzhumurat/
```

**What it extracts:**
- About section
- Experience list (title, company, duration, location, description)

**Example:**
```bash
cd linkedin_automation
node linkedin-automation.js profile --linkedin_profile https://www.linkedin.com/in/edsandovaluk/
```


**Output:**
- The script automatically creates a `data` directory (if it doesn't exist).
- Connections are saved to `data/linkedin-connections.jsonl` by default.
- If you use `--output filename.jsonl`, it will be saved to `data/filename.jsonl`.

### Batch Scrape All Connections

Automatically scrape profiles for all your LinkedIn connections.

**Command:**
```bash
cd linkedin_automation
node linkedin-automation.js scrape_profiles [delay]
```

**How it works:**
1. Reads existing profiles from `data/profiles/`
2. Reads your connections from `data/linkedin-connections.jsonl`
3. Identifies profiles that haven't been scraped yet
4. Scrapes each missing profile with a random delay between requests

**Parameters:**
- `delay` - Base time in milliseconds between profiles (default: 10000 = 10 seconds). A random buffer (0-5s) is added to this base delay.

**Stealth Features:**
- **Random Delays**: Mimics human behavior with variable pauses between actions.
- **Fingerprint Protection**: Uses `playwright-extra` with stealth plugins to mask automation.
- **User-Agent Rotation**: Rotates User-Agents for each session.
- **Viewport Randomization**: Varying window sizes to avoid detection.

**Examples:**
```bash
# Default 10-second base delay (+ random buffer)
node linkedin-automation.js scrape_profiles

# Custom 15-second base delay (safer for large batches)
node linkedin-automation.js scrape_profiles 15000

# Using --delay flag
node linkedin-automation.js scrape_profiles --delay 20000
```

**Note:** The script automatically skips already-scraped profiles, so you can run it multiple times safely.


# Running the  FastAPI server

A FastAPI-based search service that indexes LinkedIn connections using TF-IDF with character trigrams for fuzzy matching on job descriptions.

Features

- **TF-IDF Indexing**: Character trigram-based indexing for robust fuzzy matching
- **FastAPI Backend**: High-performance async API
- **Similarity Search**: Cosine similarity-based ranking
- **Case-insensitive**: Automatically lowercases all text

Prerequisites

- Python 3.8+
- [uv](https://github.com/astral-sh/uv) package manager

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
uv venv
source .venv/bin/activate
uv pip install -r requirements.txt
```

```bash
uv run python search_service.py
```

The service will start on **http://localhost:8002**


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
      https://www.linkedin.com/in/aleksandr-dzhumurat/

   2. Renat Shigapov
      Lead Data Scientist, Project Manager
      Score: 0.72
      https://www.linkedin.com/in/renat-shigapov/
   ...
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
