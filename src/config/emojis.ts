// Emojis oficiais do Anzy Program. IDs do servidor central.
// Cada bot deve ter acesso aos emojis para exibi-los.
export const emojis = {
  inicio: { id: '1565906401132282026', name: 'emoji_1', code: '<:emoji_1:1565906401132282026>' },
  configuracoes: { id: '1565906434099642448', name: 'emoji_2', code: '<:emoji_2:1565906434099642448>' },
  categoria: { id: '1565906453431324842', name: 'emoji_3', code: '<:emoji_3:1565906453431324842>' },
  voltar: { id: '1566054035667026014', name: 'emoji_33', code: '<:emoji_33:1566054035667026014>' },
  confirmar: { id: '1565906493927202846', name: 'emoji_5', code: '<:emoji_5:1565906493927202846>' },
  fechar: { id: '1565906523639779429', name: 'emoji_6', code: '<:emoji_6:1565906523639779429>' },
  personalizacao: { id: '1565906548784369765', name: 'emoji_7', code: '<:emoji_7:1565906548784369765>' },
  nome: { id: '1565906571051925645', name: 'emoji_8', code: '<:emoji_8:1565906571051925645>' },
  avatar: { id: '1565906592896123041', name: 'emoji_9', code: '<:emoji_9:1565906592896123041>' },
  cores: { id: '1565906618892288210', name: 'emoji_10', code: '<:emoji_10:1565906618892288210>' },
  status: { id: '1565906638295138445', name: 'emoji_11', code: '<:emoji_11:1565906638295138445>' },
  loja: { id: '1565906659023261748', name: 'emoji_12', code: '<:emoji_12:1565906659023261748>' },
  produtos: { id: '1565906690015109170', name: 'emoji_13', code: '<:emoji_13:1565906690015109170>' },
  estoque: { id: '1565906711334621244', name: 'emoji_14', code: '<:emoji_14:1565906711334621244>' },
  pagamentos: { id: '1565906732620718240', name: 'emoji_15', code: '<:emoji_15:1565906732620718240>' },
  vendas: { id: '1565906768549126154', name: 'emoji_16', code: '<:emoji_16:1565906768549126154>' },
  pedidos: { id: '1565906810483773471', name: 'emoji_16', code: '<:emoji_16:1565906810483773471>' },
  tickets: { id: '1565906905367322667', name: 'emoji_18', code: '<:emoji_18:1565906905367322667>' },
  suporte: { id: '1565906928486326363', name: 'emoji_19', code: '<:emoji_19:1565906928486326363>' },
  equipe: { id: '1565906951504920686', name: 'emoji_20', code: '<:emoji_20:1565906951504920686>' },
  canais: { id: '1565906990541180958', name: 'emoji_21', code: '<:emoji_21:1565906990541180958>' },
  historico: { id: '1565907053292167209', name: 'emoji_22', code: '<:emoji_22:1565907053292167209>' },
  eventos: { id: '1565907074674597919', name: 'emoji_23', code: '<:emoji_23:1565907074674597919>' },
  boas_vindas: { id: '1565907093867733092', name: 'emoji_24', code: '<:emoji_24:1565907093867733092>' },
  saida: { id: '1565907121197814012', name: 'emoji_25', code: '<:emoji_25:1565907121197814012>' },
  agendamento: { id: '1565907142463070278', name: 'emoji_26', code: '<:emoji_26:1565907142463070278>' },
  automacao: { id: '1565907164978090114', name: 'emoji_27', code: '<:emoji_27:1565907164978090114>' },
  moderacao: { id: '1565907189418172436', name: 'emoji_28', code: '<:emoji_28:1565907189418172436>' },
  logs: { id: '1565907216601710612', name: 'emoji_29', code: '<:emoji_29:1565907216601710612>' },
  permissoes: { id: '1565907240479891537', name: 'emoji_30', code: '<:emoji_30:1565907240479891537>' },
  sucesso: { id: '1565907263347105932', name: 'emoji_31', code: '<:emoji_31:1565907263347105932>' },
  erro: { id: '1565907287376142499', name: 'emoji_32', code: '<:emoji_32:1565907287376142499>' },
  aviso: { id: '1565907313271902368', name: 'emoji_33', code: '<:emoji_33:1565907313271902368>' },
} as const;

export type EmojiAnzy = keyof typeof emojis;

export function emojiTexto(nome: EmojiAnzy): string {
  return emojis[nome].code;
}

export function emojiComponente(nome: EmojiAnzy) {
  return { id: emojis[nome].id, name: emojis[nome].name };
}

// Compatibilidade com a integração original dos menus e botões.
export const emojiMenu = emojiComponente;
