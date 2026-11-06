import {arquivoDados} from './contexto-bot.js';
import {existsSync,readFileSync,mkdirSync,writeFileSync,renameSync} from 'node:fs';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,createHash} from 'node:crypto';
export type Agendamento={limpezaEstoque?:string[];estoqueDinamico?:boolean;assinaturaEstoque?:string;linkEstoque?:string;id:string;tipo:'aviso'|'produto';produto:string|null;canal:string|null;titulo:string;texto:string;imagem:string;quando:number;intervalo:number;estado:'rascunho'|'ativo'|'pausado'|'concluido'|'erro'|'executando';versao:number;criado:number;ator:string;erro:string;tentativa:{quando:number;nonce:string}|null;historico:{quando:number;mensagem:string;resultado:string}[]};
export function dataAgendada(s:string,agora=Date.now()){
 if(!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s))throw Error('Use AAAA-MM-DD HH:mm, no horário de São Paulo.');
 const n=Date.parse(s.replace(' ','T')+':00-03:00');if(!Number.isFinite(n)||new Date(n-10800000).toISOString().slice(0,16).replace('T',' ')!==s)throw Error('Data ou horário inexistente.');
 if(n<agora+30000||n>agora+365*86400000)throw Error('Escolha um horário pelo menos 1 minuto à frente, dentro de 1 ano.');return n;
}
export function intervaloAgendado(s:string,tipo:'aviso'|'produto'){
 if(!/^\d+$/.test(s))throw Error('Informe o intervalo em minutos; use 0 para enviar uma vez.');const n=Number(s),min=tipo==='aviso'?15:60;
 if(n!==0&&(n<min||n>10080))throw Error(`Intervalo: 0 (uma vez) ou de ${min} a 10080 minutos.`);return n;
}
export function proximaExecucao(quando:number,intervalo:number,agora=Date.now()){return intervalo?quando+(Math.floor(Math.max(0,agora-quando)/(intervalo*60000))+1)*intervalo*60000:quando;}
export function criarStoreAgendamentos(arquivo=arquivoDados('agendamentos-loja.json')){
 let dados:Record<string,Record<string,Agendamento>>=existsSync(arquivo)?JSON.parse(readFileSync(arquivo,'utf8')):{};
 const obter=(g:string)=>structuredClone(dados[g]??{});
 function alterar<T>(g:string,fn:(d:Record<string,Agendamento>)=>T){const d=obter(g),r=fn(d),novos={...dados,[g]:d};mkdirSync(dirname(arquivo),{recursive:true});writeFileSync(arquivo+'.tmp',JSON.stringify(novos,null,2));renameSync(arquivo+'.tmp',arquivo);dados=novos;return structuredClone(r);}
 function validar(j:Agendamento){
  if(!['aviso','produto'].includes(j.tipo)||!j.titulo.trim()||j.titulo.length>80||j.texto.length>2500||j.tipo==='aviso'&&!j.texto.trim()||j.imagem.length>1000||!Number.isSafeInteger(j.quando)||j.quando<0)throw Error('Dados do agendamento inválidos.');
  intervaloAgendado(String(j.intervalo),j.tipo);
  if(j.imagem){let u:URL;try{u=new URL(j.imagem);}catch{throw Error('Link de imagem inválido.');}if(u.protocol!=='https:'||u.username||u.password)throw Error('Use um link HTTPS sem usuário ou senha para a imagem.');}
 }
 return{obter,ids:()=>Object.keys(dados),
 criar:(g:string,campos:Pick<Agendamento,'tipo'|'produto'|'titulo'|'texto'|'imagem'|'quando'|'intervalo'|'ator'>)=>alterar(g,d=>{
  if(Object.keys(d).length>=100)throw Error('Limite de 100 agendamentos. Remova os antigos antes de criar novos.');
  const j:Agendamento={...campos,id:randomBytes(8).toString('hex'),canal:null,estado:'rascunho',versao:1,criado:Date.now(),erro:'',tentativa:null,historico:[]};validar(j);d[j.id]=j;return j;
 }),
 mudar:(g:string,id:string,fn:(j:Agendamento)=>void)=>alterar(g,d=>{const j=d[id];if(!j)throw Error('Agendamento não encontrado.');fn(j);validar(j);j.versao++;return j;}),
 ativar:(g:string,id:string,versao:number,agora=false)=>alterar(g,d=>{const j=d[id];if(!j||j.versao!==versao)throw Error('Essa tela mudou. Abra o agendamento novamente.');if(['executando','ativo'].includes(j.estado)||!j.canal)throw Error('Agendamento indisponível ou sem canal.');if(Object.values(d).filter(x=>x.estado==='ativo').length>=30)throw Error('Limite de 30 agendamentos ativos por servidor.');if(agora){if(j.tipo!=='produto'||j.intervalo)throw Error('Atualização imediata exige um anúncio sem repetição.');j.quando=Date.now();}else if(j.quando<Date.now()+30000)throw Error('O horário passou. Edite a data antes de ativar.');j.estado='ativo';j.tentativa=null;j.erro='';j.versao++;return j;}),
 assumir:(g:string,id:string,agora=Date.now())=>alterar(g,d=>{const j=d[id];if(!j||j.estado!=='ativo'||j.quando>agora)return null;
  if(!j.intervalo&&agora-j.quando>86400000){j.estado='erro';j.erro='O horário venceu há mais de 24 horas. Confira o conteúdo e escolha uma nova data.';j.versao++;return null;}
  j.estado='executando';j.tentativa={quando:j.quando,nonce:createHash('sha256').update(g+':'+j.id+':'+j.quando).digest('hex').slice(0,24)};j.versao++;return j;
 }),
 finalizar:(g:string,id:string,mensagem:string,agora=Date.now())=>alterar(g,d=>{const j=d[id];if(!j||j.estado!=='executando'||!j.tentativa)throw Error('Execução não está pendente.');j.historico.push({quando:agora,mensagem,resultado:'Concluído'});j.historico=j.historico.slice(-10);j.quando=proximaExecucao(j.tentativa.quando,j.intervalo,agora);j.estado=j.intervalo?'ativo':'concluido';j.tentativa=null;j.erro='';j.versao++;return j;}),
 falhar:(g:string,id:string,erro:string)=>alterar(g,d=>{const j=d[id];if(!j)return;j.estado='erro';j.erro=erro.slice(0,400);j.versao++;}),
 remover:(g:string,id:string,versao:number)=>alterar(g,d=>{const j=d[id];if(!j||j.versao!==versao||j.estado==='executando')throw Error('O agendamento mudou ou está em execução. Abra a tela novamente.');delete d[id];}),
 };
}
