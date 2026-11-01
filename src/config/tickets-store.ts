import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export type TicketConfig = { arquivoCanal?: string; suporte: string | null; categoria: string | null; arquivos: string | null; logs: string | null; canal: string | null; tituloPublico: string; textoPublico: string; imagemPublica: string; textoPrivado: string; imagemPrivada: string; painelId: string | null; painelCanal: string | null };
export type TicketVendaConfig={suporte:string|null;categoria:string|null;arquivos:string|null;logs:string|null};
export type Ticket = { tipo?:'suporte'|'venda';vendaConfig?:TicketVendaConfig;canal: string; autor: string; suporte: string; participantes: string[]; estado: 'aberto' | 'fechado' | 'arquivado'; criado: number; fechado: number | null; fechadoPor: string | null; motivo: string; atendente: string | null; notificadoEm?: number };
export type TicketGuild = { config: TicketConfig; tickets: Record<string, Ticket> };
const configPadrao = (): TicketConfig => ({ suporte:null,categoria:null,arquivos:null,logs:null,canal:null,tituloPublico:'Central de Atendimento',textoPublico:'Precisa de ajuda? Clique em Abrir ticket para falar com nossa equipe em um canal privado.',imagemPublica:'',textoPrivado:'Olá, {usuario}! Descreva sua dúvida e aguarde nossa equipe de suporte.',imagemPrivada:'',painelId:null,painelCanal:null });
export function criarStoreTickets(arquivo = fileURLToPath(new URL('../../data/tickets.json',import.meta.url))) {
  let dados: Record<string,TicketGuild> = {};
  if(existsSync(arquivo)) {
    const raw=JSON.parse(readFileSync(arquivo,'utf8'));
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Arquivo de tickets inválido.');
    for(const [id,valor] of Object.entries(raw)) {
      const v=valor as TicketGuild;
      if(!/^\d{17,20}$/.test(id)||!v.config||!v.tickets)throw Error('Configuração de tickets inválida.');
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
