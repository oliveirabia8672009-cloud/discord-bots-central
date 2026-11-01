# Discloud: instalação deste bot

Aplicação: `anzy-programs`.
Endereço OAuth2: `https://anzy-programs.discloud.dev/oauth/callback`.
Plano contratado: Platinum. Aplicação configurada com limite de 1024 MB.

## Funcionamento

O bot usa os arquivos da pasta `data` no Discloud como armazenamento principal. O Supabase recebe uma cópia criptografada a cada 30 segundos. Não há conexão direta das operações de venda ao banco Supabase nesta versão. Uma perda total dos arquivos pode perder alterações posteriores à última cópia.

Os dados foram recuperados do computador, incluindo pedidos, configurações, transcrições e a chave interna das autorizações OAuth2. A execução local foi encerrada antes de conectar a instância hospedada.

## Credenciais

As credenciais necessárias estão na configuração privada da aplicação. Neste teste, as variáveis salvas pela API do painel não foram disponibilizadas ao processo, por isso a configuração também foi gravada no `.env` privado da aplicação. A chave administrativa `DISCLOUD_TOKEN` fica apenas no computador e não foi enviada ao bot hospedado.

Não envie `.env`, `data`, backups ou tokens ao GitHub. Preserve `ANZY_BACKUP_KEY`: sem essa chave não é possível recuperar as cópias criptografadas. O arquivo `.env` local mantém a configuração antiga para retorno; não execute o bot local enquanto a instância do Discloud estiver online.

## Atualizar

1. Compile com `npm run build:discloud`.
2. Envie as alterações pela operação **Commit/atualizar arquivos** da aplicação existente. O pacote precisa incluir `build`, `assets`, `package.json`, `package-lock.json`, `start-discloud.mjs` e `discloud.config`. Não use a pasta reservada `dist` para o pacote Discloud.
3. Não exclua ou recrie a aplicação para atualizar. Não envie uma pasta `data` vazia nem um `.env` de exemplo por cima dos dados atuais.
4. Confirme uma cópia recente no Supabase antes de atualizar. Se houver operações em andamento, planeje a breve parada.
5. Reinicie e confira conexão Discord, comandos, OAuth2 e cópia automática.

A instalação atual usa um ZIP já compilado localmente. Não ative deploy automático direto do GitHub sem configurar também a compilação no Discloud.

## Verificações realizadas

- Compilação TypeScript.
- Inicialização em modo de preparação sem criar outro cliente Discord.
- Recuperação de 23 arquivos e comparação dos bytes.
- Preservação dos arquivos e da configuração privada após reinício e atualização por Commit.
- Decifragem da autorização OAuth2 existente com a chave recuperada.
- Conexão ao Discord e registro de comandos.
- Resposta pública do callback OAuth2, recusando solicitações sem estado válido.
- Imagem de perfil em Linux: detectada ausência de texto; corrigida incluindo Noto Sans e sua licença, depois conferida visualmente.

O teste de autorização OAuth2 depende de o usuário concluir o fluxo no Discord. Uma implantação não constitui teste de pagamento bancário real nem de carga com vários bots.
