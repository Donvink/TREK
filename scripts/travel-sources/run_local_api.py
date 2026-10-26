"""Restart the existing private prototype database and account without /tmp helpers."""
import json
import os
from pathlib import Path


def main():
    root = Path(__file__).resolve().parents[2]
    runtime = root / '.local/travel-sources'
    credentials = runtime / 'local-account.json'
    if not credentials.is_file():
        raise SystemExit('Local account file missing; see docs/travel-prototype-local-setup.md')
    if not (runtime / 'prototype.sqlite').is_file():
        raise SystemExit('Prototype database missing; restore the local checkpoint first')
    if not (root / 'server/dist/index.js').is_file():
        raise SystemExit('Build shared, then server, before starting the prototype API')
    account = json.loads(credentials.read_text())
    env = os.environ.copy()
    env.update({
        'ADMIN_EMAIL': account['email'], 'ADMIN_PASSWORD': account['password'],
        'TREK_DB_FILE': str(runtime / 'prototype.sqlite'), 'HOST': '127.0.0.1',
        'PORT': '3001', 'NODE_ENV': 'development', 'COOKIE_SECURE': 'false',
        'APP_URL': 'http://127.0.0.1:5173',
    })
    print('Starting prototype API on 127.0.0.1:3001; log: .local/travel-sources/api.log', flush=True)
    log = os.open(str(runtime / 'api.log'), os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
    os.dup2(log, 1)
    os.dup2(log, 2)
    os.close(log)
    os.chdir(root / 'server')
    os.execvpe('node', ['node', '--require', 'tsconfig-paths/register', 'dist/index.js'], env)


if __name__ == '__main__':
    main()
