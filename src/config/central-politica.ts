import type {BotEstoque} from './central-store.js';
export const LIMITE_ESTOQUE=50;
export function limiteConexoes(env:NodeJS.ProcessEnv=process.env){const n=Number(env.ANZY_MAX_BOTS??LIMITE_ESTOQUE+1);if(!Number.isInteger(n)||n<1||n>LIMITE_ESTOQUE+1)throw Error('Limite de conexões: de 1 a 51, incluindo o bot principal.');return n;}
export function disponivelParaVenda(b:BotEstoque){return b.estado==='disponivel'&&!b.venda&&!b.reuso;}
export function executarBot(b:BotEstoque){return b.ativo&&b.estado!=='suspenso'&&!b.assinatura?.bloqueada&&!b.reuso;}
