import {env} from '../config/env';
import {AppError} from '../utils/AppError';
import {z} from 'zod';
// Contratos explícitos: endpoints de leitura do Escala e Freelancer ainda precisam ser publicados nos respectivos serviços.
const num=z.coerce.number().int().positive();
const qrSchema=z.object({qr:z.object({id:num}),empresa:z.object({id:num}),unidade:z.object({id:num}),setor:z.object({id:num}),ponto:z.object({id:num,latitude:z.coerce.number(),longitude:z.coerce.number(),raioOperacaoMetros:z.coerce.number().positive()})});
const alocacaoSchema=z.object({id:num,freelancerId:num,turnoId:num,empresaId:num,unidadeId:num,setorId:num,status:z.literal('ACEITA'),inicio:z.string(),fim:z.string(),modalidade:z.enum(['HORA','TURNO']),valorBase:z.coerce.number().nonnegative(),adicionalNoturno:z.coerce.number().nonnegative()});
const freelancerSchema=z.object({id:num,authUserId:num,status:z.literal('ATIVO')});
async function getJson(url:string,token:string):Promise<unknown>{
 let response:Response;
 try{response=await fetch(url,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(env.HTTP_TIMEOUT_MS)});}catch{throw new AppError(503,'DEPENDENCIA_INDISPONIVEL','Serviço externo indisponível');}
 if(!response.ok){if(response.status===404)throw new AppError(422,'REFERENCIA_NAO_ENCONTRADA','Referência não encontrada no serviço externo');if(response.status===401||response.status===403)throw new AppError(502,'AUTORIZACAO_ENTRE_SERVICOS','Integração não autorizada');throw new AppError(503,'DEPENDENCIA_INDISPONIVEL',`Serviço externo respondeu HTTP ${response.status}`);}
 try{return await response.json();}catch{throw new AppError(502,'CONTRATO_INVALIDO','Resposta inválida do serviço externo');}
}
function parseContract<T>(schema:z.ZodType<T>,value:unknown):T{const p=schema.safeParse(value);if(!p.success)throw new AppError(502,'CONTRATO_INVALIDO','Contrato do serviço externo incompatível');return p.data;}
export async function contextoQr(tokenQr:string,accessToken:string){return parseContract(qrSchema,await getJson(`${env.EMPRESA_SERVICE_URL}/v1/internal/qrcodes/${encodeURIComponent(tokenQr)}/context`,accessToken));}
export async function contextoAlocacao(id:number,accessToken:string){return parseContract(alocacaoSchema,await getJson(`${env.ESCALA_SERVICE_URL}/v1/internal/alocacoes/${id}/context`,accessToken));}
export async function contextoFreelancer(accessToken:string){return parseContract(freelancerSchema,await getJson(`${env.FREELANCER_SERVICE_URL}/v1/internal/freelancers/me/context`,accessToken));}
const selfieSchema=z.object({id:z.string().min(1),freelancerId:num,status:z.literal('APROVADA'),finalidade:z.literal('CHECKOUT'),documentoId:z.string().min(1)});
export async function validarSelfieCheckout(validacaoId:string,accessToken:string){return parseContract(selfieSchema,await getJson(`${env.FREELANCER_SERVICE_URL}/v1/internal/biometrias/validacoes/${encodeURIComponent(validacaoId)}`,accessToken));}
