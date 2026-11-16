"""Aplica o ícone do Ball Run em site, iPhone e Android (ícones e telas de abertura).
Uso: python3 scripts/icone/aplicar.py   (depois de node scripts/icone/gerar.cjs)"""
import glob, os
from PIL import Image, ImageDraw

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(AQUI))
BG = (7, 6, 12)  # #07060c, o mesmo fundo do jogo
ICONE = Image.open(os.path.join(AQUI, 'icone-1024.png')).convert('RGB')
ANDROID = Image.open(os.path.join(AQUI, 'icone-android-1024.png')).convert('RGB')

def r(*p): return os.path.join(RAIZ, *p)
def tam(img, s): return img.resize((s, s), Image.LANCZOS)

def arredondado(img, s, raio=0.22):
    m = Image.new('L', (s, s), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, s - 1, s - 1), int(s * raio), fill=255)
    o = Image.new('RGBA', (s, s), (0, 0, 0, 0)); o.paste(tam(img, s), (0, 0), m); return o

def redondo(img, s):
    m = Image.new('L', (s, s), 0); ImageDraw.Draw(m).ellipse((0, 0, s - 1, s - 1), fill=255)
    o = Image.new('RGBA', (s, s), (0, 0, 0, 0)); o.paste(tam(img, s), (0, 0), m); return o

def abertura(w, h, fracao=0.34):
    s = int(min(w, h) * fracao)
    o = Image.new('RGB', (w, h), BG); ic = arredondado(ICONE, s)
    o.paste(ic, ((w - s) // 2, (h - s) // 2), ic); return o

# site (PWA, tela inicial e carregamento)
tam(ICONE, 512).save(r('public', 'icon-512.png'), optimize=True)
tam(ICONE, 192).save(r('public', 'icon-192.png'), optimize=True)
tam(ICONE, 180).save(r('public', 'apple-touch-icon.png'), optimize=True)

# iPhone: ícone (sem transparência) e telas de abertura
ICONE.save(r('ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset', 'AppIcon-512@2x.png'))
for f in glob.glob(r('ios', 'App', 'App', 'Assets.xcassets', 'Splash.imageset', '*.png')):
    w, h = Image.open(f).size; abertura(w, h).save(f, optimize=True)

# Android: ícone adaptável (fundo = arte inteira na área segura; frente vazia), legado e redondo
res = r('android', 'app', 'src', 'main', 'res')
for d in glob.glob(os.path.join(res, 'mipmap-*dpi')):
    s = Image.open(os.path.join(d, 'ic_launcher.png')).size[0]
    big = int(s * 1.5)  # a camada é mostrada em 72 dp: arquivo maior fica nítido
    tam(ANDROID, big).save(os.path.join(d, 'ic_launcher_background.png'), optimize=True)
    Image.new('RGBA', (big, big), (0, 0, 0, 0)).save(os.path.join(d, 'ic_launcher_foreground.png'))
    arredondado(ANDROID, s, 0.18).save(os.path.join(d, 'ic_launcher.png'), optimize=True)
    redondo(ANDROID, s).save(os.path.join(d, 'ic_launcher_round.png'), optimize=True)
with open(os.path.join(res, 'values', 'ic_launcher_background.xml'), 'w') as fh:
    fh.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#07060C</color>\n</resources>\n')
for f in glob.glob(os.path.join(res, 'drawable*', 'splash.png')):
    w, h = Image.open(f).size; abertura(w, h).save(f, optimize=True)

# fontes para o @capacitor/assets (se alguém regenerar, sai o ícone certo)
ICONE.save(r('resources', 'icon.png')); ICONE.save(r('resources', 'icon-only.png'))
tam(ANDROID, 1024).save(r('resources', 'icon-background.png'))
Image.new('RGBA', (1024, 1024), (0, 0, 0, 0)).save(r('resources', 'icon-foreground.png'))
abertura(2732, 2732).save(r('resources', 'splash.png')); abertura(2732, 2732).save(r('resources', 'splash-dark.png'))
print('ok: site, iPhone, Android e resources atualizados')
