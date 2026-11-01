import {createCanvas,loadImage} from '@napi-rs/canvas';
import {nivelXP,minimoXP} from './membros-store.js';
export async function avatarMembro(url:string){
 try{const u=new URL(url);if(u.protocol!=='https:'||!['cdn.discordapp.com','media.discordapp.net'].includes(u.hostname))return undefined;
 const r=await fetch(u,{signal:AbortSignal.timeout(4000)});if(!r.ok||Number(r.headers.get('content-length')??0)>2_000_000)return undefined;const b=Buffer.from(await r.arrayBuffer());if(b.length>2_000_000)return undefined;return await loadImage(b);
 }catch{return undefined;}
}
export async function imagemPerfil(d:{nome:string;servidor:string;xp:number;cor:number;avatar?:string;convites:number;posicao:number;subiu?:boolean}){
 const c=createCanvas(1000,500),ctx=c.getContext('2d'),nivel=nivelXP(d.xp),de=minimoXP(nivel),ate=minimoXP(nivel+1),frac=(d.xp-de)/(ate-de);
 ctx.fillStyle='#10151f';ctx.fillRect(0,0,1000,500);const acento='#'+d.cor.toString(16).padStart(6,'0');ctx.fillStyle=acento;ctx.fillRect(0,0,12,500);
 const text=(s:string,x:number,y:number,size:number,color='#f4f6fa')=>{ctx.font=`bold ${size}px "Segoe UI", Arial`;ctx.fillStyle=color;ctx.fillText(s,x,y);};
 const corte=(s:string,max:number,size:number)=>{ctx.font=`bold ${size}px "Segoe UI", Arial`;let t=s.replace(/[\r\n\t]/g,' ');while(t.length&&ctx.measureText(t).width>max)t=t.slice(0,-1);return t.length<s.length?t+'…':t;};
 text('ANZY PROGRAMS  /  '+(d.subiu?'NOVO NÍVEL':'PERFIL DO MEMBRO'),48,48,17,'#a9b6ca');
 ctx.save();ctx.beginPath();ctx.arc(125,155,72,0,Math.PI*2);ctx.clip();ctx.fillStyle='#283447';ctx.fillRect(50,80,150,150);
 const av=d.avatar?await avatarMembro(d.avatar):undefined;if(av)ctx.drawImage(av,53,83,144,144);else text(d.nome.slice(0,1).toUpperCase(),100,177,60);ctx.restore();
 text(corte(d.nome,710,36),230,132,36);text(corte(d.servidor,700,22),230,174,22,'#a9b6ca');
 text(d.subiu?'VOCÊ SUBIU DE NÍVEL!':'SUA EVOLUÇÃO',48,275,22,acento);text('NÍVEL '+nivel,48,337,49);text(d.xp.toLocaleString('pt-BR')+' XP',755,331,27);
 ctx.fillStyle='#293346';ctx.fillRect(48,367,904,22);ctx.fillStyle=acento;ctx.fillRect(48,367,Math.max(0,Math.min(904,904*frac)),22);
 text((d.xp-de)+' / '+(ate-de)+' XP para o próximo nível',48,424,20,'#b8c4d6');
 text((d.posicao?'Posição #'+d.posicao:'Sem posição')+'   ·   Convites únicos: '+d.convites,48,466,19,'#a9b6ca');return c.toBuffer('image/png');
}
export async function imagemReacao(titulo:string,nome:string,outro:string,cor:number){
 const c=createCanvas(900,280),ctx=c.getContext('2d');ctx.fillStyle='#10151f';ctx.fillRect(0,0,900,280);ctx.fillStyle='#'+cor.toString(16).padStart(6,'0');ctx.fillRect(0,0,12,280);
 const text=(s:string,y:number,size:number,color='#ffffff')=>{ctx.font=`bold ${size}px "Segoe UI", Arial`;ctx.fillStyle=color;while(ctx.measureText(s).width>800)s=s.slice(0,-2)+'…';ctx.fillText(s,48,y);};
 text('ANZY PROGRAMS  /  INTERAÇÕES',42,16,'#a9b6ca');text(titulo,124,42);text(nome,182,27);text(outro?'> '+outro:'Um momento para compartilhar com o servidor.',230,23,'#b8c4d6');return c.toBuffer('image/png');
}
