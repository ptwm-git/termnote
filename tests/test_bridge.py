import json
import os
from pathlib import Path
import queue
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
import importlib.util
import io
from types import SimpleNamespace

BRIDGE = str(Path(__file__).resolve().parent.parent / 'bridge.py')


class Client:
    def __init__(self, directory, code):
        self.log = Path(directory) / 'events.jsonl'
        self.proc = subprocess.Popen([sys.executable, '-u', BRIDGE], stdin=subprocess.PIPE,
                                     stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.queue = queue.Queue()
        self.events = []

        def reader():
            for line in self.proc.stdout:
                self.queue.put(json.loads(line))
        self.reader = threading.Thread(target=reader, daemon=True)
        self.reader.start()
        self.send(dict(executable=sys.executable, args=['-u', '-c', code], cwd=directory,
                       journal=str(self.log), cols=80, rows=24))

    def send(self, event):
        self.proc.stdin.write((json.dumps(event) + '\n').encode())
        self.proc.stdin.flush()

    def until(self, predicate, timeout=10):
        deadline = time.monotonic() + timeout
        while not predicate(self.events):
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise AssertionError('Timed out: ' + repr(self.events))
            try:
                event = self.queue.get(timeout=remaining)
            except queue.Empty:
                raise AssertionError('No bridge event: ' + repr(self.events))
            self.events.append(event)
            # Any acknowledgement must already be a complete on-disk event.
            durable = [json.loads(line) for line in self.log.read_text().splitlines()]
            assert any(item['seq'] == event['seq'] for item in durable), event
        return self.events

    def output(self):
        return ''.join(e.get('data', '') for e in self.events if e['type'] == 'output')

    def finish(self):
        if hasattr(self, 'finished_error'):
            return self.finished_error
        if self.proc.stdin and not self.proc.stdin.closed:
            self.proc.stdin.close()
        try:
            self.proc.wait(timeout=8)
        except subprocess.TimeoutExpired:
            self.proc.kill()
            self.proc.wait(timeout=3)
        self.reader.join(timeout=2)
        error = self.proc.stderr.read().decode(errors='replace')
        self.proc.stdout.close()
        self.proc.stderr.close()
        self.finished_error = error
        return error


class BridgeTests(unittest.TestCase):
    def test_service_cleans_descendants_after_leader_exit_and_eof(self):
        for early_exit in (False, True):
            with self.subTest(early_exit=early_exit), tempfile.TemporaryDirectory() as d:
                pidfile = str(Path(d) / 'child.pid')
                child = 'import time;time.sleep(120)'
                code = ('import subprocess,sys,time,pathlib;'
                        f'p=subprocess.Popen([sys.executable,"-c",{child!r}]);'
                        f'pathlib.Path({pidfile!r}).write_text(str(p.pid));'
                        + ('time.sleep(.2)' if early_exit else 'time.sleep(120)'))
                p = subprocess.Popen([sys.executable, '-u', BRIDGE, '--service'], stdin=subprocess.PIPE,
                                     stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                try:
                    p.stdin.write((json.dumps(dict(executable=sys.executable,args=['-c',code],cwd=d))+'\n').encode())
                    p.stdin.flush()
                    for _ in range(100):
                        if Path(pidfile).exists():
                            break
                        time.sleep(.02)
                    self.assertTrue(Path(pidfile).exists())
                    pid = int(Path(pidfile).read_text())
                    if not early_exit:
                        p.stdin.close()
                    p.wait(timeout=8)
                    self.assertEqual(p.returncode, 0)
                    self.assertEqual(p.stderr.read(), b'')
                    if os.name == 'nt':
                        alive = subprocess.run(['tasklist','/FI',f'PID eq {pid}','/FO','CSV'], capture_output=True).stdout
                        self.assertNotIn(f'"{pid}"'.encode(), alive)
                    else:
                        with self.assertRaises(ProcessLookupError):
                            os.kill(pid, 0)
                finally:
                    if p.poll() is None:
                        p.kill()
                        p.wait(timeout=5)
                    for stream in (p.stdin,p.stdout,p.stderr):
                        if stream and not stream.closed:
                            stream.close()

    def test_partial_disk_write_is_completed_before_acknowledgement(self):
        spec = importlib.util.spec_from_file_location('terminal_bridge', BRIDGE)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as d:
            journal = module.Journal(str(Path(d) / 'events.jsonl'))
            actual = journal.file

            class PartialWriter:
                def write(self, data):
                    return actual.write(data[:7])

                def fileno(self):
                    return actual.fileno()

            journal.file = PartialWriter()
            output = io.BytesIO()
            with patch.object(module.sys, 'stdout', SimpleNamespace(buffer=output)):
                journal.emit('output', data='中文分段磁盘写入')
            self.assertEqual(output.getvalue(), (Path(d) / 'events.jsonl').read_bytes())
            self.assertEqual(json.loads(output.getvalue())['data'], '中文分段磁盘写入')
            actual.close()

    def test_real_tty_unicode_and_resize(self):
        with tempfile.TemporaryDirectory() as d:
            c = Client(d, 'import os;print("TTY",os.isatty(0),flush=True);x=input();print("收到:"+x,flush=True);input();print("SIZE",os.get_terminal_size(),flush=True)')
            try:
                c.until(lambda es: 'TTY True' in c.output())
                c.send(dict(type='write', data='中文输入\r'))
                c.until(lambda es: '收到:中文输入' in c.output())
                c.send(dict(type='resize', cols=101, rows=33))
                c.until(lambda es: any(e['type'] == 'resize' for e in es))
                c.send(dict(type='write', data='\r'))
                c.until(lambda es: any(e['type'] == 'exit' for e in es))
                self.assertIn('columns=101', c.output())
                self.assertIn('lines=33', c.output())
                self.assertEqual(c.finish(), '')
                self.assertEqual(c.proc.returncode, 0)
            finally:
                c.finish()

    def test_utf8_split_across_reads_and_clean_exit(self):
        with tempfile.TemporaryDirectory() as d:
            code = ('import sys,time;[(sys.stdout.write(c),sys.stdout.flush(),time.sleep(.02)) for c in "中文😀"]'
                    if os.name == 'nt' else
                    'import os,time;data="中文😀".encode();[(os.write(1,bytes([b])),time.sleep(.01)) for b in data]')
            c = Client(d, code)
            try:
                c.until(lambda es: any(e['type'] == 'exit' for e in es))
                if os.name == 'nt':
                    # ConPTY emits viewport updates; it is not a byte-transparent pipe.
                    for character in '中文😀':
                        self.assertIn(character, c.output())
                    self.assertNotIn('\ufffd', c.output())
                else:
                    self.assertEqual(c.output(), '中文😀')
                self.assertEqual(c.finish(), '')
                self.assertEqual(c.proc.returncode, 0)
            finally:
                c.finish()

    def test_eof_stops_process_tree(self):
        with tempfile.TemporaryDirectory() as d:
            c = Client(d, 'import os,time;print("PID",os.getpid(),flush=True);time.sleep(120)')
            try:
                c.until(lambda es: 'PID' in c.output())
                c.proc.stdin.close()
                c.until(lambda es: any(e['type'] == 'exit' for e in es))
                self.assertEqual(c.finish(), '')
                self.assertEqual(c.proc.returncode, 0)
            finally:
                c.finish()

    def test_three_independent_terminals(self):
        with tempfile.TemporaryDirectory() as d:
            clients = []
            try:
                for i in range(3):
                    folder = Path(d) / str(i)
                    folder.mkdir()
                    clients.append(Client(str(folder), f'import time;print("ONLY-{i}",flush=True);time.sleep(.1)'))
                for i, c in enumerate(clients):
                    c.until(lambda es: any(e['type'] == 'exit' for e in es))
                    self.assertIn(f'ONLY-{i}', c.output())
                    for j in range(3):
                        if j != i:
                            self.assertNotIn(f'ONLY-{j}', c.output())
                    self.assertEqual(c.finish(), '')
            finally:
                for c in clients:
                    c.finish()

    def test_failed_executable_is_recorded_without_orphan(self):
        with tempfile.TemporaryDirectory() as d:
            p = subprocess.run([sys.executable, '-u', BRIDGE], input=(json.dumps(dict(
                executable='definitely-no-such-agent-726153', args=[], cwd=d,
                journal=str(Path(d) / 'events.jsonl'))) + '\n').encode(), capture_output=True, timeout=10)
            events = [json.loads(line) for line in p.stdout.splitlines()]
            self.assertEqual(events[-1]['type'], 'error')
            self.assertEqual(p.stderr, b'')


if __name__ == '__main__':
    unittest.main()
