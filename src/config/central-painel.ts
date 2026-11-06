import {disponivelParaVenda} from './central-politica.js';
import {novoBot,validarCredencialBot,validarParaEstoque} from './central-store.js';
import {ActionRowBuilder,ButtonBuilder,ButtonStyle,EmbedBuilder,MessageFlags,ModalBuilder,PermissionFlagsBits as P,SlashCommandBuilder,StringSelectMenuBuilder,TextInputBuilder,TextInputStyle,type Interaction} from 'discord.js';
import type {GerenteCentral} from '../central.js';
import {randomBytes} from 'node:crypto';
import {destinosComunicado,enviarComunicado,type Comunicado} from './comunicados-globais.js';
import {emojiTexto as e,emojiComponente as ec} from './emojis.js';
const nomes={teste:'Em teste',disponivel:'Disponível',reservado:'Reservado para comprador',vendido:'Vendido',suspenso:'Suspenso'};
const campo=(id:string,nome:string)=>new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId(id).setLabel(nome).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(30));
const b=(id:string,nome:string)=>new ButtonBuilder().setCustomId(id).setLabel(nome).setEmoji(ec('configuracoes')).setStyle(ButtonStyle.Secondary);
export function conviteBot(id:string,guild?:string){
 const permissoes=P.ViewChannel|P.SendMessages|P.EmbedLinks|P.AttachFiles|P.ReadMessageHistory|P.UseExternalEmojis|P.ManageChannels|P.ManageRoles|P.ManageMessages|P.KickMembers|P.BanMembers|P.ModerateMembers|P.ViewAuditLog|P.ManageGuild|P.CreateInstantInvite|P.AddReactions|P.Connect|P.SendPolls;
 const u=new URL('https://discord.com/oauth2/authorize');u.search=new URLSearchParams({client_id:id,scope:'bot applications.commands',permissions:permissoes.toString(),...(guild?{guild_id:guild,disable_guild_select:'true'}:{})}).toString();return u.toString();
}
export function instalarPainelCentral(g:GerenteCentral,validarEstoque=validarParaEstoque,validarToken=validarCredencialBot){
 const previas=new Map<string,{dono:string;comunicado:Comunicado;vence:number}>();
 const comandos=[new SlashCommandBuilder().setName('registerbot').setDescription('Cadastra um bot de estoque pelo formulário privado.').setDMPermission(false).setDefaultMemberPermissions(P.Administrator),new SlashCommandBuilder().setName('bots').setDescription('Central privada de estoque e hospedagem dos seus bots.').setDMPermission(false).setDefaultMemberPermissions(P.Administrator),new SlashCommandBuilder().setName('mybots').setDescription('Consulta os bots que você adquiriu e abre a ativação.')];
 const tela=(titulo:string,descricao:string,components:ActionRowBuilder<any>[]=[])=>( {embeds:[new EmbedBuilder().setColor(0x5865f2).setTitle(e('configuracoes')+' '+titulo).setDescription(descricao)],components,allowedMentions:{parse:[] as never[]}} );
 function principal(pagina=0){
  const bots=Object.values(g.bots()),pg=Math.max(0,Math.min(pagina,Math.max(0,Math.ceil(bots.length/20)-1))),parte=bots.slice(pg*20,pg*20+20),rows:ActionRowBuilder<any>[]=[];
  if(parte.length)rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId('cb:selecionar').setPlaceholder('Escolha um bot para administrar').addOptions(parte.map(x=>({label:x.nome.slice(0,80),value:x.id,description:nomes[x.estado]+' • '+(g.online(x.id)?'Online':'Offline')})))));
  rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(b('cb:lista:'+Math.max(0,pg-1),'Anterior'),b('cb:lista:'+(pg+1),'Próxima'),b('cb:cadastrar','Cadastrar bot'),new ButtonBuilder().setCustomId('rn:inicio').setLabel('Assinaturas e renovações').setStyle(ButtonStyle.Secondary)));
  rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(b('cb:comunicado','Comunicado global')));
  return tela('Central de Bots',`**${bots.length}/50 bots de clientes cadastrados.**\nUma hospedagem · um domínio · programação compartilhada.\n**Conexões:** ${g.capacidade?.().conectados??'—'}/${g.capacidade?.().maxConexoes??51} (inclui o principal).\nEstoque disponível pode ficar offline e será ligado após a aprovação da venda.\n\n${e('categoria')} **Em teste:** confira comandos e imagens.\n${e('categoria')} **Disponível:** pronto para uma compra.\n${e('categoria')} **Reservado/Vendido:** exclusivo do comprador.\n\nPágina ${pg+1}/${Math.max(1,Math.ceil(bots.length/20))}`,rows);
 }
 function detalhe(id:string){const x=g.bots()[id];if(!x)throw Error('Bot não encontrado.');return tela(x.nome,`**ID:** ${x.id}\n**Situação:** ${nomes[x.estado]}\n**Conexão:** ${g.online(id)?'Online':'Offline'}\n**Produto:** ${x.produto?.id??'Não vinculado'}\n**Comprador:** ${x.venda?'<@'+x.venda.comprador+'>':'Ainda não vendido'}\n**Servidor do cliente:** ${x.venda?.guildDestino??'Ainda não vinculado'}\n\n${g.erro(id)||(x.venda?'Bot vinculado ao comprador. Pausar a execução não o devolve ao estoque.':'Você pode testar antes de vender. Ao disponibilizar, o bot fica offline e não mantém conexão com o Discord. O pagamento aprovado inicia a ativação automaticamente.')}`, [new ActionRowBuilder<ButtonBuilder>().addComponents(b('cb:ligar:'+id,x.ativo?'Pausar execução':x.venda?'Ativar execução':'Ligar para teste'),b('cb:disponivel:'+id,'Disponibilizar para venda').setDisabled(!!x.venda||!!x.reuso||x.estado==='suspenso'),new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Adicionar ao servidor da central').setURL(conviteBot(id,g.controle))),new ActionRowBuilder<ButtonBuilder>().addComponents(b('cb:retirar:'+id,'Retirar da venda').setDisabled(!disponivelParaVenda(x)),b('cb:credenciais:'+id,'Atualizar credenciais').setDisabled(x.ativo||!!x.reuso),b('cb:lista:0','Voltar à central'))]);}
 function produtosParaBot(id:string,pagina=0){
  const bot=g.bots()[id],loja=g.loja();if(!bot||!loja)throw Error('Bot ou loja indisponível.');
  const produtos=Object.values(loja.obter(g.controle).produtos);
  const pg=Math.max(0,Math.min(Number.isFinite(pagina)?pagina:0,Math.max(0,Math.ceil(produtos.length/25)-1))),parte=produtos.slice(pg*25,pg*25+25),rows:ActionRowBuilder<any>[]=[];
  if(parte.length)rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId('cb:produto:'+id).setPlaceholder('Selecione o produto para estocar este bot').addOptions(parte.map(p=>({label:p.nome.slice(0,100),value:p.id,description:('R$ '+(p.preco/100).toFixed(2).replace('.',',')+' • '+(p.variacoes.length?'Com variações':p.automatico?'Códigos digitais':'Estoque de bots compatível')+' • '+p.id).slice(0,100)})))));
  if(produtos.length>25)rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(b('cb:produtos:'+id+':'+(pg-1),'Anterior').setDisabled(pg===0),b('cb:produtos:'+id+':'+(pg+1),'Próxima').setDisabled((pg+1)*25>=produtos.length)));
  rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(b('cb:detalhe:'+id,'Voltar ao bot')));
  return tela('Escolher produto de venda',parte.length?'Selecione abaixo o produto que receberá este bot no estoque.\nA central controlará o estoque e a liberação após a aprovação do pagamento.\n\nTodos os produtos desta loja aparecem. Produtos com variações precisam de um produto separado para bots; produtos digitais sem estoque podem ser convertidos com confirmação.\nPágina '+(pg+1)+'/'+Math.max(1,Math.ceil(produtos.length/25)):'Nenhum produto encontrado nesta loja. Crie um produto no /panel, sem variações e sem códigos digitais, e volte aqui.',rows);
 }
 async function meusBots(user:string,pagina=0){const meus=Object.values(await g.registro!.listar()).filter(b=>b.venda?.comprador===user&&['reservado','vendido'].includes(b.estado)),pg=Math.max(0,Math.min(pagina,Math.max(0,Math.ceil(meus.length/20)-1))),rows:ActionRowBuilder<any>[]=[];if(meus.length)rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId('cb:meubot').setPlaceholder('Escolha seu bot').addOptions(meus.slice(pg*20,pg*20+20).map(x=>({label:x.nome.slice(0,100),value:x.id,description:x.venda?.guildDestino?'Servidor já vinculado':'Aguardando ativação'})))));rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(b('cb:meus:'+Math.max(0,pg-1),'Anterior').setDisabled(pg===0),b('cb:meus:'+(pg+1),'Próxima').setDisabled((pg+1)*20>=meus.length)));return tela('Meus bots',meus.length?'Escolha seu bot para vincular ao servidor.\nPágina '+(pg+1)+'/'+Math.ceil(meus.length/20):'Nenhum bot liberado para esta conta. A confirmação do pagamento precisa estar concluída.',rows);}
 async function tratar(i:Interaction){
  const slash=i.isChatInputCommand()?i.commandName:'',cid='customId'in i?i.customId:'';
  if(!['bots','mybots','registerbot'].includes(slash)&&!cid.startsWith('cb:'))return false;
  const responder=async(data:ReturnType<typeof tela>)=>{if(i.isRepliable()){if(i.deferred||i.replied)await i.editReply(data);else await i.reply({...data,flags:MessageFlags.Ephemeral});}};
  try{
   if(slash==='mybots'&&i.isChatInputCommand()||cid.startsWith('cb:meus:')&&i.isButton()){await i.deferReply({flags:MessageFlags.Ephemeral});await responder(await meusBots(i.user.id,Number(cid.split(':')[2])||0));return true;}
   const [,acao,id]=cid.split(':');
   if(acao==='ativar'&&i.isButton()||acao==='meubot'&&i.isStringSelectMenu()){
    const escolhido=i.isStringSelectMenu()?i.values[0]!:id??'';const x=g.bots()[escolhido];if(!x?.venda||x.venda.comprador!==i.user.id||!['reservado','vendido'].includes(x.estado))throw Error('Este bot não pertence à sua compra. Use /mybots para atualizar.');
    await i.showModal(new ModalBuilder().setCustomId('cb:vincular:'+x.id).setTitle('Ativar meu bot').addComponents(campo('guild','ID do servidor que receberá seu bot')));return true;
   }
   if(acao==='vincular'&&i.isModalSubmit()){
    await i.deferReply({flags:MessageFlags.Ephemeral});const guild=i.fields.getTextInputValue('guild').trim();const x=await g.registro!.vincular(id!,i.user.id,guild);g.adotar(x);await g.atualizar();
    await responder(tela('Seu bot está liberado',`O bot foi vinculado ao servidor **${guild}**.\nClique em **Adicionar meu bot** e autorize as permissões. Depois use **/configbot** no seu servidor.\n\nSomente quem administra o servidor pode concluir a instalação.`,[new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Adicionar meu bot').setURL(conviteBot(x.id,guild)))]));return true;
   }
   if(i.user.id!==g.dono||i.guildId!==g.controle)throw Error('Central exclusiva da programadora no servidor autorizado.');
   if(acao==='comunicado'&&i.isButton()){
    await i.showModal(new ModalBuilder().setCustomId('cb:previacomunicado').setTitle('Comunicado global').addComponents(campo('titulo','Título'),new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('descricao').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(3500))));return true;
   }
   if(acao==='previacomunicado'&&i.isModalSubmit()){
    const titulo=i.fields.getTextInputValue('titulo').trim(),descricao=i.fields.getTextInputValue('descricao').trim();if(!titulo||!descricao||titulo.length>256)throw Error('Preencha título e descrição.');
    const id=randomBytes(12).toString('hex');previas.set(id,{dono:i.user.id,comunicado:{id,titulo,descricao},vence:Date.now()+300000});
    for(const [k,v]of previas)if(v.vence<Date.now())previas.delete(k);
    const destinos=destinosComunicado(g);await responder(tela('Prévia • comunicado global',`**${titulo.replaceAll('@','@\u200b')}**\n${descricao.replaceAll('@','@\u200b')}\n\n**Destinos autorizados:** ${destinos.length} bot(s) ativo(s). O envio usa somente o canal de avisos configurado em cada servidor.`,[new ActionRowBuilder<ButtonBuilder>().addComponents(b('cb:enviarcomunicado:'+id,'Confirmar envio'),b('cb:lista:0','Cancelar'))]));return true;
   }
   if(acao==='enviarcomunicado'&&i.isButton()){
    const previa=previas.get(id!);if(!previa||previa.dono!==i.user.id||previa.vence<Date.now())throw Error('Prévia expirada. Abra o formulário novamente.');
    await i.deferReply({flags:MessageFlags.Ephemeral});const r=await enviarComunicado(g,previa.comunicado),ok=r.resultados.filter(x=>x.estado==='enviado').length;
    const falhas=r.resultados.length-ok;if(!falhas)previas.delete(id!);
    await responder(tela('Comunicado global • resultado',`**Enviados:** ${ok}\n**Já enviados:** ${r.jaEnviados}\n**Falhas:** ${falhas}\n\n${r.resultados.map(x=>`${x.bot} / ${x.servidor}: ${x.estado==='enviado'?'enviado':x.erro}`).join('\n').slice(0,3500)||'Nenhum destino pendente.'}`,falhas?[new ActionRowBuilder<ButtonBuilder>().addComponents(b('cb:enviarcomunicado:'+id,'Repetir apenas falhas'))]:[]));return true;
   }
   if(acao==='credenciais'&&i.isButton()){
    const x=g.bots()[id!];if(!x||x.ativo||x.reuso)throw Error('Pause a execução do bot antes de atualizar suas credenciais.');
    const token=new TextInputBuilder().setCustomId('token').setLabel('Novo token • aba Bot do Developer Portal').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(300);
    const secret=new TextInputBuilder().setCustomId('secret').setLabel('Novo Client Secret (vazio mantém o atual)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(300);
    await i.showModal(new ModalBuilder().setCustomId('cb:salvarcredenciais:'+id).setTitle('Atualizar credenciais do bot').addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(token),new ActionRowBuilder<TextInputBuilder>().addComponents(secret)));return true;
   }
   if(acao==='salvarcredenciais'&&i.isModalSubmit()){
    await i.deferReply({flags:MessageFlags.Ephemeral});const token=i.fields.getTextInputValue('token').trim(),secret=i.fields.getTextInputValue('secret').trim();const atual=g.bots()[id!];if(!atual||atual.ativo||atual.reuso)throw Error('Pause a execução antes de atualizar este cadastro.');
    if(!token||token.length>300||secret.length>300)throw Error('Preencha o token válido da aba Bot.');await validarToken(atual.id,token);
    const novo=await g.registro!.alterar(atual.id,b=>{if(b.ativo||b.reuso)throw Error('O bot foi ativado por outra operação. Pause e tente novamente.');b.token=token;if(secret)b.secret=secret;});g.adotar(novo);await g.atualizar();
    await responder(tela('Credenciais atualizadas',e('sucesso')+' Token conferido e salvo com segurança. O cadastro, os dados e os vínculos foram preservados. Agora você pode disponibilizar o bot para venda.',[new ActionRowBuilder<ButtonBuilder>().addComponents(b('cb:detalhe:'+atual.id,'Voltar ao bot'))]));return true;
   }
   if((slash==='registerbot'&&i.isChatInputCommand())||(acao==='cadastrar'&&i.isButton())){
    const entrada=(id:string,label:string,max:number)=>new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(max));
    await i.showModal(new ModalBuilder().setCustomId('cb:cadastro').setTitle('Cadastrar bot de estoque').addComponents(entrada('id','ID do aplicativo',20),entrada('token','Token do bot',300),entrada('secret','Client Secret OAuth2',300)));return true;
   }
   if(acao==='cadastro'&&i.isModalSubmit()){
    await i.deferReply({flags:MessageFlags.Ephemeral});
    try{const id=i.fields.getTextInputValue('id').trim(),token=i.fields.getTextInputValue('token').trim(),secret=i.fields.getTextInputValue('secret').trim();
     const app=await validarCredencialBot(id,token);await g.registro!.adicionar(novoBot(id,app.name,token,secret));await g.atualizar();await responder(detalhe(id));
    }catch{await responder(tela('Cadastro não concluído',e('erro')+' Confira o ID, token e Client Secret. Verifique também se o bot já está cadastrado e se a central está disponível. Nenhuma credencial é exibida.'));}return true;
   }
   if(slash==='bots'&&i.isChatInputCommand()){await i.deferReply({flags:MessageFlags.Ephemeral});await g.atualizar();await responder(principal());return true;}
   if(acao==='ajuda'){await responder(tela('Cadastrar um bot','1. Crie o aplicativo Discord e habilite Server Members Intent.\n2. Cadastre o mesmo retorno OAuth2 do bot principal.\n3. Use **/registerbot** ou o botão **Cadastrar bot** e preencha o formulário privado.\n4. Adicione o bot ao servidor da central pelo convite. Ele pode continuar offline.\n5. Teste se desejar e vincule um produto para disponibilizar. O estoque fica offline até vender.\n\n**As credenciais ficam cifradas na central e não são enviadas ao comprador.**'));return true;}
   if((acao==='disponivel'||acao==='produtos')&&i.isButton()){await i.deferUpdate();await responder(produtosParaBot(id!,Number(cid.split(':')[3])||0));return true;}
   if(acao==='detalhe'&&i.isButton()){await i.deferUpdate();await responder(detalhe(id!));return true;}
   if((acao==='produto'&&(i.isStringSelectMenu()||i.isModalSubmit()))||(acao==='converter'&&i.isButton())){
    if(i.isStringSelectMenu()||i.isButton())await i.deferUpdate();else await i.deferReply({flags:MessageFlags.Ephemeral});const produto=i.isStringSelectMenu()?i.values[0]!:i.isButton()?cid.split(':')[3]!:i.fields.getTextInputValue('produto').trim(),loja=g.loja();if(!loja)throw Error('Loja ainda iniciando.');const p=loja.obter(g.controle).produtos[produto];
    if(!p)throw Error('Produto não encontrado nesta loja.');
    if(p.variacoes.length){await responder(tela('Produto com variações','**'+p.nome+'** tem variações. A central de bots precisa de um produto sem variações. Crie um produto separado no /panel para vender seus bots; as variações existentes serão preservadas.',[new ActionRowBuilder<ButtonBuilder>().addComponents(b('cb:produtos:'+id+':0','Escolher outro produto'))]));return true;}
    if(p.automatico){
     if(loja.obter(g.controle).codigos.some(c=>c.produto===produto&&['disponivel','reservado'].includes(c.estado)))throw Error('Este produto possui códigos disponíveis ou reservados. Use um produto separado para os bots.');
     if(acao!=='converter'){await responder(tela('Usar este produto para vender bots?','**'+p.nome+'** está configurado para códigos digitais. Ao confirmar, a central passará a controlar o estoque e entregar os bots após a aprovação do pagamento. Nome, preço e anúncios serão mantidos.',[new ActionRowBuilder<ButtonBuilder>().addComponents(b('cb:converter:'+id+':'+produto,'Confirmar e vincular'),b('cb:produtos:'+id+':0','Voltar'))]));return true;}
    }
    const atual=g.bots()[id!];if(!atual||atual.venda||atual.reuso||atual.estado==='suspenso'||atual.produto&&atual.produto.id!==produto)throw Error('Bot indisponível ou já vinculado a outro produto.');await validarEstoque(atual.id,atual.token,g.controle,g.retornoOAuth);
    const bot=g.principalBot();if(!bot)throw Error('Central indisponível.');
    if(p.automatico)loja.configurarAutomatico(g.controle,produto,false);
    const x=await g.registro!.alterar(id!,b=>{if(b.produto&&b.produto.id!==produto)throw Error('Este bot já está vinculado a outro produto.');if(b.venda||b.reuso||b.estado==='suspenso')throw Error('Este bot não pode ser disponibilizado.');b.produto={guild:g.controle,id:produto};b.estado='disponivel';b.ativo=false;});g.adotar(x);
    const quantidade=Object.values(g.bots()).filter(b=>disponivelParaVenda(b)&&b.produto?.guild===g.controle&&b.produto.id===produto).length;loja.centralProduto(g.controle,produto,quantidade);await g.atualizar();await responder(detalhe(id!));return true;
   }
   if(acao==='retirar'&&i.isButton()){await i.deferReply({flags:MessageFlags.Ephemeral});const x=await g.registro!.alterar(id!,b=>{if(!disponivelParaVenda(b))throw Error('Este bot não está disponível para retirar da venda.');b.estado='teste';b.ativo=false;delete b.produto;});g.adotar(x);await g.atualizar();await responder(detalhe(id!));return true;}
   if(acao==='ligar'&&i.isButton()){await i.deferReply({flags:MessageFlags.Ephemeral});const x=await g.registro!.alterar(id!,b=>{if(b.reuso)throw Error('Preparação para reutilização em andamento. Continue pelo /renov-bots.');if(!b.ativo&&b.assinatura?.bloqueada)throw Error('Assinatura bloqueada. Use /renov-bots para regularizar o vencimento ou a suspensão.');b.ativo=!b.ativo;});g.adotar(x);await g.atualizar();await responder(detalhe(id!));return true;}
   if(acao==='selecionar'&&i.isStringSelectMenu()){await i.deferUpdate();await responder(detalhe(i.values[0]!));return true;}
   if(acao==='lista'&&i.isButton()){await i.deferUpdate();await responder(principal(Number(id)||0));return true;}
   throw Error('Opção indisponível. Abra /bots novamente.');
  }catch(err){await responder(tela('Não foi possível concluir',e('erro')+' '+(err instanceof Error?err.message:'Tente novamente.')));return true;}
 }
 return{comandos,tratar};
}
