#!/usr/bin/env bash
# Teste do APK no emulador: instala, liga o MODO AVIÃO, abre, espera o menu, joga e registra provas.
set -u
APK="$1"; OUT="$2"; PKG=site.flowgroupbr.ballrun
mkdir -p "$OUT"
adb install -r "$APK"
adb shell cmd connectivity airplane-mode enable || adb shell settings put global airplane_mode_on 1
adb shell svc wifi disable || true
adb shell svc data disable || true
sleep 4
if adb shell ping -c 1 -W 2 8.8.8.8 >/dev/null 2>&1; then echo "REDE: ativa (modo avião falhou)" | tee "$OUT/rede.txt"; else echo "REDE: sem conexão (modo avião ok)" | tee "$OUT/rede.txt"; fi
adb logcat -c
adb shell monkey -p $PKG -c android.intent.category.LAUNCHER 1
# espera o jogo chegar ao menu (até 120 s no emulador sem GPU)
for i in $(seq 1 60); do adb logcat -d | grep -q "\[ballrun\] menu pronto" && break; sleep 2; done
sleep 3
adb exec-out screencap -p > "$OUT/01-menu-offline.png"
adb shell input keyevent KEYCODE_ENTER
for i in $(seq 1 15); do adb logcat -d | grep -q "\[ballrun\] partida iniciada" && break; sleep 2; done
SIZE=$(adb shell wm size | grep -o '[0-9]*x[0-9]*' | tail -1); W=${SIZE%x*}; H=${SIZE#*x}
sleep 3
adb shell input swipe $((W/2)) $((H*3/4)) $((W/2+W/8)) $((H*3/4)) 250
sleep 2
adb exec-out screencap -p > "$OUT/02-jogando-offline.png"
sleep 8
adb exec-out screencap -p > "$OUT/03-depois.png"
adb logcat -d > "$OUT/logcat.txt"
PID=$(adb shell pidof $PKG || true)
echo "PID=$PID" | tee "$OUT/pid.txt"
echo "--- console do jogo:"; grep "ballrun\]" "$OUT/logcat.txt" || true
echo "--- erros JS:"; grep -iE "Uncaught|TypeError|ReferenceError" "$OUT/logcat.txt" || echo "nenhum"
grep -q "\[ballrun\] menu pronto" "$OUT/logcat.txt" || { echo "FALHA: o jogo não chegou ao menu"; exit 1; }
grep -q "\[ballrun\] partida iniciada" "$OUT/logcat.txt" || { echo "FALHA: a partida não começou"; exit 1; }
if grep -qE "ANR in $PKG|Application Not Responding: $PKG" "$OUT/logcat.txt"; then echo "FALHA: app travou (ANR)"; exit 1; fi
[ -n "$PID" ] || { echo "FALHA: app fechou"; exit 1; }
echo "OK: APK abriu, chegou ao menu, iniciou partida e não travou, sem rede"
