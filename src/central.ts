import {limiteConexoes,executarBot,LIMITE_ESTOQUE} from './config/central-politica.js';
import {prepararReuso,arquivarDadosReuso,sairServidoresAntigos,resetarIdentidadeBot,recuperarNomeOriginal} from './config/reuso-bots.js';
import {join} from 'node:path';
import {criarStoreOutros} from './config/outros.js';
import {instalarRenovacoes} from './config/renovacoes.js';
import {existsSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import {Client,Events} from 'discord.js';
import {iniciarBot} from './bot-runtime.js';
import {criarContexto,noContexto,limparContexto,raizDados,type ContextoBot} from './config/contexto-bot.js';
import {criarRegistroCentral,type BotEstoque} from './config/central-store.js';
import {configNuvem,criarCopiaNuvem} from './config/nuvem.js';
import {pararOAuthCentral} from './config/oauth-central.js';
import {instalarPainelCentral} from './config/central-painel.js';
import {instalarDistribuicaoBots} from './config/central-entrega.js';

export type Runtime=Awaited<ReturnType<typeof iniciarBot>>;
export async function iniciarCentral(env:NodeJS.ProcessEnv=process.env){
 const id=env.DISCORD_CLIENT_ID??'',multiplo=env.ANZY_MULTIBOT==='true',controle=env.ANZY_CENTRAL_GUILD_ID??'';
 let dono=env.ANZY_OWNER_ID??'';
 if(multiplo&&(!/^\d{17,20}$/.test(dono)||!/^\d{17,20}$/.test(controle)))throw Error('Configure o dono e o servidor privado da central antes de ativar vários bots.');
 const registro=multiplo?criarRegistroCentral(env):null;
 let cache:Record<string,BotEstoque>={},cacheVersao=0,atualizando=false,encerrando=false;
 const reutilizando=new Set<string>();
 const ativos=new Map<string,{runtime:Runtime;ctx:ContextoBot;assinatura:string}>(),erros=new Map<string,{quando:number;mensagem:string}>();
 const max=limiteConexoes(env);
 const rootCtx=criarContexto(id,env,true);
 const reutilizar=async(botId:string,motivo:string)=>{if(!registro)throw Error('Central indisponível.');if(reutilizando.has(botId))throw Error('Preparação já em andamento.');reutilizando.add(botId);try{return await prepararReuso(registro,botId,dono,motivo,{nomeOriginal:b=>recuperarNomeOriginal(b),adotar:b=>{cache[b.id]=structuredClone(b);cacheVersao++;},parar:async id=>{while(atualizando)await new Promise(r=>setTimeout(r,20));const a=ativos.get(id);if(a){await a.runtime.parar();ativos.delete(id);}},arquivar:(b,p)=>arquivarDadosReuso(env,b,p),desvincular:b=>sairServidoresAntigos(b,controle),identidade:b=>{const bot=ativos.get(id)?.runtime.bot;if(!bot?.user)throw Error('Bot principal indisponível.');return resetarIdentidadeBot(b,bot.user.displayAvatarURL({extension:'png',forceStatic:true,size:128}));},cancelarPedidos:id=>renovacoes!.store.cancelarDoBot(id)});}finally{reutilizando.delete(botId);}};
 const gerente={capacidade:()=>({cadastrados:Object.keys(cache).length,maxCadastro:LIMITE_ESTOQUE,conectados:ativos.size,maxConexoes:max}),retornoOAuth:env.ANZY_OAUTH_REDIRECT_URI??'',reutilizar,registro,dono,controle,principal:id,bots:()=>structuredClone(cache),adotar:(b:BotEstoque)=>{cache[b.id]=structuredClone(b);cacheVersao++;},online:(id:string)=>ativos.get(id)?.runtime.bot.isReady()??false,noControle:(id:string)=>ativos.get(id)?.runtime.bot.guilds.cache.has(controle)??false,erro:(id:string)=>erros.get(id)?.mensagem??'',atualizar:async()=>{await atualizar();},principalBot:()=>ativos.get(id)?.runtime.bot,botPorId:(botId:string)=>ativos.get(botId)?.runtime.bot,loja:()=>ativos.get(id)?.runtime.storeVendas,canalComunicados:(botId:string,guild:string)=>ativos.get(botId)?.runtime.canalComunicados(guild)??criarStoreOutros(join(raizDados,'bots',botId,'outros.json')).obter(guild).avisos};
 const painel=multiplo?instalarPainelCentral(gerente):null;
 const renovacoes=multiplo?instalarRenovacoes(gerente):null;
 const extra=painel&&renovacoes?{comandos:[...painel.comandos,...renovacoes.comandos],tratar:async(i:Parameters<typeof painel.tratar>[0])=>await renovacoes.tratar(i)||await painel.tratar(i)}:painel;
 const root=await noContexto(rootCtx,()=>iniciarBot(env,rootCtx,extra??undefined));ativos.set(id,{runtime:root,ctx:rootCtx,assinatura:'principal'});
 async function prepararDados(ctx:ContextoBot,b:BotEstoque){
  if(existsSync(ctx.pasta)&&readdirSync(ctx.pasta).length)return;
  const op=configNuvem(ctx.env,ctx.pasta);if(!op)throw Error('Backup do bot precisa estar habilitado.');
  const nuvem=criarCopiaNuvem(op),copia=await nuvem.ler();
  if(copia){await nuvem.preparar(true);return;}
  if(b.iniciado)throw Error('Este bot já foi iniciado e não possui cópia recuperável.');
  mkdirSync(ctx.pasta,{recursive:true});writeFileSync(ctx.pasta+'/cores.json','{}',{flag:'wx',mode:0o600});
 }
 async function atualizar(){
  if(!registro||atualizando||encerrando)return;atualizando=true;
  try{
   const antes=cacheVersao,recebido=await registro.listar();if(antes===cacheVersao)cache=recebido;
   for(const [botId,a]of ativos){if(botId===id)continue;const b=cache[botId];const assinatura=b?JSON.stringify([b.token,b.secret,b.chave]):'';if(!b||!executarBot(b)||reutilizando.has(botId)||assinatura!==a.assinatura){await a.runtime.parar();ativos.delete(botId);}else{for(const g of a.runtime.bot.guilds.cache.values())if(!a.ctx.permitirGuild(g.id))await g.leave().catch(()=>{});}}
   for(const b of Object.values(cache)){
    if(encerrando||!executarBot(b)||reutilizando.has(b.id)||ativos.has(b.id))continue;
    if(ativos.size>=max){erros.set(b.id,{quando:Date.now(),mensagem:'Limite de bots simultâneos atingido.'});continue;}
    if((erros.get(b.id)?.quando??0)>Date.now()-60000)continue;
    const tenantEnv={...env,DISCORD_CLIENT_ID:b.id,DISCORD_BOT_TOKEN:b.token,DISCORD_CLIENT_SECRET:b.secret,ANZY_BACKUP_KEY:b.chave,ANZY_BACKUP_MODULE:b.backupModulo??'backup_arquivos_v1',ANZY_CLOUD_BACKUP:'true',ANZY_RESTORE_IF_EMPTY:'true'};
    const ctx=criarContexto(b.id,tenantEnv,false,g=>g===controle||cache[b.id]?.estado==='vendido'&&cache[b.id]?.venda?.guildDestino===g);
    ctx.podeIdentidade=u=>u===dono||cache[b.id]?.venda?.comprador===u;
    ctx.responsavelAcessos=(guild,user)=>user===dono&&(guild===controle||guild===cache[b.id]?.venda?.guildDestino)||guild===cache[b.id]?.venda?.guildDestino&&user===cache[b.id]?.venda?.comprador;
    ctx.vinculoAcessos=guild=>JSON.stringify([b.id,guild,cache[b.id]?.venda?.pedido??'estoque',cache[b.id]?.venda?.comprador??'',cache[b.id]?.venda?.guildDestino??'']);
    try{
     await prepararDados(ctx,b);const runtime=await noContexto(ctx,()=>iniciarBot(tenantEnv,ctx,renovacoes?.cliente));ativos.set(b.id,{runtime,ctx,assinatura:JSON.stringify([b.token,b.secret,b.chave])});erros.delete(b.id);
     if(!b.iniciado){await registro.alterar(b.id,x=>{x.iniciado=true;});cache[b.id]!.iniciado=true;}
     console.log('Bot da central conectado: '+b.id);
    }catch{const atual=ativos.get(b.id);if(atual){await atual.runtime.parar().catch(()=>{});ativos.delete(b.id);}limparContexto(ctx);erros.set(b.id,{quando:Date.now(),mensagem:'Falha ao conectar. Confira token, intents, OAuth2 e cópia de recuperação.'});console.error('Não foi possível iniciar bot da central: '+b.id);}
   }
  }catch{console.error('Não foi possível atualizar o cadastro central. Instâncias existentes preservadas.');}
  finally{atualizando=false;}
 }
 if(registro){await atualizar();}
 const distribuicao=registro?instalarDistribuicaoBots(root.bot,root.storeVendas,registro,gerente,rootCtx,true,root.concluirEntrega,root.atualizarProduto):null;
 const timerRenovacoes=renovacoes?setInterval(()=>{void noContexto(rootCtx,()=>renovacoes.servico.tick()).catch(()=>console.warn('Renovações aguardam nova tentativa.'));},60000):null;timerRenovacoes?.unref();if(renovacoes)void noContexto(rootCtx,()=>renovacoes.servico.tick()).catch(()=>console.warn('Renovações aguardam nova tentativa.'));
 const timer=setInterval(()=>{void atualizar();},15000);timer.unref();
 async function parar(){if(encerrando)return;encerrando=true;clearInterval(timer);if(timerRenovacoes)clearInterval(timerRenovacoes);await renovacoes?.servico.parar();await distribuicao?.parar();while(atualizando)await new Promise(r=>setTimeout(r,20));for(const a of ativos.values())await a.runtime.parar().catch(()=>{});ativos.clear();await pararOAuthCentral();}
 process.once('SIGTERM',()=>{void parar().then(()=>process.exit(0));});process.once('SIGINT',()=>{void parar().then(()=>process.exit(0));});
 return{parar,gerente,ativos};
}
export type GerenteCentral={capacidade?:()=>{cadastrados:number;maxCadastro:number;conectados:number;maxConexoes:number};retornoOAuth?:string;reutilizar?:(id:string,motivo:string)=>Promise<BotEstoque>;registro:ReturnType<typeof criarRegistroCentral>|null;dono:string;controle:string;principal:string;bots:()=>Record<string,BotEstoque>;adotar:(b:BotEstoque)=>void;online:(id:string)=>boolean;noControle:(id:string)=>boolean;erro:(id:string)=>string;atualizar:()=>Promise<void>;principalBot:()=>Client|undefined;botPorId?:(id:string)=>Client|undefined;loja:()=>Runtime['storeVendas']|undefined;canalComunicados?:(id:string,guild:string)=>string|null};
