import importlib.util
from pathlib import Path
import tempfile
import unittest
import uuid
import threading
from http.client import HTTPConnection

spec = importlib.util.spec_from_file_location('bridge', Path(__file__).parents[1] / 'local-print' / 'bridge.py')
b = importlib.util.module_from_spec(spec); spec.loader.exec_module(b)

class FakePrinter:
    def __init__(self): self.sent = []
    def send(self, payload): self.sent.append(payload); return 17

class BridgeTests(unittest.TestCase):
    def data(self, **kwargs): return dict(request_id=str(uuid.uuid4()), lines=['HELADOS ALASKA', 'TOTAL $18.000'], **kwargs)
    def test_drawer_exact_bytes(self):
        self.assertEqual(b.build_payload(self.data(), True), bytes([27,112,0,50,250]))
    def test_cash_print_pulses_once(self):
        payload = b.build_payload(self.data(open_drawer=True))
        self.assertEqual(payload.count(b.DRAWER_PULSE), 1)
        self.assertTrue(payload.endswith(b.DRAWER_PULSE))
    def test_copy_has_no_drawer_or_cutter(self):
        payload = b.build_payload(self.data(open_drawer=False))
        self.assertNotIn(b.DRAWER_PULSE, payload)
        self.assertNotIn(b'\x1dV', payload)
    def test_rejects_control_codes_and_oversize(self):
        for lines in [['text\x1bp'], ['x'*43], ['x']*501, [], ['é']]:
            data=self.data(); data['lines']=lines
            with self.assertRaises(ValueError): b.build_payload(data)
    def test_request_requires_uuid_and_boolean(self):
        for data in [dict(request_id='bad',lines=['OK']), self.data(open_drawer='yes')]:
            with self.assertRaises(ValueError): b.build_payload(data)
    def test_dedup_survives_restart_and_rejects_mutation(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'jobs.sqlite'; store=b.JobStore(path); printer=FakePrinter(); key=str(uuid.uuid4())
            self.assertEqual(store.send(key,b'one',printer),17); store.db.close()
            store=b.JobStore(path)
            self.assertEqual(store.send(key,b'one',printer),17)
            self.assertEqual(printer.sent,[b'one'])
            with self.assertRaises(ValueError): store.send(key,b'two',printer)
            store.db.close()
    def test_uncertain_delivery_never_replayed(self):
        store=b.JobStore(':memory:'); key=str(uuid.uuid4())
        class Failed:
            def send(self,payload): raise OSError('offline')
        with self.assertRaises(OSError): store.send(key,b'test',Failed())
        printer=FakePrinter()
        with self.assertRaises(RuntimeError): store.send(key,b'test',printer)
        self.assertEqual(printer.sent,[]); store.db.close()


class HttpTests(unittest.TestCase):
    def setUp(self):
        self.printer=FakePrinter()
        self.printer.check=lambda: None
        class Store:
            def send(inner, key, payload, printer): return printer.send(payload)
        self.server=b.HTTPServer(('127.0.0.1',0),b.handler_for(self.printer,'test-token',Store()))
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
    def tearDown(self):
        self.server.shutdown();self.thread.join();self.server.server_close()
    def request(self, method='POST', origin='http://127.0.0.1:5173', token='test-token', host='127.0.0.1:19151', body=None, path='/print'):
        connection=HTTPConnection('127.0.0.1',self.server.server_port,timeout=5)
        headers={'Host':host,'Origin':origin,'X-Alaskerp-Print-Token':token,'Content-Type':'application/json'}
        if body is None: body=b.json.dumps({'request_id':str(uuid.uuid4()),'lines':['TEST']})
        connection.request(method,path,body,headers)
        response=connection.getresponse();status=response.status;cors=response.getheader('Access-Control-Allow-Origin');response.read();connection.close()
        return status,cors
    def test_authentication_and_origin_required(self):
        self.assertEqual(self.request(token='wrong')[0],401)
        self.assertEqual(self.request(origin='https://untrusted.example')[0],403)
        self.assertEqual(self.request(host='attacker.example:19151')[0],403)
        self.assertEqual(self.printer.sent,[])
    def test_preflight_has_exact_origin_and_no_side_effect(self):
        self.assertEqual(self.request(method='OPTIONS',token=''),(200,'http://127.0.0.1:5173'))
        self.assertEqual(self.printer.sent,[])
    def test_valid_print_and_malformed_payload(self):
        self.assertEqual(self.request()[0],200)
        self.assertEqual(len(self.printer.sent),1)
        self.assertEqual(self.request(body='[]')[0],400)
        self.assertEqual(self.request(body='{broken')[0],400)
        self.assertEqual(len(self.printer.sent),1)
    def test_ping_does_not_access_printer(self):
        def unavailable(): raise OSError('printer not available')
        self.printer.check=unavailable
        self.assertEqual(self.request(method='GET',path='/ping')[0],200)
        self.assertEqual(self.request(method='GET',path='/health')[0],503)
        self.assertEqual(self.printer.sent,[])
    def test_health_and_unknown_route(self):
        self.assertEqual(self.request(method='GET',path='/health')[0],200)
        self.assertEqual(self.request(path='/unknown')[0],404)
        self.assertEqual(self.printer.sent,[])

if __name__ == '__main__': unittest.main()
