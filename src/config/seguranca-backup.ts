import {existsSync,readFileSync,readdirSync,unlinkSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {ChannelType,PermissionFlagsBits as P,type Guild} from 'discord.js';
import {escreverAtomico,cofre,type StoreSeguranca} from './seguranca-store.js';
export type Snapshot={versao:1;id:string;guild:string;nome:string;criado:number;roles:{id:string;name:string;color:number;permissions:string;hoist:boolean;mentionable:boolean;managed:boolean}[];channels:{id:string;name:string;type:number;parent:string|null;position:number;topic:string|null;nsfw:boolean;rateLimitPerUser:number;bitrate:number;userLimit:number;overwrites:{id:string;type:number;allow:string;deny:string}[]}[]};
const perigosas=P.Administrator|P.ManageGuild|P.ManageRoles|P.ManageChannels|P.BanMembers|P.KickMembers|P.ManageWebhooks|P.ModerateMembers|P.MentionEveryone;
export function instalarBackups(store:StoreSeguranca,dataDir:string){
  const pasta=join(store.pasta,'backups'),travas=new Set<string>();
  const caminho=(g:string,id:string,sufixo='.json')=>{if(!/^\d{17,20}$/.test(g)||!/^\d{13}-[a-f0-9]{8}$/.test(id))throw Error('Identificador de backup inválido.');return join(pasta,g+'-'+id+sufixo);};
  function listar(g:string){if(!existsSync(pasta))return[];return readdirSync(pasta).filter(f=>f.startsWith(g+'-')&&f.endsWith('.json')&&!f.endsWith('.map.json')).map(f=>JSON.parse(readFileSync(join(pasta,f),'utf8')) as Snapshot).filter(x=>x.guild===g&&x.versao===1).sort((a,b)=>b.criado-a.criado).slice(0,7);}
  const ler=(g:string,id:string):Snapshot=>{const x=JSON.parse(readFileSync(caminho(g,id),'utf8')) as Snapshot;if(x.versao!==1||x.guild!==g||x.id!==id)throw Error('Backup inválido.');return x;};
  async function criar(g:Guild){
    if(travas.has(g.id))throw Error('Um backup ou restauração está em andamento.');travas.add(g.id);
    try{
      const channels=await g.channels.fetch(),roles=await g.roles.fetch();
      const x:Snapshot={versao:1,id:Date.now()+'-'+randomBytes(4).toString('hex'),guild:g.id,nome:g.name,criado:Date.now(),roles:roles.map(r=>({id:r.id,name:r.name,color:r.color,permissions:r.permissions.bitfield.toString(),hoist:r.hoist,mentionable:r.mentionable,managed:r.managed})),channels:channels.filter(c=>c!==null).map(c=>({id:c!.id,name:c!.name,type:c!.type,parent:c!.parentId,position:c!.rawPosition,topic:'topic'in c!?c!.topic:null,nsfw:'nsfw'in c!?c!.nsfw:false,rateLimitPerUser:'rateLimitPerUser'in c!?(c!.rateLimitPerUser??0):0,bitrate:'bitrate'in c!?c!.bitrate:64000,userLimit:'userLimit'in c!?c!.userLimit:0,overwrites:'permissionOverwrites'in c!?c!.permissionOverwrites.cache.map(o=>({id:o.id,type:o.type,allow:o.allow.bitfield.toString(),deny:o.deny.bitfield.toString()})):[]}))};
      // Private local copy includes only this guild's bot data; never .env or OAuth credentials.
      const locais:Record<string,unknown>={};for(const nome of ['vendas','tickets','outros','cores','moderacao','agendamentos-loja','membros']){const arq=join(dataDir,nome+'.json');if(existsSync(arq)){const raw=JSON.parse(readFileSync(arq,'utf8'));if(raw[g.id]!==undefined)locais[nome]=raw[g.id];}}
      escreverAtomico(caminho(g.id,x.id,'.local.enc'),{cifrado:cofre(store.pasta).cifrar(locais)});
      escreverAtomico(caminho(g.id,x.id),x);
      store.configurar(g.id,{ultimoBackup:x.criado,proximaTentativa:0});
      const antigos=readdirSync(pasta).filter(f=>f.startsWith(g.id+'-')&&/^\d+-\d{13}-[a-f0-9]{8}\.json$/.test(f)).sort().reverse().slice(7);
      for(const f of antigos){for(const s of ['','.local.enc','.map.json']){const arq=s?join(pasta,f.slice(0,-5)+s):join(pasta,f);if(existsSync(arq))unlinkSync(arq);}}
      return x;
    }finally{travas.delete(g.id);}
  }
  async function restaurar(g:Guild,id:string){
    if(travas.has(g.id))throw Error('Um backup ou restauração está em andamento.');travas.add(g.id);
    try{
      const x=ler(g.id,id),me=await g.members.fetchMe();if(!me.permissions.has([P.ManageChannels,P.ManageRoles]))throw Error('O bot precisa de Gerenciar canais e Gerenciar cargos.');
      const channels=await g.channels.fetch(),roles=await g.roles.fetch(),arquivo=caminho(g.id,id,'.map.json');
      const map:Record<string,string>=existsSync(arquivo)?JSON.parse(readFileSync(arquivo,'utf8')):{};map[g.id]=g.id;
      const salvar=()=>escreverAtomico(arquivo,map);let cargos=0,canais=0,ignorados=0;
      for(const r of x.roles){
        if(roles.has(r.id)){map[r.id]=r.id;continue;}
        if(map[r.id]&&roles.has(map[r.id]!))continue;
        if(r.managed||r.id===g.id||(BigInt(r.permissions)&perigosas)!==0n){ignorados++;continue;}
        const novo=await g.roles.create({name:r.name,color:r.color,permissions:BigInt(r.permissions),hoist:r.hoist,mentionable:r.mentionable,reason:'Recuperação de estrutura solicitada pelo dono.'});map[r.id]=novo.id;roles.set(novo.id,novo);cargos++;salvar();
      }
      const ordenados=[...x.channels].sort((a,b)=>(a.type===ChannelType.GuildCategory?-1:0)-(b.type===ChannelType.GuildCategory?-1:0)||a.position-b.position);
      for(const c of ordenados){
        if(channels.has(c.id)){map[c.id]=c.id;continue;}
        if(map[c.id]&&channels.has(map[c.id]!))continue;
        if(![ChannelType.GuildCategory,ChannelType.GuildText,ChannelType.GuildVoice].includes(c.type)){ignorados++;continue;}
        if(c.parent&&!map[c.parent]){ignorados++;continue;}
        if(c.overwrites.some(o=>o.type===0&&!map[o.id])){ignorados++;continue;}
        const overwrites=c.overwrites.map(o=>({id:o.type===0?map[o.id]!:o.id,type:o.type,allow:BigInt(o.allow),deny:BigInt(o.deny)}));
        const novo=await g.channels.create({name:c.name,type:c.type as ChannelType.GuildText,parent:c.parent?map[c.parent]!:null,permissionOverwrites:overwrites,position:c.position,...(c.type===ChannelType.GuildText?{...(c.topic?{topic:c.topic}:{}),nsfw:c.nsfw,rateLimitPerUser:c.rateLimitPerUser}:{}),...(c.type===ChannelType.GuildVoice?{bitrate:Math.min(c.bitrate,g.maximumBitrate),userLimit:c.userLimit}:{}),reason:'Recuperação de itens ausentes solicitada pelo dono.'});
        map[c.id]=novo.id;channels.set(novo.id,novo);canais++;salvar();
      }
      salvar();return{cargos,canais,ignorados};
    }finally{travas.delete(g.id);}
  }
  return{criar,listar,ler,restaurar,exportar:(g:string,id:string)=>{const b=Buffer.from(JSON.stringify(ler(g,id),null,2));if(b.length>7_500_000)throw Error('Backup grande demais para exportar pelo Discord. Use a cópia local.');return b;},integridade:(g:string,id:string)=>createHash('sha256').update(readFileSync(caminho(g,id))).digest('hex')};
}



