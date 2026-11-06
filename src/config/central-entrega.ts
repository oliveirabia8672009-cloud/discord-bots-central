import {disponivelParaVenda} from './central-politica.js';
import {createHash} from 'node:crypto';
import {ActionRowBuilder,ButtonBuilder,ButtonStyle,ChannelType,EmbedBuilder,PermissionFlagsBits as P,type Client} from 'discord.js';
import type {GerenteCentral} from '../central.js';
import type {RegistroCentral} from './central-store.js';
import {itensDoPedido,type criarStoreVendas} from './vendas-store.js';
import {noContexto,type ContextoBot} from './contexto-bot.js';
import {emojiTexto as e,emojiComponente as ec} from './emojis.js';
export function instalarDistribuicaoBots(bot:Client,store:ReturnType<typeof criarStoreVendas>,registro:RegistroCentral,gerente:GerenteCentral,ctx:ContextoBot,automatico=true,concluido?: (g:any,o:any)=>Promise<void>,atualizarProduto?: (guild:string,produto:string)=>Promise<number>){
 let ocupado=false,parado=false;const tentativas=new Map<string,number>(),vitrinesAtualizadas=new Map<string,string>();
 async function tick(){
  if(ocupado||parado||!bot.isReady())return;ocupado=true;
  try{
   let bots=await registro.listar();
   const guild=bot.guilds.cache.get(gerente.controle);if(!guild)return;
   for(const o of Object.values(store.obter(guild.id).pedidos)){
    if(o.estado==='reembolsado'){
     for(const b of Object.values(bots).filter(x=>x.venda?.guildLoja===guild.id&&x.venda.pedido===o.id&&x.estado!=='suspenso')){const novo=await registro.alterar(b.id,x=>{x.estado='suspenso';x.ativo=false;});gerente.adotar(novo);bots[b.id]=novo;}continue;
    }
    if(o.estado!=='aprovado')continue;
    for(const item of itensDoPedido(o).filter(i=>i.botEstoque&&!i.entregue)){
     const chave=guild.id+':'+o.id+':'+item.id;
     if((tentativas.get(chave)??0)>Date.now())continue;
     let aguardandoAtivacao=false;
     try{
      if(item.quantidade!==1)throw Error('Um bot por item.');
      let b=await registro.reservar(guild.id,o.id,o.cliente,item.produto,item.id);if(item.planoBot&&!b.venda?.planoInicial)b=await registro.alterar(b.id,x=>{if(x.venda?.pedido!==o.id||x.venda.item!==item.id)throw Error('Vínculo divergente.');x.venda.planoInicial=structuredClone(item.planoBot!);});gerente.adotar(b);bots[b.id]=b;
      if(b.venda?.entregue){if(!item.entregue){const pedido=store.entregarItem(guild.id,o.id,item.id,'central-bots');if(pedido.entregue)await concluido?.(guild,pedido);}continue;}
      if(gerente.online&&!gerente.online(b.id)){aguardandoAtivacao=true;await gerente.atualizar();if(!gerente.online(b.id))throw Error('Ativação do bot pendente.');aguardandoAtivacao=false;}
      tentativas.set(chave,Date.now()+300000);
      let destino: {send:Function;messages?:any}|null=null;
      if(item.entrega==='ticket'&&o.ticket){const ch=await guild.channels.fetch(o.ticket).catch(()=>null);if(ch&&ch.type===ChannelType.GuildText&&!ch.permissionsFor(guild.roles.everyone)?.has(P.ViewChannel)&&ch.permissionsFor(o.cliente)?.has(P.ViewChannel))destino=ch;}
      if(!destino)destino=await(await bot.users.fetch(o.cliente)).createDM();
      const nonce=createHash('sha256').update('central:'+chave).digest('hex').slice(0,24);
      const anteriores=await destino.messages?.fetch({limit:30}).catch(()=>null);
      const jaEnviado=anteriores?.some((m:any)=>m.author?.id===bot.user?.id&&m.components?.some((row:any)=>row.components?.some((c:any)=>c.customId==='cb:ativar:'+b.id)));
      if(!jaEnviado)await destino.send({embeds:[new EmbedBuilder().setColor(0x5865f2).setTitle(e('sucesso')+' Seu bot foi liberado').setDescription(`**Pedido:** ${o.id}\n**Bot:** ${b.nome}\n\n${e('categoria')} Clique em **Ativar meu bot**.\n${e('categoria')} Informe o ID do seu servidor.\n${e('categoria')} Receba o convite e configure com **/configbot**.\n\nEste bot é exclusivo da sua compra. Nenhum token será enviado.`)],components:[new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('cb:ativar:'+b.id).setLabel('Ativar meu bot').setEmoji(ec('confirmar')).setStyle(ButtonStyle.Primary))],nonce,enforceNonce:true,allowedMentions:{parse:[]}});
      const novo=await registro.alterar(b.id,x=>{if(x.venda?.pedido!==o.id||x.venda.item!==item.id)throw Error('Vínculo alterado.');x.venda.entregue=Date.now();});gerente.adotar(novo);bots[b.id]=novo;
      if(!item.entregue){const pedido=store.entregarItem(guild.id,o.id,item.id,'central-bots');if(pedido.entregue)await concluido?.(guild,pedido);}
      tentativas.delete(chave);
     }catch{tentativas.set(chave,Date.now()+(aguardandoAtivacao?15000:300000));console.warn('Entrega de bot pendente para pedido '+o.id+'. Confira estoque e DM/ticket; o comprador também pode usar /mybots.');}
    }
   }
   // Approved orders are assigned before publishing the remaining available stock.
   const loja=store.obter(guild.id);
   for(const p of Object.values(loja.produtos).filter(p=>p.botEstoque)){
    const n=Object.values(bots).filter(b=>disponivelParaVenda(b)&&b.produto?.guild===guild.id&&b.produto.id===p.id).length;
    if(p.estoque!==n)store.centralProduto(guild.id,p.id,n);
    const assinatura=JSON.stringify([n,p.ativo,p.preco,p.nome,p.descricao,p.imagem,p.entrega,p.publicacoes]);
    if(atualizarProduto&&vitrinesAtualizadas.get(p.id)!==assinatura){
     try{const falhas=await atualizarProduto(guild.id,p.id);if(!falhas)vitrinesAtualizadas.set(p.id,assinatura);else console.warn('Atualização da vitrine de bots pendente; nova tentativa automática.');}catch{console.warn('Atualização da vitrine de bots pendente; confira as permissões.');}
    }
   }
  }catch{console.warn('Distribuição de bots aguarda conexão com a central. Nenhum vínculo foi reutilizado.');}
  finally{ocupado=false;}
 }
 const timer=automatico?setInterval(()=>{void noContexto(ctx,tick);},15000):null;timer?.unref();if(automatico)void noContexto(ctx,tick);
 return{tick,parar:async()=>{parado=true;if(timer)clearInterval(timer);while(ocupado)await new Promise(r=>setTimeout(r,20));}};
}
