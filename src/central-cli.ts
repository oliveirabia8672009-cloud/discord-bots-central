import 'dotenv/config';
import {readFileSync} from 'node:fs';
import {parse} from 'dotenv';
import {criarRegistroCentral,novoBot,validarCredencialBot} from './config/central-store.js';
async function executar(){
 const [acao,arg]=process.argv.slice(2),registro=criarRegistroCentral(process.env);
 if(acao==='add'){
  if(!arg)throw Error('Informe o caminho do arquivo privado de credenciais.');
  const e=parse(readFileSync(arg));const id=e.DISCORD_CLIENT_ID??'',token=e.DISCORD_BOT_TOKEN??'',secret=e.DISCORD_CLIENT_SECRET??'';
  const app=await validarCredencialBot(id,token);await registro.adicionar(novoBot(id,e.NOME??app.name,token,secret));
  console.log('Bot cadastrado como Em teste. Use /bots no bot principal para ativar e conferir antes de disponibilizar.');return;
 }
 if(acao==='list'){
  const bots=await registro.listar();console.log(Object.values(bots).map(b=>`${b.id} | ${b.nome} | ${b.estado} | ${b.ativo?'ativado':'pausado'}`).join('\n')||'Nenhum bot de estoque cadastrado.');return;
 }
 throw Error('Use: add caminho-do-arquivo-privado ou list.');
}
void executar().catch(e=>{console.error(e instanceof Error?e.message:'Operação não concluída.');process.exitCode=1;});
