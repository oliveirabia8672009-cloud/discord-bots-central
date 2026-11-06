export type Amostra={canal:string;texto:string;quando:number};
export type Sinal={score:number;motivos:string[];revisao:boolean};
export function criarDetectorArmadilha(){
 const historico=new Map<string,Amostra[]>(),ultimoAlerta=new Map<string,number>();
 function analisar(servidor:string,usuario:string,amostra:Amostra,armadilha:string|null,modo:'simples'|'inteligente',limiar=4):Sinal{
  const chave=servidor+':'+usuario,antigos=(historico.get(chave)??[]).filter(x=>x.quando>=amostra.quando-60000);
  const recentes=antigos.filter(x=>x.quando>=amostra.quando-10000),motivos:string[]=[];
  if(armadilha&&amostra.canal===armadilha)motivos.push('mensagem no canal armadilha');
  if(modo==='inteligente'){
   if(recentes.length>=7)motivos.push('sequência rápida de mensagens');
   const texto=amostra.texto.trim().toLowerCase();
   if(texto.length>=12&&new Set(antigos.filter(x=>x.texto.trim().toLowerCase()===texto).map(x=>x.canal)).size>=2)motivos.push('texto repetido em vários canais');
   const links=[...texto.matchAll(/https?:\/\/[^\s]+/g)].map(m=>m[0]);
   if(links.some(link=>antigos.filter(x=>x.texto.toLowerCase().includes(link)).length>=3))motivos.push('link repetido');
  }
  historico.set(chave,[...antigos,amostra].slice(-40));
  const score=motivos.reduce((n,m)=>n+(m==='mensagem no canal armadilha'?4:2),0);
  const revisao=score>=limiar&&(!ultimoAlerta.get(chave)||amostra.quando-ultimoAlerta.get(chave)!>60000);
  if(revisao)ultimoAlerta.set(chave,amostra.quando);
  if(historico.size>10000)for(const [k,v]of historico)if(v.at(-1)!.quando<amostra.quando-60000){historico.delete(k);ultimoAlerta.delete(k);}
  return{score,motivos,revisao};
 }
 return{analisar};
}
