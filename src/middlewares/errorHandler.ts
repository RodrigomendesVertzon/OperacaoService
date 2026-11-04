import {ErrorRequestHandler,RequestHandler} from 'express';
import {ZodError} from 'zod';
import {AppError} from '../utils/AppError';
import {randomUUID} from 'node:crypto';
export const correlationId:RequestHandler=(req,res,next)=>{req.correlationId=String(req.header('X-Correlation-Id')||randomUUID()).slice(0,100);res.setHeader('X-Correlation-Id',req.correlationId);next();};
export const notFound:RequestHandler=(req,_res,next)=>next(new AppError(404,'ROTA_NAO_ENCONTRADA',`Rota ${req.method} ${req.path} não encontrada`));
export const errorHandler:ErrorRequestHandler=(error,req,res,_next)=>{
 if(error instanceof ZodError){res.status(400).json({error:'DADOS_INVALIDOS',issues:error.issues,correlationId:req.correlationId});return;}
 if(error instanceof AppError){res.status(error.status).json({error:error.code,message:error.message,correlationId:req.correlationId});return;}
 const code=String(error?.code||'');
 if(code==='ER_DUP_ENTRY'){res.status(409).json({error:'REGISTRO_DUPLICADO',correlationId:req.correlationId});return;}
 console.error({correlationId:req.correlationId,error});res.status(500).json({error:'ERRO_INTERNO',message:'Erro interno',correlationId:req.correlationId});
};
