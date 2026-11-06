import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {ChannelType,EmbedBuilder,type Client} from 'discord.js';
import {escreverAtomico} from './seguranca-store.js';
import {raizDados} from './contexto-bot.js';
import type {GerenteCentral} from '../central.js';

export type Comunicado={id:string;titulo:string;descricao:string};
type Entrega={bot:string;servidor:string;estado:'enviado'|'falha';mensagem?:string;erro?:string};
type Registro=Record<string,Entrega[]>;
const arquivo=join(raizDados,'comunicados-globais.json');
const emEnvio=new Set<string>();
export function destinosComunicado(g:GerenteCentral){return Object.values(g.bots()).filter(b=>b.venda?.guildDestino&&['reservado','vendido'].includes(b.estado)).map(b=>({bot:b.id,servidor:b.venda!.guildDestino!}));}
export async function enviarComunicado(g:GerenteCentral,c:Comunicado,opcoes:{arquivo?:string;cliente?:(id:string)=>Client|undefined}={}){
 const destinoArquivo=opcoes.arquivo??arquivo,ler=():Registro=>existsSync(destinoArquivo)?JSON.parse(readFileSync(destinoArquivo,'utf8')):{};
 const resultados:Entrega[]=[];const lista=destinosComunicado(g);
 for(const destino of lista){
  const chave=destino.bot+':'+destino.servidor;
  const trava=c.id+':'+chave;
  if(ler()[c.id]?.some(e=>e.bot+':'+e.servidor===chave&&e.estado==='enviado'))continue;
  if(emEnvio.has(trava))continue;
  emEnvio.add(trava);
  let entrega:Entrega={...destino,estado:'falha'};
  try{
   const id=g.canalComunicados?.(destino.bot,destino.servidor),bot=opcoes.cliente?.(destino.bot)??g.botPorId?.(destino.bot);
   if(!id)throw Error('Canal de avisos não configurado.');
   if(!bot?.isReady())throw Error('Bot offline.');
   const canal=await bot.channels.fetch(id);
   if(!canal||canal.type!==ChannelType.GuildText||canal.guildId!==destino.servidor)throw Error('Canal de avisos indisponível neste servidor.');
   const mensagem=await canal.send({embeds:[new EmbedBuilder().setColor(0x5865f2).setTitle(c.titulo).setDescription(c.descricao).setFooter({text:'Anzy Programs • Comunicado'})],allowedMentions:{parse:[]}});
   entrega={...destino,estado:'enviado',mensagem:mensagem.id};
  }catch(err){entrega.erro=err instanceof Error?err.message:'Falha desconhecida.';}
  try{const dados=ler();dados[c.id]??=[];dados[c.id]!.push(entrega);escreverAtomico(destinoArquivo,dados);resultados.push(entrega);}finally{emEnvio.delete(trava);}
 }
 return{total:lista.length,resultados,jaEnviados:lista.length-resultados.length};
}
