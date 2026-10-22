import os
import requests
from dotenv import load_dotenv
from scripts import download_audio

load_dotenv()
COLAB_URL = os.environ.get("COLAB_URL", "").rstrip("/")


def main():
    url = 'https://archive-video.granicus.com/monterey/monterey_87ad9de3-c891-4278-bce2-38fc07775587.mp4'
    os.makedirs('output', exist_ok=True)
    download_audio(url=url, output_path='output/output')

    with open('output/output.mp3', 'rb') as f:
        response = requests.post(f"{COLAB_URL}/transcribe", files={"file": f})

    print(response.json()["transcript"])


if __name__ == "__main__":
    main()
