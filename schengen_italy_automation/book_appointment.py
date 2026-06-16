import logging
import os
import random
import subprocess
import time
from datetime import datetime

import requests
from cloakbrowser import launch_persistent_context
from dotenv import load_dotenv

try:
    from patchright.sync_api import TimeoutError  # CloakBrowser >= 0.3.0
except ImportError:
    from playwright.sync_api import TimeoutError  # fallback

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

PRENOTAMI_EMAIL = os.getenv("PRENOTAMI_EMAIL")
PRENOTAMI_PASSWORD = os.environ["PRENOTAMI_PASSWORD"]
TG_BOT_TOKEN = os.getenv("TG_BOT_TOKEN")
TG_CHAT_ID = os.getenv("TG_CHAT_ID")

CHECK_START = (9, 0)   # 09:00
CHECK_END = (15, 30)   # 15:30


def notify_telegram(text: str) -> None:
    if TG_BOT_TOKEN and TG_CHAT_ID:
        url = f"https://api.telegram.org/bot{TG_BOT_TOKEN}/sendMessage"
        requests.post(url, json={"chat_id": TG_CHAT_ID, "text": text})
    else:
        logger.warning("Telegram not configured (TG_BOT_TOKEN / TG_CHAT_ID missing).")


def is_check_time() -> bool:
    now = datetime.now().time()
    start = datetime(*datetime.now().timetuple()[:3], *CHECK_START).time()
    end = datetime(*datetime.now().timetuple()[:3], *CHECK_END).time()
    return start <= now <= end


PRENOTAMI_SERVICE_NAMES = [
    "Appointments visas for: TOURISM (counter_1)",
    "Appointments visas for: TOURISM (counter_2)",
]

BOOKING_URLS = {
    "counter_1": "https://prenotami.esteri.it/Services/Booking/1151",
    "counter_2": "https://prenotami.esteri.it/Services/Booking/1258",
}


def login_and_go_to_services(page) -> None:
    """Navigate to Services, logging in if the session has expired."""
    logger.info("Navigating to Services...")
    page.goto("https://prenotami.esteri.it/Services")
    time.sleep(3)

    # Switch to English — works on /Services and /Home alike
    try:
        en_link = page.locator("a:has-text('ENG'), a:has-text('EN')").first
        en_link.wait_for(state="visible", timeout=5000)
        time.sleep(2)
        en_link.click()
        time.sleep(2)
        logger.info("Language switched to English.")
    except Exception as e:
        logger.warning(f"Could not switch language: {e}")

    # If redirected to /Home — session expired or not logged in
    if "esteri.it/Home" in page.url:
        logger.info(f"Redirected to: {page.url} — attempting login...")

        try:
            login_link = page.locator(
                "a:has-text('Log in'), a:has-text('Login'), a:has-text('access the portal')"
            ).first
            login_link.wait_for(state="visible", timeout=5000)
            time.sleep(3)
            login_link.click()
            time.sleep(3)
            logger.info("Login page opened.")
        except Exception as e:
            logger.warning(f"Could not click login link: {e}")

        logger.debug("Scanning page for inputs...")
        logger.debug(f"Current URL after login click: {page.url}")
        time.sleep(3)

        inputs_info = page.evaluate("""
            () => {
                const inputs = document.querySelectorAll('input');
                return Array.from(inputs).map(el => ({
                    type: el.type,
                    name: el.name,
                    id: el.id,
                    placeholder: el.placeholder,
                    visible: el.offsetParent !== null
                }));
            }
        """)
        logger.debug(f"Found {len(inputs_info)} input(s) on page:")
        for inp in inputs_info:
            logger.debug(f"  type={inp['type']!r}  name={inp['name']!r}  id={inp['id']!r}  placeholder={inp['placeholder']!r}  visible={inp['visible']}")

        logger.info("Entering credentials...")
        try:
            email_field = page.locator("input[type='text'], input[type='email'], input[name='Email']").first
            password_field = page.locator("input[type='password'], input[name='Password']").first

            email_field.wait_for(state="visible", timeout=10000)
            time.sleep(3)
            email_field.click()
            subprocess.run("pbcopy", input=PRENOTAMI_EMAIL.encode(), check=True)
            page.keyboard.press("Meta+v")
            time.sleep(1)
            password_field.wait_for(state="visible", timeout=10000)
            password_field.click()
            subprocess.run("pbcopy", input=PRENOTAMI_PASSWORD.encode(), check=True)
            page.keyboard.press("Meta+v")

            time.sleep(3)
            page.locator("button[type='submit'], input[type='submit'], button:has-text('Log')").first.click()
            page.wait_for_url(lambda url: "Home" not in url and "Login" not in url, timeout=15000)
            logger.info("Login successful.")
        except Exception as e:
            logger.error(f"Login failed or took too long: {e}")
            logger.warning("[MANUAL LOGIN REQUIRED] Please log in manually in the browser window.")
            input("Press Enter in this terminal ONLY AFTER you have successfully logged in... ")

        logger.info("Navigating to Services after login...")
        page.goto("https://prenotami.esteri.it/Services")
        time.sleep(3)
        try:
            en_link = page.locator("a:has-text('ENG'), a:has-text('EN')").first
            en_link.wait_for(state="visible", timeout=5000)
            time.sleep(2)
            en_link.click()
            time.sleep(2)
            logger.info("Language switched to English on Services page.")
        except Exception as e:
            logger.warning(f"Could not switch language on Services page: {e}")

    logger.info(f"Current URL: {page.url}")


def main():
    if not PRENOTAMI_EMAIL or not PRENOTAMI_PASSWORD:
        logger.error("Please set PRENOTAMI_EMAIL and PRENOTAMI_PASSWORD in your .env file.")
        return

    logger.info("Slot checker bot started.")

    profile_dir = os.path.join(os.path.dirname(__file__), "profile")
    logger.info("Launching CloakBrowser...")

    context = launch_persistent_context(profile_dir, headless=False, humanize=True)
    logger.info("CloakBrowser launched.")
    page = context.pages[0] if context.pages else context.new_page()

    page.on("console", lambda msg: logger.debug(f"[browser console] {msg.type}: {msg.text}"))
    page.on("pageerror", lambda err: logger.warning(f"[browser error] {err}"))
    page.on("framenavigated", lambda frame: logger.info(f"[browser nav] {frame.url}") if frame == page.main_frame else None)

    login_and_go_to_services(page)
    logger.info("Services page loaded. Starting polling loop.")

    # 3. Select the service — poll at random intervals between 5 and 10 minutes
    service_names = [" ".join(s.split()) for s in PRENOTAMI_SERVICE_NAMES]
    popup_text = "All appointments for this service are currently booked."
    logger.info(f"Looking for services: {service_names}")

    while True:
        POLL_INTERVAL = random.randint(5, 10) * 60  # seconds
        now = datetime.now()
        if now.weekday() >= 5:  # 5=Saturday, 6=Sunday
            logger.info(f"Weekend ({now.strftime('%A')}), skipping. Next check in {POLL_INTERVAL // 60} min...")
            time.sleep(POLL_INTERVAL)
            continue

        if not is_check_time():
            logger.info(f"Outside check window ({now.strftime('%H:%M')}), skipping. Next check in {POLL_INTERVAL // 60} min...")
            time.sleep(POLL_INTERVAL)
            continue

        logger.info("Refreshing Services page...")
        page.goto("https://prenotami.esteri.it/Services")
        time.sleep(3)

        try:
            # Collect ALL rows matching any of the service names
            matching_buttons = []
            rows = page.locator("table tr")
            for i in range(rows.count()):
                row = rows.nth(i)
                row_text = " ".join(row.inner_text().split())
                if any(sn.lower() in row_text.lower() for sn in service_names):
                    candidate = row.locator("a[href*='/Services/Booking/']").first
                    if candidate.count():
                        matching_buttons.append((row_text[:60], candidate))

            if not matching_buttons:
                logger.warning(f"Could not find any BOOK button for {service_names} — session may have expired, re-logging in...")
                login_and_go_to_services(page)
            else:
                for label, book_button in matching_buttons:
                    logger.info(f"Trying: {label!r}")
                    book_button.wait_for(state="visible", timeout=5000)
                    time.sleep(3)
                    book_button.click()
                    logger.info("Clicked Book button.")

                    # Check for "all booked" popup
                    try:
                        page.get_by_text(popup_text).wait_for(state="visible", timeout=4000)
                        # Popup appeared — no slots, just log, no TG to avoid flood
                        logger.info(f"POPUP DETECTED for {label!r} — no slots. Will retry in {POLL_INTERVAL // 60} min.")
                        page.locator(".jconfirm-buttons button").click()
                        time.sleep(2)
                        # Go back to Services to try the next counter
                        page.goto("https://prenotami.esteri.it/Services")
                        time.sleep(3)
                    except TimeoutError:
                        # No popup — slots are available, notify TG and keep monitoring
                        logger.info(f"SLOTS AVAILABLE for {label!r}")
                        counter_key = "counter_2" if "counter_2" in label.lower() else "counter_1"
                        booking_url = BOOKING_URLS[counter_key]
                        notify_telegram(f"@adzhumurat SLOTS AVAILABLE for {label!r}! Book now!\n{booking_url}")
                        # Navigate back to Services to continue monitoring
                        page.goto("https://prenotami.esteri.it/Services")
                        time.sleep(3)

        except Exception as e:
            logger.error(f"Error during service check: {e}")

        logger.info(f"Waiting {POLL_INTERVAL // 60} minutes before next check...")
        time.sleep(POLL_INTERVAL)

if __name__ == "__main__":
    main()
