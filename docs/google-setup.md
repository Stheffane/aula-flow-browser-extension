# Configurar o Google Docs

A extensão cria os documentos na conta Google que você escolher no login (qualquer Gmail).
Para isso, o Google exige um "client ID" de OAuth. É gratuito e só precisa ser feito uma vez.

> A extensão pede só o escopo `drive.file`: ela enxerga **apenas os arquivos que ela mesma criou**, nada mais do seu Drive.

## 1. Criar o projeto no Google Cloud

1. Acesse [console.cloud.google.com](https://console.cloud.google.com/) com a sua conta Google.
2. No seletor de projetos (topo da página), clique em **Novo projeto**, dê o nome `Aula Flow` e crie.
3. Com o projeto selecionado, vá em **APIs e serviços → Biblioteca**, procure **Google Drive API** e clique em **Ativar**.

## 2. Configurar a tela de consentimento

1. Vá em **APIs e serviços → Tela de permissão OAuth** (ou **Google Auth Platform**) e clique em **Começar**.
2. Preencha:
   - **Nome do app:** `Aula Flow`
   - **E-mail de suporte:** o seu e-mail
   - **Público:** **Externo**
   - **Dados de contato:** o seu e-mail
3. Conclua. Depois, em **Público** (Audience) → **Usuários de teste**, clique em **Adicionar usuários** e adicione o seu próprio Gmail.

O app fica em modo de teste, o que é suficiente para uso pessoal: só os usuários de teste conseguem entrar.

## 3. Criar o client ID

1. Vá em **Clientes** ([link direto](https://console.cloud.google.com/auth/clients)) → **Criar cliente**.
2. **Tipo de aplicativo:** **Aplicativo da Web**. Nome: `Aula Flow`.
3. Em **URIs de redirecionamento autorizados**, clique em **Adicionar URI** e cole exatamente:

   ```
   https://gcedafbpimomohmmepchokblmobacpfi.chromiumapp.org/
   ```

   (com a barra no final). Deixe "Origens JavaScript autorizadas" vazio.
4. Crie e copie o **ID do cliente** (termina com `.apps.googleusercontent.com`).

> `gcedafbpimomohmmepchokblmobacpfi` é o ID fixo da extensão, definido pela chave pública no `manifest.config.ts`.
> Se você tinha criado antes um cliente do tipo "Extensão do Chrome", ele não é mais usado e pode ser apagado.

## 4. Configurar o projeto

Na pasta do projeto, crie um arquivo `.env` (ele não vai para o Git) com:

```
VITE_GOOGLE_CLIENT_ID=SEU_ID_DO_CLIENTE.apps.googleusercontent.com
```

Depois:

```bash
npm run build
```

## 5. Reinstalar a extensão (só desta vez)

Como a extensão agora tem um ID fixo, o Chrome a trata como nova:

1. Em `chrome://extensions`, **remova** o Aula Flow.
2. Clique em **Carregar sem compactação** e selecione a pasta `dist/` de novo.
3. Confira se o ID mostrado é `gcedafbpimomohmmepchokblmobacpfi`.

As configurações (chaves de API) e as transcrições salvas são apagadas nessa reinstalação: cole as chaves de novo.

## 6. Primeiro uso

Em **Configurações**, informe o Gmail (opcional) e clique em **Conectar**. Ou, depois de gerar o material de estudo, clique direto em **Criar documento do curso**.

1. Abre uma aba com o login do Google: escolha a conta. A aba fecha sozinha no fim.
2. Aparece o aviso **"O Google não verificou este app"**: é esperado, porque o app é seu e está em modo de teste. Clique em **Continuar**.
3. Autorize o acesso aos arquivos criados pelo app.

O documento fica em **Meu Drive → Aula Flow → \<nome do curso\>** e é atualizado sozinho a cada aula nova resumida.

## Problemas comuns

| Erro | Causa |
| --- | --- |
| `redirect_uri_mismatch` | A URI de redirecionamento do passo 3.3 está diferente (confira a barra no final). |
| `invalid_client` / `OAuth client was not found` | `.env` ausente ou client ID errado. Corrija e rode `npm run build` de novo. |
| `Login do Google cancelado` sem abrir janela | Client ID de tipo errado: precisa ser **Aplicativo da Web** (passo 3.2). |
| `access_denied` / acesso bloqueado | Adicione o Gmail usado no login em **Usuários de teste** (passo 2.3). |
| ID da extensão diferente do esperado | A extensão não foi removida e carregada de novo (passo 5). |
| `Google Drive API has not been used in project` | Ative a **Google Drive API** (passo 1.3). |
