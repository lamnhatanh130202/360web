
# Cleaned Flask Backend (scaffold)

This folder is an auto-generated cleaned scaffold for your project's Flask backend.
It includes:
- `app.py` : minimal, well-structured Flask app with in-memory CRUD for `scenes`.
- `firebase_init.py` : template helper to initialize `firebase_admin` (optional).
- `requirements.txt` : minimal dependencies.

## How to run (Windows PowerShell)
```powershell
py -3 -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py
```
Open http://127.0.0.1:5000/ to check health endpoint.

## Integration notes
- Replace the in-memory `_scenes` dictionary with a persistent DB (Firestore / Realtime DB / SQL).
- For Firebase server usage, create a Service Account JSON and set environment variable:
  ```powershell
  $env:SERVICE_ACCOUNT="C:\path\to\serviceAccountKey.json"
  ```
- Use `firebase_init.init_firebase()` to initialize Firestore client.

## What I inspected from your uploaded project
- Found 6090 files.
- Possible app-like Python files (first 10 found): ['360web/admin-api/venv/Lib/site-packages/flask/app.py', '360web/admin-api/venv/Lib/site-packages/flask/wrappers.py', '360web/admin-api/venv/Lib/site-packages/flask/__main__.py', '360web/admin-api/venv/Lib/site-packages/flask/sansio/app.py', '360web/admin-api/venv/Lib/site-packages/pip/__main__.py', '360web/admin-api/venv/Lib/site-packages/pip/_internal/main.py', '360web/admin-api/venv/Lib/site-packages/pip/_internal/cli/main.py', '360web/admin-api/venv/Lib/site-packages/pip/_internal/cli/main_parser.py', '360web/admin-api/venv/Lib/site-packages/pip/_internal/utils/appdirs.py', '360web/admin-api/venv/Lib/site-packages/pip/_vendor/cachecontrol/filewrapper.py']
- Requirements file detected: None found

I packaged a cleaned backend scaffold in this folder. Download the zip below.

