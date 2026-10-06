import os
import requests

account_id = os.getenv("CLOUDFLARE_ACCOUNT_ID")
api_token = os.getenv("CLOUDFLARE_API_TOKEN")

url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/@cf/runwayml/stable-diffusion-v1-5-img2img"

headers = {
    "Authorization": f"Bearer {api_token}",
    "Content-Type": "application/json",
}

payload = {
    "prompt": "A simple hand-drawn tree with two human legs growing from the bottom of the tree, preserve the original drawing",
    "strength": 0.35,
    "guidance": 7.5,
}

response = requests.post(
    url,
    headers=headers,
    json=payload,
    timeout=120,
)

print("HTTP STATUS:", response.status_code)
print("CONTENT TYPE:", response.headers.get("content-type"))
print("RESPONSE:", response.text[:2000])
