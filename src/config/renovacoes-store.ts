import {randomUUID} from 'node:crypto';
import {existsSync,readFileSync,mkdirSync,writeFileSync,renameSync} from 'node:fs';
import {dirname} from 'node:path';
import {arquivoDados} from './contexto-bot.js';
import {precoCentavos} from './vendas-store.js';
import type {FormaPagamento} from './pagamentos-loja.js';
export const DIA=86400000;
export type PlanoRenovacao={id:string;nome:string;dias:number;preco:number;ativo:boolean};
export type EventoAssinatura={id:string;tipo:string;quando:number;ator:string;motivo:string;anterior:number;novo:number;valor?:number;pedido?:string};
export type AvisoRenovacao={canal?:boolean;dm?:boolean;dono?:boolean;tentativa:number;proxima:number;erro?:string};
export type AssinaturaBot={plano:PlanoRenovacao;vencimento:number;inicio:number;bloqueada:boolean;manual:boolean;pausadoAutomaticamente:boolean;aplicadas:string[];historico:EventoAssinatura[];avisos:Record<string,AvisoRenovacao>};
export type PedidoRenovacao={venda?:string;id:string;bot:string;comprador:string;plano:PlanoRenovacao;criado:number;estado:'pendente'|'informado'|'aprovado'|'cancelado';forma?:FormaPagamento;comprovante?:string;aprovado?:number;vencimento?:number;responsavel?:string;avisado?:boolean};
export type OfertaBots={titulo:string;texto:string;imagem:string;botao:string;produto:string|null;planos:string[];canal:string|null;mensagem:string|null};
type Meta={versao:1;oferta?:OfertaBots;planos:Record<string,PlanoRenovacao>;vinculos:Record<string,{plano:string;desde:number}>;pedidos:Record<string,PedidoRenovacao>;config:{tolerancia:number;suspender:boolean;logs:string|null;painelCanal:string|null;painelMensagem:string|null}};
const padrao=():Meta=>({versao:1,planos:{},vinculos:{},pedidos:{},config:{tolerancia:3,suspender:true,logs:null,painelCanal:null,painelMensagem:null}});
export function validarPlano(nome:string,dias:string,preco:string){if(!nome.trim()||nome.trim().length>60||!/^\d+$/.test(dias)||Number(dias)<1||Number(dias)>3660)throw Error('Informe nome, duração de 1 a 3660 dias e preço como 29,90.');return{nome:nome.trim(),dias:Number(dias),preco:precoCentavos(preco)};}
export function dataVencimento(texto:string){const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto.trim());if(!m)throw Error('Use a data no formato DD/MM/AAAA.');const d=Number(m[1]),mes=Number(m[2]),ano=Number(m[3]),base=new Date(Date.UTC(ano,mes-1,d));if(ano<2020||ano>2100||base.getUTCDate()!==d||base.getUTCMonth()!==mes-1)throw Error('Data inválida.');return Date.UTC(ano,mes-1,d,26,59,59);}
export function formatarData(n:number){return new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric'}).format(n);}
export function situacaoAssinatura(a:AssinaturaBot|undefined,tolerancia=3,agora=Date.now()){if(!a)return'Sem assinatura';if(a.manual)return'Suspensa pela programadora';if(a.bloqueada)return'Suspensa por vencimento';if(agora>a.vencimento+tolerancia*DIA)return'Vencida';if(agora>a.vencimento)return'Em tolerância';if(a.vencimento-agora<=7*DIA)return'Próxima do vencimento';return'Ativa';}
export function validarAssinatura(a:AssinaturaBot){if(!a||!Number.isSafeInteger(a.vencimento)||a.vencimento<1||!Number.isFinite(a.inicio)||typeof a.manual!=='boolean'||typeof a.bloqueada!=='boolean'||typeof a.pausadoAutomaticamente!=='boolean'||!Array.isArray(a.aplicadas)||a.aplicadas.length>1000||!Array.isArray(a.historico)||a.historico.length>300||!a.avisos||typeof a.avisos!=='object'||!a.plano?.id||!Number.isSafeInteger(a.plano.preco)||a.plano.preco<1||!Number.isSafeInteger(a.plano.dias)||a.plano.dias<1||a.plano.dias>3660)throw Error('Assinatura inválida.');}
export function criarStoreRenovacoes(arquivo=arquivoDados('renovacoes.json')){
 let d=padrao(),carregado=false;function carregar(){if(carregado)return;if(existsSync(arquivo)){const raw=JSON.parse(readFileSync(arquivo,'utf8'));if(raw.versao!==1||!raw.planos||!raw.pedidos||!raw.vinculos)throw Error('Dados de renovações inválidos.');d={...d,...raw,config:{...d.config,...raw.config}};}carregado=true;}
 function salvar(fn:(draft:Meta)=>void){carregar();const next=structuredClone(d);fn(next);mkdirSync(dirname(arquivo),{recursive:true});writeFileSync(arquivo+'.tmp',JSON.stringify(next));renameSync(arquivo+'.tmp',arquivo);d=next;}
 return{
  obter:()=>{carregar();return structuredClone(d);},
  plano:(nome:string,dias:string,preco:string,id?:string)=>{const dados=validarPlano(nome,dias,preco),key=id??randomUUID().slice(0,8);salvar(x=>{if(!id&&Object.keys(x.planos).length>=20)throw Error('Limite de 20 planos; edite um existente.');if(id&&!x.planos[id])throw Error('Plano não encontrado.');x.planos[key]={id:key,...dados,ativo:x.planos[key]?.ativo??true};});return key;},
  ativarPlano:(id:string)=>salvar(x=>{const p=x.planos[id];if(!p)throw Error('Plano indisponível.');p.ativo=!p.ativo;}),
  vincular:(produto:string,plano:string,agora=Date.now())=>salvar(x=>{if(!x.planos[plano]?.ativo)throw Error('Selecione um plano ativo.');x.vinculos[produto]={plano,desde:agora};}),
  oferta:(patch:Partial<OfertaBots>)=>salvar(x=>{x.oferta={titulo:'Seu bot personalizável',texto:'Escolha seu plano e adquira seu bot Anzy Programs.',imagem:'',botao:'Adquirir seu bot',produto:null,planos:[],canal:null,mensagem:null,...x.oferta,...patch};}),
  cancelarDoBot:(bot:string)=>salvar(x=>{for(const p of Object.values(x.pedidos))if(p.bot===bot&&['pendente','informado'].includes(p.estado))p.estado='cancelado';}),
  configurar:(patch:Partial<Meta['config']>)=>salvar(x=>{if(patch.tolerancia!==undefined&&(!Number.isSafeInteger(patch.tolerancia)||patch.tolerancia<0||patch.tolerancia>30))throw Error('Tolerância: de 0 a 30 dias.');x.config={...x.config,...patch};}),
  solicitar:(bot:string,comprador:string,plano:PlanoRenovacao,agora=Date.now(),venda?:string)=>{let resultado:PedidoRenovacao|undefined;salvar(x=>{resultado=Object.values(x.pedidos).find(p=>p.bot===bot&&['pendente','informado'].includes(p.estado));if(resultado){if(resultado.comprador!==comprador)throw Error('Comprador divergente.');return;}resultado={id:randomUUID().slice(0,12),bot,comprador,plano:structuredClone(plano),criado:agora,estado:'pendente'};if(venda)resultado.venda=venda;x.pedidos[resultado.id]=resultado;});return structuredClone(resultado!);},
  pedido:(id:string,fn:(pedido:PedidoRenovacao)=>void)=>{let resultado:PedidoRenovacao;salvar(x=>{const p=x.pedidos[id];if(!p)throw Error('Pedido de renovação não encontrado.');fn(p);resultado=p;});return structuredClone(resultado!);},
 };
}
export type StoreRenovacoes=ReturnType<typeof criarStoreRenovacoes>;
