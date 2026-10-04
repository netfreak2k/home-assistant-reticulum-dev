import ast
import concurrent.futures
import contextlib
import importlib.util
import io
import json
import pathlib
import sys
import tempfile
import threading
import time
import types

ROOT = pathlib.Path(__file__).resolve().parents[1]
WEB = ROOT / 'reticulum_dev/rootfs/opt/reticulum-web/server.py'
NODE = ROOT / 'reticulum_dev/rootfs/opt/reticulum-node/node.py'
# Only bypass the unavailable QR dependency; no fake Reticulum connection.
for name in ('qrcode', 'qrcode.image', 'qrcode.image.svg'):
    sys.modules[name] = types.ModuleType(name)
spec = importlib.util.spec_from_file_location('audit_server', WEB)
web = importlib.util.module_from_spec(spec)
spec.loader.exec_module(web)
assert isinstance(web.MESSENGER_READ_STATE, pathlib.Path), 'read-state path must be defined'

with tempfile.TemporaryDirectory() as td:
    temp = pathlib.Path(td)
    def mapped_path(value):
        value = str(value)
        if value.startswith('/config/') or value.startswith('/homeassistant/'):
            return temp / value.lstrip('/')
        return pathlib.Path(value)
    web.Path = mapped_path
    web.MESSENGER_READ_STATE = temp / 'reads.json'
    peer = 'a' * 32
    assert web.set_messenger_contact_alias(peer, 'Testkontakt')['ok']
    assert web.get_messenger_contacts()['contacts'][0]['display_name'] == 'Testkontakt'
    assert not web.set_messenger_contact_alias('x' * 32, 'bad')['ok']
    assert web.mark_messenger_read(peer)['ok']
    assert peer in web.load_messenger_read_state()
    print('contacts/save/reload/validation/read: PASS')

    def run_read(i):
        try:
            return web.mark_messenger_read(f'{i:032x}')
        except Exception as e:
            return {'ok': False, 'error': str(e)}
    web.MESSENGER_READ_STATE.write_text('{}')
    with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
        results = list(pool.map(run_read, range(1, 41)))
    count = len(web.load_messenger_read_state())
    print('concurrent read markers:', count, '/ 40')
    read_ok = count == 40 and all(r['ok'] for r in results)

    errors = []
    ns = {'json': json, 'time': time, 'Path': pathlib.Path, 'threading': threading,
          'RNS': types.SimpleNamespace(LOG_ERROR=1, log=lambda *a: errors.append(a)),
          'LXMF_OUTBOX_FILE': temp / 'outbox.json', 'LXMF_OUTBOX_LIMIT': 200,
          'LXMF_INBOX_FILE': temp / 'inbox.json', 'LXMF_INBOX_LIMIT': 200,
          'LXMF_OUTBOX_LOCK': threading.RLock(), 'LXMF_INBOX_LOCK': threading.RLock(), 'state': {}}
    parsed = ast.parse(NODE.read_text())
    names = {'append_lxmf_outbox', 'update_lxmf_outbox_status', '_read_lxmf_inbox',
             '_write_lxmf_inbox', '_lxmf_text', 'lxmf_delivery_callback'}
    selected = [n for n in parsed.body if isinstance(n, ast.FunctionDef) and n.name in names]
    exec(compile(ast.Module(body=selected, type_ignores=[]), str(NODE), 'exec'), ns)
    ns['LXMF_OUTBOX_FILE'].write_text('[]')
    with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
        list(pool.map(lambda i: ns['append_lxmf_outbox']({'message_id': str(i)}), range(40)))
    outbox = json.loads(ns['LXMF_OUTBOX_FILE'].read_text())
    print('concurrent outbox writes:', len(outbox), '/ 40; errors:', len(errors))
    outbox_ok = len(outbox) == 40 and not errors
    if outbox_ok:
        with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
            list(pool.map(lambda i: ns['update_lxmf_outbox_status'](str(i), 'delivered'), range(40)))
        outbox_ok = all(x.get('delivery_status') == 'delivered' for x in json.loads(ns['LXMF_OUTBOX_FILE'].read_text()))
        print('concurrent delivery updates:', 'PASS' if outbox_ok else 'FAIL')
    ns['LXMF_INBOX_FILE'].write_text('[]')
    with contextlib.redirect_stdout(io.StringIO()) as output:
        with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
            list(pool.map(lambda i: ns['lxmf_delivery_callback'](types.SimpleNamespace(
                source_hash=b'a'*16, message_id=f'{i:032x}', content='hello', title='', timestamp=1)), range(40)))
    inbox = json.loads(ns['LXMF_INBOX_FILE'].read_text())
    print('concurrent inbox writes:', len(inbox), '/ 40; errors:', output.getvalue().count('LXMF RX ERROR'))
    inbox_ok = len(inbox) == 40
    with contextlib.redirect_stdout(io.StringIO()):
        ns['lxmf_delivery_callback'](types.SimpleNamespace(source_hash=b'a'*16, message_id=f'{0:032x}', content='hello', title='', timestamp=1))
    assert len(json.loads(ns['LXMF_INBOX_FILE'].read_text())) == len(inbox), 'duplicate delivery was not rejected'
    print('duplicate incoming delivery: PASS')
    if not (read_ok and outbox_ok and inbox_ok):
        sys.exit(1)
print('storage regression checks: PASS')
