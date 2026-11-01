import {createCanvas} from '@napi-rs/canvas';
import {itensDoPedido,type Pedido} from './vendas-store.js';
const reais=(n:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n/100);
export function imagemRecibo(loja:string,o:Pedido,cor:number){
  const c=createCanvas(1000,720),ctx=c.getContext('2d');
  const acento='#'+cor.toString(16).padStart(6,'0');
  ctx.fillStyle='#10151e';ctx.fillRect(0,0,1000,720);ctx.fillStyle=acento;ctx.fillRect(0,0,12,720);
  const texto=(t:string,x:number,y:number,size=24,color='#edf2f8',bold=false)=>{ctx.font=`${bold?'bold ':''}${size}px "Segoe UI", Arial, sans-serif`;ctx.fillStyle=color;ctx.fillText(t,x,y);};
  const cortar=(t:string,largura:number,size:number)=>{ctx.font=`bold ${size}px "Segoe UI", Arial, sans-serif`;let v=t.replace(/[\r\n\t]/g,' ');while(v.length&&ctx.measureText(v).width>largura)v=v.slice(0,-1);return v.length<t.length?v.slice(0,-1)+'…':v;};
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
