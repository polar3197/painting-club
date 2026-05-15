#!/usr/bin/env bash
# Run on the Pi over SSH. Surfaces the usual suspects when a Pi dies under load:
# undervoltage, thermal throttling, OOM, SD-card I/O stalls, swap thrash,
# and container-level resource pressure.

set -u
hr() { printf '\n=== %s ===\n' "$1"; }

hr "uptime / load"
uptime

hr "model + firmware"
cat /proc/device-tree/model 2>/dev/null; echo
vcgencmd version 2>/dev/null | head -1

hr "voltage + throttling (THIS is the #1 killer)"
# Decode get_throttled. 0x0 = healthy. Bits:
#   0:  undervoltage NOW              16: undervoltage occurred since boot
#   1:  ARM freq capped NOW           17: ARM freq capped since boot
#   2:  currently throttled           18: throttled since boot
#   3:  soft temp limit NOW           19: soft temp limit since boot
vcgencmd get_throttled 2>/dev/null || echo "vcgencmd unavailable"
vcgencmd measure_volts core 2>/dev/null

hr "temperature"
vcgencmd measure_temp 2>/dev/null
# Sustained >80C = thermal throttle, >85C = hard cap.

hr "cpu freq (compare to max — capped means throttling)"
vcgencmd measure_clock arm 2>/dev/null
for f in /sys/devices/system/cpu/cpu0/cpufreq/{scaling_cur_freq,cpuinfo_max_freq,scaling_governor}; do
  [ -r "$f" ] && printf '%s = %s\n' "$f" "$(cat "$f")"
done

hr "memory + swap"
free -h
echo "--- swappiness / pressure"
cat /proc/sys/vm/swappiness 2>/dev/null
cat /proc/pressure/memory 2>/dev/null || echo "no PSI"

hr "OOM kills in dmesg (recent first)"
sudo dmesg -T 2>/dev/null | grep -iE "killed process|out of memory|oom-killer" | tail -20 \
  || echo "no OOM hits — good"

hr "kernel errors / segfaults / I/O timeouts (last 50)"
sudo dmesg -T 2>/dev/null | grep -iE "error|fail|segfault|i/o error|mmc|sd card|throttl|under-voltage" | tail -50

hr "disk space + inodes"
df -h /
df -i /

hr "SD card health (mmc errors are bad news)"
sudo dmesg -T 2>/dev/null | grep -iE "mmc|mmcblk" | tail -20

hr "top processes by RSS"
ps -eo pid,user,%cpu,%mem,rss,comm --sort=-rss | head -15

hr "docker daemon"
systemctl is-active docker 2>/dev/null
docker version --format '{{.Server.Version}}' 2>/dev/null

hr "container status"
docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.RunningFor}}'

hr "container resource use (snapshot)"
docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.BlockIO}}'

hr "containers that exited non-zero or restarted"
for c in $(docker ps -aq); do
  state=$(docker inspect -f '{{.Name}} exit={{.State.ExitCode}} restarts={{.RestartCount}} oomkilled={{.State.OOMKilled}} status={{.State.Status}}' "$c")
  echo "$state"
done

hr "last 30 log lines per container (look for OOM / kill / restart loops)"
for c in $(docker ps -aq); do
  name=$(docker inspect -f '{{.Name}}' "$c" | sed 's|^/||')
  echo "--- $name ---"
  docker logs --tail 30 --timestamps "$c" 2>&1 | sed 's/^/  /'
done

hr "done"
echo "If get_throttled is non-zero, you have a power-supply or cabling problem — fix that first."
