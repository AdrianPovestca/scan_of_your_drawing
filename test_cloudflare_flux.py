import os
import requests

account_id = os.getenv("CLOUDFLARE_ACCOUNT_ID")
api_token = os.getenv("CLOUDFLARE_API_TOKEN")

url = (
    f"https://api.cloudflare.com/client/v4/accounts/"
    f"{account_id}/ai/run/@cf/black-forest-labs/flux-2-klein-4b"
)

headers = {
    "Authorization": f"Bearer {api_token}",
}

files = {
    "prompt": (
        None,
        "A simple hand-drawn tree with two human legs. "
        "White background, black ink drawing."
    ),
    "width": (None, "512"),
    "height": (None, "512"),
}

response = requests.post(
    url,
    headers=headers,
    files=files,
    timeout=120,
)

print("HTTP STATUS:", response.status_code)
print("CONTENT TYPE:", response.headers.get("content-type"))
print("RESPONSE:", response.text[:3000])
