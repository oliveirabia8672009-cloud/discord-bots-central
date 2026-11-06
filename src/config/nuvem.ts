import {arquivoDados,ambienteBot} from './contexto-bot.js';
import {intervaloBot} from './contexto-bot.js';
import {existsSync,lstatSync,readdirSync,readFileSync,mkdirSync,writeFileSync,renameSync,rmSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,createCipheriv,createDecipheriv,createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';

const LIMITE=20*1024*1024, MODULO='backup_arquivos_v1';
export const pastaDados=fileURLToPath(new URL('../../data',import.meta.url));
type Arquivo={nome:string;conteudo:string};
type Copia={versao:1;bot:string;arquivos:Arquivo[]};
type Envelope={versao:1;cifrado:string;hash:string;criado:string};
type Registro={payload:Envelope;revision:number};
type Opcoes={modulo?:string;url:string;secret:string;chave:Buffer;bot:string;pasta:string};
const nomeSeguro=(s:string)=>s.length<240&&/^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+$/.test(s)&&!s.split('/').some(p=>p==='.'||p==='..'||p.startsWith('.'))&&(s==='seguranca/chave-local'||/\.(json|html|enc|access)$/.test(s));
export function configNuvem(env:NodeJS.ProcessEnv=ambienteBot(),pasta=arquivoDados()):Opcoes|null{
  if(env.ANZY_CLOUD_BACKUP!=='true')return null;
  const url=env.SUPABASE_URL??'',secret=env.SUPABASE_SECRET_KEY??'',bot=env.DISCORD_CLIENT_ID??'',hex=env.ANZY_BACKUP_KEY??'';
  const u=new URL(url);
  if(u.protocol!=='https:'||!u.hostname.endsWith('.supabase.co')||u.pathname!=='/'||u.search||u.hash||u.username||u.password||!secret||!/^\d{17,20}$/.test(bot)||!/^([a-f0-9]{64})$/i.test(hex))throw Error('Configuração de cópia em nuvem incompleta ou inválida.');
  const modulo=env.ANZY_BACKUP_MODULE??MODULO;if(!/^backup_arquivos_v1(?:_[a-f0-9]{32})?$/.test(modulo))throw Error('Namespace da cópia inválido.');
  return{modulo,url:u.origin,secret,chave:Buffer.from(hex,'hex'),bot,pasta:resolve(pasta)};
}
export function coletarArquivos(pasta:string):Arquivo[]{
  const arquivos:Arquivo[]=[];let bytes=0;
  function visitar(dir:string,prefixo=''){
    if(!existsSync(dir))return;
    if(lstatSync(dir).isSymbolicLink())throw Error('A pasta de dados não pode ser um link.');
    for(const nome of readdirSync(dir).sort()){
      const caminho=join(dir,nome),s=lstatSync(caminho),rel=prefixo+nome;
      if(s.isSymbolicLink())throw Error('Link encontrado na pasta de dados.');
      if(s.isDirectory()){if(prefixo===''&&['bots','bots-arquivados'].includes(nome))continue;visitar(caminho,rel+'/');continue;}
      if(!s.isFile()||rel.endsWith('.tmp'))continue;
      if(!nomeSeguro(rel))throw Error('Arquivo não previsto na pasta de dados.');
      if(arquivos.length>=1000||bytes+s.size>LIMITE)throw Error('Cópia acima do limite: 1000 arquivos ou 20 MB.');
      const b=readFileSync(caminho);bytes+=b.length;arquivos.push({nome:rel,conteudo:b.toString('base64')});
    }
  }
  visitar(pasta);return arquivos;
}
function validar(c:Copia,bot:string){
  if(c.versao!==1||c.bot!==bot||!Array.isArray(c.arquivos)||c.arquivos.length>1000)throw Error('Cópia incompatível com este bot.');
  const nomes=new Set<string>();let total=0;
  for(const a of c.arquivos){
    if(typeof a.nome!=='string'||!nomeSeguro(a.nome)||nomes.has(a.nome)||typeof a.conteudo!=='string'||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(a.conteudo))throw Error('Arquivo de recuperação inválido.');
    nomes.add(a.nome);const b=Buffer.from(a.conteudo,'base64');total+=b.length;if(total>LIMITE)throw Error('Cópia acima de 20 MB.');
    if(a.nome.endsWith('.json'))JSON.parse(b.toString('utf8'));
    if(a.nome==='seguranca/chave-local'&&b.length!==32)throw Error('Chave OAuth2 inválida na cópia.');
  }
}
export function cifrarCopia(c:Copia,chave:Buffer):Envelope{
  validar(c,c.bot);const raw=Buffer.from(JSON.stringify(c)),iv=randomBytes(12),enc=createCipheriv('aes-256-gcm',chave,iv);
  const cifrado=Buffer.concat([iv,enc.update(gzipSync(raw)),enc.final(),enc.getAuthTag()]).toString('base64');
  return{versao:1,cifrado,hash:createHash('sha256').update(raw).digest('hex'),criado:new Date().toISOString()};
}
export function abrirCopia(e:Envelope,chave:Buffer,bot:string):Copia{
  if(e.versao!==1||typeof e.cifrado!=='string'||e.cifrado.length>40*1024*1024)throw Error('Cópia em nuvem inválida.');
  const b=Buffer.from(e.cifrado,'base64');if(b.length<29)throw Error('Cópia truncada.');
  const dec=createDecipheriv('aes-256-gcm',chave,b.subarray(0,12));dec.setAuthTag(b.subarray(-16));
  const raw=gunzipSync(Buffer.concat([dec.update(b.subarray(12,-16)),dec.final()]),{maxOutputLength:30*1024*1024});
  if(createHash('sha256').update(raw).digest('hex')!==e.hash)throw Error('Integridade da cópia inválida.');
  const c=JSON.parse(raw.toString('utf8')) as Copia;validar(c,bot);return c;
}
export function restaurarCopia(c:Copia,pasta:string,bot:string){
  validar(c,bot);
  if(existsSync(pasta)&&(lstatSync(pasta).isSymbolicLink()||readdirSync(pasta).length))throw Error('Restauração permitida apenas em pasta vazia.');
  mkdirSync(pasta,{recursive:true});
  // Validate everything before writing; undo only files created by this attempt on failure.
  const criados:string[]=[];
  try{for(const a of c.arquivos){const p=join(pasta,...a.nome.split('/'));mkdirSync(dirname(p),{recursive:true});writeFileSync(p,Buffer.from(a.conteudo,'base64'),{flag:'wx',mode:0o600});criados.push(p);}}
  catch(err){for(const p of criados)rmSync(p,{force:true});throw err;}
}
export function criarCopiaNuvem(op:Opcoes,http:typeof fetch=fetch){
  const modulo=op.modulo??MODULO;
  const base=op.url+'/rest/v1/anzy_bot_state',filtro='?bot_id=eq.'+op.bot+'&module=eq.'+modulo;
  const headers={apikey:op.secret,'Content-Type':'application/json'};
  let revision:number|null=null,ultimoHash='',ocupado=false,conflito=false;
  async function ler():Promise<Registro|null>{
    const r=await http(base+filtro+'&select=payload,revision',{headers,signal:AbortSignal.timeout(20000)});
    if(!r.ok)throw Error('Não foi possível ler a cópia no Supabase.');const dados=await r.json() as Registro[];
    if(!Array.isArray(dados)||dados.length>1)throw Error('Resposta de recuperação inválida.');return dados[0]??null;
  }
  async function preparar(restaurar=false){
    const remoto=await ler();revision=remoto?.revision??null;
    if(remoto){const c=abrirCopia(remoto.payload,op.chave,op.bot);if(restaurar){restaurarCopia(c,op.pasta,op.bot);ultimoHash=remoto.payload.hash;}}
    else if(restaurar)throw Error('Não há cópia deste bot para restaurar.');
  }
  async function salvar(){
    if(ocupado)return false;if(conflito)throw Error('Conflito na cópia: outra instância alterou o mesmo bot.');ocupado=true;
    try{
      const c:Copia={versao:1,bot:op.bot,arquivos:coletarArquivos(op.pasta)};
      if(!c.arquivos.length)throw Error('Pasta de dados vazia: cópia anterior preservada.');
      const payload=cifrarCopia(c,op.chave);if(payload.hash===ultimoHash)return false;
      const proxima=(revision??0)+1,body=revision===null?{bot_id:op.bot,module:modulo,payload,revision:proxima,updated_at:new Date().toISOString()}:{payload,revision:proxima,updated_at:new Date().toISOString()};
      const r=await http(base+(revision===null?'':filtro+'&revision=eq.'+revision),{method:revision===null?'POST':'PATCH',headers:{...headers,Prefer:'return=representation'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
      if(r.status===409){conflito=true;throw Error('Cópia alterada por outra instância.');}
      if(!r.ok)throw Error('Não foi possível atualizar a cópia no Supabase.');
      const recebidos=await r.json() as Registro[];if(!Array.isArray(recebidos)||recebidos.length!==1){conflito=true;throw Error('Conflito ao atualizar a cópia.');}
      revision=proxima;ultimoHash=payload.hash;return true;
    }finally{ocupado=false;}
  }
  return{preparar,salvar,ler};
}
export async function iniciarCopiaNuvem(env:NodeJS.ProcessEnv=ambienteBot()){
  const op=configNuvem(env);if(!op)return;
  if(env.RAILWAY_ENVIRONMENT_ID&&env.RAILWAY_VOLUME_MOUNT_PATH!=='/app/data')throw Error('Monte um volume permanente em /app/data antes de iniciar o bot no Railway.');
  const nuvem=criarCopiaNuvem(op),vazia=!existsSync(op.pasta)||readdirSync(op.pasta).length===0;
  await nuvem.preparar(env.ANZY_RESTORE_IF_EMPTY==='true'&&vazia);
  if(vazia&&env.ANZY_RESTORE_IF_EMPTY!=='true')throw Error('Pasta vazia: restaure os dados antes de iniciar o bot.');
  await nuvem.salvar();
  const timer=intervaloBot(()=>{void nuvem.salvar().catch(()=>console.error('Cópia Supabase pendente. Dados preservados no volume local; confira conexão e instâncias duplicadas.'));},30000);timer.unref();
  console.log('Cópia criptografada Supabase ativa; armazenamento principal no volume local.');
}
