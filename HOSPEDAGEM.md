# Hospedar este bot

## O que está preparado

O Railway executa o bot. Um volume permanente em `/app/data` guarda todos os dados ativos: lojas, saldos, pedidos, tickets, transcrições, configurações e autorizações OAuth2. O Supabase guarda uma cópia criptografada desses arquivos, separada por ID do bot.

Esta versão **não transforma o Supabase no banco operacional das vendas**. A cópia automática ocorre a cada 30 segundos enquanto o bot está ligado. Se o volume inteiro for perdido, mudanças posteriores à última cópia podem não ser recuperadas. Há uma cópia atual por bot no Supabase; configure também backups do volume no Railway.

## Publicar no Railway

1. Envie somente o código ao repositório privado. Nunca envie `.env`, `data`, `backups`, `logs` ou `node_modules`. O Docker também exclui esses arquivos.
2. Crie um serviço no Railway conectado ao repositório. Ele usará o `Dockerfile`.
3. Antes de iniciar o bot, adicione um volume montado exatamente em `/app/data`. Use **uma réplica por bot**.
4. Configure as variáveis abaixo no Railway copiando os valores do `.env` local diretamente para o painel. Não envie os valores na conversa.

| Variável | Valor |
| --- | --- |
| DISCORD_CLIENT_ID | ID do aplicativo |
| DISCORD_BOT_TOKEN | Token deste bot |
| ANZY_OWNER_ID | Dono autorizado |
| DISCORD_CLIENT_SECRET | Segredo OAuth2 deste aplicativo |
| SUPABASE_URL | URL já configurada |
| SUPABASE_SECRET_KEY | Chave secreta já configurada |
| ANZY_BACKUP_KEY | Chave de recuperação já gerada no `.env`; preserve exatamente o valor atual |
| ANZY_CLOUD_BACKUP | `true` |
| ANZY_RESTORE_IF_EMPTY | `true` |
| ANZY_OAUTH_HOST | `0.0.0.0` |
| ANZY_OAUTH_PORT | `8787` |
| ANZY_OAUTH_REDIRECT_URI | `https://DOMINIO-DO-SERVICO/oauth/callback` |

5. Gere um domínio público para a porta **8787**. Cadastre a URL completa `/oauth/callback` também no Discord Developer Portal, seção OAuth2 > Redirects. O endereço temporário do Cloudflare será substituído.
6. Durante a troca, pare o bot local, execute `npm run cloud:backup` e confirme com `npm run cloud:check`. Só então inicie o serviço no Railway. Não deixe os dois usando o mesmo token.
7. Na primeira inicialização com volume vazio, o serviço recupera a cópia do próprio bot **antes de conectar ao Discord**. Se faltarem a cópia ou a chave correta, a inicialização falha em vez de criar uma loja vazia.
8. Confira logs de inicialização, `/help`, `/configbot`, catálogo, pedidos e verificação OAuth2. O pagamento bancário continua com as modalidades que já estavam implementadas; hospedagem não adiciona integração bancária automática.

## Recuperação e manutenção

- `npm run build`: compila o projeto.
- `npm start`: executa a versão compilada; não use enquanto outro processo deste bot estiver conectado.
- `npm run cloud:backup`: envia uma cópia criptografada pontual.
- `npm run cloud:check`: baixa e valida a cópia sem modificar os arquivos locais.
- `npm run cloud:restore`: recupera somente em pasta `data` vazia. Não sobrescreve dados existentes.

Se o Supabase ficar indisponível durante o funcionamento, o bot mantém os dados no volume e tenta novamente a cada 30 segundos. A primeira inicialização com a cópia em nuvem habilitada exige conexão e chave válida. Se houver conflito entre instâncias, a cópia para de ser atualizada até investigar e reiniciar uma única instância.

Guarde `ANZY_BACKUP_KEY` em um local privado além do computador. Sem essa chave, a cópia do Supabase não pode ser decifrada. As autorizações OAuth2 também dependem da chave local interna, incluída **dentro da cópia criptografada**.

Cada novo bot deve ter serviço, volume, credenciais Discord e chave de recuperação próprios. É possível usar o mesmo projeto Supabase, com registros separados por ID do aplicativo. Ainda não há provisionamento automático de bots nem site administrativo neste repositório.
