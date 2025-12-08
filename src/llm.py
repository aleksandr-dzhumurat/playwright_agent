import os
from dataclasses import dataclass

import backoff
from google.genai import Client, types

GEMINI_API_KEY = os.environ['GEMINI_API_KEY']
g_client = None

@dataclass
class GenAIResponse:
    text: str
    total_tokens: str
    model: str

def get_client():
    global g_client
    if g_client is None:
        g_client = Client(api_key=os.environ["GEMINI_API_KEY"])
    return g_client

@backoff.on_exception(backoff.expo, RuntimeError)
def generate(api_client, user_prompt, system_prompt, model='gemini-2.0-flash-lite', image_data=None):
    """model: gemini-1.5-flash, gemini-2.0-flash-001"""
    user_input = [
        types.Part(text=user_prompt),
    ]
    # if image_data is not None:
    #     user_input.append(
    #         types.Part(
    #             inline_data=types.Blob(
    #                 mime_type=image_data['type'],  # or "image/png"
    #                 data=image_data['data']
    #             )
    #         )
    #     )
    dialog_contents = [
        types.Content(
            role="user",
            parts=user_input
        )
    ]
    response = api_client.models.generate_content(
        model=model,
        contents=dialog_contents,
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=0.3,
        ),
    )
    response = GenAIResponse(text=response.text, total_tokens=response.usage_metadata.total_token_count, model=model)
    return response