"""WhisperKit's local server (`whisperkit-cli serve`) as a `room-replay.js --engine`.

    python -I scripts/engines/whisperkit_engine.py --port 50060 [--language en]

The line protocol is in room-replay.js's header. Start the server first.
"""

import argparse
import http.client
import json
import os
import sys
import uuid


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=50060)
    parser.add_argument("--language", default="en")
    parser.add_argument("--model", default="tiny")
    args = parser.parse_args()
    print(json.dumps({"ready": True}), flush=True)
    for line in sys.stdin:
        if not line.strip():
            continue
        request = json.loads(line)
        try:
            with open(request["wav"], "rb") as f:
                audio = f.read()
            boundary = uuid.uuid4().hex
            head = (
                f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.wav"\r\n'
                "Content-Type: audio/wav\r\n\r\n"
            ).encode()
            fields = "".join(
                f'\r\n--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}'
                for k, v in {"model": args.model, "language": args.language, "response_format": "json"}.items()
            )
            body = head + audio + (fields + f"\r\n--{boundary}--\r\n").encode()
            connection = http.client.HTTPConnection("127.0.0.1", args.port, timeout=120)
            connection.request(
                "POST", "/v1/audio/transcriptions", body,
                {"Content-Type": f"multipart/form-data; boundary={boundary}"},
            )
            response = connection.getresponse()
            data = response.read()
            connection.close()
            if response.status != 200:
                raise RuntimeError(f"{response.status}: {data[:200]!r}")
            print(json.dumps({"id": request["id"], "text": json.loads(data).get("text", "")}), flush=True)
        except Exception as error:
            print(json.dumps({"id": request["id"], "error": repr(error)}), flush=True)


if __name__ == "__main__":
    main()
