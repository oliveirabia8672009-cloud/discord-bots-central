import {arquivoDados,contextoAtual} from './contexto-bot.js';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import type {ServerResponse} from 'node:http';
const pasta=fileURLToPath(new URL('../../data/transcripts',import.meta.url));
export function linkTranscript(id:string,dir=arquivoDados('transcripts'),redirect=process.env.ANZY_OAUTH_REDIRECT_URI):string|null{
 if(!redirect||!/^\d{17,20}$/.test(id))return null;
 const base=new URL(redirect);if(base.protocol!=='https:')return null;
 const file=join(dir,id+'.access');let key=existsSync(file)?readFileSync(file,'utf8'):'';
 if(!/^[a-f0-9]{64}$/.test(key)){key=randomBytes(32).toString('hex');writeFileSync(file,key,{mode:0o600});}
 return new URL('/transcripts/'+(contextoAtual()&&!contextoAtual()!.principal?'bot/'+contextoAtual()!.id+'/':'')+id+'/'+key,base).href;
}
export function servirTranscript(url:URL,res:ServerResponse,dir=pasta,arquivados=join(pasta,'..','bots-arquivados')):boolean{
 if(!url.pathname.startsWith('/transcripts/'))return false;
 const child=/^\/transcripts\/bot\/(\d{17,20})(\/.*)$/.exec(url.pathname);if(child){dir=join(pasta,'..','bots',child[1]!,'transcripts');url=new URL(url);url.pathname='/transcripts'+child[2];}
 res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Robots-Tag','noindex, nofollow');
 res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
 const m=/^\/transcripts\/(\d{17,20})\/([a-f0-9]{64})(\/download)?$/.exec(url.pathname);
 try{
  if(!m)throw Error();const candidatos=[dir];if(child){const base=join(arquivados,child[1]!);if(existsSync(base))for(const id of readdirSync(base).filter(x=>/^[a-f0-9]{32}$/.test(x)))candidatos.push(join(base,id,'transcripts'));}
  for(const pasta of candidatos)try{const key=readFileSync(join(pasta,m[1]+'.access'),'utf8');if(key.length!==64||!timingSafeEqual(Buffer.from(key),Buffer.from(m[2]!)))continue;const html=readFileSync(join(pasta,m[1]+'.html'));if(m[3])res.setHeader('Content-Disposition','attachment; filename="ticket-'+m[1]+'.html"');res.setHeader('Content-Type','text/html; charset=utf-8');res.writeHead(200).end(html);return true;}catch{}
 }catch{}res.writeHead(404).end('Transcrição não encontrada ou link inválido.');return true;
}
