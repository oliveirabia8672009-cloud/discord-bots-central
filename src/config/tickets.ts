import { Buffer } from 'node:buffer';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, ContainerBuilder, EmbedBuilder, MessageFlags, ModalBuilder, OverwriteType, PermissionFlagsBits as P, RoleSelectMenuBuilder, SlashCommandBuilder, StringSelectMenuBuilder, TextDisplayBuilder, TextInputBuilder, TextInputStyle, UserSelectMenuBuilder, type Client, type Guild, type GuildMember, type Interaction, type OverwriteResolvable, type TextChannel } from 'discord.js';
import { criarStoreTickets, type Ticket, type TicketConfig, type TicketVendaConfig } from './tickets-store.js';
import { imagemValida } from './outros.js';
import { emojiComponente, emojiTexto } from './emojis.js';

export const comandosTickets = [
  new SlashCommandBuilder().setName('add_ticket').setDescription('Adiciona um participante ao ticket atual.').addUserOption(o=>o.setName('usuario').setDescription('Participante a adicionar').setRequired(true)),
  new SlashCommandBuilder().setName('close_ticket').setDescription('Fecha o ticket atual; informar o motivo é opcional.').addStringOption(o=>o.setName('motivo').setDescription('Motivo do encerramento (opcional)').setMaxLength(500).setRequired(false)),
  new SlashCommandBuilder().setName('archive_ticket').setDescription('Arquiva um ticket já encerrado, preservando a conversa.'),
  new SlashCommandBuilder().setName('managetickets').setDescription('Abre o gerenciamento dos tickets do servidor.'),
  new SlashCommandBuilder().setName('ticketstaff').setDescription('Abre o painel privado da equipe no ticket atual.'),
  new SlashCommandBuilder().setName('closealltickets').setDescription('Solicita confirmação para fechar todos os tickets abertos.').setDefaultMemberPermissions(P.Administrator),
].map(c=>c.setDMPermission(false));

const acessar=[P.ViewChannel,P.SendMessages,P.ReadMessageHistory,P.EmbedLinks,P.AttachFiles];
export function permissoesTicket(guildId:string,botId:string,t:Ticket,arquivado=false):OverwriteResolvable[] {
  const ids=[...new Set([t.autor,...t.participantes])];
  return [
    {id:guildId,type:OverwriteType.Role,deny:[P.ViewChannel]},
    {id:botId,type:OverwriteType.Member,allow:acessar},
    {id:t.suporte,type:OverwriteType.Role,allow:acessar},
    ...ids.map(id=>({id,type:OverwriteType.Member,allow:arquivado?[]:t.estado==='aberto'?acessar:[P.ViewChannel,P.ReadMessageHistory],deny:arquivado?[P.ViewChannel,P.SendMessages]:t.estado==='aberto'?[]:[P.SendMessages]})),
  ];
}

const criandoArquivo=new Map<string,Promise<TextChannel>>();
export async function guardarTranscricao(guild:Guild,botId:string,anexo:AttachmentBuilder,store:ReturnType<typeof criarStoreTickets>) {
  const resolver=async()=>{
    const id=store.obter(guild.id).config.arquivoCanal;
    if(id){const canal=await guild.channels.fetch(id).catch(e=>{if(e.code===10003)return null;throw e;});if(canal&&canal.type===ChannelType.GuildText&&!canal.permissionsFor(guild.roles.everyone).has(P.ViewChannel))return canal;}
    const canal=await guild.channels.create({name:'anzy-transcricoes-arquivos',type:ChannelType.GuildText,topic:'Armazenamento privado das transcrições. Os botões de download dependem destes arquivos.',permissionOverwrites:[{id:guild.id,type:OverwriteType.Role,deny:[P.ViewChannel]},{id:botId,type:OverwriteType.Member,allow:[P.ViewChannel,P.SendMessages,P.ReadMessageHistory,P.AttachFiles]}]});
    store.configurar(guild.id,{arquivoCanal:canal.id});return canal;
  };
  let promise=criandoArquivo.get(guild.id);if(!promise){promise=resolver();criandoArquivo.set(guild.id,promise);}
  let canal:TextChannel;try{canal=await promise;}finally{criandoArquivo.delete(guild.id);}
  const msg=await canal.send({files:[anexo],allowedMentions:{parse:[]}}),arquivo=msg.attachments.first();
  if(!arquivo)throw Error('Não foi possível armazenar a transcrição para download.');return arquivo;
}

export function instalarTickets(bot:Client,cor:(id:string|null)=>number,store=criarStoreTickets(),transcriptDir=fileURLToPath(new URL('../../data/transcripts',import.meta.url))) {
  let configVendas:((guild:string)=>TicketVendaConfig)|undefined;
  const configDoTicket=(id:string,t:Ticket)=>t.tipo==='venda'?{...store.obter(id).config,...(configVendas?.(id)??t.vendaConfig??{suporte:null,categoria:null,arquivos:null,logs:null})}:store.obter(id).config;
  const locks=new Set<string>();
  const admin=(m:GuildMember)=>m.permissions.has(P.Administrator);
  const staff=(m:GuildMember,suporte:string|null)=>admin(m)||Boolean(suporte&&m.roles.cache.has(suporte));
  const button=(id:string,label:string,style=ButtonStyle.Secondary)=>new ButtonBuilder().setCustomId('tk:'+id).setLabel(label).setStyle(style);
  const row=(...buttons:ButtonBuilder[])=>new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
  const embed=(id:string,titulo:string,texto:string,imagem='')=>{const e=new EmbedBuilder().setColor(cor(id)).setTitle(titulo).setDescription(texto);if(imagem)e.setImage(imagem);return e;};
  const ref=(id:string|null,cargo=false)=>id?(cargo?'<@&'+id+'>':'<#'+id+'>'):'Não configurado';
  const back=()=>row(button('config','Voltar às configurações'));
  function configPanel(id:string,nota='') {
    const c=store.obter(id).config;
    const p=new ContainerBuilder().setAccentColor(cor(id)).addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${emojiTexto('tickets')} Sistema de Tickets — Configurações\n${nota}\nConfigure aqui todo o sistema de atendimento por tickets do servidor.\n\n**Cargo de suporte:** ${ref(c.suporte,true)}\n**Categoria de abertos:** ${ref(c.categoria)}\n**Categoria de arquivados:** ${ref(c.arquivos)}\n**Canal de logs e transcrições:** ${ref(c.logs)}\n**Canal de suporte:** ${ref(c.canal)}\n\n${emojiTexto('voltar')} **Cargo de suporte** — equipe responsável pelo atendimento.\n${emojiTexto('voltar')} **Categoria de abertos** — onde os novos tickets são criados.\n${emojiTexto('voltar')} **Categoria de arquivados** — onde ficam os tickets encerrados.\n${emojiTexto('voltar')} **Logs e transcrições** — canal privado dos registros e conversas.\n${emojiTexto('voltar')} **Canal de suporte** — onde o cliente abre um ticket.\n${emojiTexto('voltar')} **Mensagem pública** — texto e imagem do painel de abertura.\n${emojiTexto('voltar')} **Mensagem privada** — texto e imagem dentro do ticket.\n${emojiTexto('voltar')} **Publicar / atualizar** — envia ou atualiza o painel no canal escolhido.\n${emojiTexto('voltar')} **Consultar histórico** — mostra os atendimentos já registrados.`));
    const options=[['suporte','Cargo de suporte','equipe'],['categoria','Categoria de tickets abertos','tickets'],['arquivos','Categoria de tickets arquivados','historico'],['logs','Canal de logs e transcrições','logs'],['canal','Canal para abrir ticket','logs'],['publica','Mensagem pública e imagem','canais'],['privada','Mensagem privada e imagem','canais'],['publicar','Publicar / atualizar painel','tickets'],['historico','Consultar histórico','historico']] as const;
    const menu=new StringSelectMenuBuilder().setCustomId('tk:configop').setPlaceholder('Escolha o que configurar').addOptions(options.map(([value,label,emoji])=>({value,label,emoji:emojiComponente(emoji)})));
    p.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu));
    p.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('anzy:inicio').setLabel('Menu principal').setStyle(ButtonStyle.Secondary)));
    return {components:[p],flags:MessageFlags.IsComponentsV2 as const};
  }
  async function selectPanel(id:string,campo:string,guild:Guild,pagina=0) {
    const c=store.obter(id).config,p=new ContainerBuilder().setAccentColor(cor(id));
    p.addTextDisplayComponents(new TextDisplayBuilder().setContent('## Configurar tickets\n'+({suporte:'Selecione o cargo que atenderá os tickets. Administradores também têm acesso.',categoria:'Selecione a categoria dos tickets abertos.',arquivos:'Selecione a categoria dos tickets arquivados.',logs:'Selecione um canal privado para registros e transcrições de tickets.',canal:'Selecione o canal onde será publicado o painel de atendimento.'}[campo]??'')));
    if(campo==='suporte') {
      const select=new RoleSelectMenuBuilder().setCustomId('tk:set:suporte').setPlaceholder('Cargo de suporte');if(c.suporte)select.setDefaultRoles(c.suporte);
      p.addActionRowComponents(new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(select));
    }else if(campo==='categoria'||campo==='arquivos'){
      const todas=await guild.channels.fetch();
      const categorias=[...todas.values()].filter(ch=>ch?.type===ChannelType.GuildCategory).sort((a,b)=>a!.name.localeCompare(b!.name));
      const page=Math.max(0,Math.min(pagina,Math.max(0,Math.ceil(categorias.length/25)-1))),lista=categorias.slice(page*25,page*25+25);
      if(lista.length){
        const select=new StringSelectMenuBuilder().setCustomId('tk:cat:'+campo).setPlaceholder('Selecione somente uma categoria').addOptions(lista.map(ch=>({label:ch!.name.slice(0,100),value:ch!.id,default:ch!.id===c[campo]})));
        p.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
      }else p.addTextDisplayComponents(new TextDisplayBuilder().setContent('Nenhuma categoria encontrada. Crie uma categoria no servidor e volte a esta tela.'));
      if(categorias.length>25)p.addActionRowComponents(row(button('categorias:'+campo+':'+(page-1),'Anterior').setDisabled(page===0),button('categorias:'+campo+':'+(page+1),'Próxima').setDisabled((page+1)*25>=categorias.length)));
    }else{
      const select=new ChannelSelectMenuBuilder().setCustomId('tk:set:'+campo).setPlaceholder('Selecione o canal ou categoria').setChannelTypes(campo==='categoria'||campo==='arquivos'?ChannelType.GuildCategory:ChannelType.GuildText);
      p.addActionRowComponents(new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(select));
    }
    p.addActionRowComponents(back());return {components:[p],flags:MessageFlags.IsComponentsV2 as const};
  }
  function formulario(tipo:string,id:string) {
    const c=store.obter(id).config;
    const m=new ModalBuilder().setCustomId('tk:texto:'+tipo).setTitle(tipo==='publica'?'Mensagem pública':'Mensagem dentro do ticket');
    if(tipo==='publica')m.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('titulo').setLabel('Título do painel').setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(true).setValue(c.tituloPublico)));
    m.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('texto').setLabel('Texto (use {usuario} e {servidor})').setStyle(TextInputStyle.Paragraph).setMaxLength(1800).setRequired(true).setValue(tipo==='publica'?c.textoPublico:c.textoPrivado)));
    const img=new TextInputBuilder().setCustomId('imagem').setLabel('Link HTTPS da imagem (opcional)').setStyle(TextInputStyle.Short).setMaxLength(1500).setRequired(false);const atual=tipo==='publica'?c.imagemPublica:c.imagemPrivada;if(atual)img.setValue(atual);
    m.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(img));return m;
  }
  function listPanel(id:string,page=0) {
    const todos=Object.values(store.obter(id).tickets).filter(t=>t.tipo!=='venda').sort((a,b)=>b.criado-a.criado);const pagina=Math.max(0,Math.min(page,Math.max(0,Math.ceil(todos.length/10)-1))),lista=todos.slice(pagina*10,pagina*10+10);
    const p=new ContainerBuilder().setAccentColor(cor(id));
    p.addTextDisplayComponents(new TextDisplayBuilder().setContent('## Histórico e gerenciamento\n'+(lista.length?lista.map(t=>`<#${t.canal}> — **${t.estado}** · <@${t.autor}>${t.atendente?' · atendente <@'+t.atendente+'>':''}`).join('\n'):'Nenhum ticket registrado.')+'\n\nPágina '+(pagina+1)+' de '+Math.max(1,Math.ceil(todos.length/10))));
    if(lista.length)p.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId('tk:gerenciar').setPlaceholder('Selecione um ticket para administrar').addOptions(lista.map(t=>({label:('Ticket '+t.canal+' — '+t.estado).slice(0,100),value:t.canal})))));
    p.addActionRowComponents(row(button('lista:'+Math.max(0,pagina-1),'Anterior').setDisabled(pagina===0),button('lista:'+(pagina+1),'Próxima').setDisabled((pagina+1)*10>=todos.length),button('config','Configurar tickets')));return {components:[p],flags:MessageFlags.IsComponentsV2 as const};
  }
  function staffPanel(id:string,t:Ticket) {
    const tb=(id:string,label:string,style=ButtonStyle.Secondary)=>button(id+':t:'+t.canal,label,style);
    const p=new ContainerBuilder().setAccentColor(cor(id));p.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## Equipe de atendimento\n**Ticket:** <#${t.canal}>\n**Autor:** <@${t.autor}>\n**Estado:** ${t.estado}\n**Responsável:** ${t.atendente?'<@'+t.atendente+'>':'Não assumido'}`));
    if(t.estado==='aberto') {
      p.addActionRowComponents(row(tb('assumir','Assumir ticket',ButtonStyle.Primary),tb('fechar','Fechar ticket',ButtonStyle.Danger),tb('arquivar','Arquivar ticket'),tb('notificar','Notificar usuário')));
      p.addActionRowComponents(new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(new UserSelectMenuBuilder().setCustomId('tk:add:t:'+t.canal).setPlaceholder('Adicionar participante ao ticket')));
      p.addActionRowComponents(new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(new UserSelectMenuBuilder().setCustomId('tk:remover:t:'+t.canal).setPlaceholder('Remover participante do ticket')));
      p.addActionRowComponents(new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(new UserSelectMenuBuilder().setCustomId('tk:transferir:t:'+t.canal).setPlaceholder('Transferir para outro responsável')));
    }else if(t.estado==='fechado')p.addActionRowComponents(row(tb('arquivar','Arquivar preservando a conversa')));
    return {components:[p],flags:MessageFlags.IsComponentsV2 as const};
  }
  async function canalTexto(guild:Guild,id:string|null) {
    if(!id)throw Error('Configure o canal primeiro.');const ch=await guild.channels.fetch(id);if(!ch||ch.type!==ChannelType.GuildText)throw Error('O canal configurado não existe ou não é um canal de texto.');return ch;
  }
  async function validarEnvio(ch:TextChannel,anexo=false) {
    const me=await ch.guild.members.fetchMe();const perms=ch.permissionsFor(me);if(!perms.has([P.ViewChannel,P.SendMessages,P.EmbedLinks,...(anexo?[P.AttachFiles]:[])]))throw Error('O bot precisa de Ver canal, Enviar mensagens, Inserir links'+(anexo?' e Anexar arquivos':'')+' em '+ch.name+'.');
  }
  async function transcricao(ch:TextChannel,t:Ticket) {
    const linhas:string[]=[];const mensagensSalvas:{author:{tag:string};createdTimestamp:number;content:string;embeds:{description:string|null}[]}[]=[];let before:string|undefined;
    const esc=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
    const link=(s:string)=>{try{return new URL(s).protocol==='https:'?`<a href="${esc(s)}" rel="noreferrer">${esc(s)}</a>`:esc(s);}catch{return esc(s);}};
    while(true){const msgs=await ch.messages.fetch({limit:100,...(before?{before}:{})});if(!msgs.size)break;
      for(const m of msgs.values())linhas.push(`<article><header>${esc(m.author.tag)} (${m.author.id}) · ${esc(m.createdAt.toISOString())}</header><pre>${esc(m.content)}</pre>${m.attachments.map(a=>'<p>Anexo: '+link(a.url)+'</p>').join('')}${m.embeds.map(e=>'<pre>'+esc([e.title,e.description,...e.fields.map(f=>f.name+': '+f.value)].filter(Boolean).join('\n'))+'</pre>'+(e.image?'<p>Imagem: '+link(e.image.url)+'</p>':'')).join('')}</article>`);
      for(const m of msgs.values())mensagensSalvas.push({author:{tag:m.author.tag},createdTimestamp:m.createdAt.getTime(),content:m.content,embeds:m.embeds.map(e=>({description:e.description}))});
      before=msgs.last()!.id;if(msgs.size<100)break;
    }
    const texto=`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Ticket ${t.canal}</title><style>body{background:#202225;color:#eee;font:16px system-ui;max-width:1000px;margin:32px auto;padding:16px}article{background:#2b2d31;padding:16px;margin:12px 0;border-radius:8px}header{color:#aaa}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}a{color:#8ab4ff}</style><h1>Transcrição do ticket ${t.canal}</h1><pre>${esc('Servidor: '+ch.guild.name+'\nAutor: '+t.autor+'\nResponsável: '+(t.atendente??'Não assumido')+'\nFechado por: '+t.fechadoPor+'\nAbertura: '+new Date(t.criado).toISOString()+'\nFechamento: '+new Date(t.fechado!).toISOString()+'\nMotivo: '+t.motivo)}</pre><p>Mensagens em ordem cronológica. Anexos e imagens são links do Discord e podem expirar. A conversa original permanece no canal.</p>${linhas.reverse().join('\n')}</html>`;
    if(Buffer.byteLength(texto)>8 * 1024 * 1024)throw Error('Transcrição excede 8 MB. O ticket permanece aberto para preservar o registro.');
    mkdirSync(transcriptDir,{recursive:true});writeFileSync(join(transcriptDir,ch.id+'.html'),texto,'utf8');writeFileSync(join(transcriptDir,ch.id+'.json'),JSON.stringify(mensagensSalvas.reverse()),'utf8');
    return new AttachmentBuilder(Buffer.from(texto,'utf8'),{name:'ticket-'+ch.id+'.html'});
  }
  async function fechar(guild:Guild,canalId:string,ator:string,motivo:string,preservar=false) {
    const key=guild.id+':'+canalId;if(locks.has(key))throw Error('Já há uma operação neste ticket.');locks.add(key);
    try {
      const t=store.obter(guild.id).tickets[canalId];if(!t||t.estado!=='aberto')throw Error('Este ticket não está aberto.');
      const c=configDoTicket(guild.id,t),canalLog=await canalTexto(guild,c.logs);await validarEnvio(canalLog,true);
      if(canalLog.permissionsFor(guild.roles.everyone).has(P.ViewChannel))throw Error('O canal de logs deve ser privado para receber a transcrição.');
      const ch=await canalTexto(guild,canalId);const atualizado:Ticket={...t,estado:'fechado',fechado:Date.now(),fechadoPor:ator,motivo};
      await ch.permissionOverwrites.set(permissoesTicket(guild.id,bot.user!.id,atualizado));
      try {
        const anexo=await transcricao(ch,atualizado);
        const registro=embed(guild.id,emojiTexto('tickets')+' Ticket encerrado',`**Canal:** <#${ch.id}>\n**Aberto por:** <@${t.autor}>\n**Assumido por:** ${t.atendente?'<@'+t.atendente+'>':'Não assumido'}\n**Fechado por:** <@${ator}>\n**Abertura:** <t:${Math.floor(t.criado/1000)}:F>\n**Fechamento:** <t:${Math.floor(atualizado.fechado!/1000)}:F>\n**Motivo:** ${motivo}\n\n${emojiTexto('logs')} Use os botões abaixo para consultar ou baixar a transcrição.`).setTimestamp(atualizado.fechado!).setFooter({text:'Anzy Programs • Tickets'});
        const arquivo=await guardarTranscricao(guild,bot.user!.id,anexo,store);
        const enviado=await canalLog.send({embeds:[registro],allowedMentions:{parse:[]}});
        if(arquivo)await enviado.edit({components:[row(button('ver:0:t:'+t.canal,'Ver Transcript'),new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Download da transcrição').setURL(arquivo.url))]});
        store.salvar(guild.id,atualizado);
      }catch(e){await ch.permissionOverwrites.set(permissoesTicket(guild.id,bot.user!.id,t));throw e;}
      await ch.send({embeds:[embed(guild.id,'Ticket encerrado',`Encerrado por <@${ator}>.\n**Motivo:** ${motivo}\n**Horário:** <t:${Math.floor(atualizado.fechado!/1000)}:F>\nConversa preservada; transcrição enviada aos logs.`)],allowedMentions:{parse:[]}}).catch(()=>{});
      let dm=true;try{const u=await bot.users.fetch(t.autor);await u.send({embeds:[embed(guild.id,'Seu ticket foi encerrado',`**Servidor:** ${guild.name}\n**Ticket:** ${t.canal}\n**Responsável pelo fechamento:** <@${ator}>\n**Atendente:** ${t.atendente?'<@'+t.atendente+'>':'Não assumido'}\n**Aberto em:** <t:${Math.floor(t.criado/1000)}:F>\n**Encerrado em:** <t:${Math.floor(atualizado.fechado!/1000)}:F>\n**Motivo:** ${motivo}\n\nAgradecemos seu contato!` ).setTimestamp(atualizado.fechado!)]});}catch{dm=false;}
      if(!preservar){try{await ch.delete('Ticket encerrado por '+ator+'; transcrição enviada aos logs.');}catch{throw Error('O ticket foi encerrado e a transcrição salva, mas o bot não conseguiu excluir o canal. Verifique Gerenciar canais.');}}
      return `${emojiTexto('sucesso')} Ticket encerrado. Log e transcrição enviados ao canal configurado.`+(!dm?' Não foi possível entregar a DM ao autor; confira suas configurações de privacidade.':' O autor recebeu os detalhes por DM.');
    }finally{locks.delete(key);}
  }
  async function arquivar(guild:Guild,t:Ticket) {
    const key=guild.id+':'+t.canal;if(locks.has(key))throw Error('Já há uma operação neste ticket.');locks.add(key);
    try {
      const atual=store.obter(guild.id).tickets[t.canal];if(!atual||atual.estado!=='fechado')throw Error('Feche o ticket antes de arquivar.');
      const c=configDoTicket(guild.id,atual);const cat=c.arquivos?await guild.channels.fetch(c.arquivos):null;if(!cat||cat.type!==ChannelType.GuildCategory)throw Error('Configure a categoria de arquivados.');
      const ch=await canalTexto(guild,t.canal);const anexo=await transcricao(ch,atual);const canalLog=await canalTexto(guild,c.logs);await validarEnvio(canalLog,true);
      if(canalLog.permissionsFor(guild.roles.everyone).has(P.ViewChannel))throw Error('O canal de logs deve ser privado.');
      const arquivo=await guardarTranscricao(guild,bot.user!.id,anexo,store);
      const enviado=await canalLog.send({embeds:[embed(guild.id,emojiTexto('tickets')+' Ticket arquivado','**Canal:** <#'+t.canal+'>\n**Autor:** <@'+atual.autor+'>\n**Fechado por:** <@'+atual.fechadoPor+'>\n**Motivo:** '+atual.motivo+'\nConversa preservada para a equipe.')],allowedMentions:{parse:[]}});
      if(arquivo)await enviado.edit({components:[row(button('ver:0:t:'+t.canal,'Ver Transcript'),new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Download da transcrição').setURL(arquivo.url))]});
      await ch.permissionOverwrites.set(permissoesTicket(guild.id,bot.user!.id,atual,true));await ch.setParent(cat.id,{lockPermissions:false});await ch.setName('arquivado-'+t.canal.slice(-6));store.salvar(guild.id,{...atual,estado:'arquivado'});
    }finally{locks.delete(key);}
  }
  async function adicionar(guild:Guild,t:Ticket,userId:string) {
    const key=guild.id+':'+t.canal;if(locks.has(key))throw Error('Já há uma operação neste ticket.');locks.add(key);
    try{const atual=store.obter(guild.id).tickets[t.canal];if(!atual||atual.estado!=='aberto')throw Error('Somente tickets abertos aceitam participantes.');
      const membro=await guild.members.fetch(userId);if(membro.user.bot)throw Error('Selecione um membro, não um bot.');
      if(userId===atual.autor||atual.participantes.includes(userId))return;
      const ch=await canalTexto(guild,t.canal);await ch.permissionOverwrites.edit(userId,{ViewChannel:true,SendMessages:true,ReadMessageHistory:true,AttachFiles:true,EmbedLinks:true});
      try{store.salvar(guild.id,{...atual,participantes:[...atual.participantes,userId]});}catch(e){await ch.permissionOverwrites.delete(userId);throw e;}
      
    }finally{locks.delete(key);}
  }
  async function remover(guild:Guild,t:Ticket,userId:string) {
    const key=guild.id+':'+t.canal;if(locks.has(key))throw Error('Já há uma operação neste ticket.');locks.add(key);
    try {
      const atual=store.obter(guild.id).tickets[t.canal];if(!atual||atual.estado!=='aberto')throw Error('O ticket não está aberto.');
      if(userId===atual.autor||!atual.participantes.includes(userId))throw Error('Só é possível remover participantes adicionados, sem remover o autor.');
      const membro=await guild.members.fetch(userId).catch(()=>null);if(membro&&staff(membro,atual.suporte))throw Error('Este participante pertence à equipe. Seu acesso depende do cargo de suporte.');
      const novo={...atual,participantes:atual.participantes.filter(id=>id!==userId)},ch=await canalTexto(guild,t.canal);
      await ch.permissionOverwrites.set(permissoesTicket(guild.id,bot.user!.id,novo));
      try{store.salvar(guild.id,novo);}catch(e){await ch.permissionOverwrites.set(permissoesTicket(guild.id,bot.user!.id,atual));throw e;}
      
    }finally{locks.delete(key);}
  }
  async function removerPanel(id:string,t:Ticket,guild:Guild,pagina=0) {
    const page=Math.max(0,Math.min(pagina,Math.max(0,Math.ceil(t.participantes.length/25)-1))),lista=t.participantes.slice(page*25,page*25+25);
    const p=new ContainerBuilder().setAccentColor(cor(id)).addTextDisplayComponents(new TextDisplayBuilder().setContent('## Remover participante\nSelecione quem deve deixar de ter acesso ao ticket. O autor e a equipe não podem ser removidos por aqui.'));
    if(lista.length){
      const options=await Promise.all(lista.map(async id=>{const membro=await guild.members.fetch(id).catch(()=>null);return {label:(membro?.displayName??membro?.user.username??id).slice(0,100),description:'ID: '+id,value:id};}));
      p.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId('tk:remover:t:'+t.canal).setPlaceholder('Participante a remover').addOptions(options)));
    }
    else p.addTextDisplayComponents(new TextDisplayBuilder().setContent('Nenhum participante adicional.'));
    if(t.participantes.length>25)p.addActionRowComponents(row(button('removerLista:'+(page-1)+':t:'+t.canal,'Anterior').setDisabled(page===0),button('removerLista:'+(page+1)+':t:'+t.canal,'Próxima').setDisabled((page+1)*25>=t.participantes.length)));
    p.addActionRowComponents(row(button('staff:t:'+t.canal,'Voltar à equipe')));return {components:[p],flags:MessageFlags.IsComponentsV2 as const};
  }
  async function transferir(guild:Guild,t:Ticket,userId:string,ator:string) {
    const key=guild.id+':'+t.canal;if(locks.has(key))throw Error('Já há uma operação neste ticket.');locks.add(key);
    try {
      const atual=store.obter(guild.id).tickets[t.canal];if(!atual||atual.estado!=='aberto')throw Error('O ticket não está aberto.');
      const origem=await guild.members.fetch(ator);if(atual.atendente&&atual.atendente!==ator&&!admin(origem))throw Error('Somente o responsável atual ou um administrador pode transferir o ticket.');
      const destino=await guild.members.fetch(userId);if(destino.user.bot||!staff(destino,atual.suporte))throw Error('Escolha alguém do cargo de suporte ou um administrador.');
      store.salvar(guild.id,{...atual,atendente:userId});
    }finally{locks.delete(key);}
  }
  async function notificar(guild:Guild,t:Ticket,ator:string) {
    const key=guild.id+':'+t.canal;if(locks.has(key))throw Error('Já há uma operação neste ticket.');locks.add(key);
    try {
      const atual=store.obter(guild.id).tickets[t.canal];if(!atual||atual.estado!=='aberto')throw Error('O ticket não está aberto.');
      if(Date.now()-(atual.notificadoEm??0)<60000)throw Error('Aguarde um minuto antes de notificar o autor novamente.');
      const ch=await canalTexto(guild,t.canal),mensagens=await ch.messages.fetch({limit:50});let encontrou=false;
      for(const m of mensagens.values()){
        if(m.author.bot)continue;
        const membro=await guild.members.fetch(m.author.id).catch(()=>null);if(membro&&staff(membro,atual.suporte)){encontrou=true;break;}
      }
      if(!encontrou)throw Error('Envie uma resposta da equipe no ticket antes de notificar o usuário.');
      const u=await bot.users.fetch(atual.autor);
      try{await u.send({embeds:[embed(guild.id,'Você recebeu uma resposta no ticket',`Um responsável respondeu ao seu atendimento em **${guild.name}**.\n\n[Abrir seu ticket](https://discord.com/channels/${guild.id}/${t.canal})\n**Notificado por:** <@${ator}>\n**Horário:** <t:${Math.floor(Date.now()/1000)}:F>`)]});}catch{throw Error('Não foi possível enviar a DM ao autor. Ele pode estar com mensagens privadas bloqueadas.');}
      store.salvar(guild.id,{...atual,notificadoEm:Date.now()});
    }finally{locks.delete(key);}
  }
  async function abrir(guild:Guild,autor:string,panelMessage:string,source:string,venda?:string) {
    const key=guild.id+':abrir:'+autor;if(locks.has(key))throw Error('Seu ticket está sendo criado.');locks.add(key);
    try{
      const d=store.obter(guild.id),c=venda?{...d.config,...(configVendas?.(guild.id)??{suporte:null,categoria:null,arquivos:null,logs:null})}:d.config;
      if(!venda&&(c.painelId!==panelMessage||c.painelCanal!==source))throw Error('Este painel foi substituído. Utilize o painel atual.');
      for(const t of Object.values(d.tickets).filter(t=>!venda&&t.tipo!=='venda'&&t.autor===autor&&t.estado==='aberto')){
        try{if(await guild.channels.fetch(t.canal))return t.canal;}catch(e){if(!(typeof e==='object'&&e&&'code'in e&&e.code===10003))throw e;}
      }
      if(!c.suporte||!c.categoria)throw Error('A equipe precisa configurar o cargo de suporte e a categoria de tickets.');
      const role=await guild.roles.fetch(c.suporte);if(!role||role.id===guild.id||role.managed)throw Error('Cargo de suporte inválido.');
      const cat=await guild.channels.fetch(c.categoria);if(!cat||cat.type!==ChannelType.GuildCategory)throw Error('Categoria de tickets não encontrada.');
      const me=await guild.members.fetchMe();if(!me.permissions.has([P.ManageChannels,P.ManageRoles]))throw Error('O bot precisa de Gerenciar canais e Gerenciar permissões.');
      const t:Ticket={tipo:venda?'venda':'suporte',...(venda?{vendaConfig:{suporte:c.suporte,categoria:c.categoria,arquivos:c.arquivos,logs:c.logs}}:{}),canal:'',autor,suporte:c.suporte,participantes:[],estado:'aberto',criado:Date.now(),fechado:null,fechadoPor:null,motivo:'',atendente:null};
      const ch=await guild.channels.create({name:venda?'pedido-'+venda.slice(0,8):'ticket-'+autor.slice(-6),type:ChannelType.GuildText,parent:cat.id,topic:'Atendimento Anzy Programs | autor '+autor+(venda?' | pedido '+venda:''),permissionOverwrites:permissoesTicket(guild.id,bot.user!.id,t)});t.canal=ch.id;
      try{store.salvar(guild.id,t);}catch(e){await ch.delete('Falha ao salvar ticket recém-criado e ainda vazio.');throw e;}
      const texto=venda?'Olá, <@'+autor+'>! Este é o atendimento privado do pedido **'+venda+'**. Combine a entrega com a equipe de vendas.':c.textoPrivado.replaceAll('{usuario}','<@'+autor+'>').replaceAll('{servidor}',guild.name);
      await ch.send({embeds:[embed(guild.id,'Atendimento privado',texto,c.imagemPrivada)],components:[row(button('staff','Painel da equipe'))],allowedMentions:{parse:[]}}).catch(e=>console.error('Mensagem inicial do ticket:',e instanceof Error?e.message:'Erro'));
      return ch.id;
    }finally{locks.delete(key);}
  }
  async function publicar(guild:Guild) {
    const c=store.obter(guild.id).config;if(!c.suporte||!c.categoria)throw Error('Configure cargo de suporte e categoria dos tickets antes de publicar.');
    const canal=await canalTexto(guild,c.canal);await validarEnvio(canal);
    const payload={embeds:[embed(guild.id,c.tituloPublico,c.textoPublico.replaceAll('{servidor}',guild.name).replaceAll('{usuario}','membro'),c.imagemPublica)],components:[row(button('abrir','Abrir ticket',ButtonStyle.Primary).setEmoji(emojiComponente('tickets')))],allowedMentions:{parse:[] as never[]}};
    if(c.painelId&&c.painelCanal===canal.id){let msg;try{msg=await canal.messages.fetch(c.painelId);}catch(e){if(!(typeof e==='object'&&e&&'code'in e&&e.code===10008))throw e;}if(msg){await msg.edit(payload);return;}}
    const msg=await canal.send(payload);try{store.configurar(guild.id,{painelId:msg.id,painelCanal:canal.id});}catch(e){await msg.edit({components:[]});throw e;}
  }
  const tratar = async function tratar(i:Interaction):Promise<boolean> {
    const entrada=(i.isStringSelectMenu()&&i.customId==='anzy:categoria'&&i.values[0]==='atendimento')||(i.isButton()&&i.customId==='anzy:voltar:atendimento');
    const escolha=i.isStringSelectMenu()&&i.customId==='anzy:opcao:atendimento';
    const cmd=i.isChatInputCommand()&&comandosTickets.some(c=>c.name===i.commandName);
    const proprio='customId'in i&&i.customId.startsWith('tk:');
    if(!entrada&&!escolha&&!cmd&&!proprio)return false;if(!i.isRepliable())return false;
    let atualizaMensagem=false; const responder=async(texto:string)=>{if(atualizaMensagem)await i.editReply({components:[new ContainerBuilder().setAccentColor(cor(i.guildId)).addTextDisplayComponents(new TextDisplayBuilder().setContent(texto))],flags:MessageFlags.IsComponentsV2});else if(i.deferred||i.replied)await i.editReply({content:texto});else await i.reply({content:texto,flags:MessageFlags.Ephemeral});};
    try {
      if(!i.inGuild()||!i.guildId||!i.guild) {await responder('Use esta função em um servidor.');return true;}
      const guild=i.guild,id=guild.id,c=store.obter(id).config;
      const acao='customId'in i?i.customId.split(':')[1]:i.isChatInputCommand()?i.commandName:'';
      // Acknowledge before any fetch, except operations that must open a modal.
      const alvo='customId'in i?i.customId.match(/:t:(\d+)$/)?.[1]:undefined;
      const ticketAtual=store.obter(id).tickets[alvo??i.channelId??''];
      const modal=(i.isStringSelectMenu()&&i.customId==='tk:configop'&&['publica','privada'].includes(i.values[0]??''))||(i.isButton()&&(acao==='fechar'||(acao==='arquivar'&&ticketAtual?.estado==='aberto')));
      if(!modal) {
        if((entrada||escolha||(i.isStringSelectMenu()&&['configop','cat'].includes(acao??''))||i.isRoleSelectMenu()||i.isChannelSelectMenu()||(i.isButton()&&['config','lista','categorias'].includes(acao??'')))&&!cmd){atualizaMensagem=true;await i.deferUpdate();} else if(i.isButton()&&['confirmarTodos','cancelarTodos'].includes(acao??''))await i.deferUpdate();
        else await i.deferReply({flags:MessageFlags.Ephemeral});
      }
      const member=i.inCachedGuild()?i.member:await guild.members.fetch(i.user.id),t=store.obter(id).tickets[alvo??i.channelId??''];
      if(i.isButton()&&acao==='abrir') {const canal=await abrir(guild,i.user.id,i.message.id,i.channelId);await responder('Seu atendimento: <#'+canal+'>');return true;}
      const onlyAdmin=entrada||escolha||['config','configop','categorias','cat','set','texto','publicar','closealltickets','confirmarTodos','cancelarTodos'].includes(acao??'');
      if(onlyAdmin&&!admin(member)){await responder('Apenas administradores podem configurar os tickets ou fechar todos.');return true;}
      if(!onlyAdmin&&!staff(member,t?.suporte??c.suporte)){await responder('Apenas a equipe de suporte e administradores podem gerenciar tickets.');return true;}
      if(entrada){await i.editReply(configPanel(id));return true;}
      if(escolha) {
        await i.editReply(configPanel(id));return true;
      }
      if(acao==='config') {await i.editReply(configPanel(id));return true;}
      if(i.isStringSelectMenu()&&acao==='configop') {
        const campo=i.values[0]??'';
        if(campo==='publica'||campo==='privada')await i.showModal(formulario(campo,id));
        else if(campo==='historico')await i.editReply(listPanel(id));
        else if(campo==='publicar'){await publicar(guild);await i.editReply(configPanel(id,`${emojiTexto('sucesso')} Painel publicado/atualizado.`));}
        else if(['suporte','categoria','arquivos','logs','canal'].includes(campo))await i.editReply(await selectPanel(id,campo,guild));
        else await responder('Opção inválida.');return true;
      }
      if(i.isButton()&&acao==='categorias') {
        const [, ,campo,pag]=i.customId.split(':');if(campo!=='categoria'&&campo!=='arquivos')throw Error('Opção inválida.');
        const pagina=Number(pag);await i.editReply(await selectPanel(id,campo,guild,Number.isFinite(pagina)?pagina:0));return true;
      }
      if(((i.isRoleSelectMenu()||i.isChannelSelectMenu())&&acao==='set')||(i.isStringSelectMenu()&&acao==='cat')) {
        const campo=i.customId.split(':')[2],value=i.values[0];if(!campo||!value||!['suporte','categoria','arquivos','logs','canal'].includes(campo))throw Error('Opção inválida.');
        if(campo==='suporte'){const role=await guild.roles.fetch(value);if(!role||role.id===guild.id||role.managed)throw Error('Escolha um cargo de suporte específico, não @everyone nem cargo de bot.');}
        else {const ch=await guild.channels.fetch(value);if(!ch||ch.type!==(['categoria','arquivos'].includes(campo)?ChannelType.GuildCategory:ChannelType.GuildText))throw Error('Tipo de canal inválido.');if(ch.type===ChannelType.GuildText)await validarEnvio(ch,campo==='logs');if(campo==='logs'&&ch.permissionsFor(guild.roles.everyone).has(P.ViewChannel))throw Error('Escolha um canal de logs privado para proteger as conversas dos clientes.');}
        store.configurar(id,{[campo]:value});await i.editReply(configPanel(id,`${emojiTexto('sucesso')} Configuração salva.`));return true;
      }
      if(i.isModalSubmit()&&acao==='texto') {
        const tipo=i.customId.split(':')[2],texto=i.fields.getTextInputValue('texto').trim(),imagem=i.fields.getTextInputValue('imagem').trim();
        if(!['publica','privada'].includes(tipo??'')||!texto||texto.length>1800||!imagemValida(imagem))throw Error('Informe um texto e um link HTTPS válido para a imagem, ou deixe a imagem vazia.');
        if(tipo==='publica'){const titulo=i.fields.getTextInputValue('titulo').trim();if(!titulo)throw Error('Informe o título.');store.configurar(id,{tituloPublico:titulo,textoPublico:texto,imagemPublica:imagem});}else store.configurar(id,{textoPrivado:texto,imagemPrivada:imagem});
        await responder(`${emojiTexto('sucesso')} Mensagem salva. Use Publicar / atualizar painel para atualizar a mensagem pública.`);return true;
      }
      if(acao==='publicar'){await publicar(guild);await responder(`${emojiTexto('sucesso')} Painel publicado/atualizado em `+ref(c.canal)+'.');return true;}
      if(acao==='lista'||acao==='managetickets'){const page='customId'in i?Number(i.customId.split(':')[2]??0):0;await i.editReply(listPanel(id,Number.isFinite(page)?page:0));return true;}
      if(acao==='closealltickets') {
        const count=Object.values(store.obter(id).tickets).filter(t=>t.tipo!=='venda'&&t.estado==='aberto').length;
        await i.editReply({content:`Fechar os **${count} tickets abertos**? As transcrições serão enviadas aos logs e os canais serão excluídos. Esta confirmação expira em 60 segundos.`,components:[row(button('confirmarTodos:'+i.user.id+':'+Date.now(),'Confirmar fechamento',ButtonStyle.Danger),button('cancelarTodos','Cancelar'))]});return true;
      }
      if(acao==='cancelarTodos') {await i.editReply({content:'Fechamento em massa cancelado.',components:[]});return true;}
      if(acao==='confirmarTodos'&&i.isButton()) {
        const [, ,owner,stamp]=i.customId.split(':');if(owner!==i.user.id||!stamp||!Number.isFinite(Number(stamp))||Date.now()-Number(stamp)>60000||Number(stamp)>Date.now())throw Error('Confirmação expirada ou de outro administrador. Execute /closealltickets novamente.');
        await i.editReply({content:'Fechando tickets...',components:[]});let ok=0,fail=0;
        for(const ticket of Object.values(store.obter(id).tickets).filter(t=>t.tipo!=='venda'&&t.estado==='aberto')){try{await fechar(guild,ticket.canal,i.user.id,'Encerramento em massa pela administração.');ok++;}catch{fail++;}}
        await i.editReply({content:`Finalizado: ${ok} encerrados; ${fail} falharam. Conversas preservadas.`,components:[]});return true;
      }
      if(acao==='gerenciar'&&i.isStringSelectMenu()) {
        const escolhido=store.obter(id).tickets[i.values[0]??''];if(!escolhido||!staff(member,escolhido.suporte))throw Error('Ticket indisponível ou acesso negado.');
        await i.editReply(staffPanel(id,escolhido));return true;
      }
      if(!t)throw Error('Use esta ação dentro de um ticket criado por este bot.');
      if(acao==='ver') {
        const pagina='customId'in i?Number(i.customId.split(':')[2]??0):0;
        const snapshot=join(transcriptDir,t.canal+'.json');
        const todas: {author:{tag:string};createdTimestamp:number;content:string;embeds:{description:string|null}[]}[]=[];
        if(existsSync(snapshot))todas.push(...JSON.parse(readFileSync(snapshot,'utf8')));
        else{const ch=await canalTexto(guild,t.canal);let before:string|undefined;while(true){const lote=await ch.messages.fetch({limit:100,...(before?{before}:{})});todas.push(...lote.values());if(lote.size<100)break;before=lote.last()!.id;}todas.reverse();}const page=Math.max(0,Math.min(Number.isFinite(pagina)?pagina:0,Math.max(0,Math.ceil(todas.length/5)-1)));
        const texto=todas.slice(page*5,page*5+5).map(m=>'**'+m.author.tag+'** · <t:'+Math.floor(m.createdTimestamp/1000)+':f>\n'+(m.content||m.embeds.map(e=>e.description??'').join('\n')||'(imagem/anexo)')).join('\n\n').slice(0,3800);
        await i.editReply({embeds:[embed(id,'Transcript — '+t.canal,texto||'Nenhuma mensagem disponível.').setFooter({text:'Visualização resumida. O download HTML contém o registro integral.'})],components:[row(button('ver:'+Math.max(0,page-1)+':t:'+t.canal,'Anterior').setDisabled(page===0),button('ver:'+(page+1)+':t:'+t.canal,'Próxima').setDisabled((page+1)*5>=todas.length))]});return true;
      }
      if(acao==='staff'||acao==='ticketstaff'){await i.editReply(staffPanel(id,t));return true;}
      if(acao==='assumir') {if(t.estado!=='aberto')throw Error('O ticket não está aberto.');if(t.atendente&&t.atendente!==i.user.id)throw Error('Este ticket já foi assumido por outro atendente.');store.salvar(id,{...t,atendente:i.user.id});await responder(`${emojiTexto('sucesso')} Você assumiu o ticket.`);return true;}
      if((acao==='fechar'||(acao==='arquivar'&&t.estado==='aberto'))&&i.isButton()) {
        if(acao==='arquivar'&&!configDoTicket(id,t).arquivos)throw Error('Configure uma categoria de arquivados válida.');
        const input=new TextInputBuilder().setCustomId('motivo').setLabel('Motivo do encerramento (opcional)').setStyle(TextInputStyle.Paragraph).setMaxLength(500).setRequired(false);
        await i.showModal(new ModalBuilder().setCustomId((acao==='arquivar'?'tk:encerrar:arquivar':'tk:encerrar')+':t:'+t.canal).setTitle(acao==='arquivar'?'Fechar e arquivar ticket':'Encerrar ticket').addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input)));return true;
      }
      if(acao==='encerrar'&&i.isModalSubmit()){
        const motivo=i.fields.getTextInputValue('motivo').trim()||'Não informado.';if(motivo.length>500)throw Error('O motivo pode ter até 500 caracteres.');
        if(i.customId.startsWith('tk:encerrar:arquivar')){const arquivos=configDoTicket(id,t).arquivos;const categoria=arquivos?await guild.channels.fetch(arquivos):null;if(!categoria||categoria.type!==ChannelType.GuildCategory)throw Error('Configure uma categoria de arquivados válida.');}
        let resultado=await fechar(guild,t.canal,i.user.id,motivo,i.customId.startsWith('tk:encerrar:arquivar'));
        if(i.customId.startsWith('tk:encerrar:arquivar')){try{await arquivar(guild,store.obter(id).tickets[t.canal]!);resultado+=' Ticket arquivado.';}catch(e){resultado+=' Fechado, mas não foi possível mover para a categoria de arquivados: '+(e instanceof Error?e.message:'Erro');}}
        await responder(resultado);return true;
      }
      if(acao==='close_ticket'&&i.isChatInputCommand()){await responder(await fechar(guild,t.canal,i.user.id,i.options.getString('motivo')?.trim()||'Não informado.'));return true;}
      if(acao==='arquivar'||acao==='archive_ticket'){await arquivar(guild,t);await responder(`${emojiTexto('sucesso')} Ticket arquivado. Conversa preservada para a equipe.`);return true;}
      if(acao==='add_ticket'&&i.isChatInputCommand()){await adicionar(guild,t,i.options.getUser('usuario',true).id);await responder(`${emojiTexto('sucesso')} Participante adicionado.`);return true;}
      if(acao==='add'&&i.isUserSelectMenu()){await adicionar(guild,t,i.values[0]!);await responder(`${emojiTexto('sucesso')} Participante adicionado.`);return true;}
      if(acao==='removerLista'&&i.isButton()){const page=Number(i.customId.split(':')[2]??0);await i.editReply(await removerPanel(id,t,guild,Number.isFinite(page)?page:0));return true;}
      if(acao==='remover'&&(i.isStringSelectMenu()||i.isUserSelectMenu())){await remover(guild,t,i.values[0]!);await responder(`${emojiTexto('sucesso')} Participante removido do ticket.`);return true;}
      if(acao==='transferir'&&i.isUserSelectMenu()){await transferir(guild,t,i.values[0]!,i.user.id);await responder(`${emojiTexto('sucesso')} Responsável transferido para <@`+i.values[0]+'>.');return true;}
      if(acao==='notificar'&&i.isButton()){await notificar(guild,t,i.user.id);await responder(`${emojiTexto('sucesso')} Autor notificado por DM sobre a resposta da equipe.`);return true;}
      await responder('Ação inválida. Abra novamente o painel.');return true;
    }catch(e){
      if(typeof e==='object'&&e&&'code'in e&&(e.code===10062||e.code===40060))throw e;
      if(typeof e==='object'&&e&&'code'in e&&[10003,10008].includes(Number(e.code))&&i.channelId&&!bot.channels.cache.has(i.channelId))return true;
      console.error('Ação de ticket:',e instanceof Error?e.message:'Erro');await responder(emojiTexto('erro')+' '+(e instanceof Error?e.message:'Não foi possível executar a ação.'));return true;
    }
  };
  return Object.assign(tratar,{configurarVendas:(provider:(guild:string)=>TicketVendaConfig)=>{configVendas=provider;},abrirVenda:(guild:Guild,autor:string,pedido:string)=>abrir(guild,autor,'','',pedido),podeAtender:async(guild:Guild,usuario:string)=>staff(await guild.members.fetch(usuario),store.obter(guild.id).config.suporte)});
}

