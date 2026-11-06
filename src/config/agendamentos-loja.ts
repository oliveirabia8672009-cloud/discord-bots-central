import {podeConfigurar} from './acessos.js';
import {intervaloBot} from './contexto-bot.js';
import {ActionRowBuilder,ButtonBuilder,ButtonStyle,ChannelSelectMenuBuilder,ChannelType,ContainerBuilder,EmbedBuilder,Events,MessageFlags,ModalBuilder,PermissionFlagsBits as P,SeparatorBuilder,StringSelectMenuBuilder,TextDisplayBuilder,TextInputBuilder,TextInputStyle,escapeMarkdown,type Client,type Guild,type Interaction} from 'discord.js';
import {emojiTexto as e,emojiComponente as ic} from './emojis.js';
import {criarStoreAgendamentos,dataAgendada,intervaloAgendado,type Agendamento} from './agendamentos-store.js';
import {type criarStoreVendas} from './vendas-store.js';
type StoreVendas=ReturnType<typeof criarStoreVendas>;
export const marcadorAgendado=(nonce:string)=>'Anzy Programs • Automação '+nonce;
const seguro=(s:string,n=1500)=>escapeMarkdown(s.replaceAll('@','@\u200b')).slice(0,n);
const campo=(id:string,label:string,max:number,value='',longo=false,required=true)=>{const t=new TextInputBuilder().setCustomId(id).setLabel(label).setMaxLength(max).setRequired(required).setStyle(longo?TextInputStyle.Paragraph:TextInputStyle.Short);if(id==='intervalo')t.setPlaceholder('0 = uma vez; 60 = por hora; 1440 = por dia');if(value)t.setValue(value);return new ActionRowBuilder<TextInputBuilder>().addComponents(t);};
export function horarioPadrao(n=Date.now()+600000){return new Date(n-10800000).toISOString().slice(0,16).replace('T',' ');}
export function instalarAgendamentos(bot:Client,cor:(g:string|null)=>number,vendas:StoreVendas,publicar:(g:Guild,p:string,canal:string,nonce:string)=>Promise<void>,store=criarStoreAgendamentos()){
 const btn=(id:string,label:string,icon:Parameters<typeof ic>[0]='voltar')=>new ButtonBuilder().setCustomId('au:'+id).setLabel(label).setEmoji(ic(icon)).setStyle(ButtonStyle.Secondary);
 const row=(...bs:ButtonBuilder[])=>new ActionRowBuilder<ButtonBuilder>().addComponents(bs);
 const back=()=>row(btn('home','Avisos e anúncios','agendamento'),new ButtonBuilder().setCustomId('sv:painel').setLabel('Voltar à loja').setEmoji(ic('loja')).setStyle(ButtonStyle.Secondary));
 const view=(g:string,t:string,d:string,rows:ActionRowBuilder<any>[]=[back()])=>({components:[new ContainerBuilder().setAccentColor(cor(g)).addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${e('agendamento')} ${t}\n${d}`)).addSeparatorComponents(new SeparatorBuilder()).addActionRowComponents(...rows)],flags:MessageFlags.IsComponentsV2 as const,content:null,embeds:[],allowedMentions:{parse:[] as never[]}});
 const atualizar=async(i:any,p:any)=>{if(i.deferred||i.replied)await i.editReply(p);else await i.reply({...p,flags:(p.flags??0)|MessageFlags.Ephemeral});};
 const assinaturaEstoque=(g:string,j:Agendamento)=>{const p=j.produto?vendas.obter(g).produtos[j.produto]:null;return JSON.stringify(p?[p.id,p.nome,p.ativo,p.estoque,p.variacoes.map(v=>[v.id,v.nome,v.estoque])]:null);};
 const ocupados=new Set<string>();
 async function canal(g:Guild,id:string|null){if(!id)throw Error('Selecione um canal destinatário.');const ch=await g.channels.fetch(id),me=await g.members.fetchMe();if(!ch||ch.type!==ChannelType.GuildText||!ch.permissionsFor(me)?.has([P.ViewChannel,P.SendMessages,P.EmbedLinks,P.ReadMessageHistory]))throw Error('O bot precisa visualizar, enviar mensagens, inserir links e ler o histórico do canal de texto.');return ch;}
 async function limparEstoque(g:Guild,id:string){
  const j=store.obter(g.id)[id];if(!j?.estoqueDinamico||!j.limpezaEstoque?.length||!j.canal)return;const ch=await canal(g,j.canal),removidas=new Set<string>();
  for(const mid of j.limpezaEstoque){try{const msg=await ch.messages.fetch(mid);if(msg.author.id===bot.user?.id&&msg.embeds.some(em=>em.footer?.text?.startsWith('Anzy Programs • Automação ')))await msg.delete();removidas.add(mid);}catch(err){if((err as any).code===10008)removidas.add(mid);}}
  if(removidas.size&&store.obter(g.id)[id])store.mudar(g.id,id,x=>{x.limpezaEstoque=(x.limpezaEstoque??[]).filter(mid=>!removidas.has(mid));});
 }
 async function finalizar(g:Guild,j:Agendamento,mensagem:string,agora:number){
  if(j.estoqueDinamico)store.mudar(g.id,j.id,x=>{x.limpezaEstoque=[...new Set([...(x.limpezaEstoque??[]),...(x.historico.at(-1)?.mensagem?[x.historico.at(-1)!.mensagem]:[])])].filter(mid=>mid&&mid!==mensagem);});
  store.finalizar(g.id,j.id,mensagem,agora);if(j.estoqueDinamico)await limparEstoque(g,j.id).catch(()=>{});
 }
 async function executar(g:Guild,id:string,agora=Date.now()){
  const lock=g.id+':'+id;if(ocupados.has(lock))return;ocupados.add(lock);
  try{
   let j=store.obter(g.id)[id];if(!j||!['ativo','executando'].includes(j.estado))return;
   const recuperacao=j.estado==='executando';
   if(!recuperacao){if(j.quando>agora)return;const escolhido=store.assumir(g.id,id,agora);if(!escolhido)return;j=escolhido;}
   if(!j.tentativa)throw Error('Execução interrompida. Confira o canal antes de reagendar.');
   const ch=await canal(g,j.canal),nonce=j.tentativa.nonce;
   if(recuperacao){
    const mensagens=await ch.messages.fetch({limit:100});
    const encontrada=mensagens.find(m=>m.author.id===bot.user?.id&&m.embeds.some(em=>em.footer?.text===marcadorAgendado(nonce)));
    if(encontrada){if(j.tipo==='produto')vendas.publicar(g.id,j.produto!,ch.id,encontrada.id);await finalizar(g,j,encontrada.id,agora);return;}
    throw Error('Tentativa anterior interrompida; não foi possível confirmar o envio. Confira as últimas mensagens antes de reagendar, para evitar duplicação.');
   }
   let mensagem='',assinaturaAtual:string|undefined;
   if(j.tipo==='aviso'){
    let descricao=j.texto;
    if(j.estoqueDinamico){const p=j.produto?vendas.obter(g.id).produtos[j.produto]:null;if(!p)throw Error('Produto do aviso de estoque foi removido.');assinaturaAtual=assinaturaEstoque(g.id,j);const total=p.variacoes.length?p.variacoes.reduce((n,v)=>n+v.estoque,0):p.estoque;descricao=descricao.replaceAll('{produto}',()=>seguro(p.nome,100)).replaceAll('{estoque}',()=>String(p.ativo?total:0)).replaceAll('{status}',()=>p.ativo&&total>0?'Disponível para compra':'Indisponível no momento').replaceAll('{variacoes}',()=>p.variacoes.map(v=>seguro(v.nome,80)+': '+v.estoque).join('\n'));}
    const embed=new EmbedBuilder().setColor(cor(g.id)).setTitle(e('eventos')+' '+j.titulo).setDescription(descricao).setFooter({text:marcadorAgendado(nonce)});if(j.imagem)embed.setImage(j.imagem);
    const link=j.estoqueDinamico&&j.linkEstoque?new URL(j.linkEstoque):null;if(link&&(link.protocol!=='https:'||link.hostname!=='discord.com'))throw Error('Use um link de canal do Discord.');const components=link?[row(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Adquirir meu bot').setEmoji(ic('loja')).setURL(link.href))]:[];if(assinaturaAtual!==undefined)store.mudar(g.id,id,x=>{x.assinaturaEstoque=assinaturaAtual!;});const m=await ch.send({embeds:[embed],components,nonce,enforceNonce:true,allowedMentions:{parse:[]}});mensagem=m.id;
   }else{
    const p=j.produto?vendas.obter(g.id).produtos[j.produto]:null;if(!p||!p.ativo)throw Error('Produto removido ou pausado. Ative o produto antes de republicar.');
    await publicar(g,p.id,ch.id,nonce);mensagem=vendas.obter(g.id).produtos[p.id]?.publicacoes.find(x=>x.canal===ch.id)?.mensagem??'';
    if(!mensagem)throw Error('Confira o anúncio antes de reagendar: não foi possível confirmar o vínculo da publicação.');
   }
   await finalizar(g,j,mensagem,agora);
  }catch(err){try{store.falhar(g.id,id,err instanceof Error?err.message:'Falha no envio. Confira o canal e reagende.');}catch{console.error('Não foi possível salvar o resultado da automação.');}}
  finally{ocupados.delete(lock);}
 }
 const rodando=new Set<string>();
 async function tick(agora=Date.now()){
  if(!bot.isReady?.())return;
  for(const gid of store.ids()){
   if(rodando.has(gid))continue;const guild=bot.guilds.cache.get(gid);if(!guild)continue;rodando.add(gid);
   try{for(let j of Object.values(store.obter(gid))){if(j.limpezaEstoque?.length)await limparEstoque(guild,j.id).catch(()=>{});if(j.estado==='ativo'&&j.estoqueDinamico&&j.assinaturaEstoque!==assinaturaEstoque(gid,j))j=store.mudar(gid,j.id,x=>{x.quando=agora;});if(j.estado==='executando'||j.estado==='ativo'&&j.quando<=agora)await executar(guild,j.id,agora);}}finally{rodando.delete(gid);}
  }
 }
 const timer=intervaloBot(()=>{void tick().catch(()=>console.error('Falha na rotina de avisos da loja.'));},30000);timer.unref();
 bot.once?.(Events.ClientReady,()=>{void tick().catch(()=>console.error('Falha ao iniciar avisos da loja.'));});
 function home(g:string){const all=Object.values(store.obter(g));return view(g,'Avisos, lembretes e anúncios',`${e('voltar')} **Agendar aviso:** escreva uma mensagem e escolha o canal e o horário. Pode enviar uma vez ou repetir.\n${e('voltar')} **Republicar anúncio:** atualiza o preço e estoque da vitrine; se a mensagem foi apagada, cria outra. Não apaga anúncios existentes nem promete proteção contra denúncias.\n${e('voltar')} **Horários:** São Paulo. O bot precisa estar online; a conferência ocorre a cada 30 segundos.\n\n**Ativos:** ${all.filter(j=>j.estado==='ativo').length} · **Precisam de atenção:** ${all.filter(j=>j.estado==='erro').length}\nEnvios perdidos durante uma queda não são acumulados. Menções não notificam @everyone ou cargos.`,[row(btn('novoaviso','Agendar aviso / lembrete','eventos'),btn('produtos:0','Republicar anúncio','produtos')),row(btn('lista:0','Gerenciar agendamentos','historico')),back()]);}
 function formulario(j?:Agendamento,produto?:string){
  const tipo=produto?'produto':j?.tipo??'aviso';
  const m=new ModalBuilder().setCustomId(j?`au:salvar:${j.id}:${j.versao}`:produto?'au:novoproduto:'+produto:'au:salvarnovo').setTitle(tipo==='aviso'?'Agendar aviso ou lembrete':'Programar republicação');
  if(tipo==='aviso')m.addComponents(campo('titulo','Título do aviso',80,j?.titulo??''),campo('texto','Mensagem (sem notificar menções)',2500,j?.texto??'',true));
  m.addComponents(campo('data','São Paulo: AAAA-MM-DD HH:mm',16,horarioPadrao(j&&j.quando>Date.now()+60000?j.quando:undefined)),campo('intervalo',tipo==='aviso'?'Repetir em minutos: 0 ou 15 a 10080':'Repetir em minutos: 0 ou 60 a 10080',5,String(j?.intervalo??0)));
  if(tipo==='aviso')m.addComponents(campo('imagem','URL HTTPS da imagem (opcional)',1000,j?.imagem??'',false,false));return m;
 }
 function detalhe(g:string,j:Agendamento){
  const estado={rascunho:'Aguardando confirmação',ativo:'Ativo',pausado:'Pausado',concluido:'Concluído',erro:'Precisa de atenção',executando:'Em execução'}[j.estado];
  const rows:ActionRowBuilder<any>[]=[];
  if(j.estado!=='executando'){
   if(j.estado!=='ativo')rows.push(new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(new ChannelSelectMenuBuilder().setCustomId('au:canal:'+j.id+':'+j.versao).setPlaceholder('Escolha o canal destinatário').setChannelTypes(ChannelType.GuildText)));
   const bs=[btn('editar:'+j.id,'Editar mensagem / horário','configuracoes')];
   if(j.estado==='ativo')bs.push(btn('pausar:'+j.id+':'+j.versao,'Pausar','fechar'));
   else if(j.canal){bs.push(btn('ativar:'+j.id+':'+j.versao,'Confirmar agendamento','confirmar'));if(j.tipo==='produto'&&!j.intervalo)bs.push(btn('agora:'+j.id+':'+j.versao,'Atualizar anúncio agora','loja'));}
   bs.push(btn('remover:'+j.id+':'+j.versao,'Remover agendamento','fechar'));rows.push(row(...bs));
  }
  rows.push(row(btn('ver:'+j.id,'Atualizar situação','historico')),back());
  const link=j.historico.at(-1)?.mensagem;
  return view(g,j.tipo==='aviso'?'Aviso • '+seguro(j.titulo,80):'Republicação • '+seguro(j.titulo,80),`**Situação:** ${estado}\n**Canal:** ${j.canal?'<#'+j.canal+'>':'selecione abaixo'}\n**Horário:** <t:${Math.floor(j.quando/1000)}:F> (São Paulo)\n**Atualização por estoque:** ${j.estoqueDinamico?'automática quando a quantidade mudar':'não'}\n**Repetição:** ${j.intervalo?'a cada '+j.intervalo+' minutos':'uma vez'}\n${j.tipo==='aviso'?'\n**Mensagem:**\n'+seguro(j.texto,1600):'\nAtualiza a mensagem existente ou recupera uma vitrine apagada, usando o produto atual.'}${j.erro?'\n\n'+e('aviso')+' '+seguro(j.erro,400):''}\n\n**Execuções confirmadas no histórico recente:** ${j.historico.length}${link?'\n[Ver última publicação](https://discord.com/channels/'+g+'/'+j.canal+'/'+link+')':''}\n\nEditar pausa o envio até uma nova confirmação. Para reagendar após erro, confira antes se a mensagem já foi enviada.`,rows);
 }
 function produtos(g:string,pg=0){const todos=Object.values(vendas.obter(g).produtos).filter(p=>p.ativo),pag=Math.max(0,Math.min(pg,Math.max(0,Math.ceil(todos.length/20)-1))),lista=todos.slice(pag*20,pag*20+20);const rows:ActionRowBuilder<any>[]=[];
  if(lista.length)rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId('au:produto').setPlaceholder('Escolha um produto ativo').addOptions(lista.map(p=>({label:p.nome.slice(0,100),value:p.id,emoji:ic('produtos')})))));
  rows.push(row(btn('produtos:'+Math.max(0,pag-1),'Anterior').setDisabled(!pag),btn('produtos:'+(pag+1),'Próxima').setDisabled((pag+1)*20>=todos.length)),back());return view(g,'Republicação de anúncios',lista.length?'Escolha o produto. Você poderá agendar uma atualização única, recorrente ou usar Atualizar anúncio agora depois de escolher o canal.':'Não há produtos ativos. Cadastre ou ative um produto na loja.',rows);
 }
 function lista(g:string,pg=0){const todos=Object.values(store.obter(g)).sort((a,b)=>b.criado-a.criado),pag=Math.max(0,Math.min(pg,Math.max(0,Math.ceil(todos.length/20)-1))),parte=todos.slice(pag*20,pag*20+20);const rows:ActionRowBuilder<any>[]=[];
  if(parte.length)rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId('au:abrir').setPlaceholder('Consultar ou alterar um agendamento').addOptions(parte.map(j=>({label:j.titulo.slice(0,90),value:j.id,description:(j.tipo==='aviso'?'Aviso':'Anúncio')+' • '+j.estado,emoji:ic(j.tipo==='aviso'?'eventos':'produtos')})))));
  rows.push(row(btn('lista:'+Math.max(0,pag-1),'Anterior').setDisabled(!pag),btn('lista:'+(pag+1),'Próxima').setDisabled((pag+1)*20>=todos.length)),back());return view(g,'Gerenciar agendamentos',parte.length?'Escolha um item para conferir o canal, o horário e o resultado.':'Nenhum agendamento cadastrado.',rows);
 }
 async function tratar(i:Interaction):Promise<boolean>{
  const custom='customId'in i?i.customId:'',entrada=i.isStringSelectMenu()&&custom==='sv:menu'&&i.values[0]==='agendamentos';if(!entrada&&!custom.startsWith('au:'))return false;
  try{
   if(!i.inGuild()||!i.guild||!i.isRepliable())throw Error('Use dentro do servidor.');
   if(!podeConfigurar(i))throw Error('Somente administradores gerenciam avisos e anúncios agendados.');
   const g=i.guild,[,acao,id,versao]=custom.split(':'),j=id?store.obter(g.id)[id]:undefined;
   if(i.isButton()&&acao==='novoaviso'){await i.showModal(formulario());return true;}
   if(i.isButton()&&acao==='editar'){
    if(!j||j.estado==='executando')throw Error('Agendamento indisponível.');await i.showModal(formulario(j));return true;
   }
   if(i.isStringSelectMenu()&&acao==='produto'){
    const p=vendas.obter(g.id).produtos[i.values[0]!];if(!p||!p.ativo)throw Error('Produto indisponível.');await i.showModal(formulario(undefined,p.id));return true;
   }
   if(i.isModalSubmit())await i.deferReply({flags:MessageFlags.Ephemeral});else if(i.isMessageComponent())await i.deferUpdate();
   if(entrada||acao==='home'){await atualizar(i,home(g.id));return true;}
   if(acao==='produtos'){await atualizar(i,produtos(g.id,Number(id)||0));return true;}
   if(acao==='lista'){await atualizar(i,lista(g.id,Number(id)||0));return true;}
   if(acao==='abrir'&&i.isStringSelectMenu()){const item=store.obter(g.id)[i.values[0]!];if(!item)throw Error('Agendamento não encontrado.');await atualizar(i,detalhe(g.id,item));return true;}
   if(acao==='ver'){if(!j)throw Error('Agendamento não encontrado.');await atualizar(i,detalhe(g.id,j));return true;}
   if(['salvarnovo','novoproduto','salvar'].includes(acao??'')&&i.isModalSubmit()){
    const produto=acao==='novoproduto'?vendas.obter(g.id).produtos[id!]:j?.produto?vendas.obter(g.id).produtos[j.produto]:undefined;
    const tipo=acao==='novoproduto'?'produto':j?.tipo??'aviso';if(tipo==='produto'&&(!produto||!produto.ativo))throw Error('Produto indisponível.');
    const quando=dataAgendada(i.fields.getTextInputValue('data').trim()),intervalo=intervaloAgendado(i.fields.getTextInputValue('intervalo').trim(),tipo),titulo=tipo==='aviso'?i.fields.getTextInputValue('titulo').trim():produto!.nome.slice(0,80),texto=tipo==='aviso'?i.fields.getTextInputValue('texto').trim():'',imagem=tipo==='aviso'?i.fields.getTextInputValue('imagem').trim():'';
    let item:Agendamento;
    if(acao==='salvar'){if(!j||j.versao!==Number(versao)||j.estado==='executando')throw Error('A configuração mudou. Abra o item novamente.');item=store.mudar(g.id,j.id,x=>{Object.assign(x,{quando,intervalo,titulo,texto,imagem,estado:'rascunho',erro:'',tentativa:null});});}
    else item=store.criar(g.id,{tipo,produto:produto?.id??null,titulo,texto,imagem,quando,intervalo,ator:i.user.id});
    await atualizar(i,detalhe(g.id,item));return true;
   }
   if(!j||j.versao!==Number(versao)||j.estado==='executando')throw Error('Esta tela mudou ou o envio está em execução. Abra o item novamente.');
   if(acao==='canal'&&i.isChannelSelectMenu()){
    if(j.estado==='ativo')throw Error('Pause antes de trocar o canal.');const ch=await canal(g,i.values[0]!);const item=store.mudar(g.id,j.id,x=>{x.canal=ch.id;x.estado='rascunho';});await atualizar(i,detalhe(g.id,item));return true;
   }
   if(acao==='ativar'||acao==='agora'){
    await canal(g,j.canal);if(acao==='agora'&&(j.tipo!=='produto'||j.intervalo))throw Error('Atualização imediata está disponível para anúncio sem repetição.');
    const item=store.ativar(g.id,j.id,j.versao,acao==='agora');
    if(acao==='agora')await executar(g,j.id);
    await atualizar(i,detalhe(g.id,store.obter(g.id)[item.id]!));return true;
   }
   if(acao==='pausar'){const item=store.mudar(g.id,j.id,x=>{x.estado='pausado';});await atualizar(i,detalhe(g.id,item));return true;}
   if(acao==='remover'){await atualizar(i,view(g.id,'Remover agendamento',`Remover **${seguro(j.titulo,80)}**? Mensagens já enviadas não serão apagadas.`,[row(btn('excluir:'+j.id+':'+j.versao,'Confirmar remoção','confirmar')),back()]));return true;}
   if(acao==='excluir'){store.remover(g.id,j.id,j.versao);await atualizar(i,lista(g.id));return true;}
   throw Error('Opção indisponível. Reabra Avisos e anúncios.');
  }catch(err){if(i.isRepliable())await atualizar(i,view(i.guildId??'',e('erro')+' Não foi possível concluir',seguro(err instanceof Error?err.message:'Confira a configuração e tente novamente.')));return true;}
 }
 return{tratar,tick,executar,home,store,parar:()=>clearInterval(timer)};
}

