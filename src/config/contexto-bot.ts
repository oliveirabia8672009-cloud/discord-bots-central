import {AsyncLocalStorage} from 'node:async_hooks';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const local=new AsyncLocalStorage<ContextoBot>();
export const raizDados=fileURLToPath(new URL('../../data',import.meta.url));
export type ContextoBot={id:string;principal:boolean;pasta:string;env:NodeJS.ProcessEnv;limpar:Set<()=>void>;pendentes:Set<Promise<unknown>>;parando:boolean;permitirGuild:(guild:string)=>boolean;podeIdentidade:(user:string)=>boolean;responsavelAcessos?:(guild:string,user:string)=>boolean;vinculoAcessos?:(guild:string)=>string};
export function criarContexto(id:string,env:NodeJS.ProcessEnv,principal=false,permitirGuild:(id:string)=>boolean=()=>true):ContextoBot{
 if(!/^\d{17,20}$/.test(id))throw Error('ID de bot inválido.');
 return{id,env:{...env},principal,pasta:principal?raizDados:join(raizDados,'bots',id),limpar:new Set(),pendentes:new Set(),parando:false,permitirGuild,podeIdentidade:u=>!!env.ANZY_OWNER_ID&&u===env.ANZY_OWNER_ID};
}
export const contextoAtual=()=>local.getStore();
export const noContexto=<T>(ctx:ContextoBot,fn:()=>T):T=>local.run(ctx,fn);
export const ambienteBot=()=>contextoAtual()?.env??process.env;
export function arquivoDados(nome=''){
 const base=contextoAtual()?.pasta??raizDados,p=resolve(base,nome);
 if(p!==resolve(base)&&!p.startsWith(resolve(base)+(process.platform==='win32'?'\\':'/')))throw Error('Caminho fora dos dados do bot.');
 return p;
}
export function intervaloBot(fn:()=>void,ms:number){const t=setInterval(fn,ms);contextoAtual()?.limpar.add(()=>clearInterval(t));return t;}
export function timeoutBot(fn:()=>void,ms:number){const ctx=contextoAtual();const limpar=()=>clearTimeout(t);const t=setTimeout(()=>{ctx?.limpar.delete(limpar);fn();},ms);ctx?.limpar.add(limpar);return t;}
export function rastrearBot<T extends unknown[]>(fn:(...args:T)=>Promise<void>){
 return(...args:T)=>{const ctx=contextoAtual();const p=fn(...args);ctx?.pendentes.add(p);void p.finally(()=>ctx?.pendentes.delete(p)).catch(()=>{});return p;};
}
export function limparContexto(ctx:ContextoBot){for(const fn of ctx.limpar){try{fn();}catch{}}ctx.limpar.clear();}
