import './fontes.js';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {itensDoPedido,imagemReciboValida,type ConfigRecibo,type Pedido} from './vendas-store.js';
const reais=(n:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n/100);
export function imagemRecibo(loja:string,o:Pedido,cor:number){
  const c=createCanvas(1000,720),ctx=c.getContext('2d');
  const acento='#'+cor.toString(16).padStart(6,'0');
  ctx.fillStyle='#10151e';ctx.fillRect(0,0,1000,720);ctx.fillStyle=acento;ctx.fillRect(0,0,12,720);
  const texto=(t:string,x:number,y:number,size=24,color='#edf2f8',bold=false)=>{ctx.font=`${bold?'bold ':''}${size}px "Anzy Sans", sans-serif`;ctx.fillStyle=color;ctx.fillText(t,x,y);};
  const cortar=(t:string,largura:number,size:number)=>{ctx.font=`bold ${size}px "Anzy Sans", sans-serif`;let v=t.replace(/[\r\n\t]/g,' ');while(v.length&&ctx.measureText(v).width>largura)v=v.slice(0,-1);return v.length<t.length?v.slice(0,-1)+'…':v;};
  texto('ANZY PROGRAMS  /  RECIBO DA LOJA',55,60,19,'#a8b3c4',true);
  texto(cortar(loja,760,29),55,110,29,'#ffffff',true);
  ctx.fillStyle=acento;ctx.fillRect(810,40,140,42);texto('CONFIRMADO',825,68,16,'#ffffff',true);
  texto('Compra realizada',55,195,52,'#ffffff',true);
  ctx.strokeStyle='#303b4c';ctx.beginPath();ctx.moveTo(55,228);ctx.lineTo(945,228);ctx.stroke();
  texto('PRODUTO',55,273,17,'#a8b3c4',true);texto(cortar(o.nome,850,30),55,320,30,'#ffffff',true);
  texto('Quantidade: '+o.quantidade,55,367);texto('Subtotal: '+reais(itensDoPedido(o).reduce((n,i)=>n+i.unitario*i.quantidade,0)),55,410);
  texto('Desconto: '+o.desconto+'%',55,453,23,'#a8b3c4');
  ctx.fillStyle='#1d2735';ctx.fillRect(55,490,890,108);texto('TOTAL CONFIRMADO',80,530,18,'#b8c3d2',true);texto(reais(o.total),80,578,42,'#ffffff',true);
  texto('Pedido '+o.id,55,650,20,'#b8c3d2');texto(new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(new Date(o.aprovado??o.criado)),650,650,20,'#b8c3d2');
  texto('Registro da loja • não é documento fiscal',55,690,16,'#a8b3c4');return c.toBuffer('image/png');
}

async function imagemDiscord(url:string){
  if(!imagemReciboValida(url)||!url)throw Error('Imagem de comprovante inválida.');
  const resposta=await fetch(url,{signal:AbortSignal.timeout(5000),redirect:'error'});
  if(!resposta.ok||!/^image\/(png|jpeg|webp)$/.test(resposta.headers.get('content-type')?.split(';')[0]??'')||Number(resposta.headers.get('content-length')??0)>3_000_000||!resposta.body)throw Error('Imagem indisponível ou maior que 3 MB.');
  const leitor=resposta.body.getReader(),partes:Uint8Array[]=[];let tamanho=0;
  try{while(true){const {done,value}=await leitor.read();if(done)break;tamanho+=value.length;if(tamanho>3_000_000)throw Error('Imagem maior que 3 MB.');partes.push(value);}}finally{leitor.releaseLock();}
  return loadImage(Buffer.concat(partes,tamanho));
}

export async function imagemReciboModelo(loja:string,o:Pedido,cor:number,config?:ConfigRecibo){
  if(!config||config.modelo==='classico')return imagemRecibo(loja,o,cor);
  const c=createCanvas(1000,720),ctx=c.getContext('2d');
  const cor1=config.corPrimaria,cor2=config.corSecundaria;
  ctx.fillStyle=cor2;ctx.fillRect(0,0,1000,720);
  if(config.modelo==='gamer'){ctx.fillStyle=cor1;ctx.fillRect(0,0,1000,10);ctx.fillRect(0,710,1000,10);ctx.fillRect(0,0,10,720);ctx.fillRect(990,0,10,720);}
  if(config.modelo==='luxo'){ctx.strokeStyle='#d6b66e';ctx.lineWidth=3;ctx.strokeRect(26,26,948,668);}
  if(config.modelo==='premium'){const grad=ctx.createLinearGradient(0,0,1000,720);grad.addColorStop(0,cor2);grad.addColorStop(1,cor1);ctx.fillStyle=grad;ctx.fillRect(0,0,1000,720);}
  if(config.modelo==='personalizado'&&config.fundo){const fundo=await imagemDiscord(config.fundo);ctx.drawImage(fundo,0,0,1000,720);}
  ctx.fillStyle='rgba(10,16,28,0.91)';ctx.fillRect(42,38,916,644);
  if(config.decoracao){ctx.fillStyle=cor1;ctx.fillRect(42,38,916,8);ctx.fillRect(42,591,916,8);}
  const texto=(v:string,x:number,y:number,size=24,color='#ffffff',bold=false)=>{ctx.font=`${bold?'bold ':''}${size}px "Anzy Sans", sans-serif`;ctx.fillStyle=color;ctx.fillText(v.replace(/[\r\n\t]/g,' '),x,y);};
  const cortar=(v:string,max:number,size:number)=>{ctx.font=`bold ${size}px "Anzy Sans", sans-serif`;let s=v.replace(/[\r\n\t]/g,' ');while(s.length&&ctx.measureText(s).width>max)s=s.slice(0,-1);return s.length<v.length?s.slice(0,-1)+'…':s;};
  texto('ANZY PROGRAM  /  COMPROVANTE',70,87,18,'#b9c6d7',true);
  texto(cortar(config.nome||loja,config.logo?650:810,31),70,137,31,'#ffffff',true);
  if(config.logo){const logo=await imagemDiscord(config.logo);ctx.drawImage(logo,812,58,110,82);}
  texto('COMPRA CONFIRMADA',70,210,40,'#ffffff',true);
  texto('PRODUTO',70,267,16,'#a8b3c4',true);texto(cortar(o.nome,820,29),70,306,29,'#ffffff',true);
  texto('Quantidade: '+o.quantidade,70,352);texto('Subtotal: '+reais(itensDoPedido(o).reduce((n,i)=>n+i.unitario*i.quantidade,0)),70,393);
  texto('Desconto: '+o.desconto+'%',70,434,22,'#b9c6d7');
  ctx.fillStyle=cor1;ctx.fillRect(70,470,860,96);ctx.fillStyle='rgba(10,16,28,0.85)';ctx.fillRect(76,476,848,84);
  texto('TOTAL PAGO',94,506,17,'#d5deeb',true);texto(reais(o.total),94,549,37,'#ffffff',true);
  texto('Pedido '+o.id+'  •  Confirmado',70,630,18,'#d5deeb');
  texto(new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(new Date(o.aprovado??o.criado)),740,630,18,'#d5deeb');
  texto('Registro da loja • não é documento fiscal',70,663,15,'#a8b3c4');
  return c.toBuffer('image/png');
}
