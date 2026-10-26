# Deploy em uma VM gratuita

O frontend e a API podem ser servidos pelo mesmo processo Node, em uma única VM. A opção sugerida é uma VM **Oracle Cloud Infrastructure (OCI) Always Free**, sujeita à disponibilidade da região, verificação da conta e aos limites/termos atuais da Oracle. A VM não é garantidamente permanente; mantenha backups externos do banco.

## Antes de publicar

- Use Ubuntu Server LTS e Node.js 22 LTS.
- Configure um domínio/subdomínio com DNS apontando para o IP público da VM. Use HTTPS antes de permitir cadastro ou envio de currículos; não exponha a aplicação com HTTP puro.
- No firewall da Oracle e no firewall do sistema, deixe públicos somente SSH (restrito ao seu IP), HTTP e HTTPS. A API deve permanecer em `127.0.0.1:3001`.
- Não habilite o Playwright em produção. O modo atual abre navegador com interface e não é adequado a uma VM headless nem envia formulários.
- `JWT_SECRET`, credenciais e dados de usuários nunca devem entrar no Git, frontend, logs ou mensagens.

## Instalação na VM

Clone o repositório em `/opt/jobhunter`, instale as dependências e gere o frontend:

```bash
sudo apt update
sudo apt install -y nginx sqlite3
sudo mkdir -p /opt/jobhunter /var/lib/jobhunter /etc/jobhunter
sudo useradd --system --home /opt/jobhunter --shell /usr/sbin/nologin jobhunter
sudo chown -R jobhunter:jobhunter /opt/jobhunter /var/lib/jobhunter
```

Instale Node.js 22 LTS a partir de uma fonte oficial confiável. Em seguida, dentro do clone:

```bash
cd /opt/jobhunter/backend
npm ci
cd /opt/jobhunter/frontend
npm ci
npm run build
```

Crie `/etc/jobhunter/job.env` com permissões restritas (não copie o segredo local de desenvolvimento):

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=3001
JWT_SECRET=COLOQUE_AQUI_UM_SEGREDO_ALEATORIO_DE_PELO_MENOS_32_CARACTERES
DB_CLIENT=sqlite
DB_FILE=/var/lib/jobhunter/jobHunterAI.sqlite
AUTOMATION_ENABLED=false
CORS_ORIGINS=
OLLAMA_BASE_URL=http://127.0.0.1:11434/api/generate
OLLAMA_MODEL=llama3.1
```

Gere o valor sem imprimi-lo em um comando de histórico:

```bash
openssl rand -hex 48
sudo install -o root -g jobhunter -m 0640 /dev/null /etc/jobhunter/job.env
sudoedit /etc/jobhunter/job.env
```

Confirme que o arquivo contém um `JWT_SECRET` próprio com pelo menos 32 caracteres. O servidor recusa inicialização sem esse segredo. SQLite e perfis de usuário devem permanecer em `/var/lib/jobhunter`, que é persistido e gravável pelo serviço.

Instale o serviço e o Nginx:

```bash
sudo install -o root -g root -m 0644 /opt/jobhunter/deployment/jobhunter.service /etc/systemd/system/jobhunter.service
sudo systemctl daemon-reload
sudo systemctl enable --now jobhunter
sudo install -o root -g root -m 0644 /opt/jobhunter/deployment/nginx-site.conf /etc/nginx/sites-available/jobhunter
```

Edite `server_name` em `/etc/nginx/sites-available/jobhunter` para o seu domínio, habilite a configuração e obtenha HTTPS com Certbot/Let's Encrypt:

```bash
sudo ln -s /etc/nginx/sites-available/jobhunter /etc/nginx/sites-enabled/jobhunter
sudo nginx -t
sudo systemctl reload nginx
```

Instale Certbot usando o método oficial recomendado para sua versão do Ubuntu, depois execute `sudo certbot --nginx -d seu-dominio.example`. Verifique a renovação automática do certificado. Não considere o site pronto até que HTTP redirecione para HTTPS e o certificado esteja válido.

## Verificações pós-deploy e operação

```bash
sudo systemctl status jobhunter --no-pager
curl --fail https://seu-dominio.example/api/health
sudo journalctl -u jobhunter -n 100 --no-pager
```

Faça backup regular e criptografado do SQLite (idealmente com `sqlite3 ... ".backup ..."`) e teste a restauração. Restrinja os arquivos de backup e retenha apenas pelo período necessário. Atualize dependências e sistema operacional, monitore espaço em disco e não use cópia direta do banco enquanto há gravações concorrentes. A hospedagem gratuita tem limites de disponibilidade e capacidade.

O deploy final ainda exige que o proprietário crie/verifique a conta OCI, escolha região e domínio, configure DNS e guarde o segredo. Nenhuma conta, credencial ou publicação é criada por este repositório.
