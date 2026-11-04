import {createHash,randomUUID} from 'node:crypto';
import {PoolConnection,RowDataPacket,ResultSetHeader} from 'mysql2/promise';
import {db} from '../config/db';
import {env} from '../config/env';
import {AppError} from '../utils/AppError';
import {contextoAlocacao,contextoFreelancer,contextoQr,validarSelfieCheckout} from './integrations';
import {validarRaio} from './geo';
import {z} from 'zod';
const id=z.coerce.number().int().positive();
export const checkinSchema=z.object({alocacaoId:id,qrToken:z.string().uuid(),latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180)}).strict();
export const decisaoSchema=z.object({motivo:z.string().min(5).max(500).optional()}).strict();
export const checkoutSchema=z.object({validacaoSelfieId:z.string().min(1).max(150),motivo:z.string().min(5).max(500).optional(),latitude:z.number().min(-90).max(90).optional(),longitude:z.number().min(-180).max(180).optional()}).strict().refine(x=>(x.latitude===undefined)===(x.longitude===undefined),{message:'Latitude e longitude devem ser informadas juntas'});
export type Actor={userId:number;role:string};
const gestor=(a:Actor)=>['ADMIN_PLATAFORMA','ADMIN_EMPRESA','GERENTE_EMPRESA'].includes(a.role);
function assertGestor(a:Actor){if(!gestor(a))throw new AppError(403,'ACESSO_NEGADO','Apenas administradores e gerentes podem executar esta ação');}
function asDate(x:string){const d=new Date(x);if(!Number.isFinite(d.getTime()))throw new AppError(502,'DATA_INVALIDA','Data inválida no contrato do Escala');return d;}
async function inTransaction<T>(fn:(c:PoolConnection)=>Promise<T>):Promise<T>{const c=await db.getConnection();try{await c.beginTransaction();const r=await fn(c);await c.commit();return r;}catch(e){await c.rollback();throw e;}finally{c.release();}}
async function audit(c:PoolConnection,operacaoId:number,acao:string,actor:Actor,correlationId:string,dados:unknown){await c.execute('INSERT INTO auditoria(entidade,entidade_id,acao,actor_auth_user_id,correlation_id,dados) VALUES (?,?,?,?,?,?)',['operacao',operacaoId,acao,actor.userId,correlationId,JSON.stringify(dados)]);}
async function event(c:PoolConnection,operacaoId:number,tipo:string,payload:unknown){await c.execute('INSERT INTO outbox_event(event_id,aggregate_type,aggregate_id,event_type,payload) VALUES (?,?,?,?,?)',[randomUUID(),'operacao',operacaoId,tipo,JSON.stringify(payload)]);}
async function locked(c:PoolConnection,operacaoId:number){const [rows]=await c.execute<RowDataPacket[]>('SELECT * FROM operacao WHERE id=? FOR UPDATE',[operacaoId]);if(!rows.length)throw new AppError(404,'OPERACAO_NAO_ENCONTRADA','Operação não encontrada');return rows[0];}
async function assertEmpresaAccess(a:Actor,empresaId:number){
 assertGestor(a);
 // Segurança: sem vínculo empresa-usuário validado, só ADMIN_PLATAFORMA pode atuar.
 // TODO: consultar vínculo/escopo no Empresa Service para ADMIN_EMPRESA e GERENTE_EMPRESA.
 if(a.role!=='ADMIN_PLATAFORMA')throw new AppError(403,'VINCULO_EMPRESA_NAO_VALIDADO','Integração de autorização por empresa ainda não configurada');
}
export async function checkin(input:unknown,actor:Actor,token:string,correlationId:string,key:string){
 const b=checkinSchema.parse(input);
 if(!key||key.length>150)throw new AppError(400,'IDEMPOTENCY_KEY_OBRIGATORIA','Envie Idempotency-Key (até 150 caracteres)');
 const [freelancer,alocacao,qr]=await Promise.all([contextoFreelancer(token),contextoAlocacao(b.alocacaoId,token),contextoQr(b.qrToken,token)]);
 if(freelancer.authUserId!==actor.userId||alocacao.freelancerId!==freelancer.id)throw new AppError(403,'FREELANCER_NAO_AUTORIZADO','Alocação não pertence ao usuário');
 if(alocacao.empresaId!==qr.empresa.id||alocacao.unidadeId!==qr.unidade.id||alocacao.setorId!==qr.setor.id)throw new AppError(422,'QR_NAO_CORRESPONDE_ESCALA','QR não corresponde ao local da escala');
 const inicio=asDate(alocacao.inicio),fim=asDate(alocacao.fim),agora=new Date();
 if(fim<=inicio)throw new AppError(502,'ESCALA_INVALIDA','Intervalo inválido');
 if(agora.getTime()<inicio.getTime()-env.CHECKIN_EARLY_MINUTES*60000||agora.getTime()>inicio.getTime()+env.CHECKIN_LATE_MINUTES*60000)throw new AppError(422,'FORA_DA_JANELA_CHECKIN','Check-in fora da janela permitida');
 const distancia=validarRaio(b.latitude,b.longitude,qr.ponto.latitude,qr.ponto.longitude,qr.ponto.raioOperacaoMetros);
 const hash=createHash('sha256').update(JSON.stringify({actor:actor.userId,b})).digest('hex');
 return inTransaction(async c=>{
  const [existing]=await c.execute<RowDataPacket[]>('SELECT * FROM idempotencia WHERE operacao=? AND chave=? FOR UPDATE',['CHECKIN',key]);
  if(existing.length){if(existing[0].actor_auth_user_id!==actor.userId||existing[0].request_hash!==hash)throw new AppError(409,'IDEMPOTENCIA_CONFLITO','Chave reutilizada com payload ou usuário diferente');return typeof existing[0].resultado==='string'?JSON.parse(existing[0].resultado):existing[0].resultado;}
  const [same]=await c.execute<RowDataPacket[]>('SELECT id FROM operacao WHERE alocacao_id=? LIMIT 1',[b.alocacaoId]);if(same.length)throw new AppError(409,'CHECKIN_JA_REALIZADO','Já existe operação para esta alocação');
  const [r]=await c.execute<ResultSetHeader>(`INSERT INTO operacao(alocacao_id,freelancer_id,freelancer_auth_user_id,empresa_id,unidade_id,setor_id,ponto_operacional_id,turno_id,qr_id,inicio_previsto,fim_previsto,checkin_lat,checkin_lon,checkin_distancia_m,remuneracao_modalidade,remuneracao_valor_base,remuneracao_adicional_noturno) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[alocacao.id,freelancer.id,actor.userId,qr.empresa.id,qr.unidade.id,qr.setor.id,qr.ponto.id,alocacao.turnoId,qr.qr.id,inicio.toISOString().slice(0,23).replace('T',' '),fim.toISOString().slice(0,23).replace('T',' '),b.latitude,b.longitude,distancia,alocacao.modalidade,alocacao.valorBase,alocacao.adicionalNoturno]);
  const operacaoId=r.insertId;
  await c.execute('INSERT INTO evidencia_operacional(operacao_id,tipo,metadados,criado_por) VALUES (?,?,?,?)',[operacaoId,'CHECKIN_GEO',JSON.stringify({latitude:b.latitude,longitude:b.longitude,distanciaMetros:distancia}),actor.userId]);
  await audit(c,operacaoId,'CHECKIN',actor,correlationId,{alocacaoId:b.alocacaoId,distanciaMetros:distancia});
  await event(c,operacaoId,'operacao.checkin_solicitado.v1',{operacaoId,empresaId:qr.empresa.id,freelancerId:freelancer.id,turnoId:alocacao.turnoId,status:'AGUARDANDO_APROVACAO'});
  const result={id:operacaoId,status:'AGUARDANDO_APROVACAO',distanciaMetros:distancia};
  await c.execute('INSERT INTO idempotencia(operacao,chave,actor_auth_user_id,request_hash,resultado) VALUES (?,?,?,?,?)',['CHECKIN',key,actor.userId,hash,JSON.stringify(result)]);
  return result;
 });
}
export async function decidir(operacaoId:number,aprovar:boolean,body:unknown,actor:Actor,correlationId:string){
 const b=decisaoSchema.parse(body);if(!aprovar&&!b.motivo)throw new AppError(400,'MOTIVO_OBRIGATORIO','Informe o motivo da rejeição');
 return inTransaction(async c=>{
  const op=await locked(c,operacaoId);await assertEmpresaAccess(actor,op.empresa_id);
  if(op.status!=='AGUARDANDO_APROVACAO')throw new AppError(409,'TRANSICAO_INVALIDA','Operação não está aguardando aprovação');
  const status=aprovar?'EM_ANDAMENTO':'REJEITADA';
  if(aprovar)await c.execute("UPDATE operacao SET status='EM_ANDAMENTO',aprovado_em=UTC_TIMESTAMP(3),aprovado_por=?,versao=versao+1 WHERE id=?",[actor.userId,operacaoId]);
  else await c.execute("UPDATE operacao SET status='REJEITADA',rejeitado_em=UTC_TIMESTAMP(3),rejeitado_por=?,motivo_rejeicao=?,versao=versao+1 WHERE id=?",[actor.userId,b.motivo,operacaoId]);
  await audit(c,operacaoId,aprovar?'APROVACAO':'REJEICAO',actor,correlationId,b);
  await event(c,operacaoId,aprovar?'operacao.aprovada.v1':'operacao.rejeitada.v1',{operacaoId,empresaId:op.empresa_id,freelancerId:op.freelancer_id,alocacaoId:op.alocacao_id,status,motivo:b.motivo});
  // O Financeiro deve consumir operacao.aprovada.v1 com idempotência e efetuar débito; não cobramos no banco de Operação.
  return {id:operacaoId,status};
 });
}
export async function checkout(operacaoId:number,body:unknown,actor:Actor,token:string,correlationId:string){
 const b=checkoutSchema.parse(body);
 // Selfie validada no serviço responsável; nunca confiar em um boolean enviado pelo cliente.
 const validacao=await validarSelfieCheckout(b.validacaoSelfieId,token);
 return inTransaction(async c=>{
  const op=await locked(c,operacaoId);
  if(op.status!=='EM_ANDAMENTO')throw new AppError(409,'TRANSICAO_INVALIDA','Somente operação em andamento pode ser encerrada');
  if(op.freelancer_auth_user_id!==actor.userId){await assertEmpresaAccess(actor,op.empresa_id);}
  if(validacao.freelancerId!==op.freelancer_id)throw new AppError(403,'SELFIE_NAO_CORRESPONDE','Selfie não pertence ao freelancer desta operação');
  const [used]=await c.execute<RowDataPacket[]>('SELECT id FROM operacao WHERE checkout_selfie_validacao_id=? LIMIT 1',[validacao.id]);if(used.length)throw new AppError(409,'SELFIE_JA_UTILIZADA','Validação biométrica já utilizada');
  const [clock]=await c.query<RowDataPacket[]>('SELECT UTC_TIMESTAMP(3) AS agora');const agora=String(clock[0].agora);
  const inicio=new Date(String(op.aprovado_em).replace(' ','T')+'Z');const fim=new Date(agora.replace(' ','T')+'Z');
  const minutos=Math.max(0,Math.floor((fim.getTime()-inicio.getTime())/60000));
  const previsto=Math.max(1,(new Date(String(op.fim_previsto).replace(' ','T')+'Z').getTime()-new Date(String(op.inicio_previsto).replace(' ','T')+'Z').getTime())/60000);
  const base=Number(op.remuneracao_valor_base),adicional=Number(op.remuneracao_adicional_noturno);
  // Estimativa; Financeiro aplica política contratual final, arredondamentos, bônus e adicionais.
  const estimativa=Math.round((op.remuneracao_modalidade==='HORA'?base*minutos/60:base*Math.min(1,minutos/previsto))*100)/100;
  await c.execute("UPDATE operacao SET status='ENCERRADA',checkout_em=UTC_TIMESTAMP(3),checkout_por=?,checkout_selfie_documento_id=?,checkout_selfie_validacao_id=?,checkout_motivo=?,minutos_trabalhados=?,remuneracao_estimada=?,versao=versao+1 WHERE id=?",[actor.userId,validacao.documentoId,validacao.id,b.motivo||null,minutos,estimativa,operacaoId]);
  await c.execute('INSERT INTO evidencia_operacional(operacao_id,tipo,referencia,metadados,criado_por) VALUES (?,?,?,?,?)',[operacaoId,'CHECKOUT_SELFIE',validacao.documentoId,JSON.stringify({validacaoId:validacao.id,adicionalNoturnoPlanejado:adicional}),actor.userId]);
  if(b.latitude!==undefined&&b.longitude!==undefined)await c.execute('INSERT INTO evidencia_operacional(operacao_id,tipo,metadados,criado_por) VALUES (?,?,?,?)',[operacaoId,'CHECKOUT_GEO',JSON.stringify({latitude:b.latitude,longitude:b.longitude}),actor.userId]);
  await audit(c,operacaoId,'CHECKOUT',actor,correlationId,{validacaoId:validacao.id,minutos,estimativa});
  await event(c,operacaoId,'operacao.encerrada.v1',{operacaoId,empresaId:op.empresa_id,freelancerId:op.freelancer_id,alocacaoId:op.alocacao_id,checkoutPor:actor.userId,minutosTrabalhados:minutos,remuneracaoEstimada:estimativa,validacaoSelfieId:validacao.id});
  return {id:operacaoId,status:'ENCERRADA',minutosTrabalhados:minutos,remuneracaoEstimada:estimativa,observacao:'Valor estimado; pagamento depende do Financeiro'};
 });
}
export async function detalhe(operacaoId:number,actor:Actor){const [rows]=await db.execute<RowDataPacket[]>('SELECT * FROM operacao WHERE id=?',[operacaoId]);if(!rows.length)throw new AppError(404,'OPERACAO_NAO_ENCONTRADA','Operação não encontrada');const op=rows[0];if(actor.userId!==op.freelancer_auth_user_id)await assertEmpresaAccess(actor,op.empresa_id);return op;}
export async function listar(empresaId:number,actor:Actor,status?:string){await assertEmpresaAccess(actor,empresaId);const params:unknown[]=[empresaId];let sql='SELECT * FROM operacao WHERE empresa_id=?';if(status){sql+=' AND status=?';params.push(status);}sql+=' ORDER BY checkin_em DESC LIMIT 100';const [rows]=await db.query<RowDataPacket[]>(sql,params);return rows;}
