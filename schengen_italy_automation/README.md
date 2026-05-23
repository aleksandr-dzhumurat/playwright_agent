# Schengen Italy Appointment Automation

Automates slot checking on [prenotami.esteri.it](https://prenotami.esteri.it) for Italian Schengen visa appointments. Polls the booking page on a schedule and sends Telegram notifications when slots become available.

## How it works

1. Opens the Services page via CloakBrowser (anti-bot Chromium wrapper)
2. Switches UI language to English
3. Logs in automatically if session has expired (falls back to manual login if CAPTCHA appears)
4. Polls every 10 minutes for available booking slots
5. When a slot is fully booked, a jConfirm popup appears — the script dismisses it and retries
6. When no popup appears after clicking BOOK, slots are available — sends a Telegram alert with `@mention`

## Schedule

Checks only run on **weekdays (Mon–Fri)** between **09:00 and 13:30**. Outside this window the script sleeps and skips without touching the browser.

## Setup

### 1. Install dependencies

```bash
uv pip install -r requirements.txt
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in all values:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `PRENOTAMI_EMAIL` | Your prenotami.esteri.it login email |
| `PRENOTAMI_PASSWORD` | Your prenotami.esteri.it password |
| `TG_BOT_TOKEN` | Telegram bot token from @BotFather |
| `TG_CHAT_ID` | Numeric chat ID of the notification group |

To find your `TG_CHAT_ID`: send a message to your bot, then open `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy the `chat.id` value.

### 3. Run

```bash
make schengen
# or directly:
uv run python schengen_italy_automation/book_appointment.py
```

## Telegram notifications

| Event | Message |
|---|---|
| Script started | `@adzhumurat slot checker bot restarted.` |
| Popup detected (no slots) | `Italy embassy slot checker: no slots for '...'. Will retry in 10 min.` |
| Slots available | `@adzhumurat SLOTS AVAILABLE for '...'! Book now!` |

## Key implementation notes

**CloakBrowser** (`launch_persistent_context`) is used instead of plain Playwright because prenotami.esteri.it detects headless browsers. `humanize=True` adds human-like mouse movements.

**Persistent profile** (`schengen_italy_automation/profile/`) stores cookies so login is not required on every run. If the profile is locked by another process, kill it with:
```bash
pkill -f "user-data-dir=.*schengen_italy_automation/profile"
```

**Credential entry via clipboard** — `type()` and `fill()` mangle special characters on this site. Credentials are pasted via macOS clipboard (`pbcopy` + `Meta+v`) to avoid this.

**BOOK button detection** — the button is matched by `a[href*='/Services/Booking/']` (not by text) because CSS `text-transform: uppercase` causes text-based selectors to be unreliable.

**Popup detection** — the "all booked" jConfirm dialog is detected with `page.get_by_text(...)` with a 4-second timeout. The dismiss button is `.jconfirm-buttons button` (lowercase `ok` in DOM).

**Import fallback** — CloakBrowser ≥ 0.3.0 uses `patchright` internally. `TimeoutError` is imported from `patchright.sync_api` with a fallback to `playwright.sync_api`.

## Configured services

```python
PRENOTAMI_SERVICE_NAMES = [
    "Appointments visas for: TOURISM (counter_1)",
    "Appointments visas for: TOURISM (counter_2)",
]
```

Both counters are checked on every poll cycle. Edit this list to target different service names.
