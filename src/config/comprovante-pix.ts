import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,readdirSync,renameSync,statSync,unlinkSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {createWorker} from 'tesseract.js';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {arquivoDados} from './contexto-bot.js';
import {cofre} from './seguranca-store.js';
import {coletarArquivos} from './nuvem.js';

export type AnalisePix={resultado:'aparentemente compatível'|'requer análise manual'|'divergente';motivos:string[];valor?:number|undefined;data?:string|undefined;destinatario?:string|undefined;instituicao?:string|undefined;identificador?:string|undefined;status?:string|undefined;hash:string};
const require=createRequire(import.meta.url);
const normalizar=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
export function analisarTextoPix(texto:string,esperado:number,titular:string,hash=''):AnalisePix{
  const linhas=texto.slice(0,20000).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const achar=(re:RegExp)=>linhas.map(l=>l.match(re)).find(Boolean)?.[1]?.trim();
  const quantia=achar(/(?:valor(?:\s+(?:pago|da transa[cç][aã]o))?|total)\s*[:\-]?\s*R?\$?\s*([\d.]+,\d{2})/i)??achar(/R\$\s*([\d.]+,\d{2})/i);
  const valor=quantia?Math.round(Number(quantia.replace(/\./g,'').replace(',','.'))*100):undefined;
  const data=achar(/(?:data(?:\s+e\s+hora)?|realizado em)\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4}(?:\s+(?:às\s*)?\d{2}:\d{2})?)/i);
  const destinatario=achar(/(?:recebedor|destinat[aá]rio|benefici[aá]rio|para)\s*[:\-]\s*(.{3,100})/i);
  const instituicao=achar(/(?:institui[cç][aã]o|banco)\s*[:\-]\s*(.{3,80})/i);
  const identificador=texto.match(/\bE[0-9A-Za-z]{32}\b/)?.[0]??achar(/(?:id(?: da transa[cç][aã]o)?|identificador)\s*[:\-]\s*([A-Za-z0-9-]{12,80})/i);
  const motivos:string[]=[];let divergente=false;
  if(/comprovante\s+sint[eé]tico|sem\s+transfer[eê]ncia\s+real|documento\s+de\s+exemplo/i.test(texto))motivos.push('Documento demonstrativo ou sem transferência real.');
  const status=texto.match(/\b(agendad[oa]|pendente|cancelad[oa]|estornad[oa]|conclu[ií]d[oa]|efetuad[oa]|realizad[oa])\b/i)?.[0];
  if(/\b(agendad[oa]|pendente)\b/i.test(texto))motivos.push('Operação agendada ou pendente; conferir manualmente.');
  if(/\b(cancelad[oa]|estornad[oa])\b/i.test(texto)){motivos.push('Comprovante indica operação cancelada ou estornada.');divergente=true;}
  if(valor===undefined||!Number.isSafeInteger(valor))motivos.push('Valor não identificado.');else if(valor!==esperado){motivos.push('Valor diferente do pedido.');divergente=true;}
  if(!data)motivos.push('Data e hora não identificadas.');
  if(!destinatario)motivos.push('Destinatário não identificado.');else if(titular&&normalizar(destinatario)!==normalizar(titular)){motivos.push('Destinatário diferente do titular configurado.');divergente=true;}
  if(!identificador)motivos.push('Identificador da transação não identificado.');
  return {resultado:divergente?'divergente':motivos.length?'requer análise manual':'aparentemente compatível',motivos,valor,data,destinatario,instituicao,identificador,status,hash};
}
export function tipoComprovante(nome:string,bytes:Buffer){if(bytes.length<12||bytes.length>5*1024*1024)throw Error('Envie um arquivo de até 5 MB.');const n=nome.toLowerCase();if(n.endsWith('.pdf')&&bytes.subarray(0,5).toString()==='%PDF-')return 'pdf';if(n.endsWith('.png')&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'imagem';if(/\.jpe?g$/.test(n)&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'imagem';if(n.endsWith('.webp')&&bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP')return 'imagem';throw Error('Use uma imagem PNG, JPG, WEBP ou PDF válido.');}
export async function baixarComprovante(url:string,tamanho:number){const u=new URL(url);if(u.protocol!=='https:'||!['cdn.discordapp.com','media.discordapp.net'].includes(u.hostname)||!/^\/(?:attachments|ephemeral-attachments)\/\d+\/\d+\//.test(u.pathname)||tamanho>5*1024*1024)throw Error('Anexo inválido.');const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Não foi possível obter o anexo.');if(!r.body)throw Error('Anexo vazio.');const partes:Buffer[]=[];let total=0;for await(const parte of r.body){const b=Buffer.from(parte);total+=b.length;if(total>5*1024*1024)throw Error('Anexo acima do limite de 5 MB.');partes.push(b);}if(total!==tamanho)throw Error('Tamanho do anexo inválido.');return Buffer.concat(partes);}
let ocupado=false;
export async function analisarArquivoPix(nome:string,bytes:Buffer,esperado:number,titular:string){if(ocupado)throw Error('A análise está ocupada. Tente novamente em instantes.');ocupado=true;try{const tipo=tipoComprovante(nome,bytes);let texto='';if(tipo==='pdf'){const tarefa=getDocument({data:new Uint8Array(bytes),useSystemFonts:false});try{const pdf=await tarefa.promise;if(pdf.numPages>3)throw Error('Envie um comprovante com até 3 páginas.');for(let p=1;p<=pdf.numPages;p++){const pagina=await pdf.getPage(p);const conteudo=await pagina.getTextContent();texto+=conteudo.items.map(x=>'str'in x?x.str+('hasEOL'in x&&x.hasEOL?'\n':' '):'').join('')+'\n';}}finally{await tarefa.destroy();}}else{const langPath=(require('@tesseract.js-data/por') as {langPath:string}).langPath;const worker=await createWorker('por',1,{langPath,cacheMethod:'none'});try{texto=(await worker.recognize(bytes)).data.text;}finally{await worker.terminate();}}return analisarTextoPix(texto,esperado,titular,createHash('sha256').update(bytes).digest('hex'));}finally{ocupado=false;}}
const pasta=()=>arquivoDados('comprovantes-pix');
const caminho=(guild:string,pedido:string)=>{if(!/^\d{15,25}$/.test(guild)||!/^[a-f0-9-]{8,40}$/i.test(pedido))throw Error('Referência de comprovante inválida.');return join(pasta(),guild,pedido+'.enc');};
export function guardarComprovante(guild:string,pedido:string,nome:string,bytes:Buffer){const arquivo=caminho(guild,pedido),criptografado=cofre().cifrar({nome:nome.slice(0,100),dados:bytes.toString('base64')});mkdirSync(join(pasta(),guild),{recursive:true});for(const item of readdirSync(join(pasta(),guild))){const antigo=join(pasta(),guild,item);if(item.endsWith('.enc')&&Date.now()-statSync(antigo).mtimeMs>30*86400000)unlinkSync(antigo);}const usados=coletarArquivos(arquivoDados()).reduce((n,a)=>n+Buffer.from(a.conteudo,'base64').length,0),atual=existsSync(arquivo)?statSync(arquivo).size:0;if(usados-atual+Buffer.byteLength(criptografado)>16*1024*1024)throw Error('Armazenamento seguro de comprovantes cheio. Avise a equipe e use a conferência manual.');writeFileSync(arquivo+'.tmp',criptografado,{mode:0o600});renameSync(arquivo+'.tmp',arquivo);}
export function lerComprovante(guild:string,pedido:string){const arquivo=caminho(guild,pedido);if(!existsSync(arquivo))throw Error('Arquivo do comprovante indisponível ou expirado.');const dado=cofre().abrir<{nome:string;dados:string}>(readFileSync(arquivo,'utf8'));return {nome:dado.nome,bytes:Buffer.from(dado.dados,'base64')};}
