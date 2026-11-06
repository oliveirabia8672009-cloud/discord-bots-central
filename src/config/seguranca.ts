import {podeConfigurar,acessoCompleto} from './acessos.js';
import {painelNaMensagem} from './painel-v2.js';
import {intervaloBot} from './contexto-bot.js';
import {arquivoDados} from './contexto-bot.js';
import {readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {ActionRowBuilder,AttachmentBuilder,AuditLogEvent,ButtonBuilder,ButtonStyle,ChannelSelectMenuBuilder,ChannelType,EmbedBuilder,Events,MessageFlags,ModalBuilder,PermissionFlagsBits as P,RoleSelectMenuBuilder,SlashCommandBuilder,StringSelectMenuBuilder,TextInputBuilder,TextInputStyle,UserSelectMenuBuilder,escapeMarkdown,type Client,type Interaction,type Guild,type GuildMember,type GuildAuditLogsEntry} from 'discord.js';
import {emojiTexto as e,emojiComponente as ic} from './emojis.js';
import {criarStoreSeguranca,analisarRisco,assinaturaRisco,type StoreSeguranca,type VendaRisco} from './seguranca-store.js';
import {instalarBackups} from './seguranca-backup.js';
import {instalarVerificacao} from './seguranca-verificacao.js';
import {instalarOAuth} from './seguranca-oauth.js';
import {criarDetectorArmadilha} from './seguranca-armadilha.js';
export const comandosSeguranca=[
  new SlashCommandBuilder().setName('security').setDescription('Abre as configurações de segurança e backups.').setDMPermission(false).setDefaultMemberPermissions(null),
  new SlashCommandBuilder().setName('verify').setDescription('Autoriza voluntariamente a recuperação da sua entrada neste servidor.').setDMPermission(false),
  new SlashCommandBuilder().setName('revokeauth').setDescription('Apaga sua autorização de recuperação neste servidor.').setDMPermission(false),
  new SlashCommandBuilder().setName('restoremember').setDescription('Dono: recupera um membro que consentiu via OAuth2 neste mesmo servidor.').setDMPermission(false).setDefaultMemberPermissions(P.Administrator).addStringOption(o=>o.setName('user_id').setDescription('ID do usuário que autorizou a recuperação.').setRequired(true).setMinLength(17).setMaxLength(20)),
];
const safe=(s:string,n=1200)=>escapeMarkdown(s.replaceAll('@','@\u200b')).slice(0,n);
const linha=(s:string)=>e('voltar')+' '+s;
const field=(id:string,label:string,value:string,max=6)=>new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setValue(value).setMaxLength(max).setRequired(true).setStyle(TextInputStyle.Short));
export function instalarSeguranca(bot:Client,cor:(g:string|null)=>number,store:StoreSeguranca=criarStoreSeguranca(),dataDir=arquivoDados('')){
  const detector=criarDetectorArmadilha();
  const verificacao=instalarVerificacao(store,dataDir);const aposAutorizar=async(g:string,u:string)=>verificacao.concluir(await bot.guilds.fetch(g),u);
  const backups=instalarBackups(store,dataDir);let oauth:ReturnType<typeof instalarOAuth>;
  try{oauth=instalarOAuth(bot,store,undefined,undefined,aposAutorizar);}catch{console.error('Configuração OAuth2 inválida; recurso desativado.');oauth=instalarOAuth(bot,store,null,undefined,aposAutorizar);}
  const btn=(id:string,label:string,icon:Parameters<typeof ic>[0]='voltar')=>new ButtonBuilder().setCustomId('sec:'+id).setLabel(label).setEmoji(ic(icon)).setStyle(ButtonStyle.Secondary);
  const row=(...b:ButtonBuilder[])=>new ActionRowBuilder<ButtonBuilder>().addComponents(b);
  const back=()=>row(btn('home','Voltar à segurança'),btn('close','Fechar','fechar'));
  const tela=(g:string,t:string,d:string,rows:ActionRowBuilder<any>[]=[back()])=>({embeds:[new EmbedBuilder().setColor(cor(g)).setTitle(e('permissoes')+' '+t).setDescription(d).setFooter({text:'Anzy Programs • Segurança e Proteção'})],components:rows,allowedMentions:{parse:[] as never[]}});
  async function enviar(i:any,p:any){p=painelNaMensagem(i,p);if(i.deferred||i.replied)await i.editReply(p);else await i.reply({...p,flags:(p.flags??0)|MessageFlags.Ephemeral});}
  const entradas=new Map<string,number[]>(),raidAte=new Map<string,number>(),ultimosAvisos=new Map<string,number>(),membrosVistos=new Map<string,number>(),auditoriasVistas=new Map<string,number>();
  const confirmacoes=new Map<string,{g:string;u:string;tipo:string;id:string;vence:number}>(),jobs=new Set<string>();
  const confirmacoesArmadilha=new Map<string,{g:string;u:string;acao:'timeout'|'expulsar'|'banir';vence:number}>();
  async function incidente(g:Guild,tipo:string,texto:string){
    const registro=store.incidente(g.id,tipo,texto),id=store.obter(g.id).config.logs;
    if(id)try{const ch=await g.channels.fetch(id);if(ch?.type===ChannelType.GuildText)await ch.send(tela(g.id,'Alerta • '+tipo,`${linha(safe(texto,2800))}\n\n**Registro:** ${registro.id}\n**Horário:** <t:${Math.floor(registro.quando/1000)}:F>`,[]));}catch{console.warn('Segurança: incidente salvo, canal de alertas indisponível.');}
  }
  async function entrada(m:GuildMember){
    const g=m.guild,c=store.obter(g.id).config;if(!c.raid||m.user.bot)return;
    const agora=Date.now(),visto=g.id+':'+m.id;if((membrosVistos.get(visto)??0)>agora-120000)return;membrosVistos.set(visto,agora);
    const lista=(entradas.get(g.id)??[]).filter(t=>t>=agora-c.janela*1000);lista.push(agora);entradas.set(g.id,lista);
    if(lista.length>=c.limite){raidAte.set(g.id,agora+120000);if((ultimosAvisos.get(g.id)??0)<agora-120000){ultimosAvisos.set(g.id,agora);await incidente(g,'Anti-Raid',`${lista.length} entradas em ${c.janela} segundos. ${c.conter?'Contenção temporária ativa para novas entradas elegíveis por 2 minutos.':'Modo de alerta: nenhuma punição automática.'}`);}}
    if(c.conter&&(raidAte.get(g.id)??0)>agora&&m.id!==g.ownerId&&!m.permissions.has(P.Administrator)&&!c.confiaveis.includes(m.id)&&!c.cargos.some(id=>m.roles.cache.has(id))){
      try{if(!m.moderatable)throw Error('permissões');await m.timeout(600000,'Anti-Raid: limite de entradas excedido; revisão da equipe.');await incidente(g,'Contenção de entrada',`Timeout de 10 minutos em ${m.id}. O usuário não foi banido. Revise em /untimeout se a entrada for legítima.`);}catch{await incidente(g,'Contenção indisponível',`Não foi possível conter ${m.id}. Confira o cargo do bot e Moderar membros.`);}
    }
  }
  async function auditoria(a:GuildAuditLogsEntry,g:Guild){
    const c=store.obter(g.id).config;if(!c.staff||!a.executorId||a.executorId===g.ownerId||a.executorId===bot.user?.id||c.confiaveis.includes(a.executorId))return;
    if(a.id){if(auditoriasVistas.has(a.id))return;auditoriasVistas.set(a.id,Date.now());}
    const me=await g.members.fetchMe();
    if(a.action===AuditLogEvent.MemberRoleUpdate){
      const adds=(a.changes.find(x=>x.key==='$add')?.new??[]) as {id:string}[];
      for(const r of adds.filter(x=>c.cargos.includes(x.id))){const role=await g.roles.fetch(r.id),m=a.targetId?await g.members.fetch({user:a.targetId,force:true}).catch(()=>null):null;if(!role||!m||!m.roles.cache.has(role.id))continue;
        try{if(m.id===g.ownerId||!me.permissions.has(P.ManageRoles)||me.roles.highest.comparePositionTo(role)<=0)throw Error('hierarquia');await m.roles.remove(role,`Proteção staff: concessão não autorizada por ${a.executorId}`);await incidente(g,'Cargo staff protegido',`Cargo ${role.id} removido de ${m.id}. Concedido por ${a.executorId}, que não está na lista de confiança.`);}catch{await incidente(g,'Cargo staff • revisão urgente',`Concessão do cargo ${r.id} a ${a.targetId} por ${a.executorId}. O bot não conseguiu desfazer; confira permissões e hierarquia.`);}
      }
    }
    if(a.action===AuditLogEvent.RoleUpdate&&a.targetId&&c.cargos.includes(a.targetId)){
      const p=a.changes.find(x=>x.key==='permissions');if(!p||p.old===undefined||p.new===undefined)return;
      const antes=BigInt(String(p.old)),depois=BigInt(String(p.new));const perigosas=P.Administrator|P.ManageRoles|P.ManageGuild|P.ManageChannels|P.ManageWebhooks|P.BanMembers|P.KickMembers|P.ModerateMembers|P.ManageMessages;
      if(((depois&~antes)&perigosas)===0n)return;
      const r=await g.roles.fetch(a.targetId);
      try{if(!r||r.managed||r.permissions.bitfield!==depois||me.roles.highest.comparePositionTo(r)<=0)throw Error('hierarquia ou alteração posterior');await r.setPermissions(antes,`Proteção staff: alteração por ${a.executorId}`);await incidente(g,'Permissões staff restauradas',`Permissões anteriores do cargo ${a.targetId} restauradas após alteração por ${a.executorId}.`);}catch{await incidente(g,'Permissões staff • revisão urgente',`Elevação de permissões no cargo ${a.targetId} por ${a.executorId}. O bot não conseguiu restaurar com segurança.`);}
    }
    if(a.action===AuditLogEvent.RoleDelete&&a.targetId&&c.cargos.includes(a.targetId))await incidente(g,'Cargo staff excluído',`Cargo ${a.targetId} excluído por ${a.executorId}. Confira os backups. Cargos privilegiados não são recriados automaticamente.`);
  }
  bot.on(Events.GuildMemberAdd,m=>{void entrada(m).catch(()=>console.error('Falha ao processar proteção de entrada.'));});
  bot.on(Events.MessageCreate,m=>{void (async()=>{
    if(!m.guild||!m.member||m.author.bot||m.author.id===m.guild.ownerId)return;
    const c=store.obter(m.guild.id).config.armadilha;if(!c.ativa)return;
    if(c.excecoesUsuarios.includes(m.author.id)||m.member.roles.cache.some(r=>c.excecoesCargos.includes(r.id))||m.member.permissions.has(P.Administrator))return;
    const r=detector.analisar(m.guild.id,m.author.id,{canal:m.channelId,texto:m.content,quando:Date.now()},c.canal,c.modo,c.limiar);
    if(!r.revisao)return;
    const naArmadilha=m.channelId===c.canal;let acao='registrar';
    if(naArmadilha&&c.acao!=='alertar'){
      if(['apagar','timeout','expulsar','banir'].includes(c.acao)){const ok=await m.delete().then(()=>true,()=>false);if(ok)acao='mensagem excluída';}
      if(c.acao==='timeout'&&m.member.moderatable){const ok=await m.member.timeout(60000,'Mensagem no canal armadilha; revisar incidente').then(()=>true,()=>false);if(ok)acao+='; timeout de 1 minuto';}
      if(c.acao==='expulsar'&&m.member.kickable){const ok=await m.member.kick('Mensagem no canal armadilha; revisar incidente').then(()=>true,()=>false);if(ok)acao+='; expulso';}
      if(c.acao==='banir'&&m.member.bannable){const ok=await m.member.ban({reason:'Mensagem no canal armadilha; revisar incidente'}).then(()=>true,()=>false);if(ok)acao+='; banido';}
    }
    const texto=`Usuário ${m.author.id}; canal ${m.channelId}; sinais: ${r.motivos.join(', ')}; score ${r.score}; ação ${acao}. Revisão humana necessária.`;
    await incidente(m.guild,'Anti-Selfbot',texto);
    if(c.logs&&c.logs!==store.obter(m.guild.id).config.logs)try{const ch=await m.guild.channels.fetch(c.logs);if(ch?.type===ChannelType.GuildText)await ch.send({embeds:[new EmbedBuilder().setColor(cor(m.guild.id)).setTitle('Anti-Selfbot • ocorrência').setDescription(safe(texto,3000))],allowedMentions:{parse:[]}});}catch{}
  })().catch(()=>console.warn('Falha no Anti-Selfbot.'));});
  bot.on(Events.GuildAuditLogEntryCreate,(a,g)=>{void auditoria(a,g).catch(()=>console.error('Falha ao processar proteção staff.'));});
  function loja(g:string):any{const arq=join(dataDir,'vendas.json');return existsSync(arq)?JSON.parse(readFileSync(arq,'utf8'))[g]:undefined;}
  function riscos(g:string,id:string,tipo:string){
    const l=loja(g),c=store.obter(g).config;const original=tipo==='recarga'?l?.carteira?.recargas?.[id]:l?.pedidos?.[id];
    if(!original)throw Error('Pedido ou recarga não encontrado.');
    const o:VendaRisco={id:original.id,cliente:original.cliente,total:tipo==='recarga'?original.valor:original.total,criado:original.criado,estado:original.estado};
    const todos=(tipo==='recarga'?Object.values(l.carteira.recargas):Object.values(l.pedidos)).map((v:any)=>({id:v.id,cliente:v.cliente,total:v.total??v.valor,criado:v.criado,estado:v.estado}));
    return{o,original,motivos:analisarRisco(o,todos,c),assinatura:assinaturaRisco(o)};
  }
  async function conferirPagamento(i:Interaction){
    if(!i.inGuild()||!('customId'in i))return false;
    const parts=i.customId.split(':'),tipo=parts[0]==='lx'&&parts[1]==='aprovarrecarga'?'recarga':parts[0]==='sv'&&parts[1]==='aprovar'?'pedido':null;
    if(!tipo||!store.obter(i.guildId).config.fraude)return false;
    // Let existing commerce authorization reject users without granting access to risk data.
    const admin=podeConfigurar(i);
    if(!admin){const cargo=loja(i.guildId)?.config?.ticketSuporte;if(tipo!=='pedido'||!cargo||!(await i.guild!.members.fetch({user:i.user.id,force:true})).roles.cache.has(cargo))return false;}
    const r=riscos(i.guildId,parts[2]!,tipo);if(r.o.estado!=='pendente'||!r.motivos.length)return false;
    const key=tipo+':'+r.o.id,revisao=store.obter(i.guildId).revisoes[key];
    if(revisao?.assinatura===r.assinatura&&revisao.quando>Date.now()-900000)return false;
    if(!admin){await enviar(i,tela(i.guildId,'Pagamento em conferência','Este pedido apresenta sinais que exigem conferência adicional de um administrador. A equipe poderá aprovar após a conferência registrada.',[]));return true;}
    await enviar(i,tela(i.guildId,'Conferência adicional de pagamento',r.motivos.map(linha).join('\n')+'\n\nConfira no banco o recebimento e o titular. Comprovante enviado pelo cliente não confirma crédito. Após registrar a conferência, volte ao pedido e aprove normalmente.',[row(btn(`revisar:${tipo}:${r.o.id}`,'Registrar conferência','confirmar')),back()]));return true;
  }
  function painel(g:string){const c=store.obter(g).config;return tela(g,'Segurança • Configurações',[
    'Ative cada proteção conforme a necessidade do servidor.',
    linha(`**Anti-Raid:** ${c.raid?(c.conter?'alerta e timeout nas entradas':'somente alertas'):'desativado'}. Detecta várias entradas em pouco tempo.`),
    linha(`**Anti-Selfbot:** ${c.armadilha.ativa?'ativo':'desativado'}. Canal armadilha e sinais de automação.`),
    linha(`**Cargos staff:** ${c.staff?'ativo':'desativado'}. Desfaz concessões não autorizadas aos cargos selecionados, dentro das permissões do bot.`),
    linha(`**Pagamentos:** ${c.fraude?'conferência adicional ativa':'desativado'}. Sinais de risco não confirmam fraude nem consultam bancos.`),
    linha(`**OAuth2 e Verificação:** ${oauth.pronto()?'disponível':'aguardando configuração da programadora'}. Liberação de canais e recuperação consentida.`),
    linha(`**Backups:** ${c.backupHoras?'a cada '+c.backupHoras+' horas':'sob demanda'}. Mantém as últimas 7 cópias locais.`),
    linha(`**Canal de alertas:** ${c.logs?'<#'+c.logs+'>':'não configurado'}.`),
  ].join('\n\n'),[new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId('sec:menu').setPlaceholder('Escolha uma proteção').addOptions([
    {label:'Anti-Raid',value:'raid',emoji:ic('moderacao')},{label:'Anti-Selfbot',value:'armadilha',emoji:ic('moderacao')},{label:'Proteção de cargos staff',value:'staff',emoji:ic('equipe')},{label:'Conferência de pagamentos',value:'fraude',emoji:ic('pagamentos')},{label:'OAuth2 e Verificação',value:'oauth',emoji:ic('permissoes')},{label:'Backups do servidor',value:'backup',emoji:ic('historico')},{label:'Canal de alertas',value:'logs',emoji:ic('logs')},{label:'Incidentes e diagnóstico',value:'diagnostico',emoji:ic('configuracoes')},
  ])),row(btn('close','Fechar configurações','fechar'))]);}
  async function pagina(g:Guild,opcao:string){
    const c=store.obter(g.id).config;
    if(opcao==='armadilha'){const a=c.armadilha;return tela(g.id,'Anti-Selfbot',`${linha(`**Estado:** ${a.ativa?'ativo':'desativado'} • ${a.modo} • ação: ${a.acao} • limiar: ${a.limiar}.`)}\n${linha(`**Canal armadilha:** ${a.canal?'<#'+a.canal+'>':'não escolhido'}.`)}\n${linha(`**Canal de logs:** ${a.logs?'<#'+a.logs+'>':'não escolhido'}.`)}\n${linha(`**Exceções:** ${a.excecoesUsuarios.length} usuários, ${a.excecoesCargos.length} cargos; dono, administradores e bots também são ignorados.`)}\n${linha('Sinais: canal armadilha, rajadas, repetições entre canais e links repetidos. O score expira após 1 minuto. Punição automática só ocorre no canal armadilha após confirmação; outros sinais geram revisão humana.')}\n${linha('A análise de texto exige a intenção Conteúdo da mensagem habilitada para este bot.')}`,[new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(new ChannelSelectMenuBuilder().setCustomId('sec:armcanal').setPlaceholder('Escolher canal armadilha').setChannelTypes(ChannelType.GuildText)),new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(new ChannelSelectMenuBuilder().setCustomId('sec:armlogs').setPlaceholder('Canal privado de logs').setChannelTypes(ChannelType.GuildText)),row(btn('armon','Ativar alertas','confirmar'),btn('armoff','Desativar','fechar'),btn('armmodo','Alternar modo','configuracoes')),row(btn('armaviso','Editar aviso','configuracoes'),btn('armpublicar','Publicar aviso','eventos'),btn('armformato','Texto / embed','configuracoes')),row(btn('armacao','Alterar ação','moderacao'),btn('armlimiar','Ajustar limiar','configuracoes'),btn('armexcecoes','Exceções','permissoes'),btn('home','Voltar','voltar'))]);}
    if(opcao==='raid')return tela(g.id,'Anti-Raid',`${linha(`**Estado:** ${c.raid?'ativo':'desativado'}. Limite de ${c.limite} entradas em ${c.janela} segundos.`)}\n${linha('**Somente alertas:** avisa a equipe sem punir membros.')}\n${linha('**Contenção:** aplica timeout de 10 minutos às novas entradas durante 2 minutos após o limite. Não bane nem expulsa.')}\n${linha('O bot precisa estar online e ter Moderar membros e cargo acima dos membros. Contenção é temporária e pode afetar entradas legítimas.')}`,[row(btn('raid:on','Ativar alertas','confirmar'),btn('raid:off','Desativar','fechar'),btn('raid:limites','Ajustar limite','configuracoes')),row(btn('raid:conter','Ativar contenção','moderacao'),btn('raid:alertar','Usar só alertas','eventos')),back()]);
    if(opcao==='staff')return tela(g.id,'Proteção de cargos staff',`${linha(`**Estado:** ${c.staff?'ativo':'desativado'}. Cargos: ${c.cargos.length?c.cargos.map(id=>'<@&'+id+'>').join(', '):'nenhum'}.`)}\n${linha('Somente o dono, este bot e usuários explicitamente confiáveis podem conceder cargos protegidos.')}\n${linha('Concessões por outros administradores e por outros bots também são revertidas. Autorize esses responsáveis antes de ativar.')}\n${linha('Exige Ver registro de auditoria, Gerenciar cargos e cargo do bot acima dos cargos protegidos. Não impede ações do dono ou ataques enquanto o bot estiver offline.')}`,[new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(new RoleSelectMenuBuilder().setCustomId('sec:staffroles').setPlaceholder('Selecione os cargos staff protegidos').setMinValues(0).setMaxValues(10).setDefaultRoles(...c.cargos)),new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(new UserSelectMenuBuilder().setCustomId('sec:trusted').setPlaceholder('Usuários que podem conceder cargos staff').setMinValues(0).setMaxValues(10).setDefaultUsers(...c.confiaveis)),row(btn('staff:on','Ativar proteção','confirmar'),btn('staff:off','Desativar','fechar')),back()]);
    if(opcao==='fraude')return tela(g.id,'Pagamentos • Conferência de risco',`${linha(`**Estado:** ${c.fraude?'ativo':'desativado'}. Limite de R$ ${(c.valor/100).toFixed(2)}, conta com menos de ${c.dias} dias ou ${c.tentativas} solicitações em 10 minutos.`)}\n${linha('Pedidos e recargas suspeitos exigem um administrador registrar a conferência antes da aprovação manual. Não altera compras com saldo interno.')}\n${linha('Sinais são indicativos, não acusação de fraude. Não consulta CPF, banco, MED ou titular de Pix.')}\n${linha('O resumo de evidências reúne pedido, datas e registros de entrega. Não garante defesa de MED, ressarcimento ou ausência de fraude.')}`,[row(btn('fraude:on','Ativar conferência','confirmar'),btn('fraude:off','Desativar','fechar'),btn('fraude:limites','Ajustar critérios','configuracoes')),row(btn('evidencia','Resumo de evidências','historico')),back()]);
    if(opcao==='oauth')return painelVerificacao(g);
    if(opcao==='backup'){
      const lista=backups.listar(g.id),rows:ActionRowBuilder<any>[]=[row(btn('backup:criar','Criar backup agora','confirmar'),btn('backup:agenda','Configurar rotina','agendamento'))];
      if(lista.length)rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId('sec:backupsel').setPlaceholder('Consultar uma cópia de segurança').addOptions(lista.map(b=>({label:new Date(b.criado).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}),description:b.channels.length+' canais • '+b.roles.length+' cargos',value:b.id,emoji:ic('historico')})))));rows.push(back());
      return tela(g.id,'Backups • Estrutura e dados locais',`${linha(`**Rotina:** ${c.backupHoras?'a cada '+c.backupHoras+' horas, com o bot online':'somente manual'}. Retenção das últimas 7 cópias.`)}\n${linha('A cópia exportável contém canais, categorias, cargos e permissões. Mensagens, anexos, convites e membros não são copiados.')}\n${linha('Os dados dos sistemas do bot são copiados separadamente, cifrados no computador. A restauração desses dados exige reiniciar o bot e intervenção da programadora.')}\n${linha('A recuperação no painel recria apenas itens ausentes neste mesmo servidor. Não altera itens existentes nem recria cargos privilegiados. Novos IDs devem ser selecionados novamente nos painéis.')}\n${linha('Cópias locais não protegem contra perda do computador; guarde uma cópia externa segura da pasta e da chave local.')}`,rows);
    }
    if(opcao==='logs')return tela(g.id,'Canal de alertas','Escolha um canal privado da equipe para incidentes de segurança. Os registros de vendas, tickets e moderação continuam separados.',[new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(new ChannelSelectMenuBuilder().setCustomId('sec:logs').setPlaceholder('Canal privado de segurança').setChannelTypes(ChannelType.GuildText)),row(btn('logs:off','Desativar alertas no canal','fechar')),back()]);
    const me=await g.members.fetchMe(),inc=store.obter(g.id).incidentes.slice(-6).reverse();return tela(g.id,'Diagnóstico e incidentes',`${linha(`**Ver auditoria:** ${me.permissions.has(P.ViewAuditLog)?'disponível':'faltando'}.`)}\n${linha(`**Gerenciar cargos:** ${me.permissions.has(P.ManageRoles)?'disponível':'faltando'}.`)}\n${linha(`**Moderar membros:** ${me.permissions.has(P.ModerateMembers)?'disponível':'faltando'}.`)}\n${linha(`**Gerenciar canais:** ${me.permissions.has(P.ManageChannels)?'disponível':'faltando'}.`)}\n\n**Últimos incidentes**\n${inc.map(x=>`<t:${Math.floor(x.quando/1000)}:f> • **${safe(x.tipo,80)}**\n${safe(x.texto,400)}`).join('\n\n')||'Nenhum incidente registrado.'}`);
  }
  function painelVerificacao(g:Guild){
    const v=store.obter(g.id).config.verificacao;
    return tela(g.id,'OAuth2 e Verificação',`${linha(`**OAuth2:** ${oauth.pronto()?'online':'aguardando configuração'}. **Acesso:** ${v.ativo?'verificação ativa':'desativado'}.`)}\n${linha(`**Canal:** ${v.canal?'<#'+v.canal+'>':'não selecionado'}. **Cargo:** ${v.cargo?'<@&'+v.cargo+'>':'não selecionado'}.`)}\n\nEscolha uma opção. Cada configuração está em uma única seção.`,[
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId('sec:oauthmenu').setPlaceholder('O que deseja configurar?').addOptions([
        {label:'Canal, cargo e acesso',value:'acesso',description:'Confira a proteção e configure as permissões.',emoji:ic('permissoes')},
        {label:'Mensagem de verificação',value:'mensagem',description:'Edite título, texto, imagem e nome do botão.',emoji:ic('canais')},
        {label:'Publicar ou atualizar painel',value:'publicar',description:'Envie a mensagem aos usuários sem duplicá-la.',emoji:ic('confirmar')},
        {label:'Como funciona e autorizações',value:'status',description:'Entenda o OAuth2 e consulte o total autorizado.',emoji:ic('historico')},
      ])),back(),
    ]);
  }
  const oauthBack=()=>row(btn('oauthhome','Voltar ao OAuth2'),btn('home','Segurança','permissoes'));
  function painelAcesso(g:Guild){
    const v=store.obter(g.id).config.verificacao;
    return tela(g.id,'OAuth2 e Verificação • Acesso',[
      linha(`**Serviço OAuth2:** ${oauth.pronto()?'disponível':'aguardando endereço e credenciais'}.`),
      linha(`**Acesso aos canais:** ${v.ativo?'verificação ativa':'desativado'}. Canal: ${v.canal?'<#'+v.canal+'>':'não selecionado'}. Cargo: ${v.cargo?'<@&'+v.cargo+'>':'não selecionado'}.`),
      linha('O membro clica em Verificar minha conta, autoriza no Discord e recebe o cargo para visualizar os canais públicos protegidos.'),
      linha('Somente o dono configura as permissões. Confira a prévia antes de ativar. Os canais privados da equipe não são liberados pelo sistema.'),
      linha('Administradores e cargos com acesso explícito continuam vendo seus canais. Membros atuais sem o cargo também precisam verificar. Confira os canais novos depois de criá-los.'),
      linha('OAuth2 também salva o consentimento para recuperação neste mesmo servidor. Não comprova identidade real. /revokeauth apaga essa autorização, sem remover o cargo de acesso.'),
      linha(`**Autorizações salvas:** ${Object.keys(store.obter(g.id).oauth).length}.${v.mudancas.length&&!v.ativo?' Há permissões pendentes: use Desativar e restaurar.':''}`),
    ].join('\n\n'),[
      ...(v.ativo?[row(btn('verifyoff','Desativar e restaurar','fechar'))]:[
        new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(new ChannelSelectMenuBuilder().setCustomId('sec:verifychannel').setPlaceholder('Canal público de verificação').setChannelTypes(ChannelType.GuildText)),
        new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(new RoleSelectMenuBuilder().setCustomId('sec:verifyrole').setPlaceholder('Cargo exclusivo de acesso, sem permissões gerais').setMaxValues(1)),
        row(...(!v.cargo?[btn('verifycreate','Criar cargo Verificado','equipe')]:[]),btn('verifyplan','Conferir e ativar acesso','confirmar'),...v.mudancas.length?[btn('verifyoff','Restaurar permissões pendentes','fechar')]:[]),
      ]),oauthBack(),
    ]);
  }
  function mensagemPublica(g:string){
    const m=store.obter(g).config.mensagemVerificacao;
    const aviso=`${linha('A autorização é feita na página oficial do Discord, sem informar sua senha ao bot.')}\n${linha('Você também permite sua recuperação neste mesmo servidor. /revokeauth apaga esse consentimento, sem remover o cargo de acesso recebido.')}`;
    const payload=tela(g,m.titulo,`${m.texto}\n\n──────────────\n${aviso}`,[row(btn('verify',m.botao,'permissoes'))]);
    if(m.imagem)payload.embeds[0]!.setImage(m.imagem);return payload;
  }
  const publicando=new Set<string>();
  async function publicarMensagem(g:Guild,canal:string){
    if(publicando.has(g.id))throw Error('Uma publicação está em andamento. Aguarde.');publicando.add(g.id);
    try{
      const c=store.obter(g.id).config,v=c.verificacao;
      if(v.ativo&&canal!==v.canal)throw Error('Publique no canal de verificação selecionado.');
      const ch=await g.channels.fetch(canal),me=await g.members.fetchMe();
      if(!ch||ch.type!==ChannelType.GuildText||!ch.permissionsFor(me)?.has([P.ViewChannel,P.SendMessages,P.EmbedLinks]))throw Error('Escolha um canal de texto onde o bot possa enviar mensagens e inserir links.');
      const p=c.mensagemVerificacao.painel;
      let anterior=null;if(p?.canal===canal)try{anterior=await ch.messages.fetch(p.mensagem);}catch(err){if(!(err&&typeof err==='object'&&'code'in err&&err.code===10008))throw err;}
      if(anterior&&anterior.author.id!==bot.user?.id)throw Error('O painel salvo não pertence a este bot.');
      const msg=anterior?await anterior.edit(mensagemPublica(g.id)):await ch.send(mensagemPublica(g.id));
      store.configurar(g.id,{mensagemVerificacao:{...store.obter(g.id).config.mensagemVerificacao,painel:{canal,mensagem:msg.id}}});
      return anterior?'atualizado':'publicado';
    }finally{publicando.delete(g.id);}
  }
  async function validarAtivacao(g:Guild,tipo:string){
    const c=store.obter(g.id).config,me=await g.members.fetchMe();
    if(!c.logs)throw Error('Configure primeiro um canal privado de alertas.');
    const ch=await g.channels.fetch(c.logs);if(!ch||ch.type!==ChannelType.GuildText||ch.permissionsFor(g.roles.everyone)?.has(P.ViewChannel)||!ch.permissionsFor(me)?.has([P.ViewChannel,P.SendMessages,P.EmbedLinks]))throw Error('O canal de alertas precisa ser privado e acessível ao bot.');
    if(tipo==='staff'){
      if(!c.cargos.length)throw Error('Selecione primeiro os cargos protegidos.');
      if(!me.permissions.has([P.ManageRoles,P.ViewAuditLog]))throw Error('O bot precisa de Gerenciar cargos e Ver auditoria.');
      for(const id of c.cargos){const r=await g.roles.fetch(id);if(!r||r.managed||r.id===g.id||me.roles.highest.comparePositionTo(r)<=0)throw Error('Todos os cargos protegidos devem estar abaixo do bot e ser cargos comuns.');}
    }
    if(tipo==='conter'&&!me.permissions.has(P.ModerateMembers))throw Error('O bot precisa de Moderar membros.');
  }
  function confirmar(g:string,u:string,tipo:string,id:string){for(const [k,v]of confirmacoes)if(v.vence<Date.now())confirmacoes.delete(k);if(confirmacoes.size>500)throw Error('Muitas confirmações. Aguarde.');const key=randomBytes(12).toString('hex');confirmacoes.set(key,{g,u,tipo,id,vence:Date.now()+120000});return row(btn('confirm:'+key,'Confirmar','confirmar'),btn('home','Cancelar','fechar'));}
  async function tratar(i:Interaction):Promise<boolean>{
    const custom='customId'in i?i.customId:'';
    const entradaUI=i.isStringSelectMenu()&&custom==='anzy:categoria'&&i.values[0]==='seguranca';
    const cmd=i.isChatInputCommand()&&comandosSeguranca.some(c=>c.name===i.commandName);
    try{
      if(!entradaUI&&!cmd&&!custom.startsWith('sec:'))return await conferirPagamento(i);
      if(!i.inGuild()||!i.guild){await enviar(i,{content:e('erro')+' Use dentro de um servidor.'});return true;}
      const g=i.guild;
      if(i.isChatInputCommand()&&['verify','revokeauth'].includes(i.commandName)||i.isButton()&&custom==='sec:verify'){
        await i.deferReply({flags:MessageFlags.Ephemeral});
        if(i.isChatInputCommand()&&i.commandName==='revokeauth'){await oauth.revogar(g.id,i.user.id);await enviar(i,{content:e('sucesso')+' Autorização local apagada. Você também pode revogar o aplicativo nas configurações do Discord.'});return true;}
        const v=store.obter(g.id).config.verificacao;const acesso=v.ativo?' Ao concluir, você receberá o cargo de acesso aos canais protegidos.':' Nenhum cargo de acesso será entregue neste modo.';const url=oauth.emitir(g.id,i.user.id);await enviar(i,tela(g.id,'Autorizar recuperação voluntária',`Ao autorizar, você permite que o dono o readicione **somente ao servidor ${safe(g.name,100)}**, caso você saia. ${acesso} Você pode cancelar a autorização; no modo de acesso, os canais permanecem bloqueados até verificar. /revokeauth apaga o consentimento de recuperação, sem remover o cargo já recebido.`,[row(new ButtonBuilder().setLabel('Autorizar no Discord').setStyle(ButtonStyle.Link).setURL(url))]));return true;
      }
      if(!podeConfigurar(i))throw Error('Apenas administradores podem configurar a segurança.');
      const [,acao,key,extra]=custom.split(':');
      if(acao?.startsWith('arm')&&i.user.id!==g.ownerId&&!acessoCompleto(i))throw Error('Somente o dono ou alguém com acesso completo pode configurar o Anti-Selfbot.');
      const dono=['staffroles','trusted','staff'].includes(acao??'')||i.isChatInputCommand()&&i.commandName==='restoremember'||acao==='confirm';
      if(dono&&i.user.id!==g.ownerId)throw Error('Somente o dono do servidor pode alterar a confiança staff ou executar recuperações.');
      if(['verifyrole','verifychannel','verifycreate','verifyplan','verifyoff'].includes(acao??'')&&i.user.id!==g.ownerId&&!acessoCompleto(i))throw Error('Somente o dono ou alguém com acesso completo pode configurar a verificação.');
      // Modals must be opened before acknowledging the interaction.
      if(acao==='armaviso'&&i.isButton()){const x=store.obter(g.id).config.armadilha;const f=field('aviso','Aviso no canal armadilha',x.aviso,1000);f.components[0]!.setStyle(TextInputStyle.Paragraph);await i.showModal(new ModalBuilder().setCustomId('sec:armsalvaraviso').setTitle('Aviso Anti-Selfbot').addComponents(f));return true;}
      if(acao==='armlimiar'&&i.isButton()){await i.showModal(new ModalBuilder().setCustomId('sec:armsalvarlimiar').setTitle('Limiar de suspeita').addComponents(field('limiar','Pontuação mínima (2 a 10)',String(store.obter(g.id).config.armadilha.limiar),2)));return true;}
      if(i.isButton()&&acao==='editverify'){
        const m=store.obter(g.id).config.mensagemVerificacao;
        const texto=field('texto','Mensagem que os usuários vão ler',m.texto,2600);texto.components[0]!.setStyle(TextInputStyle.Paragraph);
        const imagem=field('imagem','Link HTTPS da imagem (opcional)',m.imagem,1000);imagem.components[0]!.setRequired(false);
        await i.showModal(new ModalBuilder().setCustomId('sec:saveverify').setTitle('Mensagem de verificação').addComponents(field('titulo','Título',m.titulo,80),texto,imagem,field('botao','Texto do botão',m.botao,60)));return true;
      }
      if(i.isButton()&&['raid:limites','fraude:limites'].includes(acao+':'+key)){
        const c=store.obter(g.id).config;
        const m=new ModalBuilder().setCustomId('sec:salvar:'+acao).setTitle(acao==='raid'?'Limites do Anti-Raid':'Critérios de conferência');
        if(acao==='raid')m.addComponents(field('limite','Entradas para disparar (3 a 50)',String(c.limite)),field('janela','Janela em segundos (10 a 120)',String(c.janela)));
        else m.addComponents(field('valor','Valor em reais (1 a 1000000)',String(c.valor/100),12),field('dias','Conta com menos de dias (0 a 365)',String(c.dias)),field('tentativas','Solicitações em 10 minutos (2 a 50)',String(c.tentativas)));
        await i.showModal(m);return true;
      }
      if(i.isButton()&&acao==='evidencia'){await i.showModal(new ModalBuilder().setCustomId('sec:exportevidencia').setTitle('Evidências de pedido').addComponents(field('pedido','ID do pedido','',80)));return true;}
      if(i.isButton()&&acao==='revisar'){
        await i.showModal(new ModalBuilder().setCustomId(`sec:salvarrevisao:${key}:${extra}`).setTitle('Conferência manual no banco').addComponents(field('motivo','Como você conferiu o crédito no banco?','',500)));return true;
      }
      if(i.isChatInputCommand())await i.deferReply({flags:MessageFlags.Ephemeral});else if(i.isMessageComponent())await i.deferUpdate();else if(i.isModalSubmit())await i.deferReply({flags:MessageFlags.Ephemeral});
      if(entradaUI){await enviar(i,painel(g.id));return true;}
      if(i.isChatInputCommand()&&i.commandName==='restoremember'){
        const id=i.options.getString('user_id',true);if(!/^\d{17,20}$/.test(id))throw Error('ID inválido.');
        if(!oauth.pronto())throw Error('OAuth2 indisponível; falta configurar o serviço.');
        if(!store.obter(g.id).oauth[id])throw Error('O usuário não autorizou a recuperação neste servidor.');
        await enviar(i,tela(g.id,'Confirmar recuperação de membro',`Readicionar <@${id}> a este mesmo servidor, usando o consentimento salvo, sem cargos adicionais.`,[confirmar(g.id,i.user.id,'membro',id)]));return true;
      }
      if(i.isChatInputCommand()||acao==='home'){await enviar(i,painel(g.id));return true;}
      if(acao==='close'){await enviar(i,{content:e('fechar')+' Configurações de segurança fechadas.',embeds:[],components:[]});return true;}
      if(i.isStringSelectMenu()&&acao==='menu'){await enviar(i,await pagina(g,i.values[0]!));return true;}
      if(acao?.startsWith('arm')){
        const a=store.obter(g.id).config.armadilha;
        if(acao==='armexcecoes'){await enviar(i,tela(g.id,'Anti-Selfbot • exceções','Usuários e cargos selecionados são ignorados. Bots e dono também são ignorados.',[new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(new UserSelectMenuBuilder().setCustomId('sec:armusuarios').setPlaceholder('Usuários de exceção').setMinValues(0).setMaxValues(10).setDefaultUsers(...a.excecoesUsuarios)),new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(new RoleSelectMenuBuilder().setCustomId('sec:armcargos').setPlaceholder('Cargos de exceção').setMinValues(0).setMaxValues(10).setDefaultRoles(...a.excecoesCargos)),row(btn('armvoltar','Voltar à armadilha'))]));return true;}
        if(acao==='armvoltar'){await enviar(i,await pagina(g,'armadilha'));return true;}
        if(acao==='armcanal'&&i.isChannelSelectMenu()){const ch=await g.channels.fetch(i.values[0]!);if(!ch||ch.type!==ChannelType.GuildText)throw Error('Escolha um canal de texto.');a.canal=ch.id;}
        else if(acao==='armlogs'&&i.isChannelSelectMenu()){const ch=await g.channels.fetch(i.values[0]!);const me=await g.members.fetchMe();if(!ch||ch.type!==ChannelType.GuildText||ch.permissionsFor(g.roles.everyone)?.has(P.ViewChannel)||!ch.permissionsFor(me)?.has([P.ViewChannel,P.SendMessages,P.EmbedLinks]))throw Error('Escolha um canal privado acessível ao bot.');a.logs=ch.id;}
        else if(acao==='armusuarios'&&i.isUserSelectMenu())a.excecoesUsuarios=[...i.values];
        else if(acao==='armcargos'&&i.isRoleSelectMenu())a.excecoesCargos=[...i.values];
        else if(acao==='armon'){if(!a.canal)throw Error('Escolha primeiro o canal armadilha.');a.ativa=true;a.acao='alertar';}
        else if(acao==='armoff')a.ativa=false;
        else if(acao==='armmodo')a.modo=a.modo==='simples'?'inteligente':'simples';
        else if(acao==='armacao'){await enviar(i,tela(g.id,'Ação no canal armadilha','Escolha a ação. Expulsão e banimento exigem confirmação adicional. Nenhuma ação é aplicada por pontuação fora do canal armadilha.',[row(btn('armdefinir:alertar','Só alertar'),btn('armdefinir:apagar','Apagar'),btn('armdefinir:timeout','Timeout')),row(btn('armdefinir:expulsar','Expulsar'),btn('armdefinir:banir','Banir')),row(btn('armvoltar','Voltar'))]));return true;}
        else if(acao==='armdefinir'&&i.isButton()){
          if(!['alertar','apagar','timeout','expulsar','banir'].includes(key??''))throw Error('Ação inválida.');
          if(['timeout','expulsar','banir'].includes(key!)){const token=randomBytes(12).toString('hex');confirmacoesArmadilha.set(token,{g:g.id,u:i.user.id,acao:key as 'timeout'|'expulsar'|'banir',vence:Date.now()+120000});await enviar(i,tela(g.id,'Confirmar ação automática',`Ação **${key}** será aplicada a mensagens no canal armadilha após o limiar. Confirme somente após revisar o canal e as exceções.`,[row(btn('armconfirmar:'+token,'Confirmar ação'),btn('armvoltar','Cancelar'))]));return true;}
          a.acao=key as 'alertar'|'apagar';
        }
        else if(acao==='armconfirmar'&&i.isButton()){const p=confirmacoesArmadilha.get(key!);if(!p||p.g!==g.id||p.u!==i.user.id||p.vence<Date.now())throw Error('Confirmação expirada.');confirmacoesArmadilha.delete(key!);a.acao=p.acao;}
        else if(acao==='armformato')a.avisoEmbed=!a.avisoEmbed;
        else if(acao==='armpublicar'){
          if(!a.canal)throw Error('Escolha o canal armadilha.');const ch=await g.channels.fetch(a.canal);if(ch?.type!==ChannelType.GuildText)throw Error('Canal indisponível.');
          const conteudo=safe(a.aviso,1000);await ch.send(a.avisoEmbed?{embeds:[new EmbedBuilder().setColor(cor(g.id)).setDescription(conteudo)],allowedMentions:{parse:[]}}:{content:conteudo,allowedMentions:{parse:[]}});
        }
        else if(acao==='armsalvaraviso'&&i.isModalSubmit())a.aviso=i.fields.getTextInputValue('aviso').trim().slice(0,1000);
        else if(acao==='armsalvarlimiar'&&i.isModalSubmit()){const n=Number(i.fields.getTextInputValue('limiar'));if(!Number.isInteger(n)||n<2||n>10)throw Error('Escolha 2 a 10 pontos.');a.limiar=n;}
        else throw Error('Opção Anti-Selfbot inválida.');
        store.configurar(g.id,{armadilha:a});await enviar(i,await pagina(g,'armadilha'));return true;
      }
      if(acao==='oauthhome'){await enviar(i,painelVerificacao(g));return true;}
      if(acao==='oauthmenu'&&i.isStringSelectMenu()){
        const opcao=i.values[0];
        if(opcao==='acesso'){await enviar(i,painelAcesso(g));return true;}
        if(opcao==='mensagem'){await enviar(i,tela(g.id,'Mensagem de verificação','Personalize o que os membros vão ler. O aviso de autorização do Discord é mantido abaixo do texto. Salvar também tenta atualizar o painel publicado.',[row(btn('editverify','Editar mensagem','canais'),btn('previewverify','Ver prévia','historico')),oauthBack()]));return true;}
        if(opcao==='status'){await enviar(i,tela(g.id,'OAuth2 • Como funciona',`${linha('O usuário autoriza sua conta no Discord e recebe o cargo de acesso se a verificação estiver ativa.')}\n${linha('A recuperação usa consentimento para este mesmo servidor e não remove banimentos nem devolve cargos antigos.')}\n${linha(`**Autorizações salvas:** ${Object.keys(store.obter(g.id).oauth).length}.`)}\n${linha('Credenciais e endereço são configurados pela programadora. Administradores e cargos com acesso explícito mantêm suas permissões.')}`,[oauthBack()]));return true;}
        if(opcao!=='publicar')throw Error('Opção de OAuth2 inválida.');
        if(!oauth.pronto())throw Error('OAuth2 indisponível. Confira o endereço e as credenciais antes de publicar.');
        await enviar(i,tela(g.id,'Publicar ou atualizar painel','Escolha o canal. Se o painel já estiver publicado nele, a mensagem existente será atualizada.',[new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(new ChannelSelectMenuBuilder().setCustomId('sec:enviarverificacao').setPlaceholder('Canal do painel de verificação').setChannelTypes(ChannelType.GuildText)),oauthBack()]));return true;
      }
      if(acao==='previewverify'){
        const p=mensagemPublica(g.id);p.embeds[0]!.setFooter({text:'Prévia privada • Anzy Programs'});p.components=[oauthBack()];await enviar(i,p);return true;
      }
      if(acao==='saveverify'&&i.isModalSubmit()){
        const titulo=i.fields.getTextInputValue('titulo').trim(),texto=i.fields.getTextInputValue('texto').trim(),imagem=i.fields.getTextInputValue('imagem').trim(),botao=i.fields.getTextInputValue('botao').trim();
        if(!titulo||titulo.length>80||!texto||texto.length>2600||!botao||botao.length>60)throw Error('Preencha título, mensagem e nome do botão dentro dos limites indicados.');
        if(imagem){let u:URL;try{u=new URL(imagem);}catch{throw Error('Informe um link HTTPS válido para a imagem.');}if(imagem.length>1000||u.protocol!=='https:'||u.username||u.password)throw Error('Use um link HTTPS de imagem, sem usuário ou senha.');}
        const antes=store.obter(g.id).config.mensagemVerificacao;
        store.configurar(g.id,{mensagemVerificacao:{...antes,titulo,texto,imagem,botao}});
        let resultado='Mensagem salva. Use Publicar ou atualizar painel para enviá-la ao canal.';
        if(antes.painel)try{await publicarMensagem(g,antes.painel.canal);resultado='Mensagem salva e painel público atualizado.';}catch{resultado='Mensagem salva, mas o painel publicado não pôde ser atualizado. Confira o canal e as permissões e use Publicar ou atualizar painel.';}
        await enviar(i,tela(g.id,'Mensagem de verificação',e('sucesso')+' '+resultado,[row(btn('editverify','Editar mensagem','canais'),btn('previewverify','Ver prévia','historico')),oauthBack()]));return true;
      }
      if(['verifychannel','verifyrole','verifycreate'].includes(acao??'')){
        const v=store.obter(g.id).config.verificacao;if(v.ativo||v.mudancas.length)throw Error('Desative e restaure as permissões antes de mudar o canal ou cargo.');
        if(acao==='verifychannel'&&i.isChannelSelectMenu()){
          const ch=await g.channels.fetch(i.values[0]!);if(!ch||ch.type!==ChannelType.GuildText||!ch.permissionsFor(g.roles.everyone)?.has(P.ViewChannel))throw Error('Escolha um canal de texto já visível para @everyone.');verificacao.salvar(g.id,{canal:ch.id});
        }else if(acao==='verifyrole'&&i.isRoleSelectMenu()){
          const antes=v.cargo;verificacao.salvar(g.id,{cargo:i.values[0]!});try{await verificacao.cargo(g);}catch(err){verificacao.salvar(g.id,{cargo:antes});throw err;}
        }else if(acao==='verifycreate'&&i.isButton()){
          if(v.cargo)throw Error('Já existe um cargo selecionado. Use o seletor para trocar.');
          const me=await g.members.fetchMe();if(!me.permissions.has(P.ManageRoles))throw Error('O bot precisa de Gerenciar cargos.');
          const r=await g.roles.create({name:'Verificado',permissions:[],reason:'Cargo exclusivo para Verificação + OAuth2.'});verificacao.salvar(g.id,{cargo:r.id});
        }else throw Error('Controle de verificação inválido.');
        await enviar(i,painelAcesso(g));return true;
      }
      if(acao==='verifyplan'){
        if(!oauth.pronto())throw Error('Configure e ative o OAuth2 antes de bloquear canais. Assim os membros não ficam sem uma forma de verificar.');
        const p=await verificacao.planejar(g);
        await enviar(i,tela(g.id,'Prévia • Ativar verificação',`**Canais públicos que serão protegidos:** ${p.mudancas.length/2}\n${p.nomes.slice(0,20).map(n=>linha(safe(n,80))).join('\n')}${p.nomes.length>20?'\nOutros canais públicos também estão incluídos.':''}\n\n**Itens privados preservados:** ${p.privados}.\n${p.avisos.length?'**Exceções:** existem acessos explícitos por cargo ou usuário em '+p.avisos.length+' itens; esses acessos serão preservados.\n':''}\nMembros sem o cargo perderão acesso a esses canais até verificar. Administradores mantêm acesso. Publique primeiro o painel no canal de verificação.`,[confirmar(g.id,i.user.id,'verificacao',p.assinatura)]));return true;
      }
      if(acao==='verifyoff'){
        const pendentes=await verificacao.desativar(g);await enviar(i,tela(g.id,'Verificação desativada',pendentes?`${e('aviso')} ${pendentes} permissões não puderam ser restauradas por terem sido alteradas. Revise os canais antes de reaplicar.`:`${e('sucesso')} As permissões de visualização alteradas pelo sistema foram restauradas. Os cargos já recebidos foram mantidos.`));return true;
      }
      if(acao==='publicarverificacao'){
        if(!oauth.pronto())throw Error('Configure primeiro o endereço e as credenciais OAuth2. O painel público ficará disponível quando o serviço estiver ativo.');
        await enviar(i,tela(g.id,'Publicar verificação','Escolha o canal onde os membros verão o botão. Cada pessoa receberá seu próprio link privado de autorização.',[new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(new ChannelSelectMenuBuilder().setCustomId('sec:enviarverificacao').setPlaceholder('Canal do painel de verificação').setChannelTypes(ChannelType.GuildText)),back()]));return true;
      }
      if(acao==='enviarverificacao'&&i.isChannelSelectMenu()){
        if(!oauth.pronto())throw Error('O serviço OAuth2 está indisponível. Confira a configuração antes de publicar.');
        const resultado=await publicarMensagem(g,i.values[0]!);await enviar(i,tela(g.id,'Painel '+resultado,`${e('sucesso')} Mensagem ${resultado==='atualizado'?'atualizada':'publicada'} em <#${i.values[0]}>.`,[oauthBack()]));return true;
      }
      if(acao==='logs'&&i.isChannelSelectMenu()){
        const ch=await g.channels.fetch(i.values[0]!);const me=await g.members.fetchMe();if(!ch||ch.type!==ChannelType.GuildText||ch.permissionsFor(g.roles.everyone)?.has(P.ViewChannel)||!ch.permissionsFor(me)?.has([P.ViewChannel,P.SendMessages,P.EmbedLinks]))throw Error('Escolha um canal privado, com acesso do bot para enviar embeds.');store.configurar(g.id,{logs:ch.id});
      }else if(acao==='logs'&&key==='off')store.configurar(g.id,{logs:null});
      else if(acao==='staffroles'&&i.isRoleSelectMenu()){
        if(store.obter(g.id).config.staff)throw Error('Desative a proteção antes de mudar os cargos protegidos.');
        const me=await g.members.fetchMe();for(const id of i.values){const r=await g.roles.fetch(id);if(!r||r.id===g.id||r.managed||me.roles.highest.comparePositionTo(r)<=0)throw Error('Selecione cargos comuns abaixo do bot.');}store.configurar(g.id,{cargos:[...i.values]});
      }else if(acao==='trusted'&&i.isUserSelectMenu()){for(const id of i.values)if(!await g.members.fetch(id).catch(()=>null))throw Error('Usuário não está neste servidor.');store.configurar(g.id,{confiaveis:[...i.values]});}
      else if(['raid','staff','fraude'].includes(acao??'')&&['on','off','conter','alertar'].includes(key??'')){
        if(key==='on'||key==='conter')await validarAtivacao(g,key==='conter'?'conter':acao!);
        if(acao==='raid'){store.configurar(g.id,key==='conter'?{raid:true,conter:true}:key==='alertar'?{conter:false}:{raid:key==='on'});if(key==='off'){entradas.delete(g.id);raidAte.delete(g.id);}}
        if(acao==='staff')store.configurar(g.id,{staff:key==='on'});
        if(acao==='fraude')store.configurar(g.id,{fraude:key==='on'});
        await enviar(i,await pagina(g,acao!));return true;
      }else if(acao==='salvar'&&i.isModalSubmit()){
        const n=(id:string,min:number,max:number)=>{const s=i.fields.getTextInputValue(id).trim();if(!/^\d+$/.test(s))throw Error('Informe números inteiros.');const v=Number(s);if(v<min||v>max)throw Error('Valor fora do intervalo indicado.');return v;};
        if(key==='raid')store.configurar(g.id,{limite:n('limite',3,50),janela:n('janela',10,120)});
        else if(key==='fraude'){const s=i.fields.getTextInputValue('valor').trim().replace(',','.');if(!/^\d+(\.\d{1,2})?$/.test(s)||Number(s)<1||Number(s)>1000000)throw Error('Valor em reais inválido.');store.configurar(g.id,{valor:Math.round(Number(s)*100),dias:n('dias',0,365),tentativas:n('tentativas',2,50)});}else throw Error('Formulário inválido.');await enviar(i,await pagina(g,key!));return true;
      }else if(acao==='salvarrevisao'&&i.isModalSubmit()){
        if(key!=='pedido'&&key!=='recarga')throw Error('Tipo inválido.');const r=riscos(g.id,extra!,key);if(r.o.estado!=='pendente')throw Error('Já não está pendente.');const motivo=i.fields.getTextInputValue('motivo').trim();if(motivo.length<10)throw Error('Explique a conferência em pelo menos 10 caracteres.');
        store.revisar(g.id,key+':'+extra,r.assinatura,i.user.id,motivo);await incidente(g,'Conferência de pagamento',`${key} ${extra} conferido por ${i.user.id}: ${motivo}`);await enviar(i,tela(g.id,'Conferência registrada','Volte ao pedido ou à recarga e use Aprovar. A liberação desta conferência dura 15 minutos e não aprova nem entrega o produto sozinha.'));return true;
      }else if(acao==='exportevidencia'&&i.isModalSubmit()){
        const id=i.fields.getTextInputValue('pedido').trim(),o=loja(g.id)?.pedidos?.[id];if(!o)throw Error('Pedido não encontrado.');
        const resumo={servidor:g.id,pedido:o.id,cliente:o.cliente,criado:o.criado,estado:o.estado,totalCentavos:o.total,aprovado:o.aprovado,responsavel:o.responsavel,ticket:o.ticket,entregue:o.entregue,entregaPor:o.entregaPor,itens:(o.itens??[]).map((x:any)=>({produto:x.nome,quantidade:x.quantidade,totalCentavos:x.total,entregue:x.entregue,entregaPor:x.entregaPor})),reembolsos:o.reembolsos??[],conferencia:store.obter(g.id).revisoes['pedido:'+id]??null,observacao:'Registros internos; não comprovam identidade do pagador nem garantem resultado em contestação bancária.'};
        const buffer=Buffer.from(JSON.stringify(resumo,null,2));if(buffer.length>7_500_000)throw Error('Resumo grande demais.');await enviar(i,{content:e('historico')+' Resumo de registros internos. Não inclui códigos ou conteúdo entregue.',files:[new AttachmentBuilder(buffer,{name:'evidencias-'+String(o.id).replace(/[^a-z0-9-]/gi,'')+'.json'})]});return true;
      }else if(acao==='backup'&&key==='criar'){
        const x=await backups.criar(g);await enviar(i,tela(g.id,'Backup criado',`${e('sucesso')} ${x.channels.length} canais e ${x.roles.length} cargos registrados. Dados dos sistemas copiados e cifrados localmente.`,[row(btn('backup:abrir:'+x.id,'Consultar esta cópia','historico')),back()]));return true;
      }else if(acao==='backup'&&key==='agenda'){
        await enviar(i,tela(g.id,'Rotina de backups','Escolha o intervalo. O bot precisa estar online. As últimas 7 cópias são mantidas no computador.',[new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId('sec:agenda').setPlaceholder('Intervalo entre cópias').addOptions([{label:'Somente manual',value:'0'},{label:'A cada 6 horas',value:'6'},{label:'A cada 24 horas',value:'24'},{label:'A cada 48 horas',value:'48'}])),back()]));return true;
      }else if(acao==='agenda'&&i.isStringSelectMenu()){
        const n=Number(i.values[0]);if(![0,6,24,48].includes(n))throw Error('Intervalo inválido.');store.configurar(g.id,{backupHoras:n});await enviar(i,await pagina(g,'backup'));return true;
      }else if(acao==='backupsel'&&i.isStringSelectMenu()||acao==='backup'&&key==='abrir'){
        const id=i.isStringSelectMenu()?i.values[0]!:extra!,x=backups.ler(g.id,id);
        await enviar(i,tela(g.id,'Cópia de segurança',`**Data:** <t:${Math.floor(x.criado/1000)}:F>\n**Canais:** ${x.channels.length}\n**Cargos:** ${x.roles.length}\n\nO download contém somente a estrutura. Apenas o dono pode recriar itens ausentes. Cargos privilegiados e canais com permissões sem correspondência são ignorados.`,[row(btn('download:'+id,'Baixar estrutura','historico'),btn('restore:'+id,'Recuperar itens ausentes','confirmar')),back()]));return true;
      }else if(acao==='download'){
        await enviar(i,{content:e('historico')+' Estrutura do servidor, sem mensagens ou credenciais.',files:[new AttachmentBuilder(backups.exportar(g.id,key!),{name:'estrutura-'+key+'.json'})]});return true;
      }else if(acao==='restore'){
        if(i.user.id!==g.ownerId)throw Error('Somente o dono pode recuperar a estrutura.');backups.ler(g.id,key!);
        await enviar(i,tela(g.id,'Confirmar recuperação parcial','Serão recriados somente cargos comuns e canais/categorias ausentes. Nada existente será excluído ou alterado. Cargos privilegiados não serão recriados; pode ser necessário reconfigurar destinos nos painéis.',[confirmar(g.id,i.user.id,'backup',key!)]));return true;
      }else if(acao==='confirm'){
        const c=confirmacoes.get(key!);if(!c||c.g!==g.id||c.u!==i.user.id||c.vence<Date.now())throw Error('Confirmação inválida ou expirada.');confirmacoes.delete(key!);
        if(c.tipo==='verificacao'){if(!oauth.pronto())throw Error('OAuth2 indisponível. Nenhum canal foi bloqueado.');const p=await verificacao.aplicar(g,c.id);await enviar(i,tela(g.id,'Verificação ativada',`${e('sucesso')} ${p.mudancas.length/2} canais protegidos. Membros recebem o cargo após concluir a autorização no Discord. Confira os canais novos ao criá-los.`));}
        else if(c.tipo==='membro'){const s=await oauth.restaurar(g.id,c.id);await incidente(g,'Recuperação OAuth2',`Recuperação de ${c.id} solicitada pelo dono ${i.user.id}. ${s}`);await enviar(i,tela(g.id,'Recuperação de membro',s));}
        else{const r=await backups.restaurar(g,c.id);await incidente(g,'Recuperação de estrutura',`${r.cargos} cargos e ${r.canais} canais recriados pelo dono; ${r.ignorados} itens ignorados.`);await enviar(i,tela(g.id,'Recuperação concluída',`${r.cargos} cargos e ${r.canais} canais recriados. ${r.ignorados} itens ignorados por tipo ou permissões. Confira os destinos configurados nos outros painéis.`));}return true;
      }else throw Error('Opção indisponível. Reabra /security.');
      await enviar(i,painel(g.id));return true;
    }catch(err){console.warn('Segurança:',err instanceof Error?err.message:'Falha desconhecida');if(i.isRepliable())await enviar(i,{content:e('erro')+' '+(err instanceof Error?err.message:'Não foi possível concluir.'),embeds:[],components:[],allowedMentions:{parse:[]}});return true;}
  }
  async function tick(){
    if(!bot.isReady())return;
    for(const g of bot.guilds.cache.values()){
      if(jobs.has(g.id))continue;jobs.add(g.id);
      try{const c=store.obter(g.id).config;if(c.backupHoras&&Date.now()>=Math.max(c.ultimoBackup+c.backupHoras*3600000,c.proximaTentativa)){
        try{await backups.criar(g);}catch{store.configurar(g.id,{proximaTentativa:Date.now()+3600000});await incidente(g,'Falha no backup','A cópia automática falhou. Nova tentativa em uma hora. Confira permissões e espaço em disco.');}
      }
      if(c.fraude){
        const l=loja(g.id),lista=[...Object.values(l?.pedidos??{}).map((o:any)=>({id:o.id,estado:o.estado,tipo:'pedido'})),...Object.values(l?.carteira?.recargas??{}).map((o:any)=>({id:o.id,estado:o.estado,tipo:'recarga'}))].filter(o=>o.estado==='pendente').slice(-100);
        for(const o of lista){const r=riscos(g.id,o.id,o.tipo),ref=o.tipo+' '+o.id;if(r.motivos.length&&!store.obter(g.id).incidentes.some(x=>x.tipo==='Risco de pagamento'&&x.texto.startsWith(ref+' •')))await incidente(g,'Risco de pagamento',ref+' • '+r.motivos.join(' ')+' Exige conferência, sem acusação automática de fraude.');}
      }}catch{console.error('Falha na rotina de segurança.');}finally{jobs.delete(g.id);}
    }
    for(const [id,t]of membrosVistos)if(t<Date.now()-120000)membrosVistos.delete(id);
    for(const [id,t]of auditoriasVistas)if(t<Date.now()-300000)auditoriasVistas.delete(id);
  }
  bot.once(Events.ClientReady,()=>{void oauth.iniciar().catch(()=>console.error('OAuth2 não iniciou. Confira endereço e porta.'));void tick();});
  const timer=intervaloBot(()=>{void tick();},60000);timer.unref();
  return{tratar,entrada,auditoria,tick,backups,oauth,verificacao,parar:()=>{clearInterval(timer);oauth.parar();}};
}



