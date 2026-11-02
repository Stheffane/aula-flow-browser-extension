# Aula Flow

Extensão do Chrome que percorre as aulas de uma plataforma de estudo, transcreve os vídeos, gera resumos estruturados com IA e monta um Google Docs com o material do módulo: resumos, questionários e projetos/atividades propostos.

> Projeto pessoal em desenvolvimento.

## Stack

- TypeScript + React (painel lateral)
- Chrome Extension Manifest V3, empacotada com Vite + CRXJS
- Transcrição: Groq `whisper-large-v3-turbo` (gratuito) ou OpenAI `gpt-4o-mini-transcribe` (pago), configurável
- Resumos: Gemini `gemini-flash-latest` (gratuito) ou Groq `gpt-oss-120b` (gratuito, aulas curtas), configurável
- Google Drive API (conversão HTML → Google Docs) com login OAuth numa aba do Chrome (qualquer Gmail)

## Arquitetura

```
src/
├── background/   service worker: transcrição (job.ts), resumo (summarize.ts), documento do curso (courseDoc.ts) e processamento do módulo (run.ts)
├── content/
│   ├── index.ts      roda na página da plataforma e responde ao painel
│   └── player.ts     roda no iframe do player: play, pausa e gravação do áudio do vídeo
├── offscreen/    plano B: grava o áudio da aba inteira
├── platforms/    um adaptador por plataforma de estudo
│   ├── types.ts      contrato PlatformAdapter
│   ├── platos.ts     Platos LMS (infoprod.platosedu.io)
│   ├── generic.ts    fallback: detecta qualquer vídeo
│   └── dom.ts        utilitários de DOM compartilhados
├── sidepanel/    interface React
└── shared/       tipos e helpers de mensagens
```

Tudo que é específico de uma plataforma (URLs, seletores, navegação entre aulas) fica no seu adaptador. Para suportar outra plataforma:

1. Criar `src/platforms/<nome>.ts` implementando `PlatformAdapter`.
2. Registrar em `src/platforms/index.ts`.
3. Adicionar o domínio em `host_permissions` e `content_scripts.matches` no `manifest.config.ts`.

## Rodando localmente

```bash
npm install
npm run dev     # build com hot reload em dist/
# ou
npm run build   # build de produção em dist/
```

Para criar Google Docs, siga antes o guia [docs/google-setup.md](docs/google-setup.md) (client ID do OAuth no arquivo `.env`).

No Chrome: `chrome://extensions` → ativar **Modo do desenvolvedor** → **Carregar sem compactação** → selecionar a pasta `dist/`.

Clique no ícone da extensão para abrir o painel lateral.

## Como a transcrição funciona

A plataforma não tem legendas, então a extensão grava o áudio enquanto o vídeo toca:

1. No painel, **Transcrever aula** pede ao script do player para voltar o vídeo ao início e dar play.
2. O player grava o áudio **direto do `<video>`** (`captureStream` + `MediaRecorder`), em trechos de 3 min.
3. Cada trecho vai para o background, que transcreve em ordem e mostra o texto ao vivo no painel. O ícone mostra `REC`.
4. Quando o vídeo termina (ou você clica em parar), a transcrição fica salva por aula.

**Plano B:** se o player não permitir gravar o `<video>` (vídeo protegido, por exemplo), a extensão grava o áudio da aba inteira com `chrome.tabCapture` num documento offscreen.

O provedor e a chave são escolhidos nas configurações do painel e ficam só no `chrome.storage.local`.

| Provedor | Custo | Limite |
| --- | --- | --- |
| Groq | gratuito | ~8 h de áudio por dia |
| OpenAI | ~US$ 0,003/min | sem limite prático |

## Material de estudo

Quando a transcrição termina, a extensão gera automaticamente um material de estudo em Markdown (`src/shared/summary.ts`):
em uma frase, resumo, conceitos principais explicados, passo a passo, pontos de atenção, atividades e projetos, glossário e perguntas para revisão.

O prompt pede para a IA **explicar melhor** o que o professor disse (não só resumir), corrigir termos técnicos mal transcritos e marcar com `💡 Complemento:` tudo que não veio da aula.

## Google Docs

Cada curso tem **um único Google Docs**, regerado a partir dos resumos salvos sempre que uma aula nova é resumida (`src/background/courseDoc.ts`):

```
# <Curso>
# Sumário                      módulos → aulas
# Atividades e projetos        juntando todas as aulas (com a aula de origem)
# Materiais complementares     links, ferramentas e leituras, sem repetição
# Módulo 01
## <Aula>                      conceitos, passo a passo, glossário, revisão…
# Módulo 02
…
```

- O módulo e a ordem de cada aula vêm do menu da plataforma (ou do seletor no painel).
- O Markdown é convertido em HTML (`marked`) e enviado ao Drive com conversão para Google Docs: títulos, listas, negrito e código viram formatação nativa, numa única requisição.
- O documento fica em `Aula Flow / <nome do curso>` no Drive. O escopo é `drive.file`: a extensão só acessa os arquivos que ela mesma criou.
- **Atenção:** como o documento é regerado, edições feitas direto no Google Docs são substituídas na próxima atualização.

## Processar um módulo (ou o curso inteiro)

Na aula aberta, o painel oferece **Processar <módulo>**, **a partir desta aula** e **Processar curso inteiro** (todos os módulos; Podcast e Avaliação ficam de fora) (`src/background/run.ts`):

O processamento anda **módulo a módulo**:

1. **Transcrever:** para cada aula do módulo, navega com "Próxima aula"/"Aula Anterior" (o menu é reserva), espera o vídeo trocar, grava e transcreve (só usa o Groq). Aulas já transcritas não são reassistidas; aulas com material pronto são puladas.
2. **Material do módulo:** ao terminar o módulo, gera o material das aulas dele com o mínimo de chamadas de IA (marcadores `===AULA n===` separam as aulas na resposta), passando os conceitos dos módulos anteriores para não repetir explicações. Em seguida cria/atualiza o documento da matéria e segue para o próximo módulo.

Como a resposta da IA para um módulo leva minutos e o Chrome encerra o service worker quando um `fetch` passa de 30 s sem atividade, as chamadas de IA mantêm o worker ativo (uma chamada à API da extensão a cada 20 s). Se mesmo assim ele cair, o vigia percebe e gera o material de novo.

Dá para parar e retomar a qualquer momento.

O estado fica em `chrome.storage` e o avanço é guiado por eventos, então o painel pode ser fechado durante o processamento.

## Tutor de questionários

Em páginas de questionário/avaliação, o painel mostra o **Tutor da questão** (`src/shared/tutor.ts`):

- Lê a pergunta e as alternativas da tela com um leitor genérico (radio/checkbox, nativos ou com `role`) em `src/platforms/question.ts`.
- **Explicar esta questão** envia a pergunta + o material de estudo do curso para a IA, que responde com: o que está sendo perguntado, conceitos envolvidos, onde isso aparece no curso e perguntas-guia.
- O tutor **não indica a alternativa correta**: o objetivo é entender a questão; a resposta é do aluno.

## Economia de cota (tudo gratuito)

- **Material por módulo:** ~1 chamada de IA por módulo em vez de 1 por aula (o curso de 28 aulas cai para ~10 chamadas).
- **Reserva automática** (`completeWithFallback` em `src/shared/summary.ts`): Gemini Flash → Gemini Flash-Lite → Groq gpt-oss (este só aula a aula). Um provedor que responde "limite diário" é pulado por 1 h.
- **Limpeza local** (`src/shared/clean.ts`): remove vícios de fala soltos ("Perfeito.", "Beleza?", "né?") e palavras repetidas antes de enviar para a IA (~15% menos texto). A transcrição original continua salva.
- **Tutor enxuto:** envia só as 4 aulas mais relacionadas à pergunta (por palavras em comum); das demais, só os títulos.
- O documento do Google Docs é montado sem IA.

## Recuperação de erros

- **Falhas temporárias** (limite de uso, instabilidade, tempo esgotado) no Groq/Gemini são repetidas automaticamente, com espera crescente (`src/shared/retry.ts`).
- **Vigia** (`chrome.alarms`, a cada 30 s): se o service worker do Chrome for encerrado no meio de uma etapa, retoma do ponto salvo (transcrição parada, resumo travado, vídeo que terminou sem avisar).
- Aulas com erro ganham **Tentar de novo**; no fim, **Refazer aulas com erro**.
- Ao recarregar a extensão ou reabrir o navegador, o que estava pela metade é marcado como interrompido, e os botões voltam.
- **Notificação do sistema** no fim do processamento (clicar abre o documento do curso).
- **Limpar dados** (Configurações): apaga transcrições/materiais/progresso mantendo chaves e login, ou apaga tudo.

**Identificação das aulas:** a Platos é uma SPA e a URL não muda entre aulas; cada aula é identificada pela URL + ID do vídeo (`lessonKey`).

## Roadmap

- [x] 1. Criar extensão e detectar a página de uma aula
- [x] 2. Extrair o conteúdo de uma aula (captura de áudio + transcrição)
- [x] 3. Gerar resumo estruturado com IA
- [x] 4. Criar automaticamente um Google Docs
- [x] 5. Processar um módulo inteiro do curso
- [x] 6. Progresso, recuperação de erros e configurações
