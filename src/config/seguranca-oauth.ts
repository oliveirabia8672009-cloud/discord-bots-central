import {ambienteBot,contextoAtual,noContexto} from './contexto-bot.js';
import {registrarOAuthCentral} from './oauth-central.js';
import {createServer,type Server} from 'node:http';
import {randomBytes} from 'node:crypto';
import {Routes,PermissionFlagsBits as P,type Client} from 'discord.js';
import {cofre,type StoreSeguranca} from './seguranca-store.js';
type Credencial={access:string;refresh:string;expira:number;consentiu:number;guild:string;user:string};
type Opcoes={clientId:string;secret:string;redirect:string;port:number;host:string};
export function configOAuth(env:NodeJS.ProcessEnv=ambienteBot()):Opcoes|null{
  const clientId=env.DISCORD_CLIENT_ID??'',secret=env.DISCORD_CLIENT_SECRET??'',redirect=env.ANZY_OAUTH_REDIRECT_URI??'';
  if(!clientId||!secret||!redirect)return null;
  const u=new URL(redirect),port=Number(env.ANZY_OAUTH_PORT??8787),host=env.ANZY_OAUTH_HOST??'127.0.0.1';
  if((u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)))||u.pathname!=='/oauth/callback'||u.search||u.hash||u.username||u.password||!Number.isInteger(port)||port<1024||port>65535||!['127.0.0.1','0.0.0.0'].includes(host))throw Error('Endereço ou porta OAuth2 inválidos.');
  return{clientId,secret,redirect,port,host};
}
export function instalarOAuth(bot:Client,store:StoreSeguranca,opcoes:Opcoes|null=configOAuth(),http:typeof fetch=fetch,aposAutorizar?:(g:string,u:string)=>Promise<string>){
  const estados=new Map<string,{g:string;u:string;vence:number;versao:number}>(),revogacoes=new Map<string,number>();let server:Server|undefined,disponivel=false,removerCentral:(()=>void)|undefined;
  const tokens=()=>cofre(store.pasta);
  async function token(body:Record<string,string>){
    if(!opcoes)throw Error('OAuth2 ainda não configurado.');
    const r=await http('https://discord.com/api/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...body,client_id:opcoes.clientId,client_secret:opcoes.secret}),signal:AbortSignal.timeout(15000)});
    if(!r.ok)throw Error('Autorização expirada ou recusada. Use /verify novamente.');
    const d=await r.json() as {access_token?:string;refresh_token?:string;expires_in?:number;scope?:string};
    if(!d.access_token||!d.refresh_token||!Number.isFinite(d.expires_in)||d.expires_in!<=0||!d.scope?.split(' ').includes('guilds.join')||!d.scope.split(' ').includes('identify'))throw Error('As permissões de autorização não foram concedidas.');
    return{access:d.access_token,refresh:d.refresh_token,expira:Date.now()+d.expires_in!*1000};
  }
  function emitir(g:string,u:string){
    if(!opcoes||!disponivel)throw Error('OAuth2 indisponível. A programadora precisa configurar o endereço de autenticação e as credenciais.');
    for(const [id,v]of estados)if(v.vence<Date.now())estados.delete(id);
    if(estados.size>=500)throw Error('Muitas solicitações. Tente novamente mais tarde.');
    const state=(contextoAtual()?opcoes.clientId+'.':'')+randomBytes(32).toString('hex');estados.set(state,{g,u,vence:Date.now()+600000,versao:revogacoes.get(g+':'+u)??0});
    const url=new URL('https://discord.com/oauth2/authorize');url.search=new URLSearchParams({client_id:opcoes.clientId,response_type:'code',redirect_uri:opcoes.redirect,scope:'identify guilds.join',state,prompt:'consent'}).toString();return url.toString();
  }
  async function callback(url:URL){
    const state=url.searchParams.get('state')??'',esperado=estados.get(state);estados.delete(state);
    if(!esperado||esperado.vence<Date.now())throw Error('Link inválido, já usado ou expirado. Gere outro com /verify.');
    if(url.searchParams.has('error'))throw Error('Autorização cancelada. Nenhuma permissão foi salva.');
    const code=url.searchParams.get('code');if(!code||code.length>2000)throw Error('Código de autorização inválido.');
    const t=await token({grant_type:'authorization_code',code,redirect_uri:opcoes!.redirect});
    const r=await http('https://discord.com/api/v10/users/@me',{headers:{Authorization:'Bearer '+t.access},signal:AbortSignal.timeout(15000)});
    if(!r.ok)throw Error('Não foi possível confirmar sua identidade.');const user=await r.json() as {id:string};
    if(user.id!==esperado.u)throw Error('Autorize com a mesma conta que executou /verify.');
    const guild=await bot.guilds.fetch(esperado.g);if(!await guild.members.fetch(esperado.u).catch(()=>null))throw Error('Entre no servidor antes de autorizar.');
    if((revogacoes.get(esperado.g+':'+esperado.u)??0)!==esperado.versao)throw Error('Autorização revogada durante a solicitação. Gere outro link.');
    store.autorizar(esperado.g,esperado.u,tokens().cifrar({...t,user:esperado.u,guild:esperado.g,consentiu:Date.now()}));
    let verificacao='';if(aposAutorizar)try{verificacao=await aposAutorizar(esperado.g,esperado.u);}catch{
      console.warn('OAuth2: autorização salva, entrega do cargo de verificação não confirmada. Servidor: '+esperado.g);
      return 'Atenção: a verificação de acesso NÃO foi concluída. A autorização de recuperação foi salva, mas a entrega do cargo configurado não foi confirmada. Conclua a triagem do Discord, se houver, e tente novamente pelo botão de verificação. Se persistir, peça à equipe para conferir o cargo configurado, a hierarquia, Gerenciar cargos e outras automações. Use /revokeauth para apagar o consentimento de recuperação; isso não remove cargos já recebidos.';
    }
    return 'Autorização concluída. Você consentiu em ser readicionado apenas a este mesmo servidor. '+(verificacao||'Nenhum cargo de acesso foi alterado.')+' Use /revokeauth para apagar a autorização de recuperação local; isso não remove cargos já recebidos. Você também pode revogar o aplicativo em Configurações do Discord > Aplicativos autorizados.';
  }
  const restaurando=new Set<string>();
  async function restaurar(g:string,u:string){
    const id=g+':'+u;if(restaurando.has(id))throw Error('Recuperação já em andamento.');restaurando.add(id);
    try{
      if(!opcoes||!disponivel)throw Error('OAuth2 ainda não está disponível.');
      const cifrado=store.obter(g).oauth[u];if(!cifrado)throw Error('Este usuário não autorizou a recuperação neste servidor.');
      let cred=tokens().abrir<Credencial>(cifrado);if(cred.guild!==g||cred.user!==u)throw Error('Autorização de outro servidor.');
      const guild=await bot.guilds.fetch(g);if(await guild.bans.fetch(u).catch(err=>{if(err?.code===10026)return null;throw err;}))throw Error('Usuário banido. A recuperação não remove banimentos.');
      if(await guild.members.fetch(u).catch(err=>{if(err?.code===10007)return null;throw err;}))return 'Este usuário já está no servidor.';
      if(!(await guild.members.fetchMe()).permissions.has([P.CreateInstantInvite,P.BanMembers]))throw Error('O bot precisa de Criar convite e Banir membros para recuperar entradas e conferir banimentos.');
      if(cred.expira<Date.now()+30000){const novo=await token({grant_type:'refresh_token',refresh_token:cred.refresh});if(store.obter(g).oauth[u]!==cifrado)throw Error('Autorização alterada ou revogada.');cred={...cred,...novo};store.autorizar(g,u,tokens().cifrar(cred));}
      if(!store.obter(g).oauth[u])throw Error('Autorização revogada.');
      await bot.rest.put(Routes.guildMember(g,u),{body:{access_token:cred.access}});
      return 'Usuário readicionado sem cargos adicionais. A triagem de membros do servidor continua valendo.';
    }finally{restaurando.delete(id);}
  }
  async function revogar(g:string,u:string){
    revogacoes.set(g+':'+u,(revogacoes.get(g+':'+u)??0)+1);
    const cifra=store.obter(g).oauth[u];store.revogar(g,u);if(!cifra)return;
    if(opcoes)try{const c=tokens().abrir<Credencial>(cifra);await http('https://discord.com/api/oauth2/token/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:opcoes.clientId,client_secret:opcoes.secret,token:c.refresh,token_type_hint:'refresh_token'}),signal:AbortSignal.timeout(10000)});}catch{/* Local consent is already removed. */}
  }
  async function iniciar(){
    if(!opcoes||server||removerCentral)return;
    const ctx=contextoAtual();if(ctx){removerCentral=await registrarOAuthCentral(opcoes, url=>noContexto(ctx,()=>callback(url)));disponivel=true;ctx.limpar.add(()=>{disponivel=false;removerCentral?.();});return;}
    server=createServer((req,res)=>{
      res.setHeader('Content-Type','text/plain; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
      if(req.method!=='GET'||!req.url||req.url.length>4096){res.writeHead(400).end('Requisição inválida.');return;}
      const url=new URL(req.url,'http://localhost');if(url.pathname!=='/oauth/callback'){res.writeHead(404).end('Página não encontrada.');return;}
      void callback(url).then(s=>res.end(s)).catch(()=>{res.writeHead(400).end('Não foi possível concluir a autorização. Gere outro link com /verify e confira a conta e as permissões solicitadas.');});
    });server.requestTimeout=20000;server.headersTimeout=15000;
    await new Promise<void>((resolve,reject)=>{server!.once('error',reject);server!.listen(opcoes.port,opcoes.host,()=>{server!.removeListener('error',reject);disponivel=true;resolve();});});
    server.on('error',()=>{disponivel=false;console.error('Servidor OAuth2 indisponível.');});server.unref();
  }
  return{emitir,callback,restaurar,revogar,iniciar,pronto:()=>disponivel,configurado:()=>!!opcoes,parar:()=>{disponivel=false;removerCentral?.();removerCentral=undefined;server?.close();server=undefined;}};
}
