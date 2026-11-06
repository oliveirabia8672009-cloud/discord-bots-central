import {ChannelType,EmbedBuilder,PermissionFlagsBits as P,type Guild} from 'discord.js';
import {type criarStoreVendas,type Produto} from './vendas-store.js';

export async function atualizarEstoqueAutomatico(guild:Guild,store:ReturnType<typeof criarStoreVendas>,agora=Date.now()){
  const loja=store.obter(guild.id),config=loja.config.estoqueAutomatico;
  if(!config?.ativo||!config.canal||!config.produtos.length||agora-config.atualizado<config.intervaloMinutos*60_000)return false;
  const canal=await guild.channels.fetch(config.canal);
  if(!canal||canal.type!==ChannelType.GuildText)throw Error('Canal de atualização de estoque indisponível.');
  const membro=await guild.members.fetchMe();
  if(!canal.permissionsFor(membro).has([P.ViewChannel,P.SendMessages,P.EmbedLinks,P.ReadMessageHistory]))throw Error('Faltam permissões para atualizar a mensagem de estoque.');
  const linhas=config.produtos.map(id=>loja.produtos[id]).filter((p):p is Produto=>Boolean(p&&!p.arquivado)).map(p=>{
    const total=p.variacoes.length?p.variacoes.reduce((s,v)=>s+v.estoque,0):p.estoque;
    return `**${p.nome.replace(/[\r\n]/g,' ').slice(0,100)}** — ${p.ativo?total+' unidades':'pausado'}`;
  });
  const embed=new EmbedBuilder().setColor(0x5865f2).setTitle('ESTOQUE DISPONÍVEL').setDescription(linhas.join('\n')||'Nenhum produto disponível.').setFooter({text:'Anzy Program • estoque da loja'}).setTimestamp(agora);
  let mensagem;
  if(config.mensagem){try{mensagem=await canal.messages.fetch(config.mensagem);}catch(err){if(!(typeof err==='object'&&err&&'code'in err&&err.code===10008))throw err;}}
  if(mensagem)await mensagem.edit({embeds:[embed]});else mensagem=await canal.send({embeds:[embed]});
  store.marcarEstoqueAutomatico(guild.id,config.canal,mensagem.id,agora);
  return true;
}
