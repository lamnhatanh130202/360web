#!/usr/bin/env python3
"""
Entrypoint script for Flask backend
Supports hot reload in development mode and gunicorn in production
"""
import os
import sys

def main():
    # Set Google Cloud credentials if not already set
    if "GOOGLE_APPLICATION_CREDENTIALS" not in os.environ:
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

