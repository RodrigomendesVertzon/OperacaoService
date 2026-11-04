CREATE DATABASE IF NOT EXISTS operacao_service CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE operacao_service;
CREATE TABLE IF NOT EXISTS operacao (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 alocacao_id BIGINT UNSIGNED NOT NULL,
 freelancer_id BIGINT UNSIGNED NOT NULL,
 freelancer_auth_user_id BIGINT UNSIGNED NOT NULL,
 empresa_id BIGINT UNSIGNED NOT NULL,
 unidade_id BIGINT UNSIGNED NOT NULL,
 setor_id BIGINT UNSIGNED NOT NULL,
 ponto_operacional_id BIGINT UNSIGNED NOT NULL,
 turno_id BIGINT UNSIGNED NOT NULL,
 qr_id BIGINT UNSIGNED NOT NULL,
 status ENUM('AGUARDANDO_APROVACAO','EM_ANDAMENTO','REJEITADA','ENCERRADA','CANCELADA') NOT NULL DEFAULT 'AGUARDANDO_APROVACAO',
 inicio_previsto DATETIME(3) NOT NULL,
 fim_previsto DATETIME(3) NOT NULL,
 checkin_em DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 checkin_lat DECIMAL(10,7) NOT NULL,
 checkin_lon DECIMAL(10,7) NOT NULL,
 checkin_distancia_m DECIMAL(12,3) NOT NULL,
 aprovado_em DATETIME(3) NULL,
 aprovado_por BIGINT UNSIGNED NULL,
 rejeitado_em DATETIME(3) NULL,
 rejeitado_por BIGINT UNSIGNED NULL,
 motivo_rejeicao VARCHAR(500) NULL,
 checkout_em DATETIME(3) NULL,
 checkout_por BIGINT UNSIGNED NULL,
 checkout_selfie_documento_id VARCHAR(150) NULL,
 checkout_selfie_validacao_id VARCHAR(150) NULL,
 checkout_motivo VARCHAR(500) NULL,
 minutos_trabalhados INT UNSIGNED NULL,
 remuneracao_modalidade ENUM('HORA','TURNO') NOT NULL,
 remuneracao_valor_base DECIMAL(12,2) NOT NULL,
 remuneracao_adicional_noturno DECIMAL(12,2) NOT NULL DEFAULT 0,
 remuneracao_estimada DECIMAL(12,2) NULL,
 versao BIGINT UNSIGNED NOT NULL DEFAULT 1,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 UNIQUE KEY uk_operacao_alocacao (alocacao_id),
 UNIQUE KEY uk_checkout_selfie_validacao (checkout_selfie_validacao_id),
 INDEX idx_operacao_empresa_status (empresa_id,status,checkin_em),
 INDEX idx_operacao_freelancer_status (freelancer_id,status),
 INDEX idx_operacao_turno (turno_id,status),
 CONSTRAINT ck_operacao_intervalo CHECK(fim_previsto>inicio_previsto),
 CONSTRAINT ck_operacao_valores CHECK(remuneracao_valor_base>=0 AND remuneracao_adicional_noturno>=0)
);
CREATE TABLE IF NOT EXISTS evidencia_operacional (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 operacao_id BIGINT UNSIGNED NOT NULL,
 tipo ENUM('CHECKIN_GEO','CHECKOUT_SELFIE','CHECKOUT_GEO','JUSTIFICATIVA') NOT NULL,
 referencia VARCHAR(255) NULL,
 metadados JSON NULL,
 criado_por BIGINT UNSIGNED NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 INDEX idx_evidencia_operacao(operacao_id,created_at),
 CONSTRAINT fk_evidencia_operacao FOREIGN KEY(operacao_id) REFERENCES operacao(id)
);
CREATE TABLE IF NOT EXISTS idempotencia (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 operacao VARCHAR(100) NOT NULL,
 chave VARCHAR(150) NOT NULL,
 actor_auth_user_id BIGINT UNSIGNED NOT NULL,
 request_hash CHAR(64) NOT NULL,
 resultado JSON NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uk_idempotencia (operacao,chave)
);
CREATE TABLE IF NOT EXISTS outbox_event (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 event_id CHAR(36) NOT NULL,
 aggregate_type VARCHAR(80) NOT NULL,
 aggregate_id BIGINT UNSIGNED NOT NULL,
 event_type VARCHAR(120) NOT NULL,
 event_version INT UNSIGNED NOT NULL DEFAULT 1,
 payload JSON NOT NULL,
 status ENUM('PENDENTE','PUBLICANDO','PUBLICADO','ERRO') NOT NULL DEFAULT 'PENDENTE',
 tentativas INT UNSIGNED NOT NULL DEFAULT 0,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uk_event_id(event_id),
 INDEX idx_outbox_pendente(status,created_at)
);
CREATE TABLE IF NOT EXISTS auditoria (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 entidade VARCHAR(80) NOT NULL,
 entidade_id BIGINT UNSIGNED NOT NULL,
 acao VARCHAR(100) NOT NULL,
 actor_auth_user_id BIGINT UNSIGNED NOT NULL,
 correlation_id VARCHAR(100) NULL,
 dados JSON NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 INDEX idx_auditoria_operacao(entidade,entidade_id,created_at)
);
DROP TRIGGER IF EXISTS trg_operacao_auditoria_no_update;
DROP TRIGGER IF EXISTS trg_operacao_auditoria_no_delete;
DELIMITER $$
CREATE TRIGGER trg_operacao_auditoria_no_update BEFORE UPDATE ON auditoria FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Auditoria imutavel'; END$$
CREATE TRIGGER trg_operacao_auditoria_no_delete BEFORE DELETE ON auditoria FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Auditoria imutavel'; END$$
DELIMITER ;
CREATE OR REPLACE VIEW vw_operacao_resumo AS SELECT empresa_id,status,COUNT(*) quantidade,COALESCE(SUM(remuneracao_estimada),0) remuneracao_estimada FROM operacao GROUP BY empresa_id,status;
