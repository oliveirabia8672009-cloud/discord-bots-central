import 'dotenv/config';
import {configNuvem,criarCopiaNuvem,abrirCopia} from './nuvem.js';

async function executar(){
  const acao=process.argv[2];
  if(!['backup','check','restore'].includes(acao??''))throw Error('Use backup, check ou restore.');
  const op=configNuvem({...process.env,ANZY_CLOUD_BACKUP:'true'});if(!op)throw Error('Configuração incompleta.');
  const nuvem=criarCopiaNuvem(op);
  if(acao==='check'){
    const remoto=await nuvem.ler();if(!remoto)throw Error('Cópia ainda não encontrada.');
    const copia=abrirCopia(remoto.payload,op.chave,op.bot);
    console.log(`Cópia validada: ${copia.arquivos.length} arquivos; revisão ${remoto.revision}; ${remoto.payload.criado}.`);return;
  }
  await nuvem.preparar(acao==='restore');
  if(acao==='restore'){console.log('Dados recuperados na pasta vazia.');return;}
  await nuvem.salvar();console.log('Cópia criptografada enviada ao Supabase.');
}
void executar().catch(()=>{console.error('Operação não concluída. Confira a configuração, conexão, chave de recuperação e se a pasta de destino está vazia para restaurar.');process.exitCode=1;});
