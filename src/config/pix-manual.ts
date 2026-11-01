import QRCode from 'qrcode';
const normal=(s:string,max:number)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9 .-]/g,'').trim().slice(0,max);
export function crc16(s:string){let crc=0xffff;for(const byte of Buffer.from(s,'utf8')){crc^=byte<<8;for(let n=0;n<8;n++)crc=(crc&0x8000)?((crc<<1)^0x1021)&0xffff:(crc<<1)&0xffff;}return crc.toString(16).toUpperCase().padStart(4,'0');}
function tlv(id:string,value:string){const n=Buffer.byteLength(value,'utf8');if(n>99)throw Error('Dados Pix excedem o limite do QR Code.');return id+String(n).padStart(2,'0')+value;}
export function codigoPix(chave:string,nome:string,cidade:string,centavos?:number,referencia='***'){
  if(!/^([0-9]{11}|[0-9]{14}|\+[1-9][0-9]{7,14}|[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12})$/.test(chave)||chave.length>77)throw Error('Cadastre uma chave Pix válida para gerar o QR Code.');
  const recebedor=normal(nome,25),local=normal(cidade,15);if(!recebedor||!local)throw Error('Cadastre o recebedor e a cidade nas configurações de Pix manual.');
  if(centavos!==undefined&&(!Number.isSafeInteger(centavos)||centavos<1||centavos>999999999))throw Error('Valor Pix inválido.');
  const txid=referencia==='***'?'***':referencia.replace(/[^a-zA-Z0-9]/g,'').slice(0,25);if(!txid)throw Error('Referência inválida.');
  const payload=tlv('00','01')+tlv('26',tlv('00','br.gov.bcb.pix')+tlv('01',chave))+tlv('52','0000')+tlv('53','986')+(centavos===undefined?'':tlv('54',(centavos/100).toFixed(2)))+tlv('58','BR')+tlv('59',recebedor)+tlv('60',local)+tlv('62',tlv('05',txid))+'6304';return payload+crc16(payload);
}
export const imagemPix=(codigo:string)=>QRCode.toBuffer(codigo,{type:'png',width:640,margin:4,errorCorrectionLevel:'M'});
