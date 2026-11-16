# Ball Run — relatório técnico

## 1. O que os vídeos de referência mostram (assistidos integralmente)
- **Menu** vertical: título BALL RUN, instrução em português ("controle a bola deslizando o dedo… evite obstáculos… sobreviva o máximo"), rosto circular colorido por dificuldade (FÁCIL verde, DIFÍCIL vermelho), controle deslizante, botão JOGAR e "?".
- **Partida**: câmera em perspectiva atrás e acima da bola; esfera magenta brilhante no terço inferior; pista suspensa azul-arroxeada com grade lilás; fundo quase preto; prédios em grade luminosa dos dois lados.
- **Pista**: blocos magenta/roxos em posições variadas, pista que estreita até virar uma tira, bifurcações, plataformas e vãos; túneis com arcos e paredes magenta; faixas ciano em chevron; texto "Acelerar" quando a bola entra na faixa.
- **HUD**: voltar, "MODO FÁCIL" + pontuação, "RECORDE/HOJE" e pausa. **Fim**: "JOGO FINALIZADO", pontuação, modo, casa e "JOGAR NOVAMENTE".

## 2. Decisões
- **Mesmo jogo nas 3 plataformas**: Vite + TypeScript + Three.js; Capacitor 8 empacota o mesmo `dist/` nos apps (sem `server.url`: os apps nunca abrem o site).
- **Física própria em passo fixo (120 Hz)** com interpolação no desenho: idêntica a 30/60/90/120 FPS. Colisão esfera × caixa com varredura entre passos (sem atravessar bloco em alta velocidade).
- **Controle relativo**: o arrasto move um alvo; a bola o segue com velocidade (13 u/s) e aceleração (95 u/s²) limitadas — responde rápido, para quando o dedo para e não "teleporta" com gesto brusco.
- **Gerador com validação de rota**: cada trecho é testado antes de entrar (largura real da bola + margem, 42% da capacidade lateral real, velocidade do trecho, impulsos). Seeds reproduzíveis.
- **"Acelerar"**: as faixas ciano aceleram automaticamente e lançam a bola sobre os vãos (como no vídeo). Não há botão extra sobre a área de controle.
- **Pontuação**: 1 ponto a cada 5 m percorridos, só da simulação. Pausa não conta; partida abandonada (reiniciar/menu) não grava.
- **Identidade Flow**: interface monocromática (Anton + Montserrat), logo oficial na abertura, logo de mármore branca no menu; magenta/violeta/ciano só no mundo do jogo.
- **Áudio** 100% sintetizado (WebAudio); nenhum arquivo de terceiros.

## 3. Funcionalidades
- 4 dificuldades (FÁCIL, MÉDIO, DIFÍCIL, EXTREMO) com progressão dentro da partida: velocidade sobe primeiro; largura, complexidade, densidade e sequências entram depois, em curva gradual e com teto. A cada degrau de complexidade há um trecho calmo de adaptação.
- 17 tipos de trecho: blocos, barreiras com passagem, zigue-zague, pista estreita, bifurcação, caminho que muda de direção, plataformas suspensas, rampas, escada descendo, túnel com faixa ciano, salto sobre vão, blocos móveis, blocos em pista estreita e corredor em sequência.
- Tutorial automático só nas 5 primeiras partidas (contador salvo); dica curta após o mesmo erro duas vezes; "Treino guiado" no menu de ajuda (não conta).
- Recordes por modo, desafio do dia (mesma pista no dia, pela data do aparelho), estatísticas, histórico das últimas 30 partidas, 10 conquistas, 6 bolas desbloqueáveis, 4 biomas de cor, partículas e rastro.
- Pausa (continuar, reiniciar, menu, som, música), fim de partida (pontuação, recorde, modo, distância, tempo, conquistas, jogar novamente, menu), ajustes (volume, efeitos, música, vibração, sensibilidade, gráficos, reduzir movimento, apagar progresso), créditos e "Site oficial".
- Voltar do Android: pausa → continua → menu → sai. App em segundo plano: pausa automática e áudio parado.

## 4. Testes executados (GitHub Actions, workflow `Ball Run`, + local)
| Área | Como | Resultado |
|---|---|---|
| Tipos e lint | `tsc --noEmit` (strict) · `eslint` | sem erros |
| Física | 10 testes: mesmo estado a 30/60/90/120 FPS; velocidade/aceleração lateral limitadas com gesto absurdo; para quando o dedo para (≤1 correção, sem tremor); sair da borda = queda única; sem atravessar bloco de 15 cm a 20–160 u/s; passa rente (1 cm) sem morrer; rampa sem descolar; salto com pouso | passou |
| Geração | 500 seeds × 4 modos × 2.500 u: contínua, sem degrau para cima, piso ≥ largura da bola, obstáculo sempre sobre a pista e sem sobreposição; revalidação da pista inteira com rota segura; seed reproduzível; os 17 tipos aparecem; nada repete mais de 3× | passou |
| Justiça | robô com 80% da capacidade lateral e a mesma física: 3 partidas × 2.000 u por modo, inclusive EXTREMO | 12/12 sem morrer |
| Progressão | curvas monotônicas, sem saltos (≤0,1 u/s a cada 10 u), com teto | passou |
| Tutorial/recordes | 5 partidas com dica, 6ª sem (trocando modo e recarregando); treino não conta; dica após erro repetido; recordes por modo; desafio do dia; dados corrompidos | passou |
| Estados | 200 ciclos menu→jogo→pausa→jogo→fim→menu; fim de partida não dispara 2× | passou |
| Navegador | Playwright: desktop, Pixel 7, iPhone 12 (Chromium) e iPhone 12 **WebKit (motor do Safari)**: menu sem erro de console e sem rolagem lateral; arrastar move a bola; pausa congela física/pontuação; retomar sem teletransporte; reiniciar; fim de partida; toque duplo em JOGAR = 1 partida; teclado e Esc; tutorial some na 6ª partida após recarregar; ajustes/dificuldade persistem; todos os botões do menu; 8 partidas seguidas sem crescer geometrias/texturas na GPU; botões cabem em 320 px | passou |
| ZIP Vercel | `npm ci && npm run build` a partir do ZIP extraído | passou |
| Android | APK debug gerado; emulador Android 14 com **modo avião** (ping falha): abre, carrega de `https://localhost` (arquivos locais), menu pronto, partida iniciada, joga até o fim, app vivo | passou |
| iOS | `xcodebuild` Release iphoneos sem assinatura → IPA com `Payload/App.app` (App, Info.plist, public/index.html); build de simulador instalado e aberto no Simulador iOS (iPhone com Dynamic Island): processo rodando, menu desenhado com a pista 3D e área segura respeitada | passou |

## 5. Limitações (externas) e o que falta
- **IPA sem assinatura**: compila, mas não instala direto no iPhone. Falta conta Apple Developer + certificado + provisioning (TestFlight/App Store) — ou assinar com Sideloadly/AltStore usando o Apple ID. Não existe IPA "instalável em qualquer iPhone" sem isso.
- **APK é debug** (chave de teste do Android). Para Play Store: keystore própria (só o dono pode criar/guardar) e `bundleRelease`.
- **iPhone real (Safari/iOS 26)**: testado no motor WebKit do Playwright e no Simulador iOS, não em aparelho físico.
- **Offline no iOS**: o app usa só arquivos locais (sem `server.url`, igual ao Android testado no modo avião), mas o simulador do CI não permite cortar a rede; não medido em aparelho.
- **Publicação na Vercel**: não publiquei (é decisão do dono). O ZIP está pronto e testado.

## 6. Bugs encontrados e corrigidos durante o desenvolvimento
- Robô morria em zigue-zague por atraso de controle → antecipação = 1/LAT_GAIN; virou teste de justiça permanente.
- Validação "por partes" diferente da validação "do todo" (amostragem e zonas de impulso) → grade global de amostras e lista de zonas de impulso; teste de revalidação da pista inteira.
- Arco do túnel grosso demais (virava faixa sólida) → tubo 0,022.
- Bola grande demais no computador → câmera mais afastada só em tela larga.
- "JOGAR NOVAMENTE" quebrava em 2 linhas em Android estreito (visto na captura do emulador) → cabe em 320 px; teste novo.
- Teste do simulador iOS dava verde sem o app abrir → script agora falha se o processo não estiver rodando.

## 7. Arquivos entregues (CI run 7, commit e9405dc)
| Arquivo | Tamanho | O que é |
|---|---|---|
| `BALL_RUN_WEB_VERCEL.zip` | 1,0 MB | projeto web completo para a Vercel |
| `BALL_RUN_ANDROID_debug.apk` | 14,5 MB | APK **debug** instalável, joga offline |
| `BALL_RUN_IOS_unsigned.ipa` | 12,0 MB | IPA **sem assinatura** (precisa assinar para instalar) |


---

# Versão 2.0 — nova direção criativa (casual, divertido, monocromático)

## O que mudou
- **Visual Flow**: só preto, branco e cinzas (teste automático confere que todo tema é cinza). Pista cinza com grade fina, blocos escuros com arestas brancas, cidade com prédios em duas camadas, janelas acesas (algumas piscam), coroamento, antenas com luz piscando. Cores convertidas corretamente para sRGB (antes os shaders saíam escuros demais).
- **Bola**: skin padrão "Xadrez Flow" com casas distribuídas pela esfera inteira (sem beliscão nos polos), juntas em relevo, verniz (clearcoat) e reflexo de estúdio. 10 skins: Xadrez Flow, Carinha, Pelada, Bola 8, Golfinho, Mármore Flow, Globo de Festa, Zebra, Olhão, Planetinha. Miniaturas renderizadas em 3D.
- **Minha foto**: importar imagem da galeria/computador; pré-visualização 3D girando; zoom, girar, altura; opção preto e branco; trocar e remover. A imagem mantém a proporção e se repete em volta da bola (não deforma). Validação: não-imagem, arquivo vazio, maior que 30 MB, imagem corrompida e demora → mensagem clara, sem travar. Guardada reduzida (máx. 1024 px, JPEG) em chave separada.
- **Humor**: blocos com rosto (olhos que seguem a bola, piscam; bravos, assustados e dorminhocos); batida estilo desenho animado (bola achata, quica, estrelinhas girando, "PLOFT!", buzina); queda com apito descendo e "TCHAUUU!"; "UFA!" ao passar raspando; placas com piadas, pato de borracha gigante e disco voador raros; 20 frases de fim de partida sem repetir as últimas; confete e fanfarra em recorde; placa "Bem-vindo ao …" a cada ambiente.
- **Variedade**: 8 ambientes (Centro à Noite, Parque Maluco, Céu Aberto, Neblina, Labirinto, Nevasca, Eclipse, Tempestade), cada um com visual, clima (neve, chuva, estrelas, eclipse) e estilo de pista próprios; trocam a cada 700–1100 m e o começo evita os ambientes das últimas partidas. 22 tipos de trecho (novos: blocos que brotam do chão, giradores, dominós, slalom, "ola" de blocos móveis).
- **Dificuldade sem teto**: fase confortável no começo e depois crescimento logarítmico infinito (continua acelerando depois de horas). Tempo de reação tem piso fixo; a pista se espaça com a velocidade. Neblina nunca fica mais curta que 3,4 s de visão.
- **Partidas de horas**: origem do desenho muda a cada 2,1 km (sem tremor de precisão); pista e partículas recicladas.
- **Recordes**: pontos, maior distância e maior tempo por modo; estatísticas (inclui "por um triz"); salvamento com cópia de segurança.
- **Flow**: "Produzido pela Flow" na abertura, menu e créditos; botões do site oficial e do Instagram @flowgroup.br (Web, Android e iOS).

## Testes da v2 (local)
| Área | Resultado |
|---|---|
| Justiça (robô, física real) | 4 modos × 3 partidas de 2 km desde o início + trechos a 30 km e 120 km: 8/8 |
| Geração | seeds no início, a 20 km e a 150 km: contínua, rota segura, 22 tipos aparecem |
| Progressão | até 500 km: monotônica, sem saltos, ainda acelerando entre 100 e 500 km, piso de reação |
| Ambientes | trocam, não repetem o anterior, começo varia (≥ 6 diferentes em 60 partidas) |
| Humor/foto | frases sem repetição; enquadramento sempre válido; temas só em cinza |
| Recordes | distância/tempo por modo; cópia de segurança recupera salvamento corrompido |
| Navegador | foto inválida/grande/corrompida/válida/persistência/remoção; recordes após recarregar; links da Flow |
| Partida longa no navegador | robô em velocidade 8×: passou de 4,2 km, duas trocas de origem, cena correta |

## Observação sobre o endereço
O pedido citou `https://flowgroup.site`, que não responde. Usei o site oficial no ar e configurado no projeto da Flow, `https://flowgroupbr.site` (troca em `src/config.ts`).

---

# Versão 3.0 — depois de jogar a 1ª versão

## Pedidos e o que foi feito
- **Acelerador estava errado**: a seta do shader apontava para trás (o "V" tinha a ponta virada para a câmera). Agora as setas apontam e correm para a frente; a faixa cobre a pista inteira (22 m) e tem bordas acesas. Ao passar: onda de choque no chão, faíscas para trás, linhas de velocidade na tela, flash, som "vuuush", "NÍVEL X".
- **Pista larga demais / obstáculos pequenos**: pista mais estreita (FÁCIL 5,0 → EXTREMO 4,4) e obstáculos proporcionais à largura (blocos 26–50 % da pista, cones, móveis e blocos que brotam também escalados).
- **Nova regra de dificuldade**: a bola anda numa **velocidade constante** por modo (FÁCIL 11 · MÉDIO 14 · DIFÍCIL 17,5 · EXTREMO 21 u/s). Só os **aceleradores, a cada 1 km**, mudam: cada um dá um impulso curto e sobe 1 nível (um pouco mais rápido, obstáculos mais próximos e mais difíceis). Sem nível máximo; o ganho por nível diminui devagar e nunca zera; o tempo de reação tem piso. Depois de cada acelerador vem um trecho calmo. FÁCIL = devagar e espaçado; EXTREMO = começa rápido, obstáculos próximos e mais difíceis.
- **Cores que mudam a cada km** (mantido da 1ª versão): cidade, janelas, obstáculos, acelerador e rastro "do km" trocam de cor a cada acelerador, com transição suave; sem amarelo/dourado. Ajustes têm a opção "Flow P&B".
- **Obstáculos sempre visíveis**: corpo claro/colorido com contorno escuro sobre a pista cinza; teste automático garante contraste ≥ 3:1 em todo ambiente e toda cor. Rostinhos com contorno escuro.
- **Moedas**: 1 a cada 500 m + 1 por acelerador, e as conquistas dão de 1 a 25. Preços de 15 a 80. Treino não dá moedas da partida.
- **500 conquistas** em 9 categorias (pontos, níveis, distância, tempo, partidas, estilo, ambientes, coleção, desafio do dia), com barra de progresso.
- **52 bolas** (xadrez padrão e "Minha foto" grátis; as outras por conquista ou moedas) e **50 rastros** (faixa no chão que some em menos de 1 s + partículas: estrelas, corações, notas, bolhas, faíscas, confete, fumaça, pixels…).

## Testes da v3 (local)
- Unidade: geração com níveis (aceleradores a ~1 km, cobrem a pista inteira, salto nunca usa acelerador, velocidade não muda entre aceleradores), justiça com robô 8/8 (início, 30 km e 120 km), economia (500 conquistas únicas, preços, compra sem saldo negativo, sem compra dupla, conquista não se compra), cores (sem amarelo, contraste dos obstáculos).
- Navegador (desktop, Pixel 7, iPhone 12): 34/34, incluindo compra na loja, rastro, persistência após recarregar e loja abrindo em ~0,15 s (miniaturas 3D chegam em seguida).

## Defeitos achados na v3 e corrigidos
- **Android travava ("não está respondendo") depois do menu** no emulador sem GPU: o pré-cálculo do reflexo de estúdio (PMREM) e a textura da bola em 1024 px pesavam no carregamento. Troquei por acabamento *matcap* gerado em canvas e textura 512 px: abertura sem GPU de 2,9 s → 0,9 s. O teste do Android agora espera o menu, exige "partida iniciada" e falha se houver ANR — passou em modo avião.
- **Loja levava 3 s para abrir e podia congelar a página** em aparelho fraco: as miniaturas 3D criavam vários contextos WebGL. Agora a loja abre na hora (~0,2 s) e as miniaturas são desenhadas só na CPU, em lotes, sem contexto gráfico extra.
- **Itens do painel se sobrepondo** (a grade invadia as abas da loja): corrigido no layout.

## v4 (2026-11-16) — polimento final
- **Poderes especiais** (`src/sim/abilities.ts`, tabela por bola em `src/game/catalog.ts`): 12 tipos, um por bola, combinando com a skin. Dois toques na tela (Espaço/↑ no computador) ou o botão redondo no canto. Bola inicial: **Pulo**. Arrancada que quebra blocos, fantasma, escudo, câmera lenta, congelar, teletransporte, **disco voador que rapta a bola**, foguete, planador, salto triplo, superpulo. Recarga mínima por tipo (3 s a 22 s); teletransporte/disco/foguete só soltam a bola em chão livre (`freeAt`). Poder não conta para o recorde de velocidade.
- **Teste** (`tests/unit/abilities.test.ts`): robô usando o poder sempre que pronto não morre por causa dele em nenhum dos 4 modos (9 poderes de risco); recarga impede disparo duplo; arrancada/escudo esmagam blocos.
- **Cores**: FÁCIL verde, MÉDIO amarelo, DIFÍCIL vermelho, EXTREMO roxo com chifrinhos.
- **Velocidades iniciais**: 34 / 47 / 61 / 77 km/h; intervalo entre fileiras 2,0 / 1,45 / 1,1 / 0,9 s.
- **Sombra**: some quando a bola cai abaixo da pista (antes crescia).
- **Créditos e redes**: Instagram @flowgroup.br, TikTok @flowgroupbr (verificado: bio aponta para flowgroupbr.site), WhatsApp, site.
- **Onde jogar**: site, APK e IPA no mesmo menu; o CI grava os instaladores em `downloads/` e a Vercel os serve.
- **Equilíbrio**: 73 itens à venda somam 2.790 moedas; partida rende ~3 moedas/km; 500 conquistas somam 4.981 moedas. Liberar a loja leva dias de jogo; 100% das conquistas exige dezenas de horas (1.000 km rolados, 50 h jogadas) e algumas são de lenda.
