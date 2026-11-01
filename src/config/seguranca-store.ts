import {existsSync,readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,createCipheriv,createDecipheriv,createHash} from 'node:crypto';
export const pastaSeguranca=fileURLToPath(new URL('../../data/seguranca',import.meta.url));
export type MudancaVerificacao={canal:string;alvo:string;antes:boolean|null;depois:boolean};
export const mensagemVerificacaoPadrao=()=>({titulo:'Verificação + OAuth2',texto:'Clique no botão abaixo para verificar sua conta na página oficial do Discord e liberar seu acesso aos canais protegidos.',imagem:'',botao:'Verificar minha conta',painel:null as {canal:string;mensagem:string}|null});
export type ConfigSeguranca={mensagemVerificacao:ReturnType<typeof mensagemVerificacaoPadrao>;verificacao:{canal:string|null;cargo:string|null;ativo:boolean;mudancas:MudancaVerificacao[]};logs:string|null;raid:boolean;limite:number;janela:number;conter:boolean;staff:boolean;cargos:string[];confiaveis:string[];fraude:boolean;valor:number;dias:number;tentativas:number;backupHoras:number;ultimoBackup:number;proximaTentativa:number};
export type Incidente={id:string;tipo:string;texto:string;quando:number};
type D={config:ConfigSeguranca;incidentes:Incidente[];revisoes:Record<string,{assinatura:string;ator:string;motivo:string;quando:number}>;oauth:Record<string,string>};
const padrao=():D=>({config:{mensagemVerificacao:mensagemVerificacaoPadrao(),verificacao:{canal:null,cargo:null,ativo:false,mudancas:[]},logs:null,raid:false,limite:5,janela:10,conter:false,staff:false,cargos:[],confiaveis:[],fraude:false,valor:50000,dias:7,tentativas:3,backupHoras:0,ultimoBackup:0,proximaTentativa:0},incidentes:[],revisoes:{},oauth:{}});
export function escreverAtomico(arquivo:string,valor:unknown){mkdirSync(dirname(arquivo),{recursive:true});writeFileSync(arquivo+'.tmp',JSON.stringify(valor,null,2),{mode:0o600});renameSync(arquivo+'.tmp',arquivo);}
export function criarStoreSeguranca(pasta=pastaSeguranca){
  const arquivo=join(pasta,'config.json');let dados:Record<string,D>=existsSync(arquivo)?JSON.parse(readFileSync(arquivo,'utf8')):{};
  const obter=(g:string):D=>{const d=dados[g],base=padrao();const c=d?{...base,...d,config:{...base.config,...d.config}}:base;return structuredClone({...c,config:{...c.config,mensagemVerificacao:{...mensagemVerificacaoPadrao(),...c.config.mensagemVerificacao}}});};
  function alterar<T>(g:string,fn:(d:D)=>T){const d=obter(g),r=fn(d),novos={...dados,[g]:d};escreverAtomico(arquivo,novos);dados=novos;return r;}
  return{pasta,obter,configurar:(g:string,p:Partial<ConfigSeguranca>)=>alterar(g,d=>{Object.assign(d.config,p);}),
    incidente:(g:string,tipo:string,texto:string)=>alterar(g,d=>{const i={id:randomBytes(8).toString('hex'),tipo,texto,quando:Date.now()};d.incidentes.push(i);d.incidentes=d.incidentes.slice(-200);return i;}),
    revisar:(g:string,id:string,assinatura:string,ator:string,motivo:string)=>alterar(g,d=>{d.revisoes[id]={assinatura,ator,motivo,quando:Date.now()};}),
    autorizar:(g:string,u:string,cifrado:string)=>alterar(g,d=>{d.oauth[u]=cifrado;}),
    revogar:(g:string,u:string)=>alterar(g,d=>{delete d.oauth[u];}),ids:()=>Object.keys(dados),
  };
}
export type StoreSeguranca=ReturnType<typeof criarStoreSeguranca>;
export function cofre(pasta=pastaSeguranca){
  mkdirSync(pasta,{recursive:true});const arquivo=join(pasta,'chave-local');
  if(!existsSync(arquivo))writeFileSync(arquivo,randomBytes(32),{flag:'wx',mode:0o600});
  const chave=readFileSync(arquivo);if(chave.length!==32)throw Error('Chave local de segurança inválida.');
  return{cifrar:(v:unknown)=>{const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',chave,iv);return Buffer.concat([iv,c.update(JSON.stringify(v),'utf8'),c.final(),c.getAuthTag()]).toString('base64');},
    abrir:<T>(s:string):T=>{const b=Buffer.from(s,'base64');if(b.length<29)throw Error('Arquivo cifrado inválido.');const c=createDecipheriv('aes-256-gcm',chave,b.subarray(0,12));c.setAuthTag(b.subarray(-16));return JSON.parse(Buffer.concat([c.update(b.subarray(12,-16)),c.final()]).toString('utf8')) as T;}};
}
export type VendaRisco={id:string;cliente:string;total:number;criado:number;estado:string};
export const assinaturaRisco=(o:VendaRisco)=>createHash('sha256').update(JSON.stringify([o.id,o.cliente,o.total,o.criado,o.estado])).digest('hex');
export function analisarRisco(o:VendaRisco,todos:VendaRisco[],c:ConfigSeguranca,agora=Date.now()){
  const motivos:string[]=[];
  if(o.total>=c.valor)motivos.push('Valor igual ou acima do limite de conferência.');
  const nascimento=Number((BigInt(o.cliente)>>22n)+1420070400000n);
  if(agora-nascimento<c.dias*86400000)motivos.push('Conta do Discord criada recentemente.');
  if(todos.filter(x=>x.cliente===o.cliente&&x.criado>=o.criado-600000&&x.criado<=o.criado&&x.estado!=='rascunho').length>=c.tentativas)motivos.push('Várias solicitações do mesmo cliente em 10 minutos.');
  return motivos;
}


