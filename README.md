# Aula Flow

Extensão do Chrome que percorre as aulas de uma plataforma de estudo, transcreve os vídeos, gera resumos estruturados com IA e monta um Google Docs com o material do módulo: resumos, questionários e projetos/atividades propostos.

> Projeto pessoal em desenvolvimento.

## Stack

- TypeScript + React (painel lateral)
- Chrome Extension Manifest V3, empacotada com Vite + CRXJS
- Transcrição: Groq `whisper-large-v3-turbo` (gratuito) ou OpenAI `gpt-4o-mini-transcribe` (pago), configurável
- Resumos: Gemini `gemini-flash-latest` (gratuito) ou Groq `gpt-oss-120b` (gratuito, aulas curtas), configurável
- Google Drive API (conversão HTML → Google Docs) com OAuth via `chrome.identity`

## Arquitetura

```
src/
├── background/   service worker: transcrição em fila (job.ts), resumo (summarize.ts) e documento do curso (courseDoc.ts)
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

- O módulo de cada aula é escolhido no painel (na etapa 5 a navegação pelo módulo preenche sozinha).
- O Markdown é convertido em HTML (`marked`) e enviado ao Drive com conversão para Google Docs: títulos, listas, negrito e código viram formatação nativa, numa única requisição.
- O documento fica em `Aula Flow / <nome do curso>` no Drive. O escopo é `drive.file`: a extensão só acessa os arquivos que ela mesma criou.
- **Atenção:** como o documento é regerado, edições feitas direto no Google Docs são substituídas na próxima atualização.

## Roadmap

- [x] 1. Criar extensão e detectar a página de uma aula
- [x] 2. Extrair o conteúdo de uma aula (captura de áudio + transcrição)
- [x] 3. Gerar resumo estruturado com IA
- [x] 4. Criar automaticamente um Google Docs
- [ ] 5. Processar um módulo inteiro do curso
- [ ] 6. Progresso, recuperação de erros e configurações
