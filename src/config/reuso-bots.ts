import {randomBytes,randomUUID} from 'node:crypto';
import {existsSync,readdirSync,mkdirSync,renameSync,writeFileSync} from 'node:fs';
import {join,resolve,sep} from 'node:path';
import {REST,Routes} from 'discord.js';
import {configNuvem,criarCopiaNuvem} from './nuvem.js';
import {raizDados} from './contexto-bot.js';
import type {BotEstoque,RegistroCentral} from './central-store.js';
import type {AssinaturaBot} from './renovacoes-store.js';
export type ArquivoClienteBot={id:string;quando:number;motivo:string;chave:string;modulo:string;venda:NonNullable<BotEstoque['venda']>;assinatura?:AssinaturaBot};
export type PreparacaoReuso=ArquivoClienteBot&{arquivado?:boolean;identidade?:boolean};
export type DepsReuso={nomeOriginal?:(b:BotEstoque)=>Promise<string>;parar:(id:string)=>Promise<void>;arquivar:(b:BotEstoque,p:PreparacaoReuso)=>Promise<void>;desvincular:(b:BotEstoque)=>Promise<void>;identidade:(b:BotEstoque)=>Promise<void>;cancelarPedidos:(id:string)=>void;adotar:(b:BotEstoque)=>void};
export async function prepararReuso(registro:RegistroCentral,id:string,ator:string,motivo:string,deps:DepsReuso){
 const atual=(await registro.listar())[id];if(!atual?.venda&&!atual?.reuso)throw Error('Este bot não está associado a um cliente.');if(atual.ativo)throw Error('Pause o bot antes de preparar a reutilização.');if(!motivo.trim())throw Error('Informe o motivo do encerramento.');
 const nomeOriginal=atual.nomeOriginal??(atual.nome!=='Anzy Programs'?atual.nome:await deps.nomeOriginal?.(atual));if(!nomeOriginal?.trim())throw Error('Não foi possível recuperar o nome original.');
 let b=await registro.alterar(id,x=>{x.nomeOriginal??=nomeOriginal;if(x.ativo)throw Error('Pause o bot antes de continuar.');if(!x.reuso){if(!x.venda)throw Error('Cliente não encontrado.');if((x.arquivos?.length??0)>=20)throw Error('Limite de 20 arquivos por bot. Exporte os arquivos anteriores antes de continuar.');x.reuso={id:randomUUID().replaceAll('-',''),quando:Date.now(),motivo:ator+': '+motivo.trim().slice(0,300),chave:x.chave,modulo:x.backupModulo??'backup_arquivos_v1',venda:structuredClone(x.venda),...(x.assinatura?{assinatura:structuredClone(x.assinatura)}:{})};}});deps.adotar(b);await deps.parar(id);
 if(!b.reuso!.arquivado){await deps.arquivar(b,b.reuso!);b=await registro.alterar(id,x=>{if(x.reuso?.id!==b.reuso!.id)throw Error('Preparação alterada.');x.reuso.arquivado=true;});deps.adotar(b);}
 await deps.desvincular(b);
 if(!b.reuso!.identidade){await deps.identidade(b);b=await registro.alterar(id,x=>{if(x.reuso?.id!==b.reuso!.id)throw Error('Preparação alterada.');x.reuso.identidade=true;});deps.adotar(b);}
 deps.cancelarPedidos(id);
 const pronto=await registro.alterar(id,x=>{if(!x.reuso?.arquivado||!x.reuso.identidade||x.reuso.id!==b.reuso!.id)throw Error('Preparação incompleta.');const a=x.reuso;x.arquivos=[...(x.arquivos??[]),{id:a.id,quando:a.quando,motivo:a.motivo,chave:a.chave,modulo:a.modulo,venda:a.venda,...(a.assinatura?{assinatura:a.assinatura}:{})}];x.chave=randomBytes(32).toString('hex');x.backupModulo='backup_arquivos_v1_'+a.id;x.ativo=false;x.iniciado=false;x.estado='teste';x.nome=x.nomeOriginal!;delete x.venda;delete x.assinatura;delete x.produto;delete x.reuso;});deps.adotar(pronto);return pronto;
}
export async function arquivarDadosReuso(env:NodeJS.ProcessEnv,b:BotEstoque,p:PreparacaoReuso,base=raizDados,http:typeof fetch=fetch){
 if(!/^\d{17,20}$/.test(b.id)||!/^[a-f0-9]{32}$/.test(p.id))throw Error('Identificador de arquivo inválido.');const raiz=resolve(base),pasta=resolve(raiz,'bots',b.id),arquivo=resolve(raiz,'bots-arquivados',b.id,p.id);if(!pasta.startsWith(raiz+sep)||!arquivo.startsWith(raiz+sep))throw Error('Caminho fora dos dados da central.');
 const op=configNuvem({...env,ANZY_CLOUD_BACKUP:'true',DISCORD_CLIENT_ID:b.id,ANZY_BACKUP_KEY:p.chave,ANZY_BACKUP_MODULE:p.modulo},pasta);if(!op)throw Error('Backup não configurado.');const copia=criarCopiaNuvem(op,http);await copia.preparar(false);
 if(!existsSync(arquivo)){
  if(existsSync(pasta)&&readdirSync(pasta).length){await copia.salvar();if(!await copia.ler())throw Error('Cópia não confirmada.');mkdirSync(resolve(arquivo,'..'),{recursive:true});renameSync(pasta,arquivo);}
  else{if(!await copia.ler())throw Error('Sem cópia recuperável; preparação interrompida.');mkdirSync(arquivo,{recursive:true});writeFileSync(join(arquivo,'arquivo-cloud.json'),JSON.stringify({modulo:p.modulo,bot:b.id}));}
 }else if(!await copia.ler())throw Error('Cópia arquivada não encontrada.');
 if(existsSync(pasta)&&readdirSync(pasta).some(n=>n!=='cores.json'))throw Error('A pasta ativa tem novos dados. Preparação interrompida para conferência.');mkdirSync(pasta,{recursive:true});writeFileSync(join(pasta,'cores.json'),'{}',{mode:0o600});
}
export async function sairServidoresAntigos(b:BotEstoque,controle:string){const rest=new REST().setToken(b.token),guilds=await rest.get(Routes.userGuilds(),{query:new URLSearchParams({limit:'200'})}) as {id:string}[];for(const guild of guilds)if(guild.id!==controle)await rest.delete(Routes.userGuild(guild.id));}
export async function recuperarNomeOriginal(b:BotEstoque,http:typeof fetch=fetch){
 if(b.nomeOriginal?.trim())return b.nomeOriginal;
 if(b.nome.trim()&&b.nome!=='Anzy Programs')return b.nome;
 const r=await http('https://discord.com/api/v10/oauth2/applications/@me',{headers:{Authorization:'Bot '+b.token},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Não foi possível consultar o nome original do aplicativo.');const app=await r.json() as {id:string;name:string};if(app.id!==b.id||typeof app.name!=='string'||!app.name.trim())throw Error('Nome original indisponível.');return app.name.slice(0,80);
}
export async function resetarIdentidadeBot(b:BotEstoque,avatarUrl:string,http:typeof fetch=fetch,restFactory=(token:string)=>new REST().setToken(token)){const url=new URL(avatarUrl);if(url.protocol!=='https:'||url.hostname!=='cdn.discordapp.com')throw Error('Imagem da marca indisponível.');const nome=await recuperarNomeOriginal(b,http);const r=await http(url,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Imagem da marca indisponível.');const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length>2*1024*1024)throw Error('Imagem da marca excede o limite.');const rest=restFactory(b.token);await rest.patch(Routes.user('@me'),{body:{username:nome.trim().slice(0,32).padEnd(2,'_'),avatar:'data:image/png;base64,'+bytes.toString('base64')}});}
