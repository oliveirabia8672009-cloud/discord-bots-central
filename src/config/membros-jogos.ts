export function vencedorVelha(tabuleiro:number[]):number|null{
 for(const [a,b,c]of [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]])if(tabuleiro[a!]&&tabuleiro[a!]===tabuleiro[b!]&&tabuleiro[a!]===tabuleiro[c!])return tabuleiro[a!]!;
 return tabuleiro.every(Boolean)?0:null;
}
export function resultadoRps(jogador:string,bot:string){if(jogador===bot)return'Empate';return({pedra:'tesoura',papel:'pedra',tesoura:'papel'} as Record<string,string>)[jogador]===bot?'Você venceu':'O bot venceu';}
export const perguntasQuiz=[
 {p:'Quanto é 8 × 7?',op:['54','56','64','49'],c:1},
 {p:'Quanto é 144 ÷ 12?',op:['10','11','12','14'],c:2},
 {p:'Quantos lados tem um hexágono?',op:['5','6','7','8'],c:1},
 {p:'Qual é a capital do Brasil?',op:['Brasília','Rio de Janeiro','São Paulo','Salvador'],c:0},
 {p:'Qual é o maior número primo destas opções?',op:['21','27','29','33'],c:2},
 {p:'Quantos minutos existem em duas horas?',op:['60','90','100','120'],c:3},
 {p:'Qual destas cores é obtida misturando azul e amarelo?',op:['Roxo','Laranja','Verde','Vermelho'],c:2},
 {p:'Qual destes animais é um mamífero?',op:['Golfinho','Tubarão','Sardinha','Polvo'],c:0},
 {p:'Qual planeta é conhecido como planeta vermelho?',op:['Vênus','Marte','Júpiter','Mercúrio'],c:1},
 {p:'Quanto é 15% de 200?',op:['15','20','25','30'],c:3},
];
