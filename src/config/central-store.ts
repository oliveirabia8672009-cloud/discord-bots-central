import {disponivelParaVenda,LIMITE_ESTOQUE} from './central-politica.js';
import type {PreparacaoReuso,ArquivoClienteBot} from './reuso-bots.js';
import {validarAssinatura,type AssinaturaBot,type PlanoRenovacao} from './renovacoes-store.js';
import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
export type BotEstoque={nomeOriginal?:string;backupModulo?:string;reuso?:PreparacaoReuso;arquivos?:ArquivoClienteBot[];assinatura?:AssinaturaBot;id:string;nome:string;token:string;secret:string;chave:string;ativo:boolean;iniciado:boolean;estado:'teste'|'disponivel'|'reservado'|'vendido'|'suspenso';criado:number;produto?:{guild:string;id:string};venda?:{pedido:string;comprador:string;guildLoja:string;planoInicial?:PlanoRenovacao;guildDestino?:string;ativadoEm?:number;item:string;entregue?:number}};
type Dados={versao:1;bots:Record<string,BotEstoque>};
const modulo='central_bots_v1';
const idValido=(id:string)=>/^\d{17,20}$/.test(id);
function validar(d:Dados){
 if(d.versao!==1||!d.bots||typeof d.bots!=='object'||Array.isArray(d.bots)||Object.keys(d.bots).length>LIMITE_ESTOQUE)throw Error('Registro central inválido.');
 for(const [id,b]of Object.entries(d.bots)){
  if(id!==b.id||!idValido(id)||typeof b.nome!=='string'||b.nome.length>80||typeof b.token!=='string'||!b.token||typeof b.secret!=='string'||!b.secret||!/^[a-f0-9]{64}$/.test(b.chave)||typeof b.ativo!=='boolean'||typeof b.iniciado!=='boolean'||!['teste','disponivel','reservado','vendido','suspenso'].includes(b.estado))throw Error('Cadastro de bot inválido.');
  if(b.produto&&(!idValido(b.produto.guild)||!b.produto.id))throw Error('Produto de bot inválido.');
  if(b.nomeOriginal!==undefined&&(typeof b.nomeOriginal!=='string'||!b.nomeOriginal.trim()||b.nomeOriginal.length>80))throw Error('Nome original inválido.');
  if(b.backupModulo&&!/^backup_arquivos_v1_[a-f0-9]{32}$/.test(b.backupModulo)||b.reuso&&!/^[a-f0-9]{32}$/.test(b.reuso.id)||b.arquivos&&(!Array.isArray(b.arquivos)||b.arquivos.length>20))throw Error('Arquivo de cliente inválido.');
  if(b.assinatura)validarAssinatura(b.assinatura);
  if(b.venda&&(!idValido(b.venda.comprador)||!idValido(b.venda.guildLoja)||b.venda.guildDestino&&!idValido(b.venda.guildDestino)))throw Error('Vínculo de bot inválido.');
 }
}
export function criarRegistroCentral(env:NodeJS.ProcessEnv,http:typeof fetch=fetch){
 const bot=env.DISCORD_CLIENT_ID??'',url=env.SUPABASE_URL??'',secret=env.SUPABASE_SECRET_KEY??'',hex=env.ANZY_BACKUP_KEY??'';
 const u=new URL(url);if(!idValido(bot)||u.protocol!=='https:'||!u.hostname.endsWith('.supabase.co')||!secret||!/^[a-f0-9]{64}$/i.test(hex))throw Error('Configure Supabase e chave da central.');
 const chave=Buffer.from(hex,'hex'),aad=Buffer.from('anzy-central-v1:'+bot),endpoint=u.origin+'/rest/v1/anzy_bot_state',filtro='?bot_id=eq.'+bot+'&module=eq.'+modulo,headers={apikey:secret,'Content-Type':'application/json'};
 let fila=Promise.resolve();
 const cifrar=(dados:Dados)=>{validar(dados);const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',chave,iv);c.setAAD(aad);const payload={versao:1,cifrado:Buffer.concat([iv,c.update(JSON.stringify(dados),'utf8'),c.final(),c.getAuthTag()]).toString('base64')};if(payload.cifrado.length>2000000)throw Error('O registro central atingiu o limite de tamanho. Exporte os históricos antigos antes de continuar.');return payload;};
 function abrir(payload:{versao:number;cifrado:string}){if(payload.versao!==1||typeof payload.cifrado!=='string'||payload.cifrado.length>2000000)throw Error('Registro central cifrado inválido.');const b=Buffer.from(payload.cifrado,'base64');if(b.length<29)throw Error('Registro central truncado.');const c=createDecipheriv('aes-256-gcm',chave,b.subarray(0,12));c.setAAD(aad);c.setAuthTag(b.subarray(-16));const d=JSON.parse(Buffer.concat([c.update(b.subarray(12,-16)),c.final()]).toString('utf8')) as Dados;validar(d);return d;}
 async function ler(){const r=await http(endpoint+filtro+'&select=payload,revision',{headers,signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Central indisponível no Supabase.');const a=await r.json() as {payload:{versao:number;cifrado:string};revision:number}[];if(!Array.isArray(a)||a.length>1)throw Error('Resposta central inválida.');if(!a.length)return{dados:{versao:1,bots:{}} as Dados,revisao:null as number|null};const row=a[0]!;if(!Number.isSafeInteger(row.revision)||row.revision<1)throw Error('Revisão central inválida.');return{dados:abrir(row.payload),revisao:row.revision};}
 async function transacao<T>(fn:(d:Dados)=>T):Promise<T>{
  const executar=async()=>{for(let tentativa=0;tentativa<4;tentativa++){
   const {dados,revisao}=await ler(),resultado=fn(dados),payload=cifrar(dados),next=(revisao??0)+1;
   const body=revisao===null?{bot_id:bot,module:modulo,payload,revision:next,updated_at:new Date().toISOString()}:{payload,revision:next,updated_at:new Date().toISOString()};
   const r=await http(endpoint+(revisao===null?'':filtro+'&revision=eq.'+revisao),{method:revisao===null?'POST':'PATCH',headers:{...headers,Prefer:'return=representation'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
   if(r.status===409)continue;if(!r.ok)throw Error('Não foi possível salvar a central.');const a=await r.json() as unknown[];if(Array.isArray(a)&&a.length===1)return structuredClone(resultado);
  }throw Error('Central alterada por outra operação; tente novamente.');};
  const p=fila.then(executar);fila=p.then(()=>{},()=>{});return p;
 }
 return{
  listar:async()=>structuredClone((await ler()).dados.bots),
  adicionar:(b:BotEstoque)=>transacao(d=>{if(b.id===bot||d.bots[b.id])throw Error('Este bot já está cadastrado ou é o principal.');if(Object.keys(d.bots).length>=LIMITE_ESTOQUE)throw Error('Limite de 50 bots de clientes cadastrados. Reutilize um cadastro antes de adicionar outro.');d.bots[b.id]=structuredClone(b);}),
  alterar:(id:string,fn:(b:BotEstoque)=>void)=>transacao(d=>{const b=d.bots[id];if(!b)throw Error('Bot não encontrado.');fn(b);return b;}),
  reservar:(guild:string,pedido:string,comprador:string,produto:string,item:string)=>transacao(d=>{
   const anterior=Object.values(d.bots).find(b=>b.venda?.guildLoja===guild&&b.venda.pedido===pedido&&b.venda.item===item);
   if(anterior){if(anterior.venda!.comprador!==comprador)throw Error('Comprador divergente.');return anterior;}
   const b=Object.values(d.bots).find(b=>disponivelParaVenda(b)&&b.produto?.guild===guild&&b.produto.id===produto);
   if(!b)throw Error('Nenhum bot disponível para este produto.');b.estado='reservado';b.ativo=true;b.venda={guildLoja:guild,pedido,comprador,item};return b;
  }),
  vincular:(id:string,comprador:string,guild:string)=>transacao(d=>{const b=d.bots[id];if(!idValido(guild)||b?.reuso||!b?.venda||b.venda.comprador!==comprador||!['reservado','vendido'].includes(b.estado))throw Error('Bot não liberado para este comprador.');if(b.venda.guildDestino&&b.venda.guildDestino!==guild)throw Error('Este bot já está vinculado a outro servidor.');if(!b.venda.guildDestino)b.venda.ativadoEm??=Date.now();b.venda.guildDestino=guild;b.estado='vendido';return b;}),
 };
}
export type RegistroCentral=ReturnType<typeof criarRegistroCentral>;
export async function validarCredencialBot(id:string,token:string,http:typeof fetch=fetch){
 if(!idValido(id)||!token)throw Error('ID ou token ausente.');const r=await http('https://discord.com/api/v10/oauth2/applications/@me',{headers:{Authorization:'Bot '+token},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('O Discord recusou o token do bot.');const app=await r.json() as {id:string;name:string;flags?:number;redirect_uris?:string[]};if(app.id!==id)throw Error('O token não pertence ao ID informado.');return app;
}
export function novoBot(id:string,nome:string,token:string,secret:string):BotEstoque{if(!secret||secret.length>300)throw Error('Client Secret inválido.');return{id,nome:nome.slice(0,80),nomeOriginal:nome.slice(0,80),token,secret,chave:randomBytes(32).toString('hex'),ativo:false,iniciado:false,estado:'teste',criado:Date.now()};}

export async function validarParaEstoque(id:string,token:string,controle:string,redirect?:string,http:typeof fetch=fetch){
 const app=await validarCredencialBot(id,token,http);if(!app.flags||!(app.flags&((1<<14)|(1<<15))))throw Error('Ative Server Members Intent na aba Bot do Developer Portal.');if(redirect&&!app.redirect_uris?.includes(redirect))throw Error('Cadastre o retorno OAuth2 da central no aplicativo antes de disponibilizar.');const r=await http('https://discord.com/api/v10/guilds/'+controle,{headers:{Authorization:'Bot '+token},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Adicione o bot ao servidor da central pelo botão de convite. Ele pode continuar offline no estoque.');return app;
}
