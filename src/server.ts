import {app} from './app';
import {env} from './config/env';
import {db} from './config/db';
const server=app.listen(env.PORT,()=>console.log(`Operacao Service escutando em http://localhost:${env.PORT}`));
const shutdown=()=>server.close(()=>db.end().then(()=>process.exit(0)).catch(()=>process.exit(1)));
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
