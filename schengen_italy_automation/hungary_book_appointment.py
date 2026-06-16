import logging
import os
import random
import time
from datetime import datetime

# import requests
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

load_dotenv()

TG_BOT_TOKEN = os.getenv("TG_BOT_TOKEN")
TG_CHAT_ID = os.getenv("TG_CHAT_ID")

# Personal data — override via .env if needed
HUNGARY_NAME = os.getenv("HUNGARY_NAME", "Aleksandr Dzhumurat")
HUNGARY_DOB = os.getenv("HUNGARY_DOB", "04/02/1991")
HUNGARY_APPLICANTS = os.getenv("HUNGARY_APPLICANTS", "2")
HUNGARY_PHONE = os.getenv("HUNGARY_PHONE", "+381629437111")
HUNGARY_EMAIL = os.getenv("HUNGARY_EMAIL", "al.dzhumurat@gmail.com")
HUNGARY_PASSPORT = os.getenv("HUNGARY_PASSPORT", "767630973")
HUNGARY_CITIZENSHIP = os.getenv("HUNGARY_CITIZENSHIP", "Russian federation")
HUNGARY_RESIDENCE_PERMIT = os.getenv("HUNGARY_RESIDENCE_PERMIT", "0402991660155")

BOOKING_URL = "https://konzinfobooking.mfa.gov.hu/"

CHECK_START = (9, 0)   # 09:00
CHECK_END = (15, 30)   # 15:30


def notify_telegram(text: str) -> None:
    logger.info(f"[TG DISABLED] {text}")
    # if TG_BOT_TOKEN and TG_CHAT_ID:
    #     url = f"https://api.telegram.org/bot{TG_BOT_TOKEN}/sendMessage"
    #     requests.post(url, json={"chat_id": TG_CHAT_ID, "text": text})
    # else:
    #     logger.warning("Telegram not configured (TG_BOT_TOKEN / TG_CHAT_ID missing).")


def is_check_time() -> bool:
    now = datetime.now().time()
    start = datetime(*datetime.now().timetuple()[:3], *CHECK_START).time()
    end = datetime(*datetime.now().timetuple()[:3], *CHECK_END).time()
    return start <= now <= end


def fill_and_check_slots(page) -> bool:
    """
    Fill the booking form and check if slots are available.
    Returns True if slots are available, False if fully booked.
    """
    logger.info("Navigating to Hungary booking page...")
    page.goto(BOOKING_URL)
    time.sleep(3)

    # --- Step 1: Select location → Serbia - Belgrade ---
    # Items start hidden; search unhides matching ones. Must click search input before filling.
    # Then click label (which checks the radio) AND click the radio directly — matching recording.
    logger.info("Selecting location: Serbia - Belgrade...")
    try:
        page.locator("#label1 > button").click()
        modal = page.locator("#modal2")
        modal.wait_for(state="visible", timeout=8000)
        time.sleep(1)
        search = modal.locator("input[type='text']")
        search.click()
        search.fill("ser")
        time.sleep(1)
        label = modal.locator("label[for='22c5017f-589b-4e30-8347-cc2226fb4572']")
        label.wait_for(state="visible", timeout=5000)
        label.click()  # clicking label checks the radio and closes the modal
        time.sleep(1)
        logger.info("Location selected.")
    except Exception as e:
        logger.error(f"Failed to select location: {e}")
        return False

    # --- Step 2: Select type of application → Visa application (Schengen visa- type 'C') ---
    logger.info("Selecting application type: Visa application (Schengen visa- type 'C')...")
    try:
        page.locator("#label3 > button").click()
        modal_cases = page.locator("#modalCases")
        modal_cases.wait_for(state="visible", timeout=8000)
        time.sleep(1)
        search = modal_cases.locator("input[type='text']")
        search.click()
        search.fill("sch")
        time.sleep(1)
        label = modal_cases.locator("label[for='af7c88ac-ab10-4c60-b911-c2245c0eb025']")
        label.wait_for(state="visible", timeout=5000)
        label.click()  # clicking label checks the checkbox; modal stays open until Save
        time.sleep(1)
        logger.info("Application type selected.")
    except Exception as e:
        logger.error(f"Failed to select application type: {e}")
        return False

    # --- Step 3: Save selection ---
    logger.info("Saving selection...")
    try:
        page.locator("#foglalasi-adatok button.btn-success").click()
        time.sleep(2)
        logger.info("Selection saved.")
    except Exception as e:
        logger.error(f"Failed to save selection: {e}")
        return False

    # --- Step 4: Fill personal details ---
    # Use stable #id selectors (unique per page). Only "Re-enter email" uses XPath
    # because its UUID-based id starts with a digit and can't be CSS-escaped reliably.
    try:
        logger.info(f"Filling Name: {HUNGARY_NAME}")
        page.locator("#label4").fill(HUNGARY_NAME)
        time.sleep(0.5)
        logger.info(f"Filling Date of birth: {HUNGARY_DOB}")
        page.locator("#birthDate").fill(HUNGARY_DOB)
        time.sleep(0.5)
        logger.info(f"Filling Number of applicants: {HUNGARY_APPLICANTS}")
        page.locator("#label6").fill(HUNGARY_APPLICANTS)
        time.sleep(0.5)
        logger.info(f"Filling Phone: {HUNGARY_PHONE}")
        page.locator("#label9").fill(HUNGARY_PHONE)
        time.sleep(0.5)
        logger.info(f"Filling Email: {HUNGARY_EMAIL}")
        page.locator("#label10").fill(HUNGARY_EMAIL)
        time.sleep(0.5)
        logger.info("Filling Email (confirm)")
        page.get_by_label("Re-enter the email address").fill(HUNGARY_EMAIL)
        time.sleep(0.5)
        logger.info(f"Filling Passport: {HUNGARY_PASSPORT}")
        page.locator("#label1000").fill(HUNGARY_PASSPORT)
        time.sleep(0.5)
        logger.info(f"Filling Citizenship: {HUNGARY_CITIZENSHIP}")
        page.locator("#label1001").fill(HUNGARY_CITIZENSHIP)
        time.sleep(0.5)
        logger.info(f"Filling Residence permit: {HUNGARY_RESIDENCE_PERMIT}")
        page.locator("#label1002").fill(HUNGARY_RESIDENCE_PERMIT)
        time.sleep(0.5)
        logger.info("Personal details filled.")
    except Exception as e:
        logger.error(f"Failed to fill personal details: {e}")
        return False

    # --- Step 5: Accept checkboxes ---
    logger.info("Accepting terms...")
    try:
        page.locator("#slabel13").click()
        time.sleep(0.5)
        page.locator("#label13").click()
        time.sleep(0.5)
        logger.info("Terms accepted.")
    except Exception as e:
        logger.error(f"Failed to accept terms: {e}")
        return False

    # --- Step 6: Click "Select date »" and check for availability ---
    logger.info("Clicking 'Select date »'...")
    try:
        page.locator("div.bg1 div.mt-3 button").click()
        time.sleep(3)
    except Exception as e:
        logger.error(f"Failed to click 'Select date': {e}")
        return False

    # If a modal with "OK »" appears → no slots available
    # xpath from recording: //*[@id="Torles"]/div/div/div[2]/button
    try:
        ok_btn = page.locator("#Torles button")
        ok_btn.wait_for(state="visible", timeout=4000)
        # Try to read the modal body text for logging
        try:
            modal_text = page.locator("#Torles .modal-body").inner_text(timeout=2000).strip()
        except Exception:
            modal_text = "We inform you that there are currently no appointments available."
        logger.info(f"No slots modal: {modal_text}")
        ok_btn.click()
        time.sleep(1)
        return False
    except TimeoutError:
        # No "OK »" modal → calendar/slots are available
        logger.info("SLOTS AVAILABLE — no blocking modal detected!")
        return True


def main():
    logger.info("Hungary slot checker bot started.")

    profile_dir = os.path.join(os.path.dirname(__file__), "profile_hungary")
    logger.info("Launching CloakBrowser...")

    context = launch_persistent_context(profile_dir, headless=False, humanize=True)
    logger.info("CloakBrowser launched.")
    page = context.pages[0] if context.pages else context.new_page()

    page.on("console", lambda msg: logger.debug(f"[browser console] {msg.type}: {msg.text}"))
    page.on("pageerror", lambda err: logger.warning(f"[browser error] {err}"))
    page.on("framenavigated", lambda frame: logger.info(f"[browser nav] {frame.url}") if frame == page.main_frame else None)

    logger.info("Starting polling loop.")

    while True:
        POLL_INTERVAL = random.randint(5, 10) * 60  # seconds
        now = datetime.now()

        if now.weekday() >= 5:  # Saturday, Sunday
            logger.info(f"Weekend ({now.strftime('%A')}), skipping. Next check in {POLL_INTERVAL // 60} min...")
            time.sleep(POLL_INTERVAL)
            continue

        if not is_check_time():
            logger.info(f"Outside check window ({now.strftime('%H:%M')}), skipping. Next check in {POLL_INTERVAL // 60} min...")
            time.sleep(POLL_INTERVAL)
            continue

        try:
            slots_available = fill_and_check_slots(page)
            if slots_available:
                notify_telegram(f"@adzhumurat HUNGARY SLOTS AVAILABLE! Book now!\n{BOOKING_URL}")
            else:
                logger.info("No slots available. Waiting 15 minutes before next check...")
                time.sleep(15 * 60)
                continue
        except Exception as e:
            logger.error(f"Error during slot check: {e}")

        logger.info(f"Waiting {POLL_INTERVAL // 60} minutes before next check...")
        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
