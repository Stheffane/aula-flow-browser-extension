# Aula Flow

Extensão do Chrome que percorre as aulas de uma plataforma de estudo, transcreve os vídeos, gera resumos estruturados com IA e monta um Google Docs com o material do módulo: resumos, questionários e projetos/atividades propostos.

> Projeto pessoal em desenvolvimento.

## Stack

- TypeScript + React (painel lateral)
- Chrome Extension Manifest V3, empacotada com Vite + CRXJS
- OpenAI (transcrição de áudio) + Claude (resumos e interpretação) *(próximas etapas)*
- Google Docs API *(próximas etapas)*

## Arquitetura

```
src/
├── background/   service worker (abre o painel lateral)
├── content/      roda na página da plataforma e responde ao painel
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

## Roadmap

- [x] 1. Criar extensão e detectar a página de uma aula
- [ ] 2. Extrair o conteúdo de uma aula (captura de áudio + transcrição)
- [ ] 3. Gerar resumo estruturado com IA
- [ ] 4. Criar automaticamente um Google Docs
- [ ] 5. Processar um módulo inteiro do curso
- [ ] 6. Progresso, recuperação de erros e configurações
