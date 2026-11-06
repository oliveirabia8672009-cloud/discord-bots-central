import {arquivoDados} from './contexto-bot.js';
import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export type TicketOpcao={id:string;nome:string;descricao:string;emoji:string;categoria:string|null;suporte:string|null;prefixo:string;visualizacao:string[];resposta:string[]};
export type TicketConfig = { arquivoCanal?: string; suporte: string | null; categoria: string | null; arquivos: string | null; logs: string | null; canal: string | null; tituloPublico: string; textoPublico: string; imagemPublica: string; textoPrivado: string; imagemPrivada: string; painelId: string | null; painelCanal: string | null; botaoAbrir:string;tipoAbertura:'botoes'|'menu';textoSeletor:string;opcoes:TicketOpcao[] };
export type TicketVendaConfig={suporte:string|null;categoria:string|null;arquivos:string|null;logs:string|null};
export type Ticket = { tipo?:'suporte'|'venda';vendaConfig?:TicketVendaConfig;opcao?:string;visualizacao?:string[];resposta?:string[];canal: string; autor: string; suporte: string; participantes: string[]; estado: 'aberto' | 'fechado' | 'arquivado'; criado: number; fechado: number | null; fechadoPor: string | null; motivo: string; atendente: string | null; notificadoEm?: number };
export type TicketGuild = { config: TicketConfig; tickets: Record<string, Ticket> };
const configPadrao = (): TicketConfig => ({ suporte:null,categoria:null,arquivos:null,logs:null,canal:null,tituloPublico:'Central de Atendimento',textoPublico:'Precisa de ajuda? Clique em Abrir ticket para falar com nossa equipe em um canal privado.',imagemPublica:'',textoPrivado:'Olá, {usuario}! Descreva sua dúvida e aguarde nossa equipe de suporte.',imagemPrivada:'',painelId:null,painelCanal:null,botaoAbrir:'Abrir ticket',tipoAbertura:'botoes',textoSeletor:'Escolha o tipo de atendimento',opcoes:[] });
export function criarStoreTickets(arquivo = arquivoDados('tickets.json')) {
  let dados: Record<string,TicketGuild> = {};
  if(existsSync(arquivo)) {
    const raw=JSON.parse(readFileSync(arquivo,'utf8'));
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Arquivo de tickets inválido.');
    for(const [id,valor] of Object.entries(raw)) {
      const v=valor as TicketGuild;
      if(!/^\d{17,20}$/.test(id)||!v.config||!v.tickets)throw Error('Configuração de tickets inválida.');
      const c=v.config,idRole=(x:unknown)=>typeof x==='string'&&/^\d{17,20}$/.test(x);
      if(c.tipoAbertura!==undefined&&!['botoes','menu'].includes(c.tipoAbertura)||c.botaoAbrir!==undefined&&(typeof c.botaoAbrir!=='string'||!c.botaoAbrir.trim()||c.botaoAbrir.length>80)||c.textoSeletor!==undefined&&(typeof c.textoSeletor!=='string'||!c.textoSeletor.trim()||c.textoSeletor.length>150))throw Error('Abertura de tickets inválida.');
      if(c.opcoes!==undefined){if(!Array.isArray(c.opcoes)||c.opcoes.length>20||c.opcoes.some(o=>!o||typeof o.id!=='string'||typeof o.nome!=='string'||!o.nome.trim()||o.nome.length>100||typeof o.descricao!=='string'||!o.descricao.trim()||o.descricao.length>100||typeof o.emoji!=='string'||typeof o.prefixo!=='string'||o.prefixo.length>20||o.categoria!==null&&!idRole(o.categoria)||o.suporte!==null&&!idRole(o.suporte)||!Array.isArray(o.visualizacao)||o.visualizacao.length>10||!o.visualizacao.every(idRole)||!Array.isArray(o.resposta)||o.resposta.length>10||!o.resposta.every(idRole)))throw Error('Opções de tickets inválidas.');if(new Set(c.opcoes.map(o=>o.id)).size!==c.opcoes.length)throw Error('Opções de tickets repetidas.');}
      for(const [canal,t] of Object.entries(v.tickets))if(t.canal!==canal||!['aberto','fechado','arquivado'].includes(t.estado)||!Array.isArray(t.participantes))throw Error('Registro de ticket inválido.');
    }
    dados=raw;
  }
  function obter(id:string):TicketGuild {const d=dados[id];return structuredClone({config:{...configPadrao(),...d?.config},tickets:d?.tickets??{}});}
  function gravar(id:string,valor:TicketGuild) {
    const novos={...dados,[id]:valor};mkdirSync(dirname(arquivo),{recursive:true});writeFileSync(arquivo+'.tmp',JSON.stringify(novos,null,2));renameSync(arquivo+'.tmp',arquivo);dados=novos;
  }
  return {
    obter,
    configurar(id:string,patch:Partial<TicketConfig>) {const d=obter(id);d.config={...d.config,...patch};gravar(id,d);},
    salvar(id:string,ticket:Ticket) {const d=obter(id);d.tickets[ticket.canal]=structuredClone(ticket);gravar(id,d);},
  };
}
export type TicketStore = ReturnType<typeof criarStoreTickets>;
