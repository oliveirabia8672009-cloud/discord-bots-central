import {GlobalFonts} from '@napi-rs/canvas';
import {fileURLToPath} from 'node:url';
if(!GlobalFonts.registerFromPath(fileURLToPath(new URL('../../assets/fonts/NotoSans.ttf',import.meta.url)),'Anzy Sans')){
  throw Error('A fonte de imagens não foi incluída no pacote da aplicação.');
}
