import os
try:
    import firebase_admin
    from firebase_admin import credentials, firestore, db
except Exception:
    firebase_admin = None

def init_firebase(service_account_path=None, db_url=None):
    if not firebase_admin:
        raise RuntimeError("firebase_admin not installed. pip install firebase-admin")
    if service_account_path is None:
        service_account_path = os.environ.get("SERVICE_ACCOUNT")
    if not service_account_path or not os.path.exists(service_account_path):
        raise FileNotFoundError("Service account JSON not found. Set SERVICE_ACCOUNT env var or provide path.")
    cred = credentials.Certificate(service_account_path)
    opts = {}
    if db_url:
        opts['databaseURL'] = db_url
    firebase_admin.initialize_app(cred, opts)
    # Initialize Firestore / Realtime DB clients as needed
    fs = firestore.client()
    return {"firestore": fs}