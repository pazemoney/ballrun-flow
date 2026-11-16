#!/usr/bin/env bash
# Teste do app no Simulador iOS: instala, abre, confere que está rodando e coleta diagnóstico.
set -u
APP="$1"; mkdir -p "$2"; OUT="$(cd "$2" && pwd)"; BID=site.flowgroupbr.ballrun
UDID=$(xcrun simctl list devices available -j | python3 -c "import json,sys; d=json.load(sys.stdin)['devices']; print(next(x['udid'] for k,v in d.items() if 'iOS' in k for x in v if x['name'].startswith('iPhone')))")
echo "Simulador: $UDID"
xcrun simctl boot "$UDID" || true
xcrun simctl bootstatus "$UDID" -b > /dev/null 2>&1 || true
xcrun simctl install "$UDID" "$APP"
plutil -p "$APP/Info.plist" | grep -E "CFBundleIdentifier|CFBundleExecutable" | tee "$OUT/info.txt"
ls "$APP/public" | head > "$OUT/public.txt"
START=$(date +%s)
echo "--- launch:"; xcrun simctl launch "$UDID" $BID 2>&1 | tee "$OUT/launch.txt"; echo "exit=${PIPESTATUS[0]}" | tee -a "$OUT/launch.txt"
sleep 30
xcrun simctl io "$UDID" screenshot "$OUT/01-menu-ios.png"
pgrep -fl "App.app/App" | tee "$OUT/ps.txt" || true
xcrun simctl spawn "$UDID" log show --start "$(date -r $START '+%Y-%m-%d %H:%M:%S')" --style compact --predicate 'process == "App"' > "$OUT/oslog.txt" 2>&1 || true
grep -iE "ballrun|Capacitor|error|exception|crash" "$OUT/oslog.txt" | tail -40
ls -t ~/Library/Logs/DiagnosticReports 2>/dev/null | head -5 | tee "$OUT/crashes.txt"
for f in $(ls -t ~/Library/Logs/DiagnosticReports 2>/dev/null | grep -i "^App" | head -1); do cp ~/Library/Logs/DiagnosticReports/"$f" "$OUT/"; head -80 ~/Library/Logs/DiagnosticReports/"$f"; done
if [ -s "$OUT/ps.txt" ]; then echo "OK: app iOS rodando no simulador"; else echo "FALHA: app não está rodando"; exit 1; fi
grep -q "\[ballrun\] menu pronto" "$OUT/oslog.txt" && echo "OK: console do jogo confirma menu pronto" || echo "AVISO: linha de console não encontrada no log do sistema (ver captura)"
