import {podeConfigurar,acessoCompleto,instalarAcessos} from './config/acessos.js';
import {instalarSorteios,comandoSorteio} from './config/sorteios.js';
import {instalarDivulgacao,comandosDivulgacao} from './config/divulgacao.js';
import {instalarComunidade,comandosComunidade} from './config/comunidade.js';
import {contextoAtual,noContexto,rastrearBot,limparContexto,type ContextoBot} from './config/contexto-bot.js';
import {criarStoreVendas} from './config/vendas-store.js';
import { instalarAjuda, comandoAjuda } from './config/ajuda.js';
import { instalarMembros, comandosMembros } from './config/membros.js';
import 'dotenv/config';
import { iniciarCopiaNuvem } from './config/nuvem.js';
import { Buffer } from 'node:buffer';
import { criarConfiguracaoCores, interpretarCor, formatarCor } from './config/cores.js';
import { aplicarDescricaoAnzy } from './config/marca.js';
import { instalarSeguranca, comandosSeguranca } from './config/seguranca.js';
import { instalarModeracao, comandosModeracao } from './config/moderacao.js';
import { instalarOutros,criarStoreOutros } from './config/outros.js';
import { instalarTickets, comandosTickets } from './config/tickets.js';
import { instalarVendas, comandosVendas } from './config/vendas.js';
import {
  Client, GatewayIntentBits, Events, REST, Routes, SlashCommandBuilder,
  PermissionFlagsBits, MessageFlags, ContainerBuilder, TextDisplayBuilder,
  SeparatorBuilder, SeparatorSpacingSize, ActionRowBuilder,
  StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  type Interaction,
} from 'discord.js';
import { emojis, emojiTexto, emojiComponente } from './config/emojis.js';

export const permiteConteudo=(env:NodeJS.ProcessEnv,id:string)=>env.ANZY_TEST_MESSAGE_CONTENT==='true'||(env.ANZY_MESSAGE_CONTENT_BOTS??'').split(',').map(x=>x.trim()).includes(id);
export async function iniciarBot(env:NodeJS.ProcessEnv,ctx:ContextoBot,extra?:{comandos:SlashCommandBuilder[];tratar:(i:Interaction)=>Promise<boolean>},cliente?:Client){
const token = env.DISCORD_BOT_TOKEN;
const clientId = env.DISCORD_CLIENT_ID;
if (!token || !clientId) throw new Error('Configure DISCORD_BOT_TOKEN e DISCORD_CLIENT_ID no .env');
await iniciarCopiaNuvem(env);
const cores = criarConfiguracaoCores();

const conteudoPermitido=permiteConteudo(env,clientId);
const bot = cliente??new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildModeration, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildInvites,GatewayIntentBits.GuildVoiceStates, ...(conteudoPermitido ? [GatewayIntentBits.MessageContent] : [])], presence: { status: 'online' } });

const emitir=bot.emit.bind(bot);
(bot as any).emit=(evento:string,...args:unknown[])=>noContexto(ctx,()=>emitir(evento as any,...args as any));
type Categoria = 'personalizar' | 'loja' | 'atendimento' | 'outros' | 'moderacao' | 'seguranca' | 'membros';
type Opcao = { nome: string; descricao: string; emoji: keyof typeof emojis };
type Grupo = { titulo: string; descricao: string; opcoes: Opcao[] };
type DadosCategoria = { nome: string; descricao: string; emoji: keyof typeof emojis; grupos: Grupo[] };
const categorias: Record<Categoria, DadosCategoria> = {
  personalizar: { nome: 'Personalização', descricao: 'Identidade e aparência do bot.', emoji: 'personalizacao', grupos: [
    { titulo: 'Identidade do Bot', descricao: 'Personalize as informações do perfil.', opcoes: [
      { nome: 'Alterar nome', descricao: 'Defina o nome exibido no Discord.', emoji: 'nome' },
      { nome: 'Alterar avatar', descricao: 'Escolha a imagem da sua marca.', emoji: 'avatar' },
    ] },
    { titulo: 'Aparência', descricao: 'Defina o estilo visual das mensagens.', opcoes: [
      { nome: 'Cor principal', descricao: 'Personalize a cor dos painéis.', emoji: 'cores' },
    ] },
  ] },
  loja: { nome: 'Painel de Vendas', descricao: 'Produtos, pagamentos e pedidos.', emoji: 'loja', grupos: [
    { titulo: 'Produtos e Estoque', descricao: 'Organize o catálogo da loja.', opcoes: [
      { nome: 'Criar produto', descricao: 'Cadastre um novo produto.', emoji: 'produtos' },
      { nome: 'Gerenciar produtos', descricao: 'Edite os produtos cadastrados.', emoji: 'produtos' },
      { nome: 'Gerenciar estoque', descricao: 'Controle os itens disponíveis.', emoji: 'estoque' },
    ] },
    { titulo: 'Pagamentos e Pedidos', descricao: 'Configure a experiência de compra.', opcoes: [
      { nome: 'Pagamentos', descricao: 'Gerencie as formas de pagamento.', emoji: 'pagamentos' },
      { nome: 'Entregas', descricao: 'Configure o envio dos produtos.', emoji: 'pedidos' },
      { nome: 'Histórico de vendas', descricao: 'Consulte os pedidos realizados.', emoji: 'historico' },
    ] },
  ] },
  atendimento: { nome: 'Sistema de Tickets', descricao: 'Configure o sistema de atendimento por tickets.', emoji: 'suporte', grupos: [
    { titulo: 'Configurações de Tickets', descricao: 'Configure o atendimento e consulte o histórico.', opcoes: [
      { nome: 'Cargo de suporte', descricao: 'Escolha a equipe responsável.', emoji: 'equipe' },
      { nome: 'Categoria de tickets abertos', descricao: 'Escolha onde os tickets serão criados.', emoji: 'tickets' },
      { nome: 'Categoria de tickets arquivados', descricao: 'Escolha onde guardar atendimentos encerrados.', emoji: 'historico' },
      { nome: 'Canal de logs e transcrições', descricao: 'Escolha um canal privado de registros.', emoji: 'logs' },
      { nome: 'Mensagem pública e imagem', descricao: 'Personalize o painel público.', emoji: 'canais' },
      { nome: 'Mensagem privada e imagem', descricao: 'Personalize o interior do ticket.', emoji: 'canais' },
      { nome: 'Canal para abrir ticket', descricao: 'Escolha onde publicar o painel.', emoji: 'canais' },
      { nome: 'Publicar / atualizar painel', descricao: 'Publique as configurações do painel.', emoji: 'tickets' },
      { nome: 'Consultar histórico', descricao: 'Consulte os atendimentos do servidor.', emoji: 'historico' },
    ] },
  ] },
  membros: { nome: 'Interações, XP e convites', descricao: 'Comandos de membros, perfis, níveis e convites.', emoji: 'equipe', grupos: [] },
  seguranca: { nome: 'Segurança e Proteção', descricao: 'Anti-Raid, cargos staff, pagamentos e backups.', emoji: 'permissoes', grupos: [] },
  moderacao: { nome: 'Moderação', descricao: 'Equipe, registros e avisos de moderação.', emoji: 'moderacao', grupos: [] },
  outros: { nome: 'Outros Sistemas', descricao: 'Automações e administração.', emoji: 'configuracoes', grupos: [
    { titulo: 'Automações', descricao: 'Automatize atividades do servidor.', opcoes: [
      { nome: 'Comunicados da Anzy Programs', descricao: 'Escolha onde receber atualizações da programadora.', emoji: 'eventos' },
      { nome: 'Boas-vindas e saída', descricao: 'Personalize mensagens para membros.', emoji: 'boas_vindas' },
    ] },
    { titulo: 'Preferências', descricao: 'Consulte as configurações do servidor.', opcoes: [
      { nome: 'Conferir Configurações gerais', descricao: 'Veja o que já foi configurado no servidor.', emoji: 'configuracoes' },
      { nome: 'Cargo automático', descricao: 'Atribua um cargo quando alguém entrar.', emoji: 'equipe' },
      { nome: 'Comunidade e utilidades', descricao: 'Call, Salva-Chat, sugestões e mensagens.', emoji: 'equipe' },
      { nome: 'Parcerias', descricao: 'Solicitações e publicação após aprovação.', emoji: 'equipe' },
      { nome: 'Criadores e lives', descricao: 'Alertas de vídeos e lives no canal escolhido.', emoji: 'eventos' },
    ] },
  ] },
};

function categoriaValida(id: string): id is Categoria { return Object.prototype.hasOwnProperty.call(categorias, id); }
function opcoes(id: Categoria) { return categorias[id].grupos.flatMap(g => g.opcoes); }
function texto(s: string) { return new TextDisplayBuilder().setContent(s); }
function divisor() { return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small); }
function container(guildId: string | null) { return new ContainerBuilder().setAccentColor(cores.obter(guildId)); }
function rodape() { return texto('-# Anzy Program • Central Administrativa'); }
function botao(id: string, label: string, icone: keyof typeof emojis) {
  return new ButtonBuilder().setCustomId(id).setLabel(label).setEmoji(emojiComponente(icone)).setStyle(ButtonStyle.Secondary);
}

function painelPrincipal(guildId: string | null) {
  const p = container(guildId);
  p.addTextDisplayComponents(texto(`## ${emojiTexto('configuracoes')} Central Administrativa`), texto('Bem-vindo ao painel de gerenciamento do seu bot.\nConfigure os sistemas de maneira **simples e organizada**.'));
  p.addSeparatorComponents(divisor());
  p.addTextDisplayComponents(texto(`### ${emojiTexto('personalizacao')} Personalização\nConfigure a identidade e a aparência do bot.\n\n\`Nome\` · \`Avatar\` · \`Cores\``));
  p.addSeparatorComponents(divisor());
  p.addTextDisplayComponents(texto(`### ${emojiTexto('loja')} Painel de Vendas\nConfigure seus produtos, receba pedidos e acompanhe as entregas.\n\n\`Produtos\` · \`Estoque\` · \`Pagamentos\``));
  p.addSeparatorComponents(divisor());
  p.addTextDisplayComponents(texto(`### ${emojiTexto('suporte')} Sistema de Tickets\nConfigure o atendimento privado aos seus clientes.\n\n\`Tickets\` · \`Equipe\` · \`Canais\``));
  p.addSeparatorComponents(divisor());
  p.addTextDisplayComponents(texto(`### ${emojiTexto('configuracoes')} Outros Sistemas\nConfigure automações e recursos adicionais.\n\n\`Comunicados\` · \`Boas-vindas\` · \`Autorole\``));
  p.addSeparatorComponents(divisor());
  p.addTextDisplayComponents(texto(`### ${emojiTexto('moderacao')} Moderação\nConfigure a equipe, os registros e os avisos aos membros.\n\n\`Comandos\` · \`Equipe\` · \`Logs\``));
  p.addSeparatorComponents(divisor());
  p.addTextDisplayComponents(texto(`### ${emojiTexto('permissoes')} Segurança e Proteção\nProteja as entradas, os cargos e acompanhe os backups.\n\n\`Anti-Raid\` · \`Cargos staff\` · \`Backups\``));
  p.addSeparatorComponents(divisor());
  p.addTextDisplayComponents(texto(`### ${emojiTexto('equipe')} Interações, XP e convites\nComandos para membros, perfis de participação e acompanhamento de convites.`));
  p.addSeparatorComponents(divisor());
  p.addTextDisplayComponents(texto(`**${emojiTexto('categoria')} Selecione uma categoria abaixo:**`));
  const menu = new StringSelectMenuBuilder().setCustomId('anzy:categoria').setPlaceholder('Selecione uma categoria').addOptions(
    (Object.keys(categorias) as Categoria[]).map(id => ({ label: categorias[id].nome, description: categorias[id].descricao, value: id, emoji: emojiComponente(categorias[id].emoji) }))
  );
  p.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu));
  p.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(botao('ac:inicio', 'Gerenciar acessos', 'permissoes'), botao('anzy:fechar', 'Fechar painel', 'fechar')));
  p.addSeparatorComponents(divisor());
  p.addTextDisplayComponents(rodape(), texto('-# Acesso para administradores, comprador e equipe autorizada'));
  return { components: [p] };
}

function painelCategoria(id: Categoria, guildId: string | null) {
  const c = categorias[id], p = container(guildId);
  p.addTextDisplayComponents(texto(`## ${emojiTexto(c.emoji)} ${c.nome}`), texto(c.descricao));
  p.addSeparatorComponents(divisor());
  for (const grupo of c.grupos) {
    p.addTextDisplayComponents(texto(`### ${grupo.titulo}`), texto(grupo.descricao));
    p.addTextDisplayComponents(texto(grupo.opcoes.map(o => `${emojiTexto(o.emoji)} **\`${o.nome}\`** — ${o.descricao}`).join('\n\n')));
    p.addSeparatorComponents(divisor());
  }
  if (opcoes(id).length) {
    p.addTextDisplayComponents(texto(`**${emojiTexto('categoria')} Selecione o que deseja configurar:**`));
    const menu = new StringSelectMenuBuilder().setCustomId(`anzy:opcao:${id}`).setPlaceholder('Escolha uma configuração').addOptions(
      opcoes(id).map((o, i) => ({ label: o.nome, description: o.descricao, value: String(i), emoji: emojiComponente(o.emoji) }))
    );
    p.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu));
  }
  p.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(botao('anzy:inicio', 'Voltar ao início', 'voltar'), botao('anzy:fechar', 'Fechar', 'fechar')));
  p.addTextDisplayComponents(rodape());
  return { components: [p] };
}

const paleta = [
  { id: 'padrao', nome: 'Azul Discord (padrão)', icone: '🔵', cor: 0x5865f2 },
  { id: 'azul', nome: 'Azul', icone: '🔵', cor: 0x3498db },
  { id: 'ciano', nome: 'Ciano', icone: '🩵', cor: 0x00bcd4 },
  { id: 'verde', nome: 'Verde', icone: '🟢', cor: 0x2ecc71 },
  { id: 'amarelo', nome: 'Amarelo', icone: '🟡', cor: 0xf1c40f },
  { id: 'laranja', nome: 'Laranja', icone: '🟠', cor: 0xe67e22 },
  { id: 'vermelho', nome: 'Vermelho', icone: '🔴', cor: 0xe74c3c },
  { id: 'rosa', nome: 'Rosa', icone: '🩷', cor: 0xff69b4 },
  { id: 'roxo', nome: 'Roxo', icone: '🟣', cor: 0x9b59b6 },
  { id: 'marrom', nome: 'Marrom', icone: '🟤', cor: 0x8b4513 },
  { id: 'branco', nome: 'Branco', icone: '⚪', cor: 0xffffff },
  { id: 'cinza', nome: 'Cinza', icone: '🩶', cor: 0x95a5a6 },
  { id: 'preto', nome: 'Preto', icone: '⚫', cor: 0x000000 },
  { id: 'vermelho-vivo', nome: 'Vermelho vivo', icone: '🔴', cor: 0xff1744 },
  { id: 'azul-eletrico', nome: 'Azul elétrico', icone: '🔵', cor: 0x0066ff },
  { id: 'verde-vibrante', nome: 'Verde vibrante', icone: '🟢', cor: 0x00e676 },
  { id: 'roxo-intenso', nome: 'Roxo intenso', icone: '🟣', cor: 0x7c00ff },
  { id: 'rosa-neon', nome: 'Rosa neon', icone: '🩷', cor: 0xff00a8 },
  { id: 'amarelo-forte', nome: 'Amarelo forte', icone: '🟡', cor: 0xffd600 },
  { id: 'laranja-vibrante', nome: 'Laranja vibrante', icone: '🟠', cor: 0xff6d00 },
  { id: 'turquesa-viva', nome: 'Turquesa viva', icone: '🩵', cor: 0x00e5ff },
] as const;

function painelCores(guildId: string | null, salva = false) {
  const atual = cores.obter(guildId);
  const escolhida = paleta.find(c => c.cor === atual);
  const p = container(guildId);
  p.addTextDisplayComponents(texto('## ' + emojiTexto('cores') + ' Cor principal'),
    texto(salva ? emojiTexto('sucesso')+' Cor salva! Escolha outra cor quando quiser.' : 'Escolha uma cor na lista abaixo para personalizar os painéis deste servidor.'),
    texto('**Cor atual:** ' + (escolhida ? escolhida.icone + ' ' + escolhida.nome : 'Personalizada') + ' · `' + formatarCor(atual) + '`'));
  const menu = new StringSelectMenuBuilder().setCustomId('anzy:cor').setPlaceholder('Selecione uma cor').addOptions(
    [...paleta.map(c => ({ label: c.nome, value: c.id, emoji: c.icone, default: c.cor === atual })), {label:'Código HEX personalizado',value:'hex',emoji:'🎨',default:false}]
  );
  p.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu));
  p.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(
    botao('anzy:voltar:personalizar', 'Voltar', 'voltar'), botao('anzy:inicio', 'Menu principal', 'inicio')));
  return { components: [p] };
}

function formularioCor(corAtual:number){
  return new ModalBuilder().setCustomId('anzy:modal:cor').setTitle('Cor personalizada • HEX').addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('anzy:campo:cor').setLabel('Código HEX, por exemplo #FF1744').setStyle(TextInputStyle.Short).setMaxLength(7).setRequired(true).setValue(formatarCor(corAtual))));
}

function formularioNome(nomeAtual: string) {
  const campo = new TextInputBuilder()
    .setCustomId('anzy:campo:nome')
    .setLabel('Novo nome GLOBAL do bot')
    .setStyle(TextInputStyle.Short)
    .setMinLength(2)
    .setMaxLength(32)
    .setRequired(true)
    .setValue(nomeAtual.slice(0, 32));

  return new ModalBuilder()
    .setCustomId('anzy:modal:nome')
    .setTitle('Personalização • Alterar nome')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(campo)
    );
}

function formularioAvatar() {
  const campo = new TextInputBuilder()
    .setCustomId('anzy:campo:avatar')
    .setLabel('Link HTTPS da imagem (PNG, JPG ou WEBP)')
    .setPlaceholder('https://cdn.discordapp.com/attachments/...')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  return new ModalBuilder()
    .setCustomId('anzy:modal:avatar')
    .setTitle('Personalização • Avatar global')
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(campo));
}

// Administradores podem alterar a identidade global, que afeta todos os servidores do bot.

function painelOpcao(id: Categoria, indice: number, guildId: string | null) {
  const o = opcoes(id)[indice];
  if (!o) return painelCategoria(id, guildId);
  const p = container(guildId);
  p.addTextDisplayComponents(texto(`## ${emojiTexto(o.emoji)} ${o.nome}`), texto(o.descricao));
  p.addSeparatorComponents(divisor());
  p.addTextDisplayComponents(texto(`**Configuração selecionada**\n\n**Categoria:** \`${categorias[id].nome}\`\n**Opção:** \`${o.nome}\``));
  p.addSeparatorComponents(divisor());
  p.addTextDisplayComponents(texto('Esta função ainda está em desenvolvimento.\n\nEm breve, você poderá configurá-la diretamente no Discord.'));
  p.addSeparatorComponents(divisor());
  p.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(botao(`anzy:voltar:${id}`, 'Voltar', 'voltar'), botao('anzy:inicio', 'Menu principal', 'inicio')));
  p.addTextDisplayComponents(rodape());
  return { components: [p] };
}

const comandos = [
  ...(extra?.comandos??[]),
  comandoAjuda,
  comandoSorteio,
  ...comandosMembros,
  ...comandosComunidade,
  ...comandosDivulgacao,
  ...comandosSeguranca,
  ...comandosModeracao,
  ...comandosTickets,
  ...comandosVendas,
  new SlashCommandBuilder().setName('ping').setDescription('Verifica se o bot está funcionando.'),
  new SlashCommandBuilder().setName('configbot').setDescription('Abre a central administrativa do bot.').setDefaultMemberPermissions(null),
  new SlashCommandBuilder().setName('listaremojis').setDescription('Exporta os emojis personalizados do servidor.').setDefaultMemberPermissions(null),
];

async function registrarComandos(guildId: string) {
  const rest = new REST({ version: '10' }).setToken(token!);
  await rest.put(Routes.applicationGuildCommands(clientId!, guildId), { body: comandos.map(c => c.toJSON()) });
  console.log(`Comandos registrados no servidor ${guildId}`);
}


const acessos = instalarAcessos(id=>cores.obter(id));
const ajuda = instalarAjuda(comandos, id => cores.obter(id));
const membros = instalarMembros(bot, id => cores.obter(id));
const seguranca = instalarSeguranca(bot, id => cores.obter(id));
const tratarModeracao = instalarModeracao(bot, id => cores.obter(id));
const sorteios=instalarSorteios(bot,id=>cores.obter(id));
const divulgacao=instalarDivulgacao(bot,id=>cores.obter(id));
const comunidade=instalarComunidade(bot,id=>cores.obter(id));
const outrosStore=criarStoreOutros();
const tratarOutros = instalarOutros(bot, id => cores.obter(id),outrosStore);
const tratarTickets = instalarTickets(bot, id => cores.obter(id));
const storeVendas=criarStoreVendas();
const tratarVendas = instalarVendas(bot, id => cores.obter(id), storeVendas, tratarTickets);

bot.on(Events.InteractionCreate, rastrearBot(async interaction => {
  if(ctx.parando||interaction.guildId&&!ctx.permitirGuild(interaction.guildId)){if(interaction.isRepliable())await interaction.reply({content:emojiTexto('aviso')+' Este bot ainda não está liberado para este servidor.',flags:MessageFlags.Ephemeral}).catch(()=>{});return;}
  try {
    if(await acessos.tratar(interaction))return;
    const diagnosticoAcao=interaction.isChatInputCommand()?interaction.commandName:('customId'in interaction?interaction.customId:'');
    if(['configbot','ping'].includes(diagnosticoAcao)||diagnosticoAcao==='anzy:categoria')console.log('Entrada de interação',JSON.stringify({bot:clientId,acao:diagnosticoAcao,atrasoMs:Date.now()-interaction.createdTimestamp}));
    if(interaction.isChatInputCommand()&&interaction.commandName==='ping'){await interaction.reply({content:emojiTexto('sucesso')+' Pong! Sistema funcionando.'});console.log('Ping respondido',clientId);return;}
    if(interaction.isChatInputCommand()&&interaction.commandName==='configbot'){
      if(!podeConfigurar(interaction)){await interaction.reply({content:emojiTexto('erro')+' Acesso permitido ao comprador, administradores e equipe autorizada.',flags:MessageFlags.Ephemeral});return;}
      const inicio=Date.now();await interaction.deferReply({flags:MessageFlags.Ephemeral});console.log('Painel confirmado',JSON.stringify({bot:clientId,ms:Date.now()-inicio}));
      await interaction.editReply({...painelPrincipal(interaction.guildId),flags:MessageFlags.IsComponentsV2});console.log('Painel aberto',JSON.stringify({bot:clientId,ms:Date.now()-inicio}));return;
    }
    if(extra&&await extra.tratar(interaction))return;
    if (await ajuda.tratar(interaction)) return;
    if (await membros.tratar(interaction)) return;
    if (await seguranca.tratar(interaction)) return;
    if (await tratarModeracao(interaction)) return;
    if (await tratarVendas(interaction)) return;
    if (await tratarTickets(interaction)) return;
    if (await sorteios.tratar(interaction)) return;
    if (await divulgacao.tratar(interaction)) return;
    if (await comunidade.tratar(interaction)) return;
    if (await tratarOutros(interaction)) return;
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'listaremojis') {
        if (!podeConfigurar(interaction) || !interaction.guildId) {
          await interaction.reply({ content: emojiTexto('erro')+' Apenas administradores podem usar este comando em um servidor.', flags: MessageFlags.Ephemeral }); return;
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const guild = await bot.guilds.fetch(interaction.guildId);
        const lista = (await guild.emojis.fetch()).map(e => ({ nome: e.name, id: e.id, codigo: e.toString(), animado: e.animated ?? false }));
        if (!lista.length) { await interaction.editReply({ content: 'Nenhum emoji encontrado neste servidor.' }); return; }
        const json = new AttachmentBuilder(Buffer.from(JSON.stringify(lista, null, 2), 'utf8'), { name: 'anzy_emojis.json' });
        const txt = new AttachmentBuilder(Buffer.from(lista.map(e => `${e.nome} | ${e.id} | ${e.codigo}`).join('\n'), 'utf8'), { name: 'anzy_emojis.txt' });
        await interaction.editReply({ content: `${emojiTexto('sucesso')} **${lista.length} emojis encontrados!**`, files: [json, txt] }); return;
      }
    }
    if(interaction.isModalSubmit()&&interaction.customId==='anzy:modal:cor'){
      if(!podeConfigurar(interaction)||!interaction.guildId){await interaction.reply({content:'Acesso não autorizado.',flags:MessageFlags.Ephemeral});return;}
      const valor=interpretarCor(interaction.fields.getTextInputValue('anzy:campo:cor'));
      if(valor===null){await interaction.reply({content:'Informe seis dígitos HEX, por exemplo #FF1744.',flags:MessageFlags.Ephemeral});return;}
      cores.salvar(interaction.guildId,valor);
      await interaction.reply({content:`${emojiTexto('sucesso')} Cor ${formatarCor(valor)} salva neste servidor. Reabra Cores para ver a prévia.`,flags:MessageFlags.Ephemeral});return;
    }
    // ALTERAÇÕES GLOBAIS DE IDENTIDADE
    if (interaction.isModalSubmit() &&
      (interaction.customId === 'anzy:modal:nome' || interaction.customId === 'anzy:modal:avatar')) {
      if (!podeConfigurar(interaction)||!(ctx.podeIdentidade(interaction.user.id)||!ctx.principal&&acessoCompleto(interaction))) {
        await interaction.reply({ content: emojiTexto('erro')+' Somente o dono autorizado pode alterar o nome e o avatar globais deste bot.', flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        if (interaction.customId === 'anzy:modal:nome') {
          const nome = interaction.fields.getTextInputValue('anzy:campo:nome').trim();
          if (nome.length < 2 || nome.length > 32) {
            await interaction.editReply({ content: 'Informe um nome de 2 a 32 caracteres.' }); return;
          }
          await bot.user!.setUsername(nome);
          await interaction.editReply({ content: `${emojiTexto('sucesso')} Nome global alterado para **${nome.replaceAll('@', '@\u200b')}**. A atualização pode demorar a aparecer no Discord.` });
        } else {
          const link = interaction.fields.getTextInputValue('anzy:campo:avatar').trim();
          let url: URL;
          try { url = new URL(link); }
          catch { await interaction.editReply({ content: 'Informe um link HTTPS válido.' }); return; }
          // Somente imagens enviadas ao Discord: reduz riscos de links inseguros.
          if (url.protocol !== 'https:' || !['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname)) {
            await interaction.editReply({ content: 'Envie a imagem a um canal do Discord e cole o link do anexo (cdn.discordapp.com).' }); return;
          }
          await bot.user!.setAvatar(link);
          await interaction.editReply({ content: `${emojiTexto('sucesso')} Avatar global atualizado! Pode levar alguns instantes para aparecer.` });
        }
      } catch (erro) {
        console.error('Falha ao alterar identidade global:', erro);
        await interaction.editReply({ content: 'Não foi possível aplicar a alteração. Verifique o nome/link e aguarde caso o Discord tenha limitado mudanças recentes.' });
      }
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('anzy:')) {
      if (!podeConfigurar(interaction)) { await interaction.reply({ content: emojiTexto('erro')+' Acesso não autorizado.', flags: MessageFlags.Ephemeral }); return; }
      if (interaction.customId === 'anzy:cor') {
        if(interaction.values[0]==='hex'){await interaction.showModal(formularioCor(cores.obter(interaction.guildId)));return;}
        const escolhida = paleta.find(c => c.id === interaction.values[0]);
        if (!escolhida || !interaction.guildId) {
          await interaction.reply({ content: 'Selecione uma cor válida.', flags: MessageFlags.Ephemeral }); return;
        }
        await interaction.deferUpdate();
        cores.salvar(interaction.guildId, escolhida.cor);
        await interaction.editReply(painelCores(interaction.guildId, true)); return;
      }
      if (interaction.customId === 'anzy:categoria') {
        const id = interaction.values[0];
        if (!id || !categoriaValida(id)) { await interaction.reply({ content: 'Categoria inválida.', flags: MessageFlags.Ephemeral }); return; }
        await interaction.deferUpdate(); await interaction.editReply(painelCategoria(id, interaction.guildId)); return;
      }
      if (interaction.customId.startsWith('anzy:opcao:')) {
        const id = interaction.customId.split(':')[2], valor = interaction.values[0];
        if (!id || !categoriaValida(id) || valor === undefined) { await interaction.reply({ content: 'Opção inválida.', flags: MessageFlags.Ephemeral }); return; }
        const indice = Number(valor);
        if (!Number.isInteger(indice) || indice < 0 || indice >= opcoes(id).length) { await interaction.reply({ content: 'Opção inválida.', flags: MessageFlags.Ephemeral }); return; }
        if (id === 'personalizar' && opcoes(id)[indice]?.nome === 'Cor principal') {
          await interaction.deferUpdate(); await interaction.editReply(painelCores(interaction.guildId)); return;
        }
        if (id === 'personalizar' && ['Alterar nome', 'Alterar avatar'].includes(opcoes(id)[indice]?.nome ?? '')) {
          if (opcoes(id)[indice]?.nome === 'Alterar nome') {
            await interaction.showModal(formularioNome(bot.user?.username ?? 'Anzy Program'));
          } else {
            await interaction.showModal(formularioAvatar());
          }
          return;
        }
        await interaction.deferUpdate(); await interaction.editReply(painelOpcao(id, indice, interaction.guildId)); return;
      }
    }
    if (interaction.isButton() && interaction.customId.startsWith('anzy:')) {
      if (!podeConfigurar(interaction)) { await interaction.reply({ content: emojiTexto('erro')+' Acesso não autorizado.', flags: MessageFlags.Ephemeral }); return; }
      if (interaction.customId === 'anzy:inicio') { await interaction.deferUpdate(); await interaction.editReply(painelPrincipal(interaction.guildId)); return; }
      if (interaction.customId === 'anzy:fechar') {
        await interaction.deferUpdate();
        await interaction.editReply({ components: [container(interaction.guildId).addTextDisplayComponents(texto(`${emojiTexto('fechar')} **Painel fechado.**`))] }); return;
      }
      if (interaction.customId.startsWith('anzy:voltar:')) {
        const id = interaction.customId.split(':')[2];
        if (!id || !categoriaValida(id)) { await interaction.reply({ content: 'Categoria inválida.', flags: MessageFlags.Ephemeral }); return; }
        await interaction.deferUpdate(); await interaction.editReply(painelCategoria(id, interaction.guildId)); return;
      }
    }
  } catch (erro) {
    const codigo = typeof erro === 'object' && erro !== null && 'code' in erro ? erro.code : undefined;
    const acao = 'customId' in interaction ? interaction.customId : interaction.isChatInputCommand() ? interaction.commandName : 'outra';
    if (codigo === 10062 || codigo === 40060) {
      console.warn('Interação indisponível:', { codigo, acao, idadeMs: Date.now() - interaction.createdTimestamp });
      return; // Uma interação expirada ou já confirmada não aceita outra resposta inicial.
    }
    console.error('Erro na interação:', { codigo, acao, mensagem: erro instanceof Error ? erro.message : 'Erro desconhecido' });
    if (interaction.isRepliable()) {
      try {
        if (interaction.replied || interaction.deferred) await interaction.followUp({ content: emojiTexto('erro')+' Não foi possível executar esta ação.', flags: MessageFlags.Ephemeral });
        else await interaction.reply({ content: emojiTexto('erro')+' Não foi possível executar esta ação.', flags: MessageFlags.Ephemeral });
      } catch (erroResposta) { console.error('Erro ao responder:', erroResposta instanceof Error ? erroResposta.message : 'Erro desconhecido'); }
    }
  }
}));

bot.once(Events.ClientReady, async client => {
  try {
    await aplicarDescricaoAnzy(client.application);
    console.log('Descrição da Anzy Programs conferida.');
  } catch (erro) {
    console.error('Não foi possível atualizar a descrição da Anzy Programs:', erro);
  }
  console.log(`Anzy Program conectado: ${client.user.tag} | Servidores: ${client.guilds.cache.size}`);
  for (const guild of client.guilds.cache.values()) {
    if(!ctx.permitirGuild(guild.id)){await guild.leave().catch(()=>{});continue;}
    try { await registrarComandos(guild.id); }
    catch (erro) { console.error(`Erro ao registrar comandos em ${guild.name}:`, erro); }
  }
});
bot.on(Events.GuildCreate, async guild => {
  if(!ctx.permitirGuild(guild.id)){await guild.leave().catch(()=>{});return;}
  try { await registrarComandos(guild.id); }
  catch (erro) { console.error('Erro ao registrar comandos:', erro); }
});
bot.on(Events.Error, erro => console.error('Erro Discord:', erro));
bot.on(Events.ShardDisconnect, (evento, shardId) => console.log(`Shard ${shardId} desconectado: ${evento.code}`));
bot.on(Events.ShardReconnecting, shardId => console.log(`Shard ${shardId} reconectando...`));
bot.on(Events.ShardResume, shardId => console.log(`Shard ${shardId} reconectado.`));
try{await bot.login(token);}catch{comunidade.parar();await bot.destroy();seguranca.parar();membros.parar();limparContexto(ctx);throw Error('Não foi possível conectar este bot.');}
return{bot,storeVendas,canalComunicados:(guild:string)=>outrosStore.obter(guild).avisos,concluirEntrega:tratarVendas.concluirEntrega,atualizarProduto:tratarVendas.atualizarProduto,parar:async()=>{ctx.parando=true;await Promise.allSettled([...ctx.pendentes]);await bot.destroy();seguranca.parar();membros.parar();limparContexto(ctx);bot.removeAllListeners();}};
}




