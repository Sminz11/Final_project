-- DROP SCHEMA public;

CREATE SCHEMA public AUTHORIZATION pg_database_owner;

COMMENT ON SCHEMA public IS 'standard public schema';

-- DROP SEQUENCE public.audit_logs_id_seq;

CREATE SEQUENCE public.audit_logs_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.requests_id_seq;

CREATE SEQUENCE public.requests_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;-- public.audit_logs definition

-- Drop table

-- DROP TABLE public.audit_logs;

CREATE TABLE public.audit_logs (
	id bigserial NOT NULL,
	actor_sub text NOT NULL,
	"action" text NOT NULL,
	target_request_id int8 NOT NULL,
	details text NULL,
	created_at timestamptz NULL,
	user_email varchar(100) NULL,
	actor_email text NULL,
	CONSTRAINT audit_logs_pkey PRIMARY KEY (id)
);


-- public.requests definition

-- Drop table

-- DROP TABLE public.requests;

CREATE TABLE public.requests (
	id bigserial NOT NULL,
	req_code text NOT NULL,
	user_id text NOT NULL,
	title text NOT NULL,
	description text NULL,
	status text DEFAULT 'DRAFT'::text NULL,
	created_at timestamptz NULL,
	updated_at timestamptz NULL,
	requester_email text NULL,
	request_type text NOT NULL,
	target_system text NOT NULL,
	reason text NOT NULL,
	approved_by_sub text NULL,
	reject_reason text NULL,
	submitted_at timestamptz NULL,
	CONSTRAINT requests_pkey PRIMARY KEY (id)
);
CREATE UNIQUE INDEX idx_requests_req_code ON public.requests USING btree (req_code);
CREATE INDEX idx_requests_user_id ON public.requests USING btree (user_id);