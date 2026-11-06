import {randomInt} from 'node:crypto';
export type AcaoAnime='hug'|'highfive'|'pat'|'wave'|'happy'|'sad'|'laugh'|'dance';
export type GifAnime={url:string;anime:string};
const categorias:Record<AcaoAnime,string>={hug:'hug',highfive:'highfive',pat:'pat',wave:'wave',happy:'happy',sad:'cry',laugh:'laugh',dance:'dance'};
export function criarFonteGifs(http:typeof fetch=fetch){
 const pools=new Map<string,GifAnime[]>(),ultimos=new Map<string,GifAnime>(),carregando=new Map<string,Promise<void>>(),falhouAte=new Map<string,number>();
 async function carregar(categoria:string){
  try{
   const r=await http('https://nekos.best/api/v2/'+categoria+'?amount=6',{headers:{'User-Agent':'AnzyPrograms (https://discord.gg/eAy2XQr7qc)'},signal:AbortSignal.timeout(4000)});
   if(!r.ok)throw Error('Serviço indisponível');const raw=await r.text();if(raw.length>100000)throw Error('Resposta inválida');const dados=JSON.parse(raw) as {results?:{url?:unknown;anime_name?:unknown}[]};
   if(!Array.isArray(dados.results))throw Error('Resposta inválida');const gifs:GifAnime[]=[];
   for(const v of dados.results.slice(0,20)){
    if(typeof v.url!=='string')continue;const u=new URL(v.url);
    if(u.protocol!=='https:'||u.hostname!=='nekos.best'||u.username||u.password||u.search||u.hash||!new RegExp('^/api/v2/'+categoria+'/[a-zA-Z0-9-]{16,80}\\.gif$').test(u.pathname)||gifs.some(g=>g.url===u.href))continue;
    gifs.push({url:u.href,anime:typeof v.anime_name==='string'?v.anime_name.replace(/[\r\n]/g,' ').slice(0,100):''});
   }
   if(!gifs.length)throw Error('Nenhum GIF válido');pools.set(categoria,gifs);
  }catch{falhouAte.set(categoria,Date.now()+30000);}
 }
 return{async buscar(acao:AcaoAnime):Promise<GifAnime|null>{
  const categoria=categorias[acao];if(!categoria)return null;
  if(!pools.get(categoria)?.length&&(falhouAte.get(categoria)??0)<Date.now()){
   let tarefa=carregando.get(categoria);if(!tarefa){tarefa=carregar(categoria);carregando.set(categoria,tarefa);}
   try{await tarefa;}finally{if(carregando.get(categoria)===tarefa)carregando.delete(categoria);}
  }
  const pool=pools.get(categoria)??[],ultimo=ultimos.get(categoria);const alternativas=pool.filter(g=>g.url!==ultimo?.url);const escolha=alternativas.length?alternativas[randomInt(alternativas.length)]:pool[0];
  if(escolha){pool.splice(pool.indexOf(escolha),1);ultimos.set(categoria,escolha);return escolha;}
  return ultimo??null;
 }};
}
export function textoAnime(acao:AcaoAnime,autor:string,alvo?:string,junto=false){
 const a='<@'+autor+'>',b=alvo?'<@'+alvo+'>':'',escolhas:Record<AcaoAnime,{titulo:string;textos:string[];botao:string}>={
  hug:{titulo:'Um abraço daqueles! 💜',textos:[`${a} puxou ${b} para um abraço bem apertado! 🤗\nTem dias que um abraço diz tudo. ✨`,`${a} entregou um abraço quentinho para ${b}! 💕\nRecarregando as energias em 3… 2… 1…`,`${b}, chegou um abraço especial de ${a}! 🫂\nPode guardar esse carinho para o resto do dia. 💜`],botao:'Retribuir abraço'},
  highfive:{titulo:'Bate aqui! 🙌',textos:[`${a} levantou a mão e ${b} não deixou no vácuo! 🙌\nDupla de milhões! ✨`,`${a} e ${b}: parceria confirmada com um high five! 🤝\nEssa merece comemoração! 🎉`,`${a} mandou um high five para ${b}! 🙌\nA sintonia dessa dupla está em outro nível. ⚡`],botao:'Bater aqui também'},
  pat:{titulo:'Carinho desbloqueado! ✨',textos:[`${a} fez um carinho na cabeça de ${b}! 🥰\nVocê merece uma pausa e um pouco de carinho. 💜`,`${b} recebeu um cafuné de ${a}! ✨\nModo aconchego ativado. ☁️`,`${a} veio lembrar ${b} de que está tudo bem respirar um pouquinho. 💕\nToma esse cafuné!`],botao:'Retribuir carinho'},
  wave:{titulo:'Um oi cheio de energia! 👋',textos:[`${a} acenou para ${b}! 👋\nNão vale deixar esse oi sem resposta. 😄`,`${b}, olha quem apareceu: ${a}! ✨\nUm oizinho para alegrar o canal. 👋`,`${a} está chamando ${b} para a conversa! 👋\nChega mais, tem lugar para você. 💜`],botao:'Acenar de volta'},
  happy:{titulo:'Modo felicidade ativado! 😄',textos:[junto?`${a} entrou na comemoração com ${b}! 🎉`:`${a} está espalhando felicidade pelo servidor! ✨\nEsse sorriso é contagiante. 😄`,junto?`${a} e ${b} estão comemorando juntos! 🥳`:`Hoje ${a} está brilhando mais que protagonista de anime! 🌟\nQuem vem comemorar junto?`],botao:'Comemorar junto'},
  sad:{titulo:'Um pouco de carinho por aqui… 🥺',textos:[`${a} está num dia mais quietinho. ☁️\nUma companhia e um abraço virtual podem deixar o momento mais leve. 💜`,`${a} entrou no modo cobertor e silêncio. 🥺\nSe quiser, chega com um pouco de carinho. 🫂`],botao:'Mandar um abraço'},
  laugh:{titulo:'Essa risada é contagiosa! 😂',textos:[junto?`${a} caiu na risada com ${b}! 😂\nAgora ninguém segura essa dupla.`:`${a} está rindo tanto que até perdeu o fio da conversa! 😂\nAlguém traz um copo d’água!`,junto?`${a} e ${b} desbloquearam uma crise de riso! 🤣`:`${a} não tankou essa! 🤣\nAgora o canal inteiro quer saber a piada.`],botao:'Rir junto'},
  dance:{titulo:'Solta o som! 🎶',textos:[junto?`${a} entrou na pista com ${b}! 💃🕺\nEssa dupla já roubou a cena. ✨`:`${a} chegou com os passos de protagonista! 💃\nQuem vai entrar nessa dança? 🎶`,junto?`${a} e ${b} ligaram o modo festa! 🎉\nSó falta escolher a próxima música. 🎶`:`A pista agora é de ${a}! 🕺✨\nPode aumentar o volume!`],botao:'Dançar junto'},
 };
 const m=escolhas[acao];return{titulo:m.titulo,texto:m.textos[randomInt(m.textos.length)]!,botao:m.botao};
}
