import ast
import concurrent.futures
import importlib.util
import json
import os
import pathlib
import sys
import tempfile
import threading
import time
import types
import urllib.error
import urllib.request
import uuid
from http.server import ThreadingHTTPServer

root = pathlib.Path(__file__).resolve().parents[1]
for name in ('qrcode', 'qrcode.image', 'qrcode.image.svg'):
    sys.modules[name] = types.ModuleType(name)
spec = importlib.util.spec_from_file_location('web', root/'reticulum_dev/rootfs/opt/reticulum-web/server.py')
web = importlib.util.module_from_spec(spec)
spec.loader.exec_module(web)
assert isinstance(web.MESSENGER_READ_STATE, pathlib.Path), 'read-state path must be defined'
with tempfile.TemporaryDirectory() as td:
    temp = pathlib.Path(td)
    def mapped(value):
        value = str(value)
        return temp/value.lstrip('/') if value.startswith(('/config/', '/homeassistant/', '/data/')) else pathlib.Path(value)
    web.Path = mapped
    web.STATIC_DIR = root/'reticulum_dev/rootfs/opt/reticulum-web/static'
    web.MESSENGER_READ_STATE = temp/'reads.json'
    web.get_addon_options = lambda: {'propagation_enabled': True, 'propagation_node': 'd'*32}
    web.build_status_snapshot = lambda: {'online': True, 'interfaces': [], 'rnstatus': 'fixture'}
    web.Handler.log_message = lambda *a: None
    base = mapped('/config/reticulum/homeassistant-node')
    base.mkdir(parents=True)
    (base/'state.json').write_text(json.dumps({'ok': True, 'identity_hash': 'a'*32,
       'lxmf_destination_hash': 'b'*32, 'lxmf_propagation_enabled': True,
       'lxmf_propagation_node': 'd'*32, 'lxmf_propagation_sync_result': 'COMPLETE'}))
    (base/'identity').write_bytes(b'fixture')
    server = ThreadingHTTPServer(('127.0.0.1', 0), web.Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    url = f'http://127.0.0.1:{server.server_port}'
    def call(path, data=None):
        req = urllib.request.Request(url+path, data=json.dumps(data).encode() if data is not None else None,
            headers={'Content-Type': 'application/json'})
        try:
            response = urllib.request.urlopen(req, timeout=3)
        except urllib.error.HTTPError as e:
            response = e
        with response:
            raw = response.read()
            return response.status, json.loads(raw) if 'application/json' in response.headers.get('Content-Type', '') else raw
    for path in ('/', '/static/messenger.js', '/static/n2k-terminal.css', '/static/assets/n2k-icons.svg',
                 '/api/status', '/api/node/identity', '/api/messenger/contacts', '/api/messenger',
                 '/api/node/lxmf/inbox', '/api/node/lxmf/outbox', '/api/propagation'):
        code, data = call(path)
        assert code == 200, (path, code)
    assert call('/static/../server.py')[0] == 403
    assert call('/static/missing.css')[0] == 404
    assert call('/api/messenger/contact', {'peer_hash': 'e'*32, 'name': 'HTTP Kontakt'})[0] == 200
    assert call('/api/messenger/contact', {'peer_hash': 'z'*32, 'name': 'bad'})[0] == 400
    assert call('/api/messenger/read', {'peer_hash': 'z'*32})[0] == 400
    assert call('/api/node/lxmf/send', {'destination_hash': 'z'*32, 'content': 'bad'})[0] == 400
    queued = {'destination_hash': 'e'*32, 'content': 'erste Nachricht'}
    first = call('/api/node/lxmf/send', queued)
    assert first[0] == 200, first
    second = call('/api/node/lxmf/send', dict(queued, content='zweite Nachricht'))
    assert second[0] == 400 and not second[1]['ok']
    queue = mapped('/homeassistant/reticulum_bridge/lxmf_outbound.json')
    assert json.loads(queue.read_text())['content'] == 'erste Nachricht'
    queue.unlink()
    # The HA service and web server compete for the same durable queue slot.
    ha_source = (root/'reticulum_dev/rootfs/opt/reticulum-ha/custom_components/reticulum/__init__.py').read_text()
    fn = next(n for n in ast.parse(ha_source).body if isinstance(n, ast.FunctionDef) and n.name == 'queue_message')
    ns = {'json': json, 'os': os, 'uuid': uuid, 'time': time, 'QUEUE_DIR': queue.parent,
          'QUEUE_FILE': queue, 'HomeAssistantError': RuntimeError}
    exec(compile(ast.Module(body=[fn],type_ignores=[]), 'ha_queue', 'exec'), ns)
    def send(i):
        if i % 2:
            return call('/api/node/lxmf/send', dict(queued, content=f'msg-{i}'))[0] == 200
        try:
            ns['queue_message']('e'*32, f'msg-{i}')
            return True
        except RuntimeError:
            return False
    with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
        accepted = sum(pool.map(send, range(40)))
    assert accepted == 1, accepted
    assert json.loads(queue.read_text())['content'].startswith('msg-')
    assert not list(queue.parent.glob('*.tmp'))
    print('HTTP routes / contact persistence / invalid hashes / atomic web+HA queue: PASS')
    server.shutdown()
    server.server_close()
