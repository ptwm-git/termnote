"""Local-only PTY bridge. Output is durable before it is acknowledged to Obsidian.

Protocol: first stdin line is configuration; subsequent lines are write/resize/stop.
stdout contains journal events. Raw keyboard input is never journaled.
"""
import base64
import codecs
import datetime
import errno
import json
import os
import select
import signal
import struct
import subprocess
import sys
import threading
import time


def input_lines():
    """Unbuffered input avoids a daemon holding Python's BufferedReader at shutdown."""
    pending = bytearray()
    while True:
        chunk = os.read(0, 65536)
        if not chunk:
            return
        pending.extend(chunk)
        while b'\n' in pending:
            end = pending.index(b'\n')
            line = bytes(pending[:end])
            del pending[:end + 1]
            yield line


class UnixTerminal:
    def __init__(self, config):
        import fcntl
        import termios
        self.master, slave = os.openpty()
        self.fcntl, self.termios = fcntl, termios
        self.resize(config.get('cols', 100), config.get('rows', 30))
        env = dict(os.environ, TERM='xterm-256color', COLORTERM='truecolor')
        env.pop('ELECTRON_RUN_AS_NODE', None)
        env.setdefault('LANG', 'en_US.UTF-8')
        try:
            self.process = subprocess.Popen(
                [config['executable'], *config.get('args', [])],
                stdin=slave, stdout=slave, stderr=slave,
                cwd=config['cwd'], env=env, start_new_session=True,
                preexec_fn=lambda: fcntl.ioctl(0, termios.TIOCSCTTY, 0),
                close_fds=True)
        except BaseException:
            os.close(self.master)
            raise
        finally:
            os.close(slave)
        self.pid = self.process.pid

    def resize(self, cols, rows):
        self.fcntl.ioctl(self.master, self.termios.TIOCSWINSZ,
                         struct.pack('HHHH', rows, cols, 0, 0))

    def read(self):
        if select.select([self.master], [], [], 0.1)[0]:
            try:
                return os.read(self.master, 65536)
            except OSError as exc:
                if exc.errno == errno.EIO:
                    return b''
                raise
        return None

    def write(self, data):
        payload = data.encode('utf-8')
        while payload:
            count = os.write(self.master, payload)
            payload = payload[count:]

    def stop(self):
        # Signal the entire terminal process group, including agents spawned by a shell.
        for sig in (signal.SIGTERM, signal.SIGKILL):
            try:
                os.killpg(self.pid, sig)
            except ProcessLookupError:
                return
            if sig == signal.SIGTERM:
                time.sleep(0.3)

    def exit_code(self):
        try:
            return self.process.wait(timeout=1)
        except subprocess.TimeoutExpired:
            self.stop()
            return self.process.wait(timeout=2)

    def close(self):
        self.stop()
        os.close(self.master)


class WindowsTerminal:
    def __init__(self, config):
        try:
            from winpty import PtyProcess
        except ImportError as exc:
            raise RuntimeError('当前 Python 缺少 pywinpty：请用同一解释器运行 -m pip install pywinpty') from exc
        self.job = windows_job()
        # Configure the new console itself before starting the user's program.
        # PYTHONIOENCODING alone cannot change ConPTY's byte-output code page.
        bootstrap = ('import ctypes,subprocess,sys,signal;'
                     'ctypes.windll.kernel32.SetConsoleCP(65001);'
                     'ctypes.windll.kernel32.SetConsoleOutputCP(65001);'
                     'p=subprocess.Popen(sys.argv[1:]);'
                     'signal.signal(signal.SIGINT,signal.SIG_IGN);'
                     'sys.exit(p.wait())')
        self.process = PtyProcess.spawn(
            [sys.executable, '-u', '-c', bootstrap, config['executable'], *config.get('args', [])], cwd=config['cwd'],
            env=dict(os.environ, TERM='xterm-256color', COLORTERM='truecolor'),
            dimensions=(config.get('rows', 30), config.get('cols', 100)), backend=1)
        self.pid = self.process.pid

    def resize(self, cols, rows):
        self.process.setwinsize(rows, cols)

    def read(self):
        if select.select([self.process.fileobj], [], [], 0.1)[0]:
            try:
                return self.process.read(65536).encode('utf-8')
            except EOFError:
                return b''
        return None

    def write(self, data):
        self.process.write(data)

    def stop(self):
        # taskkill /T also ends children that the shell launched, without a shell string.
        if self.process.isalive():
            subprocess.run(['taskkill', '/PID', str(self.pid), '/T', '/F'],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                           creationflags=0x08000000, timeout=5, check=False)

    def exit_code(self):
        return self.process.exitstatus or 0

    def close(self):
        self.stop()
        self.process.close(force=True)


class Journal:
    def __init__(self, path):
        os.makedirs(os.path.dirname(path), mode=0o700, exist_ok=True)
        self.seq = 0
        # Repair a partial trailing write before appending on a failed-start retry.
        if os.path.exists(path):
            valid = 0
            with open(path, 'rb') as stream:
                for line in stream:
                    try:
                        item = json.loads(line)
                        self.seq = max(self.seq, item['seq'])
                        valid = stream.tell()
                    except (ValueError, KeyError):
                        break
            with open(path, 'r+b') as stream:
                stream.truncate(valid)
        self.file = open(path, 'ab', buffering=0)
        if os.name != 'nt':
            os.chmod(path, 0o600)
        self.lock = threading.Lock()

    def emit(self, kind, **payload):
        with self.lock:
            self.seq += 1
            event = dict(type=kind, seq=self.seq,
                         time=datetime.datetime.now(datetime.timezone.utc).isoformat(), **payload)
            line = (json.dumps(event, ensure_ascii=True) + '\n').encode('utf-8')
            remaining = memoryview(line)
            while remaining:
                written = self.file.write(remaining)
                if not written:
                    raise OSError('日志未能完整写入')
                remaining = remaining[written:]
            os.fsync(self.file.fileno())
            sys.stdout.buffer.write(line)
            sys.stdout.buffer.flush()


def check():
    if sys.version_info < (3, 9):
        raise RuntimeError('需要 Python 3.9 或更高版本')
    if os.name == 'nt':
        import winpty  # noqa: F401
    else:
        import pty  # noqa: F401
    print(json.dumps(dict(ok=True, python=sys.executable, version=sys.version.split()[0],
                          backend='ConPTY / pywinpty' if os.name == 'nt' else 'Unix PTY')))


def service():
    """Own a private Agent server; parent-pipe EOF always cleans up its process tree."""
    incoming = input_lines()
    config = json.loads(next(incoming).decode('utf-8'))
    # The wrapper owns the Windows job before creating any children. The OS closes
    # its non-inherited handle on wrapper death and terminates every descendant.
    job = windows_job() if os.name == 'nt' else None
    env = dict(os.environ, **config.get('env', {}))
    env.pop('ELECTRON_RUN_AS_NODE', None)
    process = subprocess.Popen([config['executable'], *config['args']],
                               cwd=config['cwd'], env=env, stdin=subprocess.DEVNULL,
                               start_new_session=os.name != 'nt')
    lock = threading.Lock()
    stopped = False

    def stop(*_):
        nonlocal stopped
        with lock:
            if stopped:
                return
            stopped = True
            if os.name == 'nt' and process.poll() is not None:
                return
            if os.name == 'nt':
                subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                               creationflags=0x08000000, timeout=5, check=False)
            else:
                for sig in (signal.SIGTERM, signal.SIGKILL):
                    try:
                        os.killpg(process.pid, sig)
                    except ProcessLookupError:
                        break
                    except PermissionError:
                        # macOS can leave an adopted zombie-only group after our
                        # successful SIGTERM. No owned live member accepts SIGKILL.
                        if sig == signal.SIGKILL and process.poll() is not None:
                            break
                        raise
                    if sig == signal.SIGTERM:
                        try:
                            process.wait(timeout=1)
                        except subprocess.TimeoutExpired:
                            pass

    def watch():
        try:
            for _ in incoming:
                pass
        finally:
            stop()

    signal.signal(signal.SIGTERM, stop)
    if os.name != 'nt':
        signal.signal(signal.SIGHUP, stop)
    threading.Thread(target=watch, daemon=True).start()
    try:
        process.wait()
    finally:
        stop()


def windows_job():
    import ctypes
    from ctypes import wintypes

    class Basic(ctypes.Structure):
        _fields_ = [('ProcessTime', ctypes.c_longlong), ('JobTime', ctypes.c_longlong),
                    ('Flags', wintypes.DWORD), ('MinWorkingSet', ctypes.c_size_t),
                    ('MaxWorkingSet', ctypes.c_size_t), ('ActiveProcesses', wintypes.DWORD),
                    ('Affinity', ctypes.c_size_t), ('Priority', wintypes.DWORD),
                    ('Scheduling', wintypes.DWORD)]

    class Extended(ctypes.Structure):
        _fields_ = [('Basic', Basic), ('IO', ctypes.c_ulonglong * 6),
                    ('ProcessMemory', ctypes.c_size_t), ('JobMemory', ctypes.c_size_t),
                    ('PeakProcessMemory', ctypes.c_size_t), ('PeakJobMemory', ctypes.c_size_t)]

    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.CreateJobObjectW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR]
    kernel.CreateJobObjectW.restype = wintypes.HANDLE
    kernel.GetCurrentProcess.restype = wintypes.HANDLE
    kernel.SetInformationJobObject.argtypes = [wintypes.HANDLE, ctypes.c_int,
                                              ctypes.c_void_p, wintypes.DWORD]
    kernel.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
    handle = kernel.CreateJobObjectW(None, None)
    limits = Extended()
    limits.Basic.Flags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
    if not handle or not kernel.SetInformationJobObject(handle, 9, ctypes.byref(limits), ctypes.sizeof(limits)):
        raise ctypes.WinError(ctypes.get_last_error())
    if not kernel.AssignProcessToJobObject(handle, kernel.GetCurrentProcess()):
        raise ctypes.WinError(ctypes.get_last_error())
    return handle  # deliberately alive until this wrapper exits


def main():
    if '--check' in sys.argv:
        check()
        return
    if '--service' in sys.argv:
        service()
        return
    incoming = input_lines()
    config = json.loads(next(incoming).decode('utf-8'))
    journal = Journal(config['journal'])
    terminal = None
    stopping = threading.Event()
    try:
        terminal = (WindowsTerminal if os.name == 'nt' else UnixTerminal)(config)
        if os.name != 'nt':
            # A host fallback SIGTERM must also clean up the PTY process group.
            signal.signal(signal.SIGTERM, lambda *_: terminal.stop())
            signal.signal(signal.SIGHUP, lambda *_: terminal.stop())
        journal.emit('start', cols=config.get('cols', 100), rows=config.get('rows', 30),
                     executable=config['executable'], args=config.get('args', []),
                     cwd=config['cwd'], pid=terminal.pid)

        def control():
            try:
                for line in incoming:
                    message = json.loads(line.decode('utf-8'))
                    kind = message.get('type')
                    if kind == 'write':
                        terminal.write(message['data'])
                    elif kind == 'resize':
                        cols, rows = int(message['cols']), int(message['rows'])
                        if not (2 <= cols <= 1000 and 2 <= rows <= 500):
                            continue
                        terminal.resize(cols, rows)
                        journal.emit('resize', cols=cols, rows=rows)
                    elif kind == 'stop':
                        break
            except (BrokenPipeError, EOFError, OSError, ValueError):
                pass
            finally:
                stopping.set()
                terminal.stop()

        threading.Thread(target=control, daemon=True).start()
        decoder = codecs.getincrementaldecoder('utf-8')('replace')
        while True:
            raw = terminal.read()
            if raw == b'':
                break
            if raw is None:
                continue
            text = decoder.decode(raw)
            journal.emit('output', data=text, bytes=base64.b64encode(raw).decode('ascii'))
        tail = decoder.decode(b'', final=True)
        if tail:
            journal.emit('output', data=tail)
        journal.emit('exit', code=terminal.exit_code())
    except BaseException as exc:
        try:
            journal.emit('error', message=str(exc))
        except (OSError, BrokenPipeError):
            # stdout is still used to report a disk failure; no false durable acknowledgement.
            event = dict(type='error', seq=-1, time='', message='日志写入失败或连接关闭：'+str(exc))
            try:
                print(json.dumps(event), flush=True)
            except (OSError, BrokenPipeError):
                pass
    finally:
        stopping.set()
        if terminal is not None:
            terminal.close()
        journal.file.close()


if __name__ == '__main__':
    try:
        main()
    except BaseException as error:
        print(json.dumps(dict(type='error', seq=-1, time='', message=str(error))), flush=True)
        sys.exit(1)
