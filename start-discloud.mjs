import 'dotenv/config';
import {createServer} from 'node:http';

// The initial deployment must not connect a second Discord client.
if(process.env.ANZY_DISCLOUD_START !== 'true') {
  createServer((req,res)=>{
    res.setHeader('Content-Type','text/plain; charset=utf-8');
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.end('Anzy Programs: hospedagem em preparação. O bot ainda não foi ativado neste servidor.');
  }).listen(8080,'0.0.0.0',()=>console.log('Preparação Discloud disponível. Nenhuma conexão Discord foi iniciada.'));
} else {
  process.env.ANZY_OAUTH_HOST='0.0.0.0';
  process.env.ANZY_OAUTH_PORT='8080';
  // Aplicativos com a intenção Conteúdo da mensagem já habilitada no Discord.
  process.env.ANZY_MESSAGE_CONTENT_BOTS='1565888601903075479,1566235107029811403,1566508695754641479,1566639745071583343,1566642369162383504,1566645751071768646';
  await import('./build/index.js');
}
