import {SlashCommandBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle,EmbedBuilder,MessageFlags,StringSelectMenuBuilder,type Interaction} from 'discord.js';
import {emojiTexto as e,emojiComponente as ic,type EmojiAnzy} from './emojis.js';
export const comandoAjuda=new SlashCommandBuilder().setName('help').setDescription('Mostra todos os comandos por categoria, com explicações rápidas.').setDMPermission(false);
type Definicao={name:string;description?:string;type?:number;default_member_permissions?:string|null};
const categorias:{id:string;nome:string;emoji:EmojiAnzy;descricao:string;nomes:string[]}[]=[
 {id:'geral',nome:'Ajuda e configuração',emoji:'configuracoes',descricao:'Orientação e configurações gerais. Configurar o bot e exportar emojis exige administrador.',nomes:['help','ping','configbot','listaremojis']},
 {id:'compras',nome:'Compras e saldo',emoji:'loja',descricao:'Comandos para compradores. /rank é a classificação de compras, não de XP.',nomes:['pedido','minhascompras','saldo','carrinho','robux','rank']},
 {id:'vendas',nome:'Gestão da loja',emoji:'vendas',descricao:'Comandos de administração da loja. Para configurar, é necessário ser administrador.',nomes:['panel','produto','pedidos','relatoriovendas']},
 {id:'tickets',nome:'Tickets e atendimento',emoji:'tickets',descricao:'Atendimento privado. As ações são limitadas ao autor ou à equipe autorizada; fechamento em massa exige administrador.',nomes:['add_ticket','close_ticket','archive_ticket','managetickets','ticketstaff','closealltickets']},
 {id:'moderacao',nome:'Moderação',emoji:'moderacao',descricao:'Exige a permissão correspondente do Discord, a equipe configurada e respeito à hierarquia dos cargos.',nomes:['ban','unban','kick','timeout','untimeout','warn','warnings','removewarn','clear','lock','unlock','slowmode','modhistory']},
 {id:'seguranca',nome:'Segurança e verificação',emoji:'permissoes',descricao:'Configuração administrativa, verificação OAuth2 e recuperação consentida. /restoremember é exclusivo do dono.',nomes:['security','verify','revokeauth','restoremember']},
 {id:'interacoes',nome:'Interações e reações',emoji:'equipe',descricao:'GIFs de anime e interações com membros, respeitando as preferências pessoais e o intervalo entre usos.',nomes:['hug','highfive','pat','wave','happy','sad','laugh','dance','interactions']},
 {id:'diversao',nome:'Diversão',emoji:'eventos',descricao:'Sorteios e respostas para brincar. Estes comandos não fornecem orientação para decisões importantes.',nomes:['coinflip','dice','choose','8ball']},
 {id:'jogos',nome:'Jogos rápidos',emoji:'confirmar',descricao:'Jogos com botões. Desafios entre membros precisam ser aceitos e as partidas têm prazo para terminar.',nomes:['rps','tictactoe','quiz']},
 {id:'perfis',nome:'Perfis e informações',emoji:'avatar',descricao:'Consulte avatares, informações públicas e o cartão de perfil.',nomes:['avatar','userinfo','serverinfo','profile']},
 {id:'xp',nome:'XP e níveis',emoji:'historico',descricao:'O administrador precisa ativar o XP no /configbot. Este ranking é separado do ranking de compras.',nomes:['level','leaderboard']},
 {id:'convites',nome:'Convites',emoji:'canais',descricao:'Depende da ativação do acompanhamento. A contagem começa na ativação e o convidador é estimado quando identificável.',nomes:['invites','invitetop','inviter']},
 {id:'contexto',nome:'Menu de aplicativos',emoji:'categoria',descricao:'Estas ações não começam com /. Clique com o botão direito no membro ou mensagem e procure Aplicativos / Apps.',nomes:[]},
];
const resumos:Record<string,string>={
 help:'Abre esta ajuda por categorias.',ping:'Confere se o bot está respondendo.',configbot:'Abre a central administrativa dos sistemas.',listaremojis:'Exporta os emojis personalizados do servidor.',
 panel:'Abre o painel de administração da loja.',rank:'Mostra a classificação dos clientes por compras.',produto:'Cria ou gerencia um produto.',pedidos:'Abre a gestão de pagamentos e entregas.',relatoriovendas:'Consulta e exporta os resultados da loja.',
 ban:'Bane um membro após confirmação.',unban:'Remove um banimento pelo ID do usuário.',kick:'Expulsa um membro após confirmação.',timeout:'Silencia um membro por um período.',untimeout:'Remove o silêncio temporário.',warn:'Registra uma advertência.',warnings:'Consulta as advertências de um membro.',removewarn:'Remove uma advertência pelo número do caso.',clear:'Apaga mensagens recentes após confirmação.',lock:'Bloqueia novas mensagens para @everyone no canal.',unlock:'Restaura a permissão anterior ao trancamento.',slowmode:'Define o intervalo entre mensagens do canal.',modhistory:'Consulta o histórico de moderação de um membro.',
 verify:'Autoriza a verificação e a recuperação da conta neste servidor.',revokeauth:'Apaga seu consentimento de recuperação, sem remover o cargo recebido.',restoremember:'Dono: readiciona um membro que autorizou a recuperação.',
 'Compras':'Consulta as compras do membro pelo menu Aplicativos.',
};
export function catalogoAjuda(comandos:{toJSON:()=>unknown}[]){
 const vistos=new Set<string>();
 const defs=comandos.map(c=>c.toJSON() as Definicao).filter(c=>{const chave=(c.type??1)+':'+c.name;if(vistos.has(chave))return false;vistos.add(chave);return true;});
 return categorias.map(c=>({...c,comandos:defs.filter(d=>c.id==='contexto'?(d.type??1)!==1:(d.type??1)===1&&(c.nomes.includes(d.name)||c.id==='geral'&&!categorias.some(x=>x.nomes.includes(d.name)))).sort((a,b)=>a.name.localeCompare(b.name)),})).filter(c=>c.comandos.length);
}
export function instalarAjuda(comandos:{toJSON:()=>unknown}[],cor:(g:string|null)=>number){
 const catalogo=catalogoAjuda(comandos),total=catalogo.reduce((n,c)=>n+c.comandos.length,0);
 const botao=(id:string,label:string,emoji:EmojiAnzy='voltar')=>new ButtonBuilder().setCustomId('hlp:'+id).setLabel(label).setEmoji(ic(emoji)).setStyle(ButtonStyle.Secondary);
 function tela(g:string|null,categoria='inicio',pagina=0){
  const cat=catalogo.find(c=>c.id===categoria);if(categoria!=='inicio'&&!cat)throw Error('Categoria de ajuda inválida.');
  const paginas=cat?Math.max(1,Math.ceil(cat.comandos.length/8)):1;pagina=Math.max(0,Math.min(pagina,paginas-1));
  const descricao=cat?`${cat.descricao}\n\n──────────────\n${cat.comandos.slice(pagina*8,pagina*8+8).map(c=>`${e('voltar')} **${(c.type??1)===1?'/':''}${c.name}** — ${resumos[c.name]??c.description??'Ação pelo menu de aplicativos.'}`).join('\n\n')}\n\n-# Página ${pagina+1}/${paginas}`:
   `Encontre os **${total} comandos e ações** do bot em um só lugar.\n\n${e('loja')} **Loja e atendimento**\nCompras, vendas, pagamentos e tickets.\n\n${e('moderacao')} **Administração e segurança**\nConfigurações, moderação e verificação.\n\n${e('equipe')} **Para os membros**\nInterações, diversão, jogos, perfis, XP e convites.\n\n──────────────\nEscolha uma categoria no menu abaixo. Cada comando tem uma explicação curta.\n-# A ajuda lista todos os comandos. O uso depende das permissões e dos sistemas ativados no servidor.`;
  const menu=new StringSelectMenuBuilder().setCustomId('hlp:categoria').setPlaceholder('Escolha uma categoria de comandos').addOptions(catalogo.map(c=>({label:c.nome,value:c.id,description:c.comandos.length+' '+(c.comandos.length===1?'comando ou ação':'comandos e ações'),emoji:ic(c.emoji),default:c.id===categoria})));
  const rows:ActionRowBuilder<any>[]=[new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)];
  if(cat&&paginas>1)rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(botao('pagina:'+cat.id+':'+(pagina-1),'Anterior').setDisabled(pagina===0),botao('pagina:'+cat.id+':'+(pagina+1),'Próxima').setDisabled(pagina+1>=paginas)));
  rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(botao('inicio','Início da ajuda','inicio').setDisabled(!cat),botao('fechar','Fechar ajuda','fechar')));
  return{embeds:[new EmbedBuilder().setColor(cor(g)).setTitle(e(cat?.emoji??'configuracoes')+' '+(cat?cat.nome:'Central de ajuda • /help')).setDescription(descricao).setFooter({text:'Anzy Programs • Comandos e orientações'})],components:rows,allowedMentions:{parse:[] as never[]}};
 }
 async function tratar(i:Interaction):Promise<boolean>{
  const cmd=i.isChatInputCommand()&&i.commandName==='help',custom='customId'in i?i.customId:'';if(!cmd&&!custom.startsWith('hlp:'))return false;
  try{
   if(!i.inGuild()||!i.isRepliable())throw Error('Use /help dentro de um servidor.');
   if(cmd){await i.deferReply({flags:MessageFlags.Ephemeral});await i.editReply(tela(i.guildId));return true;}
   if(!i.isMessageComponent())throw Error('Abra a ajuda novamente com /help.');
   await i.deferUpdate();
   if(custom==='hlp:fechar'){await i.editReply({content:e('fechar')+' Ajuda fechada. Use /help quando precisar.',embeds:[],components:[]});return true;}
   if(custom==='hlp:inicio'){await i.editReply(tela(i.guildId));return true;}
   if(custom==='hlp:categoria'&&i.isStringSelectMenu()){await i.editReply(tela(i.guildId,i.values[0]));return true;}
   if(custom.startsWith('hlp:pagina:')&&i.isButton()){const [, ,cat,pg]=custom.split(':');const n=Number(pg);if(!Number.isSafeInteger(n)||!cat)throw Error('Página inválida.');await i.editReply(tela(i.guildId,cat,n));return true;}
   throw Error('Opção de ajuda inválida.');
  }catch{if(i.isRepliable()){const p={content:e('erro')+' Não foi possível abrir essa página. Use /help novamente.',embeds:[],components:[]};if(i.deferred||i.replied)await i.editReply(p);else await i.reply({...p,flags:MessageFlags.Ephemeral});}return true;}
 }
 return{tratar,tela,catalogo};
}
