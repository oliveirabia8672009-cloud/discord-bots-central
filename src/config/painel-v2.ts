import {ActionRowBuilder,ButtonBuilder,ButtonStyle,ContainerBuilder,MessageFlags,TextDisplayBuilder} from 'discord.js';

// Painéis antigos usam embeds. A mensagem da central usa Components V2 e só aceita componentes.
export function painelNaMensagem(i:any,p:any){
  if(!i.message?.flags?.has?.(MessageFlags.IsComponentsV2))return p;
  const c=new ContainerBuilder();
  const partes:string[]=[];
  if(p.content)partes.push(String(p.content));
  for(const valor of p.embeds??[]){
    const emb=typeof valor.toJSON==='function'?valor.toJSON():valor;
    if(typeof emb.color==='number')c.setAccentColor(emb.color);
    if(emb.title)partes.push(`## ${emb.title}`);
    if(emb.description)partes.push(emb.description);
    for(const campo of emb.fields??[])partes.push(`**${campo.name}**\n${campo.value}`);
    if(emb.image?.url)partes.push(emb.image.url);
    if(emb.footer?.text)partes.push(`-# ${emb.footer.text}`);
  }
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(partes.join('\n\n').slice(0,4000)||'Configurações encerradas.'));
  for(const row of p.components??[])c.addActionRowComponents(row);
  if((p.components?.length??0)<5)c.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('anzy:inicio').setLabel('Voltar ao início').setStyle(ButtonStyle.Secondary)));
  return {components:[c],flags:MessageFlags.IsComponentsV2,allowedMentions:{parse:[]},...(p.files?{files:p.files}:{}),...(p.attachments?{attachments:p.attachments}:{})};
}
