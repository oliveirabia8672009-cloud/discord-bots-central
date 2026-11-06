import {ChannelType,PermissionFlagsBits as P,type Guild} from 'discord.js';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {type StoreSeguranca,type MudancaVerificacao} from './seguranca-store.js';
export function instalarVerificacao(store:StoreSeguranca,dataDir:string){
  const ocupados=new Set<string>();
  function salvar(g:string,p:Partial<ReturnType<typeof store.obter>['config']['verificacao']>){store.configurar(g,{verificacao:{...store.obter(g).config.verificacao,...p}});}
  async function cargo(g:Guild,validarAcessosIniciais=true){
    const c=store.obter(g.id).config,v=c.verificacao;
    const r=v.cargo?await g.roles.fetch(v.cargo):null,me=await g.members.fetchMe();
    if(!r||r.id===g.id||r.managed||r.permissions.bitfield!==0n||c.cargos.includes(r.id))throw Error('Escolha um cargo exclusivo de verificação, sem permissões gerais e fora dos cargos staff protegidos.');
    if(!me.permissions.has(P.ManageRoles)||me.roles.highest.comparePositionTo(r)<=0)throw Error('O bot precisa de Gerenciar cargos e cargo acima do cargo Verificado.');
    const arq=join(dataDir,'outros.json');if(existsSync(arq)&&JSON.parse(readFileSync(arq,'utf8'))[g.id]?.autoRole===r.id)throw Error('O cargo Verificado não pode ser o cargo automático de entrada.');
    // This is an activation precondition, not an invariant of an already active role.
    // After activation the owner can intentionally give Verificado access to new channels.
    // Reapplying this scan during OAuth rejects that configured role without changing access.
    if(validarAcessosIniciais){
      const cs=await g.channels.fetch(),protegidos=new Set(v.mudancas.map(x=>x.canal));
      for(const ch of cs.values())if(ch&&ch.type!==ChannelType.GuildCategory&&!protegidos.has(ch.id)&&!ch.permissionsFor(g.roles.everyone)?.has(P.ViewChannel)&&ch.permissionsFor(r)?.has(P.ViewChannel))throw Error('Esse cargo já libera um canal privado. Crie um cargo Verificado exclusivo, sem acessos anteriores.');
    }
    return r;
  }
  const valor=(c:any,id:string):boolean|null=>{const p=c.permissionOverwrites.cache.get(id);return p?.allow.has(P.ViewChannel)?true:p?.deny.has(P.ViewChannel)?false:null;};
  async function planejar(g:Guild){
    const cfg=store.obter(g.id).config.verificacao;if(cfg.ativo||cfg.mudancas.length)throw Error('Desative e restaure a verificação anterior antes de mudar a configuração.');
    const r=await cargo(g),cs=await g.channels.fetch(),entrada=cfg.canal?cs.get(cfg.canal):null,me=await g.members.fetchMe();
    if(!entrada||entrada.type!==ChannelType.GuildText||!entrada.permissionsFor(g.roles.everyone)?.has(P.ViewChannel))throw Error('Escolha um canal de verificação de texto que já seja visível para @everyone.');
    if(!entrada.permissionsFor(me)?.has([P.ViewChannel,P.SendMessages,P.EmbedLinks]))throw Error('O bot precisa publicar mensagens no canal de verificação.');
    const mudancas:MudancaVerificacao[]=[],nomes:string[]=[],privados:string[]=[],avisos:string[]=[];
    for(const c of cs.values()){
      if(!c||!('permissionOverwrites'in c))continue;
      if(c.id===entrada.id)continue;
      if(!c.permissionsFor(g.roles.everyone)?.has(P.ViewChannel)){privados.push(c.id);continue;}
      // Keep the verification channel's category visible; all other public children are gated individually.
      if(c.id===entrada.parentId)continue;
      if(!c.permissionsFor(me)?.has([P.ManageRoles,P.ManageChannels]))throw Error(`O bot precisa gerenciar as permissões de ${c.name}.`);
      if(c.permissionOverwrites.cache.some(o=>o.id!==g.id&&o.id!==r.id&&o.type===0&&o.deny.has(P.ViewChannel)))throw Error(`O canal ${c.name} restringe a visualização para outro cargo. Revise essas permissões antes de aplicar, para não ampliar acessos indevidos.`);
      if(c.permissionOverwrites.cache.some(o=>o.id!==g.id&&o.id!==r.id&&o.allow.has(P.ViewChannel)))avisos.push(c.name);
      nomes.push(c.name);mudancas.push({canal:c.id,alvo:g.id,antes:valor(c,g.id),depois:false},{canal:c.id,alvo:r.id,antes:valor(c,r.id),depois:true});
    }
    // Exclude categories from mutation: synced/private children remain independent and cannot be exposed by a category edit.
    const finais=mudancas.filter(m=>cs.get(m.canal)?.type!==ChannelType.GuildCategory);
    const assinatura=createHash('sha256').update(JSON.stringify([cfg.canal,cfg.cargo,finais])).digest('hex');
    return{mudancas:finais,assinatura,nomes:nomes.filter(n=>[...cs.values()].some(c=>c?.name===n&&c.type!==ChannelType.GuildCategory)),privados:privados.length,avisos:[...new Set(avisos)]};
  }
  async function restaurarInterno(g:Guild){
    let restantes=[...store.obter(g.id).config.verificacao.mudancas];salvar(g.id,{ativo:false});
    // Restore children only; change only ViewChannel, leaving all other permissions untouched.
    for(const m of [...restantes].reverse()){
      const c=await g.channels.fetch(m.canal).catch(err=>{if(err?.code===10003)return null;throw err;});
      if(!c){restantes=restantes.filter(x=>x!==m);salvar(g.id,{mudancas:restantes});continue;}
      if(!('permissionOverwrites'in c))continue;
      const atual=valor(c,m.alvo);
      if(atual!==m.depois&&atual!==m.antes)continue;
      if(atual!==m.antes)await c.permissionOverwrites.edit(m.alvo,{ViewChannel:m.antes},{reason:'Desativação da verificação: restaurar permissão anterior.'});
      restantes=restantes.filter(x=>x!==m);salvar(g.id,{mudancas:restantes});
    }
    return restantes.length;
  }
  async function aplicar(g:Guild,assinatura:string){
    if(ocupados.has(g.id))throw Error('Configuração de verificação em andamento.');ocupados.add(g.id);
    try{
      const plano=await planejar(g);if(plano.assinatura!==assinatura)throw Error('As permissões mudaram. Confira uma nova prévia antes de aplicar.');
      if(!plano.mudancas.length)throw Error('Nenhum canal público para proteger.');
      salvar(g.id,{mudancas:plano.mudancas,ativo:false});
      try{
        for(const m of plano.mudancas){const c=await g.channels.fetch(m.canal);if(!c||!('permissionOverwrites'in c))throw Error('Um canal ficou indisponível.');await c.permissionOverwrites.edit(m.alvo,{ViewChannel:m.depois},{reason:'Verificação + OAuth2 configurada pelo dono.'});}
        salvar(g.id,{ativo:true});return plano;
      }catch{let pendentes=plano.mudancas.length;try{pendentes=await restaurarInterno(g);}catch{/* Journal is retained for a safe retry. */}throw Error(pendentes?'Aplicação interrompida. Há permissões pendentes de restauração; use Desativar e restaurar antes de tentar novamente.':'Aplicação interrompida e permissões anteriores restauradas. Confira o bot e tente novamente.');}
    }finally{ocupados.delete(g.id);}
  }
  async function desativar(g:Guild){if(ocupados.has(g.id))throw Error('Configuração em andamento.');ocupados.add(g.id);try{return await restaurarInterno(g);}finally{ocupados.delete(g.id);}}
  async function concluir(g:Guild,u:string){
    const c=store.obter(g.id).config.verificacao;if(!c.ativo)return '';
    // Only grant the role already selected by the owner; never edit channel permissions here.
    const r=await cargo(g,false),m=await g.members.fetch({user:u,force:true});
    if(m.pending)throw Error('Conclua primeiro a triagem de membros do Discord e verifique novamente.');
    if(!store.obter(g.id).config.verificacao.ativo)throw Error('A verificação foi desativada durante a solicitação.');
    if(!m.roles.cache.has(r.id))await m.roles.add(r,'Verificação concluída pela conta autorizada via OAuth2.');
    const confirmado=await g.members.fetch({user:u,force:true});
    if(!confirmado.roles.cache.has(r.id))throw Error('O cargo de verificação não permaneceu no membro. Peça à equipe para conferir as permissões e outras automações de cargos.');
    return 'Verificação concluída! O cargo de acesso configurado foi confirmado na sua conta. As permissões dos canais não foram alteradas.';
  }
  return{salvar,cargo,planejar,aplicar,desativar,concluir};
}
