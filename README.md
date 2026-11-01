# Aula Flow

Extensão do Chrome que percorre as aulas de uma plataforma de estudo, transcreve os vídeos, gera resumos estruturados com IA e monta um Google Docs com o material do módulo: resumos, questionários e projetos/atividades propostos.

> Projeto pessoal em desenvolvimento.

## Stack

- TypeScript + React (painel lateral)
- Chrome Extension Manifest V3, empacotada com Vite + CRXJS
- Transcrição: Groq `whisper-large-v3-turbo` (gratuito) ou OpenAI `gpt-4o-mini-transcribe` (pago), configurável
- Resumos com IA *(próxima etapa)*
- Google Docs API *(próximas etapas)*

## Arquitetura

```
src/
├── background/   service worker: transcreve os trechos em fila e guarda o estado (job.ts)
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

## Roadmap

- [x] 1. Criar extensão e detectar a página de uma aula
- [x] 2. Extrair o conteúdo de uma aula (captura de áudio + transcrição)
- [ ] 3. Gerar resumo estruturado com IA
- [ ] 4. Criar automaticamente um Google Docs
- [ ] 5. Processar um módulo inteiro do curso
- [ ] 6. Progresso, recuperação de erros e configurações
