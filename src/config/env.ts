import 'dotenv/config';
import {z} from 'zod';
export const env=z.object({
 NODE_ENV:z.enum(['development','test','production']).default('development'),
 PORT:z.coerce.number().int().default(3005),DB_HOST:z.string().default('localhost'),DB_PORT:z.coerce.number().int().default(3306),
 DB_USER:z.string(),DB_PASSWORD:z.string(),DB_NAME:z.string().default('operacao_service'),
 JWT_ACCESS_SECRET:z.string().min(32),JWT_ISSUER:z.string().default('auth-service'),JWT_AUDIENCE:z.string().default('platform-api'),
 EMPRESA_SERVICE_URL:z.string().url(),ESCALA_SERVICE_URL:z.string().url(),FREELANCER_SERVICE_URL:z.string().url(),
 HTTP_TIMEOUT_MS:z.coerce.number().int().positive().default(5000),CHECKIN_EARLY_MINUTES:z.coerce.number().int().min(0).default(60),CHECKIN_LATE_MINUTES:z.coerce.number().int().min(0).default(120)
}).parse(process.env);
