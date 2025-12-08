import logging
import os
import requests

from dotenv import load_dotenv
from telegram import Update
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

# Load environment variables from .env file
load_dotenv()

# Enable logging
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Send a message when the command /start is issued."""
    await update.message.reply_text(
        'Hi! Send me an profile description and I will found peoples from you connection list'
    )

def get_response(input_text):
    """Call search endpoint and format response."""
    search_url = "http://localhost:8002/search"

    try:
        # Make POST request to search endpoint
        response = requests.post(
            search_url,
            json={"q": input_text, "limit": 5},
            timeout=10
        )
        response.raise_for_status()

        data = response.json()
        results = data.get('results', [])

        if not results:
            return "No matching connections found."

        # Format response
        response_text = f"Found {len(results)} matching connections:\n\n"

        for i, result in enumerate(results, 1):
            name = result.get('name', 'Unknown')
            description = result.get('description', 'No description')
            url = result.get('url', '')
            score = result.get('score', 0)

            response_text += f"{i}. {name}\n"
            response_text += f"   {description}\n"
            response_text += f"   Score: {score:.2f}\n"
            response_text += f"   {url}\n\n"

        return response_text.strip()

    except requests.exceptions.ConnectionError:
        logger.error("Failed to connect to search service")
        return "Error: Search service is not running. Please start search_service.py first."
    except requests.exceptions.Timeout:
        logger.error("Search request timed out")
        return "Error: Search request timed out."
    except Exception as e:
        logger.error(f"Error calling search endpoint: {e}")
        return f"Error: {str(e)}"

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle all text messages."""
    user_message = update.message.text
    user_id = update.effective_user.id
    username = update.effective_user.username or update.effective_user.first_name

    logger.info(f"Received message from {username} (ID: {user_id}): {user_message}")

    # Get response from search service
    response = get_response(user_message)

    # Send response
    await update.message.reply_text(response)


async def error_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Log errors caused by updates."""
    logger.error(f"Update {update} caused error {context.error}")


def main():
    """Start the bot."""
    # Get token from environment variable
    token = os.getenv('TG_BOT_TOKEN')

    if not token:
        logger.error("❌ TG_BOT_TOKEN environment variable not set!")
        print("Error: Please set TG_BOT_TOKEN environment variable")
        print("Example: export TG_BOT_TOKEN='your-bot-token-here'")
        return

    logger.info("🤖 Starting Telegram bot...")

    # Create the Application
    application = Application.builder().token(token).build()

    # Register handlers
    application.add_handler(CommandHandler("start", start))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    application.add_error_handler(error_handler)

    # Start the bot
    logger.info("✅ Bot is running! Press Ctrl+C to stop.")
    application.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == '__main__':
    main()
