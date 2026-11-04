# Execute após configurar contratos internos e iniciar Auth, Empresa, Escala, Freelancer e Operação.
$BASE = 'http://localhost:3005'
Invoke-RestMethod "$BASE/health/live"
Invoke-RestMethod "$BASE/health/ready"
# $TOKEN deve ser obtido via POST http://localhost:3001/v1/auth/login.
# Para check-in, use o token do PRÓPRIO freelancer, não o token de admin.
# $FREELANCER_TOKEN = '<jwt do freelancer>'
# $body = @{ alocacaoId=1; qrToken='66929fae-d339-11f1-bc8f-d6d9638a475b'; latitude=-23.5226; longitude=-46.835 } | ConvertTo-Json
# Invoke-RestMethod -Method POST -Uri "$BASE/v1/checkins" -Headers @{Authorization="Bearer $FREELANCER_TOKEN";'Idempotency-Key'=[guid]::NewGuid().ToString()} -ContentType 'application/json' -Body $body
# Para aprovação, use $TOKEN de ADMIN_PLATAFORMA e ID retornado no check-in:
# Invoke-RestMethod -Method POST -Uri "$BASE/v1/operacoes/1/aprovar" -Headers @{Authorization="Bearer $TOKEN"} -ContentType 'application/json' -Body '{}'
# Checkout depende de validação biométrica real aprovada no Freelancer Service.
