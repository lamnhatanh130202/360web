#!/usr/bin/env python3
"""
Entrypoint script for Flask backend
Supports hot reload in development mode and gunicorn in production
"""
import os
import sys
import base64

def main():
    # Set Google Cloud credentials.
    # Priority:
    # 1) If GOOGLE_CREDENTIALS_JSON env is provided (Render secrets), write it to a file and use it
    # 2) Else if GOOGLE_APPLICATION_CREDENTIALS already set, keep it
    # 3) Else fall back to local file backend/keys/google-tts-key.json
    creds_json = os.environ.get("GOOGLE_CREDENTIALS_JSON", "").strip()
    creds_b64 = os.environ.get("GOOGLE_CREDENTIALS_JSON_BASE64", "").strip()
    if creds_json or creds_b64:
        # Ensure target directory exists
        target_dir = os.path.join(os.path.dirname(__file__), "backend", "keys")
        # If running inside backend folder already, fallback to keys under current dir
        if not os.path.isdir(target_dir):
            target_dir = os.path.join(os.path.dirname(__file__), "keys")
        os.makedirs(target_dir, exist_ok=True)
        key_path = os.path.join(target_dir, "google-tts-key.json")
        try:
            with open(key_path, "w", encoding="utf-8") as f:
                if creds_json:
                    f.write(creds_json)
                else:
                    # Decode base64 content to JSON
                    decoded = base64.b64decode(creds_b64)
                    f.write(decoded.decode("utf-8"))
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = key_path
            print(f"✓ Wrote Google credentials from env to {key_path}")
        except Exception as e:
            print(f"✗ Failed to write GOOGLE_CREDENTIALS_JSON to file: {e}")
    elif "GOOGLE_APPLICATION_CREDENTIALS" not in os.environ:
        key_path = os.path.join(os.path.dirname(__file__), "keys", "google-tts-key.json")
        if os.path.exists(key_path):
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = key_path
            print(f"✓ Set GOOGLE_APPLICATION_CREDENTIALS to {key_path}")
        else:
            print(f"⚠ Google key not found at {key_path}")
    
    flask_env = os.environ.get("FLASK_ENV", "production")
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    
    if flask_env == "development" or debug:
        # Development mode: Use Flask dev server with hot reload
        print("=" * 50)
        print("🚀 Starting Flask in DEVELOPMENT mode (hot reload enabled)")
        print("=" * 50)
        
        from app import app
        port = int(os.environ.get("PORT", 5000))
        app.run(
            host="0.0.0.0",
            port=port,
            debug=True,
            use_reloader=True,
            use_debugger=True,
            reloader_type="stat"  # Use stat watcher for better file watching
        )
    else:
        # Production mode: Use gunicorn
        print("=" * 50)
        print("🏭 Starting Flask in PRODUCTION mode (gunicorn)")
        print("=" * 50)
        
        import subprocess
        
        # Số workers: mặc định 4, có thể override bằng env
        workers = int(os.environ.get("GUNICORN_WORKERS", "4"))
        timeout = os.environ.get("GUNICORN_TIMEOUT", "120")
        bind = os.environ.get("GUNICORN_BIND", "0.0.0.0:5000")
        threads = int(os.environ.get("GUNICORN_THREADS", "1"))  # Threads per worker
        
        cmd = [
            "gunicorn",
            "--bind", bind,
            "app:app",
            "--workers", str(workers),
            "--threads", str(threads),
            "--worker-class", "sync",  # Dùng sync worker đơn giản hơn
            "--timeout", str(timeout),
            "--access-logfile", "-",
            "--error-logfile", "-",
            "--log-level", "info"
        ]
        
        # Execute gunicorn
        sys.exit(subprocess.run(cmd).returncode)

if __name__ == "__main__":
    main()

