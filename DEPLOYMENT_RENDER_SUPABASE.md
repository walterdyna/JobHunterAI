# Publicar no Render + Supabase (planos gratuitos)

Essa opção mantém o backend Express atual no Render e usa o PostgreSQL persistente do Supabase. São dois provedores, ambos com limites do plano gratuito. O Render Free suspende serviços inativos e o sistema de arquivos local é efêmero; por isso, esta configuração usa Supabase em vez de SQLite.

## Limitações importantes do plano gratuito

- O Render pode levar cerca de um minuto para iniciar um serviço suspenso após inatividade. O plano gratuito não é recomendado pelo Render para produção.
- O Supabase Free inclui 500 MB de banco e pode pausar projetos sem atividade por uma semana. O plano grátis não inclui backups automáticos; exporte e teste backups próprios.
- Ambos os provedores podem alterar limites e condições. Não armazene dados sensíveis de usuários reais sem decidir antes como fazer backup e recuperação. Currículos podem conter dados pessoais.
- A automação Playwright fica desativada. Este app abre um navegador com interface e não é compatível com a execução headless do serviço Render.

## Configuração

1. Crie um projeto Supabase Free. Em **Connect**, copie a connection string PostgreSQL do **Session pooler** (IPv4 compatível), não publique nem envie essa URL em mensagens. A senha do banco deve estar codificada corretamente para URL.
2. Crie uma conta Render e conecte o repositório GitHub. Como os dados locais de usuários e SQLite foram retirados do Git, o deploy começa com uma base vazia; não envie os arquivos locais de dados.
3. No Render, crie um Web Service e use o Blueprint `render.yaml` deste repositório. Se a interface perguntar, confirme o plano Free.
4. Cadastre `DATABASE_URL` nas variáveis do serviço usando a connection string do Supabase. O Blueprint gera um `JWT_SECRET` aleatório e configura `NODE_ENV=production`, `HOST=0.0.0.0`, `DB_CLIENT=postgres` e automação desativada.
5. Inicie o deploy. O backend cria o schema/tabelas ausentes no primeiro startup. Acompanhe os logs e o health check `/api/health`.
6. Abra a URL `*.onrender.com` gerada pelo Render. O frontend é construído e servido pelo próprio backend. HTTPS é fornecido pelo domínio padrão do Render. Não é obrigatório comprar domínio próprio.

## Depois do primeiro deploy

- Confirme que `/api/health` responde, cadastre um usuário de teste e valide login, criação de vaga/candidatura, histórico, logout e novo login.
- Confirme no painel Supabase que as tabelas foram criadas e mantenha o projeto ativo; o Free pode pausá-lo após uma semana sem atividade.
- Configure exportações recorrentes do banco e teste uma restauração antes de cadastrar usuários reais. O serviço Free do Supabase não inclui backups automáticos.
- Configure alertas e limites de uso. Não habilite upgrades pagos sem autorização explícita do proprietário.

O deploy efetivo exige que o usuário crie os projetos/contas e conecte o repositório. Nunca compartilhe `DATABASE_URL`, senha do banco nem tokens de conta no chat.
