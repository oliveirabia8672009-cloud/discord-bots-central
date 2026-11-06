import {arquivoDados} from './contexto-bot.js';
import {existsSync,readFileSync,mkdirSync,writeFileSync,renameSync} from 'node:fs';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
export type GrupoMembros='interacoes'|'diversao'|'jogos'|'perfis';
export type ConfigMembros={grupos:GrupoMembros[];xp:boolean;canalNivel:string|null;canaisXP:string[];cooldown:number;invites:boolean;logsInvites:string|null};
type Perfil={xp:number;mensagens:number;ultimoXP:number;bloqueia:boolean};
export type OrigemConvite={convidador:string|null;fonte:'convite'|'personalizado'|'desconhecido'|'bot';quando:number;presente:boolean;entradas:number};
export type BaseConvites={codigos:Record<string,{usos:number;convidador:string|null}>;personalizado:number|null};
type Dados={config:ConfigMembros;perfis:Record<string,Perfil>;entradas:Record<string,OrigemConvite>};
const configPadrao=():ConfigMembros=>({grupos:['interacoes','diversao','jogos','perfis'],xp:false,canalNivel:null,canaisXP:[],cooldown:60,invites:false,logsInvites:null});
const padrao=():Dados=>({config:configPadrao(),perfis:{},entradas:{}});
const perfilPadrao=():Perfil=>({xp:0,mensagens:0,ultimoXP:0,bloqueia:false});
export const nivelXP=(xp:number)=>Math.floor(Math.sqrt(Math.max(0,xp)/100));
export const minimoXP=(nivel:number)=>100*nivel*nivel;
export function identificarConvite(antes:BaseConvites|undefined,depois:BaseConvites,quantidade:number):Pick<OrigemConvite,'convidador'|'fonte'>{
 if(!antes||quantidade!==1)return{convidador:null,fonte:'desconhecido'};
 const diferencas=Object.entries(depois.codigos).flatMap(([codigo,v])=>{const a=antes.codigos[codigo];return a&&v.usos>a.usos?[{...v,delta:v.usos-a.usos}]:[];});
 const personalizado=antes.personalizado!==null&&depois.personalizado!==null?depois.personalizado-antes.personalizado:0;
 if(diferencas.length===1&&diferencas[0]!.delta===1&&personalizado===0&&diferencas[0]!.convidador)return{convidador:diferencas[0]!.convidador,fonte:'convite'};
 if(diferencas.length===0&&personalizado===1)return{convidador:null,fonte:'personalizado'};
 return{convidador:null,fonte:'desconhecido'};
}
export function criarStoreMembros(arquivo=arquivoDados('membros.json')){
 let dados:Record<string,Dados>=existsSync(arquivo)?JSON.parse(readFileSync(arquivo,'utf8')):{};
 const obter=(g:string):Dados=>structuredClone(dados[g]??padrao());
 const perfil=(g:string,u:string):Perfil=>structuredClone(dados[g]?.perfis[u]??perfilPadrao());
 function alterar<T>(g:string,fn:(d:Dados)=>T){const d=obter(g),r=fn(d),novos={...dados,[g]:d};mkdirSync(dirname(arquivo),{recursive:true});writeFileSync(arquivo+'.tmp',JSON.stringify(novos,null,2));renameSync(arquivo+'.tmp',arquivo);dados=novos;return structuredClone(r);}
 return{obter,perfil,ids:()=>Object.keys(dados),
 configurar:(g:string,c:Partial<ConfigMembros>)=>alterar(g,d=>{const n={...d.config,...c};if(!Number.isInteger(n.cooldown)||n.cooldown<60||n.cooldown>3600||n.grupos.some(x=>!['interacoes','diversao','jogos','perfis'].includes(x)))throw Error('Configuração de membros inválida.');d.config=n;}),
 preferencias:(g:string,u:string,bloqueia:boolean)=>alterar(g,d=>{d.perfis[u]={...perfilPadrao(),...d.perfis[u],bloqueia};}),
 ganharXP:(g:string,u:string,canal:string,agora=Date.now())=>alterar(g,d=>{
  const c=d.config,p={...perfilPadrao(),...d.perfis[u]};
  if(!c.xp||c.canaisXP.length&&!c.canaisXP.includes(canal)||p.ultimoXP&&agora-p.ultimoXP<c.cooldown*1000)return null;
  const antes=nivelXP(p.xp);p.xp=Math.min(1_000_000_000,p.xp+20);p.mensagens++;p.ultimoXP=agora;d.perfis[u]=p;return{antes,depois:nivelXP(p.xp),perfil:p};
 }),
 entrar:(g:string,u:string,origem:Pick<OrigemConvite,'convidador'|'fonte'>,agora=Date.now())=>alterar(g,d=>{
  const p=d.entradas[u];if(p?.presente)return p;
  const valido=origem.convidador&&origem.convidador!==u;
  const o:OrigemConvite=p?{...p,presente:true,entradas:p.entradas+1}:{...origem,convidador:valido?origem.convidador:null,quando:agora,presente:true,entradas:1};d.entradas[u]=o;return o;
 }),
 sair:(g:string,u:string)=>alterar(g,d=>{const p=d.entradas[u];if(p)p.presente=false;}),
 conviteResumo:(g:string,u:string)=>{const lista=Object.values(obter(g).entradas).filter(x=>x.convidador===u&&x.fonte==='convite');return{total:lista.length,ativos:lista.filter(x=>x.presente).length,saidas:lista.filter(x=>!x.presente).length};},
 };
}
