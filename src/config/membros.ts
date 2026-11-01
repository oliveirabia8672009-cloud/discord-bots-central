import {randomInt,randomBytes} from 'node:crypto';
import {ActionRowBuilder,AttachmentBuilder,ButtonBuilder,ButtonStyle,ChannelSelectMenuBuilder,ChannelType,EmbedBuilder,Events,MessageFlags,PermissionFlagsBits as P,SlashCommandBuilder,StringSelectMenuBuilder,escapeMarkdown,type Client,type Guild,type GuildMember,type Interaction,type Message} from 'discord.js';
import {emojiTexto as e,emojiComponente as ic} from './emojis.js';
import {criarStoreMembros,nivelXP,identificarConvite,type GrupoMembros,type BaseConvites} from './membros-store.js';
import {imagemPerfil} from './membros-imagem.js';
import {criarFonteGifs,textoAnime,type AcaoAnime} from './membros-gifs.js';
import {vencedorVelha,resultadoRps,perguntasQuiz} from './membros-jogos.js';
const interacoes={hug:['Abraço','abraçou'],highfive:['Bate aqui!','cumprimentou'],pat:['Carinho','fez carinho em'],wave:['Olá!','acenou para']} as const;
const reacoes={happy:['Feliz','está feliz'],sad:['Triste','está precisando de um abraço'],laugh:['Risada','caiu na risada'],dance:['Dança','entrou no ritmo']} as const;
const grupos:Record<string,GrupoMembros>={...Object.fromEntries([...Object.keys(interacoes),...Object.keys(reacoes)].map(n=>[n,'interacoes'])),coinflip:'diversao',dice:'diversao',choose:'diversao','8ball':'diversao',rps:'jogos',tictactoe:'jogos',quiz:'jogos',avatar:'perfis',userinfo:'perfis',serverinfo:'perfis',profile:'perfis'};
const descricoes:Record<string,string>={hug:'Dê um abraço em um membro.',highfive:'Cumprimente um membro.',pat:'Faça carinho em um membro.',wave:'Acene para um membro.',happy:'Compartilhe sua alegria.',sad:'Expresse como você está se sentindo.',laugh:'Compartilhe uma risada.',dance:'Entre no ritmo.',coinflip:'Jogue cara ou coroa.',dice:'Role dados de 2 a 100 lados.',choose:'Sorteie uma opção da sua lista.', '8ball':'Receba uma resposta divertida para sua pergunta.',rps:'Jogue pedra, papel e tesoura contra o bot.',tictactoe:'Jogue jogo da velha contra o bot ou outro membro.',quiz:'Responda a uma pergunta de conhecimentos gerais.',avatar:'Veja o avatar de um membro.',userinfo:'Veja informações de um membro.',serverinfo:'Veja informações deste servidor.',profile:'Veja um cartão de perfil com XP e convites.',level:'Consulte seu nível e XP.',leaderboard:'Veja o ranking de XP do servidor.',invites:'Consulte os convites únicos acompanhados.',invitetop:'Veja o ranking de convites acompanhados.',inviter:'Veja a origem de entrada identificada de um membro.',interactions:'Permita ou bloqueie interações direcionadas a você.'};
export const comandosMembros=Object.entries(descricoes).map(([n,d])=>{
 const c=new SlashCommandBuilder().setName(n).setDescription(d).setDMPermission(false);
 if(n in interacoes||n==='tictactoe'||['avatar','userinfo','profile','level','invites','inviter'].includes(n))c.addUserOption(o=>o.setName('member').setDescription(n==='tictactoe'?'Adversário; deixe vazio para jogar contra o bot.':'Membro do servidor.').setRequired(n in interacoes||n==='inviter'));
 if(n==='dice')c.addIntegerOption(o=>o.setName('sides').setDescription('Número de lados (padrão 6).').setMinValue(2).setMaxValue(100));
 if(n==='choose')c.addStringOption(o=>o.setName('options').setDescription('Separe de 2 a 20 opções por |, por exemplo: azul | verde.').setRequired(true).setMaxLength(1000));
 if(n==='8ball')c.addStringOption(o=>o.setName('question').setDescription('Uma pergunta para brincar; não use como orientação para decisões importantes.').setRequired(true).setMaxLength(300));
 if(n==='interactions')c.addStringOption(o=>o.setName('mode').setDescription('Permitir ou bloquear abraços, cumprimentos e desafios.').setRequired(true).addChoices({name:'Permitir',value:'on'},{name:'Bloquear',value:'off'}));
 return c;
});
type Jogo={id:string;guild:string;autor:string;outro:string;tipo:'rps'|'velha'|'quiz';fase:'espera'|'jogo'|'fim';vez:number;tab:number[];quiz:number;respondeu:Set<string>;expira:number};
const safe=(s:string,n=1500)=>escapeMarkdown(s.replaceAll('@','@\u200b')).slice(0,n);
export function instalarMembros(bot:Client,cor:(g:string|null)=>number,store=criarStoreMembros(),agora:()=>number=Date.now,gifs=criarFonteGifs()){
 const jogos=new Map<string,Jogo>(),cooldowns=new Map<string,number>(),bases=new Map<string,BaseConvites>(),filas=new Map<string,GuildMember[]>(),processando=new Set<string>(),timers=new Map<string,ReturnType<typeof setTimeout>>();
 const retribuicoes=new Map<string,{guild:string;autor:string;alvo:string|null;acao:AcaoAnime;tipo:'direta'|'junto';usados:Set<string>;expira:number}>();
 const emb=(g:string,t:string,d:string)=>new EmbedBuilder().setColor(cor(g)).setTitle(e('equipe')+' '+t).setDescription(d).setFooter({text:'Anzy Programs • Membros'});
 const b=(id:string,label:string,icon:Parameters<typeof ic>[0]='voltar')=>new ButtonBuilder().setCustomId('mb:'+id).setLabel(label).setStyle(ButtonStyle.Secondary).setEmoji(ic(icon));
 const row=(...bs:ButtonBuilder[])=>new ActionRowBuilder<ButtonBuilder>().addComponents(bs);
 const payload=(g:string,t:string,d:string,rows:ActionRowBuilder<any>[]=[])=>( {embeds:[emb(g,t,d)],components:rows,allowedMentions:{parse:[] as never[]}} );
 async function responder(i:any,p:any,privado=false){if(i.deferred||i.replied)await i.editReply(p);else await i.reply({...p,...privado?{flags:MessageFlags.Ephemeral}:{}});}
 const back=()=>row(b('config','Interações, XP e convites','configuracoes'),b('close','Fechar','fechar'));
 function painel(g:string){const c=store.obter(g).config;return payload(g,'Interações, XP e convites',`${e('voltar')} **Comandos:** ${c.grupos.join(', ')||'desativados'}.\n${e('voltar')} **XP:** ${c.xp?'ativo':'desativado'}; 20 pontos por mensagem elegível a cada ${c.cooldown} segundos.\n${e('voltar')} **Aviso de nível:** ${c.canalNivel?'<#'+c.canalNivel+'>':'não configurado'}.\n${e('voltar')} **Convites:** ${c.invites?'acompanhamento ativo':'desativado'}.\n\nEscolha uma seção. Não há enquetes, sugestões ou aniversários.`,[new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId('mb:configmenu').setPlaceholder('Escolha o que configurar').addOptions([{label:'Grupos de comandos',value:'grupos',emoji:ic('equipe')},{label:'XP e avisos de nível',value:'xp',emoji:ic('eventos')},{label:'Acompanhamento de convites',value:'convites',emoji:ic('historico')},{label:'Ver comandos disponíveis',value:'comandos',emoji:ic('configuracoes')}])),row(b('close','Fechar configurações','fechar'))]);}
 function xpPainel(g:string){const c=store.obter(g).config;return payload(g,'XP • Configurações',`**Estado:** ${c.xp?'ativo':'desativado'}.\n${e('voltar')} Cada mensagem humana elegível vale **20 XP**, com intervalo mínimo de ${c.cooldown} segundos. Bots, webhooks e mensagens de sistema não pontuam.\n${e('voltar')} **Canais que contam XP:** ${c.canaisXP.length?c.canaisXP.map(id=>'<#'+id+'>').join(', '):'todos os canais de texto acessíveis ao bot'}.\n${e('voltar')} **Avisos de nível:** ${c.canalNivel?'<#'+c.canalNivel+'>':'desativados'}.\nO bot não precisa ler nem guardar o conteúdo das mensagens. /profile mostra o cartão e /leaderboard o ranking.`,[row(b('xp:on','Ativar XP','confirmar'),b('xp:off','Desativar XP','fechar')),new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(new ChannelSelectMenuBuilder().setCustomId('mb:xpnotice').setPlaceholder('Canal dos avisos de novo nível').setChannelTypes(ChannelType.GuildText)),new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(new ChannelSelectMenuBuilder().setCustomId('mb:xpchannels').setPlaceholder('Canais que contam XP (vazio = todos)').setChannelTypes(ChannelType.GuildText).setMinValues(0).setMaxValues(10)),new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId('mb:xpcooldown').setPlaceholder('Intervalo mínimo de pontuação').addOptions([{label:'1 minuto',value:'60'},{label:'2 minutos',value:'120'},{label:'5 minutos',value:'300'}])),row(b('xpnoticeoff','Desativar avisos de nível','fechar'),b('config','Voltar','voltar'))]);}
 function convitesPainel(g:string){const c=store.obter(g).config;return payload(g,'Convites • Configurações',`**Estado:** ${c.invites?'ativo':'desativado'}.\n${e('voltar')} A contagem começa na ativação. Não recupera o convidador de membros antigos.\n${e('voltar')} Entradas simultâneas, links expirados e retornos por OAuth2 podem ficar como **não identificado**. Atribuição por aumento dos usos é estimada.\n${e('voltar')} Reentradas não geram novos pontos; saídas reduzem a contagem de convidados presentes. Bots não pontuam.\n**Logs:** ${c.logsInvites?'<#'+c.logsInvites+'>':'desativados'}.\nO bot precisa de **Gerenciar servidor** para consultar os usos dos convites.`,[row(b('inv:on','Ativar acompanhamento','confirmar'),b('inv:off','Desativar','fechar')),new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(new ChannelSelectMenuBuilder().setCustomId('mb:invlogs').setPlaceholder('Canal privado de registros de convites').setChannelTypes(ChannelType.GuildText)),row(b('invlogsoff','Desativar logs','fechar')),back()]);}
 function posicao(g:string,u:string){const sorted=Object.entries(store.obter(g).perfis).filter(([,p])=>p.xp>0).sort((a,b)=>b[1].xp-a[1].xp);const n=sorted.findIndex(([id])=>id===u);return n<0?0:n+1;}
 async function perfilImagem(g:Guild,user:any,subiu=false){const p=store.perfil(g.id,user.id);return imagemPerfil({nome:user.displayName??user.username,servidor:g.name,xp:p.xp,cor:cor(g.id),avatar:user.displayAvatarURL({extension:'png',size:256}),convites:store.conviteResumo(g.id,user.id).total,posicao:posicao(g.id,user.id),subiu});}
 async function mostrarPerfil(i:any,u:any){const p=store.perfil(i.guildId,u.id),buffer=await perfilImagem(i.guild,u);await responder(i,{...payload(i.guildId,'Perfil de '+safe(u.displayName??u.username,70),`**Nível:** ${nivelXP(p.xp)} · **XP:** ${p.xp}\n${store.obter(i.guildId).config.xp?'Acompanhe sua evolução abaixo.':'O XP está desativado neste servidor; os pontos anteriores são preservados.'}`,[row(b('profile:'+u.id,'Atualizar perfil','historico'),b('leaderboard','Ranking de XP','equipe'))]),embeds:[emb(i.guildId,'Perfil de '+safe(u.displayName??u.username,70),"**Nível:** "+nivelXP(p.xp)+" · **XP:** "+p.xp).setImage('attachment://perfil.png')],attachments:[],files:[new AttachmentBuilder(buffer,{name:'perfil.png'})]});}
 async function ranking(i:any){const c=store.obter(i.guildId).config;if(!c.xp)throw Error('O sistema de XP está desativado. Um administrador pode ativá-lo no /configbot.');const lista=Object.entries(store.obter(i.guildId).perfis).filter(([,p])=>p.xp>0).sort((a,b)=>b[1].xp-a[1].xp).slice(0,10);await responder(i,payload(i.guildId,'Ranking de XP',lista.map(([id,p],n)=>`**${n+1}.** <@${id}> • nível **${nivelXP(p.xp)}** • ${p.xp} XP`).join('\n')||'Ninguém recebeu XP ainda.'));}
 async function alvo(i:any,id:string,direcionada=false){const m=await i.guild.members.fetch(id).catch(()=>null);if(!m)throw Error('Escolha um membro deste servidor.');if(direcionada){if(id===i.user.id||m.user.bot)throw Error('Escolha outro membro humano do servidor.');if(store.perfil(i.guildId,id).bloqueia)throw Error('Esse membro desativou interações direcionadas.');if(!i.channel?.permissionsFor(m)?.has(P.ViewChannel))throw Error('O membro precisa ter acesso a este canal.');}return m;}
 async function enviarAnime(i:any,acao:AcaoAnime,destino?:string,comBotao=true,junto=false){
  const frase=textoAnime(acao,i.user.id,destino,junto),gif=await gifs.buscar(acao),p=payload(i.guildId,frase.titulo,frase.texto);
  if(gif){p.embeds[0]!.setImage(gif.url).setFooter({text:(gif.anime?'Anime: '+gif.anime+' • ':'')+'GIFs: nekos.best • Anzy Programs'});}
  else p.embeds[0]!.setDescription(frase.texto+'\n\n-# O GIF está indisponível por um instante, mas o carinho chegou!');
  if(comBotao&&!store.perfil(i.guildId,i.user.id).bloqueia){
   for(const [id,r]of retribuicoes)if(r.expira<agora())retribuicoes.delete(id);
   if(retribuicoes.size>=1000)retribuicoes.delete(retribuicoes.keys().next().value!);
   const id=randomBytes(10).toString('hex');retribuicoes.set(id,{guild:i.guildId,autor:i.user.id,alvo:destino??null,acao:acao==='sad'?'hug':acao,tipo:destino?'direta':'junto',usados:new Set(),expira:agora()+900000});
   p.components=[row(b('react:'+id,frase.botao,acao==='dance'?'eventos':'equipe'))];
  }
  await responder(i,p);
 }
 async function reagirClique(i:any,id:string){
  const r=retribuicoes.get(id);if(!r||r.guild!==i.guildId||r.expira<agora())throw Error('Essa interação expirou. Use um comando para começar outra.');
  if(!store.obter(i.guildId).config.grupos.includes('interacoes'))throw Error('As interações estão desativadas neste servidor.');
  if(r.tipo==='direta'&&i.user.id!==r.alvo)throw Error('Só quem recebeu esta interação pode retribuir.');
  if(r.autor===i.user.id)throw Error('Deixe outro membro participar desta interação.');
  if(r.usados.has(i.user.id))throw Error('Você já participou desta interação.');
  if(r.usados.size>=50)throw Error('Esta interação já recebeu muitas participações. Comece outra pelo comando.');
  if(store.perfil(i.guildId,i.user.id).bloqueia)throw Error('Ative suas interações em /interactions para participar.');
  await alvo(i,r.autor,true);
  const key=i.guildId+':'+i.user.id;if((cooldowns.get(key)??0)>agora())throw Error('Aguarde alguns segundos antes de interagir novamente.');
  await i.deferReply();r.usados.add(i.user.id);cooldowns.set(key,agora()+5000);
  await enviarAnime(i,r.acao,r.autor,false,r.tipo==='junto');
  if(r.tipo==='direta'&&i.message?.edit)try{await i.message.edit({components:[row(b('react:'+id,'Retribuído','confirmar').setDisabled(true))]});}catch{/* The response was sent even if the original message was removed. */}
 }
 async function mensagemXP(m:Message){
  if(!m.guild||m.author.bot||m.webhookId||![0,19].includes(m.type))return;
  const c=store.obter(m.guild.id).config,p=store.perfil(m.guild.id,m.author.id);if(!c.xp||c.canaisXP.length&&!c.canaisXP.includes(m.channelId)||p.ultimoXP&&agora()-p.ultimoXP<c.cooldown*1000)return;
  const ganho=store.ganharXP(m.guild.id,m.author.id,m.channelId,agora());if(!ganho||ganho.depois<=ganho.antes||!c.canalNivel)return;
  try{const ch=await m.guild.channels.fetch(c.canalNivel);if(ch?.type!==ChannelType.GuildText)return;const imagem=await perfilImagem(m.guild,m.author,true);await ch.send({...payload(m.guild.id,'Novo nível!',`<@${m.author.id}> chegou ao **nível ${ganho.depois}**!`,[row(b('profile:'+m.author.id,'Ver perfil','equipe'))]),embeds:[emb(m.guild.id,'Novo nível!',"<@"+m.author.id+"> chegou ao **nível "+ganho.depois+"**!").setImage('attachment://novo-nivel.png')],files:[new AttachmentBuilder(imagem,{name:'novo-nivel.png'})]});}catch{console.warn('Aviso de nível indisponível; XP preservado.');}
 }
 async function capturar(g:Guild):Promise<BaseConvites>{const me=await g.members.fetchMe();if(!me.permissions.has(P.ManageGuild))throw Error('O bot precisa de Gerenciar servidor para consultar os convites.');const lista=await g.invites.fetch();let personalizado:number|null=null;
  if(g.vanityURLCode)try{personalizado=(await g.fetchVanityData()).uses;}catch{/* Ambiguous vanity entries remain unidentified. */}
  return{codigos:Object.fromEntries(lista.map(v=>[v.code,{usos:v.uses??0,convidador:v.inviterId??null}])),personalizado};
 }
 async function logConvite(g:Guild,t:string,d:string){const id=store.obter(g.id).config.logsInvites;if(!id)return;try{const ch=await g.channels.fetch(id);if(ch?.type===ChannelType.GuildText)await ch.send(payload(g.id,t,d));}catch{console.warn('Registro de convite indisponível.');}}
 async function processarEntradas(g:Guild){
  if(processando.has(g.id))return;processando.add(g.id);
  try{const membros=filas.get(g.id)??[];filas.delete(g.id);if(!membros.length||!store.obter(g.id).config.invites)return;let depois:BaseConvites|undefined;try{depois=await capturar(g);}catch{bases.delete(g.id);}
   if(!store.obter(g.id).config.invites)return;
   const origem=depois?identificarConvite(bases.get(g.id),depois,membros.length):{convidador:null,fonte:'desconhecido' as const};if(depois)bases.set(g.id,depois);
   for(const m of membros){const entrada=store.entrar(g.id,m.id,m.user.bot?{convidador:null,fonte:'bot'}:origem);await logConvite(g,'Entrada acompanhada',`**Membro:** <@${m.id}>\n**Origem estimada:** ${entrada.convidador?'<@'+entrada.convidador+'>':entrada.fonte==='personalizado'?'link personalizado':'não identificado'}\nReentradas não geram novos pontos.`);}
  }finally{processando.delete(g.id);if(filas.get(g.id)?.length)agendarEntradas(g);}
 }
 function agendarEntradas(g:Guild){if(timers.has(g.id))return;const t=setTimeout(()=>{timers.delete(g.id);void processarEntradas(g).catch(()=>console.warn('Não foi possível acompanhar as entradas.'));},1500);t.unref();timers.set(g.id,t);}
 function entrada(m:GuildMember){if(!store.obter(m.guild.id).config.invites)return;const fila=filas.get(m.guild.id)??[];if(!fila.some(x=>x.id===m.id))fila.push(m);filas.set(m.guild.id,fila);agendarEntradas(m.guild);}
 bot.on(Events.MessageCreate,m=>{void mensagemXP(m).catch(()=>console.warn('Não foi possível registrar XP.'));});
 bot.on(Events.GuildMemberAdd,entrada);
 bot.on(Events.GuildMemberRemove,m=>{if(store.obter(m.guild.id).config.invites)try{store.sair(m.guild.id,m.id);}catch{console.warn('Não foi possível registrar saída nos convites.');}});
 bot.on(Events.InviteCreate,v=>{if(v.guild&&bases.has(v.guild.id)){const base=bases.get(v.guild.id)!;base.codigos[v.code]={usos:v.uses??0,convidador:v.inviterId??null};}});
 bot.on(Events.InviteDelete,v=>{if(v.guild&&bases.has(v.guild.id))delete bases.get(v.guild.id)!.codigos[v.code];});
 bot.once(Events.ClientReady,()=>{for(const g of bot.guilds.cache.values())if(store.obter(g.id).config.invites)void capturar(g).then(b=>bases.set(g.id,b)).catch(()=>console.warn('Convites indisponíveis no servidor '+g.id));});
 function novoJogo(g:string,u:string,outro:string,tipo:Jogo['tipo']){
  for(const [id,j]of jogos)if(j.expira<agora())jogos.delete(id);
  if(jogos.size>=500||[...jogos.values()].some(j=>j.guild===g&&j.fase!=='fim'&&(j.autor===u||j.outro===u||outro!==bot.user?.id&&(j.autor===outro||j.outro===outro))))throw Error('Um dos participantes já tem uma partida em andamento. Conclua ou aguarde ela expirar.');
  const j:Jogo={id:randomBytes(8).toString('hex'),guild:g,autor:u,outro,tipo,fase:tipo==='velha'&&outro!==bot.user?.id?'espera':'jogo',vez:1,tab:Array(9).fill(0),quiz:randomInt(perguntasQuiz.length),respondeu:new Set(),expira:agora()+300000};jogos.set(j.id,j);return j;
 }
 function tabuleiro(j:Jogo){const resultado=vencedorVelha(j.tab),fim=resultado!==null||j.fase==='fim';return payload(j.guild,'Jogo da velha',`${e('voltar')} **X:** <@${j.autor}> · **O:** <@${j.outro}>\n${fim?(resultado===0?'Empate!':resultado?'Vitória de <@'+(resultado===1?j.autor:j.outro)+'>!':'Partida encerrada.'):'Vez de <@'+(j.vez===1?j.autor:j.outro)+'>. A partida expira em 5 minutos.'}`,[...Array.from({length:3},(_,r)=>row(...Array.from({length:3},(_,c)=>{const n=r*3+c;return new ButtonBuilder().setCustomId('mb:cell:'+j.id+':'+n).setLabel(j.tab[n]===1?'X':j.tab[n]===2?'O':'·').setStyle(j.tab[n]===1?ButtonStyle.Primary:j.tab[n]===2?ButtonStyle.Success:ButtonStyle.Secondary).setDisabled(fim||!!j.tab[n]);}))),...fim?[]:[row(b('cancel:'+j.id,'Encerrar partida','fechar'))]]);}
 async function jogoClique(i:any,acao:string,id:string,valor:string|undefined){
  const j=jogos.get(id);if(!j||j.guild!==i.guildId||j.expira<agora())throw Error('Esta partida expirou. Inicie outra pelo comando.');
  if(!store.obter(i.guildId).config.grupos.includes('jogos'))throw Error('Os jogos foram desativados neste servidor.');
  const u=i.user.id;
  if(acao==='accept'||acao==='decline'){
   if(j.tipo!=='velha'||j.fase!=='espera'||u!==j.outro)throw Error('Somente o membro convidado pode responder ao desafio.');
   if(store.perfil(j.guild,u).bloqueia)throw Error('Ative suas interações para aceitar desafios.');
   await i.deferUpdate();if(acao==='decline'){j.fase='fim';await responder(i,payload(j.guild,'Desafio recusado','O membro preferiu não jogar.'));return;}
   j.fase='jogo';await responder(i,tabuleiro(j));return;
  }
  if(acao==='cancel'){
   if(u!==j.autor&&u!==j.outro)throw Error('Somente participantes encerram esta partida.');j.fase='fim';await i.deferUpdate();await responder(i,payload(j.guild,'Partida encerrada','Você pode iniciar outra pelo comando.'));return;
  }
  if(j.fase!=='jogo')throw Error('Esta partida já terminou ou aguarda o convite.');
  if(acao==='rps'){
   if(j.tipo!=='rps'||u!==j.autor||!['pedra','papel','tesoura'].includes(valor??''))throw Error('Inicie sua própria partida com /rps.');
   const escolha=['pedra','papel','tesoura'][randomInt(3)]!;j.fase='fim';await i.deferUpdate();await responder(i,payload(j.guild,'Pedra, papel e tesoura',`Você: **${valor}**\nBot: **${escolha}**\n\n**${resultadoRps(valor!,escolha)}!**`));return;
  }
  if(acao==='answer'){
   if(j.tipo!=='quiz'||j.respondeu.has(u)||j.respondeu.size>=250)throw Error('Você já respondeu a esta pergunta ou a rodada encerrou.');
   const n=Number(valor);if(!Number.isInteger(n)||n<0||n>3)throw Error('Alternativa inválida.');j.respondeu.add(u);
   if(n!==perguntasQuiz[j.quiz]!.c){await responder(i,payload(j.guild,'Quiz','Ainda não! Você tem uma tentativa por pergunta.'),true);return;}
   j.fase='fim';await i.deferUpdate();await responder(i,payload(j.guild,'Quiz • Resposta correta',`<@${u}> acertou!\n\n**${perguntasQuiz[j.quiz]!.p}**\n${perguntasQuiz[j.quiz]!.op[n]}`));return;
  }
  if(acao==='cell'){
   if(j.tipo!=='velha'||u!==(j.vez===1?j.autor:j.outro))throw Error('Aguarde sua vez ou inicie sua própria partida.');
   const n=Number(valor);if(!Number.isInteger(n)||n<0||n>8||j.tab[n])throw Error('Escolha uma casa vazia.');
   j.tab[n]=j.vez;j.vez=j.vez===1?2:1;
   if(vencedorVelha(j.tab)===null&&j.outro===bot.user?.id){const livres=j.tab.flatMap((v,n)=>v?[]:[n]);j.tab[livres[randomInt(livres.length)]!]=2;j.vez=1;}
   if(vencedorVelha(j.tab)!==null)j.fase='fim';await i.deferUpdate();await responder(i,tabuleiro(j));return;
  }
  throw Error('Ação de jogo inválida.');
 }
 async function tratar(i:Interaction):Promise<boolean>{
  const custom='customId'in i?i.customId:'',cmd=i.isChatInputCommand()&&comandosMembros.some(c=>c.name===i.commandName),entradaUI=i.isStringSelectMenu()&&custom==='anzy:categoria'&&i.values[0]==='membros';
  if(!cmd&&!custom.startsWith('mb:')&&!entradaUI)return false;
  try{
   if(!i.inGuild()||!i.guild||!i.isRepliable())throw Error('Use este recurso em um servidor.');const g=i.guild,[,acao,id,valor]=custom.split(':');
   const config=entradaUI||['config','configmenu','groups','xp','xpnotice','xpchannels','xpcooldown','xpnoticeoff','inv','invlogs','invlogsoff','close'].includes(acao??'');
   if(config){
    if(!i.memberPermissions?.has(P.Administrator))throw Error('Apenas administradores configuram os comandos de membros.');if(i.isMessageComponent())await i.deferUpdate();
    if(entradaUI){await i.followUp({...painel(g.id),flags:MessageFlags.Ephemeral});return true;}
    if(acao==='config'){await responder(i,painel(g.id));return true;}
    if(acao==='close'){await responder(i,{content:e('fechar')+' Configurações fechadas.',embeds:[],components:[]});return true;}
    if(i.isStringSelectMenu()&&acao==='configmenu'){
     const v=i.values[0];if(v==='xp'){await responder(i,xpPainel(g.id));return true;}if(v==='convites'){await responder(i,convitesPainel(g.id));return true;}
     if(v==='comandos'){await responder(i,payload(g.id,'Comandos disponíveis',Object.entries(descricoes).map(([n,d])=>`${e('voltar')} **/${n}** — ${d}`).join('\n'),[back()]));return true;}
     if(v!=='grupos')throw Error('Seção inválida.');const selecionados=store.obter(g.id).config.grupos;await responder(i,payload(g.id,'Ativar grupos de comandos','Selecione os grupos que o servidor poderá usar. Preferências pessoais, XP e convites têm seus próprios controles.',[new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId('mb:groups').setPlaceholder('Grupos permitidos').setMinValues(0).setMaxValues(4).addOptions((['interacoes','diversao','jogos','perfis'] as GrupoMembros[]).map(v=>({label:{interacoes:'Interações e reações',diversao:'Diversão',jogos:'Jogos',perfis:'Perfis e informações'}[v],value:v,default:selecionados.includes(v)})))),back()]));return true;
    }
    if(acao==='groups'&&i.isStringSelectMenu())store.configurar(g.id,{grupos:i.values as GrupoMembros[]});
    else if(acao==='xp'&&['on','off'].includes(id??''))store.configurar(g.id,{xp:id==='on'});
    else if(acao==='xpnotice'&&i.isChannelSelectMenu()||acao==='invlogs'&&i.isChannelSelectMenu()){
     const ch=await g.channels.fetch(i.values[0]!),me=await g.members.fetchMe();if(!ch||ch.type!==ChannelType.GuildText||!ch.permissionsFor(me)?.has([P.ViewChannel,P.SendMessages,P.AttachFiles,P.EmbedLinks]))throw Error('O bot precisa visualizar, enviar mensagens, anexar arquivos e inserir links no canal.');
     if(acao==='invlogs'&&ch.permissionsFor(g.roles.everyone)?.has(P.ViewChannel))throw Error('Escolha um canal privado para os registros de convites.');store.configurar(g.id,acao==='xpnotice'?{canalNivel:ch.id}:{logsInvites:ch.id});
    }else if(acao==='xpchannels'&&i.isChannelSelectMenu()){for(const id of i.values){const ch=await g.channels.fetch(id);if(ch?.type!==ChannelType.GuildText)throw Error('Selecione canais de texto.');}store.configurar(g.id,{canaisXP:[...i.values]});}
    else if(acao==='xpcooldown'&&i.isStringSelectMenu()){if(!['60','120','300'].includes(i.values[0]!))throw Error('Intervalo inválido.');store.configurar(g.id,{cooldown:Number(i.values[0])});}
    else if(acao==='xpnoticeoff')store.configurar(g.id,{canalNivel:null});
    else if(acao==='inv'&&id==='on'){const base=await capturar(g);store.configurar(g.id,{invites:true});bases.set(g.id,base);}
    else if(acao==='inv'&&id==='off'){store.configurar(g.id,{invites:false});bases.delete(g.id);filas.delete(g.id);}
    else if(acao==='invlogsoff')store.configurar(g.id,{logsInvites:null});
    else throw Error('Controle de configuração inválido.');
    await responder(i,acao?.startsWith('xp')?xpPainel(g.id):acao?.startsWith('inv')?convitesPainel(g.id):painel(g.id));return true;
   }
   if(i.isButton()&&['accept','decline','cancel','rps','cell','answer'].includes(acao??'')){await jogoClique(i,acao!,id!,valor);return true;}
   if(i.isButton()&&acao==='react'){await reagirClique(i,id!);return true;}
   const nome=i.isChatInputCommand()?i.commandName:acao??'',grupo=grupos[nome];if(grupo&&!store.obter(g.id).config.grupos.includes(grupo))throw Error('Esse grupo de comandos está desativado neste servidor.');
   const chave=g.id+':'+i.user.id;if((cooldowns.get(chave)??0)>agora())throw Error('Aguarde alguns segundos antes de usar outro comando.');cooldowns.set(chave,agora()+5000);
   if(!i.isChatInputCommand()&&!['profile','leaderboard'].includes(nome))throw Error('Controle indisponível. Use um comando novo.');
   if(i.isButton()&&nome==='profile')await i.deferUpdate();else await i.deferReply({flags:['interactions'].includes(nome)?MessageFlags.Ephemeral:undefined});
   const alvoId=i.isChatInputCommand()?i.options.getUser('member')?.id??i.user.id:id??i.user.id;
   if(nome==='interactions'){const m=i.isChatInputCommand()?i.options.getString('mode'):null;if(m!=='on'&&m!=='off')throw Error('Escolha Permitir ou Bloquear.');store.preferencias(g.id,i.user.id,m==='off');if(m==='off')for(const j of jogos.values())if(j.guild===g.id&&(j.autor===i.user.id||j.outro===i.user.id))j.fase='fim';await responder(i,payload(g.id,'Preferências de interação',m==='off'?'Abraços, cumprimentos e desafios direcionados a você estão bloqueados.':'Você permite interações e desafios de outros membros.'));return true;}
   if(nome in interacoes){const m=await alvo(i,alvoId,true);await enviarAnime(i,nome as AcaoAnime,m.id);return true;}
   if(nome in reacoes){await enviarAnime(i,nome as AcaoAnime);return true;}
   if(nome==='coinflip'){await responder(i,payload(g.id,'Cara ou coroa',`Resultado: **${randomInt(2)?'Cara':'Coroa'}**.`));return true;}
   if(nome==='dice'){const lados=i.isChatInputCommand()?i.options.getInteger('sides')??6:6;if(!Number.isInteger(lados)||lados<2||lados>100)throw Error('Use de 2 a 100 lados.');await responder(i,payload(g.id,'Rolagem de dado',`Dado de **${lados} lados**: **${randomInt(1,lados+1)}**.`));return true;}
   if(nome==='choose'){const op=i.isChatInputCommand()?i.options.getString('options',true).split('|').map(x=>x.trim()).filter(Boolean):[];if(op.length<2||op.length>20)throw Error('Informe de 2 a 20 opções separadas por |.');await responder(i,payload(g.id,'Opção sorteada',safe(op[randomInt(op.length)]!)));return true;}
   if(nome==='8ball'){const pergunta=i.isChatInputCommand()?i.options.getString('question',true):'';const respostas=['Tudo indica que sim.','Talvez; tente novamente depois.','As chances parecem pequenas.','Pode ser uma boa surpresa.','Hoje a resposta é não.','A resposta está incerta.'];await responder(i,payload(g.id,'Bola de cristal',`**Pergunta:** ${safe(pergunta,300)}\n\n${respostas[randomInt(respostas.length)]}\n-# Apenas uma brincadeira.`));return true;}
   if(nome==='avatar'||nome==='userinfo'||nome==='profile'||nome==='level'){
    const m=await alvo(i,alvoId);if(nome==='profile'){await mostrarPerfil(i,m.user);return true;}
    if(nome==='avatar'){const url=m.user.displayAvatarURL({extension:'png',size:1024});await responder(i,{...payload(g.id,'Avatar de '+safe(m.displayName,70),'[Abrir imagem]('+url+')'),embeds:[emb(g.id,'Avatar de '+safe(m.displayName,70),'[Abrir imagem]('+url+')').setImage(url)]});return true;}
    if(nome==='userinfo'){await responder(i,payload(g.id,'Informações do membro',`**Membro:** <@${m.id}>\n**ID:** ${m.id}\n**Conta criada:** <t:${Math.floor(m.user.createdTimestamp/1000)}:F>\n**Entrou no servidor:** ${m.joinedTimestamp?'<t:'+Math.floor(m.joinedTimestamp/1000)+':F>':'indisponível'}\n**Conta:** ${m.user.bot?'bot':'pessoa'}`));return true;}
    if(!store.obter(g.id).config.xp)throw Error('O XP está desativado neste servidor.');const p=store.perfil(g.id,m.id);await responder(i,payload(g.id,'Nível de '+safe(m.displayName,70),`**Nível:** ${nivelXP(p.xp)}\n**XP:** ${p.xp}\n**Posição:** ${posicao(g.id,m.id)||'ainda sem pontuação'}`));return true;
   }
   if(nome==='serverinfo'){await responder(i,payload(g.id,'Informações do servidor',`**Nome:** ${safe(g.name,100)}\n**ID:** ${g.id}\n**Membros:** ${g.memberCount}\n**Criado:** <t:${Math.floor(g.createdTimestamp/1000)}:F>`));return true;}
   if(nome==='leaderboard'){await ranking(i);return true;}
   if(['invites','invitetop','inviter'].includes(nome)){
    if(!store.obter(g.id).config.invites)throw Error('O acompanhamento de convites está desativado.');
    const nota='\n\nContagem desde a ativação, por membros únicos. A origem é estimada; entradas ambíguas não recebem convidador.';
    if(nome==='invitetop'){const ids=[...new Set(Object.values(store.obter(g.id).entradas).flatMap(x=>x.convidador?[x.convidador]:[]))];const linhas=ids.map(id=>({id,...store.conviteResumo(g.id,id)})).sort((a,b)=>b.ativos-a.ativos||b.total-a.total).slice(0,10);await responder(i,payload(g.id,'Ranking de convites',linhas.map((x,n)=>`**${n+1}.** <@${x.id}> • ${x.ativos} presentes • ${x.total} únicos`).join('\n')+nota));return true;}
    await alvo(i,alvoId);if(nome==='invites'){const r=store.conviteResumo(g.id,alvoId);await responder(i,payload(g.id,'Convites de membro',`**Membro:** <@${alvoId}>\n**Únicos atribuídos:** ${r.total}\n**Ainda presentes:** ${r.ativos}\n**Saíram:** ${r.saidas}${nota}`));return true;}
    const o=store.obter(g.id).entradas[alvoId];await responder(i,payload(g.id,'Origem de entrada',`**Membro:** <@${alvoId}>\n**Convidador estimado:** ${o?.convidador?'<@'+o.convidador+'>':'não identificado'}\n**Origem:** ${o?.fonte==='personalizado'?'link personalizado':o?.fonte==='convite'?'convite acompanhado':'sem atribuição'}${nota}`));return true;
   }
   if(nome==='rps'||nome==='quiz'||nome==='tictactoe'){
    const outro=nome==='tictactoe'&&alvoId!==i.user.id?(await alvo(i,alvoId,true)).id:bot.user!.id;
    const j=novoJogo(g.id,i.user.id,outro,nome==='rps'?'rps':nome==='quiz'?'quiz':'velha');
    if(j.tipo==='rps'){await responder(i,payload(g.id,'Pedra, papel e tesoura','Escolha sua jogada. Só você pode jogar nesta rodada.',[row(...['pedra','papel','tesoura'].map(v=>b('rps:'+j.id+':'+v,v[0]!.toUpperCase()+v.slice(1),'confirmar')))]));return true;}
    if(j.tipo==='quiz'){const p=perguntasQuiz[j.quiz]!;await responder(i,payload(g.id,'Quiz',p.p+'\nCada membro tem uma tentativa. O primeiro acerto encerra a rodada.',[row(...p.op.map((v,n)=>b('answer:'+j.id+':'+n,v,'confirmar'))),row(b('cancel:'+j.id,'Encerrar rodada','fechar'))]));return true;}
    if(j.fase==='espera'){await responder(i,payload(g.id,'Desafio de jogo da velha',`<@${j.autor}> convidou <@${j.outro}> para jogar. O convidado precisa aceitar.`,[row(b('accept:'+j.id,'Aceitar desafio','confirmar'),b('decline:'+j.id,'Recusar','fechar'),b('cancel:'+j.id,'Cancelar desafio','fechar'))]));return true;}
    await responder(i,tabuleiro(j));return true;
   }
   throw Error('Comando indisponível.');
  }catch(err){if(i.isRepliable())await responder(i,{content:e('erro')+' '+safe(err instanceof Error?err.message:'Não foi possível concluir.'),embeds:[],components:[],allowedMentions:{parse:[]}},true);return true;}
 }
 const limpeza=setInterval(()=>{const tempo=agora();for(const [id,j]of jogos)if(j.expira<tempo)jogos.delete(id);for(const [id,t]of cooldowns)if(t<tempo)cooldowns.delete(id);},60000);limpeza.unref();
 return{tratar,mensagemXP,entrada,processarEntradas,capturar,store,parar:()=>{clearInterval(limpeza);for(const t of timers.values())clearTimeout(t);}};
}



