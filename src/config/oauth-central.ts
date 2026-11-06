import {servirTranscript} from './transcripts-web.js';
import {createServer,type Server} from 'node:http';
type Rota={callback:(url:URL)=>Promise<string>;host:string;port:number};
const rotas=new Map<string,Rota>();let servidor:Server|undefined,iniciando:Promise<void>|undefined,porta:number|undefined,host:string|undefined;
export async function registrarOAuthCentral(op:{clientId:string;host:string;port:number},callback:(url:URL)=>Promise<string>){
 if(rotas.has(op.clientId))throw Error('OAuth2 deste bot já está registrado.');
 if(porta!==undefined&&(porta!==op.port||host!==op.host))throw Error('Todos os bots devem usar a mesma porta OAuth2.');
 porta=op.port;host=op.host;const rota={callback,host:op.host,port:op.port};rotas.set(op.clientId,rota);
 try{
  if(!servidor){
   servidor=createServer((req,res)=>{
    res.setHeader('Content-Type','text/plain; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
    if(req.method!=='GET'||!req.url||req.url.length>4096){res.writeHead(400).end('Requisição inválida.');return;}
    const url=new URL(req.url,'http://localhost');if(servirTranscript(url,res))return;if(url.pathname==='/health'){res.end('Anzy Programs online.');return;}
    if(url.pathname!=='/oauth/callback'){res.writeHead(404).end('Página não encontrada.');return;}
    const state=url.searchParams.get('state')??'',id=state.split('.')[0]??'',destino=rotas.get(id);
    if(!/^\d{17,20}\.[a-f0-9]{64}$/.test(state)||!destino){res.writeHead(400).end('Link inválido ou expirado. Gere outro com /verify.');return;}
    void destino.callback(url).then(s=>res.end(s)).catch(()=>res.writeHead(400).end('Não foi possível concluir a autorização. Gere outro link com /verify e confira a conta e as permissões solicitadas.'));
   });servidor.requestTimeout=20000;servidor.headersTimeout=15000;
   iniciando=new Promise<void>((ok,erro)=>{servidor!.once('error',erro);servidor!.listen(op.port,op.host,()=>{servidor!.removeListener('error',erro);servidor!.on('error',()=>console.error('Servidor OAuth2 compartilhado indisponível.'));ok();});});servidor.unref();
  }
  await iniciando;
 }catch(e){rotas.delete(op.clientId);if(!rotas.size){servidor?.close();servidor=undefined;iniciando=undefined;porta=undefined;host=undefined;}throw e;}
 return()=>{if(rotas.get(op.clientId)===rota)rotas.delete(op.clientId);};
}
export async function pararOAuthCentral(){rotas.clear();const s=servidor;servidor=undefined;iniciando=undefined;porta=undefined;host=undefined;if(s)await new Promise<void>(r=>s.close(()=>r()));}
