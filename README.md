# JobHunter AI

Este projeto é um MVP de sistema para apoiar a busca por vagas com IA local, currículo ajustado, carta de apresentação e automação de acesso a plataformas de vagas.

## Stack
- Node.js + Express
- React + Vite
- Persistência em SQLite para funcionamento local gratuito
- IA local opcional via Ollama (grátis)
- Automação supervisionada de navegador com Playwright (local e controlada pelo usuário)

## Como rodar

### 1) Backend
```bash
cd backend
npm install
npm run dev
```

### Testes automatizados do backend
```bash
cd backend
npm test
```

Os testes sobem a API com um banco SQLite temporário e cobrem autenticação, isolamento de candidaturas entre contas, geração baseada em evidências e validação de URLs.

### 2) Frontend
```bash
cd frontend
npm install
npm run dev
```

### 3) Automação supervisionada do navegador
Na primeira instalação do backend, baixe o Chromium usado pelo Playwright:
```bash
cd backend
npx playwright install chromium
```

No painel, informe até seis URLs HTTPS de plataformas suportadas e clique em **Preparar automação**. O JobHunter abre essas páginas em uma janela local separada, com perfil de navegador isolado por conta. Faça login, confira os dados e envie cada candidatura manualmente. A sessão fecha pelo botão **Encerrar navegador** ou automaticamente após duas horas.

Por segurança, a automação só abre domínios conhecidos de emprego. Ela não preenche ou envia formulários, não contorna CAPTCHA, autenticação nem controles anti-bot. Os cookies de sessão ficam no perfil local do Playwright, separados por usuário, e não são enviados para a API.

### 4) IA local opcional (Ollama)
```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3.1
```

Depois configure a variável se necessário:
```bash
export OLLAMA_BASE_URL=http://localhost:11434/api/generate
export OLLAMA_MODEL=llama3.1
```

## Funcionalidades principais
- Cadastro e login do usuário
- Gestão de empresas e vagas
- Importação revisável de até 10 arquivos por lote (PDF pesquisável, TXT, Markdown, CSV ou JSON; até 10 MB por arquivo)
- Geração de currículo adaptado para a vaga, com evidências de correspondência e lacunas
- Geração de carta de apresentação personalizada
- Estratégia de candidatura com plano de ação
- Registro opcional das versões de currículo e carta junto à candidatura, para consulta e download posterior
- Preparação para automação em portais como LinkedIn e InfoJobs

## Observação importante
A automação de plataformas externas depende dos termos de uso das próprias empresas e pode exigir login do usuário e validações de segurança. O projeto foi construído para operar de forma local, transparente e controlada, usando o navegador do usuário e sem burlar regras de acesso.

A extração do currículo mostra um rascunho para revisão; só após confirmar os dados são mesclados ao perfil. Aderência é uma comparação textual heurística, não uma probabilidade de contratação. Requisitos obrigatórios recebem maior peso que diferenciais; termos encontrados incluem a origem da evidência, e lacunas e níveis de idioma são mostrados separadamente. O conteúdo importado é preservado como fonte e não são criados cargos, métricas ou competências para preencher lacunas. Ao registrar uma candidatura com documentos gerados para a mesma vaga, as versões utilizadas ficam armazenadas no histórico da conta. Revise e confirme os dados antes de qualquer envio.

## Estrutura modular
- Cada função foi separada em arquivo específico.
- Backend: `services`, `controllers`, `routes`, `middlewares`, `utils`
- Frontend: componentes e serviços separados da tela principal

## Acesso local
- Frontend: http://localhost:5173
- Backend: http://localhost:3001
