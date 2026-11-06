import {podeConfigurar} from './acessos.js';
import {arquivoDados} from './contexto-bot.js';
import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { emojiTexto } from './emojis.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, ContainerBuilder, RoleSelectMenuBuilder, EmbedBuilder, Events, MessageFlags, ModalBuilder, PermissionFlagsBits, TextDisplayBuilder, TextInputBuilder, TextInputStyle, type Client, type Interaction } from 'discord.js';

type Config = { autoRole: string | null; imagemBoas: string; imagemSaida: string; boas: string | null; saida: string | null; logs: string | null; avisos: string | null; mensagemBoas: string; mensagemSaida: string; mensagemAviso: string; intervalo: number; ultimoAviso: number };
const padrao = (): Config => ({ autoRole:null, imagemBoas:'', imagemSaida:'', boas:null, saida:null, logs:null, avisos:null, mensagemBoas:'Bem-vindo(a), {usuario}, ao {servidor}!', mensagemSaida:'{nome} saiu do servidor {servidor}.', mensagemAviso:'Conheça a Anzy Programs: https://discord.gg/eAy2XQr7qc', intervalo:0, ultimoAviso:0 });
const campos = ['boas','saida','avisos'] as const;
type Campo = typeof campos[number];
const nomes: Record<Campo,string> = { boas:'Boas-vindas', saida:'Saída', avisos:'Comunicados da Anzy Programs' };
export function criarStoreOutros(arquivo = arquivoDados('outros.json')) {
  let dados: Record<string, Config> = {};
  if (existsSync(arquivo)) {
    const raw: unknown = JSON.parse(readFileSync(arquivo,'utf8'));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('Arquivo de configurações inválido.');
    for (const [id, config] of Object.entries(raw)) {
      if (!/^\d{17,20}$/.test(id) || !config || typeof config !== 'object') throw Error('Servidor inválido nas configurações.');
      const c = { ...padrao(), ...config } as Config;
      if (campos.some(k => c[k] !== null && (typeof c[k] !== 'string' || !/^\d{17,20}$/.test(c[k]!))) ||
        ['mensagemBoas','mensagemSaida','mensagemAviso','imagemBoas','imagemSaida'].some(k => typeof c[k as keyof Config] !== 'string') ||
        !Number.isInteger(c.intervalo) || c.intervalo < 0 || c.intervalo > 10080 || !Number.isFinite(c.ultimoAviso)) throw Error('Configuração inválida: '+id);
      dados[id] = c;
    }
  }
  return {
    obter(id: string): Config { return { ...padrao(), ...dados[id] }; },
    salvar(id: string, patch: Partial<Config>) {
      const novos = { ...dados, [id]: { ...padrao(), ...dados[id], ...patch } };
      mkdirSync(dirname(arquivo),{recursive:true}); writeFileSync(arquivo+'.tmp',JSON.stringify(novos,null,2)); renameSync(arquivo+'.tmp',arquivo); dados=novos;
    },
    ids() { return Object.keys(dados); },
  };
}
export function mensagemModelo(texto: string, usuario: string, nome: string, servidor: string) {
  return texto.replaceAll('{usuario}',usuario).replaceAll('{nome}',nome).replaceAll('{servidor}',servidor).slice(0,2000);
}
export function imagemValida(valor: string): boolean {
  if (!valor) return true;
  try { const url = new URL(valor); return valor.length <= 1500 && url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}
export function confirmacaoMensagem(canal: string | null): string {
  return canal ? `${emojiTexto('sucesso')} Mensagem salva! O sistema já está ativo no canal <#` + canal + '>.' : `${emojiTexto('sucesso')} Mensagem salva. Selecione o canal no painel para ativar.`;
}
export function instalarOutros(bot: Client, cor: (id: string | null) => number, store = criarStoreOutros()) {
  const botao = (id:string,label:string) => new ButtonBuilder().setCustomId('outros:'+id).setLabel(label).setStyle(ButtonStyle.Secondary);
  function painel(id:string, tipo:string, aviso='') {
    const c=store.obter(id), p=new ContainerBuilder().setAccentColor(cor(id));
    p.addTextDisplayComponents(new TextDisplayBuilder().setContent('## Outros Sistemas\n'+(aviso ? aviso+'\n\n' : '')));
    if (tipo==='gerais') {
      p.addTextDisplayComponents(new TextDisplayBuilder().setContent('### Conferir Configurações gerais\n'+campos.map(k=>nomes[k]+': '+(c[k]?'<#'+c[k]+'>':'Desativado')).join('\n')+'\nCargo automático: '+(c.autoRole?'<@&'+c.autoRole+'>':'Desativado')+'\n\nAs configurações são salvas individualmente por servidor.'));
    } else if(tipo==='autorole') {
      p.addTextDisplayComponents(new TextDisplayBuilder().setContent('### Cargo automático\nEscolha o cargo que cada pessoa receberá ao entrar no servidor.\nCargo atual: '+(c.autoRole?'<@&'+c.autoRole+'>':'Desativado')));
      p.addActionRowComponents(new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(new RoleSelectMenuBuilder().setCustomId('outros:autorole:definir').setPlaceholder('Cargo automático para novos membros')));
      p.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(botao('autorole:desativar','Desativar cargo automático')));
    } else {
      const lista:Campo[]=tipo==='membros'?['boas','saida']:['avisos'];
      p.addTextDisplayComponents(new TextDisplayBuilder().setContent(tipo==='membros'?'### Boas-vindas e saída\nEscolha os canais e personalize as mensagens.':'### Comunicados da Anzy Programs\nReceba comunicados enviados pela programadora da Anzy Programs sobre atualizações, melhorias e novidades do seu bot.\n\nSelecione apenas o canal onde deseja receber esses comunicados. O conteúdo é definido pela Anzy Programs.'));
      for(const k of lista) {
        p.addTextDisplayComponents(new TextDisplayBuilder().setContent('**'+nomes[k]+'**: '+(c[k]?'<#'+c[k]+'>':'Desativado')));
        const select=new ChannelSelectMenuBuilder().setCustomId('outros:canal:'+k).setPlaceholder('Canal de '+nomes[k]).setChannelTypes(ChannelType.GuildText,ChannelType.GuildAnnouncement);
        p.addActionRowComponents(new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(select));
        if(k!=='avisos') {
          const row=new ActionRowBuilder<ButtonBuilder>().addComponents(botao('desativar:'+k,'Desativar '+nomes[k]));
          row.addComponents(botao('texto:'+k,'Editar mensagem e imagem'));
          p.addActionRowComponents(row);
          if(k==='boas'||k==='saida') p.addTextDisplayComponents(new TextDisplayBuilder().setContent('Imagem: '+((k==='boas'?c.imagemBoas:c.imagemSaida)?'Configurada':'Sem imagem')));
        }
      }
    }
    p.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('anzy:voltar:outros').setLabel('Voltar').setStyle(ButtonStyle.Secondary)));
    return {components:[p]};
  }
  const tipoCampo=(k:Campo)=>k==='boas'||k==='saida'?'membros':'avisos';
  async function enviar(id:string, canalId:string, content:string, mencionar=false, imagem='', usarEmbed=false) {
    const guild=bot.guilds.cache.get(id); if(!guild) return;
    const canal=await guild.channels.fetch(canalId);
    if(!canal || (canal.type!==ChannelType.GuildText && canal.type!==ChannelType.GuildAnnouncement)) throw Error('Canal indisponível.');
    const me=await guild.members.fetchMe();
    if(!canal.permissionsFor(me).has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages])) throw Error('Sem permissão para enviar no canal.');
    if(usarEmbed && !canal.permissionsFor(me).has(PermissionFlagsBits.EmbedLinks)) throw Error('Permissão Inserir links necessária para mostrar a imagem.');
    const embed = usarEmbed ? new EmbedBuilder().setColor(cor(id)).setDescription(content) : null;
    if(embed && imagem) embed.setImage(imagem);
    await canal.send({...(embed ? {embeds:[embed]} : {content}),allowedMentions:{parse:mencionar?['users']:[]}});
  }
  bot.on(Events.GuildMemberAdd, async membro=>{
    const c=store.obter(membro.guild.id);
    if(c.autoRole&&!membro.user.bot)try {
      const role=await membro.guild.roles.fetch(c.autoRole),me=await membro.guild.members.fetchMe();
      if(role&&!role.managed&&role.id!==membro.guild.id&&me.permissions.has(PermissionFlagsBits.ManageRoles)&&me.roles.highest.comparePositionTo(role)>0)await membro.roles.add(role,'Cargo automático de entrada');
      else console.warn('Cargo automático indisponível ou acima do cargo do bot.');
    }catch(e){console.error('Falha no cargo automático:',e instanceof Error?e.message:'Erro');}
    for(const [canal,texto,imagem,usarEmbed] of [[c.boas,mensagemModelo(c.mensagemBoas,'<@'+membro.id+'>',membro.user.username,membro.guild.name),c.imagemBoas,true]] as const) {
      if(canal) try {await enviar(membro.guild.id,canal,texto,usarEmbed,imagem,usarEmbed);} catch(e){console.error('Falha na mensagem de entrada:',e);}
    }
  });
  bot.on(Events.GuildMemberRemove, async membro=>{
    const c=store.obter(membro.guild.id);
    for(const [canal,texto,imagem,usarEmbed] of [[c.saida,mensagemModelo(c.mensagemSaida,membro.user.username,membro.user.username,membro.guild.name),c.imagemSaida,true]] as const) {
      if(canal) try {await enviar(membro.guild.id,canal,texto,false,imagem,usarEmbed);} catch(e){console.error('Falha na mensagem de saída:',e);}
    }
  });
  return async function tratar(i:Interaction):Promise<boolean> {
    const escolha=i.isStringSelectMenu()&&i.customId==='anzy:opcao:outros';
    const proprio=('customId' in i)&&i.customId.startsWith('outros:');
    if(!escolha&&!proprio)return false;
    if(!i.isRepliable())return false;
    if(!i.inGuild()||!i.guildId||!podeConfigurar(i)) {await i.reply({content:emojiTexto('erro')+'Apenas administradores podem configurar o bot.',flags:MessageFlags.Ephemeral});return true;}
    const id=i.guildId;
    if(escolha&&i.isStringSelectMenu()) {
      const tipo=['avisos','membros','gerais','autorole'][Number(i.values[0])];
      if(!tipo){await i.reply({content:emojiTexto('erro')+'Opção inválida.',flags:MessageFlags.Ephemeral});return true;}
      await i.deferUpdate(); await i.editReply(painel(id,tipo));return true;
    }
    if(!('customId' in i))return false;
    const [,acao,chave]=i.customId.split(':');
    if(acao==='autorole') {
      if(i.isRoleSelectMenu()&&chave==='definir') {
        await i.deferUpdate();const role=await i.guild!.roles.fetch(i.values[0]!);const me=await i.guild!.members.fetchMe();
        if(!role||role.id===id||role.managed||role.permissions.has(PermissionFlagsBits.Administrator)||!me.permissions.has(PermissionFlagsBits.ManageRoles)||me.roles.highest.comparePositionTo(role)<=0){await i.followUp({content:emojiTexto('erro')+' Escolha um cargo sem Administrador e abaixo do cargo do bot. O bot precisa de Gerenciar cargos.',flags:MessageFlags.Ephemeral});return true;}
        store.salvar(id,{autoRole:role.id});await i.editReply(painel(id,'autorole',emojiTexto('sucesso')+' Cargo automático salvo.'));return true;
      }
      if(i.isButton()&&chave==='desativar'){await i.deferUpdate();store.salvar(id,{autoRole:null});await i.editReply(painel(id,'autorole',emojiTexto('sucesso')+' Cargo automático desativado.'));return true;}
    }
    if(!campos.includes(chave as Campo)){await i.reply({content:emojiTexto('erro')+'Configuração inválida.',flags:MessageFlags.Ephemeral});return true;}
    const k=chave as Campo;
    if(k==='avisos'&&acao!=='canal') {
      if(i.isButton()) {await i.deferUpdate();await i.editReply(painel(id,'avisos'));}
      else await i.reply({content:emojiTexto('erro')+'Os comunicados são definidos pela Anzy Programs. Escolha apenas o canal destinatário no painel.',flags:MessageFlags.Ephemeral});
      return true;
    }
    if(i.isChannelSelectMenu()&&acao==='canal') {
      await i.deferUpdate(); const canalId=i.values[0];
      const canal=canalId?await i.guild!.channels.fetch(canalId):null;
      const me=await i.guild!.members.fetchMe();
      if(!canal || (canal.type!==ChannelType.GuildText&&canal.type!==ChannelType.GuildAnnouncement)||!canal.permissionsFor(me).has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages])) {
        await i.followUp({content:emojiTexto('erro')+'Escolha um canal onde o bot possa ver e enviar mensagens.',flags:MessageFlags.Ephemeral});return true;
      }
      store.salvar(id,{[k]:canal.id});await i.editReply(painel(id,tipoCampo(k),`${emojiTexto('sucesso')} Canal salvo.`));return true;
    }
    if(i.isButton()&&acao==='desativar') {await i.deferUpdate();store.salvar(id,{[k]:null});await i.editReply(painel(id,tipoCampo(k),`${emojiTexto('sucesso')} Desativado.`));return true;}
    if(i.isButton()&&acao==='texto'&&(k==='boas'||k==='saida')) {
      const c=store.obter(id), valor=k==='boas'?c.mensagemBoas:k==='saida'?c.mensagemSaida:c.mensagemAviso;
      const modal=new ModalBuilder().setCustomId('outros:salvar:'+k).setTitle(nomes[k]);
      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('mensagem').setLabel('Mensagem ({usuario}, {nome}, {servidor})').setStyle(TextInputStyle.Paragraph).setMaxLength(1800).setRequired(true).setValue(valor)));
      const imagem = k==='boas'?c.imagemBoas:c.imagemSaida;
      const campoImagem = new TextInputBuilder().setCustomId('imagem').setLabel('Link HTTPS da imagem (opcional)').setPlaceholder('Cole o link da imagem; vazio remove a imagem').setStyle(TextInputStyle.Short).setMaxLength(1500).setRequired(false);
      if(imagem) campoImagem.setValue(imagem);
      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(campoImagem));
      await i.showModal(modal);return true;
    }
    if(i.isModalSubmit()&&acao==='salvar'&&(k==='boas'||k==='saida')) {
      const mensagem=i.fields.getTextInputValue('mensagem').trim();
      const imagem=i.fields.getTextInputValue('imagem').trim();
      if(!mensagem||mensagem.length>1800||!imagemValida(imagem)) {await i.reply({content:emojiTexto('erro')+'Informe uma mensagem e um link HTTPS válido para a imagem, ou deixe o campo da imagem vazio.',flags:MessageFlags.Ephemeral});return true;}
      await i.deferReply({flags:MessageFlags.Ephemeral});
      store.salvar(id,k==='boas'?{mensagemBoas:mensagem,imagemBoas:imagem}:{mensagemSaida:mensagem,imagemSaida:imagem});
      await i.editReply({content:confirmacaoMensagem(store.obter(id)[k])});return true;
    }
    await i.reply({content:emojiTexto('erro')+'Ação inválida. Abra novamente o painel.',flags:MessageFlags.Ephemeral});return true;
  };
}
