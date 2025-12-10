import json, sys, traceback
p = 'd:/website/360web/backend/scenes.json'
try:
    with open(p, 'r', encoding='utf-8') as f:
        json.load(f)
    print('OK: scenes.json is valid JSON')
except Exception as e:
    print('INVALID JSON:', e)
    traceback.print_exc()
    sys.exit(2)
