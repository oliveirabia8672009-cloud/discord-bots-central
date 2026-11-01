import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType,
  EmbedBuilder, MessageFlags, PermissionFlagsBits as P, RoleSelectMenuBuilder,
  SlashCommandBuilder, StringSelectMenuBuilder, escapeMarkdown,
  type Client, type Interaction, type Guild, type GuildMember, type TextChannel, type NewsChannel,
} from 'discord.js';
import { emojiTexto as e, emojiComponente as ec } from './emojis.js';

export const nomesModeracao = ['ban','unban','kick','timeout','untimeout','warn','warnings','removewarn','clear','lock','unlock','slowmode','modhistory'] as const;
type Acao = typeof nomesModeracao[number];
const permissoes: Record<Acao, bigint> = {
  ban:P.BanMembers, unban:P.BanMembers, kick:P.KickMembers, timeout:P.ModerateMembers,
  untimeout:P.ModerateMembers, warn:P.ModerateMembers, warnings:P.ModerateMembers,
  removewarn:P.ModerateMembers, clear:P.ManageMessages, lock:P.ManageChannels,
  unlock:P.ManageChannels, slowmode:P.ManageChannels, modhistory:P.ModerateMembers,
};
const titulos: Record<Acao,string> = {ban:'Banimento',unban:'Banimento removido',kick:'Expulsão',timeout:'Silêncio temporário',untimeout:'Silêncio removido',warn:'Advertência',warnings:'Advertências',removewarn:'Advertência removida',clear:'Limpeza de mensagens',lock:'Canal trancado',unlock:'Canal destrancado',slowmode:'Modo lento',modhistory:'Histórico de moderação'};
export const comandosModeracao = nomesModeracao.map(nome => {
  const b = new SlashCommandBuilder().setName(nome).setDescription(titulos[nome]+' • Moderação do servidor.').setDMPermission(false).setDefaultMemberPermissions(permissoes[nome]);
  if (['ban','kick','timeout','untimeout','warn','warnings','modhistory'].includes(nome)) b.addUserOption(o=>o.setName('member').setDescription('Membro que deseja moderar ou consultar.').setRequired(true));
  if(nome==='unban') b.addStringOption(o=>o.setName('user_id').setDescription('ID do usuário banido.').setRequired(true).setMinLength(17).setMaxLength(20));
  if(nome==='removewarn') b.addIntegerOption(o=>o.setName('case').setDescription('Número do caso de advertência.').setMinValue(1).setRequired(true));
  if(nome==='timeout') b.addIntegerOption(o=>o.setName('minutes').setDescription('Duração em minutos: de 1 minuto até 28 dias.').setMinValue(1).setMaxValue(40320).setRequired(true));
  if(nome==='clear') { b.addIntegerOption(o=>o.setName('amount').setDescription('Quantas mensagens recentes apagar (1 a 100).').setMinValue(1).setMaxValue(100).setRequired(true)); b.addUserOption(o=>o.setName('member').setDescription('Opcional: apagar apenas mensagens deste usuário nas últimas 100.')); }
  if(nome==='slowmode') b.addIntegerOption(o=>o.setName('seconds').setDescription('Intervalo em segundos (0 desativa; máximo 21600).').setMinValue(0).setMaxValue(21600).setRequired(true));
  if(['clear','lock','unlock','slowmode'].includes(nome)) b.addChannelOption(o=>o.setName('channel').setDescription('Canal de texto; se vazio, usa o canal atual.').addChannelTypes(ChannelType.GuildText,ChannelType.GuildAnnouncement));
  if(!['warnings','modhistory'].includes(nome)) b.addStringOption(o=>o.setName('reason').setDescription('Motivo opcional, registrado no histórico.').setMaxLength(500));
  return b;
});

type Config = {logs:string|null; roles:string[]; dm:boolean; eventos:Acao[]};
export type CasoModeracao = {id:number;acao:Acao;alvo:string;ator:string;motivo:string;quando:number;detalhes:string;dm:string;removidaPor?:number};
type Tranca = {antes:boolean|null;caso:number};
type Dados = {config:Config;seq:number;casos:CasoModeracao[];trancas:Record<string,Tranca>};
const padrao = ():Dados => ({config:{logs:null,roles:[],dm:true,eventos:nomesModeracao.filter(n=>!['warnings','modhistory'].includes(n))},seq:0,casos:[],trancas:{}});
export function criarStoreModeracao(arquivo=fileURLToPath(new URL('../../data/moderacao.json',import.meta.url))) {
  let dados:Record<string,Dados> = existsSync(arquivo)?JSON.parse(readFileSync(arquivo,'utf8')):{};
  if(!dados || typeof dados!=='object' || Array.isArray(dados)) throw Error('Arquivo de moderação inválido.');
  const obter=(id:string):Dados=>structuredClone(dados[id]??padrao());
  function alterar<T>(id:string,fn:(d:Dados)=>T):T {
    const d=obter(id),resultado=fn(d),novos={...dados,[id]:d};
    mkdirSync(dirname(arquivo),{recursive:true}); writeFileSync(arquivo+'.tmp',JSON.stringify(novos,null,2)); renameSync(arquivo+'.tmp',arquivo); dados=novos;return resultado;
  }
  return {obter,configurar:(id:string,c:Partial<Config>)=>alterar(id,d=>{Object.assign(d.config,c);}),
    trancar:(id:string,canal:string,antes:boolean|null)=>alterar(id,d=>{d.trancas[canal]={antes,caso:0};}),
    destrancar:(id:string,canal:string)=>alterar(id,d=>{delete d.trancas[canal];}),
    registrar:(id:string,c:Omit<CasoModeracao,'id'>,tranca?:{canal:string;antes:boolean|null}|{canal:string;remover:true})=>alterar(id,d=>{
      const caso={...c,id:++d.seq};d.casos.push(caso);
      if(c.acao==='removewarn'){const aviso=d.casos.find(x=>x.id===Number(c.detalhes));if(aviso)aviso.removidaPor=caso.id;}
      if(tranca){if('remover'in tranca)delete d.trancas[tranca.canal];else d.trancas[tranca.canal]={antes:tranca.antes,caso:caso.id};}
      return caso;
    }),
  };
}
type Store = ReturnType<typeof criarStoreModeracao>;
type Canal = TextChannel|NewsChannel;
type Pedido = {acao:Acao;guild:string;ator:string;alvo:string;canal:string;motivo:string;valor:number;aviso:number};
const limpar=(s:string,n=500)=>escapeMarkdown(s.replaceAll('@','@\u200b').replace(/[\u0000-\u001f]/g,' ')).slice(0,n);
const linha=(s:string)=>`${e('voltar')} ${s}`;
export function instalarModeracao(bot:Client,cor:(id:string|null)=>number,store:Store=criarStoreModeracao()) {
  const pendentes=new Map<string,{pedido:Pedido;vence:number}>(),ocupados=new Set<string>();
  const emb=(g:string,titulo:string,descricao:string)=>new EmbedBuilder().setColor(cor(g)).setTitle(titulo).setDescription(descricao).setFooter({text:'Anzy Programs • Moderação'});
  const botao=(id:string,label:string,icone:'confirmar'|'voltar'|'fechar'='voltar')=>new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(ButtonStyle.Secondary).setEmoji(ec(icone));
  const voltar=()=>new ActionRowBuilder<ButtonBuilder>().addComponents(botao('mod:home','Voltar à moderação'),botao('mod:close','Fechar configurações','fechar'));
  function painel(g:string,aviso='') {
    const c=store.obter(g).config;
    const desc=[aviso,`${e('moderacao')} Configure os registros e o acesso da equipe. Os comandos são usados separadamente.`,
      linha(`**Canal de logs:** ${c.logs?'<#'+c.logs+'>':'desativado'}. Recebe os casos registrados pelo bot.`),
      linha('**Tipos de registro:** escolha quais ações enviar ao canal de logs. O histórico interno permanece salvo.'),
      linha(`**Equipe:** ${c.roles.length?c.roles.map(r=>'<@&'+r+'>').join(', '):'membros com a permissão necessária do Discord'}. Cargos selecionados também precisam da permissão de cada comando.`),
      linha(`**Aviso por DM:** ${c.dm?'ativado':'desativado'}. O membro recebe a ação e o motivo, quando possível.`),
      'Administradores configuram o painel. Ninguém pode moderar o dono do servidor ou membros de cargo igual/superior ao seu.'].filter(Boolean).join('\n\n');
    const menu=new StringSelectMenuBuilder().setCustomId('mod:menu').setPlaceholder('Escolha o que configurar').addOptions([
      {label:'Canal de logs',value:'logs',emoji:ec('logs')},{label:'Tipos de registro',value:'eventos',emoji:ec('historico')},
      {label:'Equipe de moderação',value:'roles',emoji:ec('equipe')},{label:'Notificação por DM',value:'dm',emoji:ec('eventos')},
      {label:'Conferir configurações e comandos',value:'conferir',emoji:ec('configuracoes')},
    ]);
    return {embeds:[emb(g,`${e('moderacao')} Moderação • Configurações`,desc)],components:[new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu),new ActionRowBuilder<ButtonBuilder>().addComponents(botao('mod:close','Fechar configurações','fechar'))],allowedMentions:{parse:[] as const}};
  }
  async function responder(i:any,p:any){if(i.deferred||i.replied)await i.editReply(p);else await i.reply({...p,flags:MessageFlags.Ephemeral});}
  async function erro(i:any,s:string){await responder(i,{content:`${e('erro')} ${s}`,embeds:[],components:[],allowedMentions:{parse:[]}});}
  async function membro(g:Guild,id:string){return g.members.fetch({user:id,force:true}).catch(()=>null);}
  async function autorizar(g:Guild,atorId:string,acao:Acao,canal?:Canal){
    const ator=await membro(g,atorId);if(!ator)throw Error('Você precisa estar no servidor.');
    const perms=canal?canal.permissionsFor(ator):ator.permissions;
    if(!perms?.has(permissoes[acao]))throw Error('Você não tem a permissão do Discord necessária para este comando.');
    const roles=store.obter(g.id).config.roles;
    if(!ator.permissions.has(P.Administrator)&&roles.length&&!roles.some(r=>ator.roles.cache.has(r)))throw Error('Seu cargo não está na equipe de moderação configurada.');
    return ator;
  }
  function hierarquia(g:Guild,ator:GuildMember,alvo:GuildMember){
    if(alvo.id===ator.id||alvo.id===bot.user?.id||alvo.id===g.ownerId)throw Error('Você não pode aplicar esta ação a si, ao bot ou ao dono do servidor.');
    if(ator.id!==g.ownerId&&ator.roles.highest.comparePositionTo(alvo.roles.highest)<=0)throw Error('O membro precisa ter um cargo abaixo do seu.');
    const eu=g.members.me;if(!eu||eu.roles.highest.comparePositionTo(alvo.roles.highest)<=0)throw Error('Mova o cargo do bot acima do cargo deste membro.');
  }
  async function canalDo(g:Guild,id:string):Promise<Canal>{
    const c=await g.channels.fetch(id);if(!c||![ChannelType.GuildText,ChannelType.GuildAnnouncement].includes(c.type))throw Error('Selecione um canal de texto do servidor.');return c as Canal;
  }
  async function conferir(g:Guild,p:Pedido){
    const canal=['clear','lock','unlock','slowmode'].includes(p.acao)?await canalDo(g,p.canal):undefined;
    const ator=await autorizar(g,p.ator,p.acao,canal);
    const eu=await g.members.fetchMe();
    if(!['warn','warnings','removewarn','modhistory'].includes(p.acao)&&!(canal?canal.permissionsFor(eu):eu.permissions)?.has(permissoes[p.acao]))throw Error('O bot não tem a permissão necessária para esta ação.');
    let alvo:GuildMember|null=null;
    if(['ban','kick','timeout','untimeout','warn'].includes(p.acao)){
      alvo=await membro(g,p.alvo);if(!alvo)throw Error('Este membro não está mais no servidor.');hierarquia(g,ator,alvo);
      if(p.acao==='ban'&&!alvo.bannable||p.acao==='kick'&&!alvo.kickable||['timeout','untimeout'].includes(p.acao)&&!alvo.moderatable)throw Error('O Discord não permite que o bot aplique esta ação a este membro. Confira os cargos e permissões.');
    }
    if(p.acao==='unban'){
      if(!/^\d{17,20}$/.test(p.alvo))throw Error('Informe um ID válido.');
      if(!await g.bans.fetch(p.alvo).catch(()=>null))throw Error('Este usuário não está banido.');
    }
    if(p.acao==='removewarn'){
      const w=store.obter(g.id).casos.find(x=>x.id===p.aviso&&x.acao==='warn'&&!x.removidaPor);
      if(!w)throw Error('Não existe uma advertência ativa com esse número.');
      p.alvo=w.alvo;const a=await membro(g,w.alvo);if(a)hierarquia(g,ator,a);
    }
    if(p.acao==='untimeout'&&!alvo?.isCommunicationDisabled())throw Error('Este membro não está silenciado.');
    if(canal){
      if(!canal.permissionsFor(eu)?.has([P.ViewChannel,P.SendMessages]))throw Error('O bot precisa visualizar e enviar mensagens neste canal.');
      if(p.acao==='clear'&&!canal.permissionsFor(eu)?.has(P.ReadMessageHistory))throw Error('O bot precisa de acesso ao histórico deste canal.');
      if(['lock','unlock'].includes(p.acao)&&(!canal.permissionsFor(eu)?.has(P.ManageRoles)||!canal.permissionsFor(ator)?.has(P.ManageRoles)))throw Error('Você e o bot precisam de Gerenciar permissões neste canal para trancar ou destrancar.');
      if(p.acao==='slowmode'&&canal.type!==ChannelType.GuildText)throw Error('Modo lento está disponível apenas em canais de texto comuns.');
      const tranca=store.obter(g.id).trancas[canal.id];
      if(p.acao==='lock'&&tranca)throw Error('Este canal já foi trancado por este sistema. Use /unlock.');
      if(p.acao==='unlock'){
        if(!tranca)throw Error('Não há trancamento deste sistema para restaurar neste canal.');
        const ow=canal.permissionOverwrites.cache.get(g.id);
        if(!ow?.deny.has(P.SendMessages))throw Error('As permissões foram alteradas fora do bot. Confira o canal antes de restaurar o trancamento.');
      }
    }
    return {ator,alvo,canal};
  }
  async function registrar(g:Guild,p:Pedido,detalhes:string,dm:string,tranca?:{canal:string;antes:boolean|null}|{canal:string;remover:true}){
    let caso:CasoModeracao;
    try{caso=store.registrar(g.id,{acao:p.acao,alvo:p.alvo||p.canal,ator:p.ator,motivo:p.motivo,quando:Date.now(),detalhes,dm},tranca);}
    catch{console.error('Moderação: ação aplicada, mas não foi possível salvar o caso.',{guild:g.id,acao:p.acao});return 'A ação foi aplicada, mas houve falha ao salvar o histórico. Verifique o armazenamento antes de repetir.';}
    let resultado=`${e('sucesso')} **${titulos[p.acao]} • Caso #${caso.id}**\n${detalhes===''+p.aviso&&p.acao==='removewarn'?'Advertência #'+p.aviso+' removida.':detalhes}\n**Motivo:** ${limpar(p.motivo)}\n**DM:** ${dm}`;
    const cfg=store.obter(g.id).config;
    if(cfg.logs&&cfg.eventos.includes(p.acao)){
      try{
        const c=await canalDo(g,cfg.logs);
        await c.send({embeds:[emb(g.id,`${e('moderacao')} ${titulos[p.acao]} • Caso #${caso.id}`,`${linha(`**Alvo:** ${p.alvo?'<@'+p.alvo+'>':'<#'+p.canal+'>'} (\`${caso.alvo}\`)`)}\n${linha(`**Responsável:** <@${p.ator}>`)}\n${linha(`**Motivo:** ${limpar(p.motivo)}`)}\n${linha(`**Data:** <t:${Math.floor(caso.quando/1000)}:F>`)}\n${linha(`**Detalhes:** ${p.acao==='removewarn'?'Advertência #'+p.aviso:detalhes}`)}\n${linha('**DM:** '+dm)}`)],allowedMentions:{parse:[]}});
      }catch{resultado+=`\n${e('aviso')} Caso salvo, mas o canal de logs está indisponível. Confira o canal e as permissões.`;}
    }
    return resultado;
  }
  async function executar(i:any,p:Pedido){
    if(ocupados.has(p.guild))throw Error('Outra ação de moderação está em andamento. Aguarde e tente novamente.');ocupados.add(p.guild);
    try{
      const g=i.guild as Guild;const {alvo,canal}=await conferir(g,p);
      const audit=`${p.acao} por ${p.ator}: ${p.motivo}`.slice(0,500);let detalhes='',dm='não se aplica';let tranca:{canal:string;antes:boolean|null}|{canal:string;remover:true}|undefined;
      switch(p.acao){
        case 'ban':await g.members.ban(p.alvo,{reason:audit});detalhes='Membro banido do servidor.';break;
        case 'kick':await alvo!.kick(audit);detalhes='Membro expulso do servidor.';break;
        case 'unban':await g.bans.remove(p.alvo,audit);detalhes='Banimento removido. O usuário precisa de um convite para voltar.';break;
        case 'timeout':if(!Number.isInteger(p.valor)||p.valor<1||p.valor>40320)throw Error('Duração inválida.');await alvo!.timeout(p.valor*60000,audit);detalhes=`Silêncio aplicado por ${p.valor} minuto(s), até <t:${Math.floor(Date.now()/1000+p.valor*60)}:F>.`;break;
        case 'untimeout':await alvo!.timeout(null,audit);detalhes='Silêncio temporário removido.';break;
        case 'warn':detalhes='Advertência registrada. Não aplica punição automática.';break;
        case 'removewarn':detalhes=String(p.aviso);break;
        case 'clear':{
          if(!Number.isInteger(p.valor)||p.valor<1||p.valor>100)throw Error('Quantidade inválida.');
          const recentes=await canal!.messages.fetch({limit:100});
          const escolhidas=recentes.filter(m=>(!p.alvo||m.author.id===p.alvo)&&!m.pinned&&Date.now()-m.createdTimestamp<14*86400000-60000).first(p.valor);
          if(!escolhidas.length)throw Error('Não há mensagens elegíveis nas últimas 100. Mensagens fixadas ou com 14 dias ou mais são preservadas.');
          const apagadas=await canal!.bulkDelete(escolhidas,true);detalhes=`${apagadas.size} mensagem(ns) apagada(s) em <#${canal!.id}>. Fixadas e antigas foram preservadas.`;break;
        }
        case 'lock':{
          const ow=canal!.permissionOverwrites.cache.get(g.id);const antes=ow?.allow.has(P.SendMessages)?true:ow?.deny.has(P.SendMessages)?false:null;
          if(antes===false)throw Error('O canal já bloqueia mensagens para @everyone. Nenhuma permissão foi alterada.');
          // Save the recovery snapshot before touching Discord permissions.
          store.trancar(g.id,canal!.id,antes);
          tranca={canal:canal!.id,antes};
          try{await canal!.permissionOverwrites.edit(g.id,{SendMessages:false},{reason:audit});}catch(err){store.destrancar(g.id,canal!.id);throw err;}
          detalhes=`Canal <#${canal!.id}> trancado para @everyone. Cargos com permissão explícita podem continuar enviando.`;break;
        }
        case 'unlock':{
          const anterior=store.obter(g.id).trancas[canal!.id]!;await canal!.permissionOverwrites.edit(g.id,{SendMessages:anterior.antes},{reason:audit});tranca={canal:canal!.id,remover:true};detalhes=`Permissão de envio de <#${canal!.id}> restaurada ao estado anterior.`;break;
        }
        case 'slowmode':if(!Number.isInteger(p.valor)||p.valor<0||p.valor>21600)throw Error('Intervalo inválido.');await (canal as TextChannel).setRateLimitPerUser(p.valor,audit);detalhes=p.valor?`Intervalo de ${p.valor} segundo(s) em <#${canal!.id}>.`:`Modo lento desativado em <#${canal!.id}>.`;break;
      }
      if(p.alvo&&['ban','unban','kick','timeout','untimeout','warn','removewarn'].includes(p.acao)){
        dm=store.obter(g.id).config.dm?'não enviada (mensagens privadas bloqueadas ou indisponíveis)':'desativada';
        if(store.obter(g.id).config.dm)try{const u=await bot.users.fetch(p.alvo);await u.send({embeds:[emb(g.id,`${e('moderacao')} ${titulos[p.acao]}`,`**Servidor:** ${limpar(g.name,100)}\n**Motivo:** ${limpar(p.motivo)}\n**Data:** <t:${Math.floor(Date.now()/1000)}:F>\n${p.acao==='removewarn'?'Advertência #'+p.aviso+' removida.':detalhes}`)],allowedMentions:{parse:[]}});dm='enviada';}catch{/* The action remains valid when DM delivery fails. */}
      }
      const resultado=await registrar(g,p,detalhes,dm,tranca);
      await responder(i,{content:resultado,embeds:[],components:[],allowedMentions:{parse:[]}});
    }finally{ocupados.delete(p.guild);}
  }
  async function historico(i:any,acao:'warnings'|'modhistory',alvo:string,pagina=0){
    await autorizar(i.guild,i.user.id,acao);
    const todos=store.obter(i.guildId).casos.filter(c=>c.alvo===alvo&&(acao!=='warnings'||c.acao==='warn')).reverse();
    const paginas=Math.max(1,Math.ceil(todos.length/5));pagina=Math.max(0,Math.min(pagina,paginas-1));
    const descricao=todos.slice(pagina*5,pagina*5+5).map(c=>`**#${c.id} • ${titulos[c.acao]}${c.removidaPor?' • Removida no caso #'+c.removidaPor:''}**\n${linha(`Responsável: <@${c.ator}> • <t:${Math.floor(c.quando/1000)}:f>`)}\n${linha(`Motivo: ${limpar(c.motivo,500)}`)}`).join('\n\n')||'Nenhum registro encontrado.';
    const row=new ActionRowBuilder<ButtonBuilder>().addComponents(botao(`mod:hist:${acao}:${alvo}:${pagina-1}:${i.user.id}`,'Anterior').setDisabled(pagina===0),botao(`mod:hist:${acao}:${alvo}:${pagina+1}:${i.user.id}`,'Próxima').setDisabled(pagina+1===paginas));
    await responder(i,{content:'',embeds:[emb(i.guildId,`${e('historico')} ${titulos[acao]} • ${pagina+1}/${paginas}`,`**Membro:** <@${alvo}>\n\n${descricao}`)],components:[row],allowedMentions:{parse:[]}});
  }
  return async function tratarModeracao(i:Interaction):Promise<boolean>{
    const isCmd=i.isChatInputCommand()&&nomesModeracao.includes(i.commandName as Acao);
    const custom='customId'in i?i.customId:'';
    const entrada=i.isStringSelectMenu()&&custom==='anzy:categoria'&&i.values[0]==='moderacao';
    if(!isCmd&&!custom.startsWith('mod:')&&!entrada)return false;
    try{
      if(!i.inGuild()||!i.guild){await erro(i,'Use a moderação dentro de um servidor.');return true;}
      if(entrada||custom.startsWith('mod:')&&!custom.startsWith('mod:confirm:')&&!custom.startsWith('mod:cancel:')&&!custom.startsWith('mod:hist:')){
        if(!i.memberPermissions?.has(P.Administrator)){await erro(i,'Apenas administradores podem configurar a moderação.');return true;}
        if(i.isMessageComponent())await i.deferUpdate();
        // Central uses Components V2; send a separate conventional ephemeral configuration panel.
        if(entrada){await i.followUp({...painel(i.guildId),flags:MessageFlags.Ephemeral});return true;}
        if(custom==='mod:close'){await responder(i,{content:`${e('fechar')} Configurações de moderação fechadas. A central administrativa continua disponível na mensagem anterior.`,embeds:[],components:[]});return true;}
        if(custom==='mod:home'){await responder(i,painel(i.guildId));return true;}
        if(i.isStringSelectMenu()&&custom==='mod:menu'){
          const opcao=i.values[0];let row:ActionRowBuilder<any>|undefined;let titulo='',desc='';
          if(opcao==='logs'){titulo='Canal de logs';desc='Selecione preferencialmente um canal privado da equipe. Apenas ações executadas pelos comandos deste bot serão registradas.';row=new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(new ChannelSelectMenuBuilder().setCustomId('mod:logs').setPlaceholder('Selecione o canal de registros').setChannelTypes(ChannelType.GuildText,ChannelType.GuildAnnouncement));}
          if(opcao==='roles'){titulo='Equipe de moderação';desc='Selecione até 10 cargos. Os membros também precisam da permissão do Discord para cada ação. Administradores mantêm acesso. Sem cargos selecionados, vale apenas a permissão do Discord.';row=new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(new RoleSelectMenuBuilder().setCustomId('mod:roles').setPlaceholder('Selecione os cargos da equipe').setMinValues(0).setMaxValues(10).setDefaultRoles(...store.obter(i.guildId).config.roles));}
          if(opcao==='eventos'){titulo='Tipos de registro';desc='Escolha quais ações enviar ao canal de logs. O histórico interno mantém todos os casos.';row=new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId('mod:eventos').setPlaceholder('Selecione as ações registradas').setMinValues(0).setMaxValues(11).addOptions(nomesModeracao.filter(n=>!['warnings','modhistory'].includes(n)).map(n=>({label:titulos[n],value:n,emoji:ec('moderacao'),default:store.obter(i.guildId!).config.eventos.includes(n)}))));}
          if(opcao==='dm'){titulo='Notificação por DM';desc='Ative para avisar o membro após a ação. Se a mensagem privada estiver bloqueada, a punição continua válida e a falha é informada.';row=new ActionRowBuilder<ButtonBuilder>().addComponents(botao('mod:dm:on','Ativar DM','confirmar'),botao('mod:dm:off','Desativar DM','fechar'));}
          if(opcao==='conferir'){
            const cfg=store.obter(i.guildId).config;titulo='Configurações e comandos';desc=`**Logs:** ${cfg.logs?'<#'+cfg.logs+'>':'desativados'}\n**Equipe:** ${cfg.roles.length?cfg.roles.map(r=>'<@&'+r+'>').join(', '):'permissões do Discord'}\n**DM:** ${cfg.dm?'ativada':'desativada'}\n**Registros enviados:** ${cfg.eventos.map(a=>titulos[a]).join(', ')||'nenhum'}\n\n`+nomesModeracao.map(n=>linha(`**/${n}** — ${titulos[n]}.`)).join('\n');
          }
          if(!titulo)throw Error('Opção inválida.');
          const rows=row?[row,voltar()]:[voltar()];
          if(opcao==='logs')rows.splice(1,0,new ActionRowBuilder<ButtonBuilder>().addComponents(botao('mod:logs:off','Desativar envio de logs','fechar')));
          await responder(i,{content:'',embeds:[emb(i.guildId,`${e('moderacao')} ${titulo}`,desc)],components:rows,allowedMentions:{parse:[]}});return true;
        }
        if(i.isChannelSelectMenu()&&custom==='mod:logs'){
          const c=await canalDo(i.guild,i.values[0]!);const eu=await i.guild.members.fetchMe();
          if(!c.permissionsFor(eu)?.has([P.ViewChannel,P.SendMessages,P.EmbedLinks]))throw Error('O bot precisa visualizar, enviar mensagens e inserir links neste canal.');
          store.configurar(i.guildId,{logs:c.id});
        }else if(i.isRoleSelectMenu()&&custom==='mod:roles'){
          if(i.values.includes(i.guildId))throw Error('Não selecione @everyone como equipe.');
          for(const id of i.values){const r=await i.guild.roles.fetch(id);if(!r||r.managed)throw Error('Selecione cargos comuns deste servidor.');}
          store.configurar(i.guildId,{roles:[...i.values]});
        }else if(i.isStringSelectMenu()&&custom==='mod:eventos'){
          if(i.values.some(v=>!nomesModeracao.includes(v as Acao)||['warnings','modhistory'].includes(v)))throw Error('Tipo de registro inválido.');
          store.configurar(i.guildId,{eventos:i.values as Acao[]});
        }else if(custom==='mod:logs:off')store.configurar(i.guildId,{logs:null});
        else if(custom==='mod:dm:on'||custom==='mod:dm:off')store.configurar(i.guildId,{dm:custom.endsWith(':on')});
        else throw Error('Esta opção não está disponível. Reabra a moderação no /configbot.');
        await responder(i,painel(i.guildId,`${e('sucesso')} Configuração salva.`));return true;
      }
      if(custom.startsWith('mod:hist:')&&i.isButton()){
        const [, , acao, alvo,pagina,ator]=custom.split(':');
        if(ator!==i.user.id)throw Error('Abra sua própria consulta com /warnings ou /modhistory.');
        if(!['warnings','modhistory'].includes(acao!))throw Error('Consulta inválida.');
        await i.deferUpdate();await historico(i,acao as 'warnings'|'modhistory',alvo!,Number(pagina));return true;
      }
      if((custom.startsWith('mod:confirm:')||custom.startsWith('mod:cancel:'))&&i.isButton()){
        const id=custom.split(':')[2]!;const registro=pendentes.get(id);
        if(!registro||registro.vence<Date.now()){pendentes.delete(id);throw Error('Esta confirmação expirou. Execute o comando novamente.');}
        if(registro.pedido.ator!==i.user.id||registro.pedido.guild!==i.guildId)throw Error('Esta confirmação pertence a outro moderador.');
        pendentes.delete(id);await i.deferUpdate();
        if(custom.startsWith('mod:cancel:')){await responder(i,{content:`${e('aviso')} Ação cancelada.`,embeds:[],components:[]});return true;}
        await executar(i,registro.pedido);return true;
      }
      if(i.isChatInputCommand()&&isCmd){
        await i.deferReply({flags:MessageFlags.Ephemeral});
        const acao=i.commandName as Acao,alvo=i.options.getUser('member')?.id??i.options.getString('user_id')??'';
        if(acao==='warnings'||acao==='modhistory'){await historico(i,acao,alvo);return true;}
        const p:Pedido={acao,guild:i.guildId,ator:i.user.id,alvo,canal:i.options.getChannel('channel')?.id??i.channelId,motivo:i.options.getString('reason')?.trim()||'Não informado.',valor:i.options.getInteger('minutes')??i.options.getInteger('seconds')??i.options.getInteger('amount')??0,aviso:i.options.getInteger('case')??0};
        await conferir(i.guild,p);
        if(['ban','kick','clear'].includes(acao)){
          for(const [id,x]of pendentes)if(x.vence<Date.now())pendentes.delete(id);
          if(pendentes.size>=1000)throw Error('Há muitas confirmações pendentes. Aguarde alguns minutos.');
          const id=randomUUID();pendentes.set(id,{pedido:p,vence:Date.now()+120000});
          await responder(i,{embeds:[emb(i.guildId,`${e('aviso')} Confirmar • ${titulos[acao]}`,`${p.alvo?'**Membro:** <@'+p.alvo+'>\n':''}${acao==='clear'?`**Canal:** <#${p.canal}>\n**Limite:** ${p.valor} mensagem(ns) recentes, preservando fixadas e antigas.\n`:''}**Motivo:** ${limpar(p.motivo)}\n\nConfira antes de confirmar. Este botão expira em 2 minutos.`)],components:[new ActionRowBuilder<ButtonBuilder>().addComponents(botao('mod:confirm:'+id,'Confirmar','confirmar'),botao('mod:cancel:'+id,'Cancelar','fechar'))],allowedMentions:{parse:[]}});return true;
        }
        await executar(i,p);return true;
      }
      throw Error('Interação de moderação inválida.');
    }catch(err){console.error('Moderação:',err instanceof Error?err.message:'Falha desconhecida');await erro(i,err instanceof Error?err.message:'Não foi possível concluir. Confira as permissões.');return true;}
  };
}
