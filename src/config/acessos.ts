import {existsSync,readFileSync,mkdirSync,writeFileSync,renameSync} from 'node:fs';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {ActionRowBuilder,ButtonBuilder,ButtonStyle,ContainerBuilder,MessageFlags,RoleSelectMenuBuilder,TextDisplayBuilder,UserSelectMenuBuilder,type Interaction,type GuildMember} from 'discord.js';
import {arquivoDados,contextoAtual} from './contexto-bot.js';

type Permissoes={vinculo:string;revisao:string;usuarios:string[];cargos:string[];completos?:string[]};
type Alvo={guildId?:string|null;guild?:{id:string;ownerId?:string}|null;user?:{id:string;bot?:boolean};memberPermissions?:{has:(p:bigint)=>boolean}|null;member?:unknown};
const idValido=(id:unknown):id is string=>typeof id==='string'&&/^\d{17,20}$/.test(id);
const vinculo=(guild:string)=>contextoAtual()?.vinculoAcessos?.(guild)??'principal';

export function criarStoreAcessos(arquivo=arquivoDados('acessos.json')){
 function ler():Record<string,Permissoes>{
  if(!existsSync(arquivo))return {};
  const dados=JSON.parse(readFileSync(arquivo,'utf8')) as Record<string,Permissoes>;
  if(!dados||typeof dados!=='object'||Array.isArray(dados))throw Error('Arquivo de acessos inválido.');
  for(const [g,d]of Object.entries(dados))if(!idValido(g)||!d||typeof d.vinculo!=='string'||typeof d.revisao!=='string'||![d.usuarios,d.cargos,d.completos??[]].every(a=>Array.isArray(a)&&a.length<=25&&a.every(idValido)&&new Set(a).size===a.length))throw Error('Arquivo de acessos inválido.');
  return dados;
 }
 function obter(guild:string):Permissoes{const d=ler()[guild],v=vinculo(guild);return structuredClone(d?.vinculo===v?{...d,completos:d.completos??[]}:{vinculo:v,revisao:'0',usuarios:[],cargos:[],completos:[]});}
 function salvar(guild:string,tipo:'usuarios'|'cargos'|'completos',ids:string[],revisao:string,esperado:string){
  if(!idValido(guild)||!Array.isArray(ids)||ids.length>25||!ids.every(idValido)||new Set(ids).size!==ids.length||ids.includes(guild))throw Error('Seleção de acessos inválida.');
  const dados=ler(),d=obter(guild);
  if(d.revisao!==revisao||d.vinculo!==esperado)throw Error('Este painel ficou desatualizado. Reabra Gerenciar acessos.');
  dados[guild]={...d,[tipo]:[...ids],revisao:randomUUID()};
  mkdirSync(dirname(arquivo),{recursive:true});writeFileSync(arquivo+'.tmp',JSON.stringify(dados,null,2),{mode:0o600});renameSync(arquivo+'.tmp',arquivo);
  return obter(guild);
 }
 return{obter,salvar};
}

export function podeGerenciarAcessos(i:Alvo):boolean{
 const g=i.guildId??i.guild?.id,u=i.user?.id,ctx=contextoAtual();
 if(!g||!u||i.user?.bot||ctx&&!ctx.permitirGuild(g))return false;
 if(ctx?.responsavelAcessos)return ctx.responsavelAcessos(g,u);
 return ctx?.podeIdentidade(u)===true||u===i.guild?.ownerId;
}
export function delegado(i:Alvo):boolean{
 const g=i.guildId??i.guild?.id,u=i.user?.id,ctx=contextoAtual();
 if(!g||!u||!ctx||i.user?.bot||!ctx.permitirGuild(g))return false;
 const d=criarStoreAcessos().obter(g),m=i.member as {roles?:string[]|{cache?:{has:(id:string)=>boolean}}}|undefined;
 const roles=m?.roles;
 return d.usuarios.includes(u)||d.cargos.some(r=>r!==g&&(Array.isArray(roles)?roles.includes(r):roles?.cache?.has(r)===true));
}
export function acessoCompleto(i:Alvo):boolean{
 const g=i.guildId??i.guild?.id,u=i.user?.id,ctx=contextoAtual();
 if(!g||!u||!ctx||i.user?.bot||!ctx.permitirGuild(g))return false;
 return podeGerenciarAcessos(i)||criarStoreAcessos().obter(g).completos?.includes(u)===true;
}
export function podeConfigurar(i:Alvo):boolean{
 const g=i.guildId??i.guild?.id,ctx=contextoAtual();
 if(!g||i.user?.bot||ctx&&!ctx.permitirGuild(g))return false;
 return podeGerenciarAcessos(i)||delegado(i)||acessoCompleto(i);
}
export function membroPodeConfigurar(m:GuildMember):boolean{return podeConfigurar({guild:m.guild,user:m.user,member:m,memberPermissions:m.permissions});}

export function instalarAcessos(cor:(id:string|null)=>number){
 const store=criarStoreAcessos();
 function painel(g:string,nota=''){
  const d=store.obter(g),p=new ContainerBuilder().setAccentColor(cor(g));
  p.addTextDisplayComponents(new TextDisplayBuilder().setContent('## Gerenciar acessos\n'+nota+'\nEscolha quem pode configurar este bot e o Painel de Vendas neste servidor. Não é necessário dar Administrador no Discord.\n\nSó o comprador/responsável pode mudar esta lista. A permissão completa permite alterar a identidade do bot individual, mas não revela credenciais nem libera recuperação exclusiva do dono.\n\n**Membros:** '+(d.usuarios.map(u=>'<@'+u+'>').join(', ')||'Nenhum')+'\n**Cargos:** '+(d.cargos.map(r=>'<@&'+r+'>').join(', ')||'Nenhum')+'\n**Acesso completo:** '+(d.completos?.map(u=>'<@'+u+'>').join(', ')||'Nenhum')+'\n\nCada seleção substitui a lista correspondente (até 25). Deixe vazia para remover todos os acessos daquela lista.'));
  const users=new UserSelectMenuBuilder().setCustomId('ac:usuarios:'+d.revisao).setPlaceholder('Escolher membros autorizados').setMinValues(0).setMaxValues(25);
  const roles=new RoleSelectMenuBuilder().setCustomId('ac:cargos:'+d.revisao).setPlaceholder('Escolher cargos autorizados').setMinValues(0).setMaxValues(25);
  if(d.usuarios.length)users.setDefaultUsers(d.usuarios);if(d.cargos.length)roles.setDefaultRoles(d.cargos);
  p.addActionRowComponents(new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(users));
  p.addActionRowComponents(new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(roles));
  p.addActionRowComponents(new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(new UserSelectMenuBuilder().setCustomId('ac:completos:'+d.revisao).setPlaceholder('Permissão administrativa completa').setMinValues(0).setMaxValues(25).setDefaultUsers(...(d.completos??[]))));
  p.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('anzy:inicio').setLabel('Menu principal').setStyle(ButtonStyle.Secondary)));
  return{components:[p],flags:MessageFlags.IsComponentsV2 as const,allowedMentions:{parse:[] as const}};
 }
 async function tratar(i:Interaction){
  if(!('customId'in i)||!i.customId.startsWith('ac:')||!i.isRepliable())return false;
  try{
   if(!i.guildId||!i.guild||!podeGerenciarAcessos(i))throw Error('Somente o comprador/responsável deste bot pode gerenciar os acessos.');
   const g=i.guildId,[,acao,revisao]=i.customId.split(':'),antes=store.obter(g);
   if(acao!=='inicio'&&!(acao==='usuarios'&&i.isUserSelectMenu())&&!(acao==='completos'&&i.isUserSelectMenu())&&!(acao==='cargos'&&i.isRoleSelectMenu()))throw Error('Opção de acesso inválida.');
   await i.deferUpdate();
   if(acao==='usuarios'&&i.isUserSelectMenu()){
    for(const id of i.values){const m=await i.guild.members.fetch(id);if(m.user.bot)throw Error('Escolha pessoas, não bots.');}
    if(!podeGerenciarAcessos(i))throw Error('O responsável pelo bot mudou. Reabra o painel.');
    store.salvar(g,'usuarios',i.values,revisao??'',antes.vinculo);
   }
   if(acao==='cargos'&&i.isRoleSelectMenu()){
    for(const id of i.values){const r=await i.guild.roles.fetch(id);if(!r||r.id===g||r.managed)throw Error('Escolha cargos do servidor; @everyone e cargos de integrações não são permitidos.');}
    if(!podeGerenciarAcessos(i))throw Error('O responsável pelo bot mudou. Reabra o painel.');
    store.salvar(g,'cargos',i.values,revisao??'',antes.vinculo);
   }
   if(acao==='completos'&&i.isUserSelectMenu()){
    for(const id of i.values){const m=await i.guild.members.fetch(id);if(m.user.bot)throw Error('Escolha pessoas, não bots.');}
    if(!podeGerenciarAcessos(i))throw Error('O responsável pelo bot mudou. Reabra o painel.');
    store.salvar(g,'completos',i.values,revisao??'',antes.vinculo);
   }
   await i.editReply(painel(g,acao==='inicio'?'':'Acessos salvos. A remoção vale nas próximas ações.'));return true;
  }catch(err){const content=err instanceof Error?err.message:'Não foi possível alterar os acessos.';if(i.deferred||i.replied)await i.followUp({content,flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});else await i.reply({content,flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});return true;}
 }
 return{tratar,painel,store};
}

