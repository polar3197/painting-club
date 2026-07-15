"""Raspberry Pi host-health metrics for the contributor "infra stats" panel.

Read live on request (pull model) — no time-series storage, no extra dependency.
The API runs in a Docker container on the Pi, but CPU/memory/load/uptime come
from /proc, which is NOT namespaced, so they reflect the HOST (the Pi). Disk is
read via a bind-mounted host path (the compose api service mounts ./src -> /src),
so it reports the Pi's SD-card filesystem, not the container overlay.

Everything is best-effort: each metric is guarded so a missing file (e.g. running
off-Linux in dev, or a Pi without a thermal sensor) yields None instead of a 500,
and `host_metrics_available` tells the client whether /proc was readable at all.
"""
import asyncio
import os
import platform
import shutil


def _read(path: str) -> str | None:
    try:
        with open(path, "r") as f:
            return f.read()
    except OSError:
        return None


def _uptime_seconds() -> int | None:
    txt = _read("/proc/uptime")
    if not txt:
        return None
    try:
        return int(float(txt.split()[0]))
    except (ValueError, IndexError):
        return None


def _cpu_temp_c() -> float | None:
    # Pi CPU temperature in millidegrees C. Absent on hosts without the sensor.
    txt = _read("/sys/class/thermal/thermal_zone0/temp")
    if not txt:
        return None
    try:
        return round(int(txt.strip()) / 1000.0, 1)
    except ValueError:
        return None


def _parse_cpu_line(stat_txt: str) -> tuple[int, int] | None:
    """From /proc/stat's aggregate 'cpu' line, return (idle, total) jiffies."""
    for line in stat_txt.splitlines():
        if line.startswith("cpu "):
            parts = [int(x) for x in line.split()[1:]]
            if len(parts) < 4:
                return None
            idle = parts[3] + (parts[4] if len(parts) > 4 else 0)  # idle + iowait
            return idle, sum(parts)
    return None


async def _cpu() -> dict:
    cores = os.cpu_count()
    try:
        load_1, load_5, load_15 = os.getloadavg()
    except (OSError, AttributeError):
        load_1 = load_5 = load_15 = None

    percent = None
    a = _read("/proc/stat")
    if a:
        first = _parse_cpu_line(a)
        # Sample twice over a short window; await (non-blocking) between reads.
        await asyncio.sleep(0.15)
        b = _read("/proc/stat")
        second = _parse_cpu_line(b) if b else None
        if first and second:
            idle_d = second[0] - first[0]
            total_d = second[1] - first[1]
            if total_d > 0:
                percent = round(100.0 * (1.0 - idle_d / total_d), 1)
    return {
        "percent": percent,
        "cores": cores,
        "load_1": round(load_1, 2) if load_1 is not None else None,
        "load_5": round(load_5, 2) if load_5 is not None else None,
        "load_15": round(load_15, 2) if load_15 is not None else None,
    }


def _meminfo_kb(meminfo: str) -> dict:
    out = {}
    for line in meminfo.splitlines():
        parts = line.split()
        if len(parts) >= 2 and parts[0].endswith(":"):
            try:
                out[parts[0][:-1]] = int(parts[1])  # value is in kB
            except ValueError:
                continue
    return out


def _memory() -> dict:
    txt = _read("/proc/meminfo")
    if not txt:
        return {"total": None, "used": None, "available": None, "percent": None}
    kb = _meminfo_kb(txt)
    total = kb.get("MemTotal")
    # MemAvailable is the kernel's own estimate (present on all Pi kernels);
    # fall back to Free+Buffers+Cached on the off chance it's missing.
    available = kb.get("MemAvailable")
    if available is None and total is not None:
        available = kb.get("MemFree", 0) + kb.get("Buffers", 0) + kb.get("Cached", 0)
    if total is None or available is None:
        return {"total": None, "used": None, "available": None, "percent": None}
    total_b = total * 1024
    avail_b = available * 1024
    used_b = total_b - avail_b
    return {
        "total": total_b,
        "used": used_b,
        "available": avail_b,
        "percent": round(100.0 * used_b / total_b, 1) if total_b else None,
    }


def _disk(path: str) -> dict:
    target = path if os.path.exists(path) else "/"
    try:
        usage = shutil.disk_usage(target)
    except OSError:
        return {"path": None, "total": None, "used": None, "free": None, "percent": None}
    return {
        "path": target,
        "total": usage.total,
        "used": usage.used,
        "free": usage.free,
        "percent": round(100.0 * usage.used / usage.total, 1) if usage.total else None,
    }


def _dir_size(path: str, max_files: int = 500_000) -> dict:
    """Recursive byte size + file count of a content directory — used for the
    Docker `static-files` volume (uploaded art / profile images), which is the
    real driver of disk growth on the Pi. Bounded by `max_files` so a runaway
    tree can't hang the request; `truncated` flags when the cap was hit."""
    if not os.path.isdir(path):
        return {"path": None, "bytes": None, "files": None, "truncated": False}
    total = 0
    files = 0
    truncated = False
    stack = [path]
    while stack:
        d = stack.pop()
        try:
            with os.scandir(d) as it:
                for entry in it:
                    try:
                        if entry.is_dir(follow_symlinks=False):
                            stack.append(entry.path)
                        elif entry.is_file(follow_symlinks=False):
                            total += entry.stat(follow_symlinks=False).st_size
                            files += 1
                            if files >= max_files:
                                truncated = True
                                stack.clear()
                                break
                    except OSError:
                        continue
        except OSError:
            continue
    return {"path": path, "bytes": total, "files": files, "truncated": truncated}


async def read_host_health(disk_path: str = "/src", content_path: str = "/app/static") -> dict:
    """Snapshot of the host (Pi) health. `disk_path` should be a bind-mounted
    host path so disk usage reflects the Pi's SD-card filesystem (which holds the
    Docker volumes). `content_path` is the mounted static-files volume — its size
    is the "people's content" footprint that fills that disk."""
    host_available = os.path.exists("/proc/stat")
    return {
        "ok": True,
        "host_metrics_available": host_available,
        "kernel": platform.release() or None,  # shared kernel == the Pi's kernel
        "uptime_seconds": _uptime_seconds(),
        "temperature_c": _cpu_temp_c(),
        "cpu": await _cpu(),
        "memory": _memory(),
        "disk": _disk(disk_path),
        # The drive the static-files volume actually lives on (the USB SSD) —
        # its own filesystem, so uploads are measured against the right disk.
        "content_disk": _disk(content_path),
        "content": _dir_size(content_path),
    }
