# Operação Service — Plataforma de Freelancers

Serviço Node.js + TypeScript + Express + MySQL 8, porta **3005**.

## Instalação (PowerShell)

```powershell
cd C:\Projetos\OperacaoService
Copy-Item .env.example .env
notepad .env
npm install
npm run build
npm test
npm run dev
Invoke-RestMethod http://localhost:3005/health/ready
```

Execute `sql/001_init.sql` no MySQL Workbench antes do health check. Configure `JWT_ACCESS_SECRET` exatamente como no Auth Service.

## Endpoints

| Método | Endpoint | Finalidade |
|---|---|---|
| GET | `/health/live` | Liveness |
| GET | `/health/ready` | MySQL readiness |
| POST | `/v1/checkins` | Cria solicitação de check-in; requer `Idempotency-Key` |
| GET | `/v1/operacoes?empresaId=1` | Lista operações da empresa |
| GET | `/v1/operacoes/:id` | Detalhe com autorização |
| POST | `/v1/operacoes/:id/aprovar` | Aprovação gerencial; evento de ativação |
| POST | `/v1/operacoes/:id/rejeitar` | Rejeição com motivo |
| POST | `/v1/operacoes/:id/checkout` | Encerramento com selfie aprovada |

Check-in JSON: `{"alocacaoId":1,"qrToken":"66929fae-d339-11f1-bc8f-d6d9638a475b","latitude":-23.5226,"longitude":-46.835}`.

Aprovar JSON: `{}`. Rejeitar JSON: `{"motivo":"Ausência de confirmação de presença"}`.

Checkout JSON: `{"validacaoSelfieId":"identificador-da-validacao-aprovada","motivo":"Encerramento normal"}`.

## Contratos de integração obrigatórios (a implementar/ajustar)

**IMPORTANTE: não inventamos respostas nem acessamos bancos de outros serviços.** O serviço falha de modo fechado (502/503) quando uma integração não existe ou seu contrato difere. É necessário publicar os seguintes endpoints nos serviços existentes, protegidos por autorização adequada:

1. **Empresa** `GET /v1/internal/qrcodes/:token/context` (já criado anteriormente). O adaptador `src/services/integrations.ts` espera JSON mínimo:
```json
{"qr":{"id":1},"empresa":{"id":1},"unidade":{"id":3},"setor":{"id":1},"ponto":{"id":1,"latitude":-23.5226,"longitude":-46.835,"raioOperacaoMetros":50}}
```
O contexto real pode usar outros nomes; ajuste o adaptador após confirmar a resposta. Empresa deve garantir QR ativo, vigente e ponto/setor/unidade/empresa ativos.

2. **Escala** `GET /v1/internal/alocacoes/:id/context` (**a criar**), retornando:
```json
{"id":1,"freelancerId":1,"turnoId":1,"empresaId":1,"unidadeId":3,"setorId":1,"status":"ACEITA","inicio":"2026-11-04T08:00:00-03:00","fim":"2026-11-04T16:00:00-03:00","modalidade":"TURNO","valorBase":150,"adicionalNoturno":0}
```
Escala deve verificar aceite válido, ausência de pendências de alteração, turno publicado e vínculo entre vaga/alocação.

3. **Freelancer** `GET /v1/internal/freelancers/me/context` (**a criar**), retornando `{"id":1,"authUserId":123,"status":"ATIVO"}`; `authUserId` deve vir de token autenticado, nunca do cliente.

4. **Freelancer/biometria** `GET /v1/internal/biometrias/validacoes/:id` (**a criar**), retornando `{"id":"validacao-123","freelancerId":1,"status":"APROVADA","finalidade":"CHECKOUT","documentoId":"documento-456"}`. Validação deve ter expiração curta, vínculo com a operação e proteção contra replay no serviço biométrico. O Operação impede reutilização em outra operação quando armazenada, mas a reserva/consumo atômico deve ser implementada no serviço biométrico.

**Segurança:** a implementação de desenvolvimento repassa o JWT do usuário para as consultas. Antes de produção, use identidade de serviço específica (JWT com audiência e escopos, ou mTLS) e autorização por empresa/gestor no Empresa Service. Por segurança, apenas `ADMIN_PLATAFORMA` pode aprovar/rejeitar neste estágio; papéis empresariais ficam bloqueados até validação de vínculo.

## Regras implementadas

- Check-in cria **AGUARDANDO_APROVACAO** e **não** debita tarifa.
- QR, alocação aceita, freelancer ativo, IDs de empresa/unidade/setor, janela de horário e raio geográfico validados antes de gravar.
- Chave de idempotência de check-in, vínculo único por alocação e transação com auditoria + Outbox.
- Aprovação muda para **EM_ANDAMENTO** e grava `operacao.aprovada.v1` para consumo financeiro idempotente futuro; **não há cobrança efetiva ainda**.
- Rejeição exige motivo e produz evento.
- Checkout requer prova biométrica aprovada consultada em serviço externo, registra iniciador e finalizador, minutos e estimativa proporcional, além de evento `operacao.encerrada.v1`.
- **Não** envia WhatsApp, transfere saldo, calcula bônus ou liquida remuneração: integrações posteriores de Notificação e Financeiro.
- Auditoria append-only via triggers. Não armazena imagem de selfie no banco, apenas referências.

## Limitações e pendências para homologação

- Contratos de leitura internos no Escala/Freelancer, mapeamento do retorno real do QR, autorização empresa-gestor.
- Publicador Outbox para Kafka, consumidores Financeiro/Notificação, retries e DLQ.
- Validação de identidade biométrica com prova de liveness e uso único atômico.
- Cálculo de remuneração aqui é **estimativa**, sem adicional noturno, bônus, descontos, regras de arredondamento/intervalo. Financeiro calcula valor final.
- Segurança de localização do dispositivo: geofence por GPS do cliente não impede falsificação; usar mecanismos de antifraude adicionais.
- Testes integrados, concorrência, DST/fuso horário, geofence e carga; testes unitários iniciais apenas para geolocalização.
- Para evitar corrida entre chamadas com chaves de idempotência diferentes, `uk_operacao_alocacao` impõe unicidade e responde 409; chamadas simultâneas com a **mesma** chave podem resultar em 409 no primeiro instante em vez de replay, dependendo do isolamento do MySQL.
"# OperacaoService" 
