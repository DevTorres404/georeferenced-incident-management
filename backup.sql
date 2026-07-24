--
-- PostgreSQL database dump
--

-- Dumped from database version 16.4
-- Dumped by pg_dump version 16.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: audit; Type: SCHEMA; Schema: -; Owner: user_im
--

CREATE SCHEMA audit;


ALTER SCHEMA audit OWNER TO user_im;

--
-- Name: auth; Type: SCHEMA; Schema: -; Owner: user_im
--

CREATE SCHEMA auth;


ALTER SCHEMA auth OWNER TO user_im;

--
-- Name: core; Type: SCHEMA; Schema: -; Owner: user_im
--

CREATE SCHEMA core;


ALTER SCHEMA core OWNER TO user_im;

--
-- Name: postgis; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;


--
-- Name: EXTENSION postgis; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION postgis IS 'PostGIS geometry and geography spatial types and functions';


--
-- Name: origen_operacion; Type: TYPE; Schema: audit; Owner: user_im
--

CREATE TYPE audit.origen_operacion AS ENUM (
    'WEB',
    'API',
    'SYSTEM',
    'CRON'
);


ALTER TYPE audit.origen_operacion OWNER TO user_im;

--
-- Name: tipo_accion; Type: TYPE; Schema: audit; Owner: user_im
--

CREATE TYPE audit.tipo_accion AS ENUM (
    'INSERT',
    'UPDATE',
    'DELETE'
);


ALTER TYPE audit.tipo_accion OWNER TO user_im;

--
-- Name: notification_type; Type: TYPE; Schema: core; Owner: user_im
--

CREATE TYPE core.notification_type AS ENUM (
    'INCIDENT_ASSIGNED',
    'INCIDENT_CLOSED',
    'NEW_COMMENT',
    'STATUS_CHANGE',
    'INCIDENT_OVERDUE'
);


ALTER TYPE core.notification_type OWNER TO user_im;

--
-- Name: actualizar_ubicacion(); Type: FUNCTION; Schema: core; Owner: user_im
--

CREATE FUNCTION core.actualizar_ubicacion() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
            BEGIN
                -- Caso 1: Se proporcionan lat/lng → generar geometría
                IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
                    NEW.location := ST_SetSRID(
                        ST_MakePoint(NEW.longitude, NEW.latitude),
                        4326
                    );

                -- Caso 2: Se proporciona geometría sin lat/lng → extraer coordenadas
                ELSIF NEW.location IS NOT NULL
                      AND NEW.latitude IS NULL
                      AND NEW.longitude IS NULL THEN
                    NEW.latitude  := ST_Y(NEW.location);
                    NEW.longitude := ST_X(NEW.location);
                END IF;

                RETURN NEW;
            END;
            $$;


ALTER FUNCTION core.actualizar_ubicacion() OWNER TO user_im;

--
-- Name: calcular_fecha_limite(); Type: FUNCTION; Schema: core; Owner: user_im
--

CREATE FUNCTION core.calcular_fecha_limite() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
            DECLARE
                v_sla_horas SMALLINT;
            BEGIN
                IF (TG_OP = 'INSERT')
                   OR (TG_OP = 'UPDATE' AND OLD.priority_id IS DISTINCT FROM NEW.priority_id)
                THEN
                    IF NEW.priority_id IS NULL THEN
                        NEW.due_date := NULL;
                        RETURN NEW;
                    END IF;

                    SELECT sla_hours INTO v_sla_horas
                    FROM core.priorities
                    WHERE id = NEW.priority_id;

                    NEW.due_date := COALESCE(NEW.created_at, NOW())
                                        + (v_sla_horas || ' hours')::INTERVAL;
                END IF;

                RETURN NEW;
            END;
            $$;


ALTER FUNCTION core.calcular_fecha_limite() OWNER TO user_im;

--
-- Name: sincronizar_asignacion_actual(); Type: FUNCTION; Schema: core; Owner: user_im
--

CREATE FUNCTION core.sincronizar_asignacion_actual() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
            DECLARE
                v_incident_id BIGINT;
            BEGIN
                IF TG_OP = 'DELETE' THEN
                    v_incident_id := OLD.incident_id;
                ELSE
                    v_incident_id := NEW.incident_id;
                END IF;

                IF TG_OP = 'INSERT'
                   AND NEW.active = true
                   AND NEW.assignment_role = 'primary'
                THEN
                    UPDATE core.incident_assignments
                    SET active = false,
                        unassignment_date = COALESCE(unassignment_date, NOW()),
                        updated_at = NOW()
                    WHERE incident_id = NEW.incident_id
                      AND id != NEW.id
                      AND active = true
                      AND assignment_role = 'primary';
                END IF;

                IF TG_OP = 'UPDATE'
                   AND NEW.active = false
                   AND NEW.unassignment_date IS NULL
                THEN
                    NEW.unassignment_date := NOW();
                END IF;

                UPDATE core.incidents
                SET current_assigned_id = (
                    SELECT user_id
                    FROM core.incident_assignments
                    WHERE incident_id = v_incident_id
                      AND active = true
                      AND assignment_role = 'primary'
                    ORDER BY assignment_date DESC, id DESC
                    LIMIT 1
                )
                WHERE id = v_incident_id;

                IF TG_OP = 'DELETE' THEN
                    RETURN OLD;
                END IF;

                RETURN NEW;
            END;
            $$;


ALTER FUNCTION core.sincronizar_asignacion_actual() OWNER TO user_im;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: access_logs; Type: TABLE; Schema: audit; Owner: user_im
--

CREATE TABLE audit.access_logs (
    id bigint NOT NULL,
    email character varying(255) NOT NULL,
    user_id bigint,
    login_type character varying(50) DEFAULT 'email'::character varying NOT NULL,
    is_success boolean DEFAULT false NOT NULL,
    failure_reason character varying(255),
    session_id character varying(255),
    ip_address character varying(45),
    user_agent text,
    created_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE audit.access_logs OWNER TO user_im;

--
-- Name: COLUMN access_logs.user_id; Type: COMMENT; Schema: audit; Owner: user_im
--

COMMENT ON COLUMN audit.access_logs.user_id IS 'Usuario relacionado al acceso, si existe';


--
-- Name: COLUMN access_logs.login_type; Type: COMMENT; Schema: audit; Owner: user_im
--

COMMENT ON COLUMN audit.access_logs.login_type IS 'email, google, 2fa, etc.';


--
-- Name: COLUMN access_logs.failure_reason; Type: COMMENT; Schema: audit; Owner: user_im
--

COMMENT ON COLUMN audit.access_logs.failure_reason IS 'Razón del fallo si is_success es falso';


--
-- Name: COLUMN access_logs.session_id; Type: COMMENT; Schema: audit; Owner: user_im
--

COMMENT ON COLUMN audit.access_logs.session_id IS 'ID de la sesión o token para rastreo cruzado';


--
-- Name: access_logs_id_seq; Type: SEQUENCE; Schema: audit; Owner: user_im
--

CREATE SEQUENCE audit.access_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE audit.access_logs_id_seq OWNER TO user_im;

--
-- Name: access_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: audit; Owner: user_im
--

ALTER SEQUENCE audit.access_logs_id_seq OWNED BY audit.access_logs.id;


--
-- Name: audit_logs; Type: TABLE; Schema: audit; Owner: user_im
--

CREATE TABLE audit.audit_logs (
    id bigint NOT NULL,
    auditable_type character varying(255) NOT NULL,
    auditable_id bigint NOT NULL,
    event character varying(50) NOT NULL,
    old_values jsonb,
    new_values jsonb,
    url character varying(255),
    user_id bigint,
    ip_address character varying(45),
    user_agent text,
    tags jsonb,
    created_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE audit.audit_logs OWNER TO user_im;

--
-- Name: COLUMN audit_logs.auditable_type; Type: COMMENT; Schema: audit; Owner: user_im
--

COMMENT ON COLUMN audit.audit_logs.auditable_type IS 'Clase del modelo Eloquent afectado';


--
-- Name: COLUMN audit_logs.auditable_id; Type: COMMENT; Schema: audit; Owner: user_im
--

COMMENT ON COLUMN audit.audit_logs.auditable_id IS 'ID del registro afectado';


--
-- Name: COLUMN audit_logs.event; Type: COMMENT; Schema: audit; Owner: user_im
--

COMMENT ON COLUMN audit.audit_logs.event IS 'Evento que disparó la auditoría';


--
-- Name: COLUMN audit_logs.old_values; Type: COMMENT; Schema: audit; Owner: user_im
--

COMMENT ON COLUMN audit.audit_logs.old_values IS 'Snapshot del registro ANTES del cambio';


--
-- Name: COLUMN audit_logs.new_values; Type: COMMENT; Schema: audit; Owner: user_im
--

COMMENT ON COLUMN audit.audit_logs.new_values IS 'Snapshot del registro DESPUÉS del cambio o los datos modificados';


--
-- Name: COLUMN audit_logs.url; Type: COMMENT; Schema: audit; Owner: user_im
--

COMMENT ON COLUMN audit.audit_logs.url IS 'URL/Endpoint que originó el cambio';


--
-- Name: COLUMN audit_logs.user_id; Type: COMMENT; Schema: audit; Owner: user_im
--

COMMENT ON COLUMN audit.audit_logs.user_id IS 'Usuario que realizó la acción. NULL para sistema/crons';


--
-- Name: COLUMN audit_logs.ip_address; Type: COMMENT; Schema: audit; Owner: user_im
--

COMMENT ON COLUMN audit.audit_logs.ip_address IS 'IPv4 o IPv6 del cliente';


--
-- Name: COLUMN audit_logs.tags; Type: COMMENT; Schema: audit; Owner: user_im
--

COMMENT ON COLUMN audit.audit_logs.tags IS 'Etiquetas opcionales de categorización';


--
-- Name: audit_logs_id_seq; Type: SEQUENCE; Schema: audit; Owner: user_im
--

CREATE SEQUENCE audit.audit_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE audit.audit_logs_id_seq OWNER TO user_im;

--
-- Name: audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: audit; Owner: user_im
--

ALTER SEQUENCE audit.audit_logs_id_seq OWNED BY audit.audit_logs.id;


--
-- Name: navigation_items; Type: TABLE; Schema: auth; Owner: user_im
--

CREATE TABLE auth.navigation_items (
    id bigint NOT NULL,
    parent_id bigint,
    code character varying(80) NOT NULL,
    label character varying(120) NOT NULL,
    icon character varying(80),
    route character varying(160),
    permission_code character varying(120),
    sort_order smallint DEFAULT '0'::smallint NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


ALTER TABLE auth.navigation_items OWNER TO user_im;

--
-- Name: navigation_items_id_seq; Type: SEQUENCE; Schema: auth; Owner: user_im
--

CREATE SEQUENCE auth.navigation_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE auth.navigation_items_id_seq OWNER TO user_im;

--
-- Name: navigation_items_id_seq; Type: SEQUENCE OWNED BY; Schema: auth; Owner: user_im
--

ALTER SEQUENCE auth.navigation_items_id_seq OWNED BY auth.navigation_items.id;


--
-- Name: operator_profiles; Type: TABLE; Schema: auth; Owner: user_im
--

CREATE TABLE auth.operator_profiles (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    incident_capacity integer DEFAULT 20 NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    max_active_incidents smallint DEFAULT '10'::smallint NOT NULL,
    max_workload_points smallint DEFAULT '20'::smallint NOT NULL,
    active boolean DEFAULT true NOT NULL,
    CONSTRAINT chk_operator_profiles_incident_capacity CHECK ((incident_capacity > 0)),
    CONSTRAINT chk_operator_profiles_max_active_incidents CHECK ((max_active_incidents > 0)),
    CONSTRAINT chk_operator_profiles_max_workload_points CHECK ((max_workload_points > 0))
);


ALTER TABLE auth.operator_profiles OWNER TO user_im;

--
-- Name: operator_profiles_id_seq; Type: SEQUENCE; Schema: auth; Owner: user_im
--

CREATE SEQUENCE auth.operator_profiles_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE auth.operator_profiles_id_seq OWNER TO user_im;

--
-- Name: operator_profiles_id_seq; Type: SEQUENCE OWNED BY; Schema: auth; Owner: user_im
--

ALTER SEQUENCE auth.operator_profiles_id_seq OWNED BY auth.operator_profiles.id;


--
-- Name: password_reset_tokens; Type: TABLE; Schema: auth; Owner: user_im
--

CREATE TABLE auth.password_reset_tokens (
    email character varying(255) NOT NULL,
    token character varying(255) NOT NULL,
    created_at timestamp(0) without time zone,
    expires_at timestamp(0) without time zone,
    attempts smallint DEFAULT '0'::smallint NOT NULL,
    used_at timestamp(0) without time zone
);


ALTER TABLE auth.password_reset_tokens OWNER TO user_im;

--
-- Name: permission_role; Type: TABLE; Schema: auth; Owner: user_im
--

CREATE TABLE auth.permission_role (
    id bigint NOT NULL,
    permission_id bigint NOT NULL,
    role_id bigint NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


ALTER TABLE auth.permission_role OWNER TO user_im;

--
-- Name: permission_role_id_seq; Type: SEQUENCE; Schema: auth; Owner: user_im
--

CREATE SEQUENCE auth.permission_role_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE auth.permission_role_id_seq OWNER TO user_im;

--
-- Name: permission_role_id_seq; Type: SEQUENCE OWNED BY; Schema: auth; Owner: user_im
--

ALTER SEQUENCE auth.permission_role_id_seq OWNED BY auth.permission_role.id;


--
-- Name: permissions; Type: TABLE; Schema: auth; Owner: user_im
--

CREATE TABLE auth.permissions (
    id bigint NOT NULL,
    code character varying(100) NOT NULL,
    name character varying(100) NOT NULL,
    description character varying(255),
    module character varying(50) NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


ALTER TABLE auth.permissions OWNER TO user_im;

--
-- Name: COLUMN permissions.code; Type: COMMENT; Schema: auth; Owner: user_im
--

COMMENT ON COLUMN auth.permissions.code IS 'Formato: modulo.accion (ej: incidents.crear)';


--
-- Name: COLUMN permissions.module; Type: COMMENT; Schema: auth; Owner: user_im
--

COMMENT ON COLUMN auth.permissions.module IS 'Agrupación lógica: incidents, usuarios, reportes, etc.';


--
-- Name: permissions_id_seq; Type: SEQUENCE; Schema: auth; Owner: user_im
--

CREATE SEQUENCE auth.permissions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE auth.permissions_id_seq OWNER TO user_im;

--
-- Name: permissions_id_seq; Type: SEQUENCE OWNED BY; Schema: auth; Owner: user_im
--

ALTER SEQUENCE auth.permissions_id_seq OWNED BY auth.permissions.id;


--
-- Name: personal_access_tokens; Type: TABLE; Schema: auth; Owner: user_im
--

CREATE TABLE auth.personal_access_tokens (
    id bigint NOT NULL,
    tokenable_type character varying(255) NOT NULL,
    tokenable_id bigint NOT NULL,
    name character varying(255) NOT NULL,
    token character varying(64) NOT NULL,
    abilities text,
    last_used_at timestamp(0) without time zone,
    expires_at timestamp(0) without time zone,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


ALTER TABLE auth.personal_access_tokens OWNER TO user_im;

--
-- Name: personal_access_tokens_id_seq; Type: SEQUENCE; Schema: auth; Owner: user_im
--

CREATE SEQUENCE auth.personal_access_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE auth.personal_access_tokens_id_seq OWNER TO user_im;

--
-- Name: personal_access_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: auth; Owner: user_im
--

ALTER SEQUENCE auth.personal_access_tokens_id_seq OWNED BY auth.personal_access_tokens.id;


--
-- Name: role_user; Type: TABLE; Schema: auth; Owner: user_im
--

CREATE TABLE auth.role_user (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    role_id bigint NOT NULL,
    assigned_by bigint,
    assigned_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


ALTER TABLE auth.role_user OWNER TO user_im;

--
-- Name: COLUMN role_user.assigned_by; Type: COMMENT; Schema: auth; Owner: user_im
--

COMMENT ON COLUMN auth.role_user.assigned_by IS 'Usuario que realizó la asignación';


--
-- Name: role_user_id_seq; Type: SEQUENCE; Schema: auth; Owner: user_im
--

CREATE SEQUENCE auth.role_user_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE auth.role_user_id_seq OWNER TO user_im;

--
-- Name: role_user_id_seq; Type: SEQUENCE OWNED BY; Schema: auth; Owner: user_im
--

ALTER SEQUENCE auth.role_user_id_seq OWNED BY auth.role_user.id;


--
-- Name: roles; Type: TABLE; Schema: auth; Owner: user_im
--

CREATE TABLE auth.roles (
    id bigint NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(100) NOT NULL,
    description character varying(255),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


ALTER TABLE auth.roles OWNER TO user_im;

--
-- Name: COLUMN roles.code; Type: COMMENT; Schema: auth; Owner: user_im
--

COMMENT ON COLUMN auth.roles.code IS 'Identificador interno: ADMIN, SUPERVISOR, etc.';


--
-- Name: roles_id_seq; Type: SEQUENCE; Schema: auth; Owner: user_im
--

CREATE SEQUENCE auth.roles_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE auth.roles_id_seq OWNER TO user_im;

--
-- Name: roles_id_seq; Type: SEQUENCE OWNED BY; Schema: auth; Owner: user_im
--

ALTER SEQUENCE auth.roles_id_seq OWNED BY auth.roles.id;


--
-- Name: sessions; Type: TABLE; Schema: auth; Owner: user_im
--

CREATE TABLE auth.sessions (
    id character varying(255) NOT NULL,
    user_id bigint,
    ip_address character varying(45),
    user_agent text,
    payload text NOT NULL,
    last_activity integer NOT NULL
);


ALTER TABLE auth.sessions OWNER TO user_im;

--
-- Name: supervisor_operator_assignments; Type: TABLE; Schema: auth; Owner: user_im
--

CREATE TABLE auth.supervisor_operator_assignments (
    id bigint NOT NULL,
    supervisor_user_id bigint NOT NULL,
    operator_user_id bigint NOT NULL,
    assigned_by bigint,
    assigned_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    unassigned_at timestamp(0) without time zone,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


ALTER TABLE auth.supervisor_operator_assignments OWNER TO user_im;

--
-- Name: supervisor_operator_assignments_id_seq; Type: SEQUENCE; Schema: auth; Owner: user_im
--

CREATE SEQUENCE auth.supervisor_operator_assignments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE auth.supervisor_operator_assignments_id_seq OWNER TO user_im;

--
-- Name: supervisor_operator_assignments_id_seq; Type: SEQUENCE OWNED BY; Schema: auth; Owner: user_im
--

ALTER SEQUENCE auth.supervisor_operator_assignments_id_seq OWNED BY auth.supervisor_operator_assignments.id;


--
-- Name: supervisor_profiles; Type: TABLE; Schema: auth; Owner: user_im
--

CREATE TABLE auth.supervisor_profiles (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    max_operators smallint DEFAULT '5'::smallint NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    active boolean DEFAULT true NOT NULL,
    CONSTRAINT chk_supervisor_profiles_max_operators CHECK ((max_operators > 0))
);


ALTER TABLE auth.supervisor_profiles OWNER TO user_im;

--
-- Name: supervisor_profiles_id_seq; Type: SEQUENCE; Schema: auth; Owner: user_im
--

CREATE SEQUENCE auth.supervisor_profiles_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE auth.supervisor_profiles_id_seq OWNER TO user_im;

--
-- Name: supervisor_profiles_id_seq; Type: SEQUENCE OWNED BY; Schema: auth; Owner: user_im
--

ALTER SEQUENCE auth.supervisor_profiles_id_seq OWNED BY auth.supervisor_profiles.id;


--
-- Name: user_identities; Type: TABLE; Schema: auth; Owner: user_im
--

CREATE TABLE auth.user_identities (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    provider character varying(50) NOT NULL,
    provider_uid character varying(191),
    provider_email character varying(255) NOT NULL,
    verified_at timestamp(0) without time zone,
    last_used_at timestamp(0) without time zone,
    provider_data jsonb,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


ALTER TABLE auth.user_identities OWNER TO user_im;

--
-- Name: user_identities_id_seq; Type: SEQUENCE; Schema: auth; Owner: user_im
--

CREATE SEQUENCE auth.user_identities_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE auth.user_identities_id_seq OWNER TO user_im;

--
-- Name: user_identities_id_seq; Type: SEQUENCE OWNED BY; Schema: auth; Owner: user_im
--

ALTER SEQUENCE auth.user_identities_id_seq OWNED BY auth.user_identities.id;


--
-- Name: user_territories; Type: TABLE; Schema: auth; Owner: user_im
--

CREATE TABLE auth.user_territories (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    territorial_unit_id bigint NOT NULL,
    assigned_by bigint,
    assigned_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    unassigned_at timestamp(0) without time zone,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


ALTER TABLE auth.user_territories OWNER TO user_im;

--
-- Name: user_territories_id_seq; Type: SEQUENCE; Schema: auth; Owner: user_im
--

CREATE SEQUENCE auth.user_territories_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE auth.user_territories_id_seq OWNER TO user_im;

--
-- Name: user_territories_id_seq; Type: SEQUENCE OWNED BY; Schema: auth; Owner: user_im
--

ALTER SEQUENCE auth.user_territories_id_seq OWNED BY auth.user_territories.id;


--
-- Name: users; Type: TABLE; Schema: auth; Owner: user_im
--

CREATE TABLE auth.users (
    id bigint NOT NULL,
    first_name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    email character varying(255) NOT NULL,
    password character varying(255) NOT NULL,
    phone character varying(20),
    profile_photo character varying(255),
    email_verified_at timestamp(0) without time zone,
    remember_token character varying(100),
    last_login timestamp(0) without time zone,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    deleted_at timestamp(0) without time zone,
    username character varying(50),
    two_factor_secret character varying(255),
    two_factor_recovery_codes text,
    two_factor_confirmed_at timestamp(0) without time zone
);


ALTER TABLE auth.users OWNER TO user_im;

--
-- Name: COLUMN users.is_active; Type: COMMENT; Schema: auth; Owner: user_im
--

COMMENT ON COLUMN auth.users.is_active IS 'Desactivación temporal sin eliminar. Distinto de soft delete.';


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: auth; Owner: user_im
--

CREATE SEQUENCE auth.users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE auth.users_id_seq OWNER TO user_im;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: auth; Owner: user_im
--

ALTER SEQUENCE auth.users_id_seq OWNED BY auth.users.id;


--
-- Name: categories; Type: TABLE; Schema: core; Owner: user_im
--

CREATE TABLE core.categories (
    id bigint NOT NULL,
    name character varying(100) NOT NULL,
    description character varying(255),
    icon character varying(100),
    color character(7),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    is_fallback boolean DEFAULT false NOT NULL
);


ALTER TABLE core.categories OWNER TO user_im;

--
-- Name: COLUMN categories.icon; Type: COMMENT; Schema: core; Owner: user_im
--

COMMENT ON COLUMN core.categories.icon IS 'Nombre del icono para el frontend (ej: fa-road)';


--
-- Name: COLUMN categories.color; Type: COMMENT; Schema: core; Owner: user_im
--

COMMENT ON COLUMN core.categories.color IS 'Color hexadecimal para UI (ej: #FF5733)';


--
-- Name: categories_id_seq; Type: SEQUENCE; Schema: core; Owner: user_im
--

CREATE SEQUENCE core.categories_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE core.categories_id_seq OWNER TO user_im;

--
-- Name: categories_id_seq; Type: SEQUENCE OWNED BY; Schema: core; Owner: user_im
--

ALTER SEQUENCE core.categories_id_seq OWNED BY core.categories.id;


--
-- Name: incident_assignments; Type: TABLE; Schema: core; Owner: user_im
--

CREATE TABLE core.incident_assignments (
    id bigint NOT NULL,
    incident_id bigint NOT NULL,
    user_id bigint NOT NULL,
    assigned_by_id bigint NOT NULL,
    assignment_date timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    unassignment_date timestamp(0) without time zone,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    assignment_role character varying(20) DEFAULT 'primary'::character varying NOT NULL,
    active boolean DEFAULT true NOT NULL,
    resolved_at timestamp(0) without time zone,
    incident_cycle_id bigint
);


ALTER TABLE core.incident_assignments OWNER TO user_im;

--
-- Name: COLUMN incident_assignments.user_id; Type: COMMENT; Schema: core; Owner: user_im
--

COMMENT ON COLUMN core.incident_assignments.user_id IS 'Operador/técnico asignado';


--
-- Name: COLUMN incident_assignments.assigned_by_id; Type: COMMENT; Schema: core; Owner: user_im
--

COMMENT ON COLUMN core.incident_assignments.assigned_by_id IS 'Supervisor que realizó la asignación';


--
-- Name: COLUMN incident_assignments.unassignment_date; Type: COMMENT; Schema: core; Owner: user_im
--

COMMENT ON COLUMN core.incident_assignments.unassignment_date IS 'Se establece automáticamente por trigger al reassign';


--
-- Name: incident_assignments_id_seq; Type: SEQUENCE; Schema: core; Owner: user_im
--

CREATE SEQUENCE core.incident_assignments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE core.incident_assignments_id_seq OWNER TO user_im;

--
-- Name: incident_assignments_id_seq; Type: SEQUENCE OWNED BY; Schema: core; Owner: user_im
--

ALTER SEQUENCE core.incident_assignments_id_seq OWNED BY core.incident_assignments.id;


--
-- Name: incident_attachments; Type: TABLE; Schema: core; Owner: user_im
--

CREATE TABLE core.incident_attachments (
    id bigint NOT NULL,
    incident_id bigint NOT NULL,
    user_id bigint NOT NULL,
    original_name character varying(255) NOT NULL,
    file_path character varying(500) NOT NULL,
    mime_type character varying(100) NOT NULL,
    file_size_bytes bigint NOT NULL,
    file_hash character varying(255),
    created_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    incident_cycle_id bigint
);


ALTER TABLE core.incident_attachments OWNER TO user_im;

--
-- Name: COLUMN incident_attachments.original_name; Type: COMMENT; Schema: core; Owner: user_im
--

COMMENT ON COLUMN core.incident_attachments.original_name IS 'Nombre del file tal como lo subió el usuario';


--
-- Name: COLUMN incident_attachments.file_path; Type: COMMENT; Schema: core; Owner: user_im
--

COMMENT ON COLUMN core.incident_attachments.file_path IS 'Ruta en el sistema de archivos (storage)';


--
-- Name: COLUMN incident_attachments.file_hash; Type: COMMENT; Schema: core; Owner: user_im
--

COMMENT ON COLUMN core.incident_attachments.file_hash IS 'SHA-256 para verificación de integridad';


--
-- Name: incident_attachments_id_seq; Type: SEQUENCE; Schema: core; Owner: user_im
--

CREATE SEQUENCE core.incident_attachments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE core.incident_attachments_id_seq OWNER TO user_im;

--
-- Name: incident_attachments_id_seq; Type: SEQUENCE OWNED BY; Schema: core; Owner: user_im
--

ALTER SEQUENCE core.incident_attachments_id_seq OWNED BY core.incident_attachments.id;


--
-- Name: incident_classification_history; Type: TABLE; Schema: core; Owner: user_im
--

CREATE TABLE core.incident_classification_history (
    id bigint NOT NULL,
    incident_id bigint NOT NULL,
    previous_category_id bigint,
    previous_subcategory_id bigint,
    new_category_id bigint NOT NULL,
    new_subcategory_id bigint,
    changed_by bigint NOT NULL,
    reason text NOT NULL,
    created_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE core.incident_classification_history OWNER TO user_im;

--
-- Name: incident_classification_history_id_seq; Type: SEQUENCE; Schema: core; Owner: user_im
--

CREATE SEQUENCE core.incident_classification_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE core.incident_classification_history_id_seq OWNER TO user_im;

--
-- Name: incident_classification_history_id_seq; Type: SEQUENCE OWNED BY; Schema: core; Owner: user_im
--

ALTER SEQUENCE core.incident_classification_history_id_seq OWNED BY core.incident_classification_history.id;


--
-- Name: incident_comments; Type: TABLE; Schema: core; Owner: user_im
--

CREATE TABLE core.incident_comments (
    id bigint NOT NULL,
    incident_id bigint NOT NULL,
    user_id bigint NOT NULL,
    comment text NOT NULL,
    is_internal boolean DEFAULT false NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    incident_cycle_id bigint
);


ALTER TABLE core.incident_comments OWNER TO user_im;

--
-- Name: COLUMN incident_comments.is_internal; Type: COMMENT; Schema: core; Owner: user_im
--

COMMENT ON COLUMN core.incident_comments.is_internal IS 'TRUE = solo visible para operadores/supervisores';


--
-- Name: incident_comments_id_seq; Type: SEQUENCE; Schema: core; Owner: user_im
--

CREATE SEQUENCE core.incident_comments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE core.incident_comments_id_seq OWNER TO user_im;

--
-- Name: incident_comments_id_seq; Type: SEQUENCE OWNED BY; Schema: core; Owner: user_im
--

ALTER SEQUENCE core.incident_comments_id_seq OWNED BY core.incident_comments.id;


--
-- Name: incident_cycles; Type: TABLE; Schema: core; Owner: user_im
--

CREATE TABLE core.incident_cycles (
    id bigint NOT NULL,
    incident_id bigint NOT NULL,
    cycle_number integer NOT NULL,
    opened_at timestamp(0) without time zone NOT NULL,
    opened_by bigint NOT NULL,
    reopening_reason text,
    resolved_at timestamp(0) without time zone,
    resolved_by bigint,
    resolution_description text,
    closed_at timestamp(0) without time zone,
    closed_by bigint,
    closure_reason text,
    snapshot jsonb,
    snapshot_generated_at timestamp(0) without time zone,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


ALTER TABLE core.incident_cycles OWNER TO user_im;

--
-- Name: incident_cycles_id_seq; Type: SEQUENCE; Schema: core; Owner: user_im
--

CREATE SEQUENCE core.incident_cycles_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE core.incident_cycles_id_seq OWNER TO user_im;

--
-- Name: incident_cycles_id_seq; Type: SEQUENCE OWNED BY; Schema: core; Owner: user_im
--

ALTER SEQUENCE core.incident_cycles_id_seq OWNED BY core.incident_cycles.id;


--
-- Name: incident_states; Type: TABLE; Schema: core; Owner: user_im
--

CREATE TABLE core.incident_states (
    id bigint NOT NULL,
    incident_id bigint NOT NULL,
    previous_state_id bigint,
    new_state_id bigint NOT NULL,
    user_id bigint NOT NULL,
    comment text,
    created_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    incident_cycle_id bigint
);


ALTER TABLE core.incident_states OWNER TO user_im;

--
-- Name: COLUMN incident_states.previous_state_id; Type: COMMENT; Schema: core; Owner: user_im
--

COMMENT ON COLUMN core.incident_states.previous_state_id IS 'NULL para el primer estado (creación)';


--
-- Name: COLUMN incident_states.user_id; Type: COMMENT; Schema: core; Owner: user_im
--

COMMENT ON COLUMN core.incident_states.user_id IS 'Quién realizó el cambio de estado';


--
-- Name: COLUMN incident_states.comment; Type: COMMENT; Schema: core; Owner: user_im
--

COMMENT ON COLUMN core.incident_states.comment IS 'Justificación del cambio (obligatorio en algunas transitions)';


--
-- Name: incident_states_id_seq; Type: SEQUENCE; Schema: core; Owner: user_im
--

CREATE SEQUENCE core.incident_states_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE core.incident_states_id_seq OWNER TO user_im;

--
-- Name: incident_states_id_seq; Type: SEQUENCE OWNED BY; Schema: core; Owner: user_im
--

ALTER SEQUENCE core.incident_states_id_seq OWNED BY core.incident_states.id;


--
-- Name: incidents; Type: TABLE; Schema: core; Owner: user_im
--

CREATE TABLE core.incidents (
    id bigint NOT NULL,
    code character varying(20) NOT NULL,
    title character varying(200) NOT NULL,
    description text NOT NULL,
    category_id bigint NOT NULL,
    subcategory_id bigint,
    priority_id bigint,
    state_id bigint NOT NULL,
    address character varying(255),
    latitude numeric(10,8),
    longitude numeric(11,8),
    reported_by_id bigint NOT NULL,
    current_assigned_id bigint,
    due_date timestamp(0) without time zone,
    resolution_date timestamp(0) without time zone,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    deleted_at timestamp(0) without time zone,
    location public.geometry(Point,4326),
    territorial_unit_id bigint,
    address_reference character varying(500),
    reopened_at timestamp(0) without time zone,
    previous_resolution_date timestamp(0) without time zone,
    rejected_at timestamp(0) without time zone,
    resolved_by_supervisor_id bigint,
    resolution_snapshots jsonb,
    current_cycle_id bigint,
    classification_status character varying(20) DEFAULT 'CLASSIFIED'::character varying NOT NULL,
    classification_detail text,
    classified_by bigint,
    classified_at timestamp(0) without time zone,
    CONSTRAINT chk_incident_classification_status CHECK (((classification_status)::text = ANY ((ARRAY['PENDING'::character varying, 'CLASSIFIED'::character varying])::text[]))),
    CONSTRAINT chk_incident_latitude CHECK (((latitude >= ('-90'::integer)::numeric) AND (latitude <= (90)::numeric))),
    CONSTRAINT chk_incident_longitude CHECK (((longitude >= ('-180'::integer)::numeric) AND (longitude <= (180)::numeric)))
);


ALTER TABLE core.incidents OWNER TO user_im;

--
-- Name: COLUMN incidents.code; Type: COMMENT; Schema: core; Owner: user_im
--

COMMENT ON COLUMN core.incidents.code IS 'Código legible único: INC-2026-00001';


--
-- Name: COLUMN incidents.subcategory_id; Type: COMMENT; Schema: core; Owner: user_im
--

COMMENT ON COLUMN core.incidents.subcategory_id IS 'Opcional: no todas las categorías tienen subcategorías';


--
-- Name: COLUMN incidents.latitude; Type: COMMENT; Schema: core; Owner: user_im
--

COMMENT ON COLUMN core.incidents.latitude IS 'Coordenada geográfica: -90 a 90';


--
-- Name: COLUMN incidents.longitude; Type: COMMENT; Schema: core; Owner: user_im
--

COMMENT ON COLUMN core.incidents.longitude IS 'Coordenada geográfica: -180 a 180';


--
-- Name: COLUMN incidents.reported_by_id; Type: COMMENT; Schema: core; Owner: user_im
--

COMMENT ON COLUMN core.incidents.reported_by_id IS 'Ciudadano que creó la incident';


--
-- Name: COLUMN incidents.current_assigned_id; Type: COMMENT; Schema: core; Owner: user_im
--

COMMENT ON COLUMN core.incidents.current_assigned_id IS 'Campo desnormalizado — sincronizado por trigger desde incident_asignaciones';


--
-- Name: COLUMN incidents.due_date; Type: COMMENT; Schema: core; Owner: user_im
--

COMMENT ON COLUMN core.incidents.due_date IS 'Calculada automáticamente por trigger: created_at + prioridad.sla_horas';


--
-- Name: incidents_id_seq; Type: SEQUENCE; Schema: core; Owner: user_im
--

CREATE SEQUENCE core.incidents_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE core.incidents_id_seq OWNER TO user_im;

--
-- Name: incidents_id_seq; Type: SEQUENCE OWNED BY; Schema: core; Owner: user_im
--

ALTER SEQUENCE core.incidents_id_seq OWNED BY core.incidents.id;


--
-- Name: notifications; Type: TABLE; Schema: core; Owner: user_im
--

CREATE TABLE core.notifications (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    title character varying(150) NOT NULL,
    message text NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    read_at timestamp(0) without time zone,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    type core.notification_type DEFAULT 'STATUS_CHANGE'::core.notification_type NOT NULL,
    incident_id bigint
);


ALTER TABLE core.notifications OWNER TO user_im;

--
-- Name: notifications_id_seq; Type: SEQUENCE; Schema: core; Owner: user_im
--

CREATE SEQUENCE core.notifications_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE core.notifications_id_seq OWNER TO user_im;

--
-- Name: notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: core; Owner: user_im
--

ALTER SEQUENCE core.notifications_id_seq OWNED BY core.notifications.id;


--
-- Name: priorities; Type: TABLE; Schema: core; Owner: user_im
--

CREATE TABLE core.priorities (
    id bigint NOT NULL,
    name character varying(50) NOT NULL,
    level smallint NOT NULL,
    color character(7),
    sla_hours smallint NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    weight smallint DEFAULT '1'::smallint NOT NULL,
    CONSTRAINT chk_prioridad_nivel CHECK (((level >= 1) AND (level <= 10))),
    CONSTRAINT chk_prioridad_sla CHECK ((sla_hours > 0)),
    CONSTRAINT chk_priorities_weight CHECK ((weight > 0))
);


ALTER TABLE core.priorities OWNER TO user_im;

--
-- Name: COLUMN priorities.level; Type: COMMENT; Schema: core; Owner: user_im
--

COMMENT ON COLUMN core.priorities.level IS '1=Crítica, 2=Alta, 3=Media, 4=Baja';


--
-- Name: COLUMN priorities.color; Type: COMMENT; Schema: core; Owner: user_im
--

COMMENT ON COLUMN core.priorities.color IS 'Color hexadecimal para UI';


--
-- Name: COLUMN priorities.sla_hours; Type: COMMENT; Schema: core; Owner: user_im
--

COMMENT ON COLUMN core.priorities.sla_hours IS 'Horas máximas para resolver según SLA';


--
-- Name: priorities_id_seq; Type: SEQUENCE; Schema: core; Owner: user_im
--

CREATE SEQUENCE core.priorities_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE core.priorities_id_seq OWNER TO user_im;

--
-- Name: priorities_id_seq; Type: SEQUENCE OWNED BY; Schema: core; Owner: user_im
--

ALTER SEQUENCE core.priorities_id_seq OWNED BY core.priorities.id;


--
-- Name: settings; Type: TABLE; Schema: core; Owner: user_im
--

CREATE TABLE core.settings (
    id bigint NOT NULL,
    key character varying(100) NOT NULL,
    value text NOT NULL,
    type character varying(20) DEFAULT 'string'::character varying NOT NULL,
    description character varying(255),
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


ALTER TABLE core.settings OWNER TO user_im;

--
-- Name: COLUMN settings.key; Type: COMMENT; Schema: core; Owner: user_im
--

COMMENT ON COLUMN core.settings.key IS 'Identificador único: app.nombre, incident.codigo_prefijo, etc.';


--
-- Name: COLUMN settings.type; Type: COMMENT; Schema: core; Owner: user_im
--

COMMENT ON COLUMN core.settings.type IS 'Tipo de dato: string, integer, boolean, json';


--
-- Name: settings_id_seq; Type: SEQUENCE; Schema: core; Owner: user_im
--

CREATE SEQUENCE core.settings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE core.settings_id_seq OWNER TO user_im;

--
-- Name: settings_id_seq; Type: SEQUENCE OWNED BY; Schema: core; Owner: user_im
--

ALTER SEQUENCE core.settings_id_seq OWNED BY core.settings.id;


--
-- Name: state_transitions; Type: TABLE; Schema: core; Owner: user_im
--

CREATE TABLE core.state_transitions (
    id bigint NOT NULL,
    source_state_id bigint NOT NULL,
    target_state_id bigint NOT NULL,
    requires_comment boolean DEFAULT false NOT NULL,
    allowed_roles jsonb,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


ALTER TABLE core.state_transitions OWNER TO user_im;

--
-- Name: COLUMN state_transitions.requires_comment; Type: COMMENT; Schema: core; Owner: user_im
--

COMMENT ON COLUMN core.state_transitions.requires_comment IS 'Obliga al usuario a justificar el cambio';


--
-- Name: COLUMN state_transitions.allowed_roles; Type: COMMENT; Schema: core; Owner: user_im
--

COMMENT ON COLUMN core.state_transitions.allowed_roles IS 'Array de códigos de rol: ["ADMIN","SUPERVISOR"]';


--
-- Name: state_transitions_id_seq; Type: SEQUENCE; Schema: core; Owner: user_im
--

CREATE SEQUENCE core.state_transitions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE core.state_transitions_id_seq OWNER TO user_im;

--
-- Name: state_transitions_id_seq; Type: SEQUENCE OWNED BY; Schema: core; Owner: user_im
--

ALTER SEQUENCE core.state_transitions_id_seq OWNED BY core.state_transitions.id;


--
-- Name: states; Type: TABLE; Schema: core; Owner: user_im
--

CREATE TABLE core.states (
    id bigint NOT NULL,
    name character varying(50) NOT NULL,
    description character varying(255),
    color character(7),
    is_initial_state boolean DEFAULT false NOT NULL,
    is_final_state boolean DEFAULT false NOT NULL,
    allows_edition boolean DEFAULT true NOT NULL,
    "order" smallint DEFAULT '0'::smallint NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


ALTER TABLE core.states OWNER TO user_im;

--
-- Name: COLUMN states.is_initial_state; Type: COMMENT; Schema: core; Owner: user_im
--

COMMENT ON COLUMN core.states.is_initial_state IS 'Solo uno debería ser TRUE';


--
-- Name: COLUMN states.is_final_state; Type: COMMENT; Schema: core; Owner: user_im
--

COMMENT ON COLUMN core.states.is_final_state IS 'Estados terminales (cerrada, rechazada)';


--
-- Name: COLUMN states.allows_edition; Type: COMMENT; Schema: core; Owner: user_im
--

COMMENT ON COLUMN core.states.allows_edition IS 'Si la incident puede editarse en este estado';


--
-- Name: COLUMN states."order"; Type: COMMENT; Schema: core; Owner: user_im
--

COMMENT ON COLUMN core.states."order" IS 'Orden de visualización en el flujo';


--
-- Name: states_id_seq; Type: SEQUENCE; Schema: core; Owner: user_im
--

CREATE SEQUENCE core.states_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE core.states_id_seq OWNER TO user_im;

--
-- Name: states_id_seq; Type: SEQUENCE OWNED BY; Schema: core; Owner: user_im
--

ALTER SEQUENCE core.states_id_seq OWNED BY core.states.id;


--
-- Name: subcategories; Type: TABLE; Schema: core; Owner: user_im
--

CREATE TABLE core.subcategories (
    id bigint NOT NULL,
    category_id bigint NOT NULL,
    name character varying(100) NOT NULL,
    description character varying(255),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);


ALTER TABLE core.subcategories OWNER TO user_im;

--
-- Name: subcategories_id_seq; Type: SEQUENCE; Schema: core; Owner: user_im
--

CREATE SEQUENCE core.subcategories_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE core.subcategories_id_seq OWNER TO user_im;

--
-- Name: subcategories_id_seq; Type: SEQUENCE OWNED BY; Schema: core; Owner: user_im
--

ALTER SEQUENCE core.subcategories_id_seq OWNED BY core.subcategories.id;


--
-- Name: territorial_units; Type: TABLE; Schema: core; Owner: user_im
--

CREATE TABLE core.territorial_units (
    id bigint NOT NULL,
    name character varying(120) NOT NULL,
    type character varying(20) NOT NULL,
    parent_id bigint,
    code character varying(60),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    coverage_area public.geometry(MultiPolygon,4326),
    CONSTRAINT chk_territorial_units_type CHECK (((type)::text = ANY ((ARRAY['country'::character varying, 'operational_zone'::character varying, 'province'::character varying, 'canton'::character varying, 'parish'::character varying, 'sector'::character varying])::text[])))
);


ALTER TABLE core.territorial_units OWNER TO user_im;

--
-- Name: territorial_units_id_seq; Type: SEQUENCE; Schema: core; Owner: user_im
--

CREATE SEQUENCE core.territorial_units_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE core.territorial_units_id_seq OWNER TO user_im;

--
-- Name: territorial_units_id_seq; Type: SEQUENCE OWNED BY; Schema: core; Owner: user_im
--

ALTER SEQUENCE core.territorial_units_id_seq OWNED BY core.territorial_units.id;


--
-- Name: cache; Type: TABLE; Schema: public; Owner: user_im
--

CREATE TABLE public.cache (
    key character varying(255) NOT NULL,
    value text NOT NULL,
    expiration integer NOT NULL
);


ALTER TABLE public.cache OWNER TO user_im;

--
-- Name: cache_locks; Type: TABLE; Schema: public; Owner: user_im
--

CREATE TABLE public.cache_locks (
    key character varying(255) NOT NULL,
    owner character varying(255) NOT NULL,
    expiration integer NOT NULL
);


ALTER TABLE public.cache_locks OWNER TO user_im;

--
-- Name: failed_jobs; Type: TABLE; Schema: public; Owner: user_im
--

CREATE TABLE public.failed_jobs (
    id bigint NOT NULL,
    uuid character varying(255) NOT NULL,
    connection text NOT NULL,
    queue text NOT NULL,
    payload text NOT NULL,
    exception text NOT NULL,
    failed_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.failed_jobs OWNER TO user_im;

--
-- Name: failed_jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: user_im
--

CREATE SEQUENCE public.failed_jobs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.failed_jobs_id_seq OWNER TO user_im;

--
-- Name: failed_jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: user_im
--

ALTER SEQUENCE public.failed_jobs_id_seq OWNED BY public.failed_jobs.id;


--
-- Name: job_batches; Type: TABLE; Schema: public; Owner: user_im
--

CREATE TABLE public.job_batches (
    id character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    total_jobs integer NOT NULL,
    pending_jobs integer NOT NULL,
    failed_jobs integer NOT NULL,
    failed_job_ids text NOT NULL,
    options text,
    cancelled_at integer,
    created_at integer NOT NULL,
    finished_at integer
);


ALTER TABLE public.job_batches OWNER TO user_im;

--
-- Name: jobs; Type: TABLE; Schema: public; Owner: user_im
--

CREATE TABLE public.jobs (
    id bigint NOT NULL,
    queue character varying(255) NOT NULL,
    payload text NOT NULL,
    attempts smallint NOT NULL,
    reserved_at integer,
    available_at integer NOT NULL,
    created_at integer NOT NULL
);


ALTER TABLE public.jobs OWNER TO user_im;

--
-- Name: jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: user_im
--

CREATE SEQUENCE public.jobs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.jobs_id_seq OWNER TO user_im;

--
-- Name: jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: user_im
--

ALTER SEQUENCE public.jobs_id_seq OWNED BY public.jobs.id;


--
-- Name: migrations; Type: TABLE; Schema: public; Owner: user_im
--

CREATE TABLE public.migrations (
    id integer NOT NULL,
    migration character varying(255) NOT NULL,
    batch integer NOT NULL
);


ALTER TABLE public.migrations OWNER TO user_im;

--
-- Name: migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: user_im
--

CREATE SEQUENCE public.migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.migrations_id_seq OWNER TO user_im;

--
-- Name: migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: user_im
--

ALTER SEQUENCE public.migrations_id_seq OWNED BY public.migrations.id;


--
-- Name: state_change_requests; Type: TABLE; Schema: public; Owner: user_im
--

CREATE TABLE public.state_change_requests (
    id bigint NOT NULL,
    incident_id bigint NOT NULL,
    requested_by_user_id bigint NOT NULL,
    requested_state_id bigint NOT NULL,
    reason character varying(2000) NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    reviewed_by_user_id bigint,
    reviewer_comment character varying(2000),
    created_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    reviewed_at timestamp(0) without time zone
);


ALTER TABLE public.state_change_requests OWNER TO user_im;

--
-- Name: state_change_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: user_im
--

CREATE SEQUENCE public.state_change_requests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.state_change_requests_id_seq OWNER TO user_im;

--
-- Name: state_change_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: user_im
--

ALTER SEQUENCE public.state_change_requests_id_seq OWNED BY public.state_change_requests.id;


--
-- Name: access_logs id; Type: DEFAULT; Schema: audit; Owner: user_im
--

ALTER TABLE ONLY audit.access_logs ALTER COLUMN id SET DEFAULT nextval('audit.access_logs_id_seq'::regclass);


--
-- Name: audit_logs id; Type: DEFAULT; Schema: audit; Owner: user_im
--

ALTER TABLE ONLY audit.audit_logs ALTER COLUMN id SET DEFAULT nextval('audit.audit_logs_id_seq'::regclass);


--
-- Name: navigation_items id; Type: DEFAULT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.navigation_items ALTER COLUMN id SET DEFAULT nextval('auth.navigation_items_id_seq'::regclass);


--
-- Name: operator_profiles id; Type: DEFAULT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.operator_profiles ALTER COLUMN id SET DEFAULT nextval('auth.operator_profiles_id_seq'::regclass);


--
-- Name: permission_role id; Type: DEFAULT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.permission_role ALTER COLUMN id SET DEFAULT nextval('auth.permission_role_id_seq'::regclass);


--
-- Name: permissions id; Type: DEFAULT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.permissions ALTER COLUMN id SET DEFAULT nextval('auth.permissions_id_seq'::regclass);


--
-- Name: personal_access_tokens id; Type: DEFAULT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.personal_access_tokens ALTER COLUMN id SET DEFAULT nextval('auth.personal_access_tokens_id_seq'::regclass);


--
-- Name: role_user id; Type: DEFAULT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.role_user ALTER COLUMN id SET DEFAULT nextval('auth.role_user_id_seq'::regclass);


--
-- Name: roles id; Type: DEFAULT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.roles ALTER COLUMN id SET DEFAULT nextval('auth.roles_id_seq'::regclass);


--
-- Name: supervisor_operator_assignments id; Type: DEFAULT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.supervisor_operator_assignments ALTER COLUMN id SET DEFAULT nextval('auth.supervisor_operator_assignments_id_seq'::regclass);


--
-- Name: supervisor_profiles id; Type: DEFAULT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.supervisor_profiles ALTER COLUMN id SET DEFAULT nextval('auth.supervisor_profiles_id_seq'::regclass);


--
-- Name: user_identities id; Type: DEFAULT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.user_identities ALTER COLUMN id SET DEFAULT nextval('auth.user_identities_id_seq'::regclass);


--
-- Name: user_territories id; Type: DEFAULT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.user_territories ALTER COLUMN id SET DEFAULT nextval('auth.user_territories_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.users ALTER COLUMN id SET DEFAULT nextval('auth.users_id_seq'::regclass);


--
-- Name: categories id; Type: DEFAULT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.categories ALTER COLUMN id SET DEFAULT nextval('core.categories_id_seq'::regclass);


--
-- Name: incident_assignments id; Type: DEFAULT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incident_assignments ALTER COLUMN id SET DEFAULT nextval('core.incident_assignments_id_seq'::regclass);


--
-- Name: incident_attachments id; Type: DEFAULT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incident_attachments ALTER COLUMN id SET DEFAULT nextval('core.incident_attachments_id_seq'::regclass);


--
-- Name: incident_classification_history id; Type: DEFAULT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incident_classification_history ALTER COLUMN id SET DEFAULT nextval('core.incident_classification_history_id_seq'::regclass);


--
-- Name: incident_comments id; Type: DEFAULT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incident_comments ALTER COLUMN id SET DEFAULT nextval('core.incident_comments_id_seq'::regclass);


--
-- Name: incident_cycles id; Type: DEFAULT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incident_cycles ALTER COLUMN id SET DEFAULT nextval('core.incident_cycles_id_seq'::regclass);


--
-- Name: incident_states id; Type: DEFAULT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incident_states ALTER COLUMN id SET DEFAULT nextval('core.incident_states_id_seq'::regclass);


--
-- Name: incidents id; Type: DEFAULT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incidents ALTER COLUMN id SET DEFAULT nextval('core.incidents_id_seq'::regclass);


--
-- Name: notifications id; Type: DEFAULT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.notifications ALTER COLUMN id SET DEFAULT nextval('core.notifications_id_seq'::regclass);


--
-- Name: priorities id; Type: DEFAULT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.priorities ALTER COLUMN id SET DEFAULT nextval('core.priorities_id_seq'::regclass);


--
-- Name: settings id; Type: DEFAULT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.settings ALTER COLUMN id SET DEFAULT nextval('core.settings_id_seq'::regclass);


--
-- Name: state_transitions id; Type: DEFAULT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.state_transitions ALTER COLUMN id SET DEFAULT nextval('core.state_transitions_id_seq'::regclass);


--
-- Name: states id; Type: DEFAULT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.states ALTER COLUMN id SET DEFAULT nextval('core.states_id_seq'::regclass);


--
-- Name: subcategories id; Type: DEFAULT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.subcategories ALTER COLUMN id SET DEFAULT nextval('core.subcategories_id_seq'::regclass);


--
-- Name: territorial_units id; Type: DEFAULT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.territorial_units ALTER COLUMN id SET DEFAULT nextval('core.territorial_units_id_seq'::regclass);


--
-- Name: failed_jobs id; Type: DEFAULT; Schema: public; Owner: user_im
--

ALTER TABLE ONLY public.failed_jobs ALTER COLUMN id SET DEFAULT nextval('public.failed_jobs_id_seq'::regclass);


--
-- Name: jobs id; Type: DEFAULT; Schema: public; Owner: user_im
--

ALTER TABLE ONLY public.jobs ALTER COLUMN id SET DEFAULT nextval('public.jobs_id_seq'::regclass);


--
-- Name: migrations id; Type: DEFAULT; Schema: public; Owner: user_im
--

ALTER TABLE ONLY public.migrations ALTER COLUMN id SET DEFAULT nextval('public.migrations_id_seq'::regclass);


--
-- Name: state_change_requests id; Type: DEFAULT; Schema: public; Owner: user_im
--

ALTER TABLE ONLY public.state_change_requests ALTER COLUMN id SET DEFAULT nextval('public.state_change_requests_id_seq'::regclass);


--
-- Data for Name: access_logs; Type: TABLE DATA; Schema: audit; Owner: user_im
--

COPY audit.access_logs (id, email, user_id, login_type, is_success, failure_reason, session_id, ip_address, user_agent, created_at) FROM stdin;
1	supervisor.guayas@incidents.local	8	email	t	\N	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0	2026-07-24 10:55:34
2	supervisor.guayas@incidents.local	8	email	t	\N	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0	2026-07-24 12:21:11
\.


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: audit; Owner: user_im
--

COPY audit.audit_logs (id, auditable_type, auditable_id, event, old_values, new_values, url, user_id, ip_address, user_agent, tags, created_at) FROM stdin;
1	App\\Incidents\\Infrastructure\\Persistence\\Models\\Incident	780	updated	{"state_id": 1}	{"state_id": 2}	http://127.0.0.1:8000/api/incidents/780/state	8	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0	{"table": "core.incidents"}	2026-07-24 12:21:30
\.


--
-- Data for Name: navigation_items; Type: TABLE DATA; Schema: auth; Owner: user_im
--

COPY auth.navigation_items (id, parent_id, code, label, icon, route, permission_code, sort_order, active, created_at, updated_at) FROM stdin;
1	\N	workspace	Centro operativo	fa-th-large	\N	dashboard.view	10	t	2026-07-24 10:51:49	2026-07-24 10:51:49
2	1	dashboard	Panel principal	fa-tachometer-alt	dashboard.html	dashboard.view	10	t	2026-07-24 10:51:49	2026-07-24 10:51:49
3	1	reports	Reportes y estadisticas	fa-chart-bar	reports.html	reportes.ver	20	t	2026-07-24 10:51:49	2026-07-24 10:51:49
4	\N	incident-hub	Gestion de incidencias	fa-exclamation-circle	\N	incidents.view	20	t	2026-07-24 10:51:49	2026-07-24 10:51:49
5	4	incidents	Listado general	fa-list-alt	incidents.html	incidents.list	10	t	2026-07-24 10:51:49	2026-07-24 10:51:49
6	4	assignment-management	Gestion de asignaciones	fa-tasks	assignment-management.html	incidents.assign	20	t	2026-07-24 10:51:49	2026-07-24 10:51:49
7	4	incident-map	Mapa de incidencias	fa-map-marked-alt	incident-map.html	incidents.map	30	t	2026-07-24 10:51:49	2026-07-24 10:51:49
8	4	incident-create	Nueva incidencia	fa-plus-circle	incident-create.html	incidents.create	40	t	2026-07-24 10:51:49	2026-07-24 10:51:49
9	\N	territorial-ops	Cobertura nacional	fa-network-wired	\N	operations.view	30	t	2026-07-24 10:51:49	2026-07-24 10:51:49
10	9	operational-structure	Operacion nacional	fa-draw-polygon	operational-structure.html	operations.view	10	t	2026-07-24 10:51:49	2026-07-24 10:51:49
11	\N	territorial-zonal	Cobertura zonal	fa-map-pin	\N	operations.view_team	35	t	2026-07-24 10:51:49	2026-07-24 10:51:49
12	11	my-team	Mi equipo	fa-users	my-team.html	operations.view_team	10	t	2026-07-24 10:51:49	2026-07-24 10:51:49
13	\N	admin-tools	Administracion	fa-shield-alt	\N	users.manage_roles	40	t	2026-07-24 10:51:49	2026-07-24 10:51:49
14	13	role-permissions	Roles y permisos	fa-user-shield	role-permissions.html	users.manage_roles	10	t	2026-07-24 10:51:49	2026-07-24 10:51:49
15	13	user-roles	Usuarios y roles	fa-user-tag	user-roles.html	users.manage_roles	20	t	2026-07-24 10:51:49	2026-07-24 10:51:49
16	13	audit-logs	Auditoria	fa-clipboard-list	audit-logs.html	audit.view	30	t	2026-07-24 10:51:49	2026-07-24 10:51:49
17	\N	system-info	Informacion del sistema	fa-info-circle	\N	about.view	99	t	2026-07-24 10:51:49	2026-07-24 10:51:49
18	17	about	Acerca del SGI	fa-question-circle	about.html	about.view	10	t	2026-07-24 10:51:49	2026-07-24 10:51:49
\.


--
-- Data for Name: operator_profiles; Type: TABLE DATA; Schema: auth; Owner: user_im
--

COPY auth.operator_profiles (id, user_id, incident_capacity, created_at, updated_at, max_active_incidents, max_workload_points, active) FROM stdin;
1	3	20	2026-07-24 10:52:05	2026-07-24 10:52:05	10	20	t
2	4	20	2026-07-24 10:52:06	2026-07-24 10:52:06	10	20	t
3	5	20	2026-07-24 10:52:06	2026-07-24 10:52:06	10	20	t
4	6	20	2026-07-24 10:52:06	2026-07-24 10:52:06	10	20	t
5	7	20	2026-07-24 10:52:06	2026-07-24 10:52:06	10	20	t
6	9	20	2026-07-24 10:52:07	2026-07-24 10:52:07	10	20	t
7	10	20	2026-07-24 10:52:07	2026-07-24 10:52:07	10	20	t
8	11	20	2026-07-24 10:52:07	2026-07-24 10:52:07	10	20	t
9	12	20	2026-07-24 10:52:07	2026-07-24 10:52:07	10	20	t
10	13	20	2026-07-24 10:52:07	2026-07-24 10:52:07	10	20	t
11	15	20	2026-07-24 10:52:08	2026-07-24 10:52:08	10	20	t
12	16	20	2026-07-24 10:52:08	2026-07-24 10:52:08	10	20	t
13	17	20	2026-07-24 10:52:08	2026-07-24 10:52:08	10	20	t
14	18	20	2026-07-24 10:52:08	2026-07-24 10:52:08	10	20	t
15	19	20	2026-07-24 10:52:09	2026-07-24 10:52:09	10	20	t
16	21	20	2026-07-24 10:52:09	2026-07-24 10:52:09	10	20	t
17	22	20	2026-07-24 10:52:09	2026-07-24 10:52:09	10	20	t
18	23	20	2026-07-24 10:52:09	2026-07-24 10:52:09	10	20	t
19	24	20	2026-07-24 10:52:10	2026-07-24 10:52:10	10	20	t
20	25	20	2026-07-24 10:52:10	2026-07-24 10:52:10	10	20	t
21	27	20	2026-07-24 10:52:10	2026-07-24 10:52:10	10	20	t
22	28	20	2026-07-24 10:52:10	2026-07-24 10:52:10	10	20	t
23	29	20	2026-07-24 10:52:10	2026-07-24 10:52:10	10	20	t
24	30	20	2026-07-24 10:52:11	2026-07-24 10:52:11	10	20	t
25	31	20	2026-07-24 10:52:11	2026-07-24 10:52:11	10	20	t
26	33	20	2026-07-24 10:52:11	2026-07-24 10:52:11	10	20	t
27	34	20	2026-07-24 10:52:11	2026-07-24 10:52:11	10	20	t
28	35	20	2026-07-24 10:52:12	2026-07-24 10:52:12	10	20	t
29	36	20	2026-07-24 10:52:12	2026-07-24 10:52:12	10	20	t
30	37	20	2026-07-24 10:52:12	2026-07-24 10:52:12	10	20	t
31	39	20	2026-07-24 10:52:12	2026-07-24 10:52:12	10	20	t
32	40	20	2026-07-24 10:52:13	2026-07-24 10:52:13	10	20	t
33	41	20	2026-07-24 10:52:13	2026-07-24 10:52:13	10	20	t
34	42	20	2026-07-24 10:52:13	2026-07-24 10:52:13	10	20	t
35	43	20	2026-07-24 10:52:13	2026-07-24 10:52:13	10	20	t
36	45	20	2026-07-24 10:52:14	2026-07-24 10:52:14	10	20	t
37	46	20	2026-07-24 10:52:14	2026-07-24 10:52:14	10	20	t
38	47	20	2026-07-24 10:52:14	2026-07-24 10:52:14	10	20	t
39	48	20	2026-07-24 10:52:15	2026-07-24 10:52:15	10	20	t
40	49	20	2026-07-24 10:52:15	2026-07-24 10:52:15	10	20	t
\.


--
-- Data for Name: password_reset_tokens; Type: TABLE DATA; Schema: auth; Owner: user_im
--

COPY auth.password_reset_tokens (email, token, created_at, expires_at, attempts, used_at) FROM stdin;
\.


--
-- Data for Name: permission_role; Type: TABLE DATA; Schema: auth; Owner: user_im
--

COPY auth.permission_role (id, permission_id, role_id, created_at, updated_at) FROM stdin;
1	2	1	2026-07-24 10:51:49	2026-07-24 10:51:49
2	3	1	2026-07-24 10:51:49	2026-07-24 10:51:49
3	4	1	2026-07-24 10:51:49	2026-07-24 10:51:49
4	5	1	2026-07-24 10:51:49	2026-07-24 10:51:49
5	1	1	2026-07-24 10:51:49	2026-07-24 10:51:49
6	6	1	2026-07-24 10:51:49	2026-07-24 10:51:49
7	7	1	2026-07-24 10:51:49	2026-07-24 10:51:49
8	8	1	2026-07-24 10:51:49	2026-07-24 10:51:49
9	9	1	2026-07-24 10:51:49	2026-07-24 10:51:49
10	10	1	2026-07-24 10:51:49	2026-07-24 10:51:49
11	11	1	2026-07-24 10:51:49	2026-07-24 10:51:49
12	12	1	2026-07-24 10:51:49	2026-07-24 10:51:49
13	13	1	2026-07-24 10:51:49	2026-07-24 10:51:49
14	14	1	2026-07-24 10:51:49	2026-07-24 10:51:49
15	15	1	2026-07-24 10:51:49	2026-07-24 10:51:49
16	16	1	2026-07-24 10:51:49	2026-07-24 10:51:49
17	17	1	2026-07-24 10:51:49	2026-07-24 10:51:49
18	18	1	2026-07-24 10:51:49	2026-07-24 10:51:49
19	19	1	2026-07-24 10:51:49	2026-07-24 10:51:49
20	20	1	2026-07-24 10:51:49	2026-07-24 10:51:49
21	21	1	2026-07-24 10:51:49	2026-07-24 10:51:49
22	22	1	2026-07-24 10:51:49	2026-07-24 10:51:49
23	23	1	2026-07-24 10:51:49	2026-07-24 10:51:49
24	24	1	2026-07-24 10:51:49	2026-07-24 10:51:49
25	25	1	2026-07-24 10:51:49	2026-07-24 10:51:49
26	26	1	2026-07-24 10:51:49	2026-07-24 10:51:49
27	27	1	2026-07-24 10:51:49	2026-07-24 10:51:49
28	28	1	2026-07-24 10:51:49	2026-07-24 10:51:49
29	29	1	2026-07-24 10:51:49	2026-07-24 10:51:49
30	30	1	2026-07-24 10:51:49	2026-07-24 10:51:49
31	31	1	2026-07-24 10:51:49	2026-07-24 10:51:49
32	32	1	2026-07-24 10:51:49	2026-07-24 10:51:49
33	2	2	2026-07-24 10:51:49	2026-07-24 10:51:49
34	3	2	2026-07-24 10:51:49	2026-07-24 10:51:49
35	4	2	2026-07-24 10:51:49	2026-07-24 10:51:49
36	5	2	2026-07-24 10:51:49	2026-07-24 10:51:49
37	1	2	2026-07-24 10:51:49	2026-07-24 10:51:49
38	6	2	2026-07-24 10:51:49	2026-07-24 10:51:49
39	8	2	2026-07-24 10:51:49	2026-07-24 10:51:49
40	10	2	2026-07-24 10:51:49	2026-07-24 10:51:49
41	12	2	2026-07-24 10:51:49	2026-07-24 10:51:49
42	13	2	2026-07-24 10:51:49	2026-07-24 10:51:49
43	14	2	2026-07-24 10:51:49	2026-07-24 10:51:49
44	15	2	2026-07-24 10:51:49	2026-07-24 10:51:49
45	16	2	2026-07-24 10:51:49	2026-07-24 10:51:49
46	17	2	2026-07-24 10:51:49	2026-07-24 10:51:49
47	18	2	2026-07-24 10:51:49	2026-07-24 10:51:49
48	25	2	2026-07-24 10:51:49	2026-07-24 10:51:49
49	26	2	2026-07-24 10:51:49	2026-07-24 10:51:49
50	28	2	2026-07-24 10:51:49	2026-07-24 10:51:49
51	29	2	2026-07-24 10:51:49	2026-07-24 10:51:49
52	2	3	2026-07-24 10:51:49	2026-07-24 10:51:49
53	3	3	2026-07-24 10:51:49	2026-07-24 10:51:49
54	5	3	2026-07-24 10:51:49	2026-07-24 10:51:49
55	6	3	2026-07-24 10:51:49	2026-07-24 10:51:49
56	7	3	2026-07-24 10:51:49	2026-07-24 10:51:49
57	8	3	2026-07-24 10:51:49	2026-07-24 10:51:49
58	10	3	2026-07-24 10:51:49	2026-07-24 10:51:49
59	15	3	2026-07-24 10:51:49	2026-07-24 10:51:49
60	16	3	2026-07-24 10:51:49	2026-07-24 10:51:49
61	17	3	2026-07-24 10:51:49	2026-07-24 10:51:49
62	26	3	2026-07-24 10:51:49	2026-07-24 10:51:49
63	3	4	2026-07-24 10:51:49	2026-07-24 10:51:49
64	5	4	2026-07-24 10:51:49	2026-07-24 10:51:49
65	6	4	2026-07-24 10:51:49	2026-07-24 10:51:49
66	7	4	2026-07-24 10:51:49	2026-07-24 10:51:49
67	8	4	2026-07-24 10:51:49	2026-07-24 10:51:49
68	9	4	2026-07-24 10:51:49	2026-07-24 10:51:49
69	15	4	2026-07-24 10:51:49	2026-07-24 10:51:49
70	16	4	2026-07-24 10:51:49	2026-07-24 10:51:49
71	26	4	2026-07-24 10:51:49	2026-07-24 10:51:49
\.


--
-- Data for Name: permissions; Type: TABLE DATA; Schema: auth; Owner: user_im
--

COPY auth.permissions (id, code, name, description, module, created_at, updated_at) FROM stdin;
2	incidents.map	Ver mapa de incidencias	Permite acceder al mapa georreferenciado de incidencias.	incidents	2026-07-24 10:51:48	2026-07-24 10:51:48
3	notifications.view	Ver notificaciones	Permite consultar notificaciones propias del usuario.	notifications	2026-07-24 10:51:48	2026-07-24 10:51:48
4	operations.view_team	Ver equipo de trabajo	Permite consultar los operadores asignados directamente al supervisor autenticado.	operations	2026-07-24 10:51:48	2026-07-24 10:51:48
5	about.view	Ver informacion del sistema	Permite acceder a la pantalla Acerca del sistema.	about	2026-07-24 10:51:49	2026-07-24 10:51:49
1	dashboard.view	Ver panel principal	Permite acceder al panel principal del sistema.	dashboard	2026-07-24 10:51:48	2026-07-24 10:51:49
6	incidents.view	Ver incidencias	Permite consultar el listado y detalle de incidencias segun el alcance del rol.	incidents	2026-07-24 10:51:49	2026-07-24 10:51:49
7	incidents.list	Ver listado de incidencias	Permite acceder a la pantalla de listado general de incidencias.	incidents	2026-07-24 10:51:49	2026-07-24 10:51:49
8	incidents.detail	Ver detalle de incidencias	Permite acceder a la pantalla de detalle de una incidencia.	incidents	2026-07-24 10:51:49	2026-07-24 10:51:49
9	incidents.create	Crear incidencias	Permite registrar nuevas incidencias en el sistema.	incidents	2026-07-24 10:51:49	2026-07-24 10:51:49
10	incidents.edit	Editar incidencias	Permite actualizar datos operativos de una incidencia.	incidents	2026-07-24 10:51:49	2026-07-24 10:51:49
11	incidents.delete	Eliminar incidencias	Permite eliminar incidencias cuando la politica lo autorice.	incidents	2026-07-24 10:51:49	2026-07-24 10:51:49
12	incidents.assign	Gestionar asignaciones	Permite usar la pantalla de Gestion de Asignaciones y asignar incidencias a operadores.	incidents	2026-07-24 10:51:49	2026-07-24 10:51:49
13	incidents.close	Resolver incidencias	Permite marcar incidencias como resueltas.	incidents	2026-07-24 10:51:49	2026-07-24 10:51:49
14	incidents.reopen	Reabrir incidencias	Permite reabrir incidencias previamente cerradas.	incidents	2026-07-24 10:51:49	2026-07-24 10:51:49
15	profile.view	Ver perfil propio	Permite acceder a la pantalla Mi perfil.	profile	2026-07-24 10:51:49	2026-07-24 10:51:49
16	comments.create	Crear comentarios	Permite registrar comentarios visibles en el seguimiento de la incidencia.	comments	2026-07-24 10:51:49	2026-07-24 10:51:49
17	comments.internal	Crear comentarios internos	Permite registrar comentarios internos para uso operativo.	comments	2026-07-24 10:51:49	2026-07-24 10:51:49
18	users.view	Ver usuarios	Permite consultar usuarios del sistema.	users	2026-07-24 10:51:49	2026-07-24 10:51:49
19	users.create	Crear usuarios	Permite registrar usuarios manualmente.	users	2026-07-24 10:51:49	2026-07-24 10:51:49
20	users.edit	Editar usuarios	Permite actualizar informacion de usuarios.	users	2026-07-24 10:51:49	2026-07-24 10:51:49
21	users.delete	Eliminar usuarios	Permite desactivar o eliminar usuarios segun la politica del sistema.	users	2026-07-24 10:51:49	2026-07-24 10:51:49
22	users.manage_roles	Gestionar roles y permisos	Permite administrar las pantallas de Roles y permisos y Usuarios y roles.	users	2026-07-24 10:51:49	2026-07-24 10:51:49
23	operations.view	Ver cobertura operativa	Permite acceder al mapa y ficha de Cobertura Operativa segun la zona autorizada.	operations	2026-07-24 10:51:49	2026-07-24 10:51:49
24	operations.manage	Gestionar cobertura operativa	Permite cambiar supervisores, operadores, limites y encargados de zona.	operations	2026-07-24 10:51:49	2026-07-24 10:51:49
25	catalogs.manage	Gestionar catalogos	Permite administrar catalogos maestros, incluidas prioridades y sus pesos.	catalogs	2026-07-24 10:51:49	2026-07-24 10:51:49
26	territorial_units.view	Ver unidades territoriales	Permite consultar el arbol territorial.	territorial_units	2026-07-24 10:51:49	2026-07-24 10:51:49
27	territorial_units.manage	Gestionar unidades territoriales	Permite crear o ajustar unidades territoriales.	territorial_units	2026-07-24 10:51:49	2026-07-24 10:51:49
28	reportes.ver	Ver reportes	Permite consultar reportes operativos.	reportes	2026-07-24 10:51:49	2026-07-24 10:51:49
29	reportes.exportar	Exportar reportes	Permite exportar reportes del sistema.	reportes	2026-07-24 10:51:49	2026-07-24 10:51:49
30	configuracion.ver	Ver configuracion	Permite consultar opciones generales del sistema.	configuracion	2026-07-24 10:51:49	2026-07-24 10:51:49
31	configuracion.editar	Editar configuracion	Permite ajustar opciones generales del sistema.	configuracion	2026-07-24 10:51:49	2026-07-24 10:51:49
32	audit.view	Ver logs de auditoria	Permite consultar trazabilidad y auditoria del sistema.	audit	2026-07-24 10:51:49	2026-07-24 10:51:49
\.


--
-- Data for Name: personal_access_tokens; Type: TABLE DATA; Schema: auth; Owner: user_im
--

COPY auth.personal_access_tokens (id, tokenable_type, tokenable_id, name, token, abilities, last_used_at, expires_at, created_at, updated_at) FROM stdin;
2	App\\Auth\\Infrastructure\\Persistence\\Models\\User	8	api-token	a7287587b77c6a4afabcdd79bd0604d8c98b143c1bd67efe60966a115beeeb94	["*"]	2026-07-24 12:36:29	2026-07-24 14:21:11	2026-07-24 12:21:11	2026-07-24 12:36:29
\.


--
-- Data for Name: role_user; Type: TABLE DATA; Schema: auth; Owner: user_im
--

COPY auth.role_user (id, user_id, role_id, assigned_by, assigned_at, created_at, updated_at) FROM stdin;
2	2	2	1	2026-07-24 10:52:05	2026-07-24 10:52:05	2026-07-24 10:52:05
3	3	3	1	2026-07-24 10:52:05	2026-07-24 10:52:05	2026-07-24 10:52:05
4	4	3	1	2026-07-24 10:52:06	2026-07-24 10:52:06	2026-07-24 10:52:06
5	5	3	1	2026-07-24 10:52:06	2026-07-24 10:52:06	2026-07-24 10:52:06
6	6	3	1	2026-07-24 10:52:06	2026-07-24 10:52:06	2026-07-24 10:52:06
7	7	3	1	2026-07-24 10:52:06	2026-07-24 10:52:06	2026-07-24 10:52:06
8	8	2	1	2026-07-24 10:52:06	2026-07-24 10:52:06	2026-07-24 10:52:06
9	9	3	1	2026-07-24 10:52:07	2026-07-24 10:52:07	2026-07-24 10:52:07
10	10	3	1	2026-07-24 10:52:07	2026-07-24 10:52:07	2026-07-24 10:52:07
11	11	3	1	2026-07-24 10:52:07	2026-07-24 10:52:07	2026-07-24 10:52:07
12	12	3	1	2026-07-24 10:52:07	2026-07-24 10:52:07	2026-07-24 10:52:07
13	13	3	1	2026-07-24 10:52:07	2026-07-24 10:52:07	2026-07-24 10:52:07
14	14	2	1	2026-07-24 10:52:08	2026-07-24 10:52:08	2026-07-24 10:52:08
15	15	3	1	2026-07-24 10:52:08	2026-07-24 10:52:08	2026-07-24 10:52:08
16	16	3	1	2026-07-24 10:52:08	2026-07-24 10:52:08	2026-07-24 10:52:08
17	17	3	1	2026-07-24 10:52:08	2026-07-24 10:52:08	2026-07-24 10:52:08
18	18	3	1	2026-07-24 10:52:08	2026-07-24 10:52:08	2026-07-24 10:52:08
19	19	3	1	2026-07-24 10:52:09	2026-07-24 10:52:09	2026-07-24 10:52:09
20	20	2	1	2026-07-24 10:52:09	2026-07-24 10:52:09	2026-07-24 10:52:09
21	21	3	1	2026-07-24 10:52:09	2026-07-24 10:52:09	2026-07-24 10:52:09
22	22	3	1	2026-07-24 10:52:09	2026-07-24 10:52:09	2026-07-24 10:52:09
23	23	3	1	2026-07-24 10:52:09	2026-07-24 10:52:09	2026-07-24 10:52:09
24	24	3	1	2026-07-24 10:52:10	2026-07-24 10:52:10	2026-07-24 10:52:10
25	25	3	1	2026-07-24 10:52:10	2026-07-24 10:52:10	2026-07-24 10:52:10
26	26	2	1	2026-07-24 10:52:10	2026-07-24 10:52:10	2026-07-24 10:52:10
27	27	3	1	2026-07-24 10:52:10	2026-07-24 10:52:10	2026-07-24 10:52:10
28	28	3	1	2026-07-24 10:52:10	2026-07-24 10:52:10	2026-07-24 10:52:10
29	29	3	1	2026-07-24 10:52:10	2026-07-24 10:52:10	2026-07-24 10:52:10
30	30	3	1	2026-07-24 10:52:11	2026-07-24 10:52:11	2026-07-24 10:52:11
31	31	3	1	2026-07-24 10:52:11	2026-07-24 10:52:11	2026-07-24 10:52:11
32	32	2	1	2026-07-24 10:52:11	2026-07-24 10:52:11	2026-07-24 10:52:11
33	33	3	1	2026-07-24 10:52:11	2026-07-24 10:52:11	2026-07-24 10:52:11
34	34	3	1	2026-07-24 10:52:11	2026-07-24 10:52:11	2026-07-24 10:52:11
35	35	3	1	2026-07-24 10:52:12	2026-07-24 10:52:12	2026-07-24 10:52:12
36	36	3	1	2026-07-24 10:52:12	2026-07-24 10:52:12	2026-07-24 10:52:12
37	37	3	1	2026-07-24 10:52:12	2026-07-24 10:52:12	2026-07-24 10:52:12
38	38	2	1	2026-07-24 10:52:12	2026-07-24 10:52:12	2026-07-24 10:52:12
39	39	3	1	2026-07-24 10:52:12	2026-07-24 10:52:12	2026-07-24 10:52:12
40	40	3	1	2026-07-24 10:52:13	2026-07-24 10:52:13	2026-07-24 10:52:13
41	41	3	1	2026-07-24 10:52:13	2026-07-24 10:52:13	2026-07-24 10:52:13
42	42	3	1	2026-07-24 10:52:13	2026-07-24 10:52:13	2026-07-24 10:52:13
43	43	3	1	2026-07-24 10:52:13	2026-07-24 10:52:13	2026-07-24 10:52:13
44	44	2	1	2026-07-24 10:52:13	2026-07-24 10:52:13	2026-07-24 10:52:13
45	45	3	1	2026-07-24 10:52:14	2026-07-24 10:52:14	2026-07-24 10:52:14
46	46	3	1	2026-07-24 10:52:14	2026-07-24 10:52:14	2026-07-24 10:52:14
47	47	3	1	2026-07-24 10:52:14	2026-07-24 10:52:14	2026-07-24 10:52:14
48	48	3	1	2026-07-24 10:52:15	2026-07-24 10:52:15	2026-07-24 10:52:15
49	49	3	1	2026-07-24 10:52:15	2026-07-24 10:52:15	2026-07-24 10:52:15
1	1	1	1	2026-07-24 10:52:16	2026-07-24 10:52:05	2026-07-24 10:52:16
50	50	2	1	2026-07-24 10:52:17	2026-07-24 10:52:17	2026-07-24 10:52:17
51	51	3	1	2026-07-24 10:52:17	2026-07-24 10:52:17	2026-07-24 10:52:17
52	52	3	1	2026-07-24 10:52:17	2026-07-24 10:52:17	2026-07-24 10:52:17
53	53	4	1	2026-07-24 10:52:18	2026-07-24 10:52:18	2026-07-24 10:52:18
54	54	4	1	2026-07-24 10:52:18	2026-07-24 10:52:18	2026-07-24 10:52:18
55	55	4	1	2026-07-24 10:52:18	2026-07-24 10:52:18	2026-07-24 10:52:18
\.


--
-- Data for Name: roles; Type: TABLE DATA; Schema: auth; Owner: user_im
--

COPY auth.roles (id, code, name, description, is_active, created_at, updated_at) FROM stdin;
1	ADMIN	Administrador	Acceso total al sistema. Gestiona usuarios, roles, configuración y reportes.	t	2026-07-24 10:51:49	2026-07-24 10:51:49
2	SUPERVISOR	Supervisor	Supervisa incidents, asigna operadores, aprueba resoluciones y genera reportes.	t	2026-07-24 10:51:49	2026-07-24 10:51:49
3	OPERADOR	Operador	Atiende incidents asignadas, actualiza states y registra avances.	t	2026-07-24 10:51:49	2026-07-24 10:51:49
4	CIUDADANO	Ciudadano	Reporta incidents, consulta el estado de sus reportes y recibe notificaciones.	t	2026-07-24 10:51:49	2026-07-24 10:51:49
\.


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: auth; Owner: user_im
--

COPY auth.sessions (id, user_id, ip_address, user_agent, payload, last_activity) FROM stdin;
\.


--
-- Data for Name: supervisor_operator_assignments; Type: TABLE DATA; Schema: auth; Owner: user_im
--

COPY auth.supervisor_operator_assignments (id, supervisor_user_id, operator_user_id, assigned_by, assigned_at, unassigned_at, is_active, created_at, updated_at) FROM stdin;
1	2	3	1	2026-07-24 10:52:06	\N	t	2026-07-24 10:52:06	2026-07-24 10:52:06
2	2	4	1	2026-07-24 10:52:06	\N	t	2026-07-24 10:52:06	2026-07-24 10:52:06
3	2	5	1	2026-07-24 10:52:06	\N	t	2026-07-24 10:52:06	2026-07-24 10:52:06
4	2	6	1	2026-07-24 10:52:06	\N	t	2026-07-24 10:52:06	2026-07-24 10:52:06
5	2	7	1	2026-07-24 10:52:06	\N	t	2026-07-24 10:52:06	2026-07-24 10:52:06
6	8	9	1	2026-07-24 10:52:07	\N	t	2026-07-24 10:52:07	2026-07-24 10:52:07
7	8	10	1	2026-07-24 10:52:07	\N	t	2026-07-24 10:52:07	2026-07-24 10:52:07
8	8	11	1	2026-07-24 10:52:07	\N	t	2026-07-24 10:52:07	2026-07-24 10:52:07
9	8	12	1	2026-07-24 10:52:07	\N	t	2026-07-24 10:52:07	2026-07-24 10:52:07
10	8	13	1	2026-07-24 10:52:07	\N	t	2026-07-24 10:52:07	2026-07-24 10:52:07
11	14	15	1	2026-07-24 10:52:08	\N	t	2026-07-24 10:52:08	2026-07-24 10:52:08
12	14	16	1	2026-07-24 10:52:08	\N	t	2026-07-24 10:52:08	2026-07-24 10:52:08
13	14	17	1	2026-07-24 10:52:08	\N	t	2026-07-24 10:52:08	2026-07-24 10:52:08
14	14	18	1	2026-07-24 10:52:08	\N	t	2026-07-24 10:52:08	2026-07-24 10:52:08
15	14	19	1	2026-07-24 10:52:09	\N	t	2026-07-24 10:52:09	2026-07-24 10:52:09
16	20	21	1	2026-07-24 10:52:09	\N	t	2026-07-24 10:52:09	2026-07-24 10:52:09
17	20	22	1	2026-07-24 10:52:09	\N	t	2026-07-24 10:52:09	2026-07-24 10:52:09
18	20	23	1	2026-07-24 10:52:09	\N	t	2026-07-24 10:52:09	2026-07-24 10:52:09
19	20	24	1	2026-07-24 10:52:10	\N	t	2026-07-24 10:52:10	2026-07-24 10:52:10
20	20	25	1	2026-07-24 10:52:10	\N	t	2026-07-24 10:52:10	2026-07-24 10:52:10
21	26	27	1	2026-07-24 10:52:10	\N	t	2026-07-24 10:52:10	2026-07-24 10:52:10
22	26	28	1	2026-07-24 10:52:10	\N	t	2026-07-24 10:52:10	2026-07-24 10:52:10
23	26	29	1	2026-07-24 10:52:11	\N	t	2026-07-24 10:52:11	2026-07-24 10:52:11
24	26	30	1	2026-07-24 10:52:11	\N	t	2026-07-24 10:52:11	2026-07-24 10:52:11
25	26	31	1	2026-07-24 10:52:11	\N	t	2026-07-24 10:52:11	2026-07-24 10:52:11
26	32	33	1	2026-07-24 10:52:11	\N	t	2026-07-24 10:52:11	2026-07-24 10:52:11
27	32	34	1	2026-07-24 10:52:11	\N	t	2026-07-24 10:52:11	2026-07-24 10:52:11
28	32	35	1	2026-07-24 10:52:12	\N	t	2026-07-24 10:52:12	2026-07-24 10:52:12
29	32	36	1	2026-07-24 10:52:12	\N	t	2026-07-24 10:52:12	2026-07-24 10:52:12
30	32	37	1	2026-07-24 10:52:12	\N	t	2026-07-24 10:52:12	2026-07-24 10:52:12
31	38	39	1	2026-07-24 10:52:12	\N	t	2026-07-24 10:52:12	2026-07-24 10:52:12
32	38	40	1	2026-07-24 10:52:13	\N	t	2026-07-24 10:52:13	2026-07-24 10:52:13
33	38	41	1	2026-07-24 10:52:13	\N	t	2026-07-24 10:52:13	2026-07-24 10:52:13
34	38	42	1	2026-07-24 10:52:13	\N	t	2026-07-24 10:52:13	2026-07-24 10:52:13
35	38	43	1	2026-07-24 10:52:13	\N	t	2026-07-24 10:52:13	2026-07-24 10:52:13
36	44	45	1	2026-07-24 10:52:14	\N	t	2026-07-24 10:52:14	2026-07-24 10:52:14
37	44	46	1	2026-07-24 10:52:14	\N	t	2026-07-24 10:52:14	2026-07-24 10:52:14
38	44	47	1	2026-07-24 10:52:14	\N	t	2026-07-24 10:52:14	2026-07-24 10:52:14
39	44	48	1	2026-07-24 10:52:15	\N	t	2026-07-24 10:52:15	2026-07-24 10:52:15
40	44	49	1	2026-07-24 10:52:15	\N	t	2026-07-24 10:52:15	2026-07-24 10:52:15
\.


--
-- Data for Name: supervisor_profiles; Type: TABLE DATA; Schema: auth; Owner: user_im
--

COPY auth.supervisor_profiles (id, user_id, max_operators, created_at, updated_at, active) FROM stdin;
1	2	5	2026-07-24 10:52:05	2026-07-24 10:52:05	t
2	8	5	2026-07-24 10:52:06	2026-07-24 10:52:06	t
3	14	5	2026-07-24 10:52:08	2026-07-24 10:52:08	t
4	20	5	2026-07-24 10:52:09	2026-07-24 10:52:09	t
5	26	5	2026-07-24 10:52:10	2026-07-24 10:52:10	t
6	32	5	2026-07-24 10:52:11	2026-07-24 10:52:11	t
7	38	5	2026-07-24 10:52:12	2026-07-24 10:52:12	t
8	44	5	2026-07-24 10:52:13	2026-07-24 10:52:13	t
\.


--
-- Data for Name: user_identities; Type: TABLE DATA; Schema: auth; Owner: user_im
--

COPY auth.user_identities (id, user_id, provider, provider_uid, provider_email, verified_at, last_used_at, provider_data, created_at, updated_at) FROM stdin;
1	51	google	12258499634	operador1@incidents.local	2026-07-24 10:52:18	2026-07-24 10:52:18	{"avatar_url": "https://via.placeholder.com/200x200.png/00ccee?text=people+avatar+et", "provider_token": "qiR2auxhL1F5TyODdn0rTYhb4Q8tdEYHyx7atCRlnV3LWFc6mIWDatuvn3V8"}	2026-07-24 10:52:18	2026-07-24 10:52:18
2	53	google	10153236955	ciudadano1@incidents.local	2026-07-24 10:52:18	2026-07-24 10:52:18	{"avatar_url": "https://via.placeholder.com/200x200.png/000099?text=people+avatar+delectus", "provider_token": "478Kw1V6Vb5D56ribFy16UOICBxtPKMPtkNGqz5eSaRyNbcTmEo4p9fjL3bl"}	2026-07-24 10:52:18	2026-07-24 10:52:18
3	8	local	supervisor.guayas@incidents.local	supervisor.guayas@incidents.local	2026-07-24 10:52:06	2026-07-24 12:21:10	{"source": "email_password"}	2026-07-24 10:55:34	2026-07-24 12:21:10
\.


--
-- Data for Name: user_territories; Type: TABLE DATA; Schema: auth; Owner: user_im
--

COPY auth.user_territories (id, user_id, territorial_unit_id, assigned_by, assigned_at, unassigned_at, is_active, created_at, updated_at) FROM stdin;
1	2	2	1	2026-07-24 10:52:05	\N	t	2026-07-24 10:52:05	2026-07-24 10:52:05
2	3	2	1	2026-07-24 10:52:05	\N	t	2026-07-24 10:52:05	2026-07-24 10:52:05
3	4	2	1	2026-07-24 10:52:06	\N	t	2026-07-24 10:52:06	2026-07-24 10:52:06
4	5	2	1	2026-07-24 10:52:06	\N	t	2026-07-24 10:52:06	2026-07-24 10:52:06
5	6	2	1	2026-07-24 10:52:06	\N	t	2026-07-24 10:52:06	2026-07-24 10:52:06
6	7	2	1	2026-07-24 10:52:06	\N	t	2026-07-24 10:52:06	2026-07-24 10:52:06
7	8	3	1	2026-07-24 10:52:06	\N	t	2026-07-24 10:52:06	2026-07-24 10:52:06
8	9	3	1	2026-07-24 10:52:07	\N	t	2026-07-24 10:52:07	2026-07-24 10:52:07
9	10	3	1	2026-07-24 10:52:07	\N	t	2026-07-24 10:52:07	2026-07-24 10:52:07
10	11	3	1	2026-07-24 10:52:07	\N	t	2026-07-24 10:52:07	2026-07-24 10:52:07
11	12	3	1	2026-07-24 10:52:07	\N	t	2026-07-24 10:52:07	2026-07-24 10:52:07
12	13	3	1	2026-07-24 10:52:07	\N	t	2026-07-24 10:52:07	2026-07-24 10:52:07
13	14	4	1	2026-07-24 10:52:08	\N	t	2026-07-24 10:52:08	2026-07-24 10:52:08
14	15	4	1	2026-07-24 10:52:08	\N	t	2026-07-24 10:52:08	2026-07-24 10:52:08
15	16	4	1	2026-07-24 10:52:08	\N	t	2026-07-24 10:52:08	2026-07-24 10:52:08
16	17	4	1	2026-07-24 10:52:08	\N	t	2026-07-24 10:52:08	2026-07-24 10:52:08
17	18	4	1	2026-07-24 10:52:08	\N	t	2026-07-24 10:52:08	2026-07-24 10:52:08
18	19	4	1	2026-07-24 10:52:09	\N	t	2026-07-24 10:52:09	2026-07-24 10:52:09
19	20	5	1	2026-07-24 10:52:09	\N	t	2026-07-24 10:52:09	2026-07-24 10:52:09
20	21	5	1	2026-07-24 10:52:09	\N	t	2026-07-24 10:52:09	2026-07-24 10:52:09
21	22	5	1	2026-07-24 10:52:09	\N	t	2026-07-24 10:52:09	2026-07-24 10:52:09
22	23	5	1	2026-07-24 10:52:09	\N	t	2026-07-24 10:52:09	2026-07-24 10:52:09
23	24	5	1	2026-07-24 10:52:10	\N	t	2026-07-24 10:52:10	2026-07-24 10:52:10
24	25	5	1	2026-07-24 10:52:10	\N	t	2026-07-24 10:52:10	2026-07-24 10:52:10
25	26	6	1	2026-07-24 10:52:10	\N	t	2026-07-24 10:52:10	2026-07-24 10:52:10
26	27	6	1	2026-07-24 10:52:10	\N	t	2026-07-24 10:52:10	2026-07-24 10:52:10
27	28	6	1	2026-07-24 10:52:10	\N	t	2026-07-24 10:52:10	2026-07-24 10:52:10
28	29	6	1	2026-07-24 10:52:11	\N	t	2026-07-24 10:52:11	2026-07-24 10:52:11
29	30	6	1	2026-07-24 10:52:11	\N	t	2026-07-24 10:52:11	2026-07-24 10:52:11
30	31	6	1	2026-07-24 10:52:11	\N	t	2026-07-24 10:52:11	2026-07-24 10:52:11
31	32	7	1	2026-07-24 10:52:11	\N	t	2026-07-24 10:52:11	2026-07-24 10:52:11
32	33	7	1	2026-07-24 10:52:11	\N	t	2026-07-24 10:52:11	2026-07-24 10:52:11
33	34	7	1	2026-07-24 10:52:11	\N	t	2026-07-24 10:52:11	2026-07-24 10:52:11
34	35	7	1	2026-07-24 10:52:12	\N	t	2026-07-24 10:52:12	2026-07-24 10:52:12
35	36	7	1	2026-07-24 10:52:12	\N	t	2026-07-24 10:52:12	2026-07-24 10:52:12
36	37	7	1	2026-07-24 10:52:12	\N	t	2026-07-24 10:52:12	2026-07-24 10:52:12
37	38	8	1	2026-07-24 10:52:12	\N	t	2026-07-24 10:52:12	2026-07-24 10:52:12
38	39	8	1	2026-07-24 10:52:12	\N	t	2026-07-24 10:52:12	2026-07-24 10:52:12
39	40	8	1	2026-07-24 10:52:13	\N	t	2026-07-24 10:52:13	2026-07-24 10:52:13
40	41	8	1	2026-07-24 10:52:13	\N	t	2026-07-24 10:52:13	2026-07-24 10:52:13
41	42	8	1	2026-07-24 10:52:13	\N	t	2026-07-24 10:52:13	2026-07-24 10:52:13
42	43	8	1	2026-07-24 10:52:13	\N	t	2026-07-24 10:52:13	2026-07-24 10:52:13
43	44	9	1	2026-07-24 10:52:13	\N	t	2026-07-24 10:52:13	2026-07-24 10:52:13
44	45	9	1	2026-07-24 10:52:14	\N	t	2026-07-24 10:52:14	2026-07-24 10:52:14
45	46	9	1	2026-07-24 10:52:14	\N	t	2026-07-24 10:52:14	2026-07-24 10:52:14
46	47	9	1	2026-07-24 10:52:14	\N	t	2026-07-24 10:52:14	2026-07-24 10:52:14
47	48	9	1	2026-07-24 10:52:15	\N	t	2026-07-24 10:52:15	2026-07-24 10:52:15
48	49	9	1	2026-07-24 10:52:15	\N	t	2026-07-24 10:52:15	2026-07-24 10:52:15
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: auth; Owner: user_im
--

COPY auth.users (id, first_name, last_name, email, password, phone, profile_photo, email_verified_at, remember_token, last_login, is_active, created_at, updated_at, deleted_at, username, two_factor_secret, two_factor_recovery_codes, two_factor_confirmed_at) FROM stdin;
2	Adriana	Mero	supervisor.costa.norte@incidents.local	$2y$12$UOf.Ylmp6lkaUKzpJ3WtO.rfEEZ0Ked6fT3JF0rukgzKVPXMqywA2	0991000001	\N	2026-07-24 10:52:05	\N	\N	t	2026-07-24 10:52:05	2026-07-24 10:52:05	\N	adriana.mero	\N	\N	2026-07-24 10:52:05
3	Jorge Luis	Cedeño	operador.z1.01@incidents.local	$2y$12$2HH188EwwMdlC7y/aHHToOT3qGJoEMgg/5/4f4h5r5RooTsqfqJBW	0992001001	\N	2026-07-24 10:52:05	\N	\N	t	2026-07-24 10:52:05	2026-07-24 10:52:05	\N	operador.z1.01	\N	\N	2026-07-24 10:52:05
4	Maria Fernanda	Saltos	operador.z1.02@incidents.local	$2y$12$rQQ317vnmQ4jeNZjvoY8puwW.38Z05Z2I5hzDG5jUqQcizKIh5NSi	0992001002	\N	2026-07-24 10:52:06	\N	\N	t	2026-07-24 10:52:06	2026-07-24 10:52:06	\N	operador.z1.02	\N	\N	2026-07-24 10:52:06
5	Kevin Andres	Moreira	operador.z1.03@incidents.local	$2y$12$1Mmu5Wm3vnJQUjJNPoLGF.4N3MuGCktGL/v3o0qdqyOWTAspxZccq	0992001003	\N	2026-07-24 10:52:06	\N	\N	t	2026-07-24 10:52:06	2026-07-24 10:52:06	\N	operador.z1.03	\N	\N	2026-07-24 10:52:06
6	Genesis Paola	Villacres	operador.z1.04@incidents.local	$2y$12$kByq6MhvXwEm0x6lGV3ceOk2mJzH9/5cSX/W3yxRLWNEzx11Kp5LS	0992001004	\N	2026-07-24 10:52:06	\N	\N	t	2026-07-24 10:52:06	2026-07-24 10:52:06	\N	operador.z1.04	\N	\N	2026-07-24 10:52:06
7	Bryan Alexander	Chonillo	operador.z1.05@incidents.local	$2y$12$fEgTWKVSPNfETPa5Qz3SQ.7c9ffIyCGe3m.iif0/fGYhGtCOsnF0S	0992001005	\N	2026-07-24 10:52:06	\N	\N	t	2026-07-24 10:52:06	2026-07-24 10:52:06	\N	operador.z1.05	\N	\N	2026-07-24 10:52:06
9	Karla Melissa	Galarza	operador.z2.01@incidents.local	$2y$12$maH72YxPW4aR1Ua85FTrPuf9YA1/YBkYZel0w2SSr/sdei.EIX8ya	0992002001	\N	2026-07-24 10:52:07	\N	\N	t	2026-07-24 10:52:07	2026-07-24 10:52:07	\N	operador.z2.01	\N	\N	2026-07-24 10:52:07
10	Luis Fernando	Peñafiel	operador.z2.02@incidents.local	$2y$12$iydWvxfiOuRbDcHp1/EmeuZkfs4z0McyGYFHCvXwUVkjSG21n6Bj6	0992002002	\N	2026-07-24 10:52:07	\N	\N	t	2026-07-24 10:52:07	2026-07-24 10:52:07	\N	operador.z2.02	\N	\N	2026-07-24 10:52:07
11	Diana Carolina	Suarez	operador.z2.03@incidents.local	$2y$12$MOMyExLFGe2D9gBUmBAfVOtMIczpbVxR0QUs99mwnGTkDFeN3Oz7W	0992002003	\N	2026-07-24 10:52:07	\N	\N	t	2026-07-24 10:52:07	2026-07-24 10:52:07	\N	operador.z2.03	\N	\N	2026-07-24 10:52:07
12	Anthony Joel	Espinoza	operador.z2.04@incidents.local	$2y$12$iC6dMyqJGzGq2oAXJz88P.rCOF3dcZe4qubeHwnz06miFcW9rzViW	0992002004	\N	2026-07-24 10:52:07	\N	\N	t	2026-07-24 10:52:07	2026-07-24 10:52:07	\N	operador.z2.04	\N	\N	2026-07-24 10:52:07
13	Josselyn Estefania	Velez	operador.z2.05@incidents.local	$2y$12$nrvtpa/0tuKxX1HUB5Rbk.tlIJkD/0mJElfbNjQ45.xmOrvediITe	0992002005	\N	2026-07-24 10:52:07	\N	\N	t	2026-07-24 10:52:07	2026-07-24 10:52:07	\N	operador.z2.05	\N	\N	2026-07-24 10:52:07
14	Carmen	Piguave	supervisor.costa.sur@incidents.local	$2y$12$BtTQDnhddT1C8kw0oz4W2e3hu2w1tmFnaefDbazv1Va/wB2GOR5hq	0991000003	\N	2026-07-24 10:52:08	\N	\N	t	2026-07-24 10:52:08	2026-07-24 10:52:08	\N	carmen.piguave	\N	\N	2026-07-24 10:52:08
15	Jonathan David	Pincay	operador.z3.01@incidents.local	$2y$12$.hgO9eahW1IdoOFtzZGHguvqcTM1Sgo/Xm95ZrRIUQQwmZQEUyJ6u	0992003001	\N	2026-07-24 10:52:08	\N	\N	t	2026-07-24 10:52:08	2026-07-24 10:52:08	\N	operador.z3.01	\N	\N	2026-07-24 10:52:08
16	Evelyn Johanna	Macias	operador.z3.02@incidents.local	$2y$12$XApTrFf2jRPVrE3OlL0B8OB2pmoZwRj/3WxN96yjJlBWDdDDqy9xm	0992003002	\N	2026-07-24 10:52:08	\N	\N	t	2026-07-24 10:52:08	2026-07-24 10:52:08	\N	operador.z3.02	\N	\N	2026-07-24 10:52:08
17	Christian Paul	Intriago	operador.z3.03@incidents.local	$2y$12$x9f3iHwEb75XEC4suTIWKeN5WeCXm2TYO0/ACSXMvRRWEWHwWPKP.	0992003003	\N	2026-07-24 10:52:08	\N	\N	t	2026-07-24 10:52:08	2026-07-24 10:52:08	\N	operador.z3.03	\N	\N	2026-07-24 10:52:08
18	Katherine Lisseth	Quijije	operador.z3.04@incidents.local	$2y$12$yCvSudQtLCsgB6wVAmeEg.oKhSG71AFeFlXNTuXNad9HnYQJKZWIq	0992003004	\N	2026-07-24 10:52:08	\N	\N	t	2026-07-24 10:52:08	2026-07-24 10:52:08	\N	operador.z3.04	\N	\N	2026-07-24 10:52:08
19	Carlos Alberto	Ceballos	operador.z3.05@incidents.local	$2y$12$fkGUFY8i7mzznHDDho02oOoQRHJr12.JyICFixKodkOgugXBacHQG	0992003005	\N	2026-07-24 10:52:09	\N	\N	t	2026-07-24 10:52:09	2026-07-24 10:52:09	\N	operador.z3.05	\N	\N	2026-07-24 10:52:09
1	Administrador	Sistema	admin@incidents.local	$2y$12$yWjz6HvjSHFKC.Z4kXD4XuIhG/QVLpEvi24pTyHlzn6AMrv7FyUay	0990000001	\N	2026-07-24 10:52:16	\N	2026-07-24 10:10:16	t	2026-07-24 10:52:05	2026-07-24 10:52:16	\N	admin.sistema	\N	\N	\N
8	Bruno	Aviles	supervisor.guayas@incidents.local	$2y$12$GFUpDkTKtRKu/39W7OmfN.m67R0KvnzfzVCcEKGeC6x8145WqRGHm	0991000002	\N	2026-07-24 10:52:06	\N	2026-07-24 12:21:10	t	2026-07-24 10:52:06	2026-07-24 12:21:10	\N	bruno.aviles	\N	\N	2026-07-24 10:52:06
20	Diego	Burbano	supervisor.sierra.centro@incidents.local	$2y$12$cS.ENQJ9KL7cIsPsTbAnr.nDAQ/jlnPYQqzwHxQ/hEqfdRab5s1j.	0991000004	\N	2026-07-24 10:52:09	\N	\N	t	2026-07-24 10:52:09	2026-07-24 10:52:09	\N	diego.burbano	\N	\N	2026-07-24 10:52:09
21	Jessica Maribel	Tisalema	operador.z4.01@incidents.local	$2y$12$khi79uD3JEWrxQJFu5TQ7O.rYwMoTF6acdHU1me4UH.BTb7Ko0IsW	0992004001	\N	2026-07-24 10:52:09	\N	\N	t	2026-07-24 10:52:09	2026-07-24 10:52:09	\N	operador.z4.01	\N	\N	2026-07-24 10:52:09
22	Darwin Patricio	Chango	operador.z4.02@incidents.local	$2y$12$/l/7Fng3b6DV6lPEN3Hgy.vvOfXNvngKMNV6SqmaQhZTXIic20Y4C	0992004002	\N	2026-07-24 10:52:09	\N	\N	t	2026-07-24 10:52:09	2026-07-24 10:52:09	\N	operador.z4.02	\N	\N	2026-07-24 10:52:09
23	Silvia Elena	Toaquiza	operador.z4.03@incidents.local	$2y$12$8BA7TpxnlxKLVkvXj03Be.6GDCY6VAHFVsYWIdadLeUeo4Vl76nZ.	0992004003	\N	2026-07-24 10:52:09	\N	\N	t	2026-07-24 10:52:09	2026-07-24 10:52:09	\N	operador.z4.03	\N	\N	2026-07-24 10:52:09
24	Victor Hugo	Lema	operador.z4.04@incidents.local	$2y$12$YebIEQAGydIr1ZeNSHXzbe1.pBWs8oTj8hXXVyyOzY/aCOFJu.Hje	0992004004	\N	2026-07-24 10:52:10	\N	\N	t	2026-07-24 10:52:10	2026-07-24 10:52:10	\N	operador.z4.04	\N	\N	2026-07-24 10:52:10
25	Monica Alexandra	Pilaluisa	operador.z4.05@incidents.local	$2y$12$f2OlQ5UcfMwL51G0wuEdCeSho6XJdtAitz1CPHGsrGUCZbwQznga6	0992004005	\N	2026-07-24 10:52:10	\N	\N	t	2026-07-24 10:52:10	2026-07-24 10:52:10	\N	operador.z4.05	\N	\N	2026-07-24 10:52:10
26	Elena	Siguenza	supervisor.austro@incidents.local	$2y$12$UmTmMKiuHJ23z2aH53k5LeXMfpouwvp0uOkNk9mbQThqFketTK7i2	0991000005	\N	2026-07-24 10:52:10	\N	\N	t	2026-07-24 10:52:10	2026-07-24 10:52:10	\N	elena.siguenza	\N	\N	2026-07-24 10:52:10
27	Juan Carlos	Vintimilla	operador.z5.01@incidents.local	$2y$12$zGYkStf.iNwTJIRE1VmYkO0mGI1XFCoKqZwzWc0pxV4B.C0xItY8e	0992005001	\N	2026-07-24 10:52:10	\N	\N	t	2026-07-24 10:52:10	2026-07-24 10:52:10	\N	operador.z5.01	\N	\N	2026-07-24 10:52:10
28	Pedro Pablo	Sarmiento	operador.z5.02@incidents.local	$2y$12$YO0DvqR1aFyE5sbGf39/uOS7nvO8z7tHzHtFUvKiVWFFw.8zQwdOm	0992005002	\N	2026-07-24 10:52:10	\N	\N	t	2026-07-24 10:52:10	2026-07-24 10:52:10	\N	operador.z5.02	\N	\N	2026-07-24 10:52:10
29	Ana Lucia	Pesantez	operador.z5.03@incidents.local	$2y$12$QuaVYM03IoXIIt/Qz6aQ9uyQ/XhmmaFf.fq9Vgl2JrQqGluVte38y	0992005003	\N	2026-07-24 10:52:10	\N	\N	t	2026-07-24 10:52:10	2026-07-24 10:52:10	\N	operador.z5.03	\N	\N	2026-07-24 10:52:10
30	Diego Armando	Cardenas	operador.z5.04@incidents.local	$2y$12$zVK84qhU7KXWihOKCgVEe.gFSRYuq4PBhQeCt8Pe1e1ulwy31XQN2	0992005004	\N	2026-07-24 10:52:11	\N	\N	t	2026-07-24 10:52:11	2026-07-24 10:52:11	\N	operador.z5.04	\N	\N	2026-07-24 10:52:11
31	Maria Jose	Orellana	operador.z5.05@incidents.local	$2y$12$s6SAs4yVpeg0/pQBGmexwO/bJfugAf.4PKRRfq55lkuyBZBD.mDQ.	0992005005	\N	2026-07-24 10:52:11	\N	\N	t	2026-07-24 10:52:11	2026-07-24 10:52:11	\N	operador.z5.05	\N	\N	2026-07-24 10:52:11
32	Fabian	Shiguango	supervisor.amazonia.sur@incidents.local	$2y$12$FMId3vC9gQf59IWgKG25IuRVL5.VTo3I25NpeVgnpDHoo9eiaI12e	0991000006	\N	2026-07-24 10:52:11	\N	\N	t	2026-07-24 10:52:11	2026-07-24 10:52:11	\N	fabian.shiguango	\N	\N	2026-07-24 10:52:11
33	Byron Eduardo	Tanguila	operador.z6.01@incidents.local	$2y$12$G39EnJc5Bm07nQEEGLBos.OpdtkACZ5imsEzYEonec9uhB9GY.S5y	0992006001	\N	2026-07-24 10:52:11	\N	\N	t	2026-07-24 10:52:11	2026-07-24 10:52:11	\N	operador.z6.01	\N	\N	2026-07-24 10:52:11
34	Nancy Patricia	Grefa	operador.z6.02@incidents.local	$2y$12$zaEjNFNQpfCAveSpKmgvbOzHKdcMXSLa2Fdq09.n4M9LUz7ooIrMa	0992006002	\N	2026-07-24 10:52:11	\N	\N	t	2026-07-24 10:52:11	2026-07-24 10:52:11	\N	operador.z6.02	\N	\N	2026-07-24 10:52:11
35	Oscar Vladimir	Tapuy	operador.z6.03@incidents.local	$2y$12$g9SQ1bH0WIabLNCUwqY6y.SW6GIcCetuYqtxvk8uddAQ1Yft.Y7.C	0992006003	\N	2026-07-24 10:52:12	\N	\N	t	2026-07-24 10:52:12	2026-07-24 10:52:12	\N	operador.z6.03	\N	\N	2026-07-24 10:52:12
36	Rosa Elena	Cerda	operador.z6.04@incidents.local	$2y$12$poPvBoFSU4GIxArdIyo4hOVxtyOdKZ0bVTUX5rwxRZUZgFwWCBdB6	0992006004	\N	2026-07-24 10:52:12	\N	\N	t	2026-07-24 10:52:12	2026-07-24 10:52:12	\N	operador.z6.04	\N	\N	2026-07-24 10:52:12
37	Wilson Javier	Alvarado	operador.z6.05@incidents.local	$2y$12$t8Z81sydSHBc/Hm0IiCPhemV/7uR2feBdMM9td99JcL.7gqxzJxHi	0992006005	\N	2026-07-24 10:52:12	\N	\N	t	2026-07-24 10:52:12	2026-07-24 10:52:12	\N	operador.z6.05	\N	\N	2026-07-24 10:52:12
38	Gabriela	Munoz	supervisor.insular@incidents.local	$2y$12$wZ2GpJHLRHKTVPaOqo7pJOItXseb6rWfIcmp5vW//PfoqslH5XSla	0991000007	\N	2026-07-24 10:52:12	\N	\N	t	2026-07-24 10:52:12	2026-07-24 10:52:12	\N	gabriela.munoz	\N	\N	2026-07-24 10:52:12
39	Roberto Carlos	Cruz	operador.z7.01@incidents.local	$2y$12$0Mv7xdOvRiCki5XCS1UzVetw2QYUQ3qQ2tTnKVRTE4dhiSvTfOrTq	0992007001	\N	2026-07-24 10:52:12	\N	\N	t	2026-07-24 10:52:12	2026-07-24 10:52:12	\N	operador.z7.01	\N	\N	2026-07-24 10:52:12
40	Andrea Victoria	Cobos	operador.z7.02@incidents.local	$2y$12$XjArTpTOn9q6xhpgUlBMUeCTipq6xO8qKyVrOC/Vj2ziqS/a.90my	0992007002	\N	2026-07-24 10:52:13	\N	\N	t	2026-07-24 10:52:13	2026-07-24 10:52:13	\N	operador.z7.02	\N	\N	2026-07-24 10:52:13
41	Julio Cesar	Mora	operador.z7.03@incidents.local	$2y$12$.9024px0WA0YT0PJeYL.2uygeCT6qgnj5G54Yz/cfjocpOYhMy7B2	0992007003	\N	2026-07-24 10:52:13	\N	\N	t	2026-07-24 10:52:13	2026-07-24 10:52:13	\N	operador.z7.03	\N	\N	2026-07-24 10:52:13
42	Veronica Paulina	Salas	operador.z7.04@incidents.local	$2y$12$cf..7FrIINu5n2QUND/RxOaFOWEfL2bnEGKDiGnc3N1SlbjckHCQ6	0992007004	\N	2026-07-24 10:52:13	\N	\N	t	2026-07-24 10:52:13	2026-07-24 10:52:13	\N	operador.z7.04	\N	\N	2026-07-24 10:52:13
43	Eduardo Josue	Vaca	operador.z7.05@incidents.local	$2y$12$kEZwByTZKk25GYPK6ZIqJuihE/lfN/KWS3z1nVGSzYHk9zyMydufy	0992007005	\N	2026-07-24 10:52:13	\N	\N	t	2026-07-24 10:52:13	2026-07-24 10:52:13	\N	operador.z7.05	\N	\N	2026-07-24 10:52:13
44	Hector	Jimpikit	supervisor.amazonia.norte@incidents.local	$2y$12$p94uKc369yR1sY9EQ2wEGeituZjBjqmLFQ/M5lGLDfhrBH8UogT6q	0991000008	\N	2026-07-24 10:52:13	\N	\N	t	2026-07-24 10:52:13	2026-07-24 10:52:13	\N	hector.jimpikit	\N	\N	2026-07-24 10:52:13
45	Monica Rocio	Jumbo	operador.z8.01@incidents.local	$2y$12$/2HIZ.6bOlo06cjD.lLq6u.nDaNSpNb98RVL2URpsVeH30G7vpJDe	0992008001	\N	2026-07-24 10:52:14	\N	\N	t	2026-07-24 10:52:14	2026-07-24 10:52:14	\N	operador.z8.01	\N	\N	2026-07-24 10:52:14
46	Luis Alfredo	Vargas	operador.z8.02@incidents.local	$2y$12$987a.ObxlLmBP40YUlK6NuEosofIwGJZzzcqEcJaFITDRKZN1bMSW	0992008002	\N	2026-07-24 10:52:14	\N	\N	t	2026-07-24 10:52:14	2026-07-24 10:52:14	\N	operador.z8.02	\N	\N	2026-07-24 10:52:14
47	Tatiana Elizabeth	Ruiz	operador.z8.03@incidents.local	$2y$12$1TpDmVQoBqOzikGbM3iV9usQ.zHTemSzyI2HueBQmlEwCi9yph2R.	0992008003	\N	2026-07-24 10:52:14	\N	\N	t	2026-07-24 10:52:14	2026-07-24 10:52:14	\N	operador.z8.03	\N	\N	2026-07-24 10:52:14
48	Miguel Angel	Narvaez	operador.z8.04@incidents.local	$2y$12$bCg8KS3RtMHhztjxC.aobuxr1qEnR8u86KmA4poD9Z9TJWdXbisy6	0992008004	\N	2026-07-24 10:52:15	\N	\N	t	2026-07-24 10:52:15	2026-07-24 10:52:15	\N	operador.z8.04	\N	\N	2026-07-24 10:52:15
49	Sandra Lorena	Yumbo	operador.z8.05@incidents.local	$2y$12$XCINc/WGII438LVDEHDh0O0wcQgeSbEmu04pT9KALNANjaVKDFjXq	0992008005	\N	2026-07-24 10:52:15	\N	\N	t	2026-07-24 10:52:15	2026-07-24 10:52:15	\N	operador.z8.05	\N	\N	2026-07-24 10:52:15
50	Carla	Mendoza	supervisor@incidents.local	$2y$12$KIjhOC2Xd4pQGFDH3qwC1.Q5O/KjDEOSnhIDRzDvo8twBVq6e2CmG	0990000002	\N	2026-07-24 10:52:17	\N	2026-07-24 08:35:17	t	2026-07-24 10:52:17	2026-07-24 10:52:17	\N	carla.mendoza	\N	\N	\N
51	Luis	Andrade	operador1@incidents.local	$2y$12$Z0eH2rMe3xp/rZ3Q9FTxZ.4PlBdnQYZbzMePcLQ/EwC7KmwM98l4y	0990000003	\N	2026-07-24 10:52:17	\N	2026-07-24 08:37:17	t	2026-07-24 10:52:17	2026-07-24 10:52:17	\N	luis.andrade	\N	\N	\N
52	Nadia	Vera	operador2@incidents.local	$2y$12$UhRrqibtelZKMs7H8K/2quNup5iO1G6EHqEN.b08.5snm3gOPW6vK	0990000004	\N	2026-07-24 10:52:17	\N	2026-07-24 08:30:17	t	2026-07-24 10:52:17	2026-07-24 10:52:17	\N	nadia.vera	\N	\N	\N
53	Mateo	Rojas	ciudadano1@incidents.local	$2y$12$s8MLyR.wyGqGeQTMeQDu5uo32IJC.7UbeOoEAB7/lSsKmOrf1VaYu	0990000005	\N	2026-07-24 10:52:18	\N	2026-07-24 08:46:18	t	2026-07-24 10:52:18	2026-07-24 10:52:18	\N	mateo.rojas	\N	\N	\N
54	Sofia	Castillo	ciudadano2@incidents.local	$2y$12$ALJqFuniXgdsDMdoCCDyVuKlwhO5mJq4l3ACzNoMfFlPdwOKk7GP.	0990000006	\N	2026-07-24 10:52:18	\N	2026-07-24 08:31:18	t	2026-07-24 10:52:18	2026-07-24 10:52:18	\N	sofia.castillo	\N	\N	\N
55	Diego	Paredes	ciudadano3@incidents.local	$2y$12$AnTjUE1GammZcGPQERFunu8CqyAE9siuIZbnLUiNJWbwh9skJNfGi	0990000007	\N	2026-07-24 10:52:18	\N	2026-07-24 09:18:18	t	2026-07-24 10:52:18	2026-07-24 10:52:18	\N	diego.paredes	\N	\N	\N
\.


--
-- Data for Name: categories; Type: TABLE DATA; Schema: core; Owner: user_im
--

COPY core.categories (id, name, description, icon, color, is_active, created_at, updated_at, is_fallback) FROM stdin;
1	Vialidad	Problemas relacionados con calles, carreteras y vías públicas	fa-road	#6366F1	t	2026-07-24 10:51:50	2026-07-24 10:51:50	f
2	Servicios Públicos	Agua potable, alcantarillado y drenaje	fa-faucet-drip	#0EA5E9	t	2026-07-24 10:51:50	2026-07-24 10:51:50	f
3	Alumbrado Público	Luminarias, postes y cableado eléctrico público	fa-lightbulb	#F59E0B	t	2026-07-24 10:51:50	2026-07-24 10:51:50	f
4	Espacios Públicos	Parques, plazas, áreas verdes y mobiliario urbano	fa-tree	#22C55E	t	2026-07-24 10:51:50	2026-07-24 10:51:50	f
5	Recolección de Residuos	Basura, residuos y limpieza urbana	fa-trash	#A855F7	t	2026-07-24 10:51:50	2026-07-24 10:51:50	f
6	Seguridad	Situaciones que afectan la seguridad ciudadana	fa-shield-halved	#EF4444	t	2026-07-24 10:51:50	2026-07-24 10:51:50	f
7	Sin clasificar	Clasificación temporal para incidencias que no están cubiertas por el catálogo.	fa-circle-question	#6B7280	t	2026-07-24 10:51:50	2026-07-24 10:51:50	t
\.


--
-- Data for Name: incident_assignments; Type: TABLE DATA; Schema: core; Owner: user_im
--

COPY core.incident_assignments (id, incident_id, user_id, assigned_by_id, assignment_date, unassignment_date, created_at, updated_at, assignment_role, active, resolved_at, incident_cycle_id) FROM stdin;
1	1	29	26	2026-07-24 07:12:27	\N	2026-07-24 07:12:27	2026-07-24 07:12:27	primary	t	\N	\N
2	2	28	26	2026-07-13 12:35:27	\N	2026-07-13 12:35:27	2026-07-13 12:35:27	primary	t	\N	\N
3	3	13	8	2026-07-14 23:39:27	\N	2026-07-14 23:39:27	2026-07-14 23:39:27	primary	t	\N	\N
4	6	30	26	2026-06-25 16:16:28	\N	2026-06-25 16:16:28	2026-06-25 16:16:28	primary	t	\N	\N
5	7	16	14	2026-07-04 04:02:28	\N	2026-07-04 04:02:28	2026-07-04 04:02:28	primary	t	\N	\N
6	8	11	8	2026-07-19 02:25:28	\N	2026-07-19 02:25:28	2026-07-19 02:25:28	primary	t	\N	\N
7	9	9	8	2026-06-27 22:19:28	\N	2026-06-27 22:19:28	2026-06-27 22:19:28	primary	t	\N	\N
8	10	15	14	2026-07-10 11:19:28	\N	2026-07-10 11:19:28	2026-07-10 11:19:28	primary	t	\N	\N
9	11	31	26	2026-06-26 12:42:28	\N	2026-06-26 12:42:28	2026-06-26 12:42:28	primary	t	\N	\N
10	12	10	8	2026-07-12 09:19:28	\N	2026-07-12 09:19:28	2026-07-12 09:19:28	primary	t	\N	\N
11	13	15	14	2026-07-12 17:09:28	\N	2026-07-12 17:09:28	2026-07-12 17:09:28	primary	t	\N	\N
12	15	13	8	2026-07-16 18:23:28	\N	2026-07-16 18:23:28	2026-07-16 18:23:28	primary	t	\N	\N
13	16	12	8	2026-07-22 21:02:28	\N	2026-07-22 21:02:28	2026-07-22 21:02:28	primary	t	\N	\N
14	19	13	8	2026-07-18 11:44:28	\N	2026-07-18 11:44:28	2026-07-18 11:44:28	primary	t	\N	\N
15	20	28	26	2026-07-06 11:28:28	\N	2026-07-06 11:28:28	2026-07-06 11:28:28	primary	t	\N	\N
16	21	11	8	2026-07-19 20:43:28	\N	2026-07-19 20:43:28	2026-07-19 20:43:28	primary	t	\N	\N
17	22	27	26	2026-07-07 03:13:28	\N	2026-07-07 03:13:28	2026-07-07 03:13:28	primary	t	\N	\N
18	23	12	8	2026-07-11 12:30:28	\N	2026-07-11 12:30:28	2026-07-11 12:30:28	primary	t	\N	\N
19	24	11	8	2026-07-09 02:32:28	\N	2026-07-09 02:32:28	2026-07-09 02:32:28	primary	t	\N	\N
20	25	11	8	2026-07-22 11:24:28	\N	2026-07-22 11:24:28	2026-07-22 11:24:28	primary	t	\N	\N
21	26	19	14	2026-07-07 18:05:28	\N	2026-07-07 18:05:28	2026-07-07 18:05:28	primary	t	\N	\N
22	27	13	8	2026-07-14 10:05:28	\N	2026-07-14 10:05:28	2026-07-14 10:05:28	primary	t	\N	\N
23	28	30	26	2026-07-10 10:02:28	\N	2026-07-10 10:02:28	2026-07-10 10:02:28	primary	t	\N	\N
24	29	10	8	2026-07-13 05:42:28	\N	2026-07-13 05:42:28	2026-07-13 05:42:28	primary	t	\N	\N
25	30	11	8	2026-06-24 14:38:28	\N	2026-06-24 14:38:28	2026-06-24 14:38:28	primary	t	\N	\N
26	31	11	8	2026-07-01 21:34:28	\N	2026-07-01 21:34:28	2026-07-01 21:34:28	primary	t	\N	\N
27	33	29	26	2026-07-10 11:34:28	\N	2026-07-10 11:34:28	2026-07-10 11:34:28	primary	t	\N	\N
28	34	15	14	2026-07-18 14:50:28	\N	2026-07-18 14:50:28	2026-07-18 14:50:28	primary	t	\N	\N
29	35	12	8	2026-07-24 00:19:28	\N	2026-07-24 00:19:28	2026-07-24 00:19:28	primary	t	\N	\N
30	37	16	14	2026-06-24 16:16:28	\N	2026-06-24 16:16:28	2026-06-24 16:16:28	primary	t	\N	\N
31	38	18	14	2026-06-28 00:09:28	\N	2026-06-28 00:09:28	2026-06-28 00:09:28	primary	t	\N	\N
32	39	10	8	2026-07-11 00:26:28	\N	2026-07-11 00:26:28	2026-07-11 00:26:28	primary	t	\N	\N
33	40	12	8	2026-06-28 11:23:28	\N	2026-06-28 11:23:28	2026-06-28 11:23:28	primary	t	\N	\N
34	41	9	8	2026-07-01 11:39:28	\N	2026-07-01 11:39:28	2026-07-01 11:39:28	primary	t	\N	\N
35	45	27	26	2026-07-16 19:21:28	\N	2026-07-16 19:21:28	2026-07-16 19:21:28	primary	t	\N	\N
36	46	19	14	2026-07-13 17:51:28	\N	2026-07-13 17:51:28	2026-07-13 17:51:28	primary	t	\N	\N
37	47	15	14	2026-06-29 20:43:28	\N	2026-06-29 20:43:28	2026-06-29 20:43:28	primary	t	\N	\N
38	48	28	26	2026-06-24 13:48:28	\N	2026-06-24 13:48:28	2026-06-24 13:48:28	primary	t	\N	\N
39	49	11	8	2026-06-28 16:13:28	\N	2026-06-28 16:13:28	2026-06-28 16:13:28	primary	t	\N	\N
40	50	27	26	2026-06-23 17:16:28	\N	2026-06-23 17:16:28	2026-06-23 17:16:28	primary	t	\N	\N
41	51	18	14	2026-06-27 15:30:28	\N	2026-06-27 15:30:28	2026-06-27 15:30:28	primary	t	\N	\N
42	52	30	26	2026-07-05 13:05:28	\N	2026-07-05 13:05:28	2026-07-05 13:05:28	primary	t	\N	\N
43	53	19	14	2026-07-05 19:46:28	\N	2026-07-05 19:46:28	2026-07-05 19:46:28	primary	t	\N	\N
44	54	16	14	2026-07-21 10:11:28	\N	2026-07-21 10:11:28	2026-07-21 10:11:28	primary	t	\N	\N
45	56	9	8	2026-06-29 07:11:28	\N	2026-06-29 07:11:28	2026-06-29 07:11:28	primary	t	\N	\N
46	57	15	14	2026-07-16 21:33:28	\N	2026-07-16 21:33:28	2026-07-16 21:33:28	primary	t	\N	\N
47	58	17	14	2026-07-05 12:29:28	\N	2026-07-05 12:29:28	2026-07-05 12:29:28	primary	t	\N	\N
48	59	29	26	2026-07-08 08:38:28	\N	2026-07-08 08:38:28	2026-07-08 08:38:28	primary	t	\N	\N
49	61	17	14	2026-06-29 03:43:28	\N	2026-06-29 03:43:28	2026-06-29 03:43:28	primary	t	\N	\N
50	62	9	8	2026-07-03 06:19:28	\N	2026-07-03 06:19:28	2026-07-03 06:19:28	primary	t	\N	\N
51	63	13	8	2026-07-02 00:35:28	\N	2026-07-02 00:35:28	2026-07-02 00:35:28	primary	t	\N	\N
52	64	19	14	2026-06-29 14:40:28	\N	2026-06-29 14:40:28	2026-06-29 14:40:28	primary	t	\N	\N
53	65	12	8	2026-06-26 22:52:28	\N	2026-06-26 22:52:28	2026-06-26 22:52:28	primary	t	\N	\N
54	66	13	8	2026-07-10 11:27:28	\N	2026-07-10 11:27:28	2026-07-10 11:27:28	primary	t	\N	\N
55	67	15	14	2026-07-05 16:34:28	\N	2026-07-05 16:34:28	2026-07-05 16:34:28	primary	t	\N	\N
56	68	13	8	2026-07-13 08:14:28	\N	2026-07-13 08:14:28	2026-07-13 08:14:28	primary	t	\N	\N
57	69	15	14	2026-07-09 13:04:28	\N	2026-07-09 13:04:28	2026-07-09 13:04:28	primary	t	\N	\N
58	70	9	8	2026-07-07 07:43:28	\N	2026-07-07 07:43:28	2026-07-07 07:43:28	primary	t	\N	\N
59	71	27	26	2026-06-28 00:11:28	\N	2026-06-28 00:11:28	2026-06-28 00:11:28	primary	t	\N	\N
60	72	19	14	2026-06-24 10:52:28	\N	2026-06-24 10:52:28	2026-06-24 10:52:28	primary	t	\N	\N
61	74	15	14	2026-07-14 00:30:28	\N	2026-07-14 00:30:28	2026-07-14 00:30:28	primary	t	\N	\N
62	76	13	8	2026-07-21 22:37:28	\N	2026-07-21 22:37:28	2026-07-21 22:37:28	primary	t	\N	\N
63	77	29	26	2026-07-13 06:27:28	\N	2026-07-13 06:27:28	2026-07-13 06:27:28	primary	t	\N	\N
64	78	17	14	2026-06-28 00:20:28	\N	2026-06-28 00:20:28	2026-06-28 00:20:28	primary	t	\N	\N
65	79	9	8	2026-07-23 08:49:28	\N	2026-07-23 08:49:28	2026-07-23 08:49:28	primary	t	\N	\N
66	80	10	8	2026-07-12 22:35:28	\N	2026-07-12 22:35:28	2026-07-12 22:35:28	primary	t	\N	\N
67	81	29	26	2026-07-03 14:50:28	\N	2026-07-03 14:50:28	2026-07-03 14:50:28	primary	t	\N	\N
68	83	30	26	2026-07-08 02:08:28	\N	2026-07-08 02:08:28	2026-07-08 02:08:28	primary	t	\N	\N
69	84	16	14	2026-06-30 15:11:28	\N	2026-06-30 15:11:28	2026-06-30 15:11:28	primary	t	\N	\N
70	85	13	8	2026-07-23 04:17:28	\N	2026-07-23 04:17:28	2026-07-23 04:17:28	primary	t	\N	\N
71	88	19	14	2026-06-30 01:02:28	\N	2026-06-30 01:02:28	2026-06-30 01:02:28	primary	t	\N	\N
72	89	17	14	2026-06-30 18:39:28	\N	2026-06-30 18:39:28	2026-06-30 18:39:28	primary	t	\N	\N
73	90	16	14	2026-07-10 15:25:28	\N	2026-07-10 15:25:28	2026-07-10 15:25:28	primary	t	\N	\N
74	91	29	26	2026-07-14 20:30:28	\N	2026-07-14 20:30:28	2026-07-14 20:30:28	primary	t	\N	\N
75	94	29	26	2026-07-19 12:36:28	\N	2026-07-19 12:36:28	2026-07-19 12:36:28	primary	t	\N	\N
76	95	29	26	2026-06-30 17:10:28	\N	2026-06-30 17:10:28	2026-06-30 17:10:28	primary	t	\N	\N
77	97	27	26	2026-07-01 14:18:28	\N	2026-07-01 14:18:28	2026-07-01 14:18:28	primary	t	\N	\N
78	98	13	8	2026-07-22 18:29:28	\N	2026-07-22 18:29:28	2026-07-22 18:29:28	primary	t	\N	\N
79	99	31	26	2026-07-16 18:44:28	\N	2026-07-16 18:44:28	2026-07-16 18:44:28	primary	t	\N	\N
80	100	9	8	2026-06-24 16:41:28	\N	2026-06-24 16:41:28	2026-06-24 16:41:28	primary	t	\N	\N
81	101	12	8	2026-07-08 02:44:28	\N	2026-07-08 02:44:28	2026-07-08 02:44:28	primary	t	\N	\N
82	102	16	14	2026-07-14 12:40:28	\N	2026-07-14 12:40:28	2026-07-14 12:40:28	primary	t	\N	\N
83	103	9	8	2026-06-30 17:25:28	\N	2026-06-30 17:25:28	2026-06-30 17:25:28	primary	t	\N	\N
84	104	12	8	2026-07-06 16:35:28	\N	2026-07-06 16:35:28	2026-07-06 16:35:28	primary	t	\N	\N
85	105	29	26	2026-06-25 01:23:28	\N	2026-06-25 01:23:28	2026-06-25 01:23:28	primary	t	\N	\N
86	107	9	8	2026-07-01 06:18:28	\N	2026-07-01 06:18:28	2026-07-01 06:18:28	primary	t	\N	\N
87	108	30	26	2026-07-18 16:36:28	\N	2026-07-18 16:36:28	2026-07-18 16:36:28	primary	t	\N	\N
88	109	19	14	2026-07-12 16:36:28	\N	2026-07-12 16:36:28	2026-07-12 16:36:28	primary	t	\N	\N
89	110	19	14	2026-07-15 04:35:28	\N	2026-07-15 04:35:28	2026-07-15 04:35:28	primary	t	\N	\N
90	112	31	26	2026-07-13 06:06:28	\N	2026-07-13 06:06:28	2026-07-13 06:06:28	primary	t	\N	\N
91	114	13	8	2026-07-20 10:22:28	\N	2026-07-20 10:22:28	2026-07-20 10:22:28	primary	t	\N	\N
92	115	16	14	2026-07-17 09:15:28	\N	2026-07-17 09:15:28	2026-07-17 09:15:28	primary	t	\N	\N
93	116	31	26	2026-06-27 12:35:28	\N	2026-06-27 12:35:28	2026-06-27 12:35:28	primary	t	\N	\N
94	117	12	8	2026-07-18 23:38:28	\N	2026-07-18 23:38:28	2026-07-18 23:38:28	primary	t	\N	\N
95	118	16	14	2026-06-24 23:30:28	\N	2026-06-24 23:30:28	2026-06-24 23:30:28	primary	t	\N	\N
96	119	16	14	2026-06-29 05:15:28	\N	2026-06-29 05:15:28	2026-06-29 05:15:28	primary	t	\N	\N
97	120	18	14	2026-06-30 09:09:28	\N	2026-06-30 09:09:28	2026-06-30 09:09:28	primary	t	\N	\N
98	121	17	14	2026-07-06 11:36:28	\N	2026-07-06 11:36:28	2026-07-06 11:36:28	primary	t	\N	\N
99	122	16	14	2026-06-26 17:34:29	\N	2026-06-26 17:34:29	2026-06-26 17:34:29	primary	t	\N	\N
100	124	12	8	2026-06-25 09:20:29	\N	2026-06-25 09:20:29	2026-06-25 09:20:29	primary	t	\N	\N
101	125	12	8	2026-07-20 09:27:29	\N	2026-07-20 09:27:29	2026-07-20 09:27:29	primary	t	\N	\N
102	127	30	26	2026-07-17 20:33:29	\N	2026-07-17 20:33:29	2026-07-17 20:33:29	primary	t	\N	\N
103	130	11	8	2026-07-11 11:45:29	\N	2026-07-11 11:45:29	2026-07-11 11:45:29	primary	t	\N	\N
104	131	10	8	2026-07-02 20:34:29	\N	2026-07-02 20:34:29	2026-07-02 20:34:29	primary	t	\N	\N
105	132	13	8	2026-07-07 08:31:29	\N	2026-07-07 08:31:29	2026-07-07 08:31:29	primary	t	\N	\N
106	135	9	8	2026-07-20 05:52:29	\N	2026-07-20 05:52:29	2026-07-20 05:52:29	primary	t	\N	\N
107	136	30	26	2026-07-01 15:20:29	\N	2026-07-01 15:20:29	2026-07-01 15:20:29	primary	t	\N	\N
108	137	15	14	2026-06-24 04:50:29	\N	2026-06-24 04:50:29	2026-06-24 04:50:29	primary	t	\N	\N
109	138	12	8	2026-07-12 04:45:29	\N	2026-07-12 04:45:29	2026-07-12 04:45:29	primary	t	\N	\N
110	140	31	26	2026-07-08 13:02:29	\N	2026-07-08 13:02:29	2026-07-08 13:02:29	primary	t	\N	\N
111	142	13	8	2026-07-10 11:29:29	\N	2026-07-10 11:29:29	2026-07-10 11:29:29	primary	t	\N	\N
112	143	15	14	2026-06-25 10:41:29	\N	2026-06-25 10:41:29	2026-06-25 10:41:29	primary	t	\N	\N
113	144	27	26	2026-06-26 13:39:29	\N	2026-06-26 13:39:29	2026-06-26 13:39:29	primary	t	\N	\N
114	147	27	26	2026-06-23 16:12:29	\N	2026-06-23 16:12:29	2026-06-23 16:12:29	primary	t	\N	\N
115	148	28	26	2026-07-08 07:47:29	\N	2026-07-08 07:47:29	2026-07-08 07:47:29	primary	t	\N	\N
116	149	9	8	2026-06-30 09:43:29	\N	2026-06-30 09:43:29	2026-06-30 09:43:29	primary	t	\N	\N
117	150	10	8	2026-06-24 22:52:29	\N	2026-06-24 22:52:29	2026-06-24 22:52:29	primary	t	\N	\N
118	151	31	26	2026-06-23 21:07:29	\N	2026-06-23 21:07:29	2026-06-23 21:07:29	primary	t	\N	\N
119	152	9	8	2026-06-25 00:21:29	\N	2026-06-25 00:21:29	2026-06-25 00:21:29	primary	t	\N	\N
120	153	15	14	2026-07-20 15:32:29	\N	2026-07-20 15:32:29	2026-07-20 15:32:29	primary	t	\N	\N
121	154	10	8	2026-07-19 02:17:29	\N	2026-07-19 02:17:29	2026-07-19 02:17:29	primary	t	\N	\N
122	156	17	14	2026-07-07 12:45:29	\N	2026-07-07 12:45:29	2026-07-07 12:45:29	primary	t	\N	\N
123	157	18	14	2026-06-25 07:08:29	\N	2026-06-25 07:08:29	2026-06-25 07:08:29	primary	t	\N	\N
124	159	18	14	2026-07-19 00:23:29	\N	2026-07-19 00:23:29	2026-07-19 00:23:29	primary	t	\N	\N
125	160	27	26	2026-07-07 17:45:29	\N	2026-07-07 17:45:29	2026-07-07 17:45:29	primary	t	\N	\N
126	161	28	26	2026-06-28 12:40:29	\N	2026-06-28 12:40:29	2026-06-28 12:40:29	primary	t	\N	\N
127	162	18	14	2026-06-27 07:25:29	\N	2026-06-27 07:25:29	2026-06-27 07:25:29	primary	t	\N	\N
128	163	12	8	2026-07-05 01:29:29	\N	2026-07-05 01:29:29	2026-07-05 01:29:29	primary	t	\N	\N
129	164	15	14	2026-07-20 23:08:29	\N	2026-07-20 23:08:29	2026-07-20 23:08:29	primary	t	\N	\N
130	165	28	26	2026-06-29 14:28:29	\N	2026-06-29 14:28:29	2026-06-29 14:28:29	primary	t	\N	\N
131	166	30	26	2026-06-30 05:23:29	\N	2026-06-30 05:23:29	2026-06-30 05:23:29	primary	t	\N	\N
132	168	11	8	2026-07-12 00:25:29	\N	2026-07-12 00:25:29	2026-07-12 00:25:29	primary	t	\N	\N
133	169	12	8	2026-07-07 01:18:29	\N	2026-07-07 01:18:29	2026-07-07 01:18:29	primary	t	\N	\N
134	170	13	8	2026-07-05 13:45:29	\N	2026-07-05 13:45:29	2026-07-05 13:45:29	primary	t	\N	\N
135	173	29	26	2026-06-26 17:51:29	\N	2026-06-26 17:51:29	2026-06-26 17:51:29	primary	t	\N	\N
136	174	13	8	2026-07-14 10:32:29	\N	2026-07-14 10:32:29	2026-07-14 10:32:29	primary	t	\N	\N
137	175	10	8	2026-06-25 10:05:29	\N	2026-06-25 10:05:29	2026-06-25 10:05:29	primary	t	\N	\N
138	176	15	14	2026-07-20 04:22:29	\N	2026-07-20 04:22:29	2026-07-20 04:22:29	primary	t	\N	\N
139	177	10	8	2026-07-14 19:19:29	\N	2026-07-14 19:19:29	2026-07-14 19:19:29	primary	t	\N	\N
140	178	15	14	2026-07-12 09:06:29	\N	2026-07-12 09:06:29	2026-07-12 09:06:29	primary	t	\N	\N
141	179	10	8	2026-06-28 16:32:29	\N	2026-06-28 16:32:29	2026-06-28 16:32:29	primary	t	\N	\N
142	182	16	14	2026-07-07 08:24:29	\N	2026-07-07 08:24:29	2026-07-07 08:24:29	primary	t	\N	\N
143	183	15	14	2026-07-07 17:44:29	\N	2026-07-07 17:44:29	2026-07-07 17:44:29	primary	t	\N	\N
144	184	12	8	2026-07-05 03:51:29	\N	2026-07-05 03:51:29	2026-07-05 03:51:29	primary	t	\N	\N
145	185	9	8	2026-07-12 06:50:29	\N	2026-07-12 06:50:29	2026-07-12 06:50:29	primary	t	\N	\N
146	188	19	14	2026-06-24 08:29:29	\N	2026-06-24 08:29:29	2026-06-24 08:29:29	primary	t	\N	\N
147	189	10	8	2026-06-29 06:49:29	\N	2026-06-29 06:49:29	2026-06-29 06:49:29	primary	t	\N	\N
148	191	9	8	2026-07-16 02:13:29	\N	2026-07-16 02:13:29	2026-07-16 02:13:29	primary	t	\N	\N
149	192	19	14	2026-06-25 13:05:29	\N	2026-06-25 13:05:29	2026-06-25 13:05:29	primary	t	\N	\N
150	196	30	26	2026-07-21 14:31:29	\N	2026-07-21 14:31:29	2026-07-21 14:31:29	primary	t	\N	\N
151	199	11	8	2026-07-10 23:50:29	\N	2026-07-10 23:50:29	2026-07-10 23:50:29	primary	t	\N	\N
152	202	27	26	2026-06-29 20:48:29	\N	2026-06-29 20:48:29	2026-06-29 20:48:29	primary	t	\N	\N
153	203	28	26	2026-06-30 14:39:29	\N	2026-06-30 14:39:29	2026-06-30 14:39:29	primary	t	\N	\N
154	206	28	26	2026-07-08 11:49:29	\N	2026-07-08 11:49:29	2026-07-08 11:49:29	primary	t	\N	\N
155	208	27	26	2026-07-20 06:40:29	\N	2026-07-20 06:40:29	2026-07-20 06:40:29	primary	t	\N	\N
156	209	17	14	2026-07-03 08:42:29	\N	2026-07-03 08:42:29	2026-07-03 08:42:29	primary	t	\N	\N
157	210	31	26	2026-06-29 14:43:29	\N	2026-06-29 14:43:29	2026-06-29 14:43:29	primary	t	\N	\N
158	211	28	26	2026-07-18 22:37:29	\N	2026-07-18 22:37:29	2026-07-18 22:37:29	primary	t	\N	\N
159	213	9	8	2026-07-14 22:03:29	\N	2026-07-14 22:03:29	2026-07-14 22:03:29	primary	t	\N	\N
160	214	18	14	2026-07-04 13:24:29	\N	2026-07-04 13:24:29	2026-07-04 13:24:29	primary	t	\N	\N
161	215	27	26	2026-07-19 08:43:29	\N	2026-07-19 08:43:29	2026-07-19 08:43:29	primary	t	\N	\N
162	216	9	8	2026-07-16 19:28:29	\N	2026-07-16 19:28:29	2026-07-16 19:28:29	primary	t	\N	\N
163	217	19	14	2026-06-28 13:40:29	\N	2026-06-28 13:40:29	2026-06-28 13:40:29	primary	t	\N	\N
164	219	13	8	2026-07-08 00:51:29	\N	2026-07-08 00:51:29	2026-07-08 00:51:29	primary	t	\N	\N
165	220	16	14	2026-07-04 06:25:29	\N	2026-07-04 06:25:29	2026-07-04 06:25:29	primary	t	\N	\N
166	221	31	26	2026-07-19 08:38:29	\N	2026-07-19 08:38:29	2026-07-19 08:38:29	primary	t	\N	\N
167	222	29	26	2026-06-26 05:39:29	\N	2026-06-26 05:39:29	2026-06-26 05:39:29	primary	t	\N	\N
168	223	11	8	2026-07-06 14:11:29	\N	2026-07-06 14:11:29	2026-07-06 14:11:29	primary	t	\N	\N
169	228	15	14	2026-07-11 07:22:29	\N	2026-07-11 07:22:29	2026-07-11 07:22:29	primary	t	\N	\N
170	232	19	14	2026-07-07 10:49:29	\N	2026-07-07 10:49:29	2026-07-07 10:49:29	primary	t	\N	\N
171	233	11	8	2026-07-04 22:16:29	\N	2026-07-04 22:16:29	2026-07-04 22:16:29	primary	t	\N	\N
172	235	15	14	2026-07-20 08:37:29	\N	2026-07-20 08:37:29	2026-07-20 08:37:29	primary	t	\N	\N
173	236	31	26	2026-07-13 11:29:29	\N	2026-07-13 11:29:29	2026-07-13 11:29:29	primary	t	\N	\N
174	239	29	26	2026-07-02 22:51:29	\N	2026-07-02 22:51:29	2026-07-02 22:51:29	primary	t	\N	\N
175	240	18	14	2026-07-23 15:35:30	\N	2026-07-23 15:35:30	2026-07-23 15:35:30	primary	t	\N	\N
176	242	11	8	2026-07-16 06:39:30	\N	2026-07-16 06:39:30	2026-07-16 06:39:30	primary	t	\N	\N
177	243	30	26	2026-07-18 19:31:30	\N	2026-07-18 19:31:30	2026-07-18 19:31:30	primary	t	\N	\N
178	247	11	8	2026-07-20 11:48:30	\N	2026-07-20 11:48:30	2026-07-20 11:48:30	primary	t	\N	\N
179	252	13	8	2026-07-03 13:29:30	\N	2026-07-03 13:29:30	2026-07-03 13:29:30	primary	t	\N	\N
180	253	31	26	2026-07-23 23:31:30	\N	2026-07-23 23:31:30	2026-07-23 23:31:30	primary	t	\N	\N
181	254	16	14	2026-07-14 13:10:30	\N	2026-07-14 13:10:30	2026-07-14 13:10:30	primary	t	\N	\N
182	257	11	8	2026-07-20 20:40:30	\N	2026-07-20 20:40:30	2026-07-20 20:40:30	primary	t	\N	\N
183	258	18	14	2026-06-27 12:04:30	\N	2026-06-27 12:04:30	2026-06-27 12:04:30	primary	t	\N	\N
184	259	29	26	2026-07-16 00:39:30	\N	2026-07-16 00:39:30	2026-07-16 00:39:30	primary	t	\N	\N
185	261	11	8	2026-07-18 12:39:30	\N	2026-07-18 12:39:30	2026-07-18 12:39:30	primary	t	\N	\N
186	266	13	8	2026-07-09 09:47:30	\N	2026-07-09 09:47:30	2026-07-09 09:47:30	primary	t	\N	\N
187	267	30	26	2026-07-23 10:41:30	\N	2026-07-23 10:41:30	2026-07-23 10:41:30	primary	t	\N	\N
188	272	10	8	2026-06-24 12:07:30	\N	2026-06-24 12:07:30	2026-06-24 12:07:30	primary	t	\N	\N
189	274	17	14	2026-06-28 10:33:30	\N	2026-06-28 10:33:30	2026-06-28 10:33:30	primary	t	\N	\N
190	280	17	14	2026-07-23 09:18:30	\N	2026-07-23 09:18:30	2026-07-23 09:18:30	primary	t	\N	\N
191	282	16	14	2026-07-01 16:03:30	\N	2026-07-01 16:03:30	2026-07-01 16:03:30	primary	t	\N	\N
192	283	10	8	2026-07-05 12:30:30	\N	2026-07-05 12:30:30	2026-07-05 12:30:30	primary	t	\N	\N
193	292	11	8	2026-07-08 02:06:30	\N	2026-07-08 02:06:30	2026-07-08 02:06:30	primary	t	\N	\N
194	293	30	26	2026-07-21 05:44:30	\N	2026-07-21 05:44:30	2026-07-21 05:44:30	primary	t	\N	\N
195	294	30	26	2026-06-26 18:51:30	\N	2026-06-26 18:51:30	2026-06-26 18:51:30	primary	t	\N	\N
196	298	30	26	2026-07-16 02:44:30	\N	2026-07-16 02:44:30	2026-07-16 02:44:30	primary	t	\N	\N
197	302	11	8	2026-06-25 05:21:30	\N	2026-06-25 05:21:30	2026-06-25 05:21:30	primary	t	\N	\N
198	304	17	14	2026-07-18 07:49:30	\N	2026-07-18 07:49:30	2026-07-18 07:49:30	primary	t	\N	\N
199	305	10	8	2026-07-23 15:21:30	\N	2026-07-23 15:21:30	2026-07-23 15:21:30	primary	t	\N	\N
200	307	15	14	2026-07-23 19:39:30	\N	2026-07-23 19:39:30	2026-07-23 19:39:30	primary	t	\N	\N
201	309	31	26	2026-06-27 20:02:30	\N	2026-06-27 20:02:30	2026-06-27 20:02:30	primary	t	\N	\N
202	311	9	8	2026-06-30 09:09:30	\N	2026-06-30 09:09:30	2026-06-30 09:09:30	primary	t	\N	\N
203	313	28	26	2026-06-29 15:19:30	\N	2026-06-29 15:19:30	2026-06-29 15:19:30	primary	t	\N	\N
204	314	12	8	2026-06-28 18:36:30	\N	2026-06-28 18:36:30	2026-06-28 18:36:30	primary	t	\N	\N
205	319	11	8	2026-07-20 22:16:30	\N	2026-07-20 22:16:30	2026-07-20 22:16:30	primary	t	\N	\N
206	320	30	26	2026-06-26 13:29:30	\N	2026-06-26 13:29:30	2026-06-26 13:29:30	primary	t	\N	\N
207	326	19	14	2026-07-03 04:50:30	\N	2026-07-03 04:50:30	2026-07-03 04:50:30	primary	t	\N	\N
208	328	12	8	2026-07-05 03:29:30	\N	2026-07-05 03:29:30	2026-07-05 03:29:30	primary	t	\N	\N
209	330	11	8	2026-07-20 20:03:30	\N	2026-07-20 20:03:30	2026-07-20 20:03:30	primary	t	\N	\N
210	333	29	26	2026-07-18 00:38:30	\N	2026-07-18 00:38:30	2026-07-18 00:38:30	primary	t	\N	\N
211	336	18	14	2026-07-11 03:08:30	\N	2026-07-11 03:08:30	2026-07-11 03:08:30	primary	t	\N	\N
212	337	27	26	2026-06-29 03:51:30	\N	2026-06-29 03:51:30	2026-06-29 03:51:30	primary	t	\N	\N
213	346	13	8	2026-07-19 13:31:31	\N	2026-07-19 13:31:31	2026-07-19 13:31:31	primary	t	\N	\N
214	348	29	26	2026-07-20 08:25:31	\N	2026-07-20 08:25:31	2026-07-20 08:25:31	primary	t	\N	\N
215	350	16	14	2026-07-22 20:32:31	\N	2026-07-22 20:32:31	2026-07-22 20:32:31	primary	t	\N	\N
216	351	30	26	2026-07-21 11:32:31	\N	2026-07-21 11:32:31	2026-07-21 11:32:31	primary	t	\N	\N
217	352	13	8	2026-06-29 19:26:31	\N	2026-06-29 19:26:31	2026-06-29 19:26:31	primary	t	\N	\N
218	353	31	26	2026-07-22 04:45:31	\N	2026-07-22 04:45:31	2026-07-22 04:45:31	primary	t	\N	\N
219	354	11	8	2026-07-10 16:04:31	\N	2026-07-10 16:04:31	2026-07-10 16:04:31	primary	t	\N	\N
220	357	10	8	2026-07-17 16:42:31	\N	2026-07-17 16:42:31	2026-07-17 16:42:31	primary	t	\N	\N
221	362	13	8	2026-06-27 16:40:31	\N	2026-06-27 16:40:31	2026-06-27 16:40:31	primary	t	\N	\N
222	365	29	26	2026-06-30 17:47:31	\N	2026-06-30 17:47:31	2026-06-30 17:47:31	primary	t	\N	\N
223	366	17	14	2026-07-07 15:14:31	\N	2026-07-07 15:14:31	2026-07-07 15:14:31	primary	t	\N	\N
224	367	12	8	2026-07-20 06:39:31	\N	2026-07-20 06:39:31	2026-07-20 06:39:31	primary	t	\N	\N
225	371	28	26	2026-06-26 14:38:31	\N	2026-06-26 14:38:31	2026-06-26 14:38:31	primary	t	\N	\N
226	374	12	8	2026-07-06 20:16:31	\N	2026-07-06 20:16:31	2026-07-06 20:16:31	primary	t	\N	\N
227	376	13	8	2026-07-18 08:44:31	\N	2026-07-18 08:44:31	2026-07-18 08:44:31	primary	t	\N	\N
228	378	10	8	2026-07-21 01:08:31	\N	2026-07-21 01:08:31	2026-07-21 01:08:31	primary	t	\N	\N
229	382	12	8	2026-07-14 18:02:31	\N	2026-07-14 18:02:31	2026-07-14 18:02:31	primary	t	\N	\N
230	383	10	8	2026-07-07 23:41:31	\N	2026-07-07 23:41:31	2026-07-07 23:41:31	primary	t	\N	\N
231	400	13	8	2026-07-08 04:41:31	\N	2026-07-08 04:41:31	2026-07-08 04:41:31	primary	t	\N	\N
232	405	9	8	2026-07-19 19:17:31	\N	2026-07-19 19:17:31	2026-07-19 19:17:31	primary	t	\N	\N
233	406	9	8	2026-07-02 08:41:31	\N	2026-07-02 08:41:31	2026-07-02 08:41:31	primary	t	\N	\N
234	407	13	8	2026-07-10 00:06:31	\N	2026-07-10 00:06:31	2026-07-10 00:06:31	primary	t	\N	\N
235	411	16	14	2026-07-10 16:27:31	\N	2026-07-10 16:27:31	2026-07-10 16:27:31	primary	t	\N	\N
236	412	9	8	2026-07-10 02:18:31	\N	2026-07-10 02:18:31	2026-07-10 02:18:31	primary	t	\N	\N
237	415	31	26	2026-07-18 04:04:31	\N	2026-07-18 04:04:31	2026-07-18 04:04:31	primary	t	\N	\N
238	417	15	14	2026-07-19 11:34:31	\N	2026-07-19 11:34:31	2026-07-19 11:34:31	primary	t	\N	\N
239	421	27	26	2026-06-30 11:28:31	\N	2026-06-30 11:28:31	2026-06-30 11:28:31	primary	t	\N	\N
240	424	9	8	2026-06-24 02:02:31	\N	2026-06-24 02:02:31	2026-06-24 02:02:31	primary	t	\N	\N
241	425	15	14	2026-07-24 09:26:31	\N	2026-07-24 09:26:31	2026-07-24 09:26:31	primary	t	\N	\N
242	428	16	14	2026-07-01 02:42:31	\N	2026-07-01 02:42:31	2026-07-01 02:42:31	primary	t	\N	\N
243	430	13	8	2026-07-17 09:14:31	\N	2026-07-17 09:14:31	2026-07-17 09:14:31	primary	t	\N	\N
244	432	12	8	2026-07-02 02:29:31	\N	2026-07-02 02:29:31	2026-07-02 02:29:31	primary	t	\N	\N
245	433	18	14	2026-07-03 01:52:31	\N	2026-07-03 01:52:31	2026-07-03 01:52:31	primary	t	\N	\N
246	438	17	14	2026-07-24 04:36:32	\N	2026-07-24 04:36:32	2026-07-24 04:36:32	primary	t	\N	\N
247	441	17	14	2026-07-01 02:27:32	\N	2026-07-01 02:27:32	2026-07-01 02:27:32	primary	t	\N	\N
248	442	19	14	2026-07-14 16:27:32	\N	2026-07-14 16:27:32	2026-07-14 16:27:32	primary	t	\N	\N
249	443	9	8	2026-07-08 22:22:32	\N	2026-07-08 22:22:32	2026-07-08 22:22:32	primary	t	\N	\N
250	444	15	14	2026-07-04 11:02:32	\N	2026-07-04 11:02:32	2026-07-04 11:02:32	primary	t	\N	\N
251	446	13	8	2026-07-21 19:20:32	\N	2026-07-21 19:20:32	2026-07-21 19:20:32	primary	t	\N	\N
252	451	12	8	2026-07-11 17:49:32	\N	2026-07-11 17:49:32	2026-07-11 17:49:32	primary	t	\N	\N
253	456	10	8	2026-07-13 03:26:32	\N	2026-07-13 03:26:32	2026-07-13 03:26:32	primary	t	\N	\N
254	460	13	8	2026-06-27 12:08:32	\N	2026-06-27 12:08:32	2026-06-27 12:08:32	primary	t	\N	\N
255	461	29	26	2026-07-17 13:36:32	\N	2026-07-17 13:36:32	2026-07-17 13:36:32	primary	t	\N	\N
256	463	13	8	2026-06-23 20:41:32	\N	2026-06-23 20:41:32	2026-06-23 20:41:32	primary	t	\N	\N
257	465	11	8	2026-06-27 10:35:32	\N	2026-06-27 10:35:32	2026-06-27 10:35:32	primary	t	\N	\N
258	466	13	8	2026-06-28 16:29:32	\N	2026-06-28 16:29:32	2026-06-28 16:29:32	primary	t	\N	\N
259	467	12	8	2026-07-15 21:17:32	\N	2026-07-15 21:17:32	2026-07-15 21:17:32	primary	t	\N	\N
260	468	10	8	2026-06-23 17:13:32	\N	2026-06-23 17:13:32	2026-06-23 17:13:32	primary	t	\N	\N
261	469	18	14	2026-06-23 11:42:32	\N	2026-06-23 11:42:32	2026-06-23 11:42:32	primary	t	\N	\N
262	472	9	8	2026-07-17 02:26:32	\N	2026-07-17 02:26:32	2026-07-17 02:26:32	primary	t	\N	\N
263	477	29	26	2026-07-06 09:04:32	\N	2026-07-06 09:04:32	2026-07-06 09:04:32	primary	t	\N	\N
264	482	28	26	2026-07-13 06:25:32	\N	2026-07-13 06:25:32	2026-07-13 06:25:32	primary	t	\N	\N
265	487	11	8	2026-06-25 06:45:32	\N	2026-06-25 06:45:32	2026-06-25 06:45:32	primary	t	\N	\N
266	493	18	14	2026-07-16 07:25:32	\N	2026-07-16 07:25:32	2026-07-16 07:25:32	primary	t	\N	\N
267	507	30	26	2026-06-30 03:37:32	\N	2026-06-30 03:37:32	2026-06-30 03:37:32	primary	t	\N	\N
268	509	28	26	2026-06-26 02:22:32	\N	2026-06-26 02:22:32	2026-06-26 02:22:32	primary	t	\N	\N
269	517	16	14	2026-06-30 06:36:32	\N	2026-06-30 06:36:32	2026-06-30 06:36:32	primary	t	\N	\N
270	518	28	26	2026-07-06 01:05:32	\N	2026-07-06 01:05:32	2026-07-06 01:05:32	primary	t	\N	\N
271	525	17	14	2026-07-01 07:12:32	\N	2026-07-01 07:12:32	2026-07-01 07:12:32	primary	t	\N	\N
272	526	11	8	2026-07-23 15:14:32	\N	2026-07-23 15:14:32	2026-07-23 15:14:32	primary	t	\N	\N
273	528	11	8	2026-07-18 01:41:32	\N	2026-07-18 01:41:32	2026-07-18 01:41:32	primary	t	\N	\N
274	529	9	8	2026-07-07 10:36:32	\N	2026-07-07 10:36:32	2026-07-07 10:36:32	primary	t	\N	\N
275	534	11	8	2026-06-24 10:40:33	\N	2026-06-24 10:40:33	2026-06-24 10:40:33	primary	t	\N	\N
276	540	27	26	2026-07-19 23:31:33	\N	2026-07-19 23:31:33	2026-07-19 23:31:33	primary	t	\N	\N
277	548	17	14	2026-07-05 11:39:33	\N	2026-07-05 11:39:33	2026-07-05 11:39:33	primary	t	\N	\N
278	551	19	14	2026-06-25 03:14:33	\N	2026-06-25 03:14:33	2026-06-25 03:14:33	primary	t	\N	\N
279	552	17	14	2026-07-06 07:10:33	\N	2026-07-06 07:10:33	2026-07-06 07:10:33	primary	t	\N	\N
280	554	13	8	2026-07-08 15:30:33	\N	2026-07-08 15:30:33	2026-07-08 15:30:33	primary	t	\N	\N
281	556	10	8	2026-07-21 14:33:33	\N	2026-07-21 14:33:33	2026-07-21 14:33:33	primary	t	\N	\N
282	560	12	8	2026-07-15 12:26:33	\N	2026-07-15 12:26:33	2026-07-15 12:26:33	primary	t	\N	\N
283	561	11	8	2026-07-22 11:27:33	\N	2026-07-22 11:27:33	2026-07-22 11:27:33	primary	t	\N	\N
284	562	10	8	2026-06-28 15:49:33	\N	2026-06-28 15:49:33	2026-06-28 15:49:33	primary	t	\N	\N
285	563	10	8	2026-07-19 05:40:33	\N	2026-07-19 05:40:33	2026-07-19 05:40:33	primary	t	\N	\N
286	566	12	8	2026-07-14 00:03:33	\N	2026-07-14 00:03:33	2026-07-14 00:03:33	primary	t	\N	\N
287	568	11	8	2026-07-01 18:09:33	\N	2026-07-01 18:09:33	2026-07-01 18:09:33	primary	t	\N	\N
288	572	17	14	2026-07-13 05:38:33	\N	2026-07-13 05:38:33	2026-07-13 05:38:33	primary	t	\N	\N
289	576	12	8	2026-07-05 23:25:33	\N	2026-07-05 23:25:33	2026-07-05 23:25:33	primary	t	\N	\N
290	577	9	8	2026-07-22 14:35:33	\N	2026-07-22 14:35:33	2026-07-22 14:35:33	primary	t	\N	\N
291	584	30	26	2026-07-14 08:42:33	\N	2026-07-14 08:42:33	2026-07-14 08:42:33	primary	t	\N	\N
292	585	13	8	2026-06-30 15:49:33	\N	2026-06-30 15:49:33	2026-06-30 15:49:33	primary	t	\N	\N
293	589	10	8	2026-07-03 14:45:33	\N	2026-07-03 14:45:33	2026-07-03 14:45:33	primary	t	\N	\N
294	591	10	8	2026-07-19 02:13:33	\N	2026-07-19 02:13:33	2026-07-19 02:13:33	primary	t	\N	\N
295	595	16	14	2026-07-07 12:12:33	\N	2026-07-07 12:12:33	2026-07-07 12:12:33	primary	t	\N	\N
296	598	9	8	2026-07-15 22:11:33	\N	2026-07-15 22:11:33	2026-07-15 22:11:33	primary	t	\N	\N
297	605	13	8	2026-07-02 09:48:33	\N	2026-07-02 09:48:33	2026-07-02 09:48:33	primary	t	\N	\N
298	606	28	26	2026-07-16 10:17:33	\N	2026-07-16 10:17:33	2026-07-16 10:17:33	primary	t	\N	\N
299	610	12	8	2026-07-21 05:09:33	\N	2026-07-21 05:09:33	2026-07-21 05:09:33	primary	t	\N	\N
300	611	18	14	2026-07-07 09:45:33	\N	2026-07-07 09:45:33	2026-07-07 09:45:33	primary	t	\N	\N
301	612	12	8	2026-06-29 20:44:33	\N	2026-06-29 20:44:33	2026-06-29 20:44:33	primary	t	\N	\N
302	617	18	14	2026-07-09 05:33:33	\N	2026-07-09 05:33:33	2026-07-09 05:33:33	primary	t	\N	\N
303	623	11	8	2026-07-09 04:44:33	\N	2026-07-09 04:44:33	2026-07-09 04:44:33	primary	t	\N	\N
304	626	9	8	2026-07-20 11:20:34	\N	2026-07-20 11:20:34	2026-07-20 11:20:34	primary	t	\N	\N
305	633	16	14	2026-07-05 05:51:34	\N	2026-07-05 05:51:34	2026-07-05 05:51:34	primary	t	\N	\N
306	635	19	14	2026-06-29 22:29:34	\N	2026-06-29 22:29:34	2026-06-29 22:29:34	primary	t	\N	\N
307	637	13	8	2026-06-25 13:38:34	\N	2026-06-25 13:38:34	2026-06-25 13:38:34	primary	t	\N	\N
308	645	16	14	2026-07-10 10:02:34	\N	2026-07-10 10:02:34	2026-07-10 10:02:34	primary	t	\N	\N
309	647	28	26	2026-07-01 11:49:34	\N	2026-07-01 11:49:34	2026-07-01 11:49:34	primary	t	\N	\N
310	648	17	14	2026-07-10 10:40:34	\N	2026-07-10 10:40:34	2026-07-10 10:40:34	primary	t	\N	\N
311	651	9	8	2026-07-16 23:48:34	\N	2026-07-16 23:48:34	2026-07-16 23:48:34	primary	t	\N	\N
312	655	17	14	2026-06-25 05:18:34	\N	2026-06-25 05:18:34	2026-06-25 05:18:34	primary	t	\N	\N
313	658	13	8	2026-07-11 00:30:34	\N	2026-07-11 00:30:34	2026-07-11 00:30:34	primary	t	\N	\N
314	666	12	8	2026-07-01 12:31:34	\N	2026-07-01 12:31:34	2026-07-01 12:31:34	primary	t	\N	\N
315	669	10	8	2026-07-07 03:19:34	\N	2026-07-07 03:19:34	2026-07-07 03:19:34	primary	t	\N	\N
316	677	9	8	2026-07-10 19:37:34	\N	2026-07-10 19:37:34	2026-07-10 19:37:34	primary	t	\N	\N
317	685	19	14	2026-06-28 00:40:34	\N	2026-06-28 00:40:34	2026-06-28 00:40:34	primary	t	\N	\N
318	686	19	14	2026-06-29 16:51:34	\N	2026-06-29 16:51:34	2026-06-29 16:51:34	primary	t	\N	\N
319	687	15	14	2026-07-06 01:19:34	\N	2026-07-06 01:19:34	2026-07-06 01:19:34	primary	t	\N	\N
320	692	17	14	2026-07-16 08:03:34	\N	2026-07-16 08:03:34	2026-07-16 08:03:34	primary	t	\N	\N
321	694	29	26	2026-07-15 09:43:34	\N	2026-07-15 09:43:34	2026-07-15 09:43:34	primary	t	\N	\N
322	695	29	26	2026-07-08 02:37:34	\N	2026-07-08 02:37:34	2026-07-08 02:37:34	primary	t	\N	\N
323	699	13	8	2026-07-01 20:46:34	\N	2026-07-01 20:46:34	2026-07-01 20:46:34	primary	t	\N	\N
324	700	16	14	2026-07-13 11:45:34	\N	2026-07-13 11:45:34	2026-07-13 11:45:34	primary	t	\N	\N
325	702	9	8	2026-07-19 11:17:34	\N	2026-07-19 11:17:34	2026-07-19 11:17:34	primary	t	\N	\N
326	703	13	8	2026-07-11 13:47:34	\N	2026-07-11 13:47:34	2026-07-11 13:47:34	primary	t	\N	\N
327	711	11	8	2026-07-22 20:14:34	\N	2026-07-22 20:14:34	2026-07-22 20:14:34	primary	t	\N	\N
328	712	15	14	2026-07-22 08:38:34	\N	2026-07-22 08:38:34	2026-07-22 08:38:34	primary	t	\N	\N
329	719	11	8	2026-07-06 09:26:35	\N	2026-07-06 09:26:35	2026-07-06 09:26:35	primary	t	\N	\N
330	720	10	8	2026-07-11 16:27:35	\N	2026-07-11 16:27:35	2026-07-11 16:27:35	primary	t	\N	\N
331	723	27	26	2026-06-23 20:46:35	\N	2026-06-23 20:46:35	2026-06-23 20:46:35	primary	t	\N	\N
332	724	31	26	2026-07-01 07:23:35	\N	2026-07-01 07:23:35	2026-07-01 07:23:35	primary	t	\N	\N
333	727	15	14	2026-07-08 08:23:35	\N	2026-07-08 08:23:35	2026-07-08 08:23:35	primary	t	\N	\N
334	730	16	14	2026-07-16 13:29:35	\N	2026-07-16 13:29:35	2026-07-16 13:29:35	primary	t	\N	\N
335	733	29	26	2026-07-01 22:09:35	\N	2026-07-01 22:09:35	2026-07-01 22:09:35	primary	t	\N	\N
336	734	10	8	2026-06-25 07:24:35	\N	2026-06-25 07:24:35	2026-06-25 07:24:35	primary	t	\N	\N
337	736	15	14	2026-07-14 04:48:35	\N	2026-07-14 04:48:35	2026-07-14 04:48:35	primary	t	\N	\N
338	738	29	26	2026-07-07 23:15:35	\N	2026-07-07 23:15:35	2026-07-07 23:15:35	primary	t	\N	\N
339	739	10	8	2026-07-11 09:09:35	\N	2026-07-11 09:09:35	2026-07-11 09:09:35	primary	t	\N	\N
340	740	9	8	2026-07-02 03:16:35	\N	2026-07-02 03:16:35	2026-07-02 03:16:35	primary	t	\N	\N
341	745	9	8	2026-06-26 20:50:35	\N	2026-06-26 20:50:35	2026-06-26 20:50:35	primary	t	\N	\N
342	750	12	8	2026-06-27 12:30:35	\N	2026-06-27 12:30:35	2026-06-27 12:30:35	primary	t	\N	\N
343	756	19	14	2026-06-28 11:11:35	\N	2026-06-28 11:11:35	2026-06-28 11:11:35	primary	t	\N	\N
344	757	10	8	2026-07-19 04:32:35	\N	2026-07-19 04:32:35	2026-07-19 04:32:35	primary	t	\N	\N
345	762	12	8	2026-07-07 19:26:35	\N	2026-07-07 19:26:35	2026-07-07 19:26:35	primary	t	\N	\N
346	767	9	8	2026-07-18 20:39:35	\N	2026-07-18 20:39:35	2026-07-18 20:39:35	primary	t	\N	\N
347	768	9	8	2026-07-10 11:04:35	\N	2026-07-10 11:04:35	2026-07-10 11:04:35	primary	t	\N	\N
348	769	10	8	2026-07-16 20:43:35	\N	2026-07-16 20:43:35	2026-07-16 20:43:35	primary	t	\N	\N
349	771	9	8	2026-07-12 19:44:35	\N	2026-07-12 19:44:35	2026-07-12 19:44:35	primary	t	\N	\N
350	772	13	8	2026-07-12 19:10:35	\N	2026-07-12 19:10:35	2026-07-12 19:10:35	primary	t	\N	\N
351	773	19	14	2026-07-03 14:22:35	\N	2026-07-03 14:22:35	2026-07-03 14:22:35	primary	t	\N	\N
352	786	11	8	2026-07-12 08:02:35	\N	2026-07-12 08:02:35	2026-07-12 08:02:35	primary	t	\N	\N
353	791	13	8	2026-07-09 01:44:35	\N	2026-07-09 01:44:35	2026-07-09 01:44:35	primary	t	\N	\N
354	797	13	8	2026-07-17 02:32:35	\N	2026-07-17 02:32:35	2026-07-17 02:32:35	primary	t	\N	\N
355	798	30	26	2026-07-18 13:34:35	\N	2026-07-18 13:34:35	2026-07-18 13:34:35	primary	t	\N	\N
356	803	18	14	2026-07-15 10:08:35	\N	2026-07-15 10:08:35	2026-07-15 10:08:35	primary	t	\N	\N
357	805	15	14	2026-07-10 02:17:35	\N	2026-07-10 02:17:35	2026-07-10 02:17:35	primary	t	\N	\N
358	807	12	8	2026-06-29 02:10:36	\N	2026-06-29 02:10:36	2026-06-29 02:10:36	primary	t	\N	\N
359	809	17	14	2026-07-02 14:15:36	\N	2026-07-02 14:15:36	2026-07-02 14:15:36	primary	t	\N	\N
360	811	12	8	2026-07-08 11:08:36	\N	2026-07-08 11:08:36	2026-07-08 11:08:36	primary	t	\N	\N
361	814	10	8	2026-07-23 00:42:36	\N	2026-07-23 00:42:36	2026-07-23 00:42:36	primary	t	\N	\N
362	815	13	8	2026-07-08 09:48:36	\N	2026-07-08 09:48:36	2026-07-08 09:48:36	primary	t	\N	\N
363	816	13	8	2026-07-07 17:17:36	\N	2026-07-07 17:17:36	2026-07-07 17:17:36	primary	t	\N	\N
364	817	10	8	2026-07-14 23:23:36	\N	2026-07-14 23:23:36	2026-07-14 23:23:36	primary	t	\N	\N
365	820	27	26	2026-07-08 01:08:36	\N	2026-07-08 01:08:36	2026-07-08 01:08:36	primary	t	\N	\N
366	822	13	8	2026-07-04 09:48:36	\N	2026-07-04 09:48:36	2026-07-04 09:48:36	primary	t	\N	\N
367	823	12	8	2026-07-18 22:45:36	\N	2026-07-18 22:45:36	2026-07-18 22:45:36	primary	t	\N	\N
368	825	19	14	2026-07-15 23:04:36	\N	2026-07-15 23:04:36	2026-07-15 23:04:36	primary	t	\N	\N
369	826	31	26	2026-07-18 18:39:36	\N	2026-07-18 18:39:36	2026-07-18 18:39:36	primary	t	\N	\N
370	827	12	8	2026-07-10 08:42:36	\N	2026-07-10 08:42:36	2026-07-10 08:42:36	primary	t	\N	\N
371	828	12	8	2026-07-07 19:06:36	\N	2026-07-07 19:06:36	2026-07-07 19:06:36	primary	t	\N	\N
372	834	29	26	2026-06-29 00:27:36	\N	2026-06-29 00:27:36	2026-06-29 00:27:36	primary	t	\N	\N
373	842	9	8	2026-07-23 20:20:36	\N	2026-07-23 20:20:36	2026-07-23 20:20:36	primary	t	\N	\N
374	844	17	14	2026-07-16 01:30:36	\N	2026-07-16 01:30:36	2026-07-16 01:30:36	primary	t	\N	\N
375	847	12	8	2026-06-28 10:05:36	\N	2026-06-28 10:05:36	2026-06-28 10:05:36	primary	t	\N	\N
376	849	27	26	2026-06-29 17:51:36	\N	2026-06-29 17:51:36	2026-06-29 17:51:36	primary	t	\N	\N
377	850	13	8	2026-07-12 13:41:36	\N	2026-07-12 13:41:36	2026-07-12 13:41:36	primary	t	\N	\N
378	854	19	14	2026-06-25 03:47:36	\N	2026-06-25 03:47:36	2026-06-25 03:47:36	primary	t	\N	\N
379	861	31	26	2026-07-19 06:06:36	\N	2026-07-19 06:06:36	2026-07-19 06:06:36	primary	t	\N	\N
380	864	17	14	2026-06-24 05:30:36	\N	2026-06-24 05:30:36	2026-06-24 05:30:36	primary	t	\N	\N
381	868	13	8	2026-06-27 23:39:36	\N	2026-06-27 23:39:36	2026-06-27 23:39:36	primary	t	\N	\N
382	874	19	14	2026-07-09 20:16:36	\N	2026-07-09 20:16:36	2026-07-09 20:16:36	primary	t	\N	\N
383	891	17	14	2026-06-29 01:16:36	\N	2026-06-29 01:16:36	2026-06-29 01:16:36	primary	t	\N	\N
384	896	30	26	2026-07-21 11:49:36	\N	2026-07-21 11:49:36	2026-07-21 11:49:36	primary	t	\N	\N
385	902	11	8	2026-06-28 09:43:37	\N	2026-06-28 09:43:37	2026-06-28 09:43:37	primary	t	\N	\N
386	907	19	14	2026-07-18 00:05:37	\N	2026-07-18 00:05:37	2026-07-18 00:05:37	primary	t	\N	\N
387	909	13	8	2026-07-01 04:16:37	\N	2026-07-01 04:16:37	2026-07-01 04:16:37	primary	t	\N	\N
388	913	29	26	2026-07-04 16:44:37	\N	2026-07-04 16:44:37	2026-07-04 16:44:37	primary	t	\N	\N
389	920	13	8	2026-07-14 11:06:37	\N	2026-07-14 11:06:37	2026-07-14 11:06:37	primary	t	\N	\N
390	921	19	14	2026-07-18 07:08:37	\N	2026-07-18 07:08:37	2026-07-18 07:08:37	primary	t	\N	\N
391	924	27	26	2026-07-03 16:23:37	\N	2026-07-03 16:23:37	2026-07-03 16:23:37	primary	t	\N	\N
392	925	30	26	2026-06-28 02:04:37	\N	2026-06-28 02:04:37	2026-06-28 02:04:37	primary	t	\N	\N
393	932	11	8	2026-07-19 06:51:37	\N	2026-07-19 06:51:37	2026-07-19 06:51:37	primary	t	\N	\N
394	934	18	14	2026-06-24 11:36:37	\N	2026-06-24 11:36:37	2026-06-24 11:36:37	primary	t	\N	\N
395	936	31	26	2026-07-01 18:22:37	\N	2026-07-01 18:22:37	2026-07-01 18:22:37	primary	t	\N	\N
396	937	31	26	2026-07-06 11:30:37	\N	2026-07-06 11:30:37	2026-07-06 11:30:37	primary	t	\N	\N
397	938	19	14	2026-07-05 17:50:37	\N	2026-07-05 17:50:37	2026-07-05 17:50:37	primary	t	\N	\N
398	939	18	14	2026-07-19 08:13:37	\N	2026-07-19 08:13:37	2026-07-19 08:13:37	primary	t	\N	\N
399	946	11	8	2026-06-30 11:18:37	\N	2026-06-30 11:18:37	2026-06-30 11:18:37	primary	t	\N	\N
400	947	9	8	2026-07-15 18:19:37	\N	2026-07-15 18:19:37	2026-07-15 18:19:37	primary	t	\N	\N
401	952	10	8	2026-07-11 09:36:37	\N	2026-07-11 09:36:37	2026-07-11 09:36:37	primary	t	\N	\N
402	956	29	26	2026-06-29 11:22:37	\N	2026-06-29 11:22:37	2026-06-29 11:22:37	primary	t	\N	\N
403	957	30	26	2026-06-24 11:11:37	\N	2026-06-24 11:11:37	2026-06-24 11:11:37	primary	t	\N	\N
404	961	16	14	2026-06-24 06:04:37	\N	2026-06-24 06:04:37	2026-06-24 06:04:37	primary	t	\N	\N
405	963	18	14	2026-07-12 00:03:37	\N	2026-07-12 00:03:37	2026-07-12 00:03:37	primary	t	\N	\N
406	970	15	14	2026-07-14 19:19:37	\N	2026-07-14 19:19:37	2026-07-14 19:19:37	primary	t	\N	\N
407	972	30	26	2026-07-10 04:19:37	\N	2026-07-10 04:19:37	2026-07-10 04:19:37	primary	t	\N	\N
408	984	27	26	2026-06-29 05:15:37	\N	2026-06-29 05:15:37	2026-06-29 05:15:37	primary	t	\N	\N
409	986	30	26	2026-07-08 05:38:37	\N	2026-07-08 05:38:37	2026-07-08 05:38:37	primary	t	\N	\N
410	988	9	8	2026-07-06 09:47:37	\N	2026-07-06 09:47:37	2026-07-06 09:47:37	primary	t	\N	\N
411	997	12	8	2026-07-12 03:13:38	\N	2026-07-12 03:13:38	2026-07-12 03:13:38	primary	t	\N	\N
412	1000	16	14	2026-07-09 02:38:38	\N	2026-07-09 02:38:38	2026-07-09 02:38:38	primary	t	\N	\N
\.


--
-- Data for Name: incident_attachments; Type: TABLE DATA; Schema: core; Owner: user_im
--

COPY core.incident_attachments (id, incident_id, user_id, original_name, file_path, mime_type, file_size_bytes, file_hash, created_at, incident_cycle_id) FROM stdin;
\.


--
-- Data for Name: incident_classification_history; Type: TABLE DATA; Schema: core; Owner: user_im
--

COPY core.incident_classification_history (id, incident_id, previous_category_id, previous_subcategory_id, new_category_id, new_subcategory_id, changed_by, reason, created_at) FROM stdin;
\.


--
-- Data for Name: incident_comments; Type: TABLE DATA; Schema: core; Owner: user_im
--

COPY core.incident_comments (id, incident_id, user_id, comment, is_internal, created_at, updated_at, incident_cycle_id) FROM stdin;
\.


--
-- Data for Name: incident_cycles; Type: TABLE DATA; Schema: core; Owner: user_im
--

COPY core.incident_cycles (id, incident_id, cycle_number, opened_at, opened_by, reopening_reason, resolved_at, resolved_by, resolution_description, closed_at, closed_by, closure_reason, snapshot, snapshot_generated_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: incident_states; Type: TABLE DATA; Schema: core; Owner: user_im
--

COPY core.incident_states (id, incident_id, previous_state_id, new_state_id, user_id, comment, created_at, incident_cycle_id) FROM stdin;
1	780	1	2	8	\N	2026-07-24 12:21:30	\N
\.


--
-- Data for Name: incidents; Type: TABLE DATA; Schema: core; Owner: user_im
--

COPY core.incidents (id, code, title, description, category_id, subcategory_id, priority_id, state_id, address, latitude, longitude, reported_by_id, current_assigned_id, due_date, resolution_date, created_at, updated_at, deleted_at, location, territorial_unit_id, address_reference, reopened_at, previous_resolution_date, rejected_at, resolved_by_supervisor_id, resolution_snapshots, current_cycle_id, classification_status, classification_detail, classified_by, classified_at) FROM stdin;
1	INC-2026-00001	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	6	22	1	3	Avinguda Barraza, 204, Bajos, 31681, Rodarte Baja	-2.93210000	-78.97390000	55	29	\N	\N	2026-07-24 06:52:27	2026-07-24 06:52:27	\N	0101000020E6100000C364AA6054BE53C014D044D8F07407C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
4	INC-2026-00004	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	4	14	2	1	Avinguda Delapaz, 7, Bajos, 92551, Las Ulloa Alta	-2.21620000	-79.86820000	55	\N	\N	\N	2026-07-21 18:52:28	2026-07-21 18:52:28	\N	0101000020E6100000C898BB9690F753C05F29CB10C7BA01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
57	INC-2026-00057	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	1	5	3	6	Avinguda Puente, 42, 8º E, 63129, L' Ozuna del Mirador	-3.27510000	-79.95840000	53	15	\N	\N	2026-07-16 20:52:28	2026-07-16 23:52:28	\N	0101000020E6100000211FF46C56FD53C06C09F9A067330AC0	331	\N	\N	\N	2026-07-16 23:52:28	\N	\N	\N	CLASSIFIED	\N	\N	\N
58	INC-2026-00058	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	4	17	1	7	Travesía Reséndez, 29, 2º C, 46471, Villa Ozuna	-3.27410000	-79.99340000	54	17	\N	\N	2026-07-05 11:52:28	2026-07-05 11:52:28	\N	0101000020E61000002BF697DD93FF53C036AB3E575B310AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
59	INC-2026-00059	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	7	\N	3	2	Paseo Gabriela, 56, Ático 6º, 12027, A Alvarado	-2.94910000	-78.98590000	54	29	\N	\N	2026-07-08 07:52:28	2026-07-08 07:52:28	\N	0101000020E6100000174850FC18BF53C09D11A5BDC19707C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
60	INC-2026-00060	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	2	8	3	1	Praza María Carmen, 613, 4º 7º, 73520, Aguilera Baja	-2.20220000	-79.87920000	53	\N	\N	\N	2026-06-30 01:52:28	2026-06-30 01:52:28	\N	0101000020E61000002AA913D044F853C075029A081B9E01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
61	INC-2026-00061	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	5	20	3	4	Camiño Marcos, 42, Bajos, 78780, O Chavarría de Lemos	-3.22310000	-79.93440000	54	17	\N	2026-06-30 05:52:28	2026-06-29 02:52:28	2026-06-30 05:52:28	\N	0101000020E61000007958A835CDFB53C09BE61DA7E8C809C0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
62	INC-2026-00062	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	4	14	3	2	Travessera Robles, 123, 5º F, 63250, Zaragoza de Ulla	-2.21920000	-79.90720000	55	9	\N	\N	2026-07-03 05:52:28	2026-07-03 05:52:28	\N	0101000020E610000099BB96900FFA53C0FE43FAEDEBC001C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
63	INC-2026-00063	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	5	20	1	7	Travesía Fernando, 945, 6º E, 50205, Los Blasco	-2.16920000	-79.93120000	55	13	\N	\N	2026-07-01 23:52:28	2026-07-01 23:52:28	\N	0101000020E61000004182E2C798FB53C098DD9387855A01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
64	INC-2026-00064	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	1	2	4	2	Travessera Juan José, 4, Bajos, 59331, Moreno del Puerto	-3.23610000	-79.92040000	55	19	\N	\N	2026-06-29 13:52:28	2026-06-29 13:52:28	\N	0101000020E610000042CF66D5E7FA53C04FAF946588E309C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
65	INC-2026-00065	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	6	24	3	4	Travesía Ander, 1, 5º C, 89902, Los Alvarado del Puerto	-2.20320000	-79.84820000	54	12	\N	2026-06-29 21:52:28	2026-06-26 21:52:28	2026-06-29 21:52:28	\N	0101000020E6100000E71DA7E848F653C0AA60545227A001C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
66	INC-2026-00066	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	6	23	1	3	Travessera Nicolás, 84, 3º E, 80049, Bustos del Pozo	-2.19520000	-79.92020000	54	13	\N	\N	2026-07-10 10:52:28	2026-07-10 10:52:28	\N	0101000020E6100000DE718A8EE4FA53C0006F8104C58F01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
67	INC-2026-00067	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	1	1	4	4	Praza Tamayo, 719, 8º B, 88001, Villa Cerda de las Torres	-3.30210000	-79.94740000	53	15	\N	2026-07-08 13:52:28	2026-07-05 15:52:28	2026-07-08 13:52:28	\N	0101000020E6100000BF0E9C33A2FC53C009F9A067B36A0AC0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
68	INC-2026-00068	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	3	13	3	6	Plaça Ángeles, 273, 84º F, 69078, Os Castillo de San Pedro	-2.19520000	-79.90120000	55	13	\N	\N	2026-07-13 07:52:28	2026-07-13 22:52:28	\N	0101000020E6100000EFC9C342ADF953C0006F8104C58F01C0	482	\N	\N	\N	2026-07-13 22:52:28	\N	\N	\N	CLASSIFIED	\N	\N	\N
69	INC-2026-00069	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	4	15	3	4	Travessera Saúl, 330, 81º A, 94269, As Benítez	-3.30110000	-79.97940000	54	15	\N	2026-07-11 09:52:28	2026-07-09 12:52:28	2026-07-11 09:52:28	\N	0101000020E6100000F46C567DAEFE53C0D49AE61DA7680AC0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
70	INC-2026-00070	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	2	8	3	3	Avenida Mota, 9, 68º D, 98742, El Cuesta de San Pedro	-2.15620000	-79.92720000	54	9	\N	\N	2026-07-07 06:52:28	2026-07-07 06:52:28	\N	0101000020E61000007A36AB3E57FB53C0E4141DC9E53F01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
71	INC-2026-00071	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	6	23	2	6	Rúa Gil, 7, 2º E, 59006, La Serrano del Barco	-2.93310000	-79.03890000	53	27	\N	\N	2026-06-27 23:52:28	2026-06-28 08:52:28	\N	0101000020E61000001FF46C567DC253C0492EFF21FD7607C0	11	\N	\N	\N	2026-06-28 08:52:28	\N	\N	\N	CLASSIFIED	\N	\N	\N
72	INC-2026-00072	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	2	9	4	4	Travessera Esteve, 6, 68º B, 08461, Jaime del Vallès	-3.29410000	-79.95140000	54	19	\N	2026-06-27 09:52:28	2026-06-24 09:52:28	2026-06-27 09:52:28	\N	0101000020E6100000865AD3BCE3FC53C05F07CE19515A0AC0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
73	INC-2026-00073	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	2	8	3	1	Calle Diego, 821, 06º E, 59579, Valentín del Vallès	-3.26810000	-79.99740000	54	\N	\N	\N	2026-07-21 19:52:28	2026-07-21 19:52:28	\N	0101000020E6100000F241CF66D5FF53C0F775E09C11250AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
74	INC-2026-00074	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	2	7	3	5	Travessera Cristina, 6, Ático 7º, 03202, Villa Abreu	-3.25610000	-80.00340000	54	15	\N	2026-07-14 09:52:28	2026-07-13 23:52:28	2026-07-14 09:52:28	\N	0101000020E61000009C33A2B4370054C0780B24287E0C0AC0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
75	INC-2026-00075	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	6	24	2	1	Plaça Manuela, 905, Entre suelo 4º, 43139, Las González de San Pedro	-2.22320000	-79.88020000	54	\N	\N	\N	2026-06-23 19:52:28	2026-06-23 19:52:28	\N	0101000020E61000001C7C613255F853C0D3BCE3141DC901C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
2	INC-2026-00002	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	1	2	4	3	Plaza Costa, 837, 64º E, 98817, Andreu del Mirador	-2.89110000	-79.03490000	53	28	\N	\N	2026-07-13 11:52:27	2026-07-13 11:52:27	\N	0101000020E610000058A835CD3BC253C08CB96B09F92007C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
76	INC-2026-00076	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	3	12	2	6	Rúa Lira, 744, 6º, 68971, Vall Fonseca	-2.24320000	-79.91320000	54	13	\N	\N	2026-07-21 21:52:28	2026-07-22 03:52:28	\N	0101000020E610000043AD69DE71FA53C0FC1873D712F201C0	482	\N	\N	\N	2026-07-22 03:52:28	\N	\N	\N	CLASSIFIED	\N	\N	\N
77	INC-2026-00077	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	3	11	4	5	Avenida Marc, 5, 05º A, 86464, Villa Ceballos Medio	-2.86810000	-78.97290000	53	29	\N	2026-07-15 11:52:28	2026-07-13 05:52:28	2026-07-15 11:52:28	\N	0101000020E6100000D1915CFE43BE53C0C442AD69DEF106C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
78	INC-2026-00078	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	1	4	4	7	Plaça Jan, 516, Ático 4º, 05439, Carrero Baja	-3.20810000	-79.97940000	55	17	\N	\N	2026-06-27 23:52:28	2026-06-27 23:52:28	\N	0101000020E6100000F46C567DAEFE53C07C61325530AA09C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
79	INC-2026-00079	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	5	20	3	2	Praza Echevarría, 818, Bajo 4º, 37171, San Orellana	-2.17220000	-79.84320000	55	9	\N	\N	2026-07-23 07:52:28	2026-07-23 07:52:28	\N	0101000020E61000002EFF21FDF6F553C038F8C264AA6001C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
80	INC-2026-00080	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	5	20	2	4	Travesía Andrea, 10, 0º E, 88206, Saucedo de Ulla	-2.15820000	-79.91520000	53	10	\N	2026-07-15 16:52:28	2026-07-12 21:52:28	2026-07-15 16:52:28	\N	0101000020E6100000265305A392FA53C04ED1915CFE4301C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
81	INC-2026-00081	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	4	16	4	3	Rúa Alejandra, 87, 9º D, 19330, Lozada del Penedès	-2.89310000	-78.96690000	54	29	\N	\N	2026-07-03 13:52:28	2026-07-03 13:52:28	\N	0101000020E610000027A089B0E1BD53C0F775E09C112507C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
82	INC-2026-00082	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	2	6	2	1	Rúa Carrasquillo, 152, 24º F, 56970, Las Cazares del Penedès	-2.89110000	-79.02790000	55	\N	\N	\N	2026-07-09 14:52:28	2026-07-09 14:52:28	\N	0101000020E6100000BDE3141DC9C153C08CB96B09F92007C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
83	INC-2026-00083	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	2	9	1	2	Travessera Carla, 3, 9º B, 65980, L' Carvajal Baja	-2.93310000	-79.03190000	53	30	\N	\N	2026-07-08 01:52:28	2026-07-08 01:52:28	\N	0101000020E6100000832F4CA60AC253C0492EFF21FD7607C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
84	INC-2026-00084	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	3	13	1	7	Camiño Vera, 70, 4º C, 63183, Os Tórrez del Puerto	-3.22410000	-79.98740000	55	16	\N	\N	2026-06-30 14:52:28	2026-06-30 14:52:28	\N	0101000020E61000008104C58F31FF53C0D044D8F0F4CA09C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
85	INC-2026-00085	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	4	15	3	3	Avenida Vigil, 241, 70º D, 56295, As Rangel del Mirador	-2.15620000	-79.86520000	54	13	\N	\N	2026-07-23 03:52:28	2026-07-23 03:52:28	\N	0101000020E6100000F31FD26F5FF753C0E4141DC9E53F01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
86	INC-2026-00086	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	1	3	4	1	Paseo Olivia, 32, 4º E, 47916, Vall Yáñez	-2.16020000	-79.84020000	53	\N	\N	\N	2026-07-01 16:52:28	2026-07-01 16:52:28	\N	0101000020E6100000598638D6C5F553C0B98D06F0164801C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
87	INC-2026-00087	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	6	23	1	1	Travessera Luna, 529, 68º D, 79953, L' Ruiz Medio	-3.22110000	-79.92240000	55	\N	\N	\N	2026-06-24 09:52:28	2026-06-24 09:52:28	\N	0101000020E61000002575029A08FB53C0302AA913D0C409C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
88	INC-2026-00088	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	7	\N	3	7	Calle Menéndez, 256, 0º A, 12372, Zelaya del Mirador	-3.24110000	-79.90540000	54	19	\N	\N	2026-06-30 00:52:28	2026-06-30 00:52:28	\N	0101000020E61000001973D712F2F953C0598638D6C5ED09C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
89	INC-2026-00089	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	2	9	1	2	Travessera Francisco, 3, 35º A, 13325, A Román	-3.25410000	-79.98740000	55	17	\N	\N	2026-06-30 17:52:28	2026-06-30 17:52:28	\N	0101000020E61000008104C58F31FF53C00E4FAF9465080AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
90	INC-2026-00090	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	3	11	3	5	Plaça Carrión, 77, 6º C, 50153, A Delafuente de Lemos	-3.26610000	-79.98440000	54	16	\N	2026-07-10 21:52:28	2026-07-10 14:52:28	2026-07-10 21:52:28	\N	0101000020E6100000AC8BDB6800FF53C08CB96B09F9200AC0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
91	INC-2026-00091	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	5	18	4	2	Paseo Roberto, 869, 0º B, 19768, Villa Delao de las Torres	-2.92510000	-78.98390000	54	29	\N	\N	2026-07-14 19:52:28	2026-07-14 19:52:28	\N	0101000020E610000034A2B437F8BE53C09F3C2CD49A6607C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
92	INC-2026-00092	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	2	7	1	1	Praza Villaseñor, 4, 3º 7º, 74716, Olivo del Vallès	-2.19720000	-79.91320000	54	\N	\N	\N	2026-06-30 19:52:28	2026-06-30 19:52:28	\N	0101000020E610000043AD69DE71FA53C06B2BF697DD9301C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
93	INC-2026-00093	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	4	17	1	1	Avinguda Iván, 439, 6º A, 95871, Vall De la Cruz Baja	-2.88410000	-78.98990000	54	\N	\N	\N	2026-07-18 21:52:28	2026-07-18 21:52:28	\N	0101000020E6100000DE9387855ABF53C018265305A31207C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
94	INC-2026-00094	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	3	12	2	2	Plaça Duran, 2, 5º 6º, 22161, Alcaráz Baja	-2.90810000	-78.97090000	53	29	\N	\N	2026-07-19 11:52:28	2026-07-19 11:52:28	\N	0101000020E6100000EEEBC03923BE53C016FBCBEEC94307C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
95	INC-2026-00095	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	4	16	2	5	Calle Villar, 8, Bajo 4º, 55803, Esquibel del Pozo	-2.88310000	-79.00090000	55	29	\N	2026-07-01 05:52:28	2026-06-30 16:52:28	2026-07-01 05:52:28	\N	0101000020E610000040A4DFBE0EC053C0E3C798BB961007C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
96	INC-2026-00096	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	3	12	2	1	Travessera Montemayor, 206, 2º E, 38602, Salvador del Puerto	-3.30610000	-79.98040000	53	\N	\N	\N	2026-07-11 07:52:28	2026-07-11 07:52:28	\N	0101000020E6100000E63FA4DFBEFE53C0DE718A8EE4720AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
3	INC-2026-00003	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	4	17	4	5	Ruela Pedro, 33, Bajo 0º, 88302, Carbonell de las Torres	-2.15120000	-79.86320000	53	13	\N	2026-07-15 00:52:27	2026-07-14 22:52:27	2026-07-15 00:52:27	\N	0101000020E6100000107A36AB3EF753C0D93D7958A83501C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
97	INC-2026-00097	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	1	5	2	5	Camiño Daniel, 77, 9º A, 60610, Gaytán del Barco	-2.85410000	-79.01390000	54	27	\N	2026-07-02 07:52:28	2026-07-01 13:52:28	2026-07-02 07:52:28	\N	0101000020E6100000865AD3BCE3C053C0DA1B7C6132D506C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
98	INC-2026-00098	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	2	6	3	5	Calle Rayan, 95, 0º 9º, 68662, Vall Ochoa del Bages	-2.20820000	-79.86420000	54	13	\N	2026-07-23 03:52:28	2026-07-22 17:52:28	2026-07-23 03:52:28	\N	0101000020E6100000014D840D4FF753C0B537F8C264AA01C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
99	INC-2026-00099	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	7	\N	1	4	Passeig Colunga, 440, 07º B, 11151, Archuleta del Vallès	-2.90210000	-79.01990000	55	31	\N	2026-07-17 19:52:28	2026-07-16 17:52:28	2026-07-17 19:52:28	\N	0101000020E6100000304CA60A46C153C0D6C56D34803707C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
100	INC-2026-00100	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	1	3	1	3	Camiño Esquivel, 75, Ático 1º, 73022, Robles del Barco	-2.22520000	-79.84520000	55	9	\N	\N	2026-06-24 15:52:28	2026-06-24 15:52:28	\N	0101000020E610000012A5BDC117F653C03E7958A835CD01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
101	INC-2026-00101	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	3	12	3	6	Avinguda Cuenca, 2, 60º 5º, 18277, Valdés de San Pedro	-2.18420000	-79.84820000	53	12	\N	\N	2026-07-08 01:52:28	2026-07-08 14:52:28	\N	0101000020E6100000E71DA7E848F653C0B7627FD93D7901C0	482	\N	\N	\N	2026-07-08 14:52:28	\N	\N	\N	CLASSIFIED	\N	\N	\N
102	INC-2026-00102	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	1	3	3	5	Avinguda Arriaga, 2, Bajos, 12070, Os Blanco	-3.28710000	-79.99940000	53	16	\N	2026-07-15 10:52:28	2026-07-14 11:52:28	2026-07-15 10:52:28	\N	0101000020E6100000D5E76A2BF6FF53C0EB73B515FB4B0AC0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
103	INC-2026-00103	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	6	22	1	3	Praza Morales, 12, 1º E, 35660, San Canales Baja	-2.22420000	-79.87520000	55	9	\N	\N	2026-06-30 16:52:28	2026-06-30 16:52:28	\N	0101000020E6100000645DDC4603F853C0091B9E5E29CB01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
104	INC-2026-00104	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	6	23	3	3	Passeig Patricia, 8, 3º B, 10396, El Rivero	-2.24220000	-79.85520000	55	12	\N	\N	2026-07-06 15:52:28	2026-07-06 15:52:28	\N	0101000020E610000082E2C798BBF653C0C7BAB88D06F001C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
105	INC-2026-00105	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	3	10	2	6	Travesía Puente, 24, 7º D, 96077, El Rodarte	-2.86310000	-78.96890000	55	29	\N	\N	2026-06-25 00:52:28	2026-06-25 08:52:28	\N	0101000020E61000000B46257502BE53C0BA6B09F9A0E706C0	11	\N	\N	\N	2026-06-25 08:52:28	\N	\N	\N	CLASSIFIED	\N	\N	\N
106	INC-2026-00106	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	1	3	4	1	Praza Romo, 228, 09º C, 12486, Naranjo del Mirador	-2.19320000	-79.92320000	54	\N	\N	\N	2026-07-18 12:52:28	2026-07-18 12:52:28	\N	0101000020E6100000B3EA73B515FB53C096B20C71AC8B01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
107	INC-2026-00107	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	1	4	4	5	Ruela Mar, 7, 7º F, 77721, Os Canales de Arriba	-2.14920000	-79.85520000	53	9	\N	2026-07-01 18:52:28	2026-07-01 05:52:28	2026-07-01 18:52:28	\N	0101000020E610000082E2C798BBF653C06F8104C58F3101C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
108	INC-2026-00108	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	6	22	1	4	Ronda Avilés, 599, Bajos, 09145, Las Guzmán del Pozo	-2.90610000	-78.96090000	53	30	\N	2026-07-19 18:52:28	2026-07-18 15:52:28	2026-07-19 18:52:28	\N	0101000020E61000007DAEB6627FBD53C0AB3E575BB13F07C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
109	INC-2026-00109	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	5	20	2	4	Paseo Ariadna, 5, 6º D, 12233, San Niño del Bages	-3.22310000	-79.98940000	54	19	\N	2026-07-14 04:52:28	2026-07-12 15:52:28	2026-07-14 04:52:28	\N	0101000020E610000065AA605452FF53C09BE61DA7E8C809C0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
110	INC-2026-00110	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	1	2	2	3	Carrer Vega, 6, 2º B, 76448, L' Estévez del Bages	-3.28610000	-79.98340000	54	19	\N	\N	2026-07-15 03:52:28	2026-07-15 03:52:28	\N	0101000020E6100000BBB88D06F0FE53C0B515FBCBEE490AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
111	INC-2026-00111	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	6	22	3	1	Ruela Ainhoa, 6, 7º C, 37549, La Millán del Barco	-2.87210000	-79.05190000	55	\N	\N	\N	2026-06-25 14:52:28	2026-06-25 14:52:28	\N	0101000020E610000065AA605452C353C099BB96900FFA06C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
112	INC-2026-00112	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	7	\N	3	5	Camiño Monroy, 42, 90º B, 40038, Ordóñez de las Torres	-2.93910000	-79.05090000	55	31	\N	2026-07-14 03:52:28	2026-07-13 05:52:28	2026-07-14 03:52:28	\N	0101000020E610000073D712F241C353C088635DDC468307C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
113	INC-2026-00113	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	7	\N	4	1	Rúa Nuria, 371, 90º 9º, 02157, Los Arellano del Bages	-2.22120000	-79.90120000	55	\N	\N	\N	2026-07-06 10:52:28	2026-07-06 10:52:28	\N	0101000020E6100000EFC9C342ADF953C069006F8104C501C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
114	INC-2026-00114	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	4	14	3	4	Carrer Helena, 46, 1º 1º, 16622, Naranjo de Lemos	-2.18520000	-79.86620000	53	13	\N	2026-07-22 15:52:28	2026-07-20 09:52:28	2026-07-22 15:52:28	\N	0101000020E6100000E5F21FD26FF753C0ECC039234A7B01C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
115	INC-2026-00115	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	6	23	4	5	Plaça Batista, 78, 60º C, 31065, Nevárez del Mirador	-3.21110000	-79.95640000	53	16	\N	2026-07-18 22:52:28	2026-07-17 08:52:28	2026-07-18 22:52:28	\N	0101000020E61000003E7958A835FD53C01C7C613255B009C0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
116	INC-2026-00116	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	4	16	2	4	Plaza Rodríquez, 711, 0º 0º, 95494, Monroy del Puerto	-2.93810000	-78.99390000	55	31	\N	2026-06-28 08:52:28	2026-06-27 11:52:28	2026-06-28 08:52:28	\N	0101000020E6100000A4DFBE0E9CBF53C05305A3923A8107C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
117	INC-2026-00117	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	5	19	2	3	Rúa Paola, 9, 8º 5º, 67952, Villa Cobo del Puerto	-2.20020000	-79.91020000	53	12	\N	\N	2026-07-18 22:52:28	2026-07-18 22:52:28	\N	0101000020E61000006E3480B740FA53C00B462575029A01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
5	INC-2026-00005	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	2	9	3	1	Carrer Herrero, 56, 4º 1º, 12406, Galván Baja	-2.89810000	-78.96190000	54	\N	\N	\N	2026-07-18 03:52:28	2026-07-18 03:52:28	\N	0101000020E61000006F8104C58FBD53C0014D840D4F2F07C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
118	INC-2026-00118	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	6	24	3	6	Carrer Blasco, 4, 44º D, 78274, Correa de Ulla	-3.28810000	-79.93740000	55	16	\N	\N	2026-06-24 22:52:28	2026-06-25 04:52:28	\N	0101000020E61000004ED1915CFEFB53C020D26F5F074E0AC0	331	\N	\N	\N	2026-06-25 04:52:28	\N	\N	\N	CLASSIFIED	\N	\N	\N
119	INC-2026-00119	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	1	1	3	4	Praza Posada, 79, Entre suelo 5º, 10825, Vall Bonilla del Pozo	-3.22110000	-79.99940000	54	16	\N	2026-07-02 00:52:28	2026-06-29 04:52:28	2026-07-02 00:52:28	\N	0101000020E6100000D5E76A2BF6FF53C0302AA913D0C409C0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
120	INC-2026-00120	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	7	\N	1	6	Ruela Marcos, 41, Bajo 2º, 93425, As Angulo	-3.24910000	-79.93040000	54	18	\N	\N	2026-06-30 08:52:28	2026-06-30 13:52:28	\N	0101000020E6100000B30C71AC8BFB53C003780B2428FE09C0	331	\N	\N	\N	2026-06-30 13:52:28	\N	\N	\N	CLASSIFIED	\N	\N	\N
121	INC-2026-00121	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	3	11	3	5	Travessera Encarnación, 332, 24º A, 10442, Las Alonso	-3.26610000	-79.93140000	55	17	\N	2026-07-07 17:52:28	2026-07-06 10:52:28	2026-07-07 17:52:28	\N	0101000020E6100000A4DFBE0E9CFB53C08CB96B09F9200AC0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
122	INC-2026-00122	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	1	1	1	6	Avinguda Marina, 47, 50º A, 43001, El Vicente de Ulla	-3.26710000	-79.95940000	53	16	\N	\N	2026-06-26 16:52:29	2026-06-27 00:52:29	\N	0101000020E610000013F241CF66FD53C0C217265305230AC0	331	\N	\N	\N	2026-06-27 00:52:29	\N	\N	\N	CLASSIFIED	\N	\N	\N
123	INC-2026-00123	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	7	\N	4	1	Carrer Marcos, 65, 06º C, 44812, Vall Marrero	-2.24620000	-79.91920000	55	\N	\N	\N	2026-07-23 18:52:29	2026-07-23 18:52:29	\N	0101000020E6100000ED9E3C2CD4FA53C09C33A2B437F801C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
127	INC-2026-00127	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	2	6	4	5	Ronda Apodaca, 565, 3º B, 04731, Bermúdez del Penedès	-2.91510000	-78.99890000	55	30	\N	2026-07-18 02:52:29	2026-07-17 19:52:29	2026-07-18 02:52:29	\N	0101000020E61000005DFE43FAEDBF53C08A8EE4F21F5207C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
128	INC-2026-00128	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	6	24	1	1	Paseo Escudero, 224, 86º C, 26712, Zamudio del Pozo	-2.23220000	-79.85920000	54	\N	\N	\N	2026-06-25 00:52:29	2026-06-25 00:52:29	\N	0101000020E6100000492EFF21FDF653C0B30C71AC8BDB01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
129	INC-2026-00129	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	6	22	3	1	Praza Serra, 397, 1º E, 60936, L' Montañez de Ulla	-2.22820000	-79.83620000	54	\N	\N	\N	2026-07-11 16:52:29	2026-07-11 16:52:29	\N	0101000020E6100000933A014D84F553C0DE9387855AD301C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
130	INC-2026-00130	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	1	3	4	6	Travesía Calvillo, 270, 01º C, 28653, Villa Díez	-2.20920000	-79.91820000	54	11	\N	\N	2026-07-11 10:52:29	2026-07-11 19:52:29	\N	0101000020E6100000FBCBEEC9C3FA53C0EA95B20C71AC01C0	482	\N	\N	\N	2026-07-11 19:52:29	\N	\N	\N	CLASSIFIED	\N	\N	\N
131	INC-2026-00131	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	5	19	2	2	Plaça Uribe, 675, 74º B, 53662, López del Vallès	-2.19420000	-79.90220000	54	10	\N	\N	2026-07-02 19:52:29	2026-07-02 19:52:29	\N	0101000020E6100000E09C11A5BDF953C0CB10C7BAB88D01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
132	INC-2026-00132	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	6	23	3	4	Travessera Zarate, 292, Bajo 8º, 21804, Mercado de las Torres	-2.18120000	-79.84620000	53	13	\N	2026-07-08 23:52:29	2026-07-07 07:52:29	2026-07-08 23:52:29	\N	0101000020E610000003780B2428F653C0174850FC187301C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
133	INC-2026-00133	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	5	18	3	1	Praza Asier, 301, Entre suelo 5º, 74077, O Rendón de Ulla	-3.27310000	-79.97040000	53	\N	\N	\N	2026-07-05 18:52:29	2026-07-05 18:52:29	\N	0101000020E610000075029A081BFE53C0014D840D4F2F0AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
134	INC-2026-00134	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	1	5	2	1	Plaça Fátima, 98, 5º F, 44601, San Otero	-2.87810000	-79.04690000	53	\N	\N	\N	2026-07-23 02:52:29	2026-07-23 02:52:29	\N	0101000020E6100000AC8BDB6800C353C0D8F0F44A590607C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
135	INC-2026-00135	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	4	17	3	6	Praza Rosa, 6, 4º, 96944, El Rico Baja	-2.24520000	-79.86620000	53	9	\N	\N	2026-07-20 04:52:29	2026-07-20 11:52:29	\N	0101000020E6100000E5F21FD26FF753C067D5E76A2BF601C0	482	\N	\N	\N	2026-07-20 11:52:29	\N	\N	\N	CLASSIFIED	\N	\N	\N
136	INC-2026-00136	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	5	20	4	7	Calle Mara, 6, 82º E, 84605, San Lorenzo	-2.89110000	-79.03490000	54	30	\N	\N	2026-07-01 14:52:29	2026-07-01 14:52:29	\N	0101000020E610000058A835CD3BC253C08CB96B09F92007C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
137	INC-2026-00137	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	2	8	3	7	Rúa Mota, 280, Ático 6º, 79435, Carmona de la Sierra	-3.25410000	-79.90940000	54	15	\N	\N	2026-06-24 03:52:29	2026-06-24 03:52:29	\N	0101000020E6100000E0BE0E9C33FA53C00E4FAF9465080AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
138	INC-2026-00138	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	7	\N	4	4	Travesía Rosa María, 5, Bajo 4º, 84708, L' Sarabia	-2.22920000	-79.92520000	54	12	\N	2026-07-15 00:52:29	2026-07-12 03:52:29	2026-07-15 00:52:29	\N	0101000020E610000097900F7A36FB53C013F241CF66D501C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
139	INC-2026-00139	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	7	\N	2	1	Calle Vázquez, 309, 25º F, 47682, El Serrano	-2.87510000	-79.00690000	55	\N	\N	\N	2026-06-30 10:52:29	2026-06-30 10:52:29	\N	0101000020E6100000EA95B20C71C053C039D6C56D340007C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
140	INC-2026-00140	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	6	24	4	3	Carrer Montoya, 320, 7º 5º, 61568, Hernando del Barco	-2.91910000	-78.97490000	54	31	\N	\N	2026-07-08 12:52:29	2026-07-08 12:52:29	\N	0101000020E6100000B537F8C264BE53C05F07CE19515A07C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
141	INC-2026-00141	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	3	10	2	1	Praza Luisa, 506, Bajo 5º, 90835, As Montañez del Barco	-2.14820000	-79.90620000	54	\N	\N	\N	2026-07-16 04:52:29	2026-07-16 04:52:29	\N	0101000020E6100000A7E8482EFFF953C03A234A7B832F01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
6	INC-2026-00006	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	3	10	3	5	Plaza Vega, 588, 20º C, 52572, El Yáñez	-2.91310000	-79.04090000	53	30	\N	2026-06-27 13:52:28	2026-06-25 15:52:28	2026-06-27 13:52:28	\N	0101000020E6100000029A081B9EC253C020D26F5F074E07C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
142	INC-2026-00142	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	7	\N	3	2	Plaça Godínez, 683, 5º F, 28594, Las Valadez	-2.24120000	-79.93520000	55	13	\N	\N	2026-07-10 10:52:29	2026-07-10 10:52:29	\N	0101000020E610000007CE1951DAFB53C0925CFE43FAED01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
143	INC-2026-00143	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	5	18	3	5	Avenida Jordi, 789, 3º C, 80604, Os Laboy	-3.23010000	-79.97440000	55	15	\N	2026-06-26 22:52:29	2026-06-25 09:52:29	2026-06-26 22:52:29	\N	0101000020E61000003C4ED1915CFE53C0107A36AB3ED709C0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
144	INC-2026-00144	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	6	22	3	3	Rúa Caro, 63, 2º E, 74866, Villa Chávez del Pozo	-2.88810000	-78.98290000	53	27	\N	\N	2026-06-26 12:52:29	2026-06-26 12:52:29	\N	0101000020E610000042CF66D5E7BE53C0ED9E3C2CD41A07C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
145	INC-2026-00145	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	5	20	3	1	Ronda Galán, 16, 70º F, 85363, Muñoz del Vallès	-2.89910000	-79.00890000	55	\N	\N	\N	2026-07-02 07:52:29	2026-07-02 07:52:29	\N	0101000020E6100000CD3B4ED191C053C036AB3E575B3107C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
146	INC-2026-00146	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	2	6	4	1	Rúa Marco, 86, 7º C, 61079, Llamas de la Sierra	-2.89610000	-79.03990000	54	\N	\N	\N	2026-06-27 06:52:29	2026-06-27 06:52:29	\N	0101000020E610000011C7BAB88DC253C097900F7A362B07C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
147	INC-2026-00147	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	6	24	3	4	Praza Oliver, 74, 04º A, 16620, A Santillán Medio	-2.90910000	-79.00990000	54	27	\N	2026-06-26 15:52:29	2026-06-23 15:52:29	2026-06-26 15:52:29	\N	0101000020E6100000BF0E9C33A2C053C04B598638D64507C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
148	INC-2026-00148	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	4	14	1	4	Plaza Gallegos, 719, 4º C, 36679, Alicea de San Pedro	-2.86410000	-78.95690000	54	28	\N	2026-07-09 08:52:29	2026-07-08 06:52:29	2026-07-09 08:52:29	\N	0101000020E6100000B7627FD93DBD53C0EFC9C342ADE906C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
149	INC-2026-00149	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	7	\N	3	5	Praza Fierro, 329, 0º D, 59002, As Matías	-2.18520000	-79.92520000	55	9	\N	2026-06-30 18:52:29	2026-06-30 08:52:29	2026-06-30 18:52:29	\N	0101000020E610000097900F7A36FB53C0ECC039234A7B01C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
150	INC-2026-00150	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	2	9	1	5	Calle Guillermo, 3, 1º F, 27023, Bustamante Baja	-2.20120000	-79.89020000	55	10	\N	2026-06-26 18:52:29	2026-06-24 21:52:29	2026-06-26 18:52:29	\N	0101000020E61000008CB96B09F9F853C040A4DFBE0E9C01C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
151	INC-2026-00151	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	2	8	3	4	Carrer Jiménez, 142, Entre suelo 0º, 08399, León de la Sierra	-2.92310000	-79.05390000	53	31	\N	2026-06-25 23:52:29	2026-06-23 20:52:29	2026-06-25 23:52:29	\N	0101000020E61000004850FC1873C353C03480B740826207C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
152	INC-2026-00152	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	5	20	1	5	Passeig Aaron, 76, 7º, 32758, As Roldán	-2.15220000	-79.90020000	55	9	\N	2026-06-27 20:52:29	2026-06-24 23:52:29	2026-06-27 20:52:29	\N	0101000020E6100000FDF675E09CF953C00F9C33A2B43701C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
153	INC-2026-00153	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	2	8	2	7	Travesía Díaz, 692, 6º, 59507, Las Salcedo de la Sierra	-3.30610000	-79.90840000	53	15	\N	\N	2026-07-20 14:52:29	2026-07-20 14:52:29	\N	0101000020E6100000EEEBC03923FA53C0DE718A8EE4720AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
154	INC-2026-00154	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	6	22	3	6	Praza Gallego, 9, 3º A, 96262, Las Matías	-2.20920000	-79.90120000	55	10	\N	\N	2026-07-19 01:52:29	2026-07-20 01:52:29	\N	0101000020E6100000EFC9C342ADF953C0EA95B20C71AC01C0	482	\N	\N	\N	2026-07-20 01:52:29	\N	\N	\N	CLASSIFIED	\N	\N	\N
155	INC-2026-00155	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	6	23	2	1	Travesía Tirado, 11, 64º B, 89603, Os Pereira de Lemos	-2.23420000	-79.83920000	54	\N	\N	\N	2026-07-04 10:52:29	2026-07-04 10:52:29	\N	0101000020E610000068B3EA73B5F553C01DC9E53FA4DF01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
156	INC-2026-00156	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	4	14	1	3	Plaça Villalba, 944, 5º 7º, 25194, Barroso de Lemos	-3.26610000	-79.91340000	53	17	\N	\N	2026-07-07 11:52:29	2026-07-07 11:52:29	\N	0101000020E6100000A60A462575FA53C08CB96B09F9200AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
157	INC-2026-00157	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	6	22	1	2	Calle Iglesias, 51, 31º E, 01240, Vall Lebrón	-3.25910000	-79.91940000	55	18	\N	\N	2026-06-25 06:52:29	2026-06-25 06:52:29	\N	0101000020E610000050FC1873D7FA53C018265305A3120AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
158	INC-2026-00158	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	5	18	2	1	Calle Alcaráz, 3, 97º 6º, 47127, Los Moreno Alta	-2.14720000	-79.85720000	54	\N	\N	\N	2026-07-09 23:52:29	2026-07-09 23:52:29	\N	0101000020E61000006688635DDCF653C005C58F31772D01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
159	INC-2026-00159	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	5	18	4	7	Plaza Margarita, 16, 3º 8º, 90883, La Pérez del Bages	-3.28710000	-79.94140000	55	18	\N	\N	2026-07-18 23:52:29	2026-07-18 23:52:29	\N	0101000020E6100000151DC9E53FFC53C0EB73B515FB4B0AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
160	INC-2026-00160	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	1	3	2	2	Carrer Blanca, 2, 67º C, 54260, O Correa	-2.90910000	-79.04590000	54	27	\N	\N	2026-07-07 16:52:29	2026-07-07 16:52:29	\N	0101000020E6100000BBB88D06F0C253C04B598638D64507C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
161	INC-2026-00161	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	4	14	4	7	Ronda Gabriela, 835, 9º 4º, 52416, Tello Alta	-2.89010000	-78.97890000	55	28	\N	\N	2026-06-28 11:52:29	2026-06-28 11:52:29	\N	0101000020E61000007B832F4CA6BE53C0575BB1BFEC1E07C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
162	INC-2026-00162	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	1	5	4	2	Ruela Acosta, 4, 76º B, 80537, O Galán del Barco	-3.30510000	-79.94740000	54	18	\N	\N	2026-06-27 06:52:29	2026-06-27 06:52:29	\N	0101000020E6100000BF0E9C33A2FC53C0A913D044D8700AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
7	INC-2026-00007	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	6	22	1	4	Rúa Víctor, 6, 61º D, 17820, San Esteban	-3.26210000	-79.96440000	54	16	\N	2026-07-06 00:52:28	2026-07-04 03:52:28	2026-07-06 00:52:28	\N	0101000020E6100000CB10C7BAB8FD53C0B84082E2C7180AC0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
163	INC-2026-00163	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	7	\N	2	5	Avenida César, 3, Bajos, 09192, La Véliz del Pozo	-2.20020000	-79.87220000	53	12	\N	2026-07-07 02:52:29	2026-07-05 00:52:29	2026-07-07 02:52:29	\N	0101000020E61000008FE4F21FD2F753C00B462575029A01C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
164	INC-2026-00164	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	7	\N	3	5	Travessera Arce, 8, Entre suelo 9º, 14021, Iglesias del Pozo	-3.27310000	-79.99640000	53	15	\N	2026-07-23 06:52:29	2026-07-20 22:52:29	2026-07-23 06:52:29	\N	0101000020E6100000006F8104C5FF53C0014D840D4F2F0AC0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
165	INC-2026-00165	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	2	9	4	6	Carrer Gil, 47, 4º, 85737, Los Soliz	-2.88710000	-78.99190000	53	28	\N	\N	2026-06-29 13:52:29	2026-06-29 21:52:29	\N	0101000020E6100000C139234A7BBF53C0B84082E2C71807C0	11	\N	\N	\N	2026-06-29 21:52:29	\N	\N	\N	CLASSIFIED	\N	\N	\N
166	INC-2026-00166	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	4	14	4	3	Camiño Briseño, 27, 96º F, 80267, Pastor de San Pedro	-2.87910000	-79.04090000	55	30	\N	\N	2026-06-30 04:52:29	2026-06-30 04:52:29	\N	0101000020E6100000029A081B9EC253C00E4FAF94650807C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
167	INC-2026-00167	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	2	6	2	1	Praza Biel, 665, 5º 7º, 18698, O Lozano	-2.15120000	-79.88120000	55	\N	\N	\N	2026-07-16 13:52:29	2026-07-16 13:52:29	\N	0101000020E61000000E4FAF9465F853C0D93D7958A83501C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
168	INC-2026-00168	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	7	\N	4	3	Calle Guerra, 103, 21º D, 52309, Vall Lemus del Puerto	-2.24220000	-79.87820000	53	11	\N	\N	2026-07-11 23:52:29	2026-07-11 23:52:29	\N	0101000020E610000039D6C56D34F853C0C7BAB88D06F001C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
169	INC-2026-00169	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	1	5	3	6	Ruela Delacrúz, 360, 60º C, 66059, A Gómez	-2.19620000	-79.84020000	53	12	\N	\N	2026-07-07 00:52:29	2026-07-07 09:52:29	\N	0101000020E6100000598638D6C5F553C036CD3B4ED19101C0	482	\N	\N	\N	2026-07-07 09:52:29	\N	\N	\N	CLASSIFIED	\N	\N	\N
170	INC-2026-00170	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	5	20	2	5	Praza Ian, 791, 26º B, 27927, Roca de Lemos	-2.18920000	-79.85020000	54	13	\N	2026-07-08 08:52:29	2026-07-05 12:52:29	2026-07-08 08:52:29	\N	0101000020E6100000CAC342AD69F653C0C139234A7B8301C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
171	INC-2026-00171	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	4	16	4	1	Travessera Oriol, 45, 39º B, 79669, A Arroyo de Lemos	-2.15420000	-79.90820000	55	\N	\N	\N	2026-06-26 15:52:29	2026-06-26 15:52:29	\N	0101000020E61000008A8EE4F21FFA53C07958A835CD3B01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
172	INC-2026-00172	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	6	24	1	1	Carrer Daniela, 1, Bajos, 73024, Córdoba de San Pedro	-2.22720000	-79.93420000	55	\N	\N	\N	2026-07-17 03:52:29	2026-07-17 03:52:29	\N	0101000020E610000016FBCBEEC9FB53C0A835CD3B4ED101C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
173	INC-2026-00173	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	7	\N	2	4	Praza Valeria, 3, 9º, 11293, Nájera del Vallès	-2.94110000	-78.97890000	54	29	\N	2026-06-28 14:52:29	2026-06-26 16:52:29	2026-06-28 14:52:29	\N	0101000020E61000007B832F4CA6BE53C0F31FD26F5F8707C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
174	INC-2026-00174	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	7	\N	4	6	Plaça Juárez, 5, Ático 2º, 71749, Rolón de la Sierra	-2.22220000	-79.88520000	55	13	\N	\N	2026-07-14 09:52:29	2026-07-14 16:52:29	\N	0101000020E6100000D49AE61DA7F853C09E5E29CB10C701C0	482	\N	\N	\N	2026-07-14 16:52:29	\N	\N	\N	CLASSIFIED	\N	\N	\N
175	INC-2026-00175	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	5	20	3	5	Plaça Padrón, 7, 4º B, 78691, Os Arce	-2.14720000	-79.91820000	53	10	\N	2026-06-25 14:52:29	2026-06-25 09:52:29	2026-06-25 14:52:29	\N	0101000020E6100000FBCBEEC9C3FA53C005C58F31772D01C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
176	INC-2026-00176	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	5	20	4	5	Camino Francisco, 938, 57º A, 04386, El Agosto del Pozo	-3.22610000	-79.99640000	54	15	\N	2026-07-21 19:52:29	2026-07-20 03:52:29	2026-07-21 19:52:29	\N	0101000020E6100000006F8104C5FF53C03B014D840DCF09C0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
177	INC-2026-00177	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	6	24	4	3	Avinguda Urías, 3, 4º 9º, 04327, A Terán	-2.17620000	-79.88420000	54	10	\N	\N	2026-07-14 18:52:29	2026-07-14 18:52:29	\N	0101000020E6100000E3C798BB96F853C00D71AC8BDB6801C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
178	INC-2026-00178	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	3	10	1	5	Avinguda Leo, 83, 7º A, 13852, A Oquendo	-3.27510000	-79.94340000	54	15	\N	2026-07-14 10:52:29	2026-07-12 08:52:29	2026-07-14 10:52:29	\N	0101000020E6100000F8C264AA60FC53C06C09F9A067330AC0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
179	INC-2026-00179	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	7	\N	1	6	Plaça Martín, 59, 92º F, 30421, Los Betancourt de Lemos	-2.22320000	-79.87520000	55	10	\N	\N	2026-06-28 15:52:29	2026-06-29 12:52:29	\N	0101000020E6100000645DDC4603F853C0D3BCE3141DC901C0	482	\N	\N	\N	2026-06-29 12:52:29	\N	\N	\N	CLASSIFIED	\N	\N	\N
180	INC-2026-00180	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	5	21	1	1	Rúa Lucas, 789, 46º A, 98134, Los Galarza	-2.18720000	-79.92420000	53	\N	\N	\N	2026-06-27 03:52:29	2026-06-27 03:52:29	\N	0101000020E6100000A5BDC11726FB53C0567DAEB6627F01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
181	INC-2026-00181	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	2	7	2	1	Ronda Barrientos, 35, 5º 4º, 15115, San Bahena del Bages	-2.23420000	-79.92820000	55	\N	\N	\N	2026-07-01 20:52:29	2026-07-01 20:52:29	\N	0101000020E61000006C09F9A067FB53C01DC9E53FA4DF01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
182	INC-2026-00182	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	4	14	4	4	Carrer Vallejo, 8, Ático 1º, 76574, Grijalva Alta	-3.25610000	-79.98740000	53	16	\N	2026-07-07 14:52:29	2026-07-07 07:52:29	2026-07-07 14:52:29	\N	0101000020E61000008104C58F31FF53C0780B24287E0C0AC0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
183	INC-2026-00183	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	7	\N	4	7	Ronda Feliciano, 273, 16º F, 62716, Los Grijalva Medio	-3.27210000	-79.92740000	53	15	\N	\N	2026-07-07 16:52:29	2026-07-07 16:52:29	\N	0101000020E6100000DE9387855AFB53C0CCEEC9C3422D0AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
8	INC-2026-00008	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	4	14	4	2	Avinguda Velázquez, 37, Bajo 7º, 22016, Los Loera del Vallès	-2.22920000	-79.91920000	53	11	\N	\N	2026-07-19 01:52:28	2026-07-19 01:52:28	\N	0101000020E6100000ED9E3C2CD4FA53C013F241CF66D501C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
184	INC-2026-00184	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	6	23	3	2	Passeig Raquel, 8, 73º D, 03398, Las Ávalos	-2.24020000	-79.87120000	55	12	\N	\N	2026-07-05 02:52:29	2026-07-05 02:52:29	\N	0101000020E61000009D11A5BDC1F753C05DFE43FAEDEB01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
185	INC-2026-00185	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	4	16	4	7	Praza María Ángeles, 2, 82º A, 75956, Villa Abad	-2.15520000	-79.92720000	53	9	\N	\N	2026-07-12 05:52:29	2026-07-12 05:52:29	\N	0101000020E61000007A36AB3E57FB53C0AEB6627FD93D01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
186	INC-2026-00186	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	1	4	2	1	Rúa Manzanares, 431, 3º D, 72401, Macías del Vallès	-2.15020000	-79.89520000	55	\N	\N	\N	2026-07-09 10:52:29	2026-07-09 10:52:29	\N	0101000020E610000045D8F0F44AF953C0A4DFBE0E9C3301C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
187	INC-2026-00187	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	6	24	3	1	Paseo Santos, 96, Ático 8º, 97637, Villa Maldonado del Mirador	-2.16220000	-79.89320000	54	\N	\N	\N	2026-07-14 15:52:29	2026-07-14 15:52:29	\N	0101000020E6100000613255302AF953C0234A7B832F4C01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
188	INC-2026-00188	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	7	\N	4	4	Ronda Valdivia, 3, 09º A, 15351, Os Chapa de la Sierra	-3.27210000	-79.94540000	54	19	\N	2026-06-25 22:52:29	2026-06-24 07:52:29	2026-06-25 22:52:29	\N	0101000020E6100000DC68006F81FC53C0CCEEC9C3422D0AC0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
189	INC-2026-00189	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	1	3	2	6	Avinguda Arias, 82, 56º 1º, 99194, Barrera del Mirador	-2.22520000	-79.89320000	53	10	\N	\N	2026-06-29 05:52:29	2026-06-29 08:52:29	\N	0101000020E6100000613255302AF953C03E7958A835CD01C0	482	\N	\N	\N	2026-06-29 08:52:29	\N	\N	\N	CLASSIFIED	\N	\N	\N
190	INC-2026-00190	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	6	22	2	1	Ruela Eva, 2, 0º C, 35759, Valles del Mirador	-2.93210000	-79.00790000	55	\N	\N	\N	2026-07-10 17:52:29	2026-07-10 17:52:29	\N	0101000020E6100000DC68006F81C053C014D044D8F07407C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
191	INC-2026-00191	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	3	13	1	6	Travessera María, 980, 5º C, 94862, A Abrego	-2.23520000	-79.88620000	54	9	\N	\N	2026-07-16 01:52:29	2026-07-16 07:52:29	\N	0101000020E6100000C66D3480B7F853C05227A089B0E101C0	482	\N	\N	\N	2026-07-16 07:52:29	\N	\N	\N	CLASSIFIED	\N	\N	\N
192	INC-2026-00192	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	3	10	2	6	Travesía Raúl, 8, 27º 2º, 22340, Villarreal de San Pedro	-3.28610000	-79.94540000	55	19	\N	\N	2026-06-25 12:52:29	2026-06-25 19:52:29	\N	0101000020E6100000DC68006F81FC53C0B515FBCBEE490AC0	331	\N	\N	\N	2026-06-25 19:52:29	\N	\N	\N	CLASSIFIED	\N	\N	\N
194	INC-2026-00194	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	5	18	3	1	Ronda Campos, 76, 5º F, 11488, San Abad de la Sierra	-2.94510000	-79.01190000	55	\N	\N	\N	2026-07-18 08:52:29	2026-07-18 08:52:29	\N	0101000020E6100000A2B437F8C2C053C0C898BB96908F07C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
195	INC-2026-00195	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	2	8	1	1	Camiño Aitor, 3, 83º C, 77216, Villaseñor de Ulla	-2.18220000	-79.92220000	54	\N	\N	\N	2026-07-13 01:52:29	2026-07-13 01:52:29	\N	0101000020E6100000C217265305FB53C04CA60A46257501C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
196	INC-2026-00196	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	7	\N	2	4	Travessera De la Fuente, 923, Ático 9º, 09075, As Lemus	-2.94010000	-79.01590000	53	30	\N	2026-07-22 18:52:29	2026-07-21 13:52:29	2026-07-22 18:52:29	\N	0101000020E610000069006F8104C153C0BEC11726538507C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
197	INC-2026-00197	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	1	4	4	1	Travessera Ocasio, 59, Bajo 1º, 35578, Botello del Mirador	-2.19920000	-79.84620000	53	\N	\N	\N	2026-07-19 21:52:29	2026-07-19 21:52:29	\N	0101000020E610000003780B2428F653C0D5E76A2BF69701C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
198	INC-2026-00198	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	5	18	3	1	Travesía Mejía, 773, 15º A, 72087, Puente del Mirador	-2.16720000	-79.87920000	53	\N	\N	\N	2026-07-19 16:52:29	2026-07-19 16:52:29	\N	0101000020E61000002AA913D044F853C02D211FF46C5601C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
199	INC-2026-00199	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	7	\N	2	5	Ruela Esther, 675, 92º 1º, 04389, L' Rodríquez del Puerto	-2.23920000	-79.89420000	54	11	\N	2026-07-12 18:52:29	2026-07-10 22:52:29	2026-07-12 18:52:29	\N	0101000020E61000005305A3923AF953C027A089B0E1E901C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
200	INC-2026-00200	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	3	11	4	1	Travesía Aguilar, 33, 9º F, 17759, Leiva de Arriba	-2.19720000	-79.87220000	53	\N	\N	\N	2026-07-09 22:52:29	2026-07-09 22:52:29	\N	0101000020E61000008FE4F21FD2F753C06B2BF697DD9301C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
201	INC-2026-00201	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	5	21	3	1	Ruela Serna, 888, 56º F, 14228, As De la Torre de San Pedro	-2.18520000	-79.84620000	53	\N	\N	\N	2026-06-24 23:52:29	2026-06-24 23:52:29	\N	0101000020E610000003780B2428F653C0ECC039234A7B01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
202	INC-2026-00202	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	7	\N	3	6	Avenida Magaña, 970, 24º F, 21852, San Balderas	-2.87810000	-79.04690000	54	27	\N	\N	2026-06-29 19:52:29	2026-06-29 20:52:29	\N	0101000020E6100000AC8BDB6800C353C0D8F0F44A590607C0	11	\N	\N	\N	2026-06-29 20:52:29	\N	\N	\N	CLASSIFIED	\N	\N	\N
203	INC-2026-00203	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	3	11	4	4	Carrer Peres, 95, 72º F, 17123, Ferrer Alta	-2.91510000	-79.02390000	54	28	\N	2026-07-03 11:52:29	2026-06-30 13:52:29	2026-07-03 11:52:29	\N	0101000020E6100000F697DD9387C153C08A8EE4F21F5207C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
204	INC-2026-00204	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	6	23	3	1	Rúa Castro, 44, 92º D, 67880, Arredondo del Bages	-2.14920000	-79.91720000	54	\N	\N	\N	2026-07-08 10:52:29	2026-07-08 10:52:29	\N	0101000020E610000009F9A067B3FA53C06F8104C58F3101C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
205	INC-2026-00205	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	6	23	1	1	Ronda Omar, 891, 25º B, 26549, O Vera del Vallès	-2.24620000	-79.93620000	54	\N	\N	2026-07-03 08:52:29	2026-06-30 09:52:29	2026-07-03 08:52:29	\N	0101000020E6100000F9A067B3EAFB53C09C33A2B437F801C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
9	INC-2026-00009	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	1	1	1	6	Calle Omar, 981, Ático 0º, 67898, Armendáriz Alta	-2.22620000	-79.90820000	55	9	\N	\N	2026-06-27 21:52:28	2026-06-28 16:52:28	\N	0101000020E61000008A8EE4F21FFA53C073D712F241CF01C0	482	\N	\N	\N	2026-06-28 16:52:28	\N	\N	\N	CLASSIFIED	\N	\N	\N
206	INC-2026-00206	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	6	22	1	4	Plaça Nicolás, 535, Bajo 6º, 34495, As Loya del Puerto	-2.94910000	-78.99590000	55	28	\N	2026-07-11 08:52:29	2026-07-08 10:52:29	2026-07-11 08:52:29	\N	0101000020E610000088855AD3BCBF53C09D11A5BDC19707C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
207	INC-2026-00207	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	6	24	4	1	Travesía Verdugo, 8, Bajo 1º, 20847, Bonilla de Arriba	-2.90210000	-78.99890000	54	\N	\N	\N	2026-07-12 08:52:29	2026-07-12 08:52:29	\N	0101000020E61000005DFE43FAEDBF53C0D6C56D34803707C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
208	INC-2026-00208	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	7	\N	1	2	Praza Víctor, 560, 7º D, 14341, As Orosco	-2.91310000	-79.01290000	54	27	\N	\N	2026-07-20 05:52:29	2026-07-20 05:52:29	\N	0101000020E61000009487855AD3C053C020D26F5F074E07C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
209	INC-2026-00209	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	6	23	4	5	Camiño Orosco, 359, 7º F, 91917, L' Briones del Penedès	-3.28110000	-79.95440000	55	17	\N	2026-07-05 00:52:29	2026-07-03 07:52:29	2026-07-05 00:52:29	\N	0101000020E61000005BD3BCE314FD53C0AB3E575BB13F0AC0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
210	INC-2026-00210	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	4	17	2	7	Passeig Rueda, 3, Bajo 9º, 43208, La Segovia	-2.87310000	-78.97490000	54	31	\N	\N	2026-06-29 13:52:29	2026-06-29 13:52:29	\N	0101000020E6100000B537F8C264BE53C0CE1951DA1BFC06C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
211	INC-2026-00211	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	3	12	4	4	Praza Mario, 43, 0º 1º, 98262, Los Pulido Baja	-2.94310000	-79.05090000	53	28	\N	2026-07-19 00:52:29	2026-07-18 21:52:29	2026-07-19 00:52:29	\N	0101000020E610000073D712F241C353C05DDC4603788B07C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
212	INC-2026-00212	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	5	18	1	1	Camiño Jan, 421, Entre suelo 6º, 76625, Guajardo del Penedès	-2.21220000	-79.86320000	53	\N	\N	\N	2026-07-05 13:52:29	2026-07-05 13:52:29	\N	0101000020E6100000107A36AB3EF753C08AB0E1E995B201C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
213	INC-2026-00213	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	1	2	3	5	Ruela Padrón, 52, Ático 4º, 99030, As Quintana del Vallès	-2.17020000	-79.83920000	54	9	\N	2026-07-15 17:52:29	2026-07-14 21:52:29	2026-07-15 17:52:29	\N	0101000020E610000068B3EA73B5F553C0CD3B4ED1915C01C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
214	INC-2026-00214	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	7	\N	1	2	Camino Arriaga, 1, Ático 1º, 89022, La Mondragón del Vallès	-3.29510000	-79.94240000	54	18	\N	\N	2026-07-04 12:52:29	2026-07-04 12:52:29	\N	0101000020E610000007F0164850FC53C0956588635D5C0AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
215	INC-2026-00215	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	2	7	2	5	Ruela Murillo, 46, 54º E, 19847, La Munguía de la Sierra	-2.91310000	-79.04090000	53	27	\N	2026-07-21 13:52:29	2026-07-19 07:52:29	2026-07-21 13:52:29	\N	0101000020E6100000029A081B9EC253C020D26F5F074E07C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
216	INC-2026-00216	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	3	12	2	6	Rúa Acuña, 694, 2º C, 49650, Vega de las Torres	-2.22020000	-79.85820000	54	9	\N	\N	2026-07-16 18:52:29	2026-07-17 00:52:29	\N	0101000020E6100000575BB1BFECF653C034A2B437F8C201C0	482	\N	\N	\N	2026-07-17 00:52:29	\N	\N	\N	CLASSIFIED	\N	\N	\N
217	INC-2026-00217	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	4	16	2	3	Camiño Saavedra, 43, 40º F, 58630, Os Alicea	-3.25510000	-79.98240000	53	19	\N	\N	2026-06-28 12:52:29	2026-06-28 12:52:29	\N	0101000020E6100000C9E53FA4DFFE53C043AD69DE710A0AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
218	INC-2026-00218	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	3	12	1	1	Camiño Cristian, 979, Bajo 5º, 73854, Villa Leal	-2.24120000	-79.90120000	54	\N	\N	\N	2026-07-04 17:52:29	2026-07-04 17:52:29	\N	0101000020E6100000EFC9C342ADF953C0925CFE43FAED01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
219	INC-2026-00219	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	2	8	3	6	Plaça Rafael, 566, 3º A, 11669, Vall Palomo	-2.18220000	-79.93320000	55	13	\N	\N	2026-07-07 23:52:29	2026-07-08 08:52:29	\N	0101000020E610000024287E8CB9FB53C04CA60A46257501C0	482	\N	\N	\N	2026-07-08 08:52:29	\N	\N	\N	CLASSIFIED	\N	\N	\N
220	INC-2026-00220	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	6	23	3	2	Travesía Paola, 542, 7º C, 55559, Rincón del Bages	-3.22710000	-79.99940000	54	16	\N	\N	2026-07-04 05:52:29	2026-07-04 05:52:29	\N	0101000020E6100000D5E76A2BF6FF53C0705F07CE19D109C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
221	INC-2026-00221	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	6	24	3	6	Avenida Cedillo, 159, 1º F, 17731, Varela del Puerto	-2.92710000	-78.96390000	53	31	\N	\N	2026-07-19 07:52:29	2026-07-19 17:52:29	\N	0101000020E61000005227A089B0BD53C009F9A067B36A07C0	11	\N	\N	\N	2026-07-19 17:52:29	\N	\N	\N	CLASSIFIED	\N	\N	\N
222	INC-2026-00222	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	1	3	2	2	Calle Santiago, 2, Ático 4º, 33843, Vigil del Puerto	-2.87710000	-79.00690000	54	29	\N	\N	2026-06-26 04:52:29	2026-06-26 04:52:29	\N	0101000020E6100000EA95B20C71C053C0A3923A014D0407C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
223	INC-2026-00223	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	1	5	1	6	Camiño Llorente, 5, 8º A, 45657, Uribe del Bages	-2.14620000	-79.88620000	53	11	\N	\N	2026-07-06 13:52:29	2026-07-06 14:52:29	\N	0101000020E6100000C66D3480B7F853C0CF66D5E76A2B01C0	482	\N	\N	\N	2026-07-06 14:52:29	\N	\N	\N	CLASSIFIED	\N	\N	\N
224	INC-2026-00224	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	5	20	1	1	Carrer Longoria, 5, Bajo 8º, 33156, L' Esteve de Ulla	-2.18420000	-79.89820000	55	\N	\N	2026-07-09 03:52:29	2026-07-07 12:52:29	2026-07-09 03:52:29	\N	0101000020E61000001A51DA1B7CF953C0B7627FD93D7901C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
225	INC-2026-00225	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	7	\N	1	1	Avenida Diego, 96, Bajo 4º, 66790, A Sarabia de la Sierra	-3.27210000	-79.98640000	55	\N	\N	2026-07-18 00:52:29	2026-07-15 16:52:29	2026-07-18 00:52:29	\N	0101000020E61000009031772D21FF53C0CCEEC9C3422D0AC0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
226	INC-2026-00226	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	3	11	2	1	Ronda Oliver, 39, 4º C, 75250, Granados del Mirador	-2.19920000	-79.91720000	54	\N	\N	\N	2026-07-06 04:52:29	2026-07-06 04:52:29	\N	0101000020E610000009F9A067B3FA53C0D5E76A2BF69701C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
10	INC-2026-00010	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	3	10	1	3	Camiño Gabriela, 96, 03º 1º, 73676, Sanabria del Penedès	-3.29110000	-79.91740000	53	15	\N	\N	2026-07-10 10:52:28	2026-07-10 10:52:28	\N	0101000020E61000006D567DAEB6FA53C0C0EC9E3C2C540AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
227	INC-2026-00227	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	1	4	1	1	Plaça Vila, 2, 5º B, 11607, Barragán del Penedès	-2.20320000	-79.92220000	54	\N	\N	\N	2026-06-26 08:52:29	2026-06-26 08:52:29	\N	0101000020E6100000C217265305FB53C0AA60545227A001C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
228	INC-2026-00228	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	3	13	1	5	Ruela Yago, 31, 4º C, 18795, El Longoria del Penedès	-3.22810000	-79.95440000	54	15	\N	2026-07-11 21:52:29	2026-07-11 06:52:29	2026-07-11 21:52:29	\N	0101000020E61000005BD3BCE314FD53C0A5BDC11726D309C0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
229	INC-2026-00229	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	5	18	3	1	Calle Ballesteros, 567, 2º F, 68005, Vall Aguado del Vallès	-2.18220000	-79.88920000	55	\N	\N	\N	2026-07-09 12:52:29	2026-07-09 12:52:29	\N	0101000020E61000009BE61DA7E8F853C04CA60A46257501C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
230	INC-2026-00230	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	5	18	4	1	Plaza Diana, 5, 39º B, 66694, Suárez del Pozo	-2.20220000	-79.84120000	54	\N	\N	\N	2026-07-09 06:52:29	2026-07-09 06:52:29	\N	0101000020E61000004B598638D6F553C075029A081B9E01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
231	INC-2026-00231	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	2	7	1	1	Praza Bustos, 70, 2º, 34504, L' Galindo	-2.15820000	-79.91120000	55	\N	\N	\N	2026-07-21 17:52:29	2026-07-21 17:52:29	\N	0101000020E61000005F07CE1951FA53C04ED1915CFE4301C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
232	INC-2026-00232	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	7	\N	4	5	Passeig Alejandro, 5, 2º C, 85429, As Zambrano	-3.30810000	-79.96940000	55	19	\N	2026-07-08 09:52:29	2026-07-07 09:52:29	2026-07-08 09:52:29	\N	0101000020E6100000832F4CA60AFE53C0492EFF21FD760AC0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
233	INC-2026-00233	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	6	24	2	5	Travesía Gabriel, 203, Bajo 4º, 49655, As Alonso del Bages	-2.24220000	-79.93520000	53	11	\N	2026-07-05 12:52:29	2026-07-04 21:52:29	2026-07-05 12:52:29	\N	0101000020E610000007CE1951DAFB53C0C7BAB88D06F001C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
234	INC-2026-00234	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	5	20	2	1	Plaça Calderón, 6, Bajo 3º, 39407, As Solorzano del Bages	-2.22320000	-79.85620000	53	\N	\N	\N	2026-06-24 07:52:29	2026-06-24 07:52:29	\N	0101000020E610000074B515FBCBF653C0D3BCE3141DC901C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
235	INC-2026-00235	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	7	\N	2	7	Avenida Javier, 9, 6º, 42777, Holguín Medio	-3.21510000	-80.00340000	55	15	\N	\N	2026-07-20 07:52:29	2026-07-20 07:52:29	\N	0101000020E61000009C33A2B4370054C0F1F44A5986B809C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
236	INC-2026-00236	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	7	\N	2	2	Camiño Rubén, 984, Entre suelo 0º, 61781, Vega del Mirador	-2.89810000	-79.02990000	54	31	\N	\N	2026-07-13 10:52:29	2026-07-13 10:52:29	\N	0101000020E6100000A089B0E1E9C153C0014D840D4F2F07C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
237	INC-2026-00237	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	2	7	3	1	Travessera Del Río, 362, 45º D, 28489, Los Luevano	-3.21110000	-79.99540000	55	\N	\N	\N	2026-07-21 09:52:29	2026-07-21 09:52:29	\N	0101000020E61000000F9C33A2B4FF53C01C7C613255B009C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
238	INC-2026-00238	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	7	\N	2	1	Avenida Amador, 2, 9º B, 98044, San Casárez	-2.20420000	-79.84020000	54	\N	\N	\N	2026-07-12 12:52:29	2026-07-12 12:52:29	\N	0101000020E6100000598638D6C5F553C0E0BE0E9C33A201C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
239	INC-2026-00239	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	5	18	2	6	Camino Hinojosa, 82, 0º, 03174, San Bahena del Puerto	-2.88110000	-78.96090000	54	29	\N	\N	2026-07-02 21:52:29	2026-07-03 10:52:29	\N	0101000020E61000007DAEB6627FBD53C0780B24287E0C07C0	11	\N	\N	\N	2026-07-03 10:52:29	\N	\N	\N	CLASSIFIED	\N	\N	\N
240	INC-2026-00240	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	7	\N	4	7	Avenida Aitor, 50, 6º D, 33087, Los Pedraza Alta	-3.26210000	-79.90940000	54	18	\N	\N	2026-07-23 14:52:30	2026-07-23 14:52:30	\N	0101000020E6100000E0BE0E9C33FA53C0B84082E2C7180AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
241	INC-2026-00241	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	2	9	2	1	Passeig Fajardo, 77, 07º A, 99292, Os Esquibel	-2.15920000	-79.90220000	54	\N	\N	\N	2026-07-16 21:52:30	2026-07-16 21:52:30	\N	0101000020E6100000E09C11A5BDF953C0832F4CA60A4601C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
242	INC-2026-00242	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	6	23	1	6	Camino Carrasco, 221, 0º D, 45349, Márquez del Penedès	-2.22820000	-79.91720000	55	11	\N	\N	2026-07-16 05:52:30	2026-07-17 05:52:30	\N	0101000020E610000009F9A067B3FA53C0DE9387855AD301C0	482	\N	\N	\N	2026-07-17 05:52:30	\N	\N	\N	CLASSIFIED	\N	\N	\N
243	INC-2026-00243	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	4	15	3	2	Avinguda Valladares, 667, 7º, 95079, Villa Peres de las Torres	-2.86810000	-79.00490000	53	30	\N	\N	2026-07-18 18:52:30	2026-07-18 18:52:30	\N	0101000020E610000007F0164850C053C0C442AD69DEF106C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
244	INC-2026-00244	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	7	\N	2	1	Ruela Marcos, 741, 8º E, 97050, Laureano de las Torres	-2.90110000	-79.02590000	54	\N	\N	\N	2026-07-05 17:52:30	2026-07-05 17:52:30	\N	0101000020E6100000D93D7958A8C153C0A167B3EA733507C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
245	INC-2026-00245	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	2	9	3	1	Plaza Izquierdo, 43, 6º D, 46305, Las Lomeli de la Sierra	-2.16120000	-79.89820000	53	\N	\N	\N	2026-07-11 01:52:30	2026-07-11 01:52:30	\N	0101000020E61000001A51DA1B7CF953C0EEEBC039234A01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
246	INC-2026-00246	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	4	14	2	1	Praza Carolina, 509, 27º D, 02201, San Madrid de la Sierra	-2.21520000	-79.91220000	54	\N	\N	\N	2026-07-02 11:52:30	2026-07-02 11:52:30	\N	0101000020E610000051DA1B7C61FA53C029CB10C7BAB801C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
247	INC-2026-00247	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	1	2	3	5	Ruela Peláez, 81, Bajo 0º, 51047, Luna de la Sierra	-2.18420000	-79.84220000	55	11	\N	2026-07-23 00:52:30	2026-07-20 10:52:30	2026-07-23 00:52:30	\N	0101000020E61000003D2CD49AE6F553C0B7627FD93D7901C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
11	INC-2026-00011	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	3	10	2	3	Praza Jesús, 121, 1º C, 99915, Villa Ornelas	-2.93010000	-79.01490000	53	31	\N	\N	2026-06-26 11:52:28	2026-06-26 11:52:28	\N	0101000020E6100000772D211FF4C053C0A913D044D87007C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
193	INC-2026-00193	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	4	17	3	1	Passeig Macias, 2, 43º A, 90700, Las Aguayo	-2.17520000	-79.91020000	53	\N	\N	\N	2026-07-05 10:52:29	2026-07-05 10:52:29	\N	0101000020E61000006E3480B740FA53C0D712F241CF6601C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
248	INC-2026-00248	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	3	13	4	1	Avenida Ortíz, 8, 31º C, 08655, Olvera de la Sierra	-2.18520000	-79.88420000	53	\N	\N	\N	2026-06-28 18:52:30	2026-06-28 18:52:30	\N	0101000020E6100000E3C798BB96F853C0ECC039234A7B01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
249	INC-2026-00249	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	2	9	4	1	Plaza Vera, 9, Entre suelo 2º, 37953, San Montañez del Barco	-2.15520000	-79.86520000	55	\N	\N	2026-07-11 19:52:30	2026-07-11 03:52:30	2026-07-11 19:52:30	\N	0101000020E6100000F31FD26F5FF753C0AEB6627FD93D01C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
250	INC-2026-00250	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	6	24	1	1	Rúa César, 21, 51º E, 99762, Montañez del Vallès	-3.30110000	-79.98940000	53	\N	\N	\N	2026-07-16 07:52:30	2026-07-16 07:52:30	\N	0101000020E610000065AA605452FF53C0D49AE61DA7680AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
251	INC-2026-00251	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	5	18	3	1	Rúa Aurora, 8, 0º D, 69505, El Vallejo	-2.94210000	-79.02390000	55	\N	\N	\N	2026-07-13 04:52:30	2026-07-13 04:52:30	\N	0101000020E6100000F697DD9387C153C0287E8CB96B8907C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
252	INC-2026-00252	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	5	20	1	6	Rúa Santillán, 21, 01º B, 48022, Vall Alonso Baja	-2.15920000	-79.88620000	53	13	\N	\N	2026-07-03 12:52:30	2026-07-04 06:52:30	\N	0101000020E6100000C66D3480B7F853C0832F4CA60A4601C0	482	\N	\N	\N	2026-07-04 06:52:30	\N	\N	\N	CLASSIFIED	\N	\N	\N
253	INC-2026-00253	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	3	10	1	5	Rúa Pedro, 2, 43º A, 05076, Olivares de Ulla	-2.94410000	-79.04490000	54	31	\N	2026-07-24 15:52:30	2026-07-23 22:52:30	2026-07-24 15:52:30	\N	0101000020E6100000C9E53FA4DFC253C0933A014D848D07C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
254	INC-2026-00254	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	3	10	3	2	Plaza Santamaría, 4, Bajos, 86663, Las González	-3.25310000	-79.97140000	53	16	\N	\N	2026-07-14 12:52:30	2026-07-14 12:52:30	\N	0101000020E610000067D5E76A2BFE53C0D8F0F44A59060AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
255	INC-2026-00255	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	4	17	2	1	Carrer Aaron, 4, 4º, 02565, Vall De Jesús Medio	-2.24320000	-79.87120000	55	\N	\N	2026-07-09 06:52:30	2026-07-06 19:52:30	2026-07-09 06:52:30	\N	0101000020E61000009D11A5BDC1F753C0FC1873D712F201C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
256	INC-2026-00256	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	1	4	1	1	Ruela Victoria, 437, 06º B, 91484, L' Carrasquillo del Vallès	-3.26210000	-79.95840000	53	\N	\N	\N	2026-06-27 19:52:30	2026-06-27 19:52:30	\N	0101000020E6100000211FF46C56FD53C0B84082E2C7180AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
257	INC-2026-00257	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	2	6	1	6	Avinguda Uribe, 998, 9º F, 79338, El Frías de la Sierra	-2.18120000	-79.87820000	55	11	\N	\N	2026-07-20 19:52:30	2026-07-21 16:52:30	\N	0101000020E610000039D6C56D34F853C0174850FC187301C0	482	\N	\N	\N	2026-07-21 16:52:30	\N	\N	\N	CLASSIFIED	\N	\N	\N
258	INC-2026-00258	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	7	\N	2	5	Camino Carlos, 84, 7º F, 21107, L' Carballo	-3.24410000	-79.91640000	55	18	\N	2026-06-28 08:52:30	2026-06-27 11:52:30	2026-06-28 08:52:30	\N	0101000020E61000007B832F4CA6FA53C0F9A067B3EAF309C0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
259	INC-2026-00259	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	2	9	3	7	Plaça Millán, 5, 78º D, 12779, O Posada	-2.86710000	-79.05390000	55	29	\N	\N	2026-07-15 23:52:30	2026-07-15 23:52:30	\N	0101000020E61000004850FC1873C353C08FE4F21FD2EF06C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
260	INC-2026-00260	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	7	\N	4	1	Avinguda Macías, 5, 40º A, 33646, A Carrasquillo	-2.92210000	-78.98990000	55	\N	\N	\N	2026-06-24 09:52:30	2026-06-24 09:52:30	\N	0101000020E6100000DE9387855ABF53C0FF21FDF6756007C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
261	INC-2026-00261	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	2	6	3	6	Rúa Pedro, 16, Bajos, 89492, Villa Valdivia	-2.16720000	-79.84520000	53	11	\N	\N	2026-07-18 11:52:30	2026-07-19 03:52:30	\N	0101000020E610000012A5BDC117F653C02D211FF46C5601C0	482	\N	\N	\N	2026-07-19 03:52:30	\N	\N	\N	CLASSIFIED	\N	\N	\N
262	INC-2026-00262	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	7	\N	4	1	Ruela Aitor, 9, 6º B, 03187, As Vela del Barco	-2.21720000	-79.91720000	53	\N	\N	\N	2026-07-24 01:52:30	2026-07-24 01:52:30	\N	0101000020E610000009F9A067B3FA53C09487855AD3BC01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
263	INC-2026-00263	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	1	2	2	1	Travessera De Jesús, 689, 7º, 18445, La Ruvalcaba del Mirador	-2.94410000	-79.05590000	54	\N	\N	2026-07-01 18:52:30	2026-07-01 11:52:30	2026-07-01 18:52:30	\N	0101000020E61000002BF697DD93C353C0933A014D848D07C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
264	INC-2026-00264	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	5	21	2	1	Passeig Fierro, 89, Entre suelo 2º, 96037, Otero de Arriba	-2.22420000	-79.90120000	55	\N	\N	\N	2026-06-29 10:52:30	2026-06-29 10:52:30	\N	0101000020E6100000EFC9C342ADF953C0091B9E5E29CB01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
265	INC-2026-00265	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	2	7	2	1	Ronda Jiménez, 33, 50º F, 70356, A Casado de las Torres	-3.27610000	-79.93740000	54	\N	\N	\N	2026-06-30 23:52:30	2026-06-30 23:52:30	\N	0101000020E61000004ED1915CFEFB53C0A167B3EA73350AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
266	INC-2026-00266	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	3	10	3	6	Ruela Adrián, 917, 3º D, 71177, Serra del Penedès	-2.22620000	-79.88720000	54	13	\N	\N	2026-07-09 08:52:30	2026-07-09 11:52:30	\N	0101000020E6100000B84082E2C7F853C073D712F241CF01C0	482	\N	\N	\N	2026-07-09 11:52:30	\N	\N	\N	CLASSIFIED	\N	\N	\N
12	INC-2026-00012	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	7	\N	1	2	Ruela Herrera, 869, 46º B, 09722, L' Ballesteros	-2.20720000	-79.93220000	53	10	\N	\N	2026-07-12 08:52:28	2026-07-12 08:52:28	\N	0101000020E61000003255302AA9FB53C07FD93D7958A801C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
267	INC-2026-00267	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	4	17	3	5	Plaza Hinojosa, 337, 8º F, 66141, Las Tamayo de Lemos	-2.89410000	-78.98190000	55	30	\N	2026-07-26 01:52:30	2026-07-23 09:52:30	2026-07-26 01:52:30	\N	0101000020E610000050FC1873D7BE53C02CD49AE61D2707C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
268	INC-2026-00268	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	5	18	3	1	Praza Celia, 973, 15º 9º, 45933, A Frías	-2.88010000	-78.95890000	55	\N	\N	\N	2026-06-25 05:52:30	2026-06-25 05:52:30	\N	0101000020E61000009A081B9E5EBD53C043AD69DE710A07C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
269	INC-2026-00269	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	3	12	3	1	Ruela Archuleta, 56, Bajo 9º, 37459, El Lira	-2.90010000	-78.99690000	54	\N	\N	\N	2026-07-09 09:52:30	2026-07-09 09:52:30	\N	0101000020E61000007958A835CDBF53C06C09F9A0673307C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
270	INC-2026-00270	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	6	23	2	1	Carrer Almanza, 981, 10º A, 78750, A Guardado del Barco	-2.24420000	-79.90120000	55	\N	\N	2026-07-19 12:52:30	2026-07-19 01:52:30	2026-07-19 12:52:30	\N	0101000020E6100000EFC9C342ADF953C032772D211FF401C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
271	INC-2026-00271	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	4	16	4	1	Calle Ismael, 9, 34º A, 32440, Rodríquez del Puerto	-3.29410000	-79.96340000	54	\N	\N	\N	2026-07-23 15:52:30	2026-07-23 15:52:30	\N	0101000020E6100000D93D7958A8FD53C05F07CE19515A0AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
272	INC-2026-00272	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	5	21	3	6	Travesía Alvarado, 7, 3º, 97764, Alcántar Alta	-2.22320000	-79.84220000	53	10	\N	\N	2026-06-24 11:52:30	2026-06-25 10:52:30	\N	0101000020E61000003D2CD49AE6F553C0D3BCE3141DC901C0	482	\N	\N	\N	2026-06-25 10:52:30	\N	\N	\N	CLASSIFIED	\N	\N	\N
273	INC-2026-00273	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	6	24	2	1	Travesía Mota, 7, 60º C, 92177, Villa Abrego del Puerto	-2.20120000	-79.91920000	55	\N	\N	2026-07-11 07:52:30	2026-07-08 23:52:30	2026-07-11 07:52:30	\N	0101000020E6100000ED9E3C2CD4FA53C040A4DFBE0E9C01C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
274	INC-2026-00274	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	4	15	3	3	Calle Yago, 42, 3º B, 99995, Ornelas del Barco	-3.27010000	-79.90840000	53	17	\N	\N	2026-06-28 09:52:30	2026-06-28 09:52:30	\N	0101000020E6100000EEEBC03923FA53C0613255302A290AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
469	INC-2026-00469	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	7	\N	2	6	Rúa Mar, 98, 5º B, 25511, O Loya	-3.24610000	-79.99240000	55	18	\N	\N	2026-06-23 10:52:32	2026-06-23 18:52:32	\N	0101000020E61000003A234A7B83FF53C0645DDC4603F809C0	331	\N	\N	\N	2026-06-23 18:52:32	\N	\N	\N	CLASSIFIED	\N	\N	\N
275	INC-2026-00275	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	4	17	3	1	Ronda Pantoja, 7, 22º B, 95836, Cabrera de las Torres	-3.27210000	-80.00040000	55	\N	\N	\N	2026-07-15 07:52:30	2026-07-15 07:52:30	\N	0101000020E6100000C7BAB88D060054C0CCEEC9C3422D0AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
276	INC-2026-00276	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	3	12	1	1	Travessera Vicente, 49, 16º A, 83769, Os Villa	-2.22920000	-79.84020000	54	\N	\N	\N	2026-07-07 08:52:30	2026-07-07 08:52:30	\N	0101000020E6100000598638D6C5F553C013F241CF66D501C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
277	INC-2026-00277	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	3	11	1	1	Avenida Yolanda, 60, 75º 2º, 77451, Palacios Alta	-3.28210000	-79.95440000	53	\N	\N	\N	2026-06-27 00:52:30	2026-06-27 00:52:30	\N	0101000020E61000005BD3BCE314FD53C0E09C11A5BD410AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
278	INC-2026-00278	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	4	16	3	1	Ronda Gastélum, 19, 9º 9º, 74448, Los Delgado de Lemos	-2.24020000	-79.86320000	54	\N	\N	\N	2026-07-12 22:52:30	2026-07-12 22:52:30	\N	0101000020E6100000107A36AB3EF753C05DFE43FAEDEB01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
279	INC-2026-00279	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	5	20	2	1	Avinguda De Anda, 22, 4º E, 74252, Os Méndez de las Torres	-2.92310000	-78.97390000	53	\N	\N	\N	2026-07-09 07:52:30	2026-07-09 07:52:30	\N	0101000020E6100000C364AA6054BE53C03480B740826207C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
280	INC-2026-00280	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	6	22	2	6	Travesía Alanis, 375, 6º C, 83206, Saucedo de San Pedro	-3.22210000	-79.96040000	53	17	\N	\N	2026-07-23 08:52:30	2026-07-23 20:52:30	\N	0101000020E610000005C58F3177FD53C06688635DDCC609C0	331	\N	\N	\N	2026-07-23 20:52:30	\N	\N	\N	CLASSIFIED	\N	\N	\N
281	INC-2026-00281	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	7	\N	3	1	Camiño Elena, 49, Entre suelo 5º, 36782, Morán de las Torres	-2.22720000	-79.86920000	55	\N	\N	\N	2026-07-15 03:52:30	2026-07-15 03:52:30	\N	0101000020E6100000BA6B09F9A0F753C0A835CD3B4ED101C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
282	INC-2026-00282	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	7	\N	4	4	Plaza Villaseñor, 32, Bajo 2º, 27078, L' Sotelo	-3.22710000	-79.96840000	55	16	\N	2026-07-02 03:52:30	2026-07-01 15:52:30	2026-07-02 03:52:30	\N	0101000020E6100000925CFE43FAFD53C0705F07CE19D109C0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
283	INC-2026-00283	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	1	5	3	5	Plaza Bruno, 7, Entre suelo 7º, 84255, Los Chavarría Baja	-2.19320000	-79.91820000	55	10	\N	2026-07-08 07:52:30	2026-07-05 11:52:30	2026-07-08 07:52:30	\N	0101000020E6100000FBCBEEC9C3FA53C096B20C71AC8B01C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
284	INC-2026-00284	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	1	2	3	1	Plaça Caldera, 7, 3º A, 69832, El Valdés de Lemos	-3.27410000	-80.00340000	53	\N	\N	\N	2026-07-20 07:52:30	2026-07-20 07:52:30	\N	0101000020E61000009C33A2B4370054C036AB3E575B310AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
286	INC-2026-00286	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	7	\N	3	1	Camino Más, 46, Entre suelo 6º, 50909, Aponte Alta	-2.88910000	-78.96390000	55	\N	\N	\N	2026-07-04 11:52:30	2026-07-04 11:52:30	\N	0101000020E61000005227A089B0BD53C022FDF675E01C07C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
287	INC-2026-00287	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	7	\N	2	1	Rúa Castaño, 37, 0º, 11259, Los Zambrano	-2.86710000	-78.96090000	55	\N	\N	\N	2026-07-10 23:52:30	2026-07-10 23:52:30	\N	0101000020E61000007DAEB6627FBD53C08FE4F21FD2EF06C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
13	INC-2026-00013	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	6	22	2	6	Avenida Paola, 28, 8º E, 31966, El Bueno	-3.24910000	-79.96640000	53	15	\N	\N	2026-07-12 16:52:28	2026-07-13 13:52:28	\N	0101000020E6100000AEB6627FD9FD53C003780B2428FE09C0	331	\N	\N	\N	2026-07-13 13:52:28	\N	\N	\N	CLASSIFIED	\N	\N	\N
288	INC-2026-00288	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	1	1	3	1	Camiño Jaime, 8, 07º 2º, 04418, A Robledo	-2.87910000	-78.99490000	53	\N	\N	\N	2026-07-04 12:52:30	2026-07-04 12:52:30	\N	0101000020E610000096B20C71ACBF53C00E4FAF94650807C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
289	INC-2026-00289	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	6	24	3	1	Travesía Yeray, 6, 5º E, 85201, Las Quintanilla	-2.89810000	-78.99290000	54	\N	\N	\N	2026-07-21 03:52:30	2026-07-21 03:52:30	\N	0101000020E6100000B30C71AC8BBF53C0014D840D4F2F07C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
290	INC-2026-00290	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	2	6	3	1	Camiño Acuña, 3, 35º F, 90650, Cantú del Puerto	-2.21020000	-79.91520000	54	\N	\N	\N	2026-07-05 17:52:30	2026-07-05 17:52:30	\N	0101000020E6100000265305A392FA53C01FF46C567DAE01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
291	INC-2026-00291	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	3	12	3	1	Travessera Valladares, 634, 2º B, 40321, El Velázquez	-2.19620000	-79.86920000	53	\N	\N	\N	2026-07-13 08:52:30	2026-07-13 08:52:30	\N	0101000020E6100000BA6B09F9A0F753C036CD3B4ED19101C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
292	INC-2026-00292	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	6	23	4	5	Camiño Samuel, 278, 7º 5º, 62090, A Delafuente Medio	-2.18820000	-79.93520000	55	11	\N	2026-07-08 14:52:30	2026-07-08 01:52:30	2026-07-08 14:52:30	\N	0101000020E610000007CE1951DAFB53C08CDB68006F8101C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
293	INC-2026-00293	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	6	23	1	5	Avenida Serna, 11, Bajo 1º, 07922, Villa Manzano	-2.86310000	-79.00290000	53	30	\N	2026-07-23 22:52:30	2026-07-21 04:52:30	2026-07-23 22:52:30	\N	0101000020E6100000234A7B832FC053C0BA6B09F9A0E706C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
294	INC-2026-00294	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	5	20	4	2	Avenida Ainara, 119, 3º F, 69541, Iglesias de Ulla	-2.87910000	-78.97590000	55	30	\N	\N	2026-06-26 17:52:30	2026-06-26 17:52:30	\N	0101000020E6100000A60A462575BE53C00E4FAF94650807C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
295	INC-2026-00295	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	4	17	4	1	Avinguda Ana, 5, 5º D, 22156, L' Vélez	-2.16420000	-79.85920000	55	\N	\N	\N	2026-07-03 05:52:30	2026-07-03 05:52:30	\N	0101000020E6100000492EFF21FDF653C08E06F016485001C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
296	INC-2026-00296	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	7	\N	3	1	Passeig Margarita, 1, 10º B, 84285, El Jaime del Barco	-2.87510000	-79.03390000	54	\N	\N	2026-07-11 08:52:30	2026-07-08 19:52:30	2026-07-11 08:52:30	\N	0101000020E610000067D5E76A2BC253C039D6C56D340007C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
297	INC-2026-00297	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	4	16	2	1	Travessera Marta, 75, Bajo 9º, 94074, Granados del Vallès	-2.22320000	-79.87520000	53	\N	\N	\N	2026-07-17 23:52:30	2026-07-17 23:52:30	\N	0101000020E6100000645DDC4603F853C0D3BCE3141DC901C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
298	INC-2026-00298	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	7	\N	4	6	Passeig Montoya, 325, 5º D, 71436, O Verduzco del Bages	-2.86710000	-79.03690000	55	30	\N	\N	2026-07-16 01:52:30	2026-07-16 18:52:30	\N	0101000020E61000003C4ED1915CC253C08FE4F21FD2EF06C0	11	\N	\N	\N	2026-07-16 18:52:30	\N	\N	\N	CLASSIFIED	\N	\N	\N
299	INC-2026-00299	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	3	12	2	1	Plaça Luisa, 2, 41º C, 01553, As Cortés del Bages	-2.22920000	-79.90720000	53	\N	\N	\N	2026-06-30 03:52:30	2026-06-30 03:52:30	\N	0101000020E610000099BB96900FFA53C013F241CF66D501C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
300	INC-2026-00300	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	6	24	4	1	Travessera Ontiveros, 7, 1º 0º, 39736, Valero de San Pedro	-2.89010000	-79.02890000	53	\N	\N	\N	2026-07-12 19:52:30	2026-07-12 19:52:30	\N	0101000020E6100000AEB6627FD9C153C0575BB1BFEC1E07C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
301	INC-2026-00301	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	1	2	2	1	Camino Silvia, 728, 95º F, 57358, Vall Castellanos	-3.28310000	-79.99640000	54	\N	\N	\N	2026-07-16 10:52:30	2026-07-16 10:52:30	\N	0101000020E6100000006F8104C5FF53C016FBCBEEC9430AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
302	INC-2026-00302	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	7	\N	1	5	Travesía Alonso, 75, 75º A, 02978, As Padilla Baja	-2.23520000	-79.88020000	55	11	\N	2026-06-25 09:52:30	2026-06-25 04:52:30	2026-06-25 09:52:30	\N	0101000020E61000001C7C613255F853C05227A089B0E101C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
303	INC-2026-00303	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	6	23	4	1	Paseo Miguel, 2, 1º, 61627, Quiñones del Pozo	-3.27110000	-79.95840000	53	\N	\N	\N	2026-06-30 01:52:30	2026-06-30 01:52:30	\N	0101000020E6100000211FF46C56FD53C097900F7A362B0AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
304	INC-2026-00304	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	4	15	4	6	Avenida Herrera, 2, Ático 8º, 77700, O Guerrero del Puerto	-3.25310000	-79.98040000	53	17	\N	\N	2026-07-18 06:52:30	2026-07-18 15:52:30	\N	0101000020E6100000E63FA4DFBEFE53C0D8F0F44A59060AC0	331	\N	\N	\N	2026-07-18 15:52:30	\N	\N	\N	CLASSIFIED	\N	\N	\N
305	INC-2026-00305	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	6	22	4	5	Ronda Nicolás, 9, 0º E, 74890, L' Espinosa del Bages	-2.24620000	-79.89920000	54	10	\N	2026-07-25 20:52:30	2026-07-23 14:52:30	2026-07-25 20:52:30	\N	0101000020E61000000B24287E8CF953C09C33A2B437F801C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
306	INC-2026-00306	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	3	13	4	1	Travessera Victoria, 97, Entre suelo 4º, 65589, Galarza de San Pedro	-2.16920000	-79.84620000	53	\N	\N	\N	2026-07-22 14:52:30	2026-07-22 14:52:30	\N	0101000020E610000003780B2428F653C098DD9387855A01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
307	INC-2026-00307	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	2	7	2	6	Plaça Rodríguez, 3, Bajo 8º, 09869, Alcala de Arriba	-3.30010000	-79.99440000	55	15	\N	\N	2026-07-23 18:52:30	2026-07-24 16:52:30	\N	0101000020E61000001DC9E53FA4FF53C09F3C2CD49A660AC0	331	\N	\N	\N	2026-07-24 16:52:30	\N	\N	\N	CLASSIFIED	\N	\N	\N
308	INC-2026-00308	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	4	15	2	1	Carrer Medrano, 50, Entre suelo 3º, 40564, As Posada	-2.23320000	-79.89320000	53	\N	\N	\N	2026-07-13 04:52:30	2026-07-13 04:52:30	\N	0101000020E6100000613255302AF953C0E86A2BF697DD01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
14	INC-2026-00014	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	1	2	2	1	Calle Miguel, 628, 9º E, 98669, A Marco	-2.22520000	-79.92720000	54	\N	\N	\N	2026-06-26 03:52:28	2026-06-26 03:52:28	\N	0101000020E61000007A36AB3E57FB53C03E7958A835CD01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
309	INC-2026-00309	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	2	9	1	6	Paseo Esther, 33, 50º D, 30002, Viera del Barco	-2.86410000	-79.02490000	53	31	\N	\N	2026-06-27 19:52:30	2026-06-28 15:52:30	\N	0101000020E6100000E86A2BF697C153C0EFC9C342ADE906C0	11	\N	\N	\N	2026-06-28 15:52:30	\N	\N	\N	CLASSIFIED	\N	\N	\N
310	INC-2026-00310	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	7	\N	4	1	Ruela Gaitán, 3, 50º D, 10320, L' Casares	-2.24320000	-79.87320000	54	\N	\N	\N	2026-07-10 17:52:30	2026-07-10 17:52:30	\N	0101000020E610000080B74082E2F753C0FC1873D712F201C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
311	INC-2026-00311	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	6	22	1	5	Carrer Luis, 4, Entre suelo 1º, 85093, L' Gaitán	-2.22820000	-79.93620000	53	9	\N	2026-07-03 08:52:30	2026-06-30 08:52:30	2026-07-03 08:52:30	\N	0101000020E6100000F9A067B3EAFB53C0DE9387855AD301C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
312	INC-2026-00312	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	2	6	3	1	Paseo Rosa, 97, Bajo 8º, 47779, Valero del Penedès	-2.16420000	-79.91520000	55	\N	\N	\N	2026-07-16 22:52:30	2026-07-16 22:52:30	\N	0101000020E6100000265305A392FA53C08E06F016485001C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
313	INC-2026-00313	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	5	19	4	6	Ronda Mojica, 8, 93º C, 84414, Duran del Bages	-2.95010000	-79.02190000	53	28	\N	\N	2026-06-29 14:52:30	2026-06-30 04:52:30	\N	0101000020E610000013F241CF66C153C0D26F5F07CE9907C0	11	\N	\N	\N	2026-06-30 04:52:30	\N	\N	\N	CLASSIFIED	\N	\N	\N
314	INC-2026-00314	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	3	10	4	5	Camino África, 884, 9º 0º, 78975, Romero del Vallès	-2.15320000	-79.91820000	53	12	\N	2026-06-30 20:52:30	2026-06-28 17:52:30	2026-06-30 20:52:30	\N	0101000020E6100000FBCBEEC9C3FA53C044FAEDEBC03901C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
315	INC-2026-00315	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	4	15	3	1	Ronda Castaño, 862, 7º C, 33813, Blázquez del Mirador	-2.18720000	-79.88120000	53	\N	\N	\N	2026-07-02 10:52:30	2026-07-02 10:52:30	\N	0101000020E61000000E4FAF9465F853C0567DAEB6627F01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
316	INC-2026-00316	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	3	11	3	1	Travesía Verónica, 37, 4º F, 22110, Zaragoza Medio	-2.19020000	-79.86820000	55	\N	\N	\N	2026-06-26 21:52:30	2026-06-26 21:52:30	\N	0101000020E6100000C898BB9690F753C0F697DD93878501C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
317	INC-2026-00317	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	5	20	4	1	Calle Mar, 585, 6º A, 42856, O Soto del Pozo	-2.21120000	-79.92520000	54	\N	\N	\N	2026-06-30 01:52:30	2026-06-30 01:52:30	\N	0101000020E610000097900F7A36FB53C0545227A089B001C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
318	INC-2026-00318	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	2	9	4	1	Camiño Marc, 8, 9º D, 43370, Los Aguirre	-2.23720000	-79.88420000	54	\N	\N	\N	2026-06-27 12:52:30	2026-06-27 12:52:30	\N	0101000020E6100000E3C798BB96F853C0BDE3141DC9E501C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
319	INC-2026-00319	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	2	9	3	6	Passeig Nuria, 799, 6º E, 82281, El Beltrán del Bages	-2.20320000	-79.83620000	55	11	\N	\N	2026-07-20 21:52:30	2026-07-21 00:52:30	\N	0101000020E6100000933A014D84F553C0AA60545227A001C0	482	\N	\N	\N	2026-07-21 00:52:30	\N	\N	\N	CLASSIFIED	\N	\N	\N
320	INC-2026-00320	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	3	10	3	5	Ronda Jiménez, 820, 35º 7º, 54265, Granado del Penedès	-2.91210000	-79.00790000	53	30	\N	2026-06-29 01:52:30	2026-06-26 12:52:30	2026-06-29 01:52:30	\N	0101000020E6100000DC68006F81C053C0EB73B515FB4B07C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
321	INC-2026-00321	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	4	15	1	1	Rúa Ávalos, 130, Bajos, 93070, Concepción del Puerto	-2.88810000	-79.00890000	54	\N	\N	\N	2026-07-04 12:52:30	2026-07-04 12:52:30	\N	0101000020E6100000CD3B4ED191C053C0ED9E3C2CD41A07C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
322	INC-2026-00322	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	7	\N	2	1	Avenida Jon, 59, Entre suelo 1º, 78026, O Bernal	-3.26010000	-79.98340000	55	\N	\N	\N	2026-07-03 22:52:30	2026-07-03 22:52:30	\N	0101000020E6100000BBB88D06F0FE53C04D840D4FAF140AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
323	INC-2026-00323	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	1	2	2	1	Ronda Alexandra, 57, 77º C, 71765, Os Casares	-2.24120000	-79.93120000	54	\N	\N	\N	2026-06-26 04:52:30	2026-06-26 04:52:30	\N	0101000020E61000004182E2C798FB53C0925CFE43FAED01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
324	INC-2026-00324	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	2	7	3	1	Plaza Ávila, 756, 4º E, 28110, Os Arroyo de Arriba	-2.94610000	-78.97690000	55	\N	\N	\N	2026-07-17 10:52:30	2026-07-17 10:52:30	\N	0101000020E610000098DD938785BE53C0FDF675E09C9107C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
325	INC-2026-00325	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	4	17	4	1	Plaça Laia, 557, 8º D, 62895, Vall Báez Baja	-2.94710000	-78.97290000	53	\N	\N	\N	2026-07-10 21:52:30	2026-07-10 21:52:30	\N	0101000020E6100000D1915CFE43BE53C03255302AA99307C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
326	INC-2026-00326	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	5	19	4	6	Avenida Burgos, 3, 7º 9º, 39858, Banda de Lemos	-3.24110000	-79.90540000	54	19	\N	\N	2026-07-03 03:52:30	2026-07-03 14:52:30	\N	0101000020E61000001973D712F2F953C0598638D6C5ED09C0	331	\N	\N	\N	2026-07-03 14:52:30	\N	\N	\N	CLASSIFIED	\N	\N	\N
327	INC-2026-00327	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	1	5	1	1	Travesía Deleón, 9, Bajo 1º, 38624, Concepción del Bages	-2.86410000	-79.01090000	53	\N	\N	\N	2026-07-15 10:52:30	2026-07-15 10:52:30	\N	0101000020E6100000B1E1E995B2C053C0EFC9C342ADE906C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
328	INC-2026-00328	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	2	9	4	5	Travessera Villagómez, 8, 8º E, 35369, San Vila	-2.23020000	-79.91720000	53	12	\N	2026-07-05 12:52:30	2026-07-05 02:52:30	2026-07-05 12:52:30	\N	0101000020E610000009F9A067B3FA53C04850FC1873D701C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
329	INC-2026-00329	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	5	19	3	1	Avinguda Manuel, 616, 56º E, 89663, Os Llamas	-3.27810000	-79.95240000	54	\N	\N	\N	2026-07-14 12:52:30	2026-07-14 12:52:30	\N	0101000020E6100000772D211FF4FC53C00B24287E8C390AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
15	INC-2026-00015	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	1	2	4	2	Avinguda Villagómez, 738, 31º C, 04492, Guevara del Pozo	-2.19120000	-79.88520000	55	13	\N	\N	2026-07-16 17:52:28	2026-07-16 17:52:28	\N	0101000020E6100000D49AE61DA7F853C02BF697DD938701C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
330	INC-2026-00330	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	4	17	2	6	Rúa Eduardo, 574, 4º 2º, 45046, A Rojo del Vallès	-2.20720000	-79.86920000	54	11	\N	\N	2026-07-20 19:52:30	2026-07-21 02:52:30	\N	0101000020E6100000BA6B09F9A0F753C07FD93D7958A801C0	482	\N	\N	\N	2026-07-21 02:52:30	\N	\N	\N	CLASSIFIED	\N	\N	\N
331	INC-2026-00331	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	6	22	3	1	Praza Oriol, 82, 81º B, 98162, Las Conde	-2.20520000	-79.87220000	54	\N	\N	\N	2026-07-06 09:52:30	2026-07-06 09:52:30	\N	0101000020E61000008FE4F21FD2F753C0151DC9E53FA401C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
332	INC-2026-00332	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	5	19	4	1	Travesía Carlos, 63, 0º D, 20331, Vall Luna	-2.14720000	-79.87820000	53	\N	\N	2026-06-24 15:52:30	2026-06-24 10:52:30	2026-06-24 15:52:30	\N	0101000020E610000039D6C56D34F853C005C58F31772D01C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
333	INC-2026-00333	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	7	\N	2	6	Calle Aitor, 30, Ático 9º, 64641, La Ruvalcaba del Vallès	-2.94310000	-79.03990000	55	29	\N	\N	2026-07-17 23:52:30	2026-07-18 09:52:30	\N	0101000020E610000011C7BAB88DC253C05DDC4603788B07C0	11	\N	\N	\N	2026-07-18 09:52:30	\N	\N	\N	CLASSIFIED	\N	\N	\N
334	INC-2026-00334	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	1	4	2	1	Avinguda Claudia, 8, 45º E, 48493, Las Silva de Arriba	-2.93910000	-79.04090000	53	\N	\N	\N	2026-06-29 02:52:30	2026-06-29 02:52:30	\N	0101000020E6100000029A081B9EC253C088635DDC468307C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
335	INC-2026-00335	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	7	\N	4	1	Carrer Roberto, 72, 98º F, 70648, Jurado del Vallès	-2.93010000	-78.99890000	55	\N	\N	\N	2026-06-30 06:52:30	2026-06-30 06:52:30	\N	0101000020E61000005DFE43FAEDBF53C0A913D044D87007C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
336	INC-2026-00336	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	1	5	4	3	Praza Escobedo, 75, Bajo 4º, 65228, A Contreras de San Pedro	-3.22710000	-79.93940000	54	18	\N	\N	2026-07-11 02:52:30	2026-07-11 02:52:30	\N	0101000020E610000032772D211FFC53C0705F07CE19D109C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
337	INC-2026-00337	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	2	9	4	6	Passeig Rodríguez, 3, 31º F, 78496, L' Piñeiro	-2.87510000	-79.00790000	55	27	\N	\N	2026-06-29 02:52:30	2026-06-29 17:52:30	\N	0101000020E6100000DC68006F81C053C039D6C56D340007C0	11	\N	\N	\N	2026-06-29 17:52:30	\N	\N	\N	CLASSIFIED	\N	\N	\N
338	INC-2026-00338	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	4	16	1	1	Calle Pol, 92, Bajo 6º, 87978, Vall Varela de San Pedro	-3.21810000	-80.00040000	54	\N	\N	\N	2026-07-15 06:52:30	2026-07-15 06:52:30	\N	0101000020E6100000C7BAB88D060054C0910F7A36ABBE09C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
339	INC-2026-00339	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	7	\N	3	1	Praza Pedro, 673, 83º 5º, 22512, Castro Alta	-2.22220000	-79.91620000	53	\N	\N	\N	2026-07-02 03:52:30	2026-07-02 03:52:30	\N	0101000020E610000018265305A3FA53C09E5E29CB10C701C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
341	INC-2026-00341	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	6	22	3	1	Travessera Adriana, 455, 43º E, 41390, Saldivar del Pozo	-3.22910000	-79.93940000	54	\N	\N	\N	2026-07-13 18:52:30	2026-07-13 18:52:30	\N	0101000020E610000032772D211FFC53C0DA1B7C6132D509C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
342	INC-2026-00342	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	2	8	1	1	Travessera Gael, 3, 0º D, 16745, Valle del Puerto	-3.26010000	-79.97740000	55	\N	\N	\N	2026-07-02 21:52:30	2026-07-02 21:52:30	\N	0101000020E610000011C7BAB88DFE53C04D840D4FAF140AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
343	INC-2026-00343	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	1	4	2	1	Carrer Galván, 2, 4º, 61746, San Quintanilla del Penedès	-2.92810000	-78.96990000	55	\N	\N	\N	2026-07-04 22:52:30	2026-07-04 22:52:30	\N	0101000020E6100000FC1873D712BE53C03F575BB1BF6C07C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
344	INC-2026-00344	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	5	19	1	1	Camiño Rodrigo, 1, 7º A, 56416, Os Quezada	-2.86510000	-79.04790000	55	\N	\N	\N	2026-07-03 20:52:30	2026-07-03 20:52:30	\N	0101000020E61000009E5E29CB10C353C024287E8CB9EB06C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
345	INC-2026-00345	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	3	10	1	1	Avinguda Segura, 201, 3º, 17708, Gimeno de las Torres	-2.90110000	-79.05290000	55	\N	\N	\N	2026-07-14 11:52:30	2026-07-14 11:52:30	\N	0101000020E6100000567DAEB662C353C0A167B3EA733507C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
346	INC-2026-00346	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	2	8	4	5	Calle Godínez, 754, 6º D, 15440, As Valles	-2.16720000	-79.84520000	55	13	\N	2026-07-21 06:52:31	2026-07-19 12:52:31	2026-07-21 06:52:31	\N	0101000020E610000012A5BDC117F653C02D211FF46C5601C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
347	INC-2026-00347	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	3	11	1	1	Ruela Asier, 249, 2º D, 64408, Orellana de Arriba	-2.15620000	-79.88620000	55	\N	\N	\N	2026-07-18 20:52:31	2026-07-18 20:52:31	\N	0101000020E6100000C66D3480B7F853C0E4141DC9E53F01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
348	INC-2026-00348	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	5	18	2	6	Paseo Eduardo, 302, 4º 4º, 43968, Villa Perales	-2.92710000	-79.00690000	54	29	\N	\N	2026-07-20 07:52:31	2026-07-21 06:52:31	\N	0101000020E6100000EA95B20C71C053C009F9A067B36A07C0	11	\N	\N	\N	2026-07-21 06:52:31	\N	\N	\N	CLASSIFIED	\N	\N	\N
349	INC-2026-00349	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	3	11	4	1	Avinguda Montero, 600, 5º B, 25428, Garza del Vallès	-2.23020000	-79.89620000	55	\N	\N	\N	2026-07-18 08:52:31	2026-07-18 08:52:31	\N	0101000020E610000036AB3E575BF953C04850FC1873D701C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
350	INC-2026-00350	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	1	2	4	5	Travesía Alonso, 62, Bajos, 08896, As Alva	-3.21110000	-79.99540000	55	16	\N	2026-07-24 19:52:31	2026-07-22 19:52:31	2026-07-24 19:52:31	\N	0101000020E61000000F9C33A2B4FF53C01C7C613255B009C0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
351	INC-2026-00351	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	7	\N	1	5	Calle Roberto, 8, 9º F, 38391, L' Nazario	-2.91810000	-79.00290000	54	30	\N	2026-07-24 01:52:31	2026-07-21 10:52:31	2026-07-24 01:52:31	\N	0101000020E6100000234A7B832FC053C02AA913D0445807C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
16	INC-2026-00016	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	4	14	2	5	Plaza Yeray, 289, Entre suelo 8º, 83202, El Velásquez del Bages	-2.21920000	-79.90520000	55	12	\N	2026-07-25 00:52:28	2026-07-22 20:52:28	2026-07-25 00:52:28	\N	0101000020E6100000B515FBCBEEF953C0FE43FAEDEBC001C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
352	INC-2026-00352	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	7	\N	1	5	Avinguda Alonso, 432, 2º A, 88372, Gurule del Barco	-2.24020000	-79.93520000	54	13	\N	2026-07-02 18:52:31	2026-06-29 18:52:31	2026-07-02 18:52:31	\N	0101000020E610000007CE1951DAFB53C05DFE43FAEDEB01C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
353	INC-2026-00353	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	6	22	1	5	Travesía Martina, 468, 03º B, 18358, Os Escribano	-2.89210000	-78.99390000	55	31	\N	2026-07-23 20:52:31	2026-07-22 03:52:31	2026-07-23 20:52:31	\N	0101000020E6100000A4DFBE0E9CBF53C0C2172653052307C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
354	INC-2026-00354	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	3	11	4	6	Avenida Delapaz, 93, 75º A, 42520, Los Rico de Ulla	-2.22320000	-79.93520000	53	11	\N	\N	2026-07-10 15:52:31	2026-07-11 03:52:31	\N	0101000020E610000007CE1951DAFB53C0D3BCE3141DC901C0	482	\N	\N	\N	2026-07-11 03:52:31	\N	\N	\N	CLASSIFIED	\N	\N	\N
355	INC-2026-00355	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	6	22	3	1	Camino Lola, 875, 62º F, 16646, As Quiroz del Bages	-3.26710000	-79.91740000	54	\N	\N	\N	2026-07-06 10:52:31	2026-07-06 10:52:31	\N	0101000020E61000006D567DAEB6FA53C0C217265305230AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
356	INC-2026-00356	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	7	\N	2	1	Rúa Álvaro, 469, 82º B, 96408, As Banda	-2.86210000	-79.01090000	54	\N	\N	2026-07-19 15:52:31	2026-07-18 08:52:31	2026-07-19 15:52:31	\N	0101000020E6100000B1E1E995B2C053C0840D4FAF94E506C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
357	INC-2026-00357	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	4	14	4	6	Camino Carolina, 61, Bajo 3º, 87832, O Sierra de Lemos	-2.19120000	-79.92120000	53	10	\N	\N	2026-07-17 15:52:31	2026-07-17 19:52:31	\N	0101000020E6100000D044D8F0F4FA53C02BF697DD938701C0	482	\N	\N	\N	2026-07-17 19:52:31	\N	\N	\N	CLASSIFIED	\N	\N	\N
358	INC-2026-00358	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	7	\N	3	1	Paseo Márquez, 80, 87º A, 99087, Montalvo del Puerto	-2.90310000	-78.96990000	53	\N	\N	\N	2026-06-24 08:52:31	2026-06-24 08:52:31	\N	0101000020E6100000FC1873D712BE53C00B24287E8C3907C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
359	INC-2026-00359	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	6	22	1	1	Ruela Claudia, 6, Bajo 8º, 25129, Os Marín de Arriba	-2.15220000	-79.89720000	54	\N	\N	\N	2026-07-07 09:52:31	2026-07-07 09:52:31	\N	0101000020E6100000287E8CB96BF953C00F9C33A2B43701C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
360	INC-2026-00360	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	7	\N	1	1	Paseo Luisa, 373, 4º C, 38612, Los Córdoba	-2.20720000	-79.86520000	54	\N	\N	\N	2026-06-30 17:52:31	2026-06-30 17:52:31	\N	0101000020E6100000F31FD26F5FF753C07FD93D7958A801C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
361	INC-2026-00361	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	1	4	2	1	Passeig Orta, 925, 3º 6º, 90849, Cobo del Bages	-2.89010000	-79.04290000	55	\N	\N	\N	2026-07-14 06:52:31	2026-07-14 06:52:31	\N	0101000020E6100000E63FA4DFBEC253C0575BB1BFEC1E07C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
362	INC-2026-00362	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	7	\N	4	6	Avenida Carballo, 4, Entre suelo 6º, 78000, Arriaga de Arriba	-2.23020000	-79.92720000	53	13	\N	\N	2026-06-27 15:52:31	2026-06-28 01:52:31	\N	0101000020E61000007A36AB3E57FB53C04850FC1873D701C0	482	\N	\N	\N	2026-06-28 01:52:31	\N	\N	\N	CLASSIFIED	\N	\N	\N
363	INC-2026-00363	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	6	23	3	1	Travesía Roberto, 871, Ático 0º, 02980, Os Contreras de las Torres	-2.22920000	-79.91320000	53	\N	\N	2026-07-13 21:52:31	2026-07-12 20:52:31	2026-07-13 21:52:31	\N	0101000020E610000043AD69DE71FA53C013F241CF66D501C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
364	INC-2026-00364	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	1	1	4	1	Avenida Luis, 89, Bajo 5º, 29237, Naranjo del Barco	-2.93010000	-79.04490000	53	\N	\N	2026-06-29 05:52:31	2026-06-27 02:52:31	2026-06-29 05:52:31	\N	0101000020E6100000C9E53FA4DFC253C0A913D044D87007C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
365	INC-2026-00365	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	4	14	3	6	Rúa Eric, 546, 5º A, 55572, Soriano de Lemos	-2.90410000	-78.98090000	53	29	\N	\N	2026-06-30 16:52:31	2026-07-01 04:52:31	\N	0101000020E61000005F29CB10C7BE53C04182E2C7983B07C0	11	\N	\N	\N	2026-07-01 04:52:31	\N	\N	\N	CLASSIFIED	\N	\N	\N
366	INC-2026-00366	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	3	13	3	6	Travessera Valeria, 44, 5º B, 92028, Vall Cerda	-3.27810000	-79.91940000	53	17	\N	\N	2026-07-07 14:52:31	2026-07-07 17:52:31	\N	0101000020E610000050FC1873D7FA53C00B24287E8C390AC0	331	\N	\N	\N	2026-07-07 17:52:31	\N	\N	\N	CLASSIFIED	\N	\N	\N
367	INC-2026-00367	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	4	15	2	6	Travessera Robles, 473, 16º C, 27391, El Alfaro	-2.21820000	-79.90720000	55	12	\N	\N	2026-07-20 05:52:31	2026-07-20 13:52:31	\N	0101000020E610000099BB96900FFA53C0C9E53FA4DFBE01C0	482	\N	\N	\N	2026-07-20 13:52:31	\N	\N	\N	CLASSIFIED	\N	\N	\N
368	INC-2026-00368	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	7	\N	2	1	Camino Munguía, 7, 03º F, 27867, Campos del Vallès	-2.23320000	-79.92020000	53	\N	\N	\N	2026-07-13 02:52:31	2026-07-13 02:52:31	\N	0101000020E6100000DE718A8EE4FA53C0E86A2BF697DD01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
369	INC-2026-00369	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	1	4	1	1	Avenida Diego, 41, 6º A, 04534, Nava del Penedès	-2.22820000	-79.90020000	54	\N	\N	\N	2026-07-01 19:52:31	2026-07-01 19:52:31	\N	0101000020E6100000FDF675E09CF953C0DE9387855AD301C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
370	INC-2026-00370	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	2	7	1	1	Praza Raúl, 401, 2º F, 68365, Las Rendón del Bages	-3.22010000	-79.96840000	54	\N	\N	\N	2026-07-12 21:52:31	2026-07-12 21:52:31	\N	0101000020E6100000925CFE43FAFD53C0FBCBEEC9C3C209C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
371	INC-2026-00371	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	6	22	4	5	Camino Gil, 91, Ático 9º, 99532, Villegas del Barco	-2.94810000	-78.98390000	53	28	\N	2026-06-28 01:52:31	2026-06-26 13:52:31	2026-06-28 01:52:31	\N	0101000020E610000034A2B437F8BE53C068B3EA73B59507C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
373	INC-2026-00373	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	6	22	1	1	Ronda Ana, 55, Entre suelo 2º, 23403, La Sosa de San Pedro	-2.93010000	-79.05590000	55	\N	\N	\N	2026-07-22 16:52:31	2026-07-22 16:52:31	\N	0101000020E61000002BF697DD93C353C0A913D044D87007C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
17	INC-2026-00017	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	6	22	3	1	Calle Carlos, 59, 08º C, 16943, San Ramón de las Torres	-2.17120000	-79.89620000	55	\N	\N	\N	2026-07-19 18:52:28	2026-07-19 18:52:28	\N	0101000020E610000036AB3E575BF953C0029A081B9E5E01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
374	INC-2026-00374	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	2	9	1	5	Ronda Alejandro, 4, 3º D, 12012, Las Villalpando de San Pedro	-2.17420000	-79.93520000	54	12	\N	2026-07-08 11:52:31	2026-07-06 19:52:31	2026-07-08 11:52:31	\N	0101000020E610000007CE1951DAFB53C0A2B437F8C26401C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
375	INC-2026-00375	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	6	23	2	1	Avinguda Velázquez, 569, 2º D, 24101, L' Palomo	-2.16620000	-79.93220000	55	\N	\N	\N	2026-07-06 23:52:31	2026-07-06 23:52:31	\N	0101000020E61000003255302AA9FB53C0F8C264AA605401C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
376	INC-2026-00376	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	6	24	4	5	Avinguda Rafael, 4, 9º F, 58785, A Aranda del Barco	-2.14920000	-79.91220000	54	13	\N	2026-07-18 22:52:31	2026-07-18 07:52:31	2026-07-18 22:52:31	\N	0101000020E610000051DA1B7C61FA53C06F8104C58F3101C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
377	INC-2026-00377	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	4	16	2	1	Carrer Gonzalo, 9, 1º D, 57362, Os Vergara de Lemos	-2.22820000	-79.93120000	53	\N	\N	\N	2026-07-10 16:52:31	2026-07-10 16:52:31	\N	0101000020E61000004182E2C798FB53C0DE9387855AD301C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
378	INC-2026-00378	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	7	\N	2	6	Plaza Aina, 7, 7º E, 18877, Vall Márquez de Ulla	-2.16720000	-79.93320000	55	10	\N	\N	2026-07-21 00:52:31	2026-07-21 21:52:31	\N	0101000020E610000024287E8CB9FB53C02D211FF46C5601C0	482	\N	\N	\N	2026-07-21 21:52:31	\N	\N	\N	CLASSIFIED	\N	\N	\N
379	INC-2026-00379	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	2	8	1	1	Ruela Domínguez, 9, 7º 2º, 02498, San Laureano	-2.91710000	-78.97490000	55	\N	\N	\N	2026-07-07 07:52:31	2026-07-07 07:52:31	\N	0101000020E6100000B537F8C264BE53C0F54A5986385607C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
380	INC-2026-00380	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	6	22	3	1	Travessera Zayas, 686, 64º 1º, 19959, El Silva	-2.85210000	-78.95890000	53	\N	\N	\N	2026-06-24 10:52:31	2026-06-24 10:52:31	\N	0101000020E61000009A081B9E5EBD53C0705F07CE19D106C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
381	INC-2026-00381	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	1	5	3	1	Rúa Ramos, 2, 70º D, 39022, A Moya de las Torres	-2.86610000	-78.98990000	55	\N	\N	\N	2026-06-29 19:52:31	2026-06-29 19:52:31	\N	0101000020E6100000DE9387855ABF53C0598638D6C5ED06C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
382	INC-2026-00382	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	6	24	4	5	Passeig Lara, 63, 60º A, 82791, Roybal del Pozo	-2.23820000	-79.93320000	54	12	\N	2026-07-15 08:52:31	2026-07-14 17:52:31	2026-07-15 08:52:31	\N	0101000020E610000024287E8CB9FB53C0F241CF66D5E701C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
383	INC-2026-00383	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	1	4	4	5	Avenida Valentina, 6, 2º A, 39879, Barreto de Lemos	-2.21320000	-79.92220000	54	10	\N	2026-07-10 08:52:31	2026-07-07 22:52:31	2026-07-10 08:52:31	\N	0101000020E6100000C217265305FB53C0BF0E9C33A2B401C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
384	INC-2026-00384	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	6	24	1	1	Camiño Raquel, 989, 3º B, 01145, As Palomino de Lemos	-3.24910000	-79.95040000	53	\N	\N	\N	2026-06-28 19:52:31	2026-06-28 19:52:31	\N	0101000020E61000009487855AD3FC53C003780B2428FE09C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
385	INC-2026-00385	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	4	16	2	1	Ronda Arenas, 684, 35º 7º, 01543, Vall Bañuelos	-2.86910000	-79.04590000	55	\N	\N	\N	2026-06-28 14:52:31	2026-06-28 14:52:31	\N	0101000020E6100000BBB88D06F0C253C0F9A067B3EAF306C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
386	INC-2026-00386	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	1	2	3	1	Camino Muñiz, 50, 5º E, 82363, Vall Arce	-2.16920000	-79.92720000	53	\N	\N	\N	2026-07-23 04:52:31	2026-07-23 04:52:31	\N	0101000020E61000007A36AB3E57FB53C098DD9387855A01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
387	INC-2026-00387	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	4	15	2	1	Travessera Alejandro, 9, 75º F, 76547, O Rosario de Ulla	-2.89810000	-79.00190000	54	\N	\N	\N	2026-07-07 14:52:31	2026-07-07 14:52:31	\N	0101000020E610000032772D211FC053C0014D840D4F2F07C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
388	INC-2026-00388	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	7	\N	3	1	Camiño Alarcón, 6, 97º A, 68129, Romo de las Torres	-3.29710000	-79.91540000	54	\N	\N	\N	2026-07-10 23:52:31	2026-07-10 23:52:31	\N	0101000020E61000008AB0E1E995FA53C0FF21FDF675600AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
389	INC-2026-00389	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	1	4	1	1	Plaça Orozco, 704, Ático 5º, 82310, Reyna del Penedès	-2.23120000	-79.92820000	55	\N	\N	\N	2026-07-08 21:52:31	2026-07-08 21:52:31	\N	0101000020E61000006C09F9A067FB53C07DAEB6627FD901C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
390	INC-2026-00390	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	1	2	4	1	Calle Natalia, 89, 16º B, 08021, Vaca de las Torres	-2.18820000	-79.92120000	55	\N	\N	\N	2026-06-23 14:52:31	2026-06-23 14:52:31	\N	0101000020E6100000D044D8F0F4FA53C08CDB68006F8101C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
391	INC-2026-00391	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	3	11	1	1	Carrer Ballesteros, 19, 87º B, 78944, Gallardo de San Pedro	-2.89710000	-79.00490000	53	\N	\N	2026-07-01 13:52:31	2026-06-28 13:52:31	2026-07-01 13:52:31	\N	0101000020E610000007F0164850C053C0CCEEC9C3422D07C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
392	INC-2026-00392	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	1	2	1	1	Avinguda Arnau, 5, 01º 0º, 64944, Moral del Barco	-2.86710000	-78.95790000	54	\N	\N	\N	2026-07-15 03:52:31	2026-07-15 03:52:31	\N	0101000020E6100000A835CD3B4EBD53C08FE4F21FD2EF06C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
393	INC-2026-00393	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	3	13	2	1	Camiño Acevedo, 825, 70º B, 04085, Muñiz de la Sierra	-2.21920000	-79.88320000	55	\N	\N	\N	2026-07-22 09:52:31	2026-07-22 09:52:31	\N	0101000020E6100000F1F44A5986F853C0FE43FAEDEBC001C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
394	INC-2026-00394	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	1	3	1	1	Ronda Mireles, 29, 4º F, 41119, La Anguiano del Vallès	-2.21220000	-79.89120000	53	\N	\N	\N	2026-06-26 20:52:31	2026-06-26 20:52:31	\N	0101000020E61000007E8CB96B09F953C08AB0E1E995B201C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
340	INC-2026-00340	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	7	\N	2	1	Travesía Gimeno, 2, 3º B, 27220, Prado del Puerto	-2.20620000	-79.89320000	54	\N	\N	\N	2026-07-16 17:52:30	2026-07-16 17:52:30	\N	0101000020E6100000613255302AF953C04A7B832F4CA601C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
395	INC-2026-00395	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	7	\N	2	1	Camino Barrientos, 3, 13º D, 05535, Ulloa de Ulla	-2.89410000	-79.00090000	55	\N	\N	2026-07-13 20:52:31	2026-07-12 10:52:31	2026-07-13 20:52:31	\N	0101000020E610000040A4DFBE0EC053C02CD49AE61D2707C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
396	INC-2026-00396	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	6	22	4	1	Plaza Jan, 660, 6º E, 54348, Os Lucas del Penedès	-2.15120000	-79.83620000	55	\N	\N	\N	2026-06-25 16:52:31	2026-06-25 16:52:31	\N	0101000020E6100000933A014D84F553C0D93D7958A83501C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
397	INC-2026-00397	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	3	12	3	1	Calle Alberto, 7, 2º B, 23704, L' Pastor	-2.85110000	-78.99590000	54	\N	\N	\N	2026-07-17 07:52:31	2026-07-17 07:52:31	\N	0101000020E610000088855AD3BCBF53C03B014D840DCF06C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
398	INC-2026-00398	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	6	24	3	1	Praza Andrés, 46, 87º 4º, 46691, L' Cobo de las Torres	-3.21110000	-79.95240000	53	\N	\N	\N	2026-07-01 15:52:31	2026-07-01 15:52:31	\N	0101000020E6100000772D211FF4FC53C01C7C613255B009C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
399	INC-2026-00399	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	5	21	3	1	Avinguda Guajardo, 34, 34º 1º, 76300, Os Delatorre de las Torres	-2.21920000	-79.92520000	54	\N	\N	2026-07-13 17:52:31	2026-07-11 02:52:31	2026-07-13 17:52:31	\N	0101000020E610000097900F7A36FB53C0FE43FAEDEBC001C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
400	INC-2026-00400	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	6	22	2	6	Calle Laura, 7, 3º B, 78048, A Báez del Penedès	-2.19120000	-79.84120000	53	13	\N	\N	2026-07-08 03:52:31	2026-07-09 01:52:31	\N	0101000020E61000004B598638D6F553C02BF697DD938701C0	482	\N	\N	\N	2026-07-09 01:52:31	\N	\N	\N	CLASSIFIED	\N	\N	\N
401	INC-2026-00401	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	5	19	3	1	Plaza Naranjo, 7, 0º D, 26120, As Ulibarri de Lemos	-3.22310000	-79.94140000	55	\N	\N	\N	2026-07-04 08:52:31	2026-07-04 08:52:31	\N	0101000020E6100000151DC9E53FFC53C09BE61DA7E8C809C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
402	INC-2026-00402	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	3	11	2	1	Ruela Alicia, 513, Bajos, 22236, Ledesma del Mirador	-2.15020000	-79.89720000	53	\N	\N	2026-07-14 19:52:31	2026-07-13 10:52:31	2026-07-14 19:52:31	\N	0101000020E6100000287E8CB96BF953C0A4DFBE0E9C3301C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
403	INC-2026-00403	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	7	\N	3	1	Plaza Paz, 753, 9º F, 54974, Valdivia Medio	-2.86510000	-79.03590000	53	\N	\N	\N	2026-07-04 20:52:31	2026-07-04 20:52:31	\N	0101000020E61000004A7B832F4CC253C024287E8CB9EB06C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
404	INC-2026-00404	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	5	18	1	1	Rúa Raquel, 969, 4º 0º, 79048, Los Aponte	-3.26110000	-79.92040000	54	\N	\N	2026-07-06 14:52:31	2026-07-05 10:52:31	2026-07-06 14:52:31	\N	0101000020E610000042CF66D5E7FA53C082E2C798BB160AC0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
405	INC-2026-00405	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	5	19	3	6	Avenida Ordóñez, 953, 7º F, 56800, Villa Abrego del Bages	-2.23220000	-79.91020000	53	9	\N	\N	2026-07-19 18:52:31	2026-07-20 12:52:31	\N	0101000020E61000006E3480B740FA53C0B30C71AC8BDB01C0	482	\N	\N	\N	2026-07-20 12:52:31	\N	\N	\N	CLASSIFIED	\N	\N	\N
406	INC-2026-00406	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	5	18	3	6	Avenida Hugo, 1, 3º F, 42667, Os Carrasquillo	-2.22120000	-79.89320000	53	9	\N	\N	2026-07-02 07:52:31	2026-07-02 08:52:31	\N	0101000020E6100000613255302AF953C069006F8104C501C0	482	\N	\N	\N	2026-07-02 08:52:31	\N	\N	\N	CLASSIFIED	\N	\N	\N
407	INC-2026-00407	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	4	16	4	6	Camino Jan, 83, Entre suelo 4º, 08734, Benito de Ulla	-2.23420000	-79.85520000	54	13	\N	\N	2026-07-09 23:52:31	2026-07-10 01:52:31	\N	0101000020E610000082E2C798BBF653C01DC9E53FA4DF01C0	482	\N	\N	\N	2026-07-10 01:52:31	\N	\N	\N	CLASSIFIED	\N	\N	\N
408	INC-2026-00408	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	7	\N	3	1	Camino Serrano, 9, Bajos, 01347, Collazo del Bages	-2.23320000	-79.88420000	53	\N	\N	\N	2026-07-19 10:52:31	2026-07-19 10:52:31	\N	0101000020E6100000E3C798BB96F853C0E86A2BF697DD01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
409	INC-2026-00409	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	7	\N	3	1	Rúa Garibay, 270, 0º F, 89527, Macias del Bages	-3.23110000	-79.93240000	55	\N	\N	\N	2026-07-23 21:52:31	2026-07-23 21:52:31	\N	0101000020E610000096B20C71ACFB53C045D8F0F44AD909C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
410	INC-2026-00410	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	4	14	2	1	Ronda Pineda, 688, 2º E, 18868, O Tejada del Pozo	-2.92210000	-78.96190000	55	\N	\N	\N	2026-07-09 12:52:31	2026-07-09 12:52:31	\N	0101000020E61000006F8104C58FBD53C0FF21FDF6756007C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
411	INC-2026-00411	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	4	15	2	6	Rúa Aitana, 3, 4º C, 97472, Os Holguín Baja	-3.24710000	-79.91540000	55	16	\N	\N	2026-07-10 15:52:31	2026-07-10 22:52:31	\N	0101000020E61000008AB0E1E995FA53C099BB96900FFA09C0	331	\N	\N	\N	2026-07-10 22:52:31	\N	\N	\N	CLASSIFIED	\N	\N	\N
412	INC-2026-00412	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	4	16	1	6	Ruela Fajardo, 1, 3º B, 24877, Gallegos del Puerto	-2.22320000	-79.87020000	54	9	\N	\N	2026-07-10 01:52:31	2026-07-10 05:52:31	\N	0101000020E6100000AB3E575BB1F753C0D3BCE3141DC901C0	482	\N	\N	\N	2026-07-10 05:52:31	\N	\N	\N	CLASSIFIED	\N	\N	\N
413	INC-2026-00413	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	3	10	3	1	Camino Domínguez, 4, 5º A, 00406, Ferrer del Bages	-3.25610000	-79.97940000	54	\N	\N	\N	2026-07-02 07:52:31	2026-07-02 07:52:31	\N	0101000020E6100000F46C567DAEFE53C0780B24287E0C0AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
414	INC-2026-00414	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	3	13	1	1	Camino Tamayo, 67, 40º D, 52721, Vall Domingo	-2.92810000	-79.00390000	54	\N	\N	2026-07-25 01:52:31	2026-07-22 18:52:31	2026-07-25 01:52:31	\N	0101000020E6100000151DC9E53FC053C03F575BB1BF6C07C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
415	INC-2026-00415	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	2	7	4	5	Carrer Nava, 6, 71º D, 17244, Los Aguayo del Mirador	-2.90010000	-78.96090000	55	31	\N	2026-07-18 12:52:31	2026-07-18 03:52:31	2026-07-18 12:52:31	\N	0101000020E61000007DAEB6627FBD53C06C09F9A0673307C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
18	INC-2026-00018	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	4	16	3	1	Paseo Francisca, 9, 72º B, 21340, Vall Chavarría	-2.22220000	-79.90320000	54	\N	\N	\N	2026-07-09 11:52:28	2026-07-09 11:52:28	\N	0101000020E6100000D26F5F07CEF953C09E5E29CB10C701C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
372	INC-2026-00372	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	7	\N	2	1	Ronda Tórrez, 744, 84º D, 98567, Las Villanueva	-2.15820000	-79.92920000	54	\N	\N	\N	2026-07-20 20:52:31	2026-07-20 20:52:31	\N	0101000020E61000005DDC460378FB53C04ED1915CFE4301C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
416	INC-2026-00416	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	5	20	2	1	Ronda Valdés, 20, 88º A, 80087, San Castellanos	-2.22120000	-79.87420000	55	\N	\N	\N	2026-07-03 02:52:31	2026-07-03 02:52:31	\N	0101000020E6100000728A8EE4F2F753C069006F8104C501C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
417	INC-2026-00417	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	4	17	3	5	Camino Abeyta, 74, 75º B, 04601, Alfaro de la Sierra	-3.27110000	-79.96140000	54	15	\N	2026-07-22 04:52:31	2026-07-19 10:52:31	2026-07-22 04:52:31	\N	0101000020E6100000F697DD9387FD53C097900F7A362B0AC0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
418	INC-2026-00418	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	2	7	2	1	Ronda Gómez, 96, 0º B, 36982, San Cuenca Medio	-3.24510000	-79.93440000	55	\N	\N	\N	2026-07-17 00:52:31	2026-07-17 00:52:31	\N	0101000020E61000007958A835CDFB53C02EFF21FDF6F509C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
419	INC-2026-00419	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	2	7	4	1	Calle Gálvez, 3, 74º F, 53792, Iglesias Alta	-2.18120000	-79.85920000	53	\N	\N	\N	2026-07-23 22:52:31	2026-07-23 22:52:31	\N	0101000020E6100000492EFF21FDF653C0174850FC187301C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
420	INC-2026-00420	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	5	19	1	1	Camiño Carrillo, 6, 74º 2º, 63817, L' Matías del Puerto	-2.17020000	-79.90920000	55	\N	\N	2026-07-16 18:52:31	2026-07-14 16:52:31	2026-07-16 18:52:31	\N	0101000020E61000007C61325530FA53C0CD3B4ED1915C01C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
421	INC-2026-00421	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	3	12	1	6	Paseo Torres, 9, 77º E, 67418, Os Cuellar	-2.93910000	-78.98190000	53	27	\N	\N	2026-06-30 10:52:31	2026-07-01 08:52:31	\N	0101000020E610000050FC1873D7BE53C088635DDC468307C0	11	\N	\N	\N	2026-07-01 08:52:31	\N	\N	\N	CLASSIFIED	\N	\N	\N
422	INC-2026-00422	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	4	17	3	1	Calle Ainara, 6, 2º D, 50517, Carrasquillo Medio	-3.29310000	-79.98240000	55	\N	\N	2026-07-21 15:52:31	2026-07-21 00:52:31	2026-07-21 15:52:31	\N	0101000020E6100000C9E53FA4DFFE53C02AA913D044580AC0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
423	INC-2026-00423	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	2	6	4	1	Avinguda Daniel, 1, 6º, 56979, O Segura del Barco	-2.22020000	-79.92620000	55	\N	\N	\N	2026-07-24 09:52:31	2026-07-24 09:52:31	\N	0101000020E610000088635DDC46FB53C034A2B437F8C201C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
424	INC-2026-00424	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	5	18	3	5	Avenida Alejandro, 4, 6º F, 48046, Os Valencia	-2.22620000	-79.85320000	54	9	\N	2026-06-24 06:52:31	2026-06-24 01:52:31	2026-06-24 06:52:31	\N	0101000020E61000009F3C2CD49AF653C073D712F241CF01C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
425	INC-2026-00425	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	6	23	1	6	Travessera Carlota, 64, 39º D, 34974, Melgar de las Torres	-3.24210000	-79.95840000	53	15	\N	\N	2026-07-24 08:52:31	2026-07-24 20:52:31	\N	0101000020E6100000211FF46C56FD53C08FE4F21FD2EF09C0	331	\N	\N	\N	2026-07-24 20:52:31	\N	\N	\N	CLASSIFIED	\N	\N	\N
426	INC-2026-00426	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	1	4	3	1	Camiño Francisco Javier, 68, 22º 9º, 80643, A Sedillo del Vallès	-3.22110000	-79.96940000	53	\N	\N	\N	2026-07-04 01:52:31	2026-07-04 01:52:31	\N	0101000020E6100000832F4CA60AFE53C0302AA913D0C409C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
427	INC-2026-00427	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	3	10	3	1	Plaça María Dolores, 68, Bajos, 02152, Blasco del Bages	-2.17320000	-79.90620000	53	\N	\N	2026-07-02 19:52:31	2026-07-02 17:52:31	2026-07-02 19:52:31	\N	0101000020E6100000A7E8482EFFF953C06D567DAEB66201C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
428	INC-2026-00428	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	7	\N	1	6	Paseo Saúl, 327, 9º A, 84617, Os Calero	-3.29910000	-79.96840000	53	16	\N	\N	2026-07-01 01:52:31	2026-07-01 05:52:31	\N	0101000020E6100000925CFE43FAFD53C06ADE718A8E640AC0	331	\N	\N	\N	2026-07-01 05:52:31	\N	\N	\N	CLASSIFIED	\N	\N	\N
429	INC-2026-00429	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	1	1	1	1	Camiño Montañez, 96, 83º B, 37935, L' Camacho	-3.27710000	-79.94740000	53	\N	\N	\N	2026-07-19 09:52:31	2026-07-19 09:52:31	\N	0101000020E6100000BF0E9C33A2FC53C0D6C56D3480370AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
430	INC-2026-00430	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	7	\N	3	6	Camiño Raúl, 6, 08º D, 73917, Los Román del Vallès	-2.21120000	-79.84820000	54	13	\N	\N	2026-07-17 08:52:31	2026-07-17 23:52:31	\N	0101000020E6100000E71DA7E848F653C0545227A089B001C0	482	\N	\N	\N	2026-07-17 23:52:31	\N	\N	\N	CLASSIFIED	\N	\N	\N
431	INC-2026-00431	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	7	\N	2	1	Travessera Mar, 3, 67º F, 00356, Vall Reyna del Vallès	-2.86810000	-79.05290000	55	\N	\N	2026-07-08 04:52:31	2026-07-06 14:52:31	2026-07-08 04:52:31	\N	0101000020E6100000567DAEB662C353C0C442AD69DEF106C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
432	INC-2026-00432	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	1	1	4	5	Camiño Sáenz, 5, Entre suelo 3º, 59789, As Sánchez	-2.20920000	-79.90220000	53	12	\N	2026-07-02 17:52:31	2026-07-02 01:52:31	2026-07-02 17:52:31	\N	0101000020E6100000E09C11A5BDF953C0EA95B20C71AC01C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
433	INC-2026-00433	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	1	4	4	5	Praza Ángela, 246, 86º B, 06303, L' Gómez del Barco	-3.27910000	-79.91440000	55	18	\N	2026-07-05 08:52:31	2026-07-03 00:52:31	2026-07-05 08:52:31	\N	0101000020E610000098DD938785FA53C04182E2C7983B0AC0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
434	INC-2026-00434	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	7	\N	4	1	Avenida Antonio, 7, Entre suelo 6º, 09320, Garibay del Penedès	-2.18020000	-79.92820000	54	\N	\N	2026-07-20 19:52:31	2026-07-19 05:52:31	2026-07-20 19:52:31	\N	0101000020E61000006C09F9A067FB53C0E2E995B20C7101C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
124	INC-2026-00124	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	7	\N	4	3	Avinguda Cristian, 60, 6º B, 77159, As Ochoa	-2.20420000	-79.85020000	53	12	\N	\N	2026-06-25 08:52:29	2026-06-25 08:52:29	\N	0101000020E6100000CAC342AD69F653C0E0BE0E9C33A201C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
435	INC-2026-00435	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	7	\N	4	1	Ruela Luna, 192, 56º B, 85888, El Betancourt de San Pedro	-2.20620000	-79.89320000	54	\N	\N	\N	2026-07-17 10:52:31	2026-07-17 10:52:31	\N	0101000020E6100000613255302AF953C04A7B832F4CA601C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
436	INC-2026-00436	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	5	21	1	1	Camiño Esparza, 3, 5º 7º, 15388, Pabón del Bages	-3.25410000	-79.99040000	54	\N	\N	\N	2026-07-06 10:52:31	2026-07-06 10:52:31	\N	0101000020E6100000567DAEB662FF53C00E4FAF9465080AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
437	INC-2026-00437	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	2	7	3	1	Camino Miriam, 6, 88º A, 77223, Godínez del Bages	-2.86910000	-78.98090000	53	\N	\N	\N	2026-07-15 10:52:31	2026-07-15 10:52:31	\N	0101000020E61000005F29CB10C7BE53C0F9A067B3EAF306C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
438	INC-2026-00438	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	5	21	1	6	Praza Arnau, 202, 5º A, 54335, Gómez de Ulla	-3.24610000	-79.95140000	55	17	\N	\N	2026-07-24 03:52:32	2026-07-24 20:52:32	\N	0101000020E6100000865AD3BCE3FC53C0645DDC4603F809C0	331	\N	\N	\N	2026-07-24 20:52:32	\N	\N	\N	CLASSIFIED	\N	\N	\N
440	INC-2026-00440	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	7	\N	4	1	Carrer Ian, 3, 50º C, 95373, Aguado del Barco	-3.24910000	-79.98240000	55	\N	\N	\N	2026-07-18 09:52:32	2026-07-18 09:52:32	\N	0101000020E6100000C9E53FA4DFFE53C003780B2428FE09C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
441	INC-2026-00441	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	4	14	2	5	Passeig Ibarra, 3, 2º, 42565, San Meléndez	-3.30610000	-79.98840000	54	17	\N	2026-07-02 17:52:32	2026-07-01 01:52:32	2026-07-02 17:52:32	\N	0101000020E610000073D712F241FF53C0DE718A8EE4720AC0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
442	INC-2026-00442	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	2	8	4	4	Plaça Paola, 474, 64º 3º, 10031, O Patiño Baja	-3.30710000	-80.00340000	54	19	\N	2026-07-15 01:52:32	2026-07-14 15:52:32	2026-07-15 01:52:32	\N	0101000020E61000009C33A2B4370054C014D044D8F0740AC0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
443	INC-2026-00443	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	4	15	3	5	Travessera Mena, 2, Bajo 4º, 00002, Las Barrera del Bages	-2.19520000	-79.89320000	55	9	\N	2026-07-11 08:52:32	2026-07-08 21:52:32	2026-07-11 08:52:32	\N	0101000020E6100000613255302AF953C0006F8104C58F01C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
444	INC-2026-00444	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	6	23	4	7	Praza Caldera, 62, 15º A, 75193, Alcántar Baja	-3.20810000	-79.99940000	55	15	\N	\N	2026-07-04 10:52:32	2026-07-04 10:52:32	\N	0101000020E6100000D5E76A2BF6FF53C07C61325530AA09C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
445	INC-2026-00445	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	6	24	2	1	Travessera Pilar, 148, Bajo 3º, 31443, Los Arias	-2.22620000	-79.85220000	55	\N	\N	\N	2026-07-14 16:52:32	2026-07-14 16:52:32	\N	0101000020E6100000AD69DE718AF653C073D712F241CF01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
446	INC-2026-00446	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	6	24	3	5	Travessera Ibáñez, 21, 6º C, 68177, El Pons Medio	-2.18320000	-79.88120000	55	13	\N	2026-07-24 14:52:32	2026-07-21 18:52:32	2026-07-24 14:52:32	\N	0101000020E61000000E4FAF9465F853C08104C58F317701C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
448	INC-2026-00448	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	7	\N	3	1	Ronda Valeria, 548, 7º D, 87838, Vall Mejía	-2.16320000	-79.89920000	54	\N	\N	2026-07-06 16:52:32	2026-07-04 13:52:32	2026-07-06 16:52:32	\N	0101000020E61000000B24287E8CF953C058A835CD3B4E01C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
449	INC-2026-00449	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	6	24	3	1	Passeig Rangel, 4, 3º C, 55185, La Ballesteros	-2.22620000	-79.85820000	55	\N	\N	\N	2026-07-02 15:52:32	2026-07-02 15:52:32	\N	0101000020E6100000575BB1BFECF653C073D712F241CF01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
450	INC-2026-00450	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	5	21	4	1	Praza Vera, 72, 90º B, 03129, Galarza de las Torres	-2.86310000	-79.01090000	54	\N	\N	2026-07-25 08:52:32	2026-07-23 01:52:32	2026-07-25 08:52:32	\N	0101000020E6100000B1E1E995B2C053C0BA6B09F9A0E706C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
451	INC-2026-00451	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	2	9	2	5	Plaza Omar, 172, Entre suelo 4º, 49842, Navas del Vallès	-2.16820000	-79.86920000	55	12	\N	2026-07-13 09:52:32	2026-07-11 16:52:32	2026-07-13 09:52:32	\N	0101000020E6100000BA6B09F9A0F753C0637FD93D795801C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
452	INC-2026-00452	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	3	10	1	1	Camiño Roldán, 6, 8º 1º, 60752, Os Tovar del Barco	-2.22420000	-79.90020000	54	\N	\N	\N	2026-07-15 15:52:32	2026-07-15 15:52:32	\N	0101000020E6100000FDF675E09CF953C0091B9E5E29CB01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
453	INC-2026-00453	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	2	7	3	1	Passeig Malak, 4, 11º B, 66973, Villa Pelayo de Lemos	-3.29710000	-79.93840000	55	\N	\N	\N	2026-07-03 08:52:32	2026-07-03 08:52:32	\N	0101000020E610000040A4DFBE0EFC53C0FF21FDF675600AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
454	INC-2026-00454	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	1	1	4	1	Calle Víctor, 537, 9º B, 58176, Las Mojica del Penedès	-2.86410000	-79.05090000	53	\N	\N	\N	2026-07-01 03:52:32	2026-07-01 03:52:32	\N	0101000020E610000073D712F241C353C0EFC9C342ADE906C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
455	INC-2026-00455	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	3	12	3	1	Camino Lázaro, 33, 8º, 87454, Salvador del Puerto	-2.94910000	-79.04690000	53	\N	\N	\N	2026-06-24 06:52:32	2026-06-24 06:52:32	\N	0101000020E6100000AC8BDB6800C353C09D11A5BDC19707C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
456	INC-2026-00456	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	3	11	3	6	Ronda Héctor, 7, 2º D, 57074, Chapa de Arriba	-2.18520000	-79.85720000	53	10	\N	\N	2026-07-13 02:52:32	2026-07-13 15:52:32	\N	0101000020E61000006688635DDCF653C0ECC039234A7B01C0	482	\N	\N	\N	2026-07-13 15:52:32	\N	\N	\N	CLASSIFIED	\N	\N	\N
457	INC-2026-00457	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	3	11	2	1	Ruela Enríquez, 12, 8º 9º, 69372, Villa Farías	-2.94710000	-79.04990000	55	\N	\N	\N	2026-07-09 08:52:32	2026-07-09 08:52:32	\N	0101000020E61000008104C58F31C353C03255302AA99307C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
125	INC-2026-00125	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	5	20	3	4	Plaza Saucedo, 552, 4º A, 10112, Cadena de las Torres	-2.23520000	-79.83720000	53	12	\N	2026-07-21 13:52:29	2026-07-20 08:52:29	2026-07-21 13:52:29	\N	0101000020E6100000840D4FAF94F553C05227A089B0E101C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
458	INC-2026-00458	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	1	2	4	1	Passeig Zoe, 9, 63º C, 66343, L' Gracia	-2.92110000	-79.02090000	53	\N	\N	\N	2026-06-25 08:52:32	2026-06-25 08:52:32	\N	0101000020E6100000211FF46C56C153C0CAC342AD695E07C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
459	INC-2026-00459	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	7	\N	2	1	Plaça Rodrigo, 557, 13º B, 35046, Los Valenzuela	-3.24810000	-79.98740000	55	\N	\N	2026-07-18 12:52:32	2026-07-16 04:52:32	2026-07-18 12:52:32	\N	0101000020E61000008104C58F31FF53C0CE1951DA1BFC09C0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
460	INC-2026-00460	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	7	\N	1	5	Avinguda Francisco, 21, 0º F, 87223, Nazario Alta	-2.18220000	-79.90120000	53	13	\N	2026-06-29 02:52:32	2026-06-27 11:52:32	2026-06-29 02:52:32	\N	0101000020E6100000EFC9C342ADF953C04CA60A46257501C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
461	INC-2026-00461	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	2	6	3	5	Plaza Girón, 9, Bajo 7º, 65532, Los Alba	-2.91810000	-78.97490000	55	29	\N	2026-07-18 12:52:32	2026-07-17 12:52:32	2026-07-18 12:52:32	\N	0101000020E6100000B537F8C264BE53C02AA913D0445807C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
462	INC-2026-00462	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	6	24	2	1	Avenida Robledo, 831, 3º D, 33394, Rosado Baja	-2.21420000	-79.90120000	55	\N	\N	\N	2026-07-15 06:52:32	2026-07-15 06:52:32	\N	0101000020E6100000EFC9C342ADF953C0F46C567DAEB601C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
463	INC-2026-00463	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	5	21	4	5	Travesía Saúl, 401, 1º E, 37343, As Ocasio de San Pedro	-2.18220000	-79.84820000	55	13	\N	2026-06-25 00:52:32	2026-06-23 19:52:32	2026-06-25 00:52:32	\N	0101000020E6100000E71DA7E848F653C04CA60A46257501C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
464	INC-2026-00464	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	6	23	1	1	Travessera González, 8, Bajo 9º, 04122, Alba del Bages	-2.93810000	-78.97690000	53	\N	\N	\N	2026-07-22 04:52:32	2026-07-22 04:52:32	\N	0101000020E610000098DD938785BE53C05305A3923A8107C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
465	INC-2026-00465	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	4	15	4	6	Praza Zamora, 539, 77º E, 80431, O Peres	-2.20020000	-79.90520000	55	11	\N	\N	2026-06-27 09:52:32	2026-06-27 17:52:32	\N	0101000020E6100000B515FBCBEEF953C00B462575029A01C0	482	\N	\N	\N	2026-06-27 17:52:32	\N	\N	\N	CLASSIFIED	\N	\N	\N
466	INC-2026-00466	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	6	23	4	6	Plaza Sergio, 3, 3º D, 56920, Arribas del Mirador	-2.21020000	-79.84420000	55	13	\N	\N	2026-06-28 15:52:32	2026-06-29 04:52:32	\N	0101000020E610000020D26F5F07F653C01FF46C567DAE01C0	482	\N	\N	\N	2026-06-29 04:52:32	\N	\N	\N	CLASSIFIED	\N	\N	\N
467	INC-2026-00467	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	5	21	2	6	Calle Nerea, 414, Bajos, 90771, San Carrero de las Torres	-2.19620000	-79.84620000	53	12	\N	\N	2026-07-15 20:52:32	2026-07-16 14:52:32	\N	0101000020E610000003780B2428F653C036CD3B4ED19101C0	482	\N	\N	\N	2026-07-16 14:52:32	\N	\N	\N	CLASSIFIED	\N	\N	\N
468	INC-2026-00468	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	2	9	3	5	Avenida Rosas, 25, 4º C, 61811, Los Uribe	-2.16020000	-79.90020000	53	10	\N	2026-06-25 21:52:32	2026-06-23 16:52:32	2026-06-25 21:52:32	\N	0101000020E6100000FDF675E09CF953C0B98D06F0164801C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
471	INC-2026-00471	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	1	3	2	1	Rúa Aparicio, 6, 54º D, 96483, Villa Gallardo del Barco	-3.30610000	-79.96940000	55	\N	\N	\N	2026-07-09 00:52:32	2026-07-09 00:52:32	\N	0101000020E6100000832F4CA60AFE53C0DE718A8EE4720AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
472	INC-2026-00472	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	3	13	3	6	Plaza Dario, 70, Bajo 8º, 53136, Pulido del Penedès	-2.23820000	-79.93220000	54	9	\N	\N	2026-07-17 01:52:32	2026-07-17 03:52:32	\N	0101000020E61000003255302AA9FB53C0F241CF66D5E701C0	482	\N	\N	\N	2026-07-17 03:52:32	\N	\N	\N	CLASSIFIED	\N	\N	\N
473	INC-2026-00473	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	6	22	2	1	Ruela Domingo, 63, 9º 9º, 86312, Las Salcido	-2.86410000	-79.05590000	55	\N	\N	\N	2026-07-19 07:52:32	2026-07-19 07:52:32	\N	0101000020E61000002BF697DD93C353C0EFC9C342ADE906C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
474	INC-2026-00474	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	5	21	2	1	Calle Quiroz, 6, 6º D, 18165, San Cortés	-2.19820000	-79.89420000	53	\N	\N	\N	2026-06-27 14:52:32	2026-06-27 14:52:32	\N	0101000020E61000005305A3923AF953C0A089B0E1E99501C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
475	INC-2026-00475	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	2	6	2	1	Travessera Arnau, 28, 97º A, 00869, Benavides de las Torres	-2.91010000	-78.98290000	55	\N	\N	\N	2026-07-09 04:52:32	2026-07-09 04:52:32	\N	0101000020E610000042CF66D5E7BE53C080B74082E24707C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
476	INC-2026-00476	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	3	11	3	1	Praza Diana, 12, Bajos, 75333, Morales del Puerto	-2.94310000	-79.04590000	54	\N	\N	2026-06-30 23:52:32	2026-06-28 00:52:32	2026-06-30 23:52:32	\N	0101000020E6100000BBB88D06F0C253C05DDC4603788B07C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
477	INC-2026-00477	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	6	24	1	5	Travessera Sánchez, 4, 81º D, 28910, El Valdez	-2.90810000	-79.00090000	55	29	\N	2026-07-09 02:52:32	2026-07-06 08:52:32	2026-07-09 02:52:32	\N	0101000020E610000040A4DFBE0EC053C016FBCBEEC94307C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
478	INC-2026-00478	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	7	\N	3	1	Avenida Rubén, 23, Entre suelo 6º, 59250, Las Guerra	-2.22420000	-79.92620000	55	\N	\N	\N	2026-07-06 06:52:32	2026-07-06 06:52:32	\N	0101000020E610000088635DDC46FB53C0091B9E5E29CB01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
479	INC-2026-00479	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	3	12	2	1	Paseo Salcido, 4, 44º B, 31689, Aragón Alta	-2.19520000	-79.89820000	54	\N	\N	\N	2026-07-05 10:52:32	2026-07-05 10:52:32	\N	0101000020E61000001A51DA1B7CF953C0006F8104C58F01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
480	INC-2026-00480	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	1	4	1	1	Avenida Rosario, 62, 02º F, 12057, Calderón de Ulla	-2.90210000	-78.97890000	55	\N	\N	\N	2026-07-07 11:52:32	2026-07-07 11:52:32	\N	0101000020E61000007B832F4CA6BE53C0D6C56D34803707C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
126	INC-2026-00126	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	2	6	1	1	Rúa Camarillo, 37, 26º F, 75891, Marrero del Barco	-2.24520000	-79.93220000	53	\N	\N	2026-06-28 22:52:29	2026-06-26 05:52:29	2026-06-28 22:52:29	\N	0101000020E61000003255302AA9FB53C067D5E76A2BF601C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
439	INC-2026-00439	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	6	24	2	1	Carrer Menchaca, 18, 23º B, 35011, Os Carvajal	-3.28410000	-79.98940000	54	\N	\N	\N	2026-07-08 09:52:32	2026-07-08 09:52:32	\N	0101000020E610000065AA605452FF53C04B598638D6450AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
481	INC-2026-00481	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	6	22	2	1	Plaza Aaron, 71, 07º 4º, 04627, Las Rodrigo del Vallès	-2.16520000	-79.87520000	55	\N	\N	2026-07-24 00:52:32	2026-07-21 17:52:32	2026-07-24 00:52:32	\N	0101000020E6100000645DDC4603F853C0C364AA60545201C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
482	INC-2026-00482	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	3	11	3	5	Camiño Sara, 161, 8º F, 93529, Villa Martín	-2.90110000	-79.03890000	55	28	\N	2026-07-15 18:52:32	2026-07-13 05:52:32	2026-07-15 18:52:32	\N	0101000020E61000001FF46C567DC253C0A167B3EA733507C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
483	INC-2026-00483	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	7	\N	3	1	Avinguda Treviño, 65, Bajos, 95154, Villa Salinas de Ulla	-2.17420000	-79.93120000	54	\N	\N	2026-07-07 12:52:32	2026-07-06 04:52:32	2026-07-07 12:52:32	\N	0101000020E61000004182E2C798FB53C0A2B437F8C26401C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
484	INC-2026-00484	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	7	\N	3	1	Camino Delacrúz, 9, 68º C, 37297, Los Galán	-2.20620000	-79.88920000	55	\N	\N	\N	2026-07-09 04:52:32	2026-07-09 04:52:32	\N	0101000020E61000009BE61DA7E8F853C04A7B832F4CA601C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
485	INC-2026-00485	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	5	19	1	1	Camiño Díez, 8, 8º F, 57236, San Esquibel	-3.24510000	-79.98340000	53	\N	\N	\N	2026-07-13 20:52:32	2026-07-13 20:52:32	\N	0101000020E6100000BBB88D06F0FE53C02EFF21FDF6F509C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
486	INC-2026-00486	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	4	15	4	1	Camiño Raúl, 4, 29º D, 33870, San Rueda	-2.15220000	-79.88420000	54	\N	\N	2026-07-17 17:52:32	2026-07-16 13:52:32	2026-07-17 17:52:32	\N	0101000020E6100000E3C798BB96F853C00F9C33A2B43701C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
487	INC-2026-00487	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	7	\N	2	6	Ruela Celia, 3, Ático 8º, 36301, Parra del Pozo	-2.24620000	-79.87920000	55	11	\N	\N	2026-06-25 05:52:32	2026-06-25 09:52:32	\N	0101000020E61000002AA913D044F853C09C33A2B437F801C0	482	\N	\N	\N	2026-06-25 09:52:32	\N	\N	\N	CLASSIFIED	\N	\N	\N
488	INC-2026-00488	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	1	2	2	1	Plaça Farías, 469, 10º C, 69486, Las Lovato Alta	-2.17320000	-79.90020000	55	\N	\N	2026-06-25 01:52:32	2026-06-24 10:52:32	2026-06-25 01:52:32	\N	0101000020E6100000FDF675E09CF953C06D567DAEB66201C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
489	INC-2026-00489	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	2	9	4	1	Ruela Mesa, 38, Entre suelo 5º, 00970, Casárez Baja	-2.16620000	-79.90720000	53	\N	\N	\N	2026-07-13 02:52:32	2026-07-13 02:52:32	\N	0101000020E610000099BB96900FFA53C0F8C264AA605401C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
490	INC-2026-00490	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	5	20	3	1	Travessera Rojas, 98, 65º F, 90749, Olivárez de Lemos	-2.90910000	-79.02890000	54	\N	\N	\N	2026-07-18 05:52:32	2026-07-18 05:52:32	\N	0101000020E6100000AEB6627FD9C153C04B598638D64507C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
491	INC-2026-00491	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	7	\N	4	1	Avinguda Diego, 8, Entre suelo 1º, 25582, Os Gómez	-3.24810000	-79.94640000	53	\N	\N	2026-07-07 18:52:32	2026-07-06 20:52:32	2026-07-07 18:52:32	\N	0101000020E6100000CD3B4ED191FC53C0CE1951DA1BFC09C0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
492	INC-2026-00492	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	7	\N	2	1	Avenida Raquel, 4, Entre suelo 9º, 76990, A Roig de San Pedro	-3.30510000	-79.92540000	55	\N	\N	\N	2026-06-26 07:52:32	2026-06-26 07:52:32	\N	0101000020E6100000FAEDEBC039FB53C0A913D044D8700AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
493	INC-2026-00493	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	1	2	4	5	Ruela Rosa, 4, 95º B, 46900, San Sola	-3.23110000	-79.93740000	53	18	\N	2026-07-18 20:52:32	2026-07-16 06:52:32	2026-07-18 20:52:32	\N	0101000020E61000004ED1915CFEFB53C045D8F0F44AD909C0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
494	INC-2026-00494	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	2	8	4	1	Paseo César, 50, Entre suelo 2º, 53129, Samaniego del Bages	-2.23420000	-79.87020000	54	\N	\N	\N	2026-07-11 21:52:32	2026-07-11 21:52:32	\N	0101000020E6100000AB3E575BB1F753C01DC9E53FA4DF01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
497	INC-2026-00497	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	6	22	1	1	Travessera Moya, 93, 1º, 34570, Villa Villalba Medio	-2.16920000	-79.85320000	55	\N	\N	\N	2026-07-08 06:52:32	2026-07-08 06:52:32	\N	0101000020E61000009F3C2CD49AF653C098DD9387855A01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
498	INC-2026-00498	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	1	4	4	1	Plaza Miramontes, 19, 9º C, 35326, Luque de la Sierra	-3.28810000	-79.95740000	55	\N	\N	\N	2026-07-18 10:52:32	2026-07-18 10:52:32	\N	0101000020E6100000304CA60A46FD53C020D26F5F074E0AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
499	INC-2026-00499	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	5	21	1	1	Ruela Leal, 48, 58º E, 52471, Los Abad	-3.26410000	-79.94440000	55	\N	\N	\N	2026-07-11 00:52:32	2026-07-11 00:52:32	\N	0101000020E6100000EA95B20C71FC53C022FDF675E01C0AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
500	INC-2026-00500	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	7	\N	3	1	Travessera Ana Isabel, 647, 97º E, 02828, O Abeyta de Ulla	-3.25610000	-79.98140000	54	\N	\N	\N	2026-07-08 02:52:32	2026-07-08 02:52:32	\N	0101000020E6100000D712F241CFFE53C0780B24287E0C0AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
501	INC-2026-00501	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	7	\N	3	1	Carrer Alemán, 749, 3º A, 10867, La Polo	-2.22120000	-79.86120000	53	\N	\N	\N	2026-07-01 22:52:32	2026-07-01 22:52:32	\N	0101000020E61000002CD49AE61DF753C069006F8104C501C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
447	INC-2026-00447	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	6	24	3	1	Plaza Aaron, 7, 83º F, 29438, Os Vera	-2.87610000	-79.02690000	55	\N	\N	\N	2026-06-29 09:52:32	2026-06-29 09:52:32	\N	0101000020E6100000CB10C7BAB8C153C06E3480B7400207C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
502	INC-2026-00502	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	7	\N	3	1	Passeig Carrasquillo, 5, 35º C, 83207, Vall Casares	-2.21820000	-79.90320000	55	\N	\N	\N	2026-07-04 19:52:32	2026-07-04 19:52:32	\N	0101000020E6100000D26F5F07CEF953C0C9E53FA4DFBE01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
503	INC-2026-00503	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	4	14	1	1	Avenida Cisneros, 36, 3º F, 02512, O Aguilera del Vallès	-3.27410000	-79.92740000	55	\N	\N	\N	2026-06-24 12:52:32	2026-06-24 12:52:32	\N	0101000020E6100000DE9387855AFB53C036AB3E575B310AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
504	INC-2026-00504	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	4	14	2	1	Rúa Santiago, 923, 6º F, 32831, Ávalos del Penedès	-2.93610000	-78.98890000	55	\N	\N	\N	2026-07-22 18:52:32	2026-07-22 18:52:32	\N	0101000020E6100000ECC039234ABF53C0E9482EFF217D07C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
505	INC-2026-00505	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	5	20	3	1	Ruela Casado, 9, 63º A, 33728, Vall Cordero del Vallès	-3.25410000	-79.94440000	53	\N	\N	2026-06-27 17:52:32	2026-06-26 17:52:32	2026-06-27 17:52:32	\N	0101000020E6100000EA95B20C71FC53C00E4FAF9465080AC0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
506	INC-2026-00506	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	5	19	4	1	Ronda Sosa, 135, 24º A, 42936, Guerra del Pozo	-3.24510000	-79.98140000	53	\N	\N	\N	2026-07-22 19:52:32	2026-07-22 19:52:32	\N	0101000020E6100000D712F241CFFE53C02EFF21FDF6F509C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
507	INC-2026-00507	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	6	22	4	5	Passeig Alexandra, 9, 31º A, 35754, El Cortés de Arriba	-2.91210000	-78.97190000	53	30	\N	2026-06-30 18:52:32	2026-06-30 02:52:32	2026-06-30 18:52:32	\N	0101000020E6100000E0BE0E9C33BE53C0EB73B515FB4B07C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
508	INC-2026-00508	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	3	11	3	1	Praza Rocío, 3, 83º D, 99951, Pedraza del Vallès	-2.16620000	-79.90420000	55	\N	\N	\N	2026-07-12 04:52:32	2026-07-12 04:52:32	\N	0101000020E6100000C442AD69DEF953C0F8C264AA605401C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
509	INC-2026-00509	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	6	22	1	5	Carrer Rafael, 313, 05º D, 25182, Mateos Alta	-2.92810000	-78.99190000	55	28	\N	2026-06-27 14:52:32	2026-06-26 01:52:32	2026-06-27 14:52:32	\N	0101000020E6100000C139234A7BBF53C03F575BB1BF6C07C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
510	INC-2026-00510	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	1	3	3	1	Travesía Martí, 53, 7º D, 08078, San Rojas Alta	-2.15420000	-79.84620000	53	\N	\N	\N	2026-07-14 06:52:32	2026-07-14 06:52:32	\N	0101000020E610000003780B2428F653C07958A835CD3B01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
511	INC-2026-00511	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	7	\N	2	1	Ruela Prieto, 1, 64º D, 65036, Noriega Medio	-3.21110000	-79.96940000	55	\N	\N	\N	2026-07-08 00:52:32	2026-07-08 00:52:32	\N	0101000020E6100000832F4CA60AFE53C01C7C613255B009C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
512	INC-2026-00512	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	7	\N	3	1	Rúa Canales, 3, 6º E, 08306, San Valdivia	-2.22220000	-79.91120000	54	\N	\N	\N	2026-06-23 14:52:32	2026-06-23 14:52:32	\N	0101000020E61000005F07CE1951FA53C09E5E29CB10C701C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
513	INC-2026-00513	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	6	23	1	1	Calle David, 669, Bajo 6º, 63918, Las Riojas del Vallès	-2.18620000	-79.92220000	53	\N	\N	\N	2026-06-27 10:52:32	2026-06-27 10:52:32	\N	0101000020E6100000C217265305FB53C0211FF46C567D01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
514	INC-2026-00514	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	7	\N	4	1	Ronda Unai, 36, 4º 2º, 48003, O Gámez	-2.90910000	-78.96890000	54	\N	\N	\N	2026-07-13 02:52:32	2026-07-13 02:52:32	\N	0101000020E61000000B46257502BE53C04B598638D64507C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
515	INC-2026-00515	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	7	\N	1	1	Camiño Gallego, 356, 60º E, 98773, Acosta del Bages	-2.17420000	-79.90320000	53	\N	\N	\N	2026-07-22 10:52:32	2026-07-22 10:52:32	\N	0101000020E6100000D26F5F07CEF953C0A2B437F8C26401C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
516	INC-2026-00516	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	1	5	2	1	Camiño Reynoso, 7, 99º A, 13015, El Cuellar	-3.23510000	-79.97040000	55	\N	\N	\N	2026-07-01 03:52:32	2026-07-01 03:52:32	\N	0101000020E610000075029A081BFE53C01A51DA1B7CE109C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
517	INC-2026-00517	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	1	5	2	6	Avenida Lucas, 212, Bajo 5º, 10089, Banda Baja	-3.30810000	-79.97440000	54	16	\N	\N	2026-06-30 05:52:32	2026-06-30 21:52:32	\N	0101000020E61000003C4ED1915CFE53C0492EFF21FD760AC0	331	\N	\N	\N	2026-06-30 21:52:32	\N	\N	\N	CLASSIFIED	\N	\N	\N
518	INC-2026-00518	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	4	16	1	6	Paseo Andrea, 84, 50º 0º, 43585, O Rael de San Pedro	-2.85810000	-78.95590000	53	28	\N	\N	2026-07-06 00:52:32	2026-07-06 12:52:32	\N	0101000020E6100000C58F31772DBD53C0AF94658863DD06C0	11	\N	\N	\N	2026-07-06 12:52:32	\N	\N	\N	CLASSIFIED	\N	\N	\N
519	INC-2026-00519	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	2	7	4	1	Ronda Clemente, 67, 79º 1º, 26067, Gaytán del Mirador	-2.18520000	-79.91620000	55	\N	\N	\N	2026-06-24 09:52:32	2026-06-24 09:52:32	\N	0101000020E610000018265305A3FA53C0ECC039234A7B01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
520	INC-2026-00520	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	3	13	4	1	Carrer Yago, 4, 50º 7º, 90221, Alva de San Pedro	-2.16820000	-79.89320000	54	\N	\N	2026-07-09 14:52:32	2026-07-08 11:52:32	2026-07-09 14:52:32	\N	0101000020E6100000613255302AF953C0637FD93D795801C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
521	INC-2026-00521	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	7	\N	1	1	Travessera Luisa, 6, Entre suelo 5º, 74665, Palacios del Barco	-3.29910000	-79.92640000	55	\N	\N	\N	2026-07-10 04:52:32	2026-07-10 04:52:32	\N	0101000020E6100000ECC039234AFB53C06ADE718A8E640AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
522	INC-2026-00522	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	6	23	1	1	Carrer Quintana, 473, 92º E, 74266, Más del Bages	-2.21420000	-79.92620000	55	\N	\N	\N	2026-07-11 11:52:32	2026-07-11 11:52:32	\N	0101000020E610000088635DDC46FB53C0F46C567DAEB601C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
523	INC-2026-00523	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	2	7	2	1	Plaza Frías, 56, 63º B, 79335, Villa Delgado	-3.27710000	-79.98240000	54	\N	\N	\N	2026-07-02 18:52:32	2026-07-02 18:52:32	\N	0101000020E6100000C9E53FA4DFFE53C0D6C56D3480370AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
470	INC-2026-00470	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	5	21	3	1	Paseo Francisco, 495, 6º F, 71939, Mayorga de Lemos	-2.17020000	-79.86520000	55	\N	\N	\N	2026-07-18 01:52:32	2026-07-18 01:52:32	\N	0101000020E6100000F31FD26F5FF753C0CD3B4ED1915C01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
524	INC-2026-00524	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	5	18	4	1	Travesía Munguía, 9, Bajo 1º, 50114, Cavazos del Barco	-2.19920000	-79.85520000	54	\N	\N	\N	2026-07-08 17:52:32	2026-07-08 17:52:32	\N	0101000020E610000082E2C798BBF653C0D5E76A2BF69701C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
525	INC-2026-00525	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	2	9	3	5	Camino Juana, 10, 57º C, 42695, Olivas del Mirador	-3.22410000	-79.94940000	53	17	\N	2026-07-01 19:52:32	2026-07-01 06:52:32	2026-07-01 19:52:32	\N	0101000020E6100000A2B437F8C2FC53C0D044D8F0F4CA09C0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
526	INC-2026-00526	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	2	6	2	6	Camino Naia, 9, 3º 4º, 76204, Salazar del Penedès	-2.16020000	-79.93320000	54	11	\N	\N	2026-07-23 14:52:32	2026-07-24 13:52:32	\N	0101000020E610000024287E8CB9FB53C0B98D06F0164801C0	482	\N	\N	\N	2026-07-24 13:52:32	\N	\N	\N	CLASSIFIED	\N	\N	\N
527	INC-2026-00527	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	1	1	1	1	Plaça Lucas, 381, 98º C, 20033, Carbajal del Pozo	-2.92210000	-78.97990000	54	\N	\N	2026-07-17 03:52:32	2026-07-17 01:52:32	2026-07-17 03:52:32	\N	0101000020E61000006D567DAEB6BE53C0FF21FDF6756007C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
528	INC-2026-00528	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	2	8	2	6	Travessera Rosas, 318, 3º A, 46379, San Ornelas de San Pedro	-2.22720000	-79.85020000	53	11	\N	\N	2026-07-18 00:52:32	2026-07-18 15:52:32	\N	0101000020E6100000CAC342AD69F653C0A835CD3B4ED101C0	482	\N	\N	\N	2026-07-18 15:52:32	\N	\N	\N	CLASSIFIED	\N	\N	\N
529	INC-2026-00529	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	1	2	2	6	Camiño Rangel, 44, 77º B, 80172, Más del Barco	-2.22620000	-79.88620000	55	9	\N	\N	2026-07-07 09:52:32	2026-07-07 22:52:32	\N	0101000020E6100000C66D3480B7F853C073D712F241CF01C0	482	\N	\N	\N	2026-07-07 22:52:32	\N	\N	\N	CLASSIFIED	\N	\N	\N
530	INC-2026-00530	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	4	16	4	1	Travessera Hugo, 798, 82º E, 10531, Os Toledo	-2.88910000	-79.02590000	54	\N	\N	\N	2026-07-18 08:52:32	2026-07-18 08:52:32	\N	0101000020E6100000D93D7958A8C153C022FDF675E01C07C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
531	INC-2026-00531	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	4	17	1	1	Camiño Vega, 16, Entre suelo 6º, 72920, As Montemayor de San Pedro	-3.26110000	-79.96640000	55	\N	\N	\N	2026-06-30 01:52:33	2026-06-30 01:52:33	\N	0101000020E6100000AEB6627FD9FD53C082E2C798BB160AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
532	INC-2026-00532	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	2	9	4	1	Calle Briseño, 734, 1º E, 46823, Vall Barroso	-2.22920000	-79.84820000	55	\N	\N	\N	2026-07-06 14:52:33	2026-07-06 14:52:33	\N	0101000020E6100000E71DA7E848F653C013F241CF66D501C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
533	INC-2026-00533	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	6	22	4	1	Passeig Eric, 83, 13º B, 15111, El Balderas de Ulla	-2.85110000	-79.03590000	53	\N	\N	2026-07-18 13:52:33	2026-07-17 22:52:33	2026-07-18 13:52:33	\N	0101000020E61000004A7B832F4CC253C03B014D840DCF06C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
534	INC-2026-00534	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	5	21	2	6	Travesía Terrazas, 22, Bajos, 41612, Vall Raya	-2.15420000	-79.89920000	55	11	\N	\N	2026-06-24 09:52:33	2026-06-25 01:52:33	\N	0101000020E61000000B24287E8CF953C07958A835CD3B01C0	482	\N	\N	\N	2026-06-25 01:52:33	\N	\N	\N	CLASSIFIED	\N	\N	\N
535	INC-2026-00535	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	5	19	4	1	Plaza Carrión, 152, Bajo 8º, 06065, Ochoa Baja	-2.93110000	-79.00390000	55	\N	\N	\N	2026-07-14 21:52:33	2026-07-14 21:52:33	\N	0101000020E6100000151DC9E53FC053C0DE718A8EE47207C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
536	INC-2026-00536	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	1	5	2	1	Ruela Soto, 4, 80º C, 34207, El Haro de Ulla	-2.22620000	-79.91920000	55	\N	\N	\N	2026-07-17 08:52:33	2026-07-17 08:52:33	\N	0101000020E6100000ED9E3C2CD4FA53C073D712F241CF01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
537	INC-2026-00537	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	4	15	4	1	Plaza Ayala, 971, 81º F, 90596, Adorno del Pozo	-3.29410000	-79.98440000	53	\N	\N	\N	2026-06-24 22:52:33	2026-06-24 22:52:33	\N	0101000020E6100000AC8BDB6800FF53C05F07CE19515A0AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
538	INC-2026-00538	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	4	16	3	1	Plaza Sara, 45, 3º D, 73389, Giménez del Mirador	-2.92910000	-79.01890000	55	\N	\N	\N	2026-06-28 12:52:33	2026-06-28 12:52:33	\N	0101000020E61000003E7958A835C153C074B515FBCB6E07C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
539	INC-2026-00539	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	5	21	4	1	Paseo Jimena, 427, 78º E, 41667, La Santana del Barco	-2.90310000	-79.03890000	55	\N	\N	2026-07-21 07:52:33	2026-07-19 23:52:33	2026-07-21 07:52:33	\N	0101000020E61000001FF46C567DC253C00B24287E8C3907C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
540	INC-2026-00540	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	4	16	3	6	Avinguda Ontiveros, 6, Bajo 3º, 76723, La Valladares	-2.94610000	-79.03490000	54	27	\N	\N	2026-07-19 22:52:33	2026-07-19 23:52:33	\N	0101000020E610000058A835CD3BC253C0FDF675E09C9107C0	11	\N	\N	\N	2026-07-19 23:52:33	\N	\N	\N	CLASSIFIED	\N	\N	\N
541	INC-2026-00541	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	7	\N	1	1	Travesía Eric, 737, 98º E, 58179, Los Martos del Bages	-2.15420000	-79.88220000	54	\N	\N	\N	2026-07-08 18:52:33	2026-07-08 18:52:33	\N	0101000020E6100000FF21FDF675F853C07958A835CD3B01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
542	INC-2026-00542	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	1	5	1	1	Camiño Fierro, 21, 9º E, 94266, O Manzanares de San Pedro	-2.17220000	-79.86320000	55	\N	\N	\N	2026-06-30 22:52:33	2026-06-30 22:52:33	\N	0101000020E6100000107A36AB3EF753C038F8C264AA6001C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
543	INC-2026-00543	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	7	\N	2	1	Calle Anguiano, 59, 78º E, 24296, As Orta	-2.20320000	-79.84320000	54	\N	\N	\N	2026-07-22 06:52:33	2026-07-22 06:52:33	\N	0101000020E61000002EFF21FDF6F553C0AA60545227A001C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
544	INC-2026-00544	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	1	5	4	1	Carrer Ángel, 1, 9º A, 95736, O Domínguez	-2.22620000	-79.91220000	54	\N	\N	\N	2026-07-15 19:52:33	2026-07-15 19:52:33	\N	0101000020E610000051DA1B7C61FA53C073D712F241CF01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
19	INC-2026-00019	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	2	6	3	6	Camino Laboy, 680, 2º A, 47867, Jaime del Vallès	-2.19120000	-79.87220000	54	13	\N	\N	2026-07-18 10:52:28	2026-07-18 14:52:28	\N	0101000020E61000008FE4F21FD2F753C02BF697DD938701C0	482	\N	\N	\N	2026-07-18 14:52:28	\N	\N	\N	CLASSIFIED	\N	\N	\N
20	INC-2026-00020	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	6	24	4	4	Calle Luisa, 42, 3º 8º, 52259, A Camacho Alta	-2.91010000	-78.95990000	55	28	\N	2026-07-08 10:52:28	2026-07-06 10:52:28	2026-07-08 10:52:28	\N	0101000020E61000008CDB68006FBD53C080B74082E24707C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
545	INC-2026-00545	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	2	9	2	1	Camino Luis, 620, 4º F, 52620, Flores de las Torres	-3.24610000	-79.99640000	53	\N	\N	2026-07-08 21:52:33	2026-07-07 12:52:33	2026-07-08 21:52:33	\N	0101000020E6100000006F8104C5FF53C0645DDC4603F809C0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
546	INC-2026-00546	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	6	22	2	1	Travesía Huerta, 2, 0º F, 50967, Las Gallardo de las Torres	-3.30110000	-79.90540000	54	\N	\N	2026-07-26 15:52:33	2026-07-24 02:52:33	2026-07-26 15:52:33	\N	0101000020E61000001973D712F2F953C0D49AE61DA7680AC0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
547	INC-2026-00547	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	7	\N	1	1	Paseo Gabriela, 34, 8º, 73740, Delacrúz Medio	-2.16820000	-79.92620000	53	\N	\N	2026-06-30 10:52:33	2026-06-29 02:52:33	2026-06-30 10:52:33	\N	0101000020E610000088635DDC46FB53C0637FD93D795801C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
548	INC-2026-00548	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	7	\N	4	6	Rúa Luevano, 5, 33º A, 29690, La Verduzco	-3.30710000	-79.97240000	55	17	\N	\N	2026-07-05 10:52:33	2026-07-05 15:52:33	\N	0101000020E610000058A835CD3BFE53C014D044D8F0740AC0	331	\N	\N	\N	2026-07-05 15:52:33	\N	\N	\N	CLASSIFIED	\N	\N	\N
549	INC-2026-00549	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	3	13	2	1	Camiño Adam, 411, 7º F, 37856, Vall Aranda Medio	-2.88610000	-78.96390000	54	\N	\N	\N	2026-07-01 01:52:33	2026-07-01 01:52:33	\N	0101000020E61000005227A089B0BD53C082E2C798BB1607C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
550	INC-2026-00550	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	5	19	1	1	Plaza Delatorre, 633, 99º A, 86519, O Urbina	-3.23810000	-79.96040000	55	\N	\N	2026-07-21 08:52:33	2026-07-20 19:52:33	2026-07-21 08:52:33	\N	0101000020E610000005C58F3177FD53C0BA6B09F9A0E709C0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
551	INC-2026-00551	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	3	13	2	6	Travessera Esther, 40, 83º B, 69677, Ruvalcaba del Puerto	-3.26610000	-79.93840000	53	19	\N	\N	2026-06-25 02:52:33	2026-06-25 09:52:33	\N	0101000020E610000040A4DFBE0EFC53C08CB96B09F9200AC0	331	\N	\N	\N	2026-06-25 09:52:33	\N	\N	\N	CLASSIFIED	\N	\N	\N
552	INC-2026-00552	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	2	9	1	6	Ruela Duran, 511, Ático 1º, 52562, Villa Villa	-3.30810000	-79.94740000	55	17	\N	\N	2026-07-06 06:52:33	2026-07-06 12:52:33	\N	0101000020E6100000BF0E9C33A2FC53C0492EFF21FD760AC0	331	\N	\N	\N	2026-07-06 12:52:33	\N	\N	\N	CLASSIFIED	\N	\N	\N
553	INC-2026-00553	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	5	18	1	1	Travessera Bernal, 61, 6º, 12164, San Alcántar del Penedès	-2.19920000	-79.93420000	53	\N	\N	2026-06-25 05:52:33	2026-06-24 03:52:33	2026-06-25 05:52:33	\N	0101000020E610000016FBCBEEC9FB53C0D5E76A2BF69701C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
554	INC-2026-00554	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	6	24	2	5	Passeig Lomeli, 85, 67º A, 23113, Vall Castaño del Bages	-2.24120000	-79.90820000	54	13	\N	2026-07-09 04:52:33	2026-07-08 14:52:33	2026-07-09 04:52:33	\N	0101000020E61000008A8EE4F21FFA53C0925CFE43FAED01C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
555	INC-2026-00555	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	3	11	3	1	Passeig Casado, 3, 46º C, 53724, Herrero Baja	-2.19520000	-79.83820000	53	\N	\N	\N	2026-07-12 02:52:33	2026-07-12 02:52:33	\N	0101000020E610000076E09C11A5F553C0006F8104C58F01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
556	INC-2026-00556	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	3	10	2	6	Rúa Benavídez, 53, 97º A, 66305, Hinojosa de Ulla	-2.21820000	-79.89020000	53	10	\N	\N	2026-07-21 13:52:33	2026-07-22 10:52:33	\N	0101000020E61000008CB96B09F9F853C0C9E53FA4DFBE01C0	482	\N	\N	\N	2026-07-22 10:52:33	\N	\N	\N	CLASSIFIED	\N	\N	\N
557	INC-2026-00557	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	7	\N	2	1	Travessera Delatorre, 69, 04º F, 09427, Serrano Medio	-2.92510000	-78.99190000	53	\N	\N	\N	2026-07-11 04:52:33	2026-07-11 04:52:33	\N	0101000020E6100000C139234A7BBF53C09F3C2CD49A6607C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
558	INC-2026-00558	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	5	19	3	1	Plaza Aina, 3, Ático 9º, 94480, La Limón	-2.23520000	-79.83720000	55	\N	\N	\N	2026-07-19 06:52:33	2026-07-19 06:52:33	\N	0101000020E6100000840D4FAF94F553C05227A089B0E101C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
559	INC-2026-00559	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	4	16	2	1	Passeig Luis, 35, Ático 4º, 24886, Ortíz del Bages	-2.15720000	-79.89820000	55	\N	\N	\N	2026-07-13 14:52:33	2026-07-13 14:52:33	\N	0101000020E61000001A51DA1B7CF953C01973D712F24101C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
560	INC-2026-00560	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	3	11	1	5	Avenida Sisneros, 52, 9º 6º, 25056, Romo de las Torres	-2.18420000	-79.90620000	55	12	\N	2026-07-17 10:52:33	2026-07-15 11:52:33	2026-07-17 10:52:33	\N	0101000020E6100000A7E8482EFFF953C0B7627FD93D7901C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
561	INC-2026-00561	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	3	13	2	5	Plaça Urrutia, 861, Entre suelo 6º, 81056, A Corona	-2.17920000	-79.85720000	54	11	\N	2026-07-25 08:52:33	2026-07-22 10:52:33	2026-07-25 08:52:33	\N	0101000020E61000006688635DDCF653C0AC8BDB68006F01C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
562	INC-2026-00562	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	5	20	4	5	Carrer Daniela, 2, 5º F, 84692, Camarillo del Mirador	-2.15520000	-79.88520000	53	10	\N	2026-06-30 13:52:33	2026-06-28 14:52:33	2026-06-30 13:52:33	\N	0101000020E6100000D49AE61DA7F853C0AEB6627FD93D01C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
563	INC-2026-00563	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	6	22	1	5	Travessera Iván, 413, 8º B, 09223, Velasco de San Pedro	-2.14720000	-79.91820000	53	10	\N	2026-07-20 12:52:33	2026-07-19 04:52:33	2026-07-20 12:52:33	\N	0101000020E6100000FBCBEEC9C3FA53C005C58F31772D01C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
21	INC-2026-00021	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	5	21	3	7	Camiño Haro, 226, 3º F, 79190, A Báez del Puerto	-2.14720000	-79.85820000	54	11	\N	\N	2026-07-19 19:52:28	2026-07-19 19:52:28	\N	0101000020E6100000575BB1BFECF653C005C58F31772D01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
564	INC-2026-00564	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	7	\N	1	1	Camiño Pardo, 564, 3º E, 69986, Los Lucero de la Sierra	-2.89910000	-79.02290000	54	\N	\N	2026-07-09 04:52:33	2026-07-08 08:52:33	2026-07-09 04:52:33	\N	0101000020E610000005C58F3177C153C036AB3E575B3107C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
565	INC-2026-00565	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	7	\N	1	1	Carrer Sonia, 4, 16º F, 78024, A Caballero	-3.23710000	-79.98240000	55	\N	\N	\N	2026-07-14 01:52:33	2026-07-14 01:52:33	\N	0101000020E6100000C9E53FA4DFFE53C0840D4FAF94E509C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
566	INC-2026-00566	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	7	\N	4	6	Calle Aguayo, 18, 56º 2º, 81216, Caraballo de San Pedro	-2.15820000	-79.90920000	54	12	\N	\N	2026-07-13 23:52:33	2026-07-14 16:52:33	\N	0101000020E61000007C61325530FA53C04ED1915CFE4301C0	482	\N	\N	\N	2026-07-14 16:52:33	\N	\N	\N	CLASSIFIED	\N	\N	\N
567	INC-2026-00567	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	2	9	2	1	Camino Brito, 923, 2º 5º, 35457, Rodríguez del Vallès	-2.86410000	-79.04290000	54	\N	\N	\N	2026-07-23 07:52:33	2026-07-23 07:52:33	\N	0101000020E6100000E63FA4DFBEC253C0EFC9C342ADE906C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
568	INC-2026-00568	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	4	15	3	6	Calle Barraza, 413, 22º C, 26004, Corral de San Pedro	-2.15920000	-79.93120000	55	11	\N	\N	2026-07-01 17:52:33	2026-07-02 04:52:33	\N	0101000020E61000004182E2C798FB53C0832F4CA60A4601C0	482	\N	\N	\N	2026-07-02 04:52:33	\N	\N	\N	CLASSIFIED	\N	\N	\N
569	INC-2026-00569	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	5	19	1	1	Camiño Villar, 6, 3º F, 44940, Lozano de Lemos	-2.18320000	-79.92320000	54	\N	\N	\N	2026-06-30 01:52:33	2026-06-30 01:52:33	\N	0101000020E6100000B3EA73B515FB53C08104C58F317701C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
570	INC-2026-00570	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	4	16	2	1	Ruela Rentería, 949, 3º B, 94611, Murillo de Lemos	-3.22410000	-79.91940000	54	\N	\N	\N	2026-07-05 17:52:33	2026-07-05 17:52:33	\N	0101000020E610000050FC1873D7FA53C0D044D8F0F4CA09C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
571	INC-2026-00571	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	3	13	3	1	Calle Herrero, 8, 7º, 39788, Las Carballo de las Torres	-2.22220000	-79.89120000	54	\N	\N	2026-07-20 16:52:33	2026-07-20 10:52:33	2026-07-20 16:52:33	\N	0101000020E61000007E8CB96B09F953C09E5E29CB10C701C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
572	INC-2026-00572	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	7	\N	4	6	Rúa Verónica, 791, 7º, 19614, Magaña de las Torres	-3.25910000	-79.93040000	53	17	\N	\N	2026-07-13 04:52:33	2026-07-14 02:52:33	\N	0101000020E6100000B30C71AC8BFB53C018265305A3120AC0	331	\N	\N	\N	2026-07-14 02:52:33	\N	\N	\N	CLASSIFIED	\N	\N	\N
573	INC-2026-00573	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	2	7	4	1	Ruela Lucas, 19, Entre suelo 4º, 91549, Terán Baja	-2.20020000	-79.91720000	54	\N	\N	2026-06-25 11:52:33	2026-06-25 00:52:33	2026-06-25 11:52:33	\N	0101000020E610000009F9A067B3FA53C00B462575029A01C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
574	INC-2026-00574	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	3	10	1	1	Avinguda Maestas, 723, 4º F, 41204, Santana de San Pedro	-2.17920000	-79.92920000	55	\N	\N	2026-07-23 08:52:33	2026-07-21 12:52:33	2026-07-23 08:52:33	\N	0101000020E61000005DDC460378FB53C0AC8BDB68006F01C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
575	INC-2026-00575	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	3	11	4	1	Travesía Francisco Javier, 335, Bajo 3º, 51494, As Gil	-2.20020000	-79.86720000	55	\N	\N	\N	2026-07-21 08:52:33	2026-07-21 08:52:33	\N	0101000020E6100000D6C56D3480F753C00B462575029A01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
576	INC-2026-00576	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	4	14	2	6	Travesía Verónica, 1, 8º E, 11488, As Velasco del Mirador	-2.24120000	-79.85320000	53	12	\N	\N	2026-07-05 22:52:33	2026-07-06 21:52:33	\N	0101000020E61000009F3C2CD49AF653C0925CFE43FAED01C0	482	\N	\N	\N	2026-07-06 21:52:33	\N	\N	\N	CLASSIFIED	\N	\N	\N
577	INC-2026-00577	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	3	10	2	6	Avinguda Jon, 64, 58º F, 03923, San Calvillo	-2.24620000	-79.93320000	53	9	\N	\N	2026-07-22 13:52:33	2026-07-23 10:52:33	\N	0101000020E610000024287E8CB9FB53C09C33A2B437F801C0	482	\N	\N	\N	2026-07-23 10:52:33	\N	\N	\N	CLASSIFIED	\N	\N	\N
578	INC-2026-00578	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	5	20	3	1	Camiño Julia, 55, 1º A, 32314, La Araña de Ulla	-2.19720000	-79.83620000	54	\N	\N	2026-06-27 16:52:33	2026-06-27 10:52:33	2026-06-27 16:52:33	\N	0101000020E6100000933A014D84F553C06B2BF697DD9301C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
579	INC-2026-00579	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	2	8	3	1	Avinguda Blanca, 4, 35º D, 67219, Os Martí de la Sierra	-2.19920000	-79.87920000	53	\N	\N	\N	2026-07-19 00:52:33	2026-07-19 00:52:33	\N	0101000020E61000002AA913D044F853C0D5E76A2BF69701C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
580	INC-2026-00580	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	1	4	4	1	Plaza Ariadna, 373, Entre suelo 0º, 18314, Betancourt del Pozo	-3.23310000	-79.91340000	53	\N	\N	2026-07-23 04:52:33	2026-07-20 04:52:33	2026-07-23 04:52:33	\N	0101000020E6100000A60A462575FA53C0AF94658863DD09C0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
581	INC-2026-00581	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	6	24	4	1	Ruela Andrés, 6, Ático 5º, 60418, Cabán Baja	-2.16520000	-79.88220000	54	\N	\N	2026-07-11 14:52:33	2026-07-10 01:52:33	2026-07-11 14:52:33	\N	0101000020E6100000FF21FDF675F853C0C364AA60545201C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
582	INC-2026-00582	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	6	23	2	1	Camiño Encarnación, 822, 7º 4º, 84157, As Zelaya del Penedès	-2.87610000	-79.02890000	54	\N	\N	\N	2026-07-17 13:52:33	2026-07-17 13:52:33	\N	0101000020E6100000AEB6627FD9C153C06E3480B7400207C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
583	INC-2026-00583	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	5	20	1	1	Travesía Paula, 9, Entre suelo 3º, 40500, La Jáquez de las Torres	-2.23420000	-79.87920000	55	\N	\N	\N	2026-06-29 18:52:33	2026-06-29 18:52:33	\N	0101000020E61000002AA913D044F853C01DC9E53FA4DF01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
584	INC-2026-00584	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	5	18	4	6	Ruela Javier, 52, 38º 0º, 93493, La Lerma Alta	-2.91410000	-78.98090000	54	30	\N	\N	2026-07-14 07:52:33	2026-07-15 02:52:33	\N	0101000020E61000005F29CB10C7BE53C055302AA9135007C0	11	\N	\N	\N	2026-07-15 02:52:33	\N	\N	\N	CLASSIFIED	\N	\N	\N
22	INC-2026-00022	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	1	3	1	7	Camiño Rocío, 457, 23º E, 15340, Las Arteaga del Penedès	-2.93710000	-78.97690000	53	27	\N	\N	2026-07-07 02:52:28	2026-07-07 02:52:28	\N	0101000020E610000098DD938785BE53C01EA7E8482E7F07C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
495	INC-2026-00495	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	1	3	4	1	Avenida Rivas, 701, 89º F, 51381, L' Murillo	-3.28810000	-79.94440000	55	\N	\N	\N	2026-06-28 00:52:32	2026-06-28 00:52:32	\N	0101000020E6100000EA95B20C71FC53C020D26F5F074E0AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
585	INC-2026-00585	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	4	14	3	5	Passeig Antonia, 3, 9º, 70615, Gaitán del Pozo	-2.23620000	-79.85120000	54	13	\N	2026-06-30 18:52:33	2026-06-30 14:52:33	2026-06-30 18:52:33	\N	0101000020E6100000BC96900F7AF653C088855AD3BCE301C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
586	INC-2026-00586	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	3	13	3	1	Paseo Martín, 9, 32º A, 76186, As Luján de Lemos	-2.20520000	-79.86120000	53	\N	\N	\N	2026-06-29 12:52:33	2026-06-29 12:52:33	\N	0101000020E61000002CD49AE61DF753C0151DC9E53FA401C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
587	INC-2026-00587	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	3	12	3	1	Ronda Riera, 126, 98º A, 20908, El Tamayo	-3.21610000	-79.95940000	54	\N	\N	\N	2026-07-17 12:52:33	2026-07-17 12:52:33	\N	0101000020E610000013F241CF66FD53C0265305A392BA09C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
588	INC-2026-00588	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	3	10	4	1	Ruela Arredondo, 119, Ático 9º, 89535, Abad de San Pedro	-2.91710000	-78.98890000	53	\N	\N	\N	2026-07-18 09:52:33	2026-07-18 09:52:33	\N	0101000020E6100000ECC039234ABF53C0F54A5986385607C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
589	INC-2026-00589	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	7	\N	4	6	Calle Martínez, 380, 69º D, 65564, L' Ybarra del Mirador	-2.18320000	-79.90420000	54	10	\N	\N	2026-07-03 13:52:33	2026-07-04 08:52:33	\N	0101000020E6100000C442AD69DEF953C08104C58F317701C0	482	\N	\N	\N	2026-07-04 08:52:33	\N	\N	\N	CLASSIFIED	\N	\N	\N
590	INC-2026-00590	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	7	\N	4	1	Passeig Raquel, 108, 82º C, 92826, A Olmos del Pozo	-2.17320000	-79.86820000	54	\N	\N	2026-06-28 07:52:33	2026-06-26 12:52:33	2026-06-28 07:52:33	\N	0101000020E6100000C898BB9690F753C06D567DAEB66201C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
591	INC-2026-00591	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	6	23	2	6	Passeig Juan José, 5, 18º B, 29332, As Ramírez del Pozo	-2.17320000	-79.92120000	53	10	\N	\N	2026-07-19 01:52:33	2026-07-19 17:52:33	\N	0101000020E6100000D044D8F0F4FA53C06D567DAEB66201C0	482	\N	\N	\N	2026-07-19 17:52:33	\N	\N	\N	CLASSIFIED	\N	\N	\N
592	INC-2026-00592	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	6	23	4	1	Paseo Mondragón, 2, Bajos, 57062, El Riera	-2.23220000	-79.92420000	53	\N	\N	\N	2026-07-12 05:52:33	2026-07-12 05:52:33	\N	0101000020E6100000A5BDC11726FB53C0B30C71AC8BDB01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
593	INC-2026-00593	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	1	2	1	1	Avinguda Díaz, 286, Entre suelo 8º, 78946, La Ruvalcaba	-2.85510000	-79.01990000	54	\N	\N	\N	2026-07-11 12:52:33	2026-07-11 12:52:33	\N	0101000020E6100000304CA60A46C153C0107A36AB3ED706C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
594	INC-2026-00594	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	3	12	3	1	Carrer Isabel, 4, 5º B, 78613, El Roldán	-2.17720000	-79.89720000	55	\N	\N	\N	2026-07-03 12:52:33	2026-07-03 12:52:33	\N	0101000020E6100000287E8CB96BF953C042CF66D5E76A01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
595	INC-2026-00595	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	1	5	2	5	Rúa Claudia, 74, Entre suelo 9º, 29823, Os Sánchez de Ulla	-3.29410000	-79.97740000	54	16	\N	2026-07-08 04:52:33	2026-07-07 11:52:33	2026-07-08 04:52:33	\N	0101000020E610000011C7BAB88DFE53C05F07CE19515A0AC0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
596	INC-2026-00596	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	2	9	3	1	Plaça Garay, 3, 11º 3º, 09188, As Casanova de Ulla	-2.18420000	-79.86920000	55	\N	\N	\N	2026-06-30 05:52:33	2026-06-30 05:52:33	\N	0101000020E6100000BA6B09F9A0F753C0B7627FD93D7901C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
597	INC-2026-00597	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	3	10	4	1	Camiño Rocío, 356, 2º F, 43025, Gimeno de las Torres	-3.29710000	-79.98540000	54	\N	\N	\N	2026-07-11 18:52:33	2026-07-11 18:52:33	\N	0101000020E61000009E5E29CB10FF53C0FF21FDF675600AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
598	INC-2026-00598	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	1	2	3	5	Paseo Tovar, 392, 90º F, 59006, Sierra del Vallès	-2.19120000	-79.84020000	55	9	\N	2026-07-17 09:52:33	2026-07-15 21:52:33	2026-07-17 09:52:33	\N	0101000020E6100000598638D6C5F553C02BF697DD938701C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
599	INC-2026-00599	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	5	21	2	1	Camiño Garay, 47, 5º C, 66204, Miranda de San Pedro	-3.22910000	-79.95940000	53	\N	\N	\N	2026-07-08 19:52:33	2026-07-08 19:52:33	\N	0101000020E610000013F241CF66FD53C0DA1B7C6132D509C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
600	INC-2026-00600	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	6	23	1	1	Ruela Josefa, 79, Bajo 9º, 94583, Villa Delatorre de Lemos	-2.86310000	-78.99390000	55	\N	\N	\N	2026-07-11 11:52:33	2026-07-11 11:52:33	\N	0101000020E6100000A4DFBE0E9CBF53C0BA6B09F9A0E706C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
601	INC-2026-00601	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	1	4	4	1	Travesía Del Río, 988, 82º B, 12947, Os Delatorre del Bages	-2.15920000	-79.86120000	54	\N	\N	2026-07-14 09:52:33	2026-07-13 14:52:33	2026-07-14 09:52:33	\N	0101000020E61000002CD49AE61DF753C0832F4CA60A4601C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
602	INC-2026-00602	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	4	16	1	1	Calle Calderón, 79, 53º 0º, 10298, Sierra del Vallès	-3.28710000	-79.98940000	55	\N	\N	\N	2026-07-12 00:52:33	2026-07-12 00:52:33	\N	0101000020E610000065AA605452FF53C0EB73B515FB4B0AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
603	INC-2026-00603	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	7	\N	4	1	Carrer Chacón, 68, 0º 5º, 79348, O Marín	-2.22220000	-79.83720000	53	\N	\N	\N	2026-07-01 13:52:33	2026-07-01 13:52:33	\N	0101000020E6100000840D4FAF94F553C09E5E29CB10C701C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
23	INC-2026-00023	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	4	17	3	4	Travesía Francisca, 547, 45º A, 67689, Trujillo de Lemos	-2.18720000	-79.90220000	54	12	\N	2026-07-13 04:52:28	2026-07-11 11:52:28	2026-07-13 04:52:28	\N	0101000020E6100000E09C11A5BDF953C0567DAEB6627F01C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
604	INC-2026-00604	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	4	17	4	1	Passeig Arenas, 72, 71º A, 83343, Sotelo Alta	-2.24520000	-79.88220000	55	\N	\N	2026-07-20 22:52:33	2026-07-18 09:52:33	2026-07-20 22:52:33	\N	0101000020E6100000FF21FDF675F853C067D5E76A2BF601C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
605	INC-2026-00605	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	4	16	1	5	Ruela Armendáriz, 352, 3º D, 30661, Las Uribe de Arriba	-2.19720000	-79.85120000	54	13	\N	2026-07-02 18:52:33	2026-07-02 08:52:33	2026-07-02 18:52:33	\N	0101000020E6100000BC96900F7AF653C06B2BF697DD9301C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
606	INC-2026-00606	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	5	21	3	6	Camiño Marco, 117, 3º 3º, 81195, San Córdoba Medio	-2.91010000	-79.05490000	54	28	\N	\N	2026-07-16 09:52:33	2026-07-16 13:52:33	\N	0101000020E61000003A234A7B83C353C080B74082E24707C0	11	\N	\N	\N	2026-07-16 13:52:33	\N	\N	\N	CLASSIFIED	\N	\N	\N
607	INC-2026-00607	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	1	2	2	1	Camiño Lira, 69, 7º 1º, 43474, El Fonseca	-2.23620000	-79.84120000	53	\N	\N	2026-07-13 15:52:33	2026-07-11 02:52:33	2026-07-13 15:52:33	\N	0101000020E61000004B598638D6F553C088855AD3BCE301C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
608	INC-2026-00608	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	1	3	3	1	Calle Mora, 559, 86º F, 56410, Los Sierra	-2.85910000	-79.02990000	55	\N	\N	\N	2026-07-02 16:52:33	2026-07-02 16:52:33	\N	0101000020E6100000A089B0E1E9C153C0E5F21FD26FDF06C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
609	INC-2026-00609	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	6	23	2	1	Carrer Rosario, 157, 9º B, 57762, A Fuentes	-2.22120000	-79.90020000	54	\N	\N	\N	2026-06-30 17:52:33	2026-06-30 17:52:33	\N	0101000020E6100000FDF675E09CF953C069006F8104C501C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
610	INC-2026-00610	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	7	\N	1	6	Avenida Caraballo, 45, 7º, 35351, Serna de Arriba	-2.21720000	-79.85020000	55	12	\N	\N	2026-07-21 04:52:33	2026-07-21 12:52:33	\N	0101000020E6100000CAC342AD69F653C09487855AD3BC01C0	482	\N	\N	\N	2026-07-21 12:52:33	\N	\N	\N	CLASSIFIED	\N	\N	\N
611	INC-2026-00611	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	4	15	4	5	Ruela Zayas, 45, 7º D, 33056, Los Barela	-3.23610000	-79.94240000	54	18	\N	2026-07-08 15:52:33	2026-07-07 08:52:33	2026-07-08 15:52:33	\N	0101000020E610000007F0164850FC53C04FAF946588E309C0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
612	INC-2026-00612	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	7	\N	3	5	Camino Zelaya, 1, 11º C, 15159, Vall Juan	-2.18320000	-79.92520000	53	12	\N	2026-06-30 11:52:33	2026-06-29 19:52:33	2026-06-30 11:52:33	\N	0101000020E610000097900F7A36FB53C08104C58F317701C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
613	INC-2026-00613	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	7	\N	3	1	Travessera Frías, 4, 4º E, 66292, A Bahena	-2.85210000	-79.05490000	53	\N	\N	2026-07-24 02:52:33	2026-07-21 10:52:33	2026-07-24 02:52:33	\N	0101000020E61000003A234A7B83C353C0705F07CE19D106C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
614	INC-2026-00614	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	3	13	2	1	Camiño Bañuelos, 3, 78º C, 17460, Las Camarillo de Ulla	-3.23410000	-79.94440000	53	\N	\N	2026-07-04 21:52:33	2026-07-02 11:52:33	2026-07-04 21:52:33	\N	0101000020E6100000EA95B20C71FC53C0E5F21FD26FDF09C0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
615	INC-2026-00615	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	1	3	1	1	Passeig Correa, 7, 4º D, 11282, Bustos Baja	-2.18720000	-79.87720000	54	\N	\N	\N	2026-06-24 20:52:33	2026-06-24 20:52:33	\N	0101000020E61000004703780B24F853C0567DAEB6627F01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
616	INC-2026-00616	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	6	24	4	1	Travessera Yáñez, 2, 51º E, 11352, Villa Villareal	-3.21310000	-79.91540000	53	\N	\N	\N	2026-07-13 22:52:33	2026-07-13 22:52:33	\N	0101000020E61000008AB0E1E995FA53C08638D6C56DB409C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
617	INC-2026-00617	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	4	15	3	5	Camino Celia, 2, Bajos, 08199, Vall Abrego de las Torres	-3.25210000	-79.91640000	55	18	\N	2026-07-10 16:52:33	2026-07-09 04:52:33	2026-07-10 16:52:33	\N	0101000020E61000007B832F4CA6FA53C0A3923A014D040AC0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
618	INC-2026-00618	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	2	7	1	1	Carrer Alberto, 801, 0º A, 26817, San Macias	-3.23310000	-79.93540000	54	\N	\N	\N	2026-07-18 12:52:33	2026-07-18 12:52:33	\N	0101000020E61000006B2BF697DDFB53C0AF94658863DD09C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
619	INC-2026-00619	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	4	16	1	1	Plaza Candela, 774, Ático 6º, 39636, As Mascareñas del Barco	-2.15420000	-79.86120000	54	\N	\N	\N	2026-07-11 14:52:33	2026-07-11 14:52:33	\N	0101000020E61000002CD49AE61DF753C07958A835CD3B01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
620	INC-2026-00620	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	6	23	1	1	Camiño Simón, 71, 8º E, 61742, Vall Peralta del Pozo	-2.85310000	-79.01690000	54	\N	\N	\N	2026-07-20 10:52:33	2026-07-20 10:52:33	\N	0101000020E61000005BD3BCE314C153C0A5BDC11726D306C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
621	INC-2026-00621	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	1	2	2	1	Rúa Manuel, 7, 2º, 09175, Grijalva de las Torres	-3.25210000	-79.93140000	55	\N	\N	\N	2026-07-18 11:52:33	2026-07-18 11:52:33	\N	0101000020E6100000A4DFBE0E9CFB53C0A3923A014D040AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
622	INC-2026-00622	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	2	9	1	1	Ruela Ismael, 2, 8º 1º, 86458, Carrera del Bages	-3.25510000	-79.91340000	54	\N	\N	\N	2026-07-08 16:52:33	2026-07-08 16:52:33	\N	0101000020E6100000A60A462575FA53C043AD69DE710A0AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
623	INC-2026-00623	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	7	\N	2	6	Ronda Olivia, 8, 56º F, 81950, L' Carrero	-2.18420000	-79.92620000	54	11	\N	\N	2026-07-09 03:52:33	2026-07-09 14:52:33	\N	0101000020E610000088635DDC46FB53C0B7627FD93D7901C0	482	\N	\N	\N	2026-07-09 14:52:33	\N	\N	\N	CLASSIFIED	\N	\N	\N
624	INC-2026-00624	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	5	19	1	1	Plaza Antonia, 832, 98º A, 84842, O Cavazos	-2.17820000	-79.86820000	55	\N	\N	\N	2026-06-30 02:52:33	2026-06-30 02:52:33	\N	0101000020E6100000C898BB9690F753C0772D211FF46C01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
24	INC-2026-00024	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	7	\N	1	2	Camiño Blanca, 51, Ático 3º, 36505, Roque de la Sierra	-2.23320000	-79.90220000	54	11	\N	\N	2026-07-09 01:52:28	2026-07-09 01:52:28	\N	0101000020E6100000E09C11A5BDF953C0E86A2BF697DD01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
25	INC-2026-00025	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	6	22	1	6	Passeig Pol, 5, Entre suelo 5º, 64674, Leiva Medio	-2.23920000	-79.90320000	53	11	\N	\N	2026-07-22 10:52:28	2026-07-23 10:52:28	\N	0101000020E6100000D26F5F07CEF953C027A089B0E1E901C0	482	\N	\N	\N	2026-07-23 10:52:28	\N	\N	\N	CLASSIFIED	\N	\N	\N
26	INC-2026-00026	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	1	1	2	2	Calle Bahena, 8, 3º E, 15672, L' Leyva	-3.22510000	-79.92440000	53	19	\N	\N	2026-07-07 17:52:28	2026-07-07 17:52:28	\N	0101000020E6100000091B9E5E29FB53C005A3923A01CD09C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
625	INC-2026-00625	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	6	22	4	1	Praza Alonso, 913, 4º A, 43650, Vall Calvillo Baja	-2.89310000	-78.97290000	55	\N	\N	\N	2026-07-15 02:52:34	2026-07-15 02:52:34	\N	0101000020E6100000D1915CFE43BE53C0F775E09C112507C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
626	INC-2026-00626	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	5	19	4	5	Ronda Hernádez, 399, 59º F, 29007, Valladares del Mirador	-2.16420000	-79.91620000	54	9	\N	2026-07-21 08:52:34	2026-07-20 10:52:34	2026-07-21 08:52:34	\N	0101000020E610000018265305A3FA53C08E06F016485001C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
627	INC-2026-00627	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	7	\N	1	1	Travesía Hidalgo, 13, Bajos, 49447, Os Marrero	-2.15620000	-79.89120000	55	\N	\N	\N	2026-06-28 20:52:34	2026-06-28 20:52:34	\N	0101000020E61000007E8CB96B09F953C0E4141DC9E53F01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
628	INC-2026-00628	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	1	5	3	1	Camiño Macias, 795, 3º C, 55355, El Carbonell	-2.20620000	-79.84820000	55	\N	\N	\N	2026-07-13 09:52:34	2026-07-13 09:52:34	\N	0101000020E6100000E71DA7E848F653C04A7B832F4CA601C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
629	INC-2026-00629	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	6	24	1	1	Plaça Valeria, 189, Bajos, 28448, Galindo de San Pedro	-2.17520000	-79.88720000	55	\N	\N	2026-07-08 00:52:34	2026-07-06 07:52:34	2026-07-08 00:52:34	\N	0101000020E6100000B84082E2C7F853C0D712F241CF6601C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
630	INC-2026-00630	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	7	\N	4	1	Passeig Sevilla, 96, 37º B, 52821, Villa Mayorga del Barco	-2.94410000	-78.97590000	54	\N	\N	\N	2026-07-06 10:52:34	2026-07-06 10:52:34	\N	0101000020E6100000A60A462575BE53C0933A014D848D07C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
631	INC-2026-00631	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	1	5	3	1	Plaza Biel, 367, 62º D, 81554, Henríquez del Mirador	-2.17620000	-79.90320000	53	\N	\N	2026-07-12 16:52:34	2026-07-11 03:52:34	2026-07-12 16:52:34	\N	0101000020E6100000D26F5F07CEF953C00D71AC8BDB6801C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
632	INC-2026-00632	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	6	22	4	1	Travesía Perea, 785, 8º F, 33110, El Escamilla	-2.16920000	-79.84020000	55	\N	\N	\N	2026-06-23 15:52:34	2026-06-23 15:52:34	\N	0101000020E6100000598638D6C5F553C098DD9387855A01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
633	INC-2026-00633	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	1	5	4	6	Calle Sedillo, 521, 4º E, 84319, Vall Ibarra de Arriba	-3.24210000	-79.96040000	54	16	\N	\N	2026-07-05 04:52:34	2026-07-05 21:52:34	\N	0101000020E610000005C58F3177FD53C08FE4F21FD2EF09C0	331	\N	\N	\N	2026-07-05 21:52:34	\N	\N	\N	CLASSIFIED	\N	\N	\N
634	INC-2026-00634	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	4	15	1	1	Calle Montero, 1, 23º 7º, 13046, Gámez Alta	-2.90510000	-79.01090000	53	\N	\N	2026-07-24 01:52:34	2026-07-22 12:52:34	2026-07-24 01:52:34	\N	0101000020E6100000B1E1E995B2C053C076E09C11A53D07C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
635	INC-2026-00635	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	1	2	3	6	Camiño Olvera, 470, 91º E, 05081, Vall Porras de Arriba	-3.23110000	-79.90840000	53	19	\N	\N	2026-06-29 21:52:34	2026-06-30 03:52:34	\N	0101000020E6100000EEEBC03923FA53C045D8F0F44AD909C0	331	\N	\N	\N	2026-06-30 03:52:34	\N	\N	\N	CLASSIFIED	\N	\N	\N
636	INC-2026-00636	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	3	13	4	1	Paseo Casanova, 980, 5º C, 88061, San Gutiérrez de la Sierra	-2.17220000	-79.85720000	54	\N	\N	\N	2026-06-28 10:52:34	2026-06-28 10:52:34	\N	0101000020E61000006688635DDCF653C038F8C264AA6001C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
637	INC-2026-00637	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	3	12	3	5	Ronda Sofía, 93, Entre suelo 2º, 28503, A Adame Alta	-2.22920000	-79.89720000	53	13	\N	2026-06-27 07:52:34	2026-06-25 12:52:34	2026-06-27 07:52:34	\N	0101000020E6100000287E8CB96BF953C013F241CF66D501C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
638	INC-2026-00638	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	4	15	4	1	Travessera Perales, 6, 26º 3º, 01377, A Galarza	-3.23910000	-79.99440000	53	\N	\N	\N	2026-07-22 09:52:34	2026-07-22 09:52:34	\N	0101000020E61000001DC9E53FA4FF53C0EFC9C342ADE909C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
639	INC-2026-00639	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	6	23	2	1	Calle Villa, 33, 1º, 30064, As Delafuente	-3.21910000	-79.92640000	55	\N	\N	\N	2026-06-29 17:52:34	2026-06-29 17:52:34	\N	0101000020E6100000ECC039234AFB53C0C66D3480B7C009C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
640	INC-2026-00640	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	5	20	1	1	Calle Javier, 621, 46º E, 32360, Vall Leal	-2.94810000	-79.04290000	53	\N	\N	\N	2026-07-20 13:52:34	2026-07-20 13:52:34	\N	0101000020E6100000E63FA4DFBEC253C068B3EA73B59507C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
641	INC-2026-00641	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	4	15	4	1	Plaça Irene, 725, 02º A, 59881, O Blasco	-2.22920000	-79.84520000	54	\N	\N	\N	2026-06-29 10:52:34	2026-06-29 10:52:34	\N	0101000020E610000012A5BDC117F653C013F241CF66D501C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
27	INC-2026-00027	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	4	14	4	7	Passeig Mara, 450, Ático 0º, 28202, San Guajardo	-2.15720000	-79.93620000	53	13	\N	\N	2026-07-14 09:52:28	2026-07-14 09:52:28	\N	0101000020E6100000F9A067B3EAFB53C01973D712F24101C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
642	INC-2026-00642	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	7	\N	2	1	Ruela María Pilar, 376, 1º 1º, 89152, Barragán del Puerto	-2.94610000	-78.98490000	55	\N	\N	\N	2026-06-27 01:52:34	2026-06-27 01:52:34	\N	0101000020E61000002575029A08BF53C0FDF675E09C9107C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
643	INC-2026-00643	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	2	9	1	1	Avenida Rodríguez, 20, Bajos, 14757, Quezada de San Pedro	-2.24220000	-79.90620000	54	\N	\N	\N	2026-07-16 06:52:34	2026-07-16 06:52:34	\N	0101000020E6100000A7E8482EFFF953C0C7BAB88D06F001C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
644	INC-2026-00644	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	6	23	1	1	Plaça Carrión, 970, 47º C, 96536, Las Figueroa	-2.23020000	-79.86320000	53	\N	\N	\N	2026-07-12 20:52:34	2026-07-12 20:52:34	\N	0101000020E6100000107A36AB3EF753C04850FC1873D701C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
645	INC-2026-00645	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	2	9	3	5	Calle Jorge, 44, Bajos, 67938, L' Arreola	-3.26910000	-79.98140000	54	16	\N	2026-07-11 07:52:34	2026-07-10 09:52:34	2026-07-11 07:52:34	\N	0101000020E6100000D712F241CFFE53C02CD49AE61D270AC0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
646	INC-2026-00646	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	2	7	4	1	Paseo Roig, 59, 82º 2º, 13773, La Carreón del Puerto	-2.22820000	-79.84620000	53	\N	\N	2026-07-17 02:52:34	2026-07-15 01:52:34	2026-07-17 02:52:34	\N	0101000020E610000003780B2428F653C0DE9387855AD301C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
647	INC-2026-00647	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	2	9	2	6	Travessera Asensio, 6, 8º B, 19139, Cepeda de Ulla	-2.85410000	-79.04590000	53	28	\N	\N	2026-07-01 10:52:34	2026-07-01 19:52:34	\N	0101000020E6100000BBB88D06F0C253C0DA1B7C6132D506C0	11	\N	\N	\N	2026-07-01 19:52:34	\N	\N	\N	CLASSIFIED	\N	\N	\N
648	INC-2026-00648	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	4	17	2	6	Travessera Matías, 501, 2º C, 17650, San Mena de San Pedro	-3.22010000	-79.97340000	54	17	\N	\N	2026-07-10 09:52:34	2026-07-11 06:52:34	\N	0101000020E61000004A7B832F4CFE53C0FBCBEEC9C3C209C0	331	\N	\N	\N	2026-07-11 06:52:34	\N	\N	\N	CLASSIFIED	\N	\N	\N
649	INC-2026-00649	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	3	10	4	1	Avenida Rafael, 2, Entre suelo 5º, 68674, Pérez del Vallès	-3.25810000	-79.97940000	53	\N	\N	2026-07-11 08:52:34	2026-07-11 01:52:34	2026-07-11 08:52:34	\N	0101000020E6100000F46C567DAEFE53C0E3C798BB96100AC0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
650	INC-2026-00650	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	3	11	1	1	Carrer Vega, 9, Bajos, 13820, Villa Delao del Pozo	-2.15920000	-79.85220000	55	\N	\N	2026-07-04 04:52:34	2026-07-02 05:52:34	2026-07-04 04:52:34	\N	0101000020E6100000AD69DE718AF653C0832F4CA60A4601C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
651	INC-2026-00651	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	5	18	3	5	Avenida Guillem, 719, 20º E, 70952, Font del Bages	-2.24220000	-79.90820000	55	9	\N	2026-07-17 11:52:34	2026-07-16 22:52:34	2026-07-17 11:52:34	\N	0101000020E61000008A8EE4F21FFA53C0C7BAB88D06F001C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
652	INC-2026-00652	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	6	23	3	1	Carrer Escribano, 45, Bajo 9º, 19012, Vall Anaya de las Torres	-3.25910000	-79.97540000	53	\N	\N	\N	2026-06-24 02:52:34	2026-06-24 02:52:34	\N	0101000020E61000002D211FF46CFE53C018265305A3120AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
653	INC-2026-00653	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	4	16	4	1	Plaça Aponte, 2, 53º B, 83122, O Arguello de las Torres	-2.92810000	-78.98090000	54	\N	\N	\N	2026-07-14 18:52:34	2026-07-14 18:52:34	\N	0101000020E61000005F29CB10C7BE53C03F575BB1BF6C07C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
654	INC-2026-00654	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	1	5	4	1	Plaza Carrillo, 948, Bajos, 62969, Las Coronado	-3.24710000	-79.91140000	54	\N	\N	2026-07-05 03:52:34	2026-07-03 03:52:34	2026-07-05 03:52:34	\N	0101000020E6100000C364AA6054FA53C099BB96900FFA09C0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
655	INC-2026-00655	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	6	23	4	6	Avenida Cotto, 94, 3º A, 66790, Saldivar Baja	-3.24610000	-79.96540000	54	17	\N	\N	2026-06-25 04:52:34	2026-06-25 15:52:34	\N	0101000020E6100000BDE3141DC9FD53C0645DDC4603F809C0	331	\N	\N	\N	2026-06-25 15:52:34	\N	\N	\N	CLASSIFIED	\N	\N	\N
656	INC-2026-00656	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	5	21	3	1	Calle Josefa, 3, 06º B, 03154, Domínguez de la Sierra	-2.15420000	-79.87420000	54	\N	\N	2026-07-17 05:52:34	2026-07-15 13:52:34	2026-07-17 05:52:34	\N	0101000020E6100000728A8EE4F2F753C07958A835CD3B01C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
657	INC-2026-00657	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	2	7	3	1	Plaça Mota, 3, 0º B, 23471, Lomeli de Ulla	-2.21720000	-79.88720000	55	\N	\N	2026-07-22 02:52:34	2026-07-20 12:52:34	2026-07-22 02:52:34	\N	0101000020E6100000B84082E2C7F853C09487855AD3BC01C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
658	INC-2026-00658	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	3	10	4	6	Avenida Tafoya, 45, 48º A, 70078, O Valadez	-2.24620000	-79.91420000	55	13	\N	\N	2026-07-10 23:52:34	2026-07-11 15:52:34	\N	0101000020E61000003480B74082FA53C09C33A2B437F801C0	482	\N	\N	\N	2026-07-11 15:52:34	\N	\N	\N	CLASSIFIED	\N	\N	\N
659	INC-2026-00659	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	4	17	2	1	Calle Inmaculada, 3, 0º 5º, 86709, Tejada del Mirador	-2.22020000	-79.90320000	54	\N	\N	\N	2026-07-21 14:52:34	2026-07-21 14:52:34	\N	0101000020E6100000D26F5F07CEF953C034A2B437F8C201C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
660	INC-2026-00660	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	4	16	2	1	Plaça Carbajal, 5, 62º B, 64831, As Parra del Puerto	-2.21720000	-79.93520000	54	\N	\N	\N	2026-07-09 18:52:34	2026-07-09 18:52:34	\N	0101000020E610000007CE1951DAFB53C09487855AD3BC01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
661	INC-2026-00661	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	3	10	4	1	Paseo Victoria, 932, 6º D, 65662, Roque Medio	-2.23320000	-79.93120000	53	\N	\N	2026-06-26 18:52:34	2026-06-23 20:52:34	2026-06-26 18:52:34	\N	0101000020E61000004182E2C798FB53C0E86A2BF697DD01C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
662	INC-2026-00662	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	6	22	2	1	Praza Cárdenas, 3, 41º C, 77464, Ramírez del Bages	-2.21520000	-79.86720000	55	\N	\N	\N	2026-07-12 19:52:34	2026-07-12 19:52:34	\N	0101000020E6100000D6C56D3480F753C029CB10C7BAB801C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
496	INC-2026-00496	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	6	22	3	1	Calle Martos, 3, Ático 4º, 64163, L' Alvarado	-3.29210000	-79.92940000	53	\N	\N	\N	2026-07-20 02:52:32	2026-07-20 02:52:32	\N	0101000020E6100000C139234A7BFB53C0F54A598638560AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
664	INC-2026-00664	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	3	13	2	1	Rúa Brito, 109, 49º E, 96260, Leiva de Arriba	-2.90510000	-79.04390000	54	\N	\N	\N	2026-06-30 20:52:34	2026-06-30 20:52:34	\N	0101000020E6100000D712F241CFC253C076E09C11A53D07C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
665	INC-2026-00665	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	3	13	4	1	Paseo Sosa, 6, 5º D, 15502, O Calero	-2.23820000	-79.90120000	54	\N	\N	\N	2026-07-15 22:52:34	2026-07-15 22:52:34	\N	0101000020E6100000EFC9C342ADF953C0F241CF66D5E701C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
666	INC-2026-00666	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	1	5	1	6	Passeig Peláez, 2, 56º F, 69217, A Vega de las Torres	-2.21720000	-79.90520000	53	12	\N	\N	2026-07-01 11:52:34	2026-07-01 17:52:34	\N	0101000020E6100000B515FBCBEEF953C09487855AD3BC01C0	482	\N	\N	\N	2026-07-01 17:52:34	\N	\N	\N	CLASSIFIED	\N	\N	\N
667	INC-2026-00667	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	5	21	4	1	Travessera Cruz, 1, 89º D, 13651, Moya del Puerto	-2.90610000	-79.02190000	55	\N	\N	2026-06-29 18:52:34	2026-06-28 16:52:34	2026-06-29 18:52:34	\N	0101000020E610000013F241CF66C153C0AB3E575BB13F07C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
668	INC-2026-00668	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	3	10	2	1	Ruela Burgos, 950, 54º A, 57066, El Oquendo	-2.18420000	-79.90320000	54	\N	\N	\N	2026-07-21 13:52:34	2026-07-21 13:52:34	\N	0101000020E6100000D26F5F07CEF953C0B7627FD93D7901C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
669	INC-2026-00669	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	1	1	1	6	Plaza Daniela, 6, 1º 8º, 34318, Longoria de San Pedro	-2.18120000	-79.89220000	55	10	\N	\N	2026-07-07 02:52:34	2026-07-07 15:52:34	\N	0101000020E6100000705F07CE19F953C0174850FC187301C0	482	\N	\N	\N	2026-07-07 15:52:34	\N	\N	\N	CLASSIFIED	\N	\N	\N
670	INC-2026-00670	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	5	21	3	1	Calle María Ángeles, 79, 6º C, 49657, Vall Valadez del Puerto	-3.22510000	-79.95240000	54	\N	\N	\N	2026-07-23 06:52:34	2026-07-23 06:52:34	\N	0101000020E6100000772D211FF4FC53C005A3923A01CD09C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
671	INC-2026-00671	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	6	24	2	1	Plaça Ana María, 319, Bajo 4º, 80300, San Leal del Mirador	-2.17920000	-79.92720000	54	\N	\N	\N	2026-07-23 11:52:34	2026-07-23 11:52:34	\N	0101000020E61000007A36AB3E57FB53C0AC8BDB68006F01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
672	INC-2026-00672	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	2	8	1	1	Paseo Aurora, 54, Ático 7º, 96496, Medrano del Barco	-2.88610000	-79.04290000	55	\N	\N	2026-07-11 07:52:34	2026-07-11 00:52:34	2026-07-11 07:52:34	\N	0101000020E6100000E63FA4DFBEC253C082E2C798BB1607C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
673	INC-2026-00673	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	7	\N	4	1	Ronda Paz, 3, 57º C, 56555, A Negrón Medio	-2.94510000	-79.01190000	54	\N	\N	\N	2026-07-12 05:52:34	2026-07-12 05:52:34	\N	0101000020E6100000A2B437F8C2C053C0C898BB96908F07C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
674	INC-2026-00674	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	2	7	4	1	Ronda Lucas, 9, 0º, 42376, La Bustos del Bages	-2.17320000	-79.87120000	53	\N	\N	\N	2026-07-18 08:52:34	2026-07-18 08:52:34	\N	0101000020E61000009D11A5BDC1F753C06D567DAEB66201C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
675	INC-2026-00675	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	1	1	4	1	Praza Alemán, 82, 5º D, 81206, Las Rueda	-2.17620000	-79.89820000	55	\N	\N	\N	2026-06-24 18:52:34	2026-06-24 18:52:34	\N	0101000020E61000001A51DA1B7CF953C00D71AC8BDB6801C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
676	INC-2026-00676	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	1	5	4	1	Camino Pedro, 68, 5º F, 25793, Las Sierra de las Torres	-2.20120000	-79.84520000	54	\N	\N	\N	2026-07-01 00:52:34	2026-07-01 00:52:34	\N	0101000020E610000012A5BDC117F653C040A4DFBE0E9C01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
677	INC-2026-00677	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	1	4	4	6	Travesía Marcos, 77, 82º F, 19532, A Toledo	-2.23320000	-79.88620000	53	9	\N	\N	2026-07-10 18:52:34	2026-07-10 19:52:34	\N	0101000020E6100000C66D3480B7F853C0E86A2BF697DD01C0	482	\N	\N	\N	2026-07-10 19:52:34	\N	\N	\N	CLASSIFIED	\N	\N	\N
678	INC-2026-00678	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	2	6	3	1	Plaza Ponce, 15, Entre suelo 0º, 40903, Villa Riojas	-2.86110000	-78.99590000	54	\N	\N	\N	2026-07-01 05:52:34	2026-07-01 05:52:34	\N	0101000020E610000088855AD3BCBF53C04FAF946588E306C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
679	INC-2026-00679	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	5	20	3	1	Avinguda Antonio, 75, Bajos, 61788, La Barajas Baja	-2.22620000	-79.92920000	54	\N	\N	\N	2026-06-27 07:52:34	2026-06-27 07:52:34	\N	0101000020E61000005DDC460378FB53C073D712F241CF01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
680	INC-2026-00680	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	3	11	3	1	Carrer Rosa, 60, 9º C, 99052, El Cuesta	-2.18820000	-79.85020000	53	\N	\N	\N	2026-07-19 07:52:34	2026-07-19 07:52:34	\N	0101000020E6100000CAC342AD69F653C08CDB68006F8101C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
681	INC-2026-00681	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	4	15	2	1	Calle Miriam, 29, 21º F, 31271, Os Granado de Lemos	-2.18520000	-79.93620000	53	\N	\N	2026-06-25 08:52:34	2026-06-25 02:52:34	2026-06-25 08:52:34	\N	0101000020E6100000F9A067B3EAFB53C0ECC039234A7B01C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
682	INC-2026-00682	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	1	3	3	1	Ruela Marina, 46, 6º 1º, 81800, San Navas de las Torres	-3.21910000	-79.97540000	54	\N	\N	\N	2026-06-23 16:52:34	2026-06-23 16:52:34	\N	0101000020E61000002D211FF46CFE53C0C66D3480B7C009C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
683	INC-2026-00683	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	3	10	3	1	Praza Alejandro, 327, Ático 0º, 37595, L' Urías	-2.14920000	-79.88820000	55	\N	\N	\N	2026-06-27 04:52:34	2026-06-27 04:52:34	\N	0101000020E6100000A913D044D8F853C06F8104C58F3101C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
684	INC-2026-00684	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	1	5	3	1	Passeig Ona, 59, 3º B, 71348, Villa Irizarry	-2.17020000	-79.85920000	53	\N	\N	\N	2026-07-17 06:52:34	2026-07-17 06:52:34	\N	0101000020E6100000492EFF21FDF653C0CD3B4ED1915C01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
685	INC-2026-00685	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	1	3	3	5	Passeig Sandra, 7, 80º B, 46276, La Ibáñez	-3.29010000	-79.93340000	55	19	\N	2026-06-30 07:52:34	2026-06-27 23:52:34	2026-06-30 07:52:34	\N	0101000020E610000088855AD3BCFB53C08A8EE4F21F520AC0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
28	INC-2026-00028	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	1	4	3	5	Carrer Huerta, 353, 1º F, 14686, Escribano de Ulla	-2.93510000	-78.97690000	53	30	\N	2026-07-11 15:52:28	2026-07-10 09:52:28	2026-07-11 15:52:28	\N	0101000020E610000098DD938785BE53C0B3EA73B5157B07C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
686	INC-2026-00686	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	2	8	4	5	Travesía Carrasquillo, 477, Bajo 3º, 29528, Bernal de Arriba	-3.26610000	-79.92140000	54	19	\N	2026-06-30 22:52:34	2026-06-29 15:52:34	2026-06-30 22:52:34	\N	0101000020E610000034A2B437F8FA53C08CB96B09F9200AC0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
687	INC-2026-00687	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	5	19	1	5	Ruela Orta, 2, 2º C, 43424, Villa Valladares del Puerto	-3.28510000	-79.92240000	55	15	\N	2026-07-08 17:52:34	2026-07-06 00:52:34	2026-07-08 17:52:34	\N	0101000020E61000002575029A08FB53C080B74082E2470AC0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
688	INC-2026-00688	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	6	23	4	1	Rúa Miguel, 988, Entre suelo 5º, 21557, O Batista del Puerto	-2.20920000	-79.89620000	55	\N	\N	\N	2026-07-01 12:52:34	2026-07-01 12:52:34	\N	0101000020E610000036AB3E575BF953C0EA95B20C71AC01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
689	INC-2026-00689	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	3	10	1	1	Plaça Carvajal, 4, Entre suelo 8º, 12165, Deleón de la Sierra	-2.21720000	-79.92920000	55	\N	\N	\N	2026-07-12 03:52:34	2026-07-12 03:52:34	\N	0101000020E61000005DDC460378FB53C09487855AD3BC01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
690	INC-2026-00690	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	6	24	2	1	Camino Arnau, 68, 8º B, 17264, Munguía de Arriba	-2.23420000	-79.90020000	53	\N	\N	2026-07-03 21:52:34	2026-07-02 07:52:34	2026-07-03 21:52:34	\N	0101000020E6100000FDF675E09CF953C01DC9E53FA4DF01C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
691	INC-2026-00691	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	2	9	3	1	Camino Alemán, 924, Bajo 8º, 87847, Figueroa del Pozo	-2.90610000	-78.99590000	54	\N	\N	\N	2026-07-07 23:52:34	2026-07-07 23:52:34	\N	0101000020E610000088855AD3BCBF53C0AB3E575BB13F07C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
692	INC-2026-00692	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	2	6	2	6	Camino Salma, 1, 09º E, 71095, Zayas del Barco	-3.30810000	-79.97540000	54	17	\N	\N	2026-07-16 07:52:34	2026-07-16 14:52:34	\N	0101000020E61000002D211FF46CFE53C0492EFF21FD760AC0	331	\N	\N	\N	2026-07-16 14:52:34	\N	\N	\N	CLASSIFIED	\N	\N	\N
693	INC-2026-00693	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	7	\N	4	1	Calle Eva, 435, 29º A, 54846, As Torres de Arriba	-2.20120000	-79.89720000	54	\N	\N	\N	2026-06-30 20:52:34	2026-06-30 20:52:34	\N	0101000020E6100000287E8CB96BF953C040A4DFBE0E9C01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
694	INC-2026-00694	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	1	4	1	5	Ronda Mascareñas, 34, Ático 5º, 81387, O Santillán del Mirador	-2.93310000	-79.02890000	54	29	\N	2026-07-17 04:52:34	2026-07-15 08:52:34	2026-07-17 04:52:34	\N	0101000020E6100000AEB6627FD9C153C0492EFF21FD7607C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
695	INC-2026-00695	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	5	18	1	6	Travessera Carolina, 562, 4º E, 44816, O Ozuna del Barco	-2.91410000	-79.02590000	55	29	\N	\N	2026-07-08 01:52:34	2026-07-08 17:52:34	\N	0101000020E6100000D93D7958A8C153C055302AA9135007C0	11	\N	\N	\N	2026-07-08 17:52:34	\N	\N	\N	CLASSIFIED	\N	\N	\N
696	INC-2026-00696	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	6	23	1	1	Plaza Rosario, 5, 6º, 85550, San Tejada	-2.19420000	-79.89120000	55	\N	\N	\N	2026-07-12 21:52:34	2026-07-12 21:52:34	\N	0101000020E61000007E8CB96B09F953C0CB10C7BAB88D01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
697	INC-2026-00697	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	7	\N	4	1	Ruela María Dolores, 393, Bajos, 01877, Las Ozuna	-3.24110000	-79.94540000	55	\N	\N	\N	2026-07-02 14:52:34	2026-07-02 14:52:34	\N	0101000020E6100000DC68006F81FC53C0598638D6C5ED09C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
698	INC-2026-00698	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	3	12	3	1	Travessera Jan, 2, 3º B, 65630, Vall Badillo	-2.89410000	-79.04990000	54	\N	\N	\N	2026-07-13 07:52:34	2026-07-13 07:52:34	\N	0101000020E61000008104C58F31C353C02CD49AE61D2707C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
699	INC-2026-00699	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	6	24	1	5	Plaza Yaiza, 581, 3º A, 62691, Ibarra del Vallès	-2.15320000	-79.84920000	55	13	\N	2026-07-03 17:52:34	2026-07-01 19:52:34	2026-07-03 17:52:34	\N	0101000020E6100000D8F0F44A59F653C044FAEDEBC03901C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
700	INC-2026-00700	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	6	22	3	5	Plaça Zambrano, 566, 8º A, 60549, La Espino	-3.26210000	-79.99440000	53	16	\N	2026-07-14 08:52:34	2026-07-13 10:52:34	2026-07-14 08:52:34	\N	0101000020E61000001DC9E53FA4FF53C0B84082E2C7180AC0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
701	INC-2026-00701	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	7	\N	4	1	Paseo Santiago, 13, Ático 9º, 17617, O Alfonso	-2.85410000	-78.98890000	54	\N	\N	\N	2026-07-24 00:52:34	2026-07-24 00:52:34	\N	0101000020E6100000ECC039234ABF53C0DA1B7C6132D506C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
702	INC-2026-00702	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	6	24	2	5	Camino Escobedo, 16, 2º F, 04185, Zamudio de Lemos	-2.17520000	-79.84320000	53	9	\N	2026-07-21 05:52:34	2026-07-19 10:52:34	2026-07-21 05:52:34	\N	0101000020E61000002EFF21FDF6F553C0D712F241CF6601C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
703	INC-2026-00703	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	7	\N	2	6	Ruela Calvo, 58, 5º F, 72853, El Valdés Alta	-2.18820000	-79.89020000	54	13	\N	\N	2026-07-11 12:52:34	2026-07-12 04:52:34	\N	0101000020E61000008CB96B09F9F853C08CDB68006F8101C0	482	\N	\N	\N	2026-07-12 04:52:34	\N	\N	\N	CLASSIFIED	\N	\N	\N
704	INC-2026-00704	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	1	3	4	1	Plaça Briones, 4, 94º A, 31238, As Escamilla de Arriba	-3.29910000	-79.91840000	54	\N	\N	2026-07-12 10:52:34	2026-07-10 09:52:34	2026-07-12 10:52:34	\N	0101000020E61000005F29CB10C7FA53C06ADE718A8E640AC0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
706	INC-2026-00706	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	6	24	1	1	Avinguda Betancourt, 219, 2º D, 90324, Torres del Bages	-2.17720000	-79.88020000	54	\N	\N	\N	2026-07-17 12:52:34	2026-07-17 12:52:34	\N	0101000020E61000001C7C613255F853C042CF66D5E76A01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
707	INC-2026-00707	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	1	1	2	1	Travessera Valdez, 5, 1º C, 18348, A Terán del Pozo	-2.24220000	-79.85020000	55	\N	\N	\N	2026-07-20 19:52:34	2026-07-20 19:52:34	\N	0101000020E6100000CAC342AD69F653C0C7BAB88D06F001C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
29	INC-2026-00029	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	4	15	1	7	Ronda Calero, 7, 5º A, 21750, La Trejo	-2.23120000	-79.83720000	53	10	\N	\N	2026-07-13 04:52:28	2026-07-13 04:52:28	\N	0101000020E6100000840D4FAF94F553C07DAEB6627FD901C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
708	INC-2026-00708	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	7	\N	2	1	Praza Mojica, 88, 52º E, 47574, Palomino de las Torres	-2.92710000	-78.95790000	53	\N	\N	\N	2026-07-01 08:52:34	2026-07-01 08:52:34	\N	0101000020E6100000A835CD3B4EBD53C009F9A067B36A07C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
709	INC-2026-00709	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	2	6	2	1	Carrer Alba, 249, 4º A, 96592, Os Concepción Baja	-2.88510000	-79.02290000	54	\N	\N	\N	2026-07-15 18:52:34	2026-07-15 18:52:34	\N	0101000020E610000005C58F3177C153C04D840D4FAF1407C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
710	INC-2026-00710	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	7	\N	3	1	Passeig Nora, 21, 6º D, 13600, Las Ulibarri de San Pedro	-2.18720000	-79.92020000	53	\N	\N	\N	2026-07-08 13:52:34	2026-07-08 13:52:34	\N	0101000020E6100000DE718A8EE4FA53C0567DAEB6627F01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
711	INC-2026-00711	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	4	16	1	5	Avenida Moya, 176, 67º C, 33488, Jimínez de San Pedro	-2.17920000	-79.85320000	53	11	\N	2026-07-25 04:52:34	2026-07-22 19:52:34	2026-07-25 04:52:34	\N	0101000020E61000009F3C2CD49AF653C0AC8BDB68006F01C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
712	INC-2026-00712	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	5	21	2	5	Carrer Nazario, 16, 2º B, 43043, La Ulloa	-3.24010000	-79.94940000	53	15	\N	2026-07-24 02:52:34	2026-07-22 07:52:34	2026-07-24 02:52:34	\N	0101000020E6100000A2B437F8C2FC53C024287E8CB9EB09C0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
713	INC-2026-00713	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	6	23	4	1	Travesía Tafoya, 4, 27º D, 23753, Romo de Arriba	-2.16620000	-79.90220000	54	\N	\N	\N	2026-07-16 10:52:34	2026-07-16 10:52:34	\N	0101000020E6100000E09C11A5BDF953C0F8C264AA605401C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
714	INC-2026-00714	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	2	7	2	1	Camino Adam, 471, Entre suelo 7º, 63105, Dueñas de la Sierra	-2.85710000	-78.99490000	53	\N	\N	\N	2026-07-06 21:52:34	2026-07-06 21:52:34	\N	0101000020E610000096B20C71ACBF53C07A36AB3E57DB06C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
715	INC-2026-00715	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	5	21	1	1	Travessera Aaron, 418, 5º A, 98500, Los Andreu del Bages	-3.25710000	-79.90840000	55	\N	\N	\N	2026-07-09 16:52:35	2026-07-09 16:52:35	\N	0101000020E6100000EEEBC03923FA53C0AD69DE718A0E0AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
716	INC-2026-00716	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	6	23	3	1	Calle Verduzco, 60, 4º A, 93990, A Marín Baja	-2.15420000	-79.84320000	54	\N	\N	\N	2026-07-19 22:52:35	2026-07-19 22:52:35	\N	0101000020E61000002EFF21FDF6F553C07958A835CD3B01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
717	INC-2026-00717	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	1	2	1	1	Carrer Margarita, 42, 08º C, 53804, Arenas del Pozo	-2.16820000	-79.88520000	55	\N	\N	\N	2026-07-03 18:52:35	2026-07-03 18:52:35	\N	0101000020E6100000D49AE61DA7F853C0637FD93D795801C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
718	INC-2026-00718	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	5	21	3	1	Camiño Sanz, 35, 01º C, 23825, Peres del Vallès	-2.91410000	-79.05290000	55	\N	\N	\N	2026-07-15 02:52:35	2026-07-15 02:52:35	\N	0101000020E6100000567DAEB662C353C055302AA9135007C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
719	INC-2026-00719	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	2	8	1	6	Travessera Vera, 27, 98º C, 98094, Rodríguez de San Pedro	-2.23820000	-79.92020000	53	11	\N	\N	2026-07-06 08:52:35	2026-07-07 03:52:35	\N	0101000020E6100000DE718A8EE4FA53C0F241CF66D5E701C0	482	\N	\N	\N	2026-07-07 03:52:35	\N	\N	\N	CLASSIFIED	\N	\N	\N
720	INC-2026-00720	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	2	9	2	5	Ruela López, 78, 5º E, 99056, La Ibarra de Lemos	-2.16520000	-79.93420000	54	10	\N	2026-07-14 09:52:35	2026-07-11 15:52:35	2026-07-14 09:52:35	\N	0101000020E610000016FBCBEEC9FB53C0C364AA60545201C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
721	INC-2026-00721	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	5	18	4	1	Plaça Solís, 708, Bajos, 24853, L' Ponce del Pozo	-2.94510000	-78.99390000	53	\N	\N	2026-06-27 02:52:35	2026-06-26 04:52:35	2026-06-27 02:52:35	\N	0101000020E6100000A4DFBE0E9CBF53C0C898BB96908F07C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
722	INC-2026-00722	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	6	23	2	1	Camiño Rendón, 55, Ático 8º, 42446, Piña de las Torres	-2.86310000	-78.96890000	54	\N	\N	\N	2026-07-09 05:52:35	2026-07-09 05:52:35	\N	0101000020E61000000B46257502BE53C0BA6B09F9A0E706C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
723	INC-2026-00723	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	7	\N	3	5	Plaça Puente, 14, Bajos, 31856, A Gracia Baja	-2.90510000	-79.01790000	53	27	\N	2026-06-24 05:52:35	2026-06-23 19:52:35	2026-06-24 05:52:35	\N	0101000020E61000004CA60A4625C153C076E09C11A53D07C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
724	INC-2026-00724	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	7	\N	1	6	Avinguda Jorge, 418, Bajo 6º, 98760, Vall Gracia del Bages	-2.92310000	-78.98190000	55	31	\N	\N	2026-07-01 06:52:35	2026-07-01 21:52:35	\N	0101000020E610000050FC1873D7BE53C03480B740826207C0	11	\N	\N	\N	2026-07-01 21:52:35	\N	\N	\N	CLASSIFIED	\N	\N	\N
725	INC-2026-00725	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	2	7	4	1	Carrer Zapata, 1, Ático 3º, 67574, Las Castañeda	-2.20620000	-79.92320000	55	\N	\N	\N	2026-07-01 04:52:35	2026-07-01 04:52:35	\N	0101000020E6100000B3EA73B515FB53C04A7B832F4CA601C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
726	INC-2026-00726	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	4	17	4	1	Paseo Ornelas, 8, 26º E, 97820, El Castañeda	-2.20620000	-79.91020000	55	\N	\N	\N	2026-07-04 02:52:35	2026-07-04 02:52:35	\N	0101000020E61000006E3480B740FA53C04A7B832F4CA601C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
727	INC-2026-00727	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	6	24	3	6	Plaza Villa, 27, 7º 9º, 28172, Vall Carrión del Vallès	-3.22410000	-79.95140000	55	15	\N	\N	2026-07-08 07:52:35	2026-07-09 04:52:35	\N	0101000020E6100000865AD3BCE3FC53C0D044D8F0F4CA09C0	331	\N	\N	\N	2026-07-09 04:52:35	\N	\N	\N	CLASSIFIED	\N	\N	\N
728	INC-2026-00728	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	7	\N	4	1	Praza Ozuna, 9, Entre suelo 8º, 71377, Banda de Arriba	-3.21810000	-79.91240000	54	\N	\N	\N	2026-07-15 06:52:35	2026-07-15 06:52:35	\N	0101000020E6100000B537F8C264FA53C0910F7A36ABBE09C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
30	INC-2026-00030	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	2	7	2	3	Travessera Corona, 2, 95º E, 79136, Gaytán Alta	-2.24220000	-79.84820000	54	11	\N	\N	2026-06-24 13:52:28	2026-06-24 13:52:28	\N	0101000020E6100000E71DA7E848F653C0C7BAB88D06F001C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
729	INC-2026-00729	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	6	22	4	1	Carrer Marcos, 755, 5º, 20391, As Polo del Barco	-2.94210000	-79.01290000	55	\N	\N	\N	2026-07-14 02:52:35	2026-07-14 02:52:35	\N	0101000020E61000009487855AD3C053C0287E8CB96B8907C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
730	INC-2026-00730	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	2	8	1	6	Camiño Adrián, 391, 46º F, 95159, Las Fonseca	-3.30710000	-79.97240000	55	16	\N	\N	2026-07-16 12:52:35	2026-07-17 12:52:35	\N	0101000020E610000058A835CD3BFE53C014D044D8F0740AC0	331	\N	\N	\N	2026-07-17 12:52:35	\N	\N	\N	CLASSIFIED	\N	\N	\N
731	INC-2026-00731	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	5	18	1	1	Paseo Saúl, 70, Ático 3º, 97027, La Requena	-2.18320000	-79.93220000	54	\N	\N	\N	2026-07-02 18:52:35	2026-07-02 18:52:35	\N	0101000020E61000003255302AA9FB53C08104C58F317701C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
732	INC-2026-00732	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	7	\N	3	1	Paseo Salma, 5, Entre suelo 7º, 93459, Los Carbonell	-2.15920000	-79.90720000	54	\N	\N	2026-06-28 12:52:35	2026-06-26 07:52:35	2026-06-28 12:52:35	\N	0101000020E610000099BB96900FFA53C0832F4CA60A4601C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
733	INC-2026-00733	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	5	21	3	5	Praza Flores, 91, 5º D, 99101, A Esparza de las Torres	-2.94710000	-78.99290000	54	29	\N	2026-07-03 00:52:35	2026-07-01 21:52:35	2026-07-03 00:52:35	\N	0101000020E6100000B30C71AC8BBF53C03255302AA99307C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
734	INC-2026-00734	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	5	18	1	5	Avinguda Navas, 34, 93º B, 57885, Os Polo	-2.16520000	-79.84320000	53	10	\N	2026-06-26 15:52:35	2026-06-25 06:52:35	2026-06-26 15:52:35	\N	0101000020E61000002EFF21FDF6F553C0C364AA60545201C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
735	INC-2026-00735	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	1	2	4	1	Praza Eric, 9, 58º E, 29997, Vall Menéndez del Pozo	-2.86110000	-79.03590000	54	\N	\N	\N	2026-07-04 21:52:35	2026-07-04 21:52:35	\N	0101000020E61000004A7B832F4CC253C04FAF946588E306C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
736	INC-2026-00736	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	6	22	2	6	Plaça Irene, 64, Ático 5º, 53989, Vall Sedillo	-3.26310000	-79.99540000	53	15	\N	\N	2026-07-14 03:52:35	2026-07-14 05:52:35	\N	0101000020E61000000F9C33A2B4FF53C0ED9E3C2CD41A0AC0	331	\N	\N	\N	2026-07-14 05:52:35	\N	\N	\N	CLASSIFIED	\N	\N	\N
737	INC-2026-00737	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	5	18	3	1	Rúa Nadia, 47, 7º 4º, 66080, O Almonte	-2.15820000	-79.91220000	55	\N	\N	\N	2026-07-18 08:52:35	2026-07-18 08:52:35	\N	0101000020E610000051DA1B7C61FA53C04ED1915CFE4301C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
738	INC-2026-00738	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	3	11	4	6	Rúa Briones, 6, 6º C, 96914, La Mejía	-2.94810000	-78.96490000	54	29	\N	\N	2026-07-07 22:52:35	2026-07-08 16:52:35	\N	0101000020E610000044FAEDEBC0BD53C068B3EA73B59507C0	11	\N	\N	\N	2026-07-08 16:52:35	\N	\N	\N	CLASSIFIED	\N	\N	\N
739	INC-2026-00739	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	1	2	3	5	Travessera Alva, 82, 51º A, 40223, San Ordóñez Medio	-2.16720000	-79.92620000	53	10	\N	2026-07-13 18:52:35	2026-07-11 08:52:35	2026-07-13 18:52:35	\N	0101000020E610000088635DDC46FB53C02D211FF46C5601C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
740	INC-2026-00740	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	2	9	4	6	Plaza Rocío, 97, 2º F, 32965, El Fonseca del Penedès	-2.18220000	-79.86320000	54	9	\N	\N	2026-07-02 02:52:35	2026-07-03 00:52:35	\N	0101000020E6100000107A36AB3EF753C04CA60A46257501C0	482	\N	\N	\N	2026-07-03 00:52:35	\N	\N	\N	CLASSIFIED	\N	\N	\N
741	INC-2026-00741	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	5	18	4	1	Passeig Jimínez, 1, 1º A, 47793, L' Preciado	-3.21410000	-80.00540000	54	\N	\N	\N	2026-07-11 14:52:35	2026-07-11 14:52:35	\N	0101000020E61000007FD93D79580054C0BC96900F7AB609C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
742	INC-2026-00742	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	6	24	2	1	Passeig Rosa María, 7, Ático 5º, 38001, Vidal del Puerto	-2.89410000	-78.98990000	53	\N	\N	\N	2026-06-24 06:52:35	2026-06-24 06:52:35	\N	0101000020E6100000DE9387855ABF53C02CD49AE61D2707C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
743	INC-2026-00743	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	5	20	3	1	Camiño Miriam, 109, 1º C, 30346, El Mascareñas Medio	-2.88810000	-79.00890000	54	\N	\N	2026-07-14 21:52:35	2026-07-13 10:52:35	2026-07-14 21:52:35	\N	0101000020E6100000CD3B4ED191C053C0ED9E3C2CD41A07C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
744	INC-2026-00744	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	4	17	2	1	Rúa Arnau, 52, Bajos, 60208, La Barragán Baja	-2.89310000	-79.03490000	53	\N	\N	\N	2026-07-01 21:52:35	2026-07-01 21:52:35	\N	0101000020E610000058A835CD3BC253C0F775E09C112507C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
745	INC-2026-00745	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	6	22	1	6	Avinguda Silvia, 51, 14º B, 18620, A Ortega	-2.14920000	-79.87520000	54	9	\N	\N	2026-06-26 19:52:35	2026-06-27 18:52:35	\N	0101000020E6100000645DDC4603F853C06F8104C58F3101C0	482	\N	\N	\N	2026-06-27 18:52:35	\N	\N	\N	CLASSIFIED	\N	\N	\N
746	INC-2026-00746	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	5	19	3	1	Travesía Cepeda, 995, 91º D, 15549, San Vera Medio	-2.16920000	-79.84820000	55	\N	\N	\N	2026-07-12 09:52:35	2026-07-12 09:52:35	\N	0101000020E6100000E71DA7E848F653C098DD9387855A01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
747	INC-2026-00747	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	1	4	3	1	Travessera Isaac, 69, 55º C, 00812, Lerma del Puerto	-2.93610000	-78.96090000	53	\N	\N	\N	2026-06-30 16:52:35	2026-06-30 16:52:35	\N	0101000020E61000007DAEB6627FBD53C0E9482EFF217D07C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
748	INC-2026-00748	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	6	22	2	1	Paseo Roig, 3, 80º C, 14038, As Serna	-2.86210000	-78.97990000	53	\N	\N	\N	2026-07-17 13:52:35	2026-07-17 13:52:35	\N	0101000020E61000006D567DAEB6BE53C0840D4FAF94E506C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
749	INC-2026-00749	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	5	21	1	1	Travessera Adrián, 7, 6º A, 02658, Riera Baja	-3.25910000	-79.95040000	55	\N	\N	\N	2026-06-24 11:52:35	2026-06-24 11:52:35	\N	0101000020E61000009487855AD3FC53C018265305A3120AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
31	INC-2026-00031	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	5	18	2	2	Rúa Henríquez, 3, 75º A, 34166, Rosa de San Pedro	-2.17120000	-79.92420000	55	11	\N	\N	2026-07-01 20:52:28	2026-07-01 20:52:28	\N	0101000020E6100000A5BDC11726FB53C0029A081B9E5E01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
750	INC-2026-00750	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	2	8	3	6	Ruela Llorente, 6, 7º D, 97193, O Godoy de San Pedro	-2.16120000	-79.92920000	53	12	\N	\N	2026-06-27 11:52:35	2026-06-28 09:52:35	\N	0101000020E61000005DDC460378FB53C0EEEBC039234A01C0	482	\N	\N	\N	2026-06-28 09:52:35	\N	\N	\N	CLASSIFIED	\N	\N	\N
751	INC-2026-00751	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	7	\N	2	1	Travesía Nadia, 96, 70º A, 48142, Ávalos Alta	-2.90310000	-78.98690000	54	\N	\N	2026-07-24 04:52:35	2026-07-21 06:52:35	2026-07-24 04:52:35	\N	0101000020E6100000091B9E5E29BF53C00B24287E8C3907C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
752	INC-2026-00752	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	5	18	4	1	Avenida Daniel, 248, Ático 5º, 95648, Bermejo de Arriba	-2.85410000	-79.03490000	54	\N	\N	\N	2026-07-14 23:52:35	2026-07-14 23:52:35	\N	0101000020E610000058A835CD3BC253C0DA1B7C6132D506C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
753	INC-2026-00753	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	4	15	2	1	Praza Concepción, 9, Ático 0º, 10632, Vall Pantoja del Barco	-2.22620000	-79.85520000	53	\N	\N	\N	2026-07-21 17:52:35	2026-07-21 17:52:35	\N	0101000020E610000082E2C798BBF653C073D712F241CF01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
754	INC-2026-00754	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	4	14	4	1	Ruela Alcaráz, 3, 55º E, 43293, Villa Loya	-2.21820000	-79.83820000	53	\N	\N	2026-07-13 03:52:35	2026-07-10 22:52:35	2026-07-13 03:52:35	\N	0101000020E610000076E09C11A5F553C0C9E53FA4DFBE01C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
755	INC-2026-00755	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	4	14	2	1	Ruela Aranda, 19, 6º, 56907, O Quintana Medio	-2.20120000	-79.89220000	54	\N	\N	\N	2026-07-08 01:52:35	2026-07-08 01:52:35	\N	0101000020E6100000705F07CE19F953C040A4DFBE0E9C01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
756	INC-2026-00756	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	7	\N	3	6	Carrer Ángel, 6, Entre suelo 2º, 89923, La Orta	-3.28710000	-79.90540000	53	19	\N	\N	2026-06-28 10:52:35	2026-06-28 14:52:35	\N	0101000020E61000001973D712F2F953C0EB73B515FB4B0AC0	331	\N	\N	\N	2026-06-28 14:52:35	\N	\N	\N	CLASSIFIED	\N	\N	\N
757	INC-2026-00757	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	3	13	1	5	Camiño Pedraza, 264, 4º B, 34183, Lucio de la Sierra	-2.20920000	-79.85720000	53	10	\N	2026-07-19 15:52:35	2026-07-19 03:52:35	2026-07-19 15:52:35	\N	0101000020E61000006688635DDCF653C0EA95B20C71AC01C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
758	INC-2026-00758	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	3	13	4	1	Plaza Zambrano, 80, 05º B, 16091, Villa Martín	-2.18520000	-79.85520000	55	\N	\N	\N	2026-07-17 18:52:35	2026-07-17 18:52:35	\N	0101000020E610000082E2C798BBF653C0ECC039234A7B01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
759	INC-2026-00759	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	1	3	1	1	Avinguda Velázquez, 438, 0º, 11349, Villa Rojas de las Torres	-2.16620000	-79.87320000	54	\N	\N	\N	2026-07-16 04:52:35	2026-07-16 04:52:35	\N	0101000020E610000080B74082E2F753C0F8C264AA605401C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
780	INC-2026-00780	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	5	21	4	2	Travessera Paula, 78, Bajos, 97381, La Tórrez	-2.17220000	-79.90320000	53	\N	\N	\N	2026-06-30 17:52:35	2026-07-24 12:21:30	\N	0101000020E6100000D26F5F07CEF953C038F8C264AA6001C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
760	INC-2026-00760	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	4	16	2	1	Ruela Jimena, 68, 3º B, 44420, As Betancourt	-3.22910000	-79.96840000	55	\N	\N	\N	2026-06-30 02:52:35	2026-06-30 02:52:35	\N	0101000020E6100000925CFE43FAFD53C0DA1B7C6132D509C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
761	INC-2026-00761	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	4	14	4	1	Rúa Ávila, 51, Ático 6º, 09745, Córdova de las Torres	-2.18220000	-79.85720000	54	\N	\N	\N	2026-07-08 22:52:35	2026-07-08 22:52:35	\N	0101000020E61000006688635DDCF653C04CA60A46257501C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
762	INC-2026-00762	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	7	\N	2	5	Praza Alejandro, 591, Ático 0º, 59224, La Banda de Ulla	-2.20920000	-79.89020000	55	12	\N	2026-07-09 17:52:35	2026-07-07 18:52:35	2026-07-09 17:52:35	\N	0101000020E61000008CB96B09F9F853C0EA95B20C71AC01C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
763	INC-2026-00763	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	2	8	3	1	Camiño Gonzalo, 53, Entre suelo 4º, 35575, As Hernándes	-2.20320000	-79.86520000	54	\N	\N	\N	2026-06-25 02:52:35	2026-06-25 02:52:35	\N	0101000020E6100000F31FD26F5FF753C0AA60545227A001C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
764	INC-2026-00764	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	5	19	1	1	Travesía Antonio, 3, 9º F, 81662, Villa Luna del Mirador	-2.88610000	-79.05090000	54	\N	\N	\N	2026-06-23 17:52:35	2026-06-23 17:52:35	\N	0101000020E610000073D712F241C353C082E2C798BB1607C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
765	INC-2026-00765	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	3	12	3	1	Avinguda Ana, 316, 7º D, 47811, Vall Simón	-3.20910000	-79.92540000	54	\N	\N	\N	2026-07-10 10:52:35	2026-07-10 10:52:35	\N	0101000020E6100000FAEDEBC039FB53C0B1BFEC9E3CAC09C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
766	INC-2026-00766	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	2	7	3	1	Carrer Amparo, 9, 16º 2º, 72691, O Barraza	-2.91110000	-78.96990000	55	\N	\N	2026-06-28 08:52:35	2026-06-25 13:52:35	2026-06-28 08:52:35	\N	0101000020E6100000FC1873D712BE53C0B515FBCBEE4907C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
767	INC-2026-00767	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	4	14	3	6	Plaça Isaac, 896, 5º E, 70026, Adame del Bages	-2.21120000	-79.92220000	54	9	\N	\N	2026-07-18 19:52:35	2026-07-19 12:52:35	\N	0101000020E6100000C217265305FB53C0545227A089B001C0	482	\N	\N	\N	2026-07-19 12:52:35	\N	\N	\N	CLASSIFIED	\N	\N	\N
768	INC-2026-00768	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	4	15	3	6	Passeig Delacrúz, 9, Ático 5º, 45082, Los Madrid	-2.14720000	-79.85820000	55	9	\N	\N	2026-07-10 10:52:35	2026-07-10 20:52:35	\N	0101000020E6100000575BB1BFECF653C005C58F31772D01C0	482	\N	\N	\N	2026-07-10 20:52:35	\N	\N	\N	CLASSIFIED	\N	\N	\N
769	INC-2026-00769	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	3	12	1	5	Travessera Guillermo, 6, 9º, 17631, Polo del Mirador	-2.15220000	-79.93320000	54	10	\N	2026-07-19 04:52:35	2026-07-16 19:52:35	2026-07-19 04:52:35	\N	0101000020E610000024287E8CB9FB53C00F9C33A2B43701C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
32	INC-2026-00032	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	3	10	1	1	Passeig Sosa, 43, 1º E, 71164, A Alanis	-3.22010000	-79.97640000	54	\N	\N	\N	2026-07-09 00:52:28	2026-07-09 00:52:28	\N	0101000020E61000001FF46C567DFE53C0FBCBEEC9C3C209C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
770	INC-2026-00770	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	3	13	3	1	Camiño Oriol, 92, 2º F, 73906, L' Ocampo	-2.21420000	-79.92420000	53	\N	\N	\N	2026-07-22 10:52:35	2026-07-22 10:52:35	\N	0101000020E6100000A5BDC11726FB53C0F46C567DAEB601C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
771	INC-2026-00771	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	7	\N	1	6	Avinguda Juan José, 20, 93º A, 35242, Ávalos del Bages	-2.24220000	-79.87320000	54	9	\N	\N	2026-07-12 18:52:35	2026-07-13 18:52:35	\N	0101000020E610000080B74082E2F753C0C7BAB88D06F001C0	482	\N	\N	\N	2026-07-13 18:52:35	\N	\N	\N	CLASSIFIED	\N	\N	\N
772	INC-2026-00772	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	2	9	1	5	Praza Iker, 49, 58º E, 39674, A Corrales Baja	-2.22820000	-79.88720000	53	13	\N	2026-07-15 08:52:35	2026-07-12 18:52:35	2026-07-15 08:52:35	\N	0101000020E6100000B84082E2C7F853C0DE9387855AD301C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
773	INC-2026-00773	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	3	11	1	5	Plaza Guerra, 63, 60º E, 91041, Becerra del Puerto	-3.26410000	-79.99940000	53	19	\N	2026-07-05 16:52:35	2026-07-03 13:52:35	2026-07-05 16:52:35	\N	0101000020E6100000D5E76A2BF6FF53C022FDF675E01C0AC0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
774	INC-2026-00774	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	3	13	2	1	Camino Lozano, 2, 8º, 33464, Vall Meléndez	-2.22820000	-79.84020000	55	\N	\N	\N	2026-07-01 23:52:35	2026-07-01 23:52:35	\N	0101000020E6100000598638D6C5F553C0DE9387855AD301C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
776	INC-2026-00776	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	3	10	3	1	Travessera Eric, 88, 52º C, 64857, Tejada Medio	-2.20620000	-79.86120000	55	\N	\N	\N	2026-07-21 10:52:35	2026-07-21 10:52:35	\N	0101000020E61000002CD49AE61DF753C04A7B832F4CA601C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
777	INC-2026-00777	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	1	3	3	1	Camino Orozco, 9, 0º, 75208, Lucio del Penedès	-2.17320000	-79.90820000	54	\N	\N	\N	2026-06-30 05:52:35	2026-06-30 05:52:35	\N	0101000020E61000008A8EE4F21FFA53C06D567DAEB66201C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
778	INC-2026-00778	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	2	9	4	1	Avinguda Mateo, 487, 5º, 00003, Campos de Lemos	-2.21720000	-79.87520000	53	\N	\N	2026-06-26 01:52:35	2026-06-25 17:52:35	2026-06-26 01:52:35	\N	0101000020E6100000645DDC4603F853C09487855AD3BC01C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
779	INC-2026-00779	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	2	7	2	1	Rúa Miguel Ángel, 2, 53º 2º, 78752, La Ruiz	-2.23220000	-79.92720000	54	\N	\N	\N	2026-07-23 10:52:35	2026-07-23 10:52:35	\N	0101000020E61000007A36AB3E57FB53C0B30C71AC8BDB01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
781	INC-2026-00781	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	1	5	2	1	Camiño Luis, 701, 76º A, 91345, Las Morales del Bages	-2.24220000	-79.87320000	54	\N	\N	\N	2026-07-08 08:52:35	2026-07-08 08:52:35	\N	0101000020E610000080B74082E2F753C0C7BAB88D06F001C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
782	INC-2026-00782	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	2	8	2	1	Praza Juana, 16, Bajo 7º, 88623, Os Rangel del Mirador	-2.21020000	-79.84120000	55	\N	\N	\N	2026-07-07 18:52:35	2026-07-07 18:52:35	\N	0101000020E61000004B598638D6F553C01FF46C567DAE01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
783	INC-2026-00783	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	1	3	3	1	Travessera Salcido, 3, 40º E, 20608, Hernádez del Pozo	-2.93010000	-79.04690000	53	\N	\N	2026-07-08 07:52:35	2026-07-07 20:52:35	2026-07-08 07:52:35	\N	0101000020E6100000AC8BDB6800C353C0A913D044D87007C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
784	INC-2026-00784	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	4	17	3	1	Plaça Jorge, 6, Entre suelo 2º, 23854, Esquibel de Arriba	-2.93710000	-78.97390000	55	\N	\N	\N	2026-07-23 07:52:35	2026-07-23 07:52:35	\N	0101000020E6100000C364AA6054BE53C01EA7E8482E7F07C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
785	INC-2026-00785	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	4	14	4	1	Camiño Martín, 902, Ático 5º, 53110, San Villarreal	-3.30610000	-79.95240000	54	\N	\N	\N	2026-06-27 19:52:35	2026-06-27 19:52:35	\N	0101000020E6100000772D211FF4FC53C0DE718A8EE4720AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
786	INC-2026-00786	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	3	11	2	6	Passeig Ángel, 318, 5º F, 26184, Los Jimínez	-2.20320000	-79.89720000	55	11	\N	\N	2026-07-12 07:52:35	2026-07-13 05:52:35	\N	0101000020E6100000287E8CB96BF953C0AA60545227A001C0	482	\N	\N	\N	2026-07-13 05:52:35	\N	\N	\N	CLASSIFIED	\N	\N	\N
787	INC-2026-00787	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	7	\N	2	1	Paseo Alcaráz, 416, 8º, 56552, Vall Bermúdez	-2.16120000	-79.92320000	53	\N	\N	\N	2026-06-28 13:52:35	2026-06-28 13:52:35	\N	0101000020E6100000B3EA73B515FB53C0EEEBC039234A01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
788	INC-2026-00788	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	6	22	4	1	Ruela Oliver, 6, 43º E, 86275, Pereira de las Torres	-3.24410000	-79.92540000	55	\N	\N	\N	2026-07-02 14:52:35	2026-07-02 14:52:35	\N	0101000020E6100000FAEDEBC039FB53C0F9A067B3EAF309C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
789	INC-2026-00789	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	4	17	3	1	Paseo Saldivar, 25, 15º B, 98413, Los Berríos	-2.16920000	-79.89620000	55	\N	\N	2026-06-27 06:52:35	2026-06-25 04:52:35	2026-06-27 06:52:35	\N	0101000020E610000036AB3E575BF953C098DD9387855A01C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
790	INC-2026-00790	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	7	\N	1	1	Avenida Marta, 580, 9º F, 84340, El Pacheco de las Torres	-2.23120000	-79.87420000	55	\N	\N	\N	2026-07-15 14:52:35	2026-07-15 14:52:35	\N	0101000020E6100000728A8EE4F2F753C07DAEB6627FD901C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
791	INC-2026-00791	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	3	12	2	5	Carrer Alex, 91, 5º, 70841, A Iglesias del Mirador	-2.17620000	-79.89420000	53	13	\N	2026-07-10 06:52:35	2026-07-09 00:52:35	2026-07-10 06:52:35	\N	0101000020E61000005305A3923AF953C00D71AC8BDB6801C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
792	INC-2026-00792	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	1	4	2	1	Paseo Vela, 4, Bajos, 15800, Os Oliva del Bages	-2.16320000	-79.84720000	54	\N	\N	\N	2026-07-20 06:52:35	2026-07-20 06:52:35	\N	0101000020E6100000F54A598638F653C058A835CD3B4E01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
33	INC-2026-00033	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	3	10	2	6	Rúa Elena, 61, 8º B, 49853, La Vélez	-2.85110000	-79.01290000	53	29	\N	\N	2026-07-10 10:52:28	2026-07-10 11:52:28	\N	0101000020E61000009487855AD3C053C03B014D840DCF06C0	11	\N	\N	\N	2026-07-10 11:52:28	\N	\N	\N	CLASSIFIED	\N	\N	\N
34	INC-2026-00034	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	6	23	3	7	Avinguda Nicolás, 64, 0º, 33141, Las Cervántez	-3.25410000	-79.90640000	53	15	\N	\N	2026-07-18 13:52:28	2026-07-18 13:52:28	\N	0101000020E61000000B46257502FA53C00E4FAF9465080AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
35	INC-2026-00035	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	6	24	4	6	Paseo Castellano, 462, 97º E, 54865, Os González	-2.23920000	-79.87220000	54	12	\N	\N	2026-07-23 23:52:28	2026-07-24 15:52:28	\N	0101000020E61000008FE4F21FD2F753C027A089B0E1E901C0	482	\N	\N	\N	2026-07-24 15:52:28	\N	\N	\N	CLASSIFIED	\N	\N	\N
36	INC-2026-00036	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	4	15	1	1	Travessera Mojica, 10, 8º 6º, 63946, Los Pulido	-2.23820000	-79.91220000	54	\N	\N	\N	2026-06-24 02:52:28	2026-06-24 02:52:28	\N	0101000020E610000051DA1B7C61FA53C0F241CF66D5E701C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
37	INC-2026-00037	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	5	18	3	3	Camiño Jaimes, 4, 6º C, 53810, Villa Álvarez del Puerto	-3.23510000	-79.97540000	55	16	\N	\N	2026-06-24 15:52:28	2026-06-24 15:52:28	\N	0101000020E61000002D211FF46CFE53C01A51DA1B7CE109C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
38	INC-2026-00038	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	3	13	2	2	Plaça Marco, 181, 1º A, 84244, Barreto del Barco	-3.21210000	-79.90940000	54	18	\N	\N	2026-06-27 23:52:28	2026-06-27 23:52:28	\N	0101000020E6100000E0BE0E9C33FA53C051DA1B7C61B209C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
39	INC-2026-00039	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	4	15	2	2	Passeig Mara, 580, 8º D, 99406, Os Font del Pozo	-2.19420000	-79.87520000	54	10	\N	\N	2026-07-10 23:52:28	2026-07-10 23:52:28	\N	0101000020E6100000645DDC4603F853C0CB10C7BAB88D01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
40	INC-2026-00040	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	5	18	1	3	Camino Moya, 4, Bajos, 07643, L' Griego del Penedès	-2.18920000	-79.91820000	54	12	\N	\N	2026-06-28 10:52:28	2026-06-28 10:52:28	\N	0101000020E6100000FBCBEEC9C3FA53C0C139234A7B8301C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
41	INC-2026-00041	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	5	21	1	6	Avenida Inmaculada, 140, 6º F, 43128, El Delafuente	-2.23920000	-79.90920000	55	9	\N	\N	2026-07-01 10:52:28	2026-07-02 05:52:28	\N	0101000020E61000007C61325530FA53C027A089B0E1E901C0	482	\N	\N	\N	2026-07-02 05:52:28	\N	\N	\N	CLASSIFIED	\N	\N	\N
42	INC-2026-00042	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	3	12	3	1	Avinguda Ana María, 6, 05º F, 20109, La Caballero	-2.20820000	-79.89120000	53	\N	\N	\N	2026-07-24 09:52:28	2026-07-24 09:52:28	\N	0101000020E61000007E8CB96B09F953C0B537F8C264AA01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
793	INC-2026-00793	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	2	8	1	1	Plaza Cardona, 8, 8º F, 36938, Serrano de Lemos	-2.23920000	-79.87020000	53	\N	\N	2026-07-21 18:52:35	2026-07-19 11:52:35	2026-07-21 18:52:35	\N	0101000020E6100000AB3E575BB1F753C027A089B0E1E901C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
794	INC-2026-00794	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	2	6	3	1	Passeig Lucas, 3, 1º E, 11779, A Candelaria	-2.18120000	-79.91520000	55	\N	\N	\N	2026-07-22 16:52:35	2026-07-22 16:52:35	\N	0101000020E6100000265305A392FA53C0174850FC187301C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
795	INC-2026-00795	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	5	19	4	1	Ruela Quintero, 9, 70º C, 21403, A Carranza del Bages	-2.94510000	-78.99990000	54	\N	\N	2026-06-29 21:52:35	2026-06-26 22:52:35	2026-06-29 21:52:35	\N	0101000020E61000004ED1915CFEBF53C0C898BB96908F07C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
43	INC-2026-00043	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	4	14	1	1	Passeig Claudia, 3, 4º E, 38744, Román del Barco	-2.23920000	-79.85020000	53	\N	\N	\N	2026-07-06 13:52:28	2026-07-06 13:52:28	\N	0101000020E6100000CAC342AD69F653C027A089B0E1E901C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
796	INC-2026-00796	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	3	10	1	1	Plaza Pulido, 336, 3º E, 51023, As Lucas	-2.15520000	-79.91820000	54	\N	\N	\N	2026-06-29 06:52:35	2026-06-29 06:52:35	\N	0101000020E6100000FBCBEEC9C3FA53C0AEB6627FD93D01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
797	INC-2026-00797	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	1	2	3	6	Ronda Bañuelos, 5, Entre suelo 5º, 87202, Peralta de las Torres	-2.18820000	-79.93420000	54	13	\N	\N	2026-07-17 01:52:35	2026-07-17 19:52:35	\N	0101000020E610000016FBCBEEC9FB53C08CDB68006F8101C0	482	\N	\N	\N	2026-07-17 19:52:35	\N	\N	\N	CLASSIFIED	\N	\N	\N
798	INC-2026-00798	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	4	16	2	6	Passeig Yaiza, 18, 65º C, 48009, Agosto de la Sierra	-2.85110000	-78.98590000	55	30	\N	\N	2026-07-18 12:52:35	2026-07-18 17:52:35	\N	0101000020E6100000174850FC18BF53C03B014D840DCF06C0	11	\N	\N	\N	2026-07-18 17:52:35	\N	\N	\N	CLASSIFIED	\N	\N	\N
799	INC-2026-00799	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	6	22	2	1	Calle Gloria, 12, Entre suelo 3º, 40086, Villa Montoya del Vallès	-3.29010000	-79.90740000	54	\N	\N	\N	2026-07-11 17:52:35	2026-07-11 17:52:35	\N	0101000020E6100000FC1873D712FA53C08A8EE4F21F520AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
800	INC-2026-00800	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	1	4	3	1	Carrer Jorge, 8, 8º C, 37076, Quiñones de Ulla	-2.17920000	-79.90220000	53	\N	\N	\N	2026-07-02 03:52:35	2026-07-02 03:52:35	\N	0101000020E6100000E09C11A5BDF953C0AC8BDB68006F01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
801	INC-2026-00801	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	7	\N	4	1	Camiño Álvaro, 19, 74º D, 04668, Beltrán Alta	-3.22810000	-79.96940000	54	\N	\N	2026-07-13 05:52:35	2026-07-11 09:52:35	2026-07-13 05:52:35	\N	0101000020E6100000832F4CA60AFE53C0A5BDC11726D309C0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
802	INC-2026-00802	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	6	24	3	1	Travesía Rodrigo, 381, Bajos, 29886, A Mercado Alta	-3.29310000	-79.91940000	55	\N	\N	\N	2026-07-22 19:52:35	2026-07-22 19:52:35	\N	0101000020E610000050FC1873D7FA53C02AA913D044580AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
803	INC-2026-00803	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	4	15	1	6	Camiño Maestas, 632, 7º C, 11729, Atencio de Ulla	-3.24110000	-79.93140000	55	18	\N	\N	2026-07-15 09:52:35	2026-07-15 17:52:35	\N	0101000020E6100000A4DFBE0E9CFB53C0598638D6C5ED09C0	331	\N	\N	\N	2026-07-15 17:52:35	\N	\N	\N	CLASSIFIED	\N	\N	\N
805	INC-2026-00805	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	2	6	3	5	Travesía Ona, 1, 09º D, 22220, As Partida	-3.23410000	-79.92640000	53	15	\N	2026-07-10 10:52:35	2026-07-10 01:52:35	2026-07-10 10:52:35	\N	0101000020E6100000ECC039234AFB53C0E5F21FD26FDF09C0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
806	INC-2026-00806	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	7	\N	4	1	Camiño Pastor, 44, Bajos, 00262, La Quintanilla Baja	-2.14720000	-79.92420000	54	\N	\N	\N	2026-07-24 02:52:36	2026-07-24 02:52:36	\N	0101000020E6100000A5BDC11726FB53C005C58F31772D01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
807	INC-2026-00807	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	3	13	3	6	Camino Sauceda, 149, 6º, 09993, Mercado de Ulla	-2.17420000	-79.86320000	53	12	\N	\N	2026-06-29 01:52:36	2026-06-29 20:52:36	\N	0101000020E6100000107A36AB3EF753C0A2B437F8C26401C0	482	\N	\N	\N	2026-06-29 20:52:36	\N	\N	\N	CLASSIFIED	\N	\N	\N
808	INC-2026-00808	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	6	23	4	1	Praza Mateo, 826, 9º D, 84110, Vallejo de la Sierra	-2.91010000	-79.01490000	55	\N	\N	\N	2026-06-23 21:52:36	2026-06-23 21:52:36	\N	0101000020E6100000772D211FF4C053C080B74082E24707C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
809	INC-2026-00809	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	7	\N	2	6	Passeig Ana, 249, Ático 5º, 61244, Vall Ibarra del Pozo	-3.29810000	-79.95940000	55	17	\N	\N	2026-07-02 13:52:36	2026-07-03 09:52:36	\N	0101000020E610000013F241CF66FD53C03480B74082620AC0	331	\N	\N	\N	2026-07-03 09:52:36	\N	\N	\N	CLASSIFIED	\N	\N	\N
810	INC-2026-00810	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	1	1	3	1	Ruela Samuel, 722, Entre suelo 8º, 45729, Villa Luis	-3.21310000	-79.96240000	53	\N	\N	\N	2026-07-01 00:52:36	2026-07-01 00:52:36	\N	0101000020E6100000E86A2BF697FD53C08638D6C56DB409C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
811	INC-2026-00811	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	7	\N	1	6	Ronda Andrés, 9, 20º F, 34996, O Blázquez	-2.16120000	-79.89020000	54	12	\N	\N	2026-07-08 10:52:36	2026-07-08 18:52:36	\N	0101000020E61000008CB96B09F9F853C0EEEBC039234A01C0	482	\N	\N	\N	2026-07-08 18:52:36	\N	\N	\N	CLASSIFIED	\N	\N	\N
812	INC-2026-00812	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	5	21	1	1	Avenida Maestas, 91, 4º, 16935, Armendáriz Alta	-2.16720000	-79.85320000	54	\N	\N	\N	2026-07-10 19:52:36	2026-07-10 19:52:36	\N	0101000020E61000009F3C2CD49AF653C02D211FF46C5601C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
813	INC-2026-00813	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	5	21	3	1	Avinguda Aaron, 949, 5º A, 51681, Os Bustamante	-2.85910000	-78.96190000	53	\N	\N	\N	2026-06-28 09:52:36	2026-06-28 09:52:36	\N	0101000020E61000006F8104C58FBD53C0E5F21FD26FDF06C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
814	INC-2026-00814	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	6	24	1	5	Passeig Jon, 629, 6º F, 48835, O Bustamante	-2.19920000	-79.90420000	53	10	\N	2026-07-23 18:52:36	2026-07-22 23:52:36	2026-07-23 18:52:36	\N	0101000020E6100000C442AD69DEF953C0D5E76A2BF69701C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
815	INC-2026-00815	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	5	20	1	6	Passeig Merino, 39, 1º D, 74580, Ulloa del Mirador	-2.15320000	-79.85420000	53	13	\N	\N	2026-07-08 08:52:36	2026-07-08 22:52:36	\N	0101000020E6100000910F7A36ABF653C044FAEDEBC03901C0	482	\N	\N	\N	2026-07-08 22:52:36	\N	\N	\N	CLASSIFIED	\N	\N	\N
816	INC-2026-00816	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	1	2	3	6	Paseo Alarcón, 97, Entre suelo 6º, 66521, Ruiz de San Pedro	-2.23320000	-79.91020000	54	13	\N	\N	2026-07-07 16:52:36	2026-07-08 15:52:36	\N	0101000020E61000006E3480B740FA53C0E86A2BF697DD01C0	482	\N	\N	\N	2026-07-08 15:52:36	\N	\N	\N	CLASSIFIED	\N	\N	\N
817	INC-2026-00817	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	5	21	2	5	Camino Marc, 886, 8º C, 32278, A Martí	-2.21520000	-79.92820000	55	10	\N	2026-07-17 11:52:36	2026-07-14 22:52:36	2026-07-17 11:52:36	\N	0101000020E61000006C09F9A067FB53C029CB10C7BAB801C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
705	INC-2026-00705	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	7	\N	4	1	Travesía Castro, 304, 16º B, 49006, Villa De la Torre	-2.95010000	-79.03390000	54	\N	\N	\N	2026-06-26 03:52:34	2026-06-26 03:52:34	\N	0101000020E610000067D5E76A2BC253C0D26F5F07CE9907C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
818	INC-2026-00818	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	5	20	3	1	Calle Galván, 351, 1º C, 23409, La Aguirre	-3.25610000	-79.96440000	53	\N	\N	\N	2026-07-18 10:52:36	2026-07-18 10:52:36	\N	0101000020E6100000CB10C7BAB8FD53C0780B24287E0C0AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
819	INC-2026-00819	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	5	21	3	1	Carrer Mascareñas, 4, 2º B, 79194, La Velasco del Pozo	-2.17620000	-79.83820000	55	\N	\N	\N	2026-06-24 16:52:36	2026-06-24 16:52:36	\N	0101000020E610000076E09C11A5F553C00D71AC8BDB6801C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
820	INC-2026-00820	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	6	23	1	5	Avenida Bruno, 6, 4º 1º, 74409, As Roybal de la Sierra	-2.88910000	-79.03390000	54	27	\N	2026-07-09 01:52:36	2026-07-08 00:52:36	2026-07-09 01:52:36	\N	0101000020E610000067D5E76A2BC253C022FDF675E01C07C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
821	INC-2026-00821	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	7	\N	2	1	Avenida Vázquez, 3, Entre suelo 8º, 70080, Molina del Barco	-2.87710000	-78.96190000	53	\N	\N	\N	2026-07-04 09:52:36	2026-07-04 09:52:36	\N	0101000020E61000006F8104C58FBD53C0A3923A014D0407C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
822	INC-2026-00822	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	1	1	1	6	Ruela Gabriela, 206, 94º F, 80805, San Jiménez	-2.17120000	-79.91120000	55	13	\N	\N	2026-07-04 08:52:36	2026-07-04 20:52:36	\N	0101000020E61000005F07CE1951FA53C0029A081B9E5E01C0	482	\N	\N	\N	2026-07-04 20:52:36	\N	\N	\N	CLASSIFIED	\N	\N	\N
823	INC-2026-00823	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	1	2	3	6	Calle Jorge, 32, 63º D, 49744, Vega de Ulla	-2.19220000	-79.90020000	53	12	\N	\N	2026-07-18 21:52:36	2026-07-19 00:52:36	\N	0101000020E6100000FDF675E09CF953C061545227A08901C0	482	\N	\N	\N	2026-07-19 00:52:36	\N	\N	\N	CLASSIFIED	\N	\N	\N
824	INC-2026-00824	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	6	24	4	1	Plaça Ian, 22, 7º F, 65141, Las Granados	-2.87910000	-79.01890000	55	\N	\N	\N	2026-07-01 17:52:36	2026-07-01 17:52:36	\N	0101000020E61000003E7958A835C153C00E4FAF94650807C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
825	INC-2026-00825	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	5	21	1	6	Calle Patricia, 254, 31º B, 04344, Las Ornelas	-3.23710000	-79.96240000	53	19	\N	\N	2026-07-15 22:52:36	2026-07-16 00:52:36	\N	0101000020E6100000E86A2BF697FD53C0840D4FAF94E509C0	331	\N	\N	\N	2026-07-16 00:52:36	\N	\N	\N	CLASSIFIED	\N	\N	\N
826	INC-2026-00826	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	2	6	4	5	Rúa Biel, 66, 6º F, 59571, L' Villalpando del Vallès	-2.86310000	-79.02590000	55	31	\N	2026-07-20 21:52:36	2026-07-18 17:52:36	2026-07-20 21:52:36	\N	0101000020E6100000D93D7958A8C153C0BA6B09F9A0E706C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
827	INC-2026-00827	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	4	16	3	5	Avenida Baca, 77, Entre suelo 6º, 57139, Yáñez del Pozo	-2.20520000	-79.89420000	54	12	\N	2026-07-13 01:52:36	2026-07-10 07:52:36	2026-07-13 01:52:36	\N	0101000020E61000005305A3923AF953C0151DC9E53FA401C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
828	INC-2026-00828	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	1	1	1	6	Calle Colunga, 59, Ático 6º, 59215, Villa Longoria	-2.20620000	-79.91720000	55	12	\N	\N	2026-07-07 18:52:36	2026-07-07 20:52:36	\N	0101000020E610000009F9A067B3FA53C04A7B832F4CA601C0	482	\N	\N	\N	2026-07-07 20:52:36	\N	\N	\N	CLASSIFIED	\N	\N	\N
829	INC-2026-00829	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	4	16	1	1	Rúa Ariadna, 857, 79º A, 25715, L' Vallejo Alta	-2.89410000	-79.00390000	54	\N	\N	\N	2026-06-28 16:52:36	2026-06-28 16:52:36	\N	0101000020E6100000151DC9E53FC053C02CD49AE61D2707C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
830	INC-2026-00830	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	6	24	2	1	Paseo Ornelas, 136, 04º C, 32208, Arguello de Ulla	-3.30410000	-79.94540000	54	\N	\N	\N	2026-07-23 11:52:36	2026-07-23 11:52:36	\N	0101000020E6100000DC68006F81FC53C074B515FBCB6E0AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
831	INC-2026-00831	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	1	4	4	1	Plaça Cervantes, 1, 03º E, 13898, Los Henríquez de Lemos	-2.16420000	-79.83820000	54	\N	\N	\N	2026-07-13 05:52:36	2026-07-13 05:52:36	\N	0101000020E610000076E09C11A5F553C08E06F016485001C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
832	INC-2026-00832	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	2	6	3	1	Praza Crespo, 6, 12º C, 62188, Os Arribas de la Sierra	-2.22820000	-79.83820000	53	\N	\N	\N	2026-07-11 16:52:36	2026-07-11 16:52:36	\N	0101000020E610000076E09C11A5F553C0DE9387855AD301C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
833	INC-2026-00833	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	3	12	1	1	Camiño Villagómez, 8, 1º B, 20425, Baca de Lemos	-2.91210000	-79.04290000	54	\N	\N	2026-07-17 19:52:36	2026-07-16 11:52:36	2026-07-17 19:52:36	\N	0101000020E6100000E63FA4DFBEC253C0EB73B515FB4B07C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
834	INC-2026-00834	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	1	5	3	5	Avenida Matías, 33, 1º A, 83244, Montalvo del Mirador	-2.89610000	-78.95590000	55	29	\N	2026-06-29 01:52:36	2026-06-28 23:52:36	2026-06-29 01:52:36	\N	0101000020E6100000C58F31772DBD53C097900F7A362B07C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
835	INC-2026-00835	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	7	\N	4	1	Passeig Miguel, 487, 5º 7º, 87227, San Cotto de Ulla	-3.22310000	-79.95940000	53	\N	\N	\N	2026-07-03 06:52:36	2026-07-03 06:52:36	\N	0101000020E610000013F241CF66FD53C09BE61DA7E8C809C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
836	INC-2026-00836	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	3	12	1	1	Paseo Echevarría, 91, 81º C, 45550, L' Chacón	-2.24320000	-79.88120000	53	\N	\N	2026-07-17 12:52:36	2026-07-14 14:52:36	2026-07-17 12:52:36	\N	0101000020E61000000E4FAF9465F853C0FC1873D712F201C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
837	INC-2026-00837	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	5	18	4	1	Rúa Cristina, 50, 2º A, 17048, Vall Corral	-2.88510000	-79.00890000	55	\N	\N	2026-07-21 04:52:36	2026-07-19 06:52:36	2026-07-21 04:52:36	\N	0101000020E6100000CD3B4ED191C053C04D840D4FAF1407C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
838	INC-2026-00838	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	7	\N	4	1	Avenida Alejandro, 181, 47º B, 47940, Marín de San Pedro	-3.30310000	-79.97440000	53	\N	\N	\N	2026-07-01 07:52:36	2026-07-01 07:52:36	\N	0101000020E61000003C4ED1915CFE53C03F575BB1BF6C0AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
804	INC-2026-00804	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	1	3	4	1	Passeig Martina, 5, 16º E, 74633, A Sisneros	-2.14920000	-79.87120000	55	\N	\N	2026-06-30 19:52:35	2026-06-30 13:52:35	2026-06-30 19:52:35	\N	0101000020E61000009D11A5BDC1F753C06F8104C58F3101C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
839	INC-2026-00839	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	4	17	1	1	Plaça Figueroa, 55, 97º C, 95734, Ibáñez del Penedès	-2.21820000	-79.86820000	55	\N	\N	\N	2026-07-04 21:52:36	2026-07-04 21:52:36	\N	0101000020E6100000C898BB9690F753C0C9E53FA4DFBE01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
840	INC-2026-00840	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	3	11	3	1	Praza Domenech, 753, 14º B, 18152, Las Más	-3.27810000	-79.91240000	55	\N	\N	\N	2026-07-10 21:52:36	2026-07-10 21:52:36	\N	0101000020E6100000B537F8C264FA53C00B24287E8C390AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
841	INC-2026-00841	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	5	20	1	1	Passeig Orosco, 5, 0º C, 54481, L' Álvarez de Ulla	-2.95010000	-79.03790000	55	\N	\N	\N	2026-07-19 12:52:36	2026-07-19 12:52:36	\N	0101000020E61000002D211FF46CC253C0D26F5F07CE9907C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
842	INC-2026-00842	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	1	4	4	5	Praza Valverde, 7, 6º F, 64422, Alonso Medio	-2.20420000	-79.93320000	53	9	\N	2026-07-24 19:52:36	2026-07-23 19:52:36	2026-07-24 19:52:36	\N	0101000020E610000024287E8CB9FB53C0E0BE0E9C33A201C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
843	INC-2026-00843	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	7	\N	1	1	Avinguda Natalia, 9, 05º A, 40661, Solorzano de San Pedro	-2.94810000	-78.98590000	54	\N	\N	\N	2026-07-18 19:52:36	2026-07-18 19:52:36	\N	0101000020E6100000174850FC18BF53C068B3EA73B59507C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
844	INC-2026-00844	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	2	6	1	5	Ronda Leyva, 3, 6º F, 15691, Vall Casanova del Penedès	-3.23610000	-79.97240000	53	17	\N	2026-07-16 09:52:36	2026-07-16 00:52:36	2026-07-16 09:52:36	\N	0101000020E610000058A835CD3BFE53C04FAF946588E309C0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
845	INC-2026-00845	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	2	8	4	1	Ronda Erik, 845, 3º, 91274, Blasco del Penedès	-2.19420000	-79.88220000	54	\N	\N	\N	2026-07-13 14:52:36	2026-07-13 14:52:36	\N	0101000020E6100000FF21FDF675F853C0CB10C7BAB88D01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
846	INC-2026-00846	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	7	\N	3	1	Avinguda Prado, 29, 1º E, 10215, Vall Ocasio de Ulla	-2.89910000	-78.99690000	55	\N	\N	\N	2026-07-10 01:52:36	2026-07-10 01:52:36	\N	0101000020E61000007958A835CDBF53C036AB3E575B3107C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
847	INC-2026-00847	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	1	3	1	6	Praza Simón, 17, 37º 6º, 14903, As Díez de las Torres	-2.23220000	-79.85520000	53	12	\N	\N	2026-06-28 09:52:36	2026-06-28 18:52:36	\N	0101000020E610000082E2C798BBF653C0B30C71AC8BDB01C0	482	\N	\N	\N	2026-06-28 18:52:36	\N	\N	\N	CLASSIFIED	\N	\N	\N
848	INC-2026-00848	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	2	9	4	1	Travessera Juana, 38, 6º B, 62405, Iglesias de Ulla	-3.21710000	-79.96340000	55	\N	\N	\N	2026-06-24 13:52:36	2026-06-24 13:52:36	\N	0101000020E6100000D93D7958A8FD53C05BB1BFEC9EBC09C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
849	INC-2026-00849	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	5	19	1	6	Ruela Serrano, 3, Bajos, 91327, El Sola	-2.89210000	-78.95790000	53	27	\N	\N	2026-06-29 16:52:36	2026-06-30 00:52:36	\N	0101000020E6100000A835CD3B4EBD53C0C2172653052307C0	11	\N	\N	\N	2026-06-30 00:52:36	\N	\N	\N	CLASSIFIED	\N	\N	\N
850	INC-2026-00850	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	5	19	4	5	Camino Ruelas, 29, 5º E, 32840, Os Delgado del Barco	-2.21820000	-79.91020000	55	13	\N	2026-07-15 11:52:36	2026-07-12 12:52:36	2026-07-15 11:52:36	\N	0101000020E61000006E3480B740FA53C0C9E53FA4DFBE01C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
851	INC-2026-00851	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	4	15	3	1	Travesía Solano, 5, 48º F, 45618, L' Guillen del Puerto	-2.15420000	-79.84020000	53	\N	\N	\N	2026-07-05 10:52:36	2026-07-05 10:52:36	\N	0101000020E6100000598638D6C5F553C07958A835CD3B01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
852	INC-2026-00852	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	6	23	2	1	Ruela Francisco, 55, 5º E, 74525, Chacón del Vallès	-2.20620000	-79.92620000	55	\N	\N	\N	2026-07-08 17:52:36	2026-07-08 17:52:36	\N	0101000020E610000088635DDC46FB53C04A7B832F4CA601C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
853	INC-2026-00853	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	4	14	3	1	Camiño Villar, 160, 80º F, 29525, Os Arevalo	-2.89910000	-78.97890000	54	\N	\N	\N	2026-07-08 00:52:36	2026-07-08 00:52:36	\N	0101000020E61000007B832F4CA6BE53C036AB3E575B3107C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
854	INC-2026-00854	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	6	24	1	5	Paseo Echevarría, 20, 37º F, 85338, A Matos	-3.26110000	-79.96040000	53	19	\N	2026-06-26 11:52:36	2026-06-25 02:52:36	2026-06-26 11:52:36	\N	0101000020E610000005C58F3177FD53C082E2C798BB160AC0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
855	INC-2026-00855	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	1	2	3	1	Passeig Escobar, 8, 60º E, 54033, Os Villanueva del Vallès	-2.24120000	-79.86720000	55	\N	\N	\N	2026-07-22 18:52:36	2026-07-22 18:52:36	\N	0101000020E6100000D6C56D3480F753C0925CFE43FAED01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
856	INC-2026-00856	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	2	8	1	1	Travessera Raúl, 27, Ático 6º, 00161, Vall Mayorga	-2.85110000	-79.01790000	55	\N	\N	2026-06-28 05:52:36	2026-06-27 07:52:36	2026-06-28 05:52:36	\N	0101000020E61000004CA60A4625C153C03B014D840DCF06C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
857	INC-2026-00857	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	5	20	1	1	Travessera Covarrubias, 46, 71º A, 38307, Montenegro de Lemos	-2.23920000	-79.93520000	53	\N	\N	\N	2026-07-16 14:52:36	2026-07-16 14:52:36	\N	0101000020E610000007CE1951DAFB53C027A089B0E1E901C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
858	INC-2026-00858	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	7	\N	3	1	Carrer Alejandra, 7, 2º E, 01119, Os Rangel de Lemos	-2.17220000	-79.89720000	53	\N	\N	\N	2026-07-21 16:52:36	2026-07-21 16:52:36	\N	0101000020E6100000287E8CB96BF953C038F8C264AA6001C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
859	INC-2026-00859	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	6	22	1	1	Travessera Luisa, 786, 82º B, 87139, A Castaño de Ulla	-2.21420000	-79.90220000	54	\N	\N	\N	2026-07-04 10:52:36	2026-07-04 10:52:36	\N	0101000020E6100000E09C11A5BDF953C0F46C567DAEB601C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
44	INC-2026-00044	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	3	11	2	1	Ronda Puente, 6, 1º E, 34932, A Carrasco	-2.90410000	-79.01790000	54	\N	\N	\N	2026-07-09 10:52:28	2026-07-09 10:52:28	\N	0101000020E61000004CA60A4625C153C04182E2C7983B07C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
860	INC-2026-00860	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	6	22	3	1	Praza Alex, 757, Bajos, 50187, As Esteve del Penedès	-2.23620000	-79.90920000	53	\N	\N	\N	2026-07-10 23:52:36	2026-07-10 23:52:36	\N	0101000020E61000007C61325530FA53C088855AD3BCE301C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
861	INC-2026-00861	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	4	16	3	5	Camino Silvia, 46, 3º 6º, 77214, Las Serra	-2.92410000	-79.00590000	53	31	\N	2026-07-19 17:52:36	2026-07-19 05:52:36	2026-07-19 17:52:36	\N	0101000020E6100000F8C264AA60C053C06ADE718A8E6407C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
862	INC-2026-00862	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	3	13	1	1	Travessera Marcos, 920, Entre suelo 9º, 12753, Os Pardo Alta	-2.16320000	-79.85520000	54	\N	\N	2026-07-24 18:52:36	2026-07-24 02:52:36	2026-07-24 18:52:36	\N	0101000020E610000082E2C798BBF653C058A835CD3B4E01C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
863	INC-2026-00863	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	5	20	4	1	Plaza Adriana, 33, 1º A, 13007, El Carrero	-2.19020000	-79.85420000	54	\N	\N	\N	2026-07-11 17:52:36	2026-07-11 17:52:36	\N	0101000020E6100000910F7A36ABF653C0F697DD93878501C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
864	INC-2026-00864	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	3	10	3	5	Passeig Leal, 2, 0º A, 70094, Los Terrazas	-3.20910000	-79.97940000	55	17	\N	2026-06-25 06:52:36	2026-06-24 04:52:36	2026-06-25 06:52:36	\N	0101000020E6100000F46C567DAEFE53C0B1BFEC9E3CAC09C0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
865	INC-2026-00865	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	2	9	4	1	Calle Olga, 2, Bajos, 66224, Los Abeyta	-3.27010000	-79.96240000	53	\N	\N	\N	2026-07-22 10:52:36	2026-07-22 10:52:36	\N	0101000020E6100000E86A2BF697FD53C0613255302A290AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
866	INC-2026-00866	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	1	4	2	1	Plaza Partida, 4, 62º F, 00707, El Madera del Vallès	-2.88710000	-78.96590000	55	\N	\N	\N	2026-06-26 22:52:36	2026-06-26 22:52:36	\N	0101000020E610000036CD3B4ED1BD53C0B84082E2C71807C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
867	INC-2026-00867	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	1	4	4	1	Plaza Guillermo, 112, 41º B, 19905, Las Cepeda de la Sierra	-2.22220000	-79.85520000	54	\N	\N	\N	2026-06-30 14:52:36	2026-06-30 14:52:36	\N	0101000020E610000082E2C798BBF653C09E5E29CB10C701C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
868	INC-2026-00868	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	4	16	2	6	Calle Ander, 996, 0º F, 10753, Villa Rascón de Arriba	-2.17020000	-79.89420000	54	13	\N	\N	2026-06-27 22:52:36	2026-06-28 20:52:36	\N	0101000020E61000005305A3923AF953C0CD3B4ED1915C01C0	482	\N	\N	\N	2026-06-28 20:52:36	\N	\N	\N	CLASSIFIED	\N	\N	\N
869	INC-2026-00869	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	7	\N	2	1	Avenida Eva, 76, 16º E, 31534, Os Quiñones	-3.27410000	-79.94840000	55	\N	\N	\N	2026-07-12 02:52:36	2026-07-12 02:52:36	\N	0101000020E6100000B1E1E995B2FC53C036AB3E575B310AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
870	INC-2026-00870	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	6	22	1	1	Travesía Lola, 93, 0º, 75519, L' Collazo del Barco	-3.26710000	-79.96240000	53	\N	\N	\N	2026-07-06 11:52:36	2026-07-06 11:52:36	\N	0101000020E6100000E86A2BF697FD53C0C217265305230AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
871	INC-2026-00871	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	2	8	2	1	Carrer Alejandro, 1, 3º 0º, 32946, Costa de la Sierra	-3.26910000	-79.97240000	55	\N	\N	\N	2026-07-09 10:52:36	2026-07-09 10:52:36	\N	0101000020E610000058A835CD3BFE53C02CD49AE61D270AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
872	INC-2026-00872	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	7	\N	1	1	Camiño Cedillo, 38, 85º D, 27697, Vallejo Medio	-2.88210000	-78.99490000	53	\N	\N	\N	2026-06-23 16:52:36	2026-06-23 16:52:36	\N	0101000020E610000096B20C71ACBF53C0AD69DE718A0E07C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
873	INC-2026-00873	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	5	19	3	1	Avenida Cintrón, 8, 49º B, 86269, Aguilera Medio	-2.94710000	-79.01490000	53	\N	\N	\N	2026-07-06 03:52:36	2026-07-06 03:52:36	\N	0101000020E6100000772D211FF4C053C03255302AA99307C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
874	INC-2026-00874	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	4	14	1	5	Plaça Aguilera, 6, 2º 8º, 47825, Montalvo de San Pedro	-3.25510000	-79.97740000	55	19	\N	2026-07-12 14:52:36	2026-07-09 19:52:36	2026-07-12 14:52:36	\N	0101000020E610000011C7BAB88DFE53C043AD69DE710A0AC0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
875	INC-2026-00875	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	3	10	3	1	Plaza Esteban, 7, 77º E, 16630, Los Muñoz	-2.86010000	-78.97690000	54	\N	\N	2026-06-26 06:52:36	2026-06-23 14:52:36	2026-06-26 06:52:36	\N	0101000020E610000098DD938785BE53C01A51DA1B7CE106C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
876	INC-2026-00876	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	1	2	3	1	Ruela Alcala, 2, Bajos, 20850, Vall Valdez Alta	-3.21410000	-79.99540000	54	\N	\N	2026-07-19 21:52:36	2026-07-18 13:52:36	2026-07-19 21:52:36	\N	0101000020E61000000F9C33A2B4FF53C0BC96900F7AB609C0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
877	INC-2026-00877	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	1	4	1	1	Travessera Rayan, 14, 8º F, 31979, Llamas de las Torres	-2.22520000	-79.88420000	54	\N	\N	2026-06-30 07:52:36	2026-06-27 10:52:36	2026-06-30 07:52:36	\N	0101000020E6100000E3C798BB96F853C03E7958A835CD01C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
878	INC-2026-00878	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	3	10	2	1	Plaza Toro, 343, 7º E, 18255, Ávila del Vallès	-2.85910000	-78.99190000	54	\N	\N	2026-07-19 01:52:36	2026-07-17 17:52:36	2026-07-19 01:52:36	\N	0101000020E6100000C139234A7BBF53C0E5F21FD26FDF06C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
879	INC-2026-00879	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	5	20	3	1	Ronda Batista, 66, 7º C, 71142, Los Pedraza	-2.15920000	-79.86920000	55	\N	\N	\N	2026-07-21 05:52:36	2026-07-21 05:52:36	\N	0101000020E6100000BA6B09F9A0F753C0832F4CA60A4601C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
880	INC-2026-00880	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	6	24	2	1	Calle Medina, 8, Bajos, 32811, Ponce Medio	-2.94810000	-79.03490000	53	\N	\N	\N	2026-07-10 09:52:36	2026-07-10 09:52:36	\N	0101000020E610000058A835CD3BC253C068B3EA73B59507C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
45	INC-2026-00045	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	5	18	3	6	Camiño Asensio, 50, 5º E, 09367, Delao de la Sierra	-2.92910000	-79.02790000	54	27	\N	\N	2026-07-16 18:52:28	2026-07-17 00:52:28	\N	0101000020E6100000BDE3141DC9C153C074B515FBCB6E07C0	11	\N	\N	\N	2026-07-17 00:52:28	\N	\N	\N	CLASSIFIED	\N	\N	\N
881	INC-2026-00881	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	3	13	2	1	Avenida Yolanda, 8, 85º A, 55941, As Lucas Medio	-3.24910000	-79.94240000	53	\N	\N	\N	2026-07-06 19:52:36	2026-07-06 19:52:36	\N	0101000020E610000007F0164850FC53C003780B2428FE09C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
882	INC-2026-00882	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	5	18	1	1	Avenida Carla, 16, 5º E, 22334, Las Reina Baja	-2.17720000	-79.89220000	55	\N	\N	\N	2026-07-03 14:52:36	2026-07-03 14:52:36	\N	0101000020E6100000705F07CE19F953C042CF66D5E76A01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
883	INC-2026-00883	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	2	9	4	1	Plaza Enrique, 7, Bajo 8º, 68028, El Reyna del Pozo	-2.91510000	-79.00990000	55	\N	\N	2026-07-25 15:52:36	2026-07-22 23:52:36	2026-07-25 15:52:36	\N	0101000020E6100000BF0E9C33A2C053C08A8EE4F21F5207C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
884	INC-2026-00884	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	5	19	2	1	Paseo Nahia, 875, 5º C, 19294, Vall Griego	-2.89510000	-79.03290000	54	\N	\N	\N	2026-07-10 16:52:36	2026-07-10 16:52:36	\N	0101000020E610000075029A081BC253C0613255302A2907C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
885	INC-2026-00885	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	4	15	4	1	Passeig Herrero, 68, 0º F, 97333, El Medina	-2.17520000	-79.91620000	55	\N	\N	\N	2026-07-08 17:52:36	2026-07-08 17:52:36	\N	0101000020E610000018265305A3FA53C0D712F241CF6601C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
886	INC-2026-00886	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	5	20	3	1	Praza Yolanda, 22, Bajo 0º, 53495, O Haro	-3.26710000	-79.98640000	55	\N	\N	\N	2026-07-05 10:52:36	2026-07-05 10:52:36	\N	0101000020E61000009031772D21FF53C0C217265305230AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
887	INC-2026-00887	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	7	\N	3	1	Camino Cuenca, 1, 5º D, 69274, La Urías del Bages	-3.23810000	-79.95140000	55	\N	\N	2026-07-20 14:52:36	2026-07-18 15:52:36	2026-07-20 14:52:36	\N	0101000020E6100000865AD3BCE3FC53C0BA6B09F9A0E709C0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
888	INC-2026-00888	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	4	16	3	1	Travesía Barrera, 302, 2º A, 83546, Campos Baja	-2.88410000	-79.00490000	54	\N	\N	\N	2026-07-06 04:52:36	2026-07-06 04:52:36	\N	0101000020E610000007F0164850C053C018265305A31207C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
889	INC-2026-00889	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	1	5	3	1	Rúa Carmen, 77, 3º, 88520, Padrón de la Sierra	-3.30610000	-79.95040000	55	\N	\N	\N	2026-06-26 02:52:36	2026-06-26 02:52:36	\N	0101000020E61000009487855AD3FC53C0DE718A8EE4720AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
890	INC-2026-00890	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	3	11	3	1	Avenida Cabello, 7, 0º C, 56249, As Zayas de Arriba	-2.16020000	-79.85220000	55	\N	\N	\N	2026-07-18 14:52:36	2026-07-18 14:52:36	\N	0101000020E6100000AD69DE718AF653C0B98D06F0164801C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
891	INC-2026-00891	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	7	\N	1	5	Calle Mendoza, 295, 6º 9º, 78113, La Muro del Penedès	-3.22810000	-79.91840000	54	17	\N	2026-06-29 05:52:36	2026-06-29 00:52:36	2026-06-29 05:52:36	\N	0101000020E61000005F29CB10C7FA53C0A5BDC11726D309C0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
892	INC-2026-00892	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	1	2	2	1	Carrer Cristina, 63, 30º F, 46488, La Santana de San Pedro	-2.17920000	-79.93320000	54	\N	\N	\N	2026-06-28 23:52:36	2026-06-28 23:52:36	\N	0101000020E610000024287E8CB9FB53C0AC8BDB68006F01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
893	INC-2026-00893	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	5	19	4	1	Avinguda Carballo, 69, 3º, 31583, Centeno de las Torres	-2.18720000	-79.85920000	55	\N	\N	\N	2026-07-15 16:52:36	2026-07-15 16:52:36	\N	0101000020E6100000492EFF21FDF653C0567DAEB6627F01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
894	INC-2026-00894	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	1	2	1	1	Travessera Atencio, 51, Bajo 3º, 82024, Castillo de Arriba	-3.26310000	-79.92440000	53	\N	\N	\N	2026-06-30 14:52:36	2026-06-30 14:52:36	\N	0101000020E6100000091B9E5E29FB53C0ED9E3C2CD41A0AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
896	INC-2026-00896	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	3	13	1	5	Passeig Olivia, 8, 30º A, 34701, As Santacruz Alta	-2.89010000	-78.99890000	54	30	\N	2026-07-22 10:52:36	2026-07-21 10:52:36	2026-07-22 10:52:36	\N	0101000020E61000005DFE43FAEDBF53C0575BB1BFEC1E07C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
897	INC-2026-00897	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	1	1	1	1	Calle Sergio, 6, 76º 8º, 87824, Tejeda de Lemos	-2.20020000	-79.89720000	53	\N	\N	\N	2026-07-08 00:52:36	2026-07-08 00:52:36	\N	0101000020E6100000287E8CB96BF953C00B462575029A01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
898	INC-2026-00898	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	3	13	1	1	Calle Barrientos, 24, 6º E, 10356, Villa Balderas	-2.14720000	-79.93320000	53	\N	\N	\N	2026-07-11 14:52:36	2026-07-11 14:52:36	\N	0101000020E610000024287E8CB9FB53C005C58F31772D01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
899	INC-2026-00899	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	7	\N	4	1	Rúa Montañez, 1, 63º D, 33835, Guerrero Alta	-2.21920000	-79.93420000	55	\N	\N	\N	2026-07-16 13:52:36	2026-07-16 13:52:36	\N	0101000020E610000016FBCBEEC9FB53C0FE43FAEDEBC001C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
900	INC-2026-00900	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	7	\N	4	1	Avenida Polo, 21, 8º F, 13722, Os Corrales de Ulla	-3.24910000	-79.92240000	53	\N	\N	2026-07-04 07:52:36	2026-07-03 17:52:36	2026-07-04 07:52:36	\N	0101000020E61000002575029A08FB53C003780B2428FE09C0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
901	INC-2026-00901	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	3	11	2	1	Plaza Nayara, 529, 32º B, 09637, San Caraballo del Puerto	-2.22520000	-79.85320000	54	\N	\N	\N	2026-06-28 06:52:37	2026-06-28 06:52:37	\N	0101000020E61000009F3C2CD49AF653C03E7958A835CD01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
902	INC-2026-00902	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	1	1	2	6	Ronda Cantú, 7, Bajo 5º, 28053, Os Rodríguez del Penedès	-2.21820000	-79.88420000	54	11	\N	\N	2026-06-28 08:52:37	2026-06-29 05:52:37	\N	0101000020E6100000E3C798BB96F853C0C9E53FA4DFBE01C0	482	\N	\N	\N	2026-06-29 05:52:37	\N	\N	\N	CLASSIFIED	\N	\N	\N
46	INC-2026-00046	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	1	4	3	7	Praza Lovato, 533, 2º C, 48485, Vall Chávez del Pozo	-3.23610000	-79.96340000	54	19	\N	\N	2026-07-13 16:52:28	2026-07-13 16:52:28	\N	0101000020E6100000D93D7958A8FD53C04FAF946588E309C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
903	INC-2026-00903	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	3	11	3	1	Travessera Yago, 698, Bajos, 78415, Rodrigo del Bages	-3.21910000	-79.92240000	54	\N	\N	\N	2026-07-05 17:52:37	2026-07-05 17:52:37	\N	0101000020E61000002575029A08FB53C0C66D3480B7C009C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
904	INC-2026-00904	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	4	16	2	1	Plaça Miguel Ángel, 55, 24º A, 10331, Ordoñez Medio	-3.22510000	-79.97340000	54	\N	\N	\N	2026-07-09 10:52:37	2026-07-09 10:52:37	\N	0101000020E61000004A7B832F4CFE53C005A3923A01CD09C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
905	INC-2026-00905	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	4	15	1	1	Travesía Ainhoa, 75, 0º E, 14013, As Antón de Arriba	-2.20920000	-79.89720000	55	\N	\N	\N	2026-07-08 15:52:37	2026-07-08 15:52:37	\N	0101000020E6100000287E8CB96BF953C0EA95B20C71AC01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
906	INC-2026-00906	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	1	2	2	1	Calle Castillo, 27, 7º A, 96800, Salcedo de Lemos	-2.87010000	-78.96990000	54	\N	\N	\N	2026-07-21 11:52:37	2026-07-21 11:52:37	\N	0101000020E6100000FC1873D712BE53C02EFF21FDF6F506C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
907	INC-2026-00907	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	2	7	4	6	Avenida Manzano, 6, 47º B, 33443, Las Tejeda del Penedès	-3.30810000	-79.93140000	53	19	\N	\N	2026-07-17 23:52:37	2026-07-18 21:52:37	\N	0101000020E6100000A4DFBE0E9CFB53C0492EFF21FD760AC0	331	\N	\N	\N	2026-07-18 21:52:37	\N	\N	\N	CLASSIFIED	\N	\N	\N
908	INC-2026-00908	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	6	22	3	1	Camino Juan José, 28, 04º B, 41466, O Cedillo Baja	-2.17220000	-79.90920000	55	\N	\N	\N	2026-07-20 13:52:37	2026-07-20 13:52:37	\N	0101000020E61000007C61325530FA53C038F8C264AA6001C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
909	INC-2026-00909	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	1	5	2	6	Praza Carlota, 604, 00º C, 15857, L' Zaragoza de Lemos	-2.23220000	-79.90420000	53	13	\N	\N	2026-07-01 03:52:37	2026-07-01 21:52:37	\N	0101000020E6100000C442AD69DEF953C0B30C71AC8BDB01C0	482	\N	\N	\N	2026-07-01 21:52:37	\N	\N	\N	CLASSIFIED	\N	\N	\N
910	INC-2026-00910	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	5	18	1	1	Camiño Ceja, 260, 7º E, 76445, Ruvalcaba del Puerto	-2.16020000	-79.86420000	53	\N	\N	\N	2026-07-21 15:52:37	2026-07-21 15:52:37	\N	0101000020E6100000014D840D4FF753C0B98D06F0164801C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
911	INC-2026-00911	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	2	7	2	1	Avenida Alonso, 5, 09º B, 64154, Los Ibarra del Mirador	-2.23420000	-79.91820000	53	\N	\N	2026-07-24 11:52:37	2026-07-23 19:52:37	2026-07-24 11:52:37	\N	0101000020E6100000FBCBEEC9C3FA53C01DC9E53FA4DF01C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
912	INC-2026-00912	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	3	11	1	1	Plaza Natalia, 88, 70º B, 76421, O Concepción del Pozo	-2.15020000	-79.88020000	55	\N	\N	\N	2026-07-13 02:52:37	2026-07-13 02:52:37	\N	0101000020E61000001C7C613255F853C0A4DFBE0E9C3301C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
913	INC-2026-00913	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	2	8	2	5	Travessera Ariadna, 77, 42º A, 45200, Candelaria del Penedès	-2.93210000	-78.95690000	54	29	\N	2026-07-05 20:52:37	2026-07-04 15:52:37	2026-07-05 20:52:37	\N	0101000020E6100000B7627FD93DBD53C014D044D8F07407C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
914	INC-2026-00914	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	4	17	4	1	Rúa Montoya, 66, 1º F, 74276, El Carballo	-2.23920000	-79.93620000	55	\N	\N	\N	2026-07-07 15:52:37	2026-07-07 15:52:37	\N	0101000020E6100000F9A067B3EAFB53C027A089B0E1E901C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
915	INC-2026-00915	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	6	24	4	1	Ruela Ramón, 970, 6º B, 52657, Blasco Medio	-2.19620000	-79.84820000	55	\N	\N	2026-06-28 23:52:37	2026-06-25 23:52:37	2026-06-28 23:52:37	\N	0101000020E6100000E71DA7E848F653C036CD3B4ED19101C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
916	INC-2026-00916	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	2	6	4	1	Ronda Celia, 3, 9º 7º, 89945, San Bustos	-2.20220000	-79.87320000	54	\N	\N	\N	2026-07-09 01:52:37	2026-07-09 01:52:37	\N	0101000020E610000080B74082E2F753C075029A081B9E01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
917	INC-2026-00917	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	3	10	3	1	Rúa Corrales, 869, 44º E, 74311, Las Arredondo de Ulla	-2.88910000	-79.00290000	54	\N	\N	\N	2026-07-14 13:52:37	2026-07-14 13:52:37	\N	0101000020E6100000234A7B832FC053C022FDF675E01C07C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
918	INC-2026-00918	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	3	13	1	1	Plaça Arreola, 2, 46º C, 59439, Vall Borrego	-2.16020000	-79.90220000	54	\N	\N	\N	2026-07-03 07:52:37	2026-07-03 07:52:37	\N	0101000020E6100000E09C11A5BDF953C0B98D06F0164801C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
919	INC-2026-00919	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	1	1	4	1	Ronda Nayara, 379, 3º E, 26681, Galarza del Penedès	-2.19320000	-79.84920000	53	\N	\N	\N	2026-07-10 10:52:37	2026-07-10 10:52:37	\N	0101000020E6100000D8F0F44A59F653C096B20C71AC8B01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
920	INC-2026-00920	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	6	24	4	6	Ronda Camarillo, 12, 39º E, 19625, Vall Benavides de Ulla	-2.23420000	-79.86320000	53	13	\N	\N	2026-07-14 10:52:37	2026-07-15 02:52:37	\N	0101000020E6100000107A36AB3EF753C01DC9E53FA4DF01C0	482	\N	\N	\N	2026-07-15 02:52:37	\N	\N	\N	CLASSIFIED	\N	\N	\N
921	INC-2026-00921	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	4	17	4	5	Camiño Castañeda, 1, 58º 1º, 71225, Villa Reséndez	-3.24610000	-79.92740000	54	19	\N	2026-07-18 15:52:37	2026-07-18 06:52:37	2026-07-18 15:52:37	\N	0101000020E6100000DE9387855AFB53C0645DDC4603F809C0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
922	INC-2026-00922	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	7	\N	3	1	Travesía Garza, 6, 82º E, 68221, A Gallegos Alta	-2.88510000	-79.00790000	55	\N	\N	\N	2026-07-23 10:52:37	2026-07-23 10:52:37	\N	0101000020E6100000DC68006F81C053C04D840D4FAF1407C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
923	INC-2026-00923	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	7	\N	1	1	Avenida Mario, 8, 9º, 17799, Villa Casárez Alta	-2.17220000	-79.88520000	54	\N	\N	\N	2026-06-24 16:52:37	2026-06-24 16:52:37	\N	0101000020E6100000D49AE61DA7F853C038F8C264AA6001C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
47	INC-2026-00047	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	1	1	1	5	Praza Mena, 497, Ático 8º, 15292, Las Valdivia del Penedès	-3.21610000	-79.97740000	54	15	\N	2026-07-02 06:52:28	2026-06-29 19:52:28	2026-07-02 06:52:28	\N	0101000020E610000011C7BAB88DFE53C0265305A392BA09C0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
895	INC-2026-00895	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	6	24	2	1	Plaza Villa, 87, 25º E, 11970, El Arias	-2.21320000	-79.90520000	54	\N	\N	\N	2026-07-21 13:52:36	2026-07-21 13:52:36	\N	0101000020E6100000B515FBCBEEF953C0BF0E9C33A2B401C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
924	INC-2026-00924	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	7	\N	2	5	Camiño Irene, 5, 1º C, 25627, Rueda Baja	-2.86410000	-79.02590000	54	27	\N	2026-07-06 13:52:37	2026-07-03 15:52:37	2026-07-06 13:52:37	\N	0101000020E6100000D93D7958A8C153C0EFC9C342ADE906C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
925	INC-2026-00925	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	5	21	3	5	Calle Hugo, 8, 7º E, 09979, Castro del Barco	-2.93210000	-78.96990000	54	30	\N	2026-06-28 11:52:37	2026-06-28 01:52:37	2026-06-28 11:52:37	\N	0101000020E6100000FC1873D712BE53C014D044D8F07407C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
926	INC-2026-00926	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	7	\N	3	1	Rúa Baeza, 886, 3º E, 70357, Orellana de la Sierra	-2.87510000	-79.05390000	55	\N	\N	2026-07-20 20:52:37	2026-07-19 17:52:37	2026-07-20 20:52:37	\N	0101000020E61000004850FC1873C353C039D6C56D340007C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
927	INC-2026-00927	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	3	12	1	1	Ruela Aitor, 90, 51º E, 16313, Os Palomo de las Torres	-2.16020000	-79.83720000	55	\N	\N	\N	2026-07-13 13:52:37	2026-07-13 13:52:37	\N	0101000020E6100000840D4FAF94F553C0B98D06F0164801C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
928	INC-2026-00928	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	3	10	2	1	Avinguda Iker, 23, 35º A, 81486, San Fierro	-2.15720000	-79.83720000	53	\N	\N	\N	2026-06-30 16:52:37	2026-06-30 16:52:37	\N	0101000020E6100000840D4FAF94F553C01973D712F24101C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
929	INC-2026-00929	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	7	\N	3	1	Travessera Ontiveros, 8, 9º D, 71941, Os Prado	-2.20820000	-79.93420000	53	\N	\N	\N	2026-07-16 04:52:37	2026-07-16 04:52:37	\N	0101000020E610000016FBCBEEC9FB53C0B537F8C264AA01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
930	INC-2026-00930	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	6	22	4	1	Praza Gimeno, 33, 99º E, 59012, Las Sánchez de Lemos	-2.20620000	-79.88520000	53	\N	\N	\N	2026-07-17 20:52:37	2026-07-17 20:52:37	\N	0101000020E6100000D49AE61DA7F853C04A7B832F4CA601C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
931	INC-2026-00931	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	6	24	2	1	Camiño Barragán, 92, 87º C, 11026, Naranjo de Arriba	-3.28410000	-80.00340000	53	\N	\N	\N	2026-07-17 15:52:37	2026-07-17 15:52:37	\N	0101000020E61000009C33A2B4370054C04B598638D6450AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
932	INC-2026-00932	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	3	12	4	6	Plaça Delrío, 18, 66º 4º, 23108, Villa Páez	-2.24520000	-79.89220000	53	11	\N	\N	2026-07-19 05:52:37	2026-07-19 06:52:37	\N	0101000020E6100000705F07CE19F953C067D5E76A2BF601C0	482	\N	\N	\N	2026-07-19 06:52:37	\N	\N	\N	CLASSIFIED	\N	\N	\N
933	INC-2026-00933	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	5	19	2	1	Avinguda Uribe, 566, Bajos, 83428, L' Nevárez del Penedès	-3.27710000	-79.92640000	55	\N	\N	2026-06-26 09:52:37	2026-06-24 10:52:37	2026-06-26 09:52:37	\N	0101000020E6100000ECC039234AFB53C0D6C56D3480370AC0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
934	INC-2026-00934	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	4	15	3	5	Travesía Nuria, 968, 03º 0º, 08865, Vall Rodríquez	-3.29110000	-79.94740000	53	18	\N	2026-06-27 03:52:37	2026-06-24 10:52:37	2026-06-27 03:52:37	\N	0101000020E6100000BF0E9C33A2FC53C0C0EC9E3C2C540AC0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
935	INC-2026-00935	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	6	23	2	1	Travesía Manuela, 723, 0º C, 04154, San Ontiveros	-2.19220000	-79.85420000	55	\N	\N	\N	2026-07-12 00:52:37	2026-07-12 00:52:37	\N	0101000020E6100000910F7A36ABF653C061545227A08901C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
936	INC-2026-00936	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	5	18	3	6	Travesía Benito, 8, 68º 2º, 20298, A Tamez Alta	-2.86810000	-79.00990000	53	31	\N	\N	2026-07-01 17:52:37	2026-07-02 14:52:37	\N	0101000020E6100000BF0E9C33A2C053C0C442AD69DEF106C0	11	\N	\N	\N	2026-07-02 14:52:37	\N	\N	\N	CLASSIFIED	\N	\N	\N
937	INC-2026-00937	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	4	15	2	5	Paseo Delafuente, 3, Bajo 0º, 66776, Las Murillo	-2.90310000	-78.99290000	54	31	\N	2026-07-06 15:52:37	2026-07-06 10:52:37	2026-07-06 15:52:37	\N	0101000020E6100000B30C71AC8BBF53C00B24287E8C3907C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
938	INC-2026-00938	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	6	23	4	6	Travessera Clemente, 47, 92º F, 37611, Los Guillen	-3.29210000	-79.97340000	54	19	\N	\N	2026-07-05 16:52:37	2026-07-05 21:52:37	\N	0101000020E61000004A7B832F4CFE53C0F54A598638560AC0	331	\N	\N	\N	2026-07-05 21:52:37	\N	\N	\N	CLASSIFIED	\N	\N	\N
941	INC-2026-00941	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	6	22	1	1	Calle Mateos, 51, 73º E, 81122, Silva de la Sierra	-2.94710000	-78.98190000	54	\N	\N	2026-07-01 15:52:37	2026-06-29 18:52:37	2026-07-01 15:52:37	\N	0101000020E610000050FC1873D7BE53C03255302AA99307C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
942	INC-2026-00942	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	5	19	3	1	Passeig Iglesias, 33, 4º, 06704, El Saldivar	-2.92410000	-78.97190000	55	\N	\N	2026-07-20 13:52:37	2026-07-18 03:52:37	2026-07-20 13:52:37	\N	0101000020E6100000E0BE0E9C33BE53C06ADE718A8E6407C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
943	INC-2026-00943	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	6	24	1	1	Praza Bueno, 51, Bajos, 62202, Chavarría de Arriba	-2.21120000	-79.84120000	54	\N	\N	\N	2026-07-10 01:52:37	2026-07-10 01:52:37	\N	0101000020E61000004B598638D6F553C0545227A089B001C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
944	INC-2026-00944	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	3	10	2	1	Ruela Jan, 10, 04º 6º, 69971, O Pozo de Ulla	-3.20810000	-79.95440000	53	\N	\N	\N	2026-07-06 21:52:37	2026-07-06 21:52:37	\N	0101000020E61000005BD3BCE314FD53C07C61325530AA09C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
48	INC-2026-00048	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	2	9	1	7	Ronda Barroso, 31, 93º 2º, 09550, A Parra Alta	-2.93610000	-79.01090000	55	28	\N	\N	2026-06-24 12:52:28	2026-06-24 12:52:28	\N	0101000020E6100000B1E1E995B2C053C0E9482EFF217D07C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
49	INC-2026-00049	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	2	6	1	7	Passeig Naia, 825, 2º C, 33123, O Marroquín	-2.18420000	-79.85120000	54	11	\N	\N	2026-06-28 15:52:28	2026-06-28 15:52:28	\N	0101000020E6100000BC96900F7AF653C0B7627FD93D7901C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
945	INC-2026-00945	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	3	12	3	1	Avenida Alexandra, 7, 58º B, 99885, Rodríquez de Arriba	-3.28010000	-79.91140000	54	\N	\N	\N	2026-07-05 04:52:37	2026-07-05 04:52:37	\N	0101000020E6100000C364AA6054FA53C076E09C11A53D0AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
946	INC-2026-00946	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	1	5	4	6	Praza Bermúdez, 7, 7º B, 78361, Las Treviño Baja	-2.21520000	-79.93120000	54	11	\N	\N	2026-06-30 10:52:37	2026-06-30 21:52:37	\N	0101000020E61000004182E2C798FB53C029CB10C7BAB801C0	482	\N	\N	\N	2026-06-30 21:52:37	\N	\N	\N	CLASSIFIED	\N	\N	\N
947	INC-2026-00947	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	4	17	2	5	Praza Alaniz, 6, 4º, 63401, Quiroz Baja	-2.14620000	-79.90220000	53	9	\N	2026-07-16 06:52:37	2026-07-15 17:52:37	2026-07-16 06:52:37	\N	0101000020E6100000E09C11A5BDF953C0CF66D5E76A2B01C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
948	INC-2026-00948	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	4	15	3	1	Ronda Castro, 385, 5º 3º, 96175, Carrero del Penedès	-2.23120000	-79.92820000	53	\N	\N	\N	2026-07-15 22:52:37	2026-07-15 22:52:37	\N	0101000020E61000006C09F9A067FB53C07DAEB6627FD901C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
949	INC-2026-00949	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	2	6	2	1	Camino Guerra, 315, 3º 1º, 07777, La Ceja	-2.20520000	-79.86620000	55	\N	\N	\N	2026-07-04 10:52:37	2026-07-04 10:52:37	\N	0101000020E6100000E5F21FD26FF753C0151DC9E53FA401C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
950	INC-2026-00950	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	2	8	1	1	Avenida María Carmen, 6, 7º B, 99420, Fajardo del Bages	-2.19720000	-79.91820000	54	\N	\N	\N	2026-07-05 20:52:37	2026-07-05 20:52:37	\N	0101000020E6100000FBCBEEC9C3FA53C06B2BF697DD9301C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
951	INC-2026-00951	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	7	\N	4	1	Camiño Sánchez, 637, 4º D, 60397, El Meraz	-2.20920000	-79.88220000	53	\N	\N	\N	2026-06-24 18:52:37	2026-06-24 18:52:37	\N	0101000020E6100000FF21FDF675F853C0EA95B20C71AC01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
952	INC-2026-00952	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	5	20	1	6	Calle Aurora, 881, Entre suelo 2º, 15771, El Hernández	-2.21420000	-79.90820000	54	10	\N	\N	2026-07-11 08:52:37	2026-07-12 00:52:37	\N	0101000020E61000008A8EE4F21FFA53C0F46C567DAEB601C0	482	\N	\N	\N	2026-07-12 00:52:37	\N	\N	\N	CLASSIFIED	\N	\N	\N
953	INC-2026-00953	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	1	3	3	1	Plaça Alexia, 160, 1º 1º, 62375, Cuesta de las Torres	-2.89310000	-79.03790000	54	\N	\N	\N	2026-07-10 13:52:37	2026-07-10 13:52:37	\N	0101000020E61000002D211FF46CC253C0F775E09C112507C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
954	INC-2026-00954	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	7	\N	3	1	Passeig Carlos, 38, Bajos, 84475, A Saucedo	-3.25510000	-79.96840000	53	\N	\N	\N	2026-07-11 02:52:37	2026-07-11 02:52:37	\N	0101000020E6100000925CFE43FAFD53C043AD69DE710A0AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
955	INC-2026-00955	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	3	10	4	1	Camiño Elsa, 7, 34º B, 39805, Fierro del Penedès	-3.23410000	-79.99340000	54	\N	\N	\N	2026-07-08 20:52:37	2026-07-08 20:52:37	\N	0101000020E61000002BF697DD93FF53C0E5F21FD26FDF09C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
956	INC-2026-00956	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	3	13	3	5	Ruela Oliver, 518, 03º F, 73613, Pascual del Bages	-2.95010000	-78.99490000	54	29	\N	2026-07-01 17:52:37	2026-06-29 10:52:37	2026-07-01 17:52:37	\N	0101000020E610000096B20C71ACBF53C0D26F5F07CE9907C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
957	INC-2026-00957	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	5	19	1	5	Paseo Joel, 481, 0º 1º, 42734, A Anaya	-2.86910000	-79.02790000	54	30	\N	2026-06-25 02:52:37	2026-06-24 10:52:37	2026-06-25 02:52:37	\N	0101000020E6100000BDE3141DC9C153C0F9A067B3EAF306C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
958	INC-2026-00958	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	5	21	3	1	Ronda Muñoz, 820, 16º C, 30684, Barrientos Baja	-2.24420000	-79.87720000	55	\N	\N	\N	2026-06-30 08:52:37	2026-06-30 08:52:37	\N	0101000020E61000004703780B24F853C032772D211FF401C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
959	INC-2026-00959	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	7	\N	3	1	Camiño Delatorre, 12, 44º A, 67462, Carrillo de San Pedro	-2.18420000	-79.91820000	53	\N	\N	\N	2026-07-23 10:52:37	2026-07-23 10:52:37	\N	0101000020E6100000FBCBEEC9C3FA53C0B7627FD93D7901C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
960	INC-2026-00960	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	7	\N	2	1	Camino Jon, 54, 79º E, 33434, La Escudero	-2.91510000	-79.05090000	55	\N	\N	\N	2026-07-20 01:52:37	2026-07-20 01:52:37	\N	0101000020E610000073D712F241C353C08A8EE4F21F5207C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
961	INC-2026-00961	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	1	4	2	6	Rúa Diana, 82, 65º B, 11384, Bustamante del Barco	-3.28810000	-79.95640000	53	16	\N	\N	2026-06-24 05:52:37	2026-06-25 00:52:37	\N	0101000020E61000003E7958A835FD53C020D26F5F074E0AC0	331	\N	\N	\N	2026-06-25 00:52:37	\N	\N	\N	CLASSIFIED	\N	\N	\N
962	INC-2026-00962	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	2	7	3	1	Ruela De la Cruz, 9, 1º E, 21791, El Gallardo Baja	-2.18820000	-79.85720000	54	\N	\N	\N	2026-07-11 16:52:37	2026-07-11 16:52:37	\N	0101000020E61000006688635DDCF653C08CDB68006F8101C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
963	INC-2026-00963	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	6	24	3	5	Avenida Aina, 40, Entre suelo 0º, 80960, L' Aparicio	-3.28310000	-79.93040000	54	18	\N	2026-07-14 03:52:37	2026-07-11 23:52:37	2026-07-14 03:52:37	\N	0101000020E6100000B30C71AC8BFB53C016FBCBEEC9430AC0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
964	INC-2026-00964	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	1	1	3	1	Ruela Márquez, 8, 63º C, 75759, Vall Montañez del Bages	-2.19820000	-79.89820000	55	\N	\N	\N	2026-07-05 12:52:37	2026-07-05 12:52:37	\N	0101000020E61000001A51DA1B7CF953C0A089B0E1E99501C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
50	INC-2026-00050	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	2	6	2	7	Avinguda Jorge, 76, 8º D, 96083, Badillo de Ulla	-2.85910000	-78.95590000	54	27	\N	\N	2026-06-23 16:52:28	2026-06-23 16:52:28	\N	0101000020E6100000C58F31772DBD53C0E5F21FD26FDF06C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
940	INC-2026-00940	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	3	12	3	1	Camiño Oliver, 34, 36º E, 10045, Cruz Alta	-2.20120000	-79.88820000	54	\N	\N	\N	2026-07-21 20:52:37	2026-07-21 20:52:37	\N	0101000020E6100000A913D044D8F853C040A4DFBE0E9C01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
965	INC-2026-00965	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	6	24	4	1	Paseo Pérez, 532, 27º A, 39000, Meléndez del Puerto	-3.26410000	-79.98040000	54	\N	\N	\N	2026-07-05 03:52:37	2026-07-05 03:52:37	\N	0101000020E6100000E63FA4DFBEFE53C022FDF675E01C0AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
966	INC-2026-00966	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	5	20	3	1	Paseo Castillo, 3, 50º D, 70472, Macías del Barco	-2.88510000	-79.03590000	55	\N	\N	\N	2026-07-12 14:52:37	2026-07-12 14:52:37	\N	0101000020E61000004A7B832F4CC253C04D840D4FAF1407C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
967	INC-2026-00967	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	6	23	3	1	Rúa Zamora, 51, 20º C, 29533, Villa Serrano	-2.90610000	-79.02390000	54	\N	\N	\N	2026-06-24 00:52:37	2026-06-24 00:52:37	\N	0101000020E6100000F697DD9387C153C0AB3E575BB13F07C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
968	INC-2026-00968	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	7	\N	2	1	Plaça Verduzco, 598, 5º D, 88901, O Gimeno de Ulla	-2.90210000	-79.00990000	53	\N	\N	2026-07-14 21:52:37	2026-07-14 12:52:37	2026-07-14 21:52:37	\N	0101000020E6100000BF0E9C33A2C053C0D6C56D34803707C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
969	INC-2026-00969	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	7	\N	2	1	Avinguda Ureña, 117, 1º B, 04841, Rey del Mirador	-2.21520000	-79.83820000	55	\N	\N	\N	2026-07-05 01:52:37	2026-07-05 01:52:37	\N	0101000020E610000076E09C11A5F553C029CB10C7BAB801C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
970	INC-2026-00970	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	1	2	3	5	Rúa Cervántez, 73, 7º C, 05585, Os Cepeda del Mirador	-3.24410000	-79.97140000	55	15	\N	2026-07-17 05:52:37	2026-07-14 18:52:37	2026-07-17 05:52:37	\N	0101000020E610000067D5E76A2BFE53C0F9A067B3EAF309C0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
971	INC-2026-00971	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	5	18	1	1	Calle Tórrez, 2, 1º 6º, 56285, Las Serrato	-2.15320000	-79.85420000	55	\N	\N	2026-07-06 05:52:37	2026-07-05 06:52:37	2026-07-06 05:52:37	\N	0101000020E6100000910F7A36ABF653C044FAEDEBC03901C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
972	INC-2026-00972	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	1	3	4	5	Travessera Carrillo, 39, 36º E, 62597, Cordero Alta	-2.90110000	-79.04790000	53	30	\N	2026-07-12 02:52:37	2026-07-10 03:52:37	2026-07-12 02:52:37	\N	0101000020E61000009E5E29CB10C353C0A167B3EA733507C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
973	INC-2026-00973	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	2	9	2	1	Travessera José Manuel, 88, 12º F, 66631, Macias Baja	-2.23820000	-79.85820000	53	\N	\N	\N	2026-06-30 05:52:37	2026-06-30 05:52:37	\N	0101000020E6100000575BB1BFECF653C0F241CF66D5E701C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
974	INC-2026-00974	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	6	23	2	1	Camino Miriam, 4, 48º 8º, 51904, Las Corona	-3.22410000	-79.97040000	54	\N	\N	\N	2026-07-17 13:52:37	2026-07-17 13:52:37	\N	0101000020E610000075029A081BFE53C0D044D8F0F4CA09C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
975	INC-2026-00975	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	6	24	1	1	Avenida Manuel, 23, 2º F, 02747, La Sáenz del Barco	-2.19720000	-79.85920000	54	\N	\N	\N	2026-06-26 10:52:37	2026-06-26 10:52:37	\N	0101000020E6100000492EFF21FDF653C06B2BF697DD9301C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
976	INC-2026-00976	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	6	23	4	1	Plaça Antón, 52, 4º 2º, 76110, A Delvalle del Barco	-3.21310000	-80.00040000	55	\N	\N	2026-07-13 07:52:37	2026-07-12 10:52:37	2026-07-13 07:52:37	\N	0101000020E6100000C7BAB88D060054C08638D6C56DB409C0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
977	INC-2026-00977	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	3	13	4	1	Rúa Emilia, 6, 5º F, 30888, O Aparicio del Penedès	-2.21220000	-79.92120000	54	\N	\N	2026-07-08 08:52:37	2026-07-07 00:52:37	2026-07-08 08:52:37	\N	0101000020E6100000D044D8F0F4FA53C08AB0E1E995B201C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
978	INC-2026-00978	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	5	19	3	1	Avenida Erik, 40, Bajos, 86480, A Collado	-3.24410000	-79.95140000	53	\N	\N	\N	2026-07-05 10:52:37	2026-07-05 10:52:37	\N	0101000020E6100000865AD3BCE3FC53C0F9A067B3EAF309C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
979	INC-2026-00979	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	5	18	3	1	Ronda Colón, 2, Bajo 2º, 66096, A Olmos de Ulla	-2.16220000	-79.86920000	55	\N	\N	\N	2026-07-22 12:52:37	2026-07-22 12:52:37	\N	0101000020E6100000BA6B09F9A0F753C0234A7B832F4C01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
980	INC-2026-00980	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	1	1	3	1	Praza Andrés, 9, 7º F, 54670, Cortez de la Sierra	-3.21310000	-79.91140000	53	\N	\N	\N	2026-07-01 22:52:37	2026-07-01 22:52:37	\N	0101000020E6100000C364AA6054FA53C08638D6C56DB409C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
981	INC-2026-00981	Fuga de agua potable	Hay una tubería rota botando agua limpia a la calle constantemente.	7	\N	1	1	Plaça Malave, 2, Entre suelo 8º, 73141, La Morán del Penedès	-3.26710000	-79.93740000	55	\N	\N	\N	2026-07-23 09:52:37	2026-07-23 09:52:37	\N	0101000020E61000004ED1915CFEFB53C0C217265305230AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
982	INC-2026-00982	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	3	13	3	1	Calle Rocío, 912, 0º, 63147, Arredondo del Puerto	-2.91210000	-78.99190000	54	\N	\N	\N	2026-06-25 14:52:37	2026-06-25 14:52:37	\N	0101000020E6100000C139234A7BBF53C0EB73B515FB4B07C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
983	INC-2026-00983	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	7	\N	4	1	Paseo Bruno, 989, 6º B, 29862, Fierro de Arriba	-2.18120000	-79.85420000	53	\N	\N	\N	2026-07-09 16:52:37	2026-07-09 16:52:37	\N	0101000020E6100000910F7A36ABF653C0174850FC187301C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
51	INC-2026-00051	Semáforo dañado	El semáforo de la intersección no cambia a verde, generando mucho tráfico.	1	1	2	7	Plaça Lara, 600, 86º C, 18443, Espinoza del Bages	-3.30710000	-79.94740000	54	18	\N	\N	2026-06-27 14:52:28	2026-06-27 14:52:28	\N	0101000020E6100000BF0E9C33A2FC53C014D044D8F0740AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
984	INC-2026-00984	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	4	14	2	5	Paseo Nerea, 84, 1º E, 81003, Vall Irizarry de San Pedro	-2.89710000	-79.03090000	53	27	\N	2026-06-30 15:52:37	2026-06-29 04:52:37	2026-06-30 15:52:37	\N	0101000020E6100000925CFE43FAC153C0CCEEC9C3422D07C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
985	INC-2026-00985	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	4	17	2	1	Camino Noelia, 4, 1º D, 42380, Barrera del Vallès	-3.30010000	-80.00140000	53	\N	\N	\N	2026-07-23 12:52:37	2026-07-23 12:52:37	\N	0101000020E6100000B98D06F0160054C09F3C2CD49A660AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
995	INC-2026-00995	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	6	22	1	1	Calle Cadena, 62, 8º, 68514, O Anaya del Mirador	-2.19920000	-79.93620000	53	\N	\N	\N	2026-06-30 06:52:37	2026-06-30 06:52:37	\N	0101000020E6100000F9A067B3EAFB53C0D5E76A2BF69701C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
996	INC-2026-00996	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	5	21	4	1	Praza Pagan, 9, 84º B, 56645, La Godínez del Penedès	-3.28910000	-80.00140000	54	\N	\N	\N	2026-06-28 10:52:37	2026-06-28 10:52:37	\N	0101000020E6100000B98D06F0160054C055302AA913500AC0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
997	INC-2026-00997	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	1	2	4	5	Calle Villa, 6, 4º E, 12483, Vall Adame del Penedès	-2.24520000	-79.88520000	54	12	\N	2026-07-14 06:52:38	2026-07-12 02:52:38	2026-07-14 06:52:38	\N	0101000020E6100000D49AE61DA7F853C067D5E76A2BF601C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
998	INC-2026-00998	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	7	\N	4	1	Rúa Inés, 676, 04º C, 00096, O Sanabria	-2.89110000	-79.00790000	53	\N	\N	\N	2026-06-30 18:52:38	2026-06-30 18:52:38	\N	0101000020E6100000DC68006F81C053C08CB96B09F92007C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
999	INC-2026-00999	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	6	24	3	1	Rúa Diego, 8, 6º 9º, 18131, La Escudero de la Sierra	-2.16120000	-79.86920000	54	\N	\N	\N	2026-07-21 14:52:38	2026-07-21 14:52:38	\N	0101000020E6100000BA6B09F9A0F753C0EEEBC039234A01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
1000	INC-2026-01000	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	7	\N	2	6	Plaça Ángela, 713, 66º F, 68086, Los Tórrez de las Torres	-3.24710000	-79.96140000	53	16	\N	\N	2026-07-09 01:52:38	2026-07-09 15:52:38	\N	0101000020E6100000F697DD9387FD53C099BB96900FFA09C0	331	\N	\N	\N	2026-07-09 15:52:38	\N	\N	\N	CLASSIFIED	\N	\N	\N
52	INC-2026-00052	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	6	23	3	4	Praza Ana Isabel, 45, Bajos, 56268, El Esteve del Puerto	-2.88510000	-79.04190000	55	30	\N	2026-07-08 04:52:28	2026-07-05 12:52:28	2026-07-08 04:52:28	\N	0101000020E6100000F46C567DAEC253C04D840D4FAF1407C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
53	INC-2026-00053	Acumulación de basura	El contenedor está desbordado y hay mal olor en la zona residencial.	1	1	1	5	Avenida Abrego, 74, 6º B, 99056, Vall Costa de Lemos	-3.29210000	-79.94040000	53	19	\N	2026-07-07 05:52:28	2026-07-05 18:52:28	2026-07-07 05:52:28	\N	0101000020E6100000234A7B832FFC53C0F54A598638560AC0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
54	INC-2026-00054	Ruido excesivo en local	El bar de la esquina tiene la música muy alta fuera de horario permitido.	3	12	3	5	Camiño Jon, 80, 06º E, 75971, Los Carrillo	-3.21310000	-79.99940000	55	16	\N	2026-07-22 05:52:28	2026-07-21 09:52:28	2026-07-22 05:52:28	\N	0101000020E6100000D5E76A2BF6FF53C08638D6C56DB409C0	331	\N	\N	\N	\N	14	\N	\N	CLASSIFIED	\N	\N	\N
55	INC-2026-00055	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	4	14	2	1	Travesía Rodríquez, 9, 67º A, 34777, Los Blanco de Lemos	-2.92010000	-78.99890000	54	\N	\N	\N	2026-07-18 22:52:28	2026-07-18 22:52:28	\N	0101000020E61000005DFE43FAEDBF53C0956588635D5C07C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
56	INC-2026-00056	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	3	11	2	4	Ronda Montaño, 9, Bajos, 19340, Vall Meléndez	-2.21620000	-79.89820000	55	9	\N	2026-06-30 20:52:28	2026-06-29 06:52:28	2026-06-30 20:52:28	\N	0101000020E61000001A51DA1B7CF953C05F29CB10C7BA01C0	482	\N	\N	\N	\N	8	\N	\N	CLASSIFIED	\N	\N	\N
285	INC-2026-00285	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	7	\N	1	1	Ronda Izan, 20, Ático 1º, 50769, As Sáez	-2.92810000	-79.04690000	55	\N	\N	\N	2026-07-06 22:52:30	2026-07-06 22:52:30	\N	0101000020E6100000AC8BDB6800C353C03F575BB1BF6C07C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
663	INC-2026-00663	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	2	6	3	1	Plaza Flores, 3, 0º F, 26962, San Del Río del Puerto	-3.24210000	-79.99640000	55	\N	\N	\N	2026-06-29 12:52:34	2026-06-29 12:52:34	\N	0101000020E6100000006F8104C5FF53C08FE4F21FD2EF09C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
775	INC-2026-00775	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	7	\N	1	1	Calle María Ángeles, 92, 57º D, 87514, Ruíz de Lemos	-3.21510000	-79.93340000	54	\N	\N	\N	2026-07-07 06:52:35	2026-07-07 06:52:35	\N	0101000020E610000088855AD3BCFB53C0F1F44A5986B809C0	331	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
939	INC-2026-00939	Bache profundo en la vía	Hay un bache gigante que daña los vehículos al pasar.	2	9	1	6	Travessera Alfonso, 1, 1º A, 22179, A Prado Baja	-3.24510000	-79.98140000	53	18	\N	\N	2026-07-19 07:52:37	2026-07-20 02:52:37	\N	0101000020E6100000D712F241CFFE53C02EFF21FDF6F509C0	331	\N	\N	\N	2026-07-20 02:52:37	\N	\N	\N	CLASSIFIED	\N	\N	\N
986	INC-2026-00986	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	5	18	1	5	Camino Roberto, 81, 10º 6º, 28143, As Nájera	-2.89410000	-79.03790000	54	30	\N	2026-07-10 09:52:37	2026-07-08 04:52:37	2026-07-10 09:52:37	\N	0101000020E61000002D211FF46CC253C02CD49AE61D2707C0	11	\N	\N	\N	\N	26	\N	\N	CLASSIFIED	\N	\N	\N
987	INC-2026-00987	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	2	9	2	1	Carrer Daniel, 51, 2º B, 78523, Villa Bernal	-2.15920000	-79.90220000	53	\N	\N	\N	2026-07-16 01:52:37	2026-07-16 01:52:37	\N	0101000020E6100000E09C11A5BDF953C0832F4CA60A4601C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
988	INC-2026-00988	Caída de árbol	Un árbol viejo cayó sobre la vereda bloqueando el paso peatonal.	1	3	1	6	Plaza Cristian, 9, 98º F, 96308, As Requena	-2.14620000	-79.92520000	53	9	\N	\N	2026-07-06 08:52:37	2026-07-06 20:52:37	\N	0101000020E610000097900F7A36FB53C0CF66D5E76A2B01C0	482	\N	\N	\N	2026-07-06 20:52:37	\N	\N	\N	CLASSIFIED	\N	\N	\N
989	INC-2026-00989	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	7	\N	1	1	Camiño Eva, 137, 08º F, 60611, A Reyes Alta	-2.93210000	-79.02090000	53	\N	\N	\N	2026-07-09 06:52:37	2026-07-09 06:52:37	\N	0101000020E6100000211FF46C56C153C014D044D8F07407C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
990	INC-2026-00990	Luminaria apagada en el parque	El parque está completamente a oscuras desde hace 3 días.	6	22	4	1	Travesía Yaiza, 18, 99º B, 65251, San Armijo del Bages	-2.16820000	-79.91020000	55	\N	\N	\N	2026-07-15 05:52:37	2026-07-15 05:52:37	\N	0101000020E61000006E3480B740FA53C0637FD93D795801C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
991	INC-2026-00991	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	5	19	3	1	Travesía Benavídez, 400, 3º 1º, 22136, La Ozuna	-2.91910000	-78.98490000	54	\N	\N	\N	2026-07-02 17:52:37	2026-07-02 17:52:37	\N	0101000020E61000002575029A08BF53C05F07CE19515A07C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
992	INC-2026-00992	Alcantarilla sin tapa	Se robaron la tapa de la alcantarilla y es un peligro para los transeúntes.	5	21	2	1	Ruela Briones, 8, Bajos, 05901, Las Cavazos	-2.89910000	-78.98790000	54	\N	\N	\N	2026-07-08 19:52:37	2026-07-08 19:52:37	\N	0101000020E6100000FAEDEBC039BF53C036AB3E575B3107C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
993	INC-2026-00993	Vehículo abandonado	Hay un carro sospechoso abandonado hace semanas en la calle principal.	2	7	2	1	Travessera Nora, 737, Bajo 2º, 93267, A Valdez del Penedès	-2.85910000	-79.00090000	55	\N	\N	\N	2026-07-12 12:52:37	2026-07-12 12:52:37	\N	0101000020E610000040A4DFBE0EC053C0E5F21FD26FDF06C0	11	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
994	INC-2026-00994	Corte de energía	Todo el sector está sin luz desde la madrugada, afectando negocios.	4	15	1	1	Travessera Laia, 286, 6º, 06315, As Caraballo	-2.21820000	-79.89020000	55	\N	\N	\N	2026-06-24 10:52:37	2026-06-24 10:52:37	\N	0101000020E61000008CB96B09F9F853C0C9E53FA4DFBE01C0	482	\N	\N	\N	\N	\N	\N	\N	CLASSIFIED	\N	\N	\N
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: core; Owner: user_im
--

COPY core.notifications (id, user_id, title, message, is_read, read_at, created_at, updated_at, type, incident_id) FROM stdin;
1	53	Cambio de estado	Tu incidencia INC-2026-00780 cambio de Nueva a En Revision.	f	\N	2026-07-24 12:21:30	2026-07-24 12:21:30	STATUS_CHANGE	780
\.


--
-- Data for Name: priorities; Type: TABLE DATA; Schema: core; Owner: user_im
--

COPY core.priorities (id, name, level, color, sla_hours, is_active, created_at, updated_at, weight) FROM stdin;
1	Crítica	1	#DC2626	8	t	2026-07-24 10:51:50	2026-07-24 10:51:50	5
2	Alta	2	#F97316	24	t	2026-07-24 10:51:50	2026-07-24 10:51:50	3
3	Media	3	#EAB308	72	t	2026-07-24 10:51:50	2026-07-24 10:51:50	2
4	Baja	4	#22C55E	168	t	2026-07-24 10:51:50	2026-07-24 10:51:50	1
\.


--
-- Data for Name: settings; Type: TABLE DATA; Schema: core; Owner: user_im
--

COPY core.settings (id, key, value, type, description, created_at, updated_at) FROM stdin;
1	app.nombre	Sistema de Gestión de Incidencias Ciudadanas	string	Nombre de la aplicación mostrado en la UI	2026-07-24 10:52:15	2026-07-24 10:52:15
2	incident.codigo_prefijo	INC	string	Prefijo para el código de incidencias (ej: INC-2026-00001)	2026-07-24 10:52:15	2026-07-24 10:52:15
3	incident.adjunto_max_mb	10	integer	Tamaño máximo de archivo adjunto en megabytes	2026-07-24 10:52:15	2026-07-24 10:52:15
4	incident.adjuntos_max_cantidad	5	integer	Cantidad máxima de adjuntos por incidencia	2026-07-24 10:52:15	2026-07-24 10:52:15
5	notificacion.email_activo	true	boolean	Habilitar notificaciones por correo electrónico	2026-07-24 10:52:15	2026-07-24 10:52:15
6	mapa.latitud_centro	-1.8312	string	Latitud del centro del mapa por defecto (Ecuador)	2026-07-24 10:52:15	2026-07-24 10:52:15
7	mapa.longitud_centro	-78.4678	string	Longitud del centro del mapa por defecto (Ecuador)	2026-07-24 10:52:15	2026-07-24 10:52:15
8	mapa.zoom_default	6	integer	Nivel de zoom inicial del mapa	2026-07-24 10:52:15	2026-07-24 10:52:15
\.


--
-- Data for Name: state_transitions; Type: TABLE DATA; Schema: core; Owner: user_im
--

COPY core.state_transitions (id, source_state_id, target_state_id, requires_comment, allowed_roles, is_active, created_at, updated_at) FROM stdin;
1	1	2	f	["ADMIN", "SUPERVISOR"]	t	2026-07-24 10:51:49	2026-07-24 10:51:49
2	1	6	t	["ADMIN", "SUPERVISOR"]	t	2026-07-24 10:51:49	2026-07-24 10:51:49
3	2	3	f	["ADMIN", "SUPERVISOR"]	t	2026-07-24 10:51:49	2026-07-24 10:51:49
4	2	6	t	["ADMIN", "SUPERVISOR"]	t	2026-07-24 10:51:49	2026-07-24 10:51:49
5	3	4	t	["ADMIN", "SUPERVISOR", "OPERADOR"]	t	2026-07-24 10:51:49	2026-07-24 10:51:49
6	4	5	f	["ADMIN", "SUPERVISOR"]	t	2026-07-24 10:51:49	2026-07-24 10:51:49
7	4	7	t	["ADMIN", "SUPERVISOR"]	t	2026-07-24 10:51:49	2026-07-24 10:51:49
8	5	7	t	["ADMIN"]	t	2026-07-24 10:51:49	2026-07-24 10:51:49
9	6	7	t	["ADMIN", "SUPERVISOR"]	t	2026-07-24 10:51:49	2026-07-24 10:51:49
10	7	2	f	["ADMIN", "SUPERVISOR"]	t	2026-07-24 10:51:49	2026-07-24 10:51:49
\.


--
-- Data for Name: states; Type: TABLE DATA; Schema: core; Owner: user_im
--

COPY core.states (id, name, description, color, is_initial_state, is_final_state, allows_edition, "order", is_active, created_at, updated_at) FROM stdin;
1	NUEVA	Incidencia recién reportada, pendiente de revisión	#90A4AE	t	f	t	1	t	2026-07-24 10:51:49	2026-07-24 10:51:49
2	EN_REVISION	Siendo evaluada por un supervisor	#2196F3	f	f	t	2	t	2026-07-24 10:51:49	2026-07-24 10:51:49
3	EN_PROGRESO	Asignada a un operador y en proceso de resolución	#FFC107	f	f	f	3	t	2026-07-24 10:51:49	2026-07-24 10:51:49
4	RESUELTA	El operador ha completado la resolución	#8BC34A	f	f	f	4	t	2026-07-24 10:51:49	2026-07-24 10:51:49
5	CERRADA	Confirmada como resuelta satisfactoriamente	#4CAF50	f	t	f	5	t	2026-07-24 10:51:49	2026-07-24 10:51:49
6	RECHAZADA	No procede o duplicada	#F44336	f	t	f	6	t	2026-07-24 10:51:49	2026-07-24 10:51:49
7	REABIERTA	Reabierta por un supervisor o administrador debido a una resolución insatisfactoria.	#FF9800	f	f	t	7	t	2026-07-24 10:51:49	2026-07-24 10:51:49
\.


--
-- Data for Name: subcategories; Type: TABLE DATA; Schema: core; Owner: user_im
--

COPY core.subcategories (id, category_id, name, description, is_active, created_at, updated_at) FROM stdin;
1	1	Bache	\N	t	2026-07-24 10:51:50	2026-07-24 10:51:50
2	1	Semáforo dañado	\N	t	2026-07-24 10:51:50	2026-07-24 10:51:50
3	1	Señalización vial	\N	t	2026-07-24 10:51:50	2026-07-24 10:51:50
4	1	Hundimiento	\N	t	2026-07-24 10:51:50	2026-07-24 10:51:50
5	1	Pavimento deteriorado	\N	t	2026-07-24 10:51:50	2026-07-24 10:51:50
6	2	Fuga de agua	\N	t	2026-07-24 10:51:50	2026-07-24 10:51:50
7	2	Alcantarilla tapada	\N	t	2026-07-24 10:51:50	2026-07-24 10:51:50
8	2	Falta de agua	\N	t	2026-07-24 10:51:50	2026-07-24 10:51:50
9	2	Drenaje colapsado	\N	t	2026-07-24 10:51:50	2026-07-24 10:51:50
10	3	Luminaria apagada	\N	t	2026-07-24 10:51:50	2026-07-24 10:51:50
11	3	Poste dañado	\N	t	2026-07-24 10:51:50	2026-07-24 10:51:50
12	3	Cable caído	\N	t	2026-07-24 10:51:50	2026-07-24 10:51:50
13	3	Zona sin iluminación	\N	t	2026-07-24 10:51:50	2026-07-24 10:51:50
14	4	Parque descuidado	\N	t	2026-07-24 10:51:50	2026-07-24 10:51:50
15	4	Mobiliario dañado	\N	t	2026-07-24 10:51:50	2026-07-24 10:51:50
16	4	Juegos infantiles rotos	\N	t	2026-07-24 10:51:50	2026-07-24 10:51:50
17	4	Área verde sin mantenimiento	\N	t	2026-07-24 10:51:50	2026-07-24 10:51:50
18	5	Basura acumulada	\N	t	2026-07-24 10:51:50	2026-07-24 10:51:50
19	5	Contenedor lleno	\N	t	2026-07-24 10:51:50	2026-07-24 10:51:50
20	5	Residuos peligrosos	\N	t	2026-07-24 10:51:50	2026-07-24 10:51:50
21	5	Falta de recolección	\N	t	2026-07-24 10:51:50	2026-07-24 10:51:50
22	6	Vandalismo	\N	t	2026-07-24 10:51:50	2026-07-24 10:51:50
23	6	Zona insegura	\N	t	2026-07-24 10:51:50	2026-07-24 10:51:50
24	6	Obstrucción de vía	\N	t	2026-07-24 10:51:50	2026-07-24 10:51:50
\.


--
-- Data for Name: territorial_units; Type: TABLE DATA; Schema: core; Owner: user_im
--

COPY core.territorial_units (id, name, type, parent_id, code, is_active, created_at, updated_at, coverage_area) FROM stdin;
1	Ecuador	country	\N	EC	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
8	Insular	operational_zone	1	Z7	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
10	Azuay	province	1	01	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
11	Cuenca	canton	6	0101	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
12	Cuenca	parish	11	010150	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
13	Baños	parish	11	010151	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
14	Cumbe	parish	11	010152	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
15	Chaucha	parish	11	010153	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
16	Checa	parish	11	010154	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
17	Chiquintad	parish	11	010155	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
18	Llacao	parish	11	010156	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
19	Molleturo	parish	11	010157	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
20	Nulti	parish	11	010158	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
21	Octavio Cordero Palacios	parish	11	010159	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
22	Paccha	parish	11	010160	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
23	Quingeo	parish	11	010161	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
24	Ricaurte	parish	11	010162	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
25	San Joaquín	parish	11	010163	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
26	Santa Ana	parish	11	010164	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
27	Sayausí	parish	11	010165	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
28	Sidcay	parish	11	010166	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
29	Sinincay	parish	11	010167	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
30	Tarqui	parish	11	010168	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
31	Turi	parish	11	010169	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
32	Valle	parish	11	010170	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
33	Victoria Del Portete	parish	11	010171	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
34	Girón	canton	6	0102	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
35	Girón	parish	34	010250	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
36	La Asunción	parish	34	010251	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
37	San Gerardo	parish	34	010252	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
38	Gualaceo	canton	6	0103	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
39	Gualaceo	parish	38	010350	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
40	Daniel Córdova Toral	parish	38	010352	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
41	Jadán	parish	38	010353	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
42	Mariano Moreno	parish	38	010354	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
43	Remigio Crespo Toral	parish	38	010356	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
44	San Juan	parish	38	010357	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
45	Zhidmad	parish	38	010358	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
46	Luis Cordero Vega	parish	38	010359	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
47	Simón Bolívar	parish	38	010360	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
48	Nabón	canton	6	0104	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
49	Nabón	parish	48	010450	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
50	Cochapata	parish	48	010451	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
51	El Progreso	parish	48	010452	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
52	Las Nieves	parish	48	010453	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
53	Paute	canton	6	0105	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
54	Paute	parish	53	010550	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
55	Bulán	parish	53	010552	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
56	Chicán	parish	53	010553	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
57	El Cabo	parish	53	010554	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
58	Guarainag	parish	53	010556	t	2026-07-24 10:51:50	2026-07-24 10:51:50	\N
59	San Cristóbal	parish	53	010559	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
60	Tomebamba	parish	53	010561	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
61	Dug Dug	parish	53	010562	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
62	Pucará	canton	6	0106	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
63	Pucará	parish	62	010650	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
64	San Rafael De Sharug	parish	62	010652	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
65	San Fernando	canton	6	0107	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
66	San Fernando	parish	65	010750	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
67	Chumblín	parish	65	010751	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
68	Santa Isabel	canton	6	0108	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
69	Santa Isabel	parish	68	010850	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
70	Abdón Calderón	parish	68	010851	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
71	El Carmen De Pijilí	parish	68	010852	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
72	Shaglli	parish	68	010853	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
73	San Salvador De Cañaribamba	parish	68	010854	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
74	Sígsig	canton	6	0109	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
75	Sígsig	parish	74	010950	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
76	Cuchil	parish	74	010951	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
77	Jima	parish	74	010952	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
78	Güel	parish	74	010953	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
79	Ludo	parish	74	010954	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
80	San Bartolomé	parish	74	010955	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
81	San José De Raranga	parish	74	010956	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
82	Oña	canton	6	0110	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
83	San Felipe De Oña	parish	82	011050	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
5	Sierra Norte / Centro	operational_zone	1	Z4	t	2026-07-24 10:51:50	2026-07-24 10:51:50	0106000020E6100000010000000103000000010000005504000008D397A8F59853C0FE0913DD18FAEFBF8493D29E189753C00073A9078816F0BFD4F9F830CD9653C0FE8B7105E128F0BF20A3AD91779653C0FFA6AC487A48F0BF6027614B349653C0FE24697D1869F0BF0403523FC89553C0FE40A3BA0780F0BF744C96C0519553C0FE39AB774B91F0BFD8B930D2EB9453C00143AA8D89B3F0BF58168B60F59453C000FBD263DAC5F0BFD4023D32489553C00248F18926DCF0BF68CF5588819553C0FED82EC080E6F0BFF0D521468E9553C0FE520E655C5CF1BF38F56D93FA9553C0013ADAF44470F1BF788820B00D9653C001AEE3BA878EF1BF7425FA63F79553C00031F9A3FEABF1BF8C82A120AE9553C0FE4368ED7EC1F1BF508CC8B7849553C0005F2B4092DCF1BF0019AF168B9553C002FE1FA6CB02F2BF440F887FB49553C00272296C0E21F2BFDCA1ED6D1A9653C002A9CB3BE444F2BFE4946BFD799653C0FF30993EFC5BF2BF8841EBD7999653C002CAD58A9488F2BF48AE38BB869653C0FFA631E73AA9F2BF64A8B92B279653C0012963FA60B4F2BF54EFEE039B9553C0FE936DAA65B0F2BF3C70D743E29453C0FE50A38DAC9FF2BF886EB937559453C001CE15B4AF7DF2BF24683753F19353C0026F92B6566BF2BF385CEF5A899353C0025258796754F2BF643DA662219353C002C2BAD79A44F2BF8C0FB99A8E9253C002D39C4A733CF2BF3CE791E6FF9153C0FE3F01B5FA3DF2BFB43287286F9153C000CF9D501D45F2BFA884A3BB169153C0FF96EBD45F5EF2BF4C58BFF2909053C0FF5014ABB070F2BF88C9010CA28F53C0FEE8C1144D6EF2BF1C20DD0A4C8F53C0FF1ED5012763F2BF802A51D0CF8E53C0010D66B8A64DF2BF60911F245D8E53C0FE8834A58042F2BF04653B5BD78D53C001471595724EF2BFA4658889848D53C000FF3D6BC360F2BF38BC63882E8D53C0014C5C910F77F2BF00E0A40BBF8C53C001F2C02A8B90F2BF7890CCED558C53C0023EDF50D7A6F2BF00A41A1C038C53C0FEA7C0C936D8F2BF005B0EBCA68B53C0FF137686E6F0F2BFEC3E1D48048B53C0FF7058E90700F3BF449F1FDE848A53C00138A90C3CFFF2BFD02FAE44028A53C001A96BD6E1F4F2BF94F0C87B7C8953C0024E2563B2F1F2BF10A1F05D138953C0000C0653A4FDF2BF00E82536878853C00092D355BC14F3BF14E2A6A6278853C000B24EC27029F3BF94F5F4D4D48753C0FE7CE6E14151F3BF24B587A2CA8753C0FF7C5B9FCA86F3BFA472350DA58753C0018BCC8E1A4CF4BFC8320316728753C00152AC944A7AF4BF00C6B532858753C0FFFCAC1DB89FF4BF2C7901CBB18753C0007F6D13DAD9F4BFF4E54EAE9E8753C001474D190A08F5BF9CACE874788753C0FF818BD8D137F5BF4059684F988753C0FF8F4208B153F5BF481FB5E7C48753C001880CC415ACF5BF107F805A118853C002F1ED3C75DDF5BF24A8F33E548853C002B8CD42A50BF6BF68914A37DD8853C0024B52759C3EF6BF6C3D7DE34F8953C001910068A661F6BFA833564C798953C0FF283DB43E8EF6BF303A220A868953C001079910E5AEF6BF0434AF55C88953C001A7FE6232C4F6BF51C79DB1538A53C001B244A6FDF0F6BF98131BF6F28A53C0FF7CDCC5CE18F7BFB0366245348B53C0FFBCE6AF8A20F7BF0CAE7117B08B53C0FE837F67342FF7BF2066836D408C53C002633E1B1748F7BF3C1E95C3D08C53C0005BC7047168F7BF9CE5F336488D53C0FF606AA6D67EF7BFAC100264FB8D53C0004D0EF5749BF7BF2CC55FD7728E53C00019DB3196B5F7BFBC202A39F98E53C001F18C0973D3F7BFD41FADA6758F53C000FC3C87DEE4F7BF18B39B02019053C002F6FA8D88F7F7BF48CBA82FB49053C000C809C4FFFEF7BFF4866E685D9153C0020AED044AF6F7BF40EED104B29153C002F022CFD2EEF7BF3C727343569253C0FF03E9BAD4B6F7BF98655D76049353C00137E76063AAF7BF7C8903DE859353C00019DB3196B5F7BF10E5CD3F0C9453C000FEA6C17EC9F7BF20B8C5ED519453C0FEEE57EC22E1F7BF58168B60F59453C0015420A3D1EFF7BFAC28553DC19553C0FFB20206F3FEF7BFDCA1ED6D1A9653C0FEF214090B16F8BF6C6E06C4539653C0FF320BE2733FF8BFF0BDDEE1BC9653C0FF86993B0249F8BF9431DD44039753C0FECEA63B4D43F8BFFC1383BD329753C0FF320BE2733FF8BF400A5C265C9753C0FFAEF5F8FC21F8BFEC7C2899A89753C000353419190AF8BF6CCC00B7119853C00051688930F6F7BFC8F8E47F979853C0FFFAD92FA2ECF7BFFCBA89104D9953C0FE689CF947E2F7BF045A3A4C1F9A53C0001AC6B95AD2F7BF4CEFC3F01A9B53C002C3538A7BB6F7BF14989BC3C39B53C0FF1DEFF0FF9CF7BFB81D7F41899C53C002A8E52ABD7EF7BF340A3113DC9C53C0019A2EFBDD62F7BF00B308E6849D53C001989F18E233F7BFD43B473D149E53C002B68BA29A19F7BF9C81F8C3A69E53C0012D0686E108F7BF6CA710CF1F9F53C00085A1EC65EFF6BF2C8A9B099C9F53C001BBB4D93FE4F6BF5023CDB50EA053C0FE4282DC57FBF6BFACBF593B4BA053C0FFA6C765C520F7BFF0B532A474A053C0FF558008D43FF7BFBC782463D7A053C002C6D1B47564F7BF40C8FC8040A153C0FF768A578483F7BFF847616FA6A153C0FF1DEFF0FF9CF7BFE4B0064B1CA253C00041227755ABF7BF3860AADBD1A253C0FF844187639FF7BF20C94FB747A353C000BB54743D94F7BFC04E33350DA453C001B59C5A9C9AF7BFB0B7D81083A453C0FF727D4A8EA6F7BFD0500ABDF5A453C0FEEC3E2A72BEF7BF5086C8EEA4A553C0001AC6B95AD2F7BFBC6B77DFB6A653C0029CF7CC80DDF7BF54FEDCCD1CA753C0FEA9AEFC5FF9F7BF30871B25ACA753C0015F1FB90F12F8BFC8A9D8565BA853C000688FEC5105F8BF683C3E45C1A853C002EECD0C6EEDF7BFE8EE3CAF40A953C00200924943E6F7BF10886E5BB3A953C0FFFAD92FA2ECF7BF1CDE123729AA53C0003EA44C5BFDF7BFE0CFF6692EAB53C0FF110193C3FBF7BFB8CE72184DAC53C00290CF7F9DF0F7BFE02DF15CECAC53C000D2EE8FABE4F7BF687DC97A55AD53C002B72B3D98C9F7BF8416FB26C8AD53C00208739A89AAF7BFF4BF1F281EAE53C000CD18B1128DF7BFC8E5373397AE53C0FF444BAEFA75F7BF94A829F2F9AE53C001F82C88AE5FF7BF487E1CB15CAF53C0024004B25D4DF7BFB88A67FEC8AF53C0FF674445A938F7BF38DA3F1C32B053C0013BBDB5C024F7BFA8E68A699EB053C0FE274E6C400FF7BF90EC09F9FDB053C00116DF22C0F9F6BFBC4B883D9DB153C0FF7895C931F0F6BF14C178667FB253C0FFDFE75F95F2F6BF149ADC0925B353C002A1806928F8F6BF4813753A7EB353C001041BE6EA00F7BF8CCF9A3BD4B353C002E9E675D314F7BFAC05A69B30B453C0020962E28729F7BFD46424E0CFB453C000AC0E626249F7BF3CF42EF56BB553C00031DC647A60F7BF84B054F6C1B553C000286C31386DF7BF98CC456A64B653C0003F9394597CF7BF5C751D3D0DB753C0FE6D364EF17DF7BF30380FFC6FB753C00206E4B78D7BF7BF94C719110CB853C001DA40FEF579F7BF2008DC3783B853C0FF62B3E9487BF7BF54F2F7D9E8B853C0FF6109FEC655F7BFD0EDC6644CB953C0016A80146D35F7BF50A224D8C3B953C0028BC1608A1CF7BFC89DF36227BA53C0FF8253DC74F8F6BFAC950E0B72BA53C0FEC46B3A0FE2F6BF1431E2BEB2BA53C000E8AC862CC9F6BF1089F83D20BB53C001E94BDE1CA0F6BF0CE10EBD8DBB53C0FF1572C5F58AF6BF707CE270CEBB53C0011FE9DB9B6AF6BFB8B7BA4DECBB53C00012D8B52030F6BF5074FD1819BC53C0007D73592EEEF5BFB4E3450D23BC53C00069203A5DC6F5BF38408D012DBC53C001B9876D5398F5BFB8B7BA4DECBB53C001BA26C5436FF5BFC01833B792BB53C0FED48F52AB4DF5BF7885445B07BB53C0FEDA0669512DF5BF7C2D2EDC99BA53C002F0621AB310F5BF3039C71668BA53C00232B0959DECF4BF2C0D3C5731BA53C0FF3FFF6AF9D4F4BF50A224D8C3B953C0FF545B1C5BB8F4BF9C85E63574B953C0FF46E0BB3F99F4BF20B6A26A47B953C0007C137F1E7FF4BFD84E3FCEF2B853C0FE899771CA59F4BFEC3D10E4F6B853C0FE8A2AEE3840F4BFC097B75A0FB953C0FE42D400821AF4BF7CEAEA5142B953C0FFBDA58C4DF5F3BFF011563571B953C000B6BF01CDDAF3BFE02FE35C79B953C0FFA966310CB3F3BF582A1D4975B953C0FF2239C38196F3BFF4239B6411B953C0026980779780F3BF803BA6A7B5B853C0007C5FD8715EF3BFD0A1CC396AB853C0FE5C259B8247F3BFB8D5B63835B853C0FEC5A274DF25F3BFEC10BCA331B853C0010385453B1AF3BFE800804A32B853C0FF526C5F4F1AF3BFAC4631D1C4B853C002FDDD05C110F3BFB4E5E10C97B953C002A0FBA29F01F3BFD8E1390520BA53C0FF137686E6F0F2BFD457775CAFBA53C001924473C0E5F2BF600A76C62EBB53C0FEBEE72C58E7F2BFE4594EE497BB53C0FE79C81C4AF3F2BF18D3E614F1BB53C0012F39D9F90BF3BF844258AE73BC53C0FE0A9535A02CF3BF64CB960503BD53C00058B35BEC42F3BF28746ED8ABBD53C0FFA9899BD952F3BFC8962B0A5BBE53C0FF2603955E64F3BFE41543CA13BF53C0FE2C9F845070F3BFE851CDB9CFBF53C0FE2C9F845070F3BF04340BC69EC053C0FF2603955E64F3BF50E3AE5654C153C0FFA9899BD952F3BF3C4C5432CAC153C0018FC648C637F3BF987838FB4FC253C0FF7E0F19E71BF3BFCC3ADD8B05C353C0FFCC9E5C3703F3BF80A0278EB1C353C0FE79C81C4AF3F2BF2CA451EE4FC453C0001B553EE5D7F2BF909476FBF0C453C0000219F5A1AFF2BFB007A1566DC553C000F93164778CF2BFFC2FC80AFCC553C00246EA517972F2BF3894090E9BC653C0FEECD893B664F2BF20A469AE25C753C0FEECD893B664F2BFE4C6CA4EB0C753C0FFDDF620DE6CF2BF40EBD95A1CC853C0014C5C910F77F2BF6083055D86C853C0FFD7FA38868FF2BF548F4D55EEC853C0FF5CB24FD284F2BF98E7466025C953C000593F0A9277F2BFF00B566C91C953C001F7BD188D76F2BFD8922DDCE3C953C0028F26AEC887F2BF943402CE4BCB53C001474F84199AF2BFA999FFA14ACC53C0027A8E2DA3A7F2BF98F5220D20CD53C0013B273736ADF2BF2CFEC55215CE53C0001C3BAD7DC7F2BF0024DE5D8ECE53C000FE4E23C5E1F2BF78F6754327CF53C0FE6DA0CF6606F3BFD8858058C3CF53C0FE3FA8227A21F3BF28A5CCA52FD053C0FF60238F2E36F3BFA077648BC8D053C000B7B1E8BC3FF3BF1CDA53B4AAD153C0FF54FB414B49F3BF54B612311AD253C0FF890E2F253EF3BFA8D1C4BE60D253C002B587C2812CF3BF04FC9A1234D253C001981C3276EEF2BFECC72AFB47D253C0FFCDEE4C45ABF2BF501C8D979CD253C0FFE757DAAC89F2BF601B100519D353C0FEE8C1144D6EF2BF5C9FB143BDD353C002EA2B4FED52F2BFDCC60B8E57D453C002F67A24493BF2BFD0BDA9A31ED553C00019BC706622F2BF1CDE9B2887D553C0000B41104B03F2BF84DAE7456ED553C000618002F7DDF1BF5020205017D553C001F44BD386BCF1BFF4FF28ECCDD453C001788E983E93F1BFD84D886A7ED453C000B2796A953BF1BF28B0965410D453C0FEA5209AD413F1BF58956504CBD353C0FF83741D4FF8F0BFA8CFD1E7F9D353C002F1643CECE3F0BFC87D5AC126D453C0FFFC46AFC4DBF0BFE045581A39D453C0007F8B80D0C3F0BF8C0F04DF2CD453C000B37C7623A0F0BFA8CFD1E7F9D353C002D23F562A87F0BF4CC5375B73D353C0011214C5FF63F0BF6C9B623B03D353C0FF03BCFAE844F0BFD0F29F75DAD253C0FF7E8D86B41FF0BF6C9B623B03D353C0FFFFD157C007F0BF7C55330D98D353C0FE064391AC03F0BF0CF0C84B43D453C001AA6B4FF1F1EFBF0CF0C84B43D453C002F848D36BD6EFBFF427CBF230D453C0FD75F1B01690EFBFA8E52EBFBCD353C002B0042BE450EFBF901D3166AAD353C002721D6BC515EFBFE4579D49D9D353C003624F4970CFEEBFF427CBF230D453C0FEFF326AB4A8EEBFC09BE7E82ED453C002F06654B373EEBF0406262306D453C0FFAD7F949438EEBFD8212171BFD353C002BEBB58C2B1EDBFA8D627585AD353C0FE930826C725EDBF94959341AFD253C0006CF67B20B1ECBF504B17BBCDD153C0FFD79CE2226BECBF187CFB4F0BD153C0024A30B50829ECBFF027400068D053C00040B554ED09ECBFB4C05D77CCCF53C0FD333AF4D1EAEBBF942914EC76CF53C0FC150222F27DEBBF98E7024348CF53C0010845B02D30EBBF68D5589CD3CE53C000E2D38EDBD2EABF4864374A76CE53C0FFAD04737010EABF1C6FF3A5BBCD53C0FE9DE88900DAE9BFF4379E58D2CC53C00024E428E5BAE9BFBC6882ED0FCC53C0017006DA781BE9BF102D7D3E43CB53C000589AABB177E8BF58EE925979C953C0FC4DEBFB4520E7BF48C3842CC6C853C00074D0B7C8D7E5BFC8F1A51829C853C0FED94F76FBE8E4BF30C26676D9C753C002E4AEF13B5BE4BF0C2935CA66C753C00416ECFF7CF8E3BFDCAF9C990DC753C0FCFF8AADB49DE3BF64DD04B474C653C002E454A25441E3BFCC8D872937C653C0041C54383BCFE2BF2419AF62D9C553C003D684E14768E2BF1C3324E2BEC553C003A40C4FC117E2BF7869781DCBC553C0FC75783B67D0E1BF442C3728E8C553C004421ABD92AFE1BFB4DBE6A7E7C553C004427706C9AFE1BF107953102AC553C000C4CE281EF6E1BF8CC030AA76C453C004D2119C075BE2BFDC7B2A3AC1C353C000F0C1303599E2BF1C1223231EC353C00236A5D8ABB1E2BF7C91026458C253C003E0E1C9B0B2E2BF501B7C3119C253C005264E143F9BE2BF2C57968029C253C0FFAFDA70165EE2BFD0E5E3C66CC253C001A481A05536E2BFC40371EE74C253C0FD89CFFFD3E6E1BF60E3798A2BC253C0029EAB4EB0AAE1BF50C8DB989EC153C0FE83FFFDF472E1BF409DCD6BEBC053C000E2B506472DE1BF7CAD971B56C053C00116882116EAE0BFB0E9EC8AF7BF53C0FE09AC18EBA1E0BF1459357F01C053C0038400CCF42CE0BFF87CDBE682C053C00040116299C4DFBF2008E5EA58C153C0F9F3A9FEFC6FDFBFB863AF4CDFC153C0FE73F5A089F8DEBF4C20F2170CC253C002988A890A8BDEBF6854622FF8C153C0FC67727CDDD7DDBF549C50D967C153C003D0EA26BC1ADDBF3C10CA420EC153C0FBC3938DCF30DCBF409DCD6BEBC053C0FAC7C87A79A0DBBF2CE5BB155BC053C0F73B412558E3DABF308DA596EDBF53C00188B1EADE70DABFEDCD2B7B2BBF53C000F0C81C540DDABF58EEBFDA00BE53C002F8FD09FE7CD9BF8064C8B175BD53C0F8977C63D0F5D8BFE054228B3FBD53C007B8F3247966D8BFFCB1C947F6BC53C0F7EBCD0C6EEDD7BFF8BE4BB896BC53C0F977C1C12081D7BF10B9CC2837BC53C0F9A79BA91508D7BF5066993104BC53C0FADF55F88E75D6BFA03CD91E14BC53C0FC8FD385F5F2D5BF5890B18C50BC53C0FC23DCB795A8D5BF003C8CF066BC53C0F8D75321078DD5BF7C0E24D6FFBC53C0FDAF57C90E04D5BF400BC9FC35BD53C0017418E4457ED4BF54EB2F811CBD53C0FFC778E6DBFED3BF844258AE73BC53C007BCB29943D2D3BF1CED0001ABBB53C007BCB29943D2D3BFAC7D8F6728BB53C0F9B7987F5718D4BF54B4D1EAB8BA53C0FF835B71167BD4BF1412C6D51CBA53C005A4917C76D7D4BF18F055D21AB953C0F7B3BAEF5A1AD5BFA40AA7E108B853C0FAD70A15A730D5BF08D990B7D0B653C0F94BDDAC8CC9D5BFA04986A234B653C001BC59A096ECD5BFE41DEF075CB553C001BC59A096ECD5BF306147583EB453C0FE032D502A18D5BFC0C6F03681B353C0F80B7D232C3DD4BFE01EA9905BB253C0009CB6414B49D3BFE453963ACBB153C0071C8FE700AFD2BFE8FB7FBB5DB153C0028C0792DFF1D1BFC09C0177BEB053C007747B0B4998D1BF8C58698AD4AF53C002AC8BD5F802D1BF605101C5A2AF53C0008000CCF42CD0BF08B5B07EDEAF53C0F047C2AD0490CEBFB80FFE4DE1B053C0FBE7E9A92997CDBF7C574A1DE4B153C00250625408DACCBFF8AA2F27B5B253C0F92F644E2DE1CBBF2036392B8BB353C0F3B78B4A52E8CABF00866A5243B453C002D8F524A6C7C9BFC014283932B553C0F24F77316F43C8BF183461EC9EB553C00B48C56928F8C6BFD0236E97BBB553C00770E686F5F2C5BF18FAAD84CBB553C0F057818921F4C4BF18FAAD84CBB553C0F5DF295BEC42C3BF08B720B4CEB553C00C20D1925A37C2BFF8D6B92FE8B553C00C9092FABF5EC1BFA04986A234B653C00880ACFEA09FC0BFC07F910291B653C0FDFFCCE44A66C0BF2872C26343B753C0FDFFCCE44A66C0BFACC19A81ACB753C00FF0D263DAC5C0BFF8E0E6CE18B853C0FDDFD8E26925C1BFA8FD247168B853C0F62F3F7A9A7EC1BF34B023DBE7B853C0F5E77793A5F7C1BF0873159A4AB953C00C20D1925A37C2BFA468A1D4C6B953C0FD7F24138017C2BFB4216CFC52BA53C002083861AEC4C1BF2C91DD95D5BA53C0FA9F8C7B30FFC0BFB0E0B5B33EBB53C00EC0664D1A0DC0BF30CD678591BB53C012E0413827F5BEBFFC8F5944F4BB53C0E8DFDC3A53F6BDBF50AFA59160BC53C0FBCF773D7FF7BCBF1C0F7104ADBC53C0E83F060B6905BCBF682EBD5119BD53C0DECF06428C39BBBFEC7D956F82BD53C0DC1FFB436D7ABABFC4A3AD7AFBBD53C0EA4F7BDF7E14BABFB819EBD18ABE53C0FCCFA144B83ABABF58AC50C0F0BE53C01C10D4A71020BBBFF831343EB6BF53C0188045DA2612BCBF0C4E25B258C053C010C0EBA34E9EBCBF909DFDCFC1C053C0E8FF1D07A783BDBF3C10CA420EC153C0F5BF2905C642BEBF3086079A9DC153C00EB076CF388FBEBF38180DC056C253C0FC3F8D00C215BDBF00DCB750B5C253C021307E557F9BBBBF7803129B4FC353C0E5BF4D3B2535BABFD422878D34C453C0FC5F1D21CBCEB8BF1C0E8C682DC553C00300D14113B8B7BFDCF45FCE89C653C015400E768854B7BF9807BFF31CC853C0F2AFDE36E604B7BFD8F2C3CE15C953C0E9BFA027B951B6BFD44ADA4D83C953C017A07EDDE94EB5BFD44ADA4D83C953C0180040F30485B3BFF052BFA538C953C0F72F010920BBB1BF48C3842CC6C853C014D055AB2305B0BF94334AB353C853C02E20CE2881C0AABF807B385DC3C753C000E04F79FF15A6BF687CB5EF46C753C0D61F14A8AC43A1BF544845D85AC753C06BC0A634F88199BF08E87E8152C853C01840532B025291BFC4763C6841C953C0958041E0FA108DBF008F85D46CCA53C006800DB72FDF8BBF342A8E08C8CB53C08A00E97514B286BF346618F883CC53C0B8FF1AD1E7EA81BF40BCBCD3F9CC53C089FD1B7B6CB464BF18E2D4DE72CD53C0BBF94393B21C533F2081851A45CE53C092FE8B851CB9703F401AB7C6B7CE53C0F101B2B8A20E7F3F4063C32614CF53C0B8801719CE49883FF0C80D29C0CF53C01F0049660CAB8C3F7C7B0C933FD053C0B580207B6CB4843F5C1E65D688D053C0B0FFF3D7B21C733FD8E37A4B81D153C0B003AE1CB31C633F68D203A5BCD253C094FB257B6CB4643FF4E7285B52D353C05B01BB28D650723F64579AF4D4D353C010FFE5CB8FE8833F848DA55431D453C0437FE037E9768D3F38F3EF56DDD453C088BF82237E4E943FECDDD0A8A1D653C08B401719CE49983FF842CE7CA0D753C090FF143D41799B3F782F804EF3D753C0F7FF749B7FDA9F3FE4484D0C00D853C0F11F9CC42569A33F24594061E3D753C0016034B4A165A63F84499A3AADD753C03D60157464ADAA3FBC4CF51377D753C00B60100CF243AD3F7490CF1221D753C0E28F2DFDEB5FB03F702DA9C60AD753C0E24F45F929DEB13F38FD1CF60DD753C0EE4F0FF4D1DBB33F0819A1FB36D753C0F73FBEA55BE2B43FA8F914A7EAD653C0F9FF2954C541B53FA8167BA9A4D653C0F75F8A5336F7B63F8CB161ED32D653C0FE2F4B521862BA3F4CB8BC11B4D553C02050F0B3FC86BD3F44BB6F5465D553C0F09F2E587221C03F3CA1BC945CD553C00CE0D871A599C13F241F3DD630D553C00A500F7099F7C23F0C2D4ABABAD453C021972156CB92C43FE05F64FF25D453C00608F087C0CDC53FF0FE49C00BD453C0F69F10D2717AC73FF8FB967D5AD453C00CC0040667B5C83F2C53A35542D553C010383B045B13CA3F942D1F6AD7D553C001A0E1587AE1CA3F81A5FA9BFED553C0103016777735CB3F58FA8B3174D653C00D8804013C26CC3FD42EAA2EC8D653C0EF6FBE6C03C3CC3FE8761E5E35D753C0F437324492FCCD3FC4C74D2B2AD753C0FD8F1C4DEE2ACF3F101E2B003FD653C0FFAF784E7305D03F6C5D866C91D553C003A817D6095FD03FB452EBD7FFD453C0014CD418D58BD03F20F7207679D453C0FEB75F4A39CCD03FF843EE7AEDD353C00704DFB3691DD13FBC690F1B2FD353C007F09E03CBB1D13F68453ABA8CD253C001EC5E532C46D23FE1AB418B11D253C0FDF362B5F4C6D23F20C26EC1BAD153C0FB83DF472188D33F0457B0F59BD153C0FA135CDA4D49D43F1C05C78697D153C0F86B6F073193D43F384A938F93D153C0FC3B0F0D49D5D43F0457B0F59BD153C0FDE3D595767AD53FECCA295F42D153C00288580C3D33D63FB0F04AFF83D053C0088814FAD546D63FEC99D97204CF53C009146C626F4CD63FDCB2DDAC3DCE53C0FB1BD13CA173D63F34CFEE7CDECD53C00264EBCB9F9DD63F083D844C8DCD53C0F84363A7D1C4D63F0C3922840CCD53C00468AD9DD2A8D63F60346B8972CC53C00130D7203B6BD63FE4818DC0FFCB53C00130D7203B6BD63F389E9E90A0CB53C00028F8E805A6D63FF01499B608CB53C007B40B3F38BFD63F9CD9973472CA53C0FCCBA38E6DBDD63FC45D04F3FBC953C0FC4749A682ABD63F0C7AC0E683C953C001302F505779D63FE4D3E324F8C853C007C407324C57D63FE4A5AA8251C853C0FEB3FA86363ED63F5CEF30B3B0C753C0000C89C87106D63FD076004F70C753C002987B56D9E4D53F74D0EAB9ECC653C003186800A7CBD53FC02A2A5782C653C003186800A7CBD53F9498BF2631C653C009248FAC0BFED53F4C1956F6DFC553C0FCEFD9F73EFBD53F38EE47C92CC553C0F87B10980DC6D53F749F9ACDAEC453C0070041544299D53F3CC5BB6DF0C353C005D88D21470DD53FCC18C23E75C353C0FF637C4DE66AD43F249AAD403DC353C00818A0ECB435D43F5807EEDDD2C253C0F8330749B8D3D33FE016E2476BC253C0F8770010ECC2D33F3877057FF8C153C0FC2FC33651E7D33F88EEAA1E48C153C0F843CD7CB35FD43F88C9808B8CC053C0FF0F603C16CAD43F44AB8FC4E1BF53C0F90B208C775ED53F4486653126BF53C0F7DF95E5D70ED63F8C7BCA9C94BE53C000945C6E05B4D63F2813E3D405BE53C0FEABCB8E9953D73F20AAA6DA5DBD53C0043000AD96A7D73FACB4EC46C8B953C00594A55230A6D73F6031214EF6B853C005B4E811CEE7D73F2433885601B853C005AC7D928C13D83FECF52E3E22B753C005CC19C50A48D83FA8FF3CA554B653C0FBCFDA04EA5DD83F681B576D68B553C0FBF3E6AAC5DCD83F40C19752CFB453C0F9FF3111C245D93F152BCB59FDB353C00248F49CDB01DA3FE4D00B3F64B353C0FE6359B69773DA3FA8B50C45B5B253C0F77BBECF53E5DA3F88A9666936B253C0068C269C5208DB3F58DC80AEA1B153C0037C4BA9B3E9DA3F1C34A854EEB053C0F96F1AF67689DA3FFCB4DBD873B053C00154F1E99850DA3FDC350F5DF9AF53C0FA33E2907A20DA3FC8070F634AAF53C0FF2FAE2AFB0EDA3F78111DCA7CAE53C0084867C37BFDD93F5892504E02AE53C0F937A6839CE7D93F3CA05D328CAD53C009282404DEBBD93F04123898E1AC53C00500185E023DD93FF453ABFB7CAC53C007E8989186C2D83FE00845FF13AC53C0FBCFDA04EA5DD83FC0FC9E2395AB53C0F8BFFF114B3FD83F88FB52E9EEAA53C002BC3ED26B29D83F5414BA6E51AA53C002DC8191096BD83F14C554F590A953C006E83F1EA6CFD83F00B107BBEAA853C00810F350A15BD93FD817887F67A853C0FA37FFF67CDAD93FA8BDC864CEA753C005700043B780DA3F9094BC8695A753C05D8BB375B20CDB3F80B9C9E776A753C0FABBA2B58BD1DB3F74D9E22CE2A653C0FC0B798EDF33DD3F44480A5086A653C00148241A7C98DD3F24005796CEA553C001644A731720DE3FF8A5977B35A553C0067061739477DE3FA443944D9EA453C0FF030595F390DE3F08A4B7842BA453C0FCD7327A24D4DE3F202CDC5204A453C0FFCF740ABA49DF3F3476D253E8A353C0FB1F99DF1AECDF3F54FEF621C1A353C0FEDD2C42D74CE03F2007B2BF48A353C05CF8993107ACE03FC8609C2AC5A253C0FFFFBDEB9EE2E03F1CD880545FA253C0043068D82AFCE03FF0630E7ABDA153C002389C3EAA0DE13FD86974FF1FA153C0FE3F43CBC91AE13FA4175C43AEA053C0FCC3C1712842E13F88E6A8064EA053C0FE6197B77674E13F84CFA889F69F53C00260C2974595E13F5CE55CCCA79F53C001E8A23735A0E13F4C4183EF4B9F53C004604F71A599E13F20017794BB9E53C0FFD9B6178769E13FF84D44992F9E53C0FD4B2FEB7751E13FC4BF1EFF849D53C001D282B10758E13F9C0CEC03F99C53C000D8541EF685E13F84DB38C7989C53C00166940434C3E13F6C761F0B279C53C0FD7F4164C10FE23F50842CEFB09B53C0FE1DCF633E67E23F30CE46B1739B53C004B242B0FBB5E23F30CE46B1739B53C003D2A7C9B727E33F549EDFAEB99B53C000704F7CF487E33F74736CC8759C53C00382F355D1E3E33FCC2A9E40599D53C002AE22351D5CE43FE836441CD89D53C0014EDB1469D4E43F10D0C3575B9E53C0FC6F016E045CE53F18CD1015AA9E53C0FD9927C79FE3E53F2CC2B673D19E53C003A4CBA07C3FE63F485EE9F1059F53C0FDBF92B3C994E63F5C1C768E6A9F53C0FE53EC4CC7DAE63F7C9B420AE59F53C000DC59C616EAE63F94005CC656A053C00068F21F351AE73FA8310F03B7A053C0FE01914CC189E73FB8B38EC1E2A053C000183EAC4ED6E73FD86974FF1FA153C003A463DFCC0AE83FF8CE8DBB91A153C0FE3BAC4BBB38E83F080041F8F1A153C000D005E5B87EE83FF8244E59D3A153C0025C2B1837B3E83FF8CE8DBB91A153C0FEE1C37155E3E83FD0350E800EA153C0FDF945F1130FE93FA08A82E3A9A053C0037A0CDE4311E93F744A768819A053C0FD69A41145EEE83F5CFF0F8CB09F53C004E63F1EA6CFE83F3C443632FD9E53C003DA1CE535D6E83F20ABB6F6799E53C002681738E5E9E83FF8F783FBED9D53C0FE7165512404E93FD027EBFDA79D53C000761D0B5329E93FB8C2D141369D53C0FF05BFEA214AE93FAC74B8021C9D53C0031438E42F85E93F9CEA91E5C89C53C0031E7D77BEAEE93F7C1AF9E7829C53C004368CD0DCDEE93F841252895B9C53C0FFBF4F0ACA2FEA3F7C1AF9E7829C53C0FCCD55DD376FEA3F6850222CC49C53C0015827817CA2EA3FC8D571F7D79C53C004C2910E49CCEA3FA0F90D5A229D53C0042C8C053CFBEA3FE826824F2B9D53C0FE0B3D24471DEB3F0CAFFBF91C9D53C002903D958257EB3F1434115C239D53C00208F49CD608EC3FC4FB5012F79C53C0FD49AA0CA562EC3FB41B4522299D53C0016EF7C7557EEC3FF019DE191E9E53C0046A7B1B0592EC3F44D10F92019F53C004EACEE19498EC3F6CDA022BCF9F53C001F62D28E3CAEC3FD0711B5E47A153C002A24ED42D66ED3F0CFD8DB540A253C0FDBF26148AD3ED3F4C4FA671B2A253C00166022D4645EE3F3C574DD0D9A253C00172EE4CF47BEE3F34960DF1C3A253C0FE7D4D9342AEEE3F1CBECD9456A253C0FEB14EDF7C54EF3F204BA7F45AA253C0FC5107BFC8CCEF3F34404D5382A253C00274BD05C30DF03F4C4FA671B2A253C001BEA3E5912EF03F58B804C4CAA253C000A0A5A8565EF03FB45AB890CDA253C0008B5EA42276F03FD4A4AE91B1A253C0FEBD22446E98F03FB839F0C592A253C001551D4E6DB4F03F4C7090945DA253C0FFF589851FD1F03F54D108FE03A253C001C136521EF4F03FF84BBB33BBA153C0FFE3C3991D09F13F54CDA63583A153C0026FF9788318F13F889FC10440A153C011E4D5766924F13FC0501409C2A053C0FF5821B03535F13F3CFB2D4133A053C0FFB6A4CC9B3DF13F445CA6AAD99F53C000CB6CE90146F13F74EAAE12AA9F53C0006567F30062F13F28F1E7DEBA9F53C0001FBED04C7DF13F78CD4810F09F53C0FE414B184C92F13FBC4CB24041A053C0FE7F53CAFEA0F13FA0807B0B7CA053C002D8B45D31B3F13FB408A0D954A053C0FF5F49CC95ECF13F38395C0E28A053C0002C875DAE0AF23FA4C02BAAE79F53C0FFD4A6E2AD18F23FECDABAA811A053C001119FE8784CF23FE8FB82734CA053C001AB99F27768F23F20D2FF0A8AA053C000301C849086F23F60EC8E09B4A053C002B2BDAC0F9FF23FB4EB39D79AA053C001430569C1C9F23F7C53EB0C52A053C0016001ECA6E3F23F903807DC0EA053C000628204D903F33F700B77DDE49F53C0FE6494E1241FF33F90A31800C69F53C0009A880FE83CF33FC8045BD18A9F53C0009A880FE83CF33FD8A2BEDD0A9F53C0FE0BC570D531F33FDC136388839E53C002B89F823921F33FC4FDC90DE69D53C001C84A3A4F0CF33F78040829D99D53C0018AE1FF8DFEF23F98F8413DBB9D53C0025433E6FCEFF23F08B39BDE939D53C0FED45F874BE9F23F98C05427509D53C0005BB0F481E8F23F54B19DB6079D53C0FE00EAD4F4F1F23F509A6C04B09C53C0FFEA4F702806F33F188CF1B9839C53C0FF4CE1190010F33F2888E2214B9C53C000AC72C3D719F33F08D4E59A2D9C53C000DBA4B8121BF33FC06BEC8CF29B53C000DBA4B8121BF33F70D6331DB09B53C0FEFDA9EEEB14F33F286E3A0F759B53C0FF9B1845140BF33FF48C7E26509B53C002F9BB2B64FFF23FF48C7E26509B53C00263CBCDEFECF23FA8555312559B53C0024F714F2CDEF23F2C9BF9707C9B53C0027088C27DC2F23F1C9F0809B59B53C00055018558ACF23F8030B2E0BE9B53C0FF64AC3C6E97F23F70D6331DB09B53C001FAEDD33486F23FE063CE5C819B53C0014F64FB2273F23F644BE75F619B53C0000A998B4A71F23F10B62EF01E9B53C000002DD00E78F23F8843C92FF09A53C000961D2E838AF23FB8F3B61ED59A53C0FEBB1027E499F23F8C12FB35B09A53C000F26FDB80A2F23FE84517B2729A53C0FF0F361580AAF23FE8E789562B9A53C00055018558ACF23FE889FCFAE39953C00055018558ACF23F04B3ACC4B29953C000F26FDB80A2F23FE0FEAF3D959953C000C97CE21F93F23FA0C37591619953C001C14F23BE8BF23F880B6A720B9953C00047E6026F8FF23F20EF73DDB29853C001574081329EF23F884F4FBB7C9853C000D7976409B0F23FC4CE6EB0219853C000B1533256C4F23FCC9DA0B6E19753C000967BBBDED1F23FA05E5772759753C001D5072FDDE1F23F84A64B531F9753C0011E005E17EBF23FC4C7DDEC7C9653C000AFC3FC29F6F23FB8DE03D4E69553C000CD893629FEF23F84412D34339553C0011782656307F33F08C0F103F49453C001F196754D0EF33F94CDAA4CB09453C00053281F2518F33FA8D28E2E799453C00167EDC5791CF33F9C4742712A9453C0008E53473B1FF33FA81F67F1EB9353C000AC72C3D719F33FF0CB4548989353C0FF4CE1190010F33F9C368DD8559353C00094EB85B203F33F4CA1D468139353C000F3CD68DCE9F23FB001B046DD9253C00173768505D8F23FD8571F72B39253C0027088C27DC2F23F646CF7D69A9253C0FEE4032045A9F23FCC2A6010AC9253C00047E6026F8FF23F401688ABC49253C0FE8F2F6BFB74F23FC8FDA0AEA49253C002E4A592E961F23F941CE5C57F9253C0019080A44D51F23F640E6A7B539253C00104FC011538F23F2C00EF30279253C00043D9AE6524F23F3CFCDF98EE9153C0FEA6FA8D69FCF13F687F0E26CC9153C0FF2CE2A66CDCF13F787BFF8D939153C002A98AC395CAF13F3C40C5E15F9153C0FF1EC72483BFF13F944622FC1A9153C0FE2E72DC98AAF13FF4793E78DD9053C0FF694F89E996F13FD8F20053C79053C0FF029120B085F13FC898828FB89053C002FDA25D2870F13F9CE485089B9053C0FE7C4B7A515EF13F803089817D9053C0023EBF06534EF13F34261DCF899053C0FF9FA1E97C34F13F3057EBC8C99053C0FE6015767E24F13F00058B352C9153C0006454725816F13F58C70207769153C0FF68936E3208F13F4CF8D000B69153C0FFD2A210BEF5F03FF8F173E6FA9153C0008CE9DD5DDEF03FF8F173E6FA9153C0FEF2F87FE9CBF03F687F0E26CC9153C002810D584EB3F03FB458ACDE7F9153C000864C5428A5F03FD023CF4C079153C0005D595BC795F03FF848707E9D9053C0FE7A70CE187AF03FDC63A5FD3F9053C0FE77820B9164F03F18E3C4F2E48F53C001D525F2E058F03F188537979D8F53C00096997EE248F03F4CD7972A3B8F53C0026579C61F32F03FFC41DFBAF88E53C0001054D88321F03FB4D9E5ACBD8E53C001C45BA94918F03F0482B56B318E53C0FF4E3185D40DF03F74B1C24FBB8D53C0027236BBAD07F03FE0B310D23D8D53C000C8E53836F9EF3F686A5BDBDD8C53C0FEBD09B326CEEF3F1057AAB7B78C53C0FE3111EF4180EF3FF4337A1D958C53C0FC2D26ECD140EF3FECE0124A5F8C53C0FC81F1A3EA0CEF3F10D40BAB6E8C53C0037E06A17ACDEE3F88ADF6CD9C8C53C0027C1B9E0A8EEE3F000443E4818C53C002D0E655235AEE3F84D7F0ED1D8C53C0FE4B3DA2393FEE3FC8E7DCCFBD8B53C0FEF956B07720EE3F34EBC1126D8B53C004801561F1FBED3FB0BE6F1C098B53C00264F23057D9ED3F009F24C5958A53C002120C3F95BAED3FECF8551E2A8A53C00088FA2648A9ED3F40D90AC7B68953C0FDADED1FA9B8ED3F40566CBA6D8953C0042E2F6F2FDDED3F8866589C0D8953C00478ADFC8D05EE3F38FDC7CDA58853C0029638918B1EEE3F88DD7C76328853C0028ED02C2828EE3FD0ED6858D28753C0029EA0F5EE14EE3FD46ACA4B898753C000CA105043DBED3F8C54A150578753C0008092C2E4B2ED3FACF432DE308753C002D0F5159A88ED3F9CA1CB0AFB8653C0028677883B60ED3FACEEF5C49E8653C0024CC9C3A324ED3F9C48271E338653C00068695531FEEC3F58AF5F16B88553C0001683636FDFEC3F0CC3303B078553C002F08F6A0ED0EC3F60A3E5E3938453C0029EA9784CB1EC3FB0839A8C208453C000E43C033B9AEC3F58C7A2EA828353C000925611797BEC3F34510B7D2A8353C0FD0FAD5D8F60EC3F8831C025B78253C004EC21C99147EC3FE8E13D95308253C0049A3BD7CF28EC3FDC0B38B5B18153C0FE43ED80AA13EC3FD03532D5328153C004608D1238EDEB3FD42FF5BBA08053C0FEAFF065EDC2EB3FE47C1F76448053C0FDFFEB543FA2EB3F106ADBBDC17F53C000407FDF2D8BEB3FCCD013B6467F53C0FD53B70C586EEB3F40D4F8F8F57E53C004A2B2FBA94DEB3FA0071575B87E53C001C6BAF19A1DEB3FB0543F2F5C7E53C0034EE10678EFEA3F780EDFFA167E53C0FD8D749166D8EA3FF4E18C04B37D53C0047AB9C52FACEA3FA878FC354B7D53C0FD5B2E313293EA3F48BC0494AD7C53C00438A39C347AEA3F00D0D5B8FC7B53C0FF1B18083761EA3FE4290712917B53C004EE240FD651EA3FA8903F0A167B53C0016C7B5BEC36EA3F0859004E5A7853C0FD3335FBB7F1E93FA0CC3FE5CF7753C0FD8330EA09D1E93F8426713E647753C004680DBA6FAEE93FC4365D20047753C003A838E0FAA0E93F14C4AAF55A7653C00470751ED3A4E93FC85A1A27F37553C0FD314AF847B2E93F487BF2EA327553C0FDE9B66D59C9E93F7868AE32B07453C0FD6BF8BCDFEDE93F040C2503397453C001122D05C721EA3FDC12EF88977353C001BE614DAE55EA3F6CB66559207353C0FF6596959589EA3F84D358DAB07253C001E0D7E41BAEEA3F00A706E44C7253C00132BED6DDCCEA3F5887BB8CD97153C0FC1F86A9B3E9EA3F041E2BBE717153C0FDD7F21EC500EB3FACE4D1281D7153C0FDCF8ABA610AEB3FD8D18D709A7053C0FF03E6172610EB3FA4088F2F0C7053C0FC1F86A9B3E9EA3F48CF359AB76F53C00132BED6DDCCEA3F581C60545B6F53C0030CCBDD7CBDEA3F9C2C4C36FB6E53C00132BED6DDCCEA3FBC493FB78B6E53C0023C113EB102EB3F54401D5B4A6E53C0FD29D910871FEB3FD013CB64E66D53C001B6EA28D430EB3F2071E1002A6D53C00450CC09E82EEB3F9C448F0AC66C53C00234A9D94D0CEB3F9CC1F0FD7C6C53C00356496BDBE5EA3F10C5D5402C6C53C001428E9FA4B9EA3FE84E3ED3D36B53C0FD53C6CCCE9CEA3F2C5F2AB5736B53C0FF2DD3D36D8DEA3F08E992471B6B53C00438A39C347AEA3FA8AF39B2C66A53C00326E8D0FD4DEA3F4CF97E29BB6A53C0011A95692A18EA3FA832D8BE0F6B53C003A2BB7E07EAE93F2CDC8BA82A6B53C0FFFB863620B6E93FA832D8BE0F6B53C0014CEA89D58BE93F689F4DD0266B53C004D4109FB25DE93FE8CB9FC68A6B53C0FF2DDC56CB29E93FCCAEAC45FA6B53C001C6D2346FE8E83FAC91B9C4696C53C0012A6EB54EA1E83F343B6DAE846C53C0FE5D4674065EE83F343B6DAE846C53C0FEC1E1F4E516E83FCC314B52436C53C0FCAD2629AFEAE73FFC1F9E5AED6B53C0FC014FD762D1E73FC086D652726B53C0FDC5C26364C1E73F84785B08466B53C000BA95A402BAE73F38E3A298036B53C0FDFB725153A6E73FE44DEA28C16A53C002CA91956A81E73F00779AF28F6A53C000484CEF0B5AE73FD495DE096B6A53C0FEEF383EE833E73FA8B42221466A53C0018EF8CD6206E73F501F6AB1036A53C0FE811C4853DBE63F44941DF4B46953C0FE2F365691BCE63F1428154E416953C0FE65E64380A1E63FFC6F092FEB6853C0FD7591FB958CE63FD45D7F4C866853C0FC853CB3AB77E63F505CBE36D06753C001D8C417124FE63FA0D7CE933C6753C0022020BD161FE63FE083ADEAE86653C0FD4FD0AA0504E63F388A0A05A46653C002A685CECDE2E53F58B3BACE726653C002DC35BCBCC7E53FFCF042FD286653C0031813690DB4E53F98010CCAD76553C002B05400D4A2E53F043119AE616553C0025E6E0E1284E53F205AC977306553C0FF9F4BBB6270E53FBC6A9244DF6453C00242380A3F4AE53FDC6274146E6453C0FCDBCADA5715E53FC07DA993106453C0FD518534F9EDE43FC01F1C38C96353C001422BB635DFE43FC01F8817C56353C0FEC9A77CC3DEE43F84D1C653C76353C0FE0D603C16CAE43F6487D052E36353C0FE9FB5734B8FE43F2871A31C3A6453C004B2DAEE4B81E43F184E5980886453C000E28CB14B88E43FE07B3EB1CB6453C0FFFF19F94A9DE43F841B1B7A3E6553C0FDE9B06BE3BEE43FFC0B2710A66553C0FDA9BA967CCBE43F78FC32A60D6653C0001682C549C0E43FA4398CBEEC6653C0FE3D0022CAB5E43FE0C7B158976753C0FDC7874ED9CDE43FF89FF1B4046853C002408DFB29BAE43F10EB57B16D6853C0FF35CCBB4AA4E43F2C11B14CF56853C000B81F82DAAAE43F581D5728746953C0FC45348849C7E43F84C8E2C4D86953C002D02EDBF8DAE43FBC3C559F7A6A53C00244EC4178ECE43FD8F72EF92D6B53C003C4987BE8E5E43F00E27AB67C6B53C0FDC7874ED9CDE43F08DFC773CB6B53C000BC28088B9BE43F10DC14311A6C53C002AE22351D5CE43F20EE2092FB6B53C0FE193CC2BF11E43FE8ECD457556B53C00002BA4201E6E33FACB7229E9D6A53C000866F0222D0E33F945209E22B6A53C005EE269633A2E33F94DFE241306A53C001E0AD9C2567E33FAC7B15C0646A53C00454FB8F472EE33FB4D1D55DA66A53C00438C1565ADDE23FCC6D08DCDA6A53C0FFA1DAE3FC92E23FE8ECD457556B53C00112701DF034E23F20D46DD2F26B53C0FFF960C4D104E23F3C8F472CA66C53C002EE017E83D2E13F64CF5387366D53C001F0637714B6E13F9443C661D86D53C003D8E1F7558AE13FBCDC459D5B6E53C003CCF5D7A753E13FE83605B8F46E53C00236F5B18A00E13F1440F850C26F53C0049211F26F67E03F3C8004AC527053C008D088186AA5DF3F9CDEC243437153C0F86B2D0D1566DE3FB85D8FBFBD7153C00554E2A618FDDD3FD869359B3C7253C00728FB0D9E5FDD3F1C57A183197353C006CCDBB34946DC3F3C1B018EBD7353C0FBCFE0DCEAAFDB3F04519990E67353C0FB3B952108DCDA3F144A2D619B7353C0050CD1C1FD37DA3F482875B03B7353C0FCAF42FAF5BCD93F1C4F5602057353C0066C99E66C2DD93F6405DEAD127353C00240CD3BE174D83F500C4ADD5D7353C00074AB833015D83F88082537D77353C00004B7E6F5E6D73F44C28DADCA7353C002A40D1F2FC9D73F4C4F670DCF7353C0FC8BC2B83260D73F4CF6F32CDC7353C00254C16CF8B9D63F4CA527AB107453C0033CE92C9C4CD63F640A4167827453C0F70BCE2DA29DD53F985C5923F47453C005D88D21470DD53FC80F8C1E807553C009BC28088B9BD43FE871F297407653C0FD8327BC50F5D33FF888F214987653C0036874895569D33F00814BB6707653C00740347DFAD8D23FE023D958267653C008285C3D9E6BD23FC8F2251CC67553C0FDF7187E002AD23FC0DB259F6E7553C0F8DF268BE4B3D13FCC9C657E847553C0FDC31AE50835D13FC8F2251CC67553C002AC03E58BDDD03FE03D8C182F7653C0089050B29051D03F0828D8D57D7653C0F7EF244BE8D9CF3F1C598B12DE7653C0FABF26B2F0E4CE3F2C1718AF427753C0FC67A6993AC4CD3F44627EABAB7753C00218749AC3BDCC3F74667D28037853C0FB9FCF694BDACB3F840A57055F7853C00888BB1C1134CB3FC859BC7E1F7953C00888BB1C1134CB3FF8093C37FA7953C0F6671FEA92FFCA3F2964FB51937A53C00638079EDB01CA3F4C8A54ED1A7B53C0FFE7EE512404C93F743D87E8A67B53C0189088EC2DECC73F90853AA25E7C53C0F13FD46DF8B9C63FCCD49F1B1F7D53C0F9070A3B80D6C53F48ECB93D6D7D53C0FFF7A975DAA9C53F101F6D567C7D53C0F8E79F2DA8EEC43FF039B9D7907D53C00830839E98F8C33FF825D985C77D53C0F04F65303739C33F9C7E088B197E53C001607F187C35C23F10FE18E2347E53C0F137C0E112FBC03F041A44B5127E53C00490B493AFEEBF3FD8402507DC7D53C00D302BF548DDBE3F9897117E4C7D53C0F2BF9F983E39BE3F34094A76D17C53C0054086A6249FBC3F1C310A1A647C53C00EE0FC07BE8DBB3FBCA24212E97B53C0FECF057BAE97BA3F342FC78B827B53C02020EACAF06AB93F680D0FDB227B53C01E80B0ACD17EB73FBCC8BF279A7A53C0F8CF94FC1352B63FA4F07FCB2C7A53C0185029CC0E00B63F60476C429D7953C01F50002D19A4B63FAC021D8F147953C0FFCF6B5D1EF6B63F14B761AC407853C0E0EF768EB292B53F9443E625DA7753C0EB0FA9A098F8B33F24C9FE6F287753C0E96F6F82790CB23F58A746BFC87653C02470C1C064C4B03FDC1FEBE6987653C00A2099E3F1C1AE3F64A0DA8F7D7653C0E09F68CD2C95A23F789123DF1D7653C0EA5FA3520305A03FE4DD3CD4F87553C0E91F23959A32A03F64F0D20EFE7553C04E0043173A9A823F84A273904D7653C0FE0524C8FD58523FF8740B76E67653C00DFF22AB76DB72BFC46FCA0F0E7853C0E60002744BEA85BFE4E36BB3377953C07C3FAA130FA995BFDC92B05DC47953C0D1FFAF854E3F9ABFD09AE0AD097A53C01E402CCD31499CBF10FB0909867A53C02EC094C906589FBFD85CE1CFE37A53C0CD7F6B01D4E6A1BF9499B7EF537B53C014009BEA9152A4BFCCFDF8F2F27B53C02BA0DE917930A7BF5CAAD3603E7C53C04580BCF5AB4AA9BF0C70677D0F7C53C02400AEA9C16EADBF0886C454D27B53C01330999FB86FB0BF049C212C957B53C0EE3F94FBBF98B5BF7CBB5CBF7E7B53C0E29FDE917930B7BF0886C454D27B53C006302FE0E14DB8BF004CDD1ECF7C53C0FC8F4FD74597B8BFD08083EEF97C53C0FFDF5E00C3EDB9BF8C00E8DC5F7D53C00290BFAECB95BBBFCCD78807A47D53C011A0AAD7FA10BDBF28046DD0297E53C0F16F1DD0834FBEBFACB66B3AA97E53C0203003A08C1CBEBFDC15EA7E487F53C013C0C407F243BDBFFC114277D17F53C0044077065CC3BDBF7CFEF348248053C0FF2F29CEA20EBFBF98D1D85C6A8053C006B03FB1BDB2C0BF08B1F2B2A38053C00C0072141698C1BFE82CAF99928153C008087FAC91B1C1BF2845F805BE8253C0FA2FCB13CBD7C1BFB411115CF78253C0F99FF7F7935DC2BF74F49B96738353C00380D6DAC662C3BFE4708FA0968353C0F20F288A6CB4C4BFF84374B4DC8353C00CD0FF53B3FFC5BFFCEFA6604F8453C0F087581C450BC7BF94126492FE8453C0112818B32AA4C7BF0068BB3FC78553C0FFC750CC351DC8BF78D72CD9498653C00B583D7E0770C8BF5CDDAB68A98653C0F43F43FD96CFC8BFA036AB1DE98653C00858641A64CAC7BF80D90361328753C0F23FFF1C90CBC6BFA8D55B59BB8753C0EECF469F96ECC5BF24A8F33E548853C0EFAFE720524DC5BFC847F1A8D38853C0F057818921F4C4BF5C77304B238953C0107807A4C2EDC4BF94F0C87B7C8953C010E833888B73C5BF60B3BA3ADF8953C008D80CEC2E19C6BF894CECE6518A53C0F087581C450BC7BFC48BD1AFD78A53C0112818B32AA4C7BF2C981CFD438B53C0F4071E32BA03C8BFDC0AE96F908B53C0FBFFE9FDE18FC8BFF0DDCD83D68B53C0FA77AF135788C9BF9C509AF6228C53C00718C70F9506CBBF28BA8C00468C53C0F85FBFBF8518CCBFE8608D4B068C53C0F0675E70C1EACCBF1801C2D8B98B53C0F9D75D399EB6CDBF1801C2D8B98B53C0F35FE99BABDBCEBFB430017B098C53C0FE2BC765BB06D0BF64DF31160F8C53C0FE03B8E8B0D7D0BF08A5C532E08B53C0FE6B806BB715D2BF108B50B3FA8B53C0FDDF52039DAED2BFD0E19B52508C53C0F7BB57D71531D3BF5CD0FEE4888C53C001486598AD51D4BFA029FE99C88C53C0FA1B288A6CB4D4BF4C9CCA0C158D53C0FC3F8708B153D5BF2479D6B7318D53C00244606C54F9D5BFAC2BD521B18D53C0F887F5F5F8F4D6BF60911F245D8E53C0FFDF07C0D5C0D7BF585069DB488F53C0FAA3967DBCAFD8BF88C9010CA28F53C0FCDB723C391FD9BF303CCE7EEE8F53C006487F87868BD9BFACC559042B9053C0FFAB71B8E73DDABF68B566AF479053C0FE67544322BADABF0419DA290B9053C0FB47F79B6503DBBFD03C1BAD9B8F53C0FACF4674836CDBBFA4C3827C428F53C000605C993902DCBF2C9D1D431C8F53C0F9C34ECA9AB4DCBFE02904A2228F53C0F84B9EA2B81DDDBFEC99C269528F53C0040CE4533FB0DDBF6479DCBF8B8F53C001F8E9D2CE0FDEBFECAB333DCF8F53C000CCF2693963DEBF9C0FE3F60A9053C0FC47EE38C4C6DEBF8007FE9E559053C0F9F3A9FEFC6FDFBFC46E613BAA9053C003506C60061EE0BF9006810CD29053C0005002266639E0BF4423BFAE219153C0FEFDFB9A7F90E0BF2C973818C89053C0FFFB27263FC7E0BF2CC3C3D7FE9053C002AC8BD5F802E1BF082EDB566C9153C0FDB967DE234BE1BFD0F185E7CA9153C00168F7189DBDE1BFA0B53078299253C0FCEDA2659332E2BFE801AEBCC89253C001FC7E6EBE7AE2BF605593C6999353C0FD4F964FC6E0E2BF0C8455D6659453C004322430CE46E3BF4CD090FEB29453C00496107349A5E3BFA0247261C79453C0041E3ACF9B54E4BFBC5C8915359553C0043896E92AECE4BF54EFEE039B9553C0FC012E09FC13E5BFEC5AB895A69653C0FC97072F482AE5BF88C68127B29753C0FF11C90E2C42E5BF98E2729B549853C0FE811ABBCD66E5BF74088BA6CD9853C00424C73AA886E5BFA48123D7269953C0016E906D9FB9E5BF7CA73BE29F9953C0035433C6E202E6BFB89D144BC99953C00360DF8314B2E6BF78E3C5D15B9A53C00126147D99C3E6BF705821B2769A53C0FC4B0B0D18C0E6BF705821B2769A53C0FDF969E09DD5E6BFECFBD9BD6C9A53C00140D1433A2AE7BF24382F2D0E9A53C0FD8D2FE59F40E7BF5C74849CAF9953C001687782DC79E7BFE078B5114C9953C003E446C6A7A6E7BF64A971461F9953C00024217561E2E7BF140D21005B9953C004926CC68034E8BF9008F08ABE9953C0FC67B463BD6DE8BF0C65377FC89953C0FF4BAC7E65B8E8BFD8D0CB90B99953C0FCEF8B3B7319E9BF48A18CEE699953C0FF0718C20973E9BF7450DE342E9953C000FA93CF5D98E9BFF8809A69019953C0FF59C56871F4E9BF10E19540249953C0000CBFDD8A4BEABFA06709EB6C9953C0FED54F4BE868EABF90EAC8B29C9953C0FD513CFDB9BBEABF3C1489C58C9953C0003E4F893FF8EABF5C713082439953C0039488EF781EEBBF9404E39E569953C000225508CF57EBBF800A622EB69953C0FF3753344B9CEBBFF4DCF9134F9A53C0016669A62FDFEBBF842B1960BC9A53C001ACC9575829ECBF98B79FF6159B53C003AAF5E21760ECBFB4179BCD389B53C0FF6909103DADECBF04B4EB13FD9A53C0FE67CB605CFFECBFD0F3F465B79A53C0FF097F92AA29EDBFECFBD9BD6C9A53C0FDD3AC77DB6CEDBF3CC4B5C3679A53C001EE38FE71C6EDBF3CC4B5C3679A53C001764E850820EEBF3C982A04319A53C0035A46A0B06AEEBF40401485C39953C0023024034DBFEEBF40401485C39953C001C4E9074F2AEFBFF0A3C33EFF9953C0FE67C9C45C8BEFBF2464BAEC449A53C0FC59DB9710CCEFBF98ABADB5469A53C0FD732E23F7CEEFBFD0DF9B71BD9953C001F44ADFBFE7EFBF08D397A8F59853C0FE0913DD18FAEFBF
4	Costa Sur	operational_zone	1	Z3	t	2026-07-24 10:51:50	2026-07-24 10:51:50	0106000020E6100000040000000103000000010000004A0100009093DBEC8BDD53C07F876D1625C00AC080F4F52BA6DD53C0014B735604D60AC088285CABB7DD53C0006F66C66BE60AC088285CABB7DD53C001957861E7F10AC08081CF8BAADD53C0FF7808DB36010BC0905CC22AC9DD53C07FE0EB1A16170BC070DDF5AE4EDD53C080A80B0EB5350BC040DCA974A8DC53C0004F331998510BC0444729B67CDC53C00037DD45A7690BC01CD0039929DC53C081FC6F5FE6830BC0F4A9AAFDA1DB53C08161C6C565950BC0FC6D9D1F69DB53C081C8A90545AB0BC0EC75447E90DB53C001CE316750BD0BC00C68379A06DC53C000D3B9C85BCF0BC0442D76F673DC53C001D42777A7D80BC0786ACF0E53DD53C07FFDA2481AFB0BC09820B54C90DD53C07FA0611D06000CC0B8460EE817DE53C080438EA03D0E0CC0D0049B847CDE53C080688110A51E0CC0E0DF8D239BDE53C0FF2A19A2382B0CC0D8AB27A489DE53C000CDD77624300CC0C4435BA566DE53C001AC4D3DB4360CC0B868680648DE53C0FF1036F5E73E0CC0B868680648DE53C0FF926A90634A0CC0CC26F5A2ACDE53C001F9DF21F7560CC0E01B9B01D4DE53C0815D368876680CC0DC8EC1A1CFDE53C08020CE190A750CC0E052B4C396DE53C07F642C98CD830CC0CCEAE7C473DE53C0FFE3D359E98A0CC0A81A4FC72DDE53C0FF4949EB7C970CC0A81A4FC72DDE53C0016CAF8184A30CC0B04EB5463FDE53C000903443A0AA0CC08CF59FF87BDE53C081EE7B1D36B60CC0A4CDDF54E9DE53C0FF4CFACE71C60CC024415BDB4FDF53C00188FEE567D20CC0C4998AE0A1DF53C0FF2ED76D13E00CC038199B37BDDF53C08020E2D729F10CC0C4998AE0A1DF53C0005A4718B0FF0CC0045CA75C64DF53C0805D42A05B0D0DC098E1BFA6B2DE53C081EF2F82C6100DC06024CCCB59DE53C08101BF76CB0A0DC06829F56CC3DD53C08134CD7D6AFB0CC05051B51056DD53C081C45EAE99EE0CC0307975B4E8DC53C07F65E0FC5DDE0CC0309AC92830DC53C000E1E7B0DCC90CC0B0264EA2C9DB53C0008108D610B70CC0ECE86A1E8CDB53C001228A24D5A60CC0B833C2C447DB53C0808F9C426AA30CC014DB92BFF5DA53C0808F9C426AA30CC034C0463EE1DA53C081EB80958AA80CC0748263BAA3DA53C000C90183F0B10CC08C6717398FDA53C0805F89C376C00CC0CC317F3666DA53C0009CE98BA8DC0CC05CAA235E36DA53C081796A790EE60CC0BC5E687B62D953C0014361EAC3E70CC0A886281FF5D853C0FFE6DDC033E50CC07CB554F2D2D853C0800C585B79E90CC09C9A0871BED853C080455C726FF50CC0B87FBCEFA9D853C000C7593645FC0CC070CE5DE505D853C07FB9C5C9EB0F0DC0C49159B391D753C000CDB06F2C1A0DC0B89DEE8346D753C0002D2F21682A0DC0D882A20232D753C08155056DE93E0DC0ACB1CED50FD753C07FEA8CAD6F4D0DC0ACB9195724D753C080A6EFB1CB620DC0B8A539055BD753C00076DC32D87F0DC058F61D8998D753C0FF89C7D8188A0DC058E9A9661AD853C0015658A8E9960DC0B87FBCEFA9D853C0FFFC303095A40DC03CEBECF4FBD853C081F6D15073AF0DC054C32C5169D953C08099FED3AABD0DC0785CAC8CECD953C07F5C96653ECA0DC090DE2B4B18DA53C0008435DA19DA0DC088379F2B0BDA53C000E98B4099EB0DC0886EB8EDCDD953C001CD1BBAE8FA0DC058F792D07AD953C08151DD2EC40A0EC0546D6CB327D953C08074B17317200EC05CBB85F241D953C000DB94B3F6350EC0705F5FCF9DD953C000E11C1502480EC0801DEC6B02DA53C0014159C8C1500EC0C0C5C4C5B5DA53C00046737B81590EC0E4EB1D613DDB53C00068D91189650EC0F48FF73D99DB53C0FFEDB9B178700EC024EAB65832DC53C0803118303C7F0EC0505E2933D4DC53C08090E634B07E0EC078C08FAC94DD53C0810F2048807C0EC0A88D756729DE53C0802D1DA890710EC0ECBF74DE2FDF53C081864420E5630EC030F2735536E053C00082BCBED9510EC080753F4E08E153C001240DE5794D0EC0A081E52987E153C0004505CD35500EC0C073D845FDE153C001C5AC8E51570EC0E49931E184E253C001C8A716FD640EC00C67179C19E353C0FFA83C08A1660EC04C821696C8E353C001C8A716FD640EC078DCD5B061E453C0FF68F83C9D600EC0880D89EDC1E453C0FF04108569580EC090F022EB07E553C0014159C8C1500EC0C081FBC763E553C000605628D2450EC0BC4AE205A1E553C0807E5388E23A0EC0D42222620EE653C0815841ED662F0EC00441D49E6EE653C07F97363533270EC0FCD5545D9AE653C07F356DA8131A0EC00C69012BDEE653C07F4878A020050EC0EC7E240B89E753C0FF126F11D6060EC03028389418E853C0015D6346610F0EC0D08067996AE853C081A8577BEC170EC0340F2FA1E5E853C00086D86852210EC00031E75145E953C0FF635956B82A0EC0F82BBEB0DBE953C080F64638232E0EC06CA6A5668DEA53C001E5561A8E310EC044B47DC523EB53C001304B4F193A0EC07C7171A07CEB53C0004436F559440EC01CCAA0A5CEEB53C000FF98F9B5590EC0BC22D0AA20EC53C00002948161670EC014BD2C8350EC53C0012B09A452790EC0B4155C88A2EC53C081F7FA9CB3880EC03C818C8DF4EC53C08167696C84950EC0FCBE6F1132ED53C07FD77612C59F0EC0009E1B9DEAED53C001345B65E5A40EC0A4D5F62DF5EE53C07F226B4750A80EC084EB190EA0EF53C08059D5FF2AA90EC0A8AF791844F053C00048E5E195AC0EC0E074B874B1F053C07F92D91621B50EC040FB34FB17F153C080DECD4BACBD0EC078C0735785F153C080DECD4BACBD0EC040E1F0D808F253C000A2EC071EBE0EC04CDB8A53A6F253C000A2EC071EBE0EC091BA7C6F1CF353C00020261BEEBB0EC0A41F962B8EF353C00101BB0C92BD0EC0B4C36F08EAF353C0010448E6F1C10EC0E09055C37EF453C000C157167ABC0EC008B7AE5E06F553C0FF40B0545EB50EC0208FEEBA73F553C000BE5C8ECEAE0EC030A6EE37CBF553C0819AD7CCB2A70EC05CAAEDB422F653C001F93723DB9D0EC0740F077194F653C000944F6BA7950EC09C716DEA54F753C07F75E45C4B970EC0DC6A12C6D3F753C001777136AB9B0EC0F0B578C23CF853C0FF5A9301AFA10EC01869ABBDC8F853C0005C01B0FAAA0EC03C022BF94BF953C0009C64A612AC0EC05C9BAA34CFF953C000B942DB0EA60EC07C1A77B049FA53C0FFB9610623A10EC0B83576AAF8FA53C0809BF6F7C6A20EC0C8BCE9849AFB53C000BBCFB46EAA0EC0F816A99F33FC53C07FFC32AB86AB0EC014EFE8FBA0FC53C0003A09C83EA80EC0449A749805FD53C0005C01B0FAAA0EC06419411480FD53C00020B86CA2B20EC0840B3430F6FD53C00180F41F62BB0EC08C7BA78D40FE53C0016316EB65C10EC0A81427C9C3FE53C08003B6943DCB0EC0E04C8CC52CFF53C001699E4C71D30EC0E82F26C372FF53C0808A04E378DF0EC0F02C7380C1FF53C0816C078368EA0EC01C3172FD180054C0800EC65754EF0EC03CB03E79930054C08013E00A14F80EC04C541856EF0054C07F5224D617FE0EC090F93D6DF10154C000D5779CA7040FC0D02EF026A90254C08078367193090FC0F4FBD5E13D0354C0815A391183140FC02CE36E5CDB0354C001BC94EF56180FC04845D5D59B0454C0FF9C29E1FA190FC088EDAD2F4F0554C0001A44C9B61C0FC0C8958689020654C0FF3B3CB1721F0FC0E8A12C65810654C0015BA7BFCE1D0FC0FC796CC1EE0654C0007A12CE2A1C0FC02413ECFC710754C0FF3B3CB1721F0FC048E0D1B7060854C0FF1E5E7C76250FC068C3A96D7C0854C07F3266A49D280FC084B4A993830854C080099B57D4270FC054C7ED4B060954C08044ACA4C61C0FC034AAFACA750954C000B24C01AF120FC040FD619EAB0954C081883F2FB5050FC09CB31C27B70954C001F8F96436F90EC0006AD7AFC20954C0FF03B05464E80EC050CD2A65980954C07F3FC1A156DD0EC0AC83E5EDA30954C07FE00AE7CDD10EC030B037E4070A54C000BB31C705C00EC0A8892207360A54C0802C06D61FB10EC01410A6562E0A54C0FFA00E976B9D0EC05CA33045170A54C0807C4F503C890EC078C660DF390A54C0805790090D750EC01CE6AB36AD0A54C0000142B3E75F0EC0044C57C2650B54C0FF3D6DD972520EC06085B057BA0B54C08012462EE0470EC034155603F40B54C0804D577BD23C0EC0E4B1024E1E0C54C0FF8DB6538F2A0EC0782B7FFE250C54C00066C35A2E1B0EC0A476D1E9E30B54C080C14A4A65060EC0F047DCC97D0B54C081476C7862FD0DC01CD20FB7410B54C000DCD0025AE20DC0044C57C2650B54C0FF29C4E6D3CE0DC0C87EC7DAB30B54C0FF73F6AB4FC10DC090B137F3010C54C081A111CC89AE0DC054E4A70B500C54C00169E38106A40DC0301B931C860C54C07F95FEA140910DC05CA5C6094A0C54C080E4F185BA7D0DC0B8FC89DEBF0B54C0816FD4D2B56E0DC0E04361D1950B54C0FF80D84DAE560DC0E8C59ECD890B54C080B2B48CE63D0DC0B4B92DE4D10B54C00167F1DA1D220DC090B137F3010C54C0FF4E9B54DA160DC054E4A70B500C54C0FF3A06ED94050DC04C626A0F5C0C54C07F44882A91F90CC05C14DABC200C54C0FFB3485898D00CC00C9A4937750C54C0FF7E4FE0E6CB0CC0A4C048660B0D54C000C95E9257C10CC038E74795A10D54C000F779B291AE0CC09CD937F8AA0D54C080A19DFCED950CC038CE5803020D54C001B4C48AF17A0CC02812A914D30C54C080B0D5DE356F0CC0448A08F2300D54C0FF8C03F5874F0CC0282B98A6720D54C001BB1E15C23C0CC0D0F45732980D54C0009B3BD7CF280CC0AC95E7E6D90D54C0FFAF51118F190CC070D706505D0E54C0817869ED21090CC0301926B9E00E54C07F8D7F27E1F90BC010BAB56D220F54C080D78ED951EF0BC0584D35856D0F54C00186A1CF69E20BC0846855BF5A0F54C001CDC1D51ECC0BC0940B161CEA0E54C00012E2DBD3B50BC010A1C6DB820E54C07FA50040B5A00BC0BC904EAB7B0C54C080ABD53430920BC0E48B02AFBB0954C0008E0D4BB0810BC034C917B12F0854C00071456130710BC0BC2FEC5ED60554C0815E157030660BC05C411CB7B70354C001414D86B0550BC0A87E31B92B0254C0011BEDA3B03F0BC04813110FC50154C0811C723906100BC028BD59BA4F0154C000288FC7DBE50AC0E010EB10650054C0009FB99986C80AC0F8CF9C11E1FF53C0FF1F7C64B1B00AC088B920BD3FFF53C0807ADE4CDC820AC0A078D2BDBBFE53C0005F9BF8B1420AC0A078D2BDBBFE53C0011C732C321C0AC054B80DBE8FFE53C0807F6D0DDDF309C054B80DBE8FFE53C07F32AD48DDC709C0B087EDDA55FE53C081E557E6E0AD09C08827104AFAFD53C08054B33BAC9F09C0C8A62F3F9FFD53C0FF08BB0C729609C0CCB9468ED0FC53C0FFCCA57A379109C0BCA3AD1333FC53C0FF327620E98C09C0F4C43FAD90FB53C0003A2CFE868909C04040500AFDFA53C000EF33CF4C8009C07092B09D9AFA53C00068260ED87109C0843014AA1AFA53C081C808F1015809C0B401D749EAF953C0018CCECE5D2309C0FCD2E12984F953C0FF26B59651FC08C01C1AB91C5AF953C08038B9114AE408C01C1AB91C5AF953C07F66D43184D108C0301E341542F953C000B98834FCB708C0742E20F7E1F853C0812754DCB5A308C0E0C83FC645F853C00031D619B29708C058635F95A9F753C0FFDB902AED8708C0A8B6A77137F753C0010AAC4A277508C04CC0116F11F753C000B6080ABE6208C058AE4F7DA3F653C081A4DCF49C6508C0E0BD43E73BF653C0FF85618AE96B08C08438F61CF3F553C00017282E697608C0B0C29CBC42F553C07FAA7F96027C08C01C67D25ABCF453C0FFA2D41E297808C0A8BAD82B41F453C08119B9F2827108C0902E5295E7F353C08027AEC5CF7008C044ED16328BF353C0806F91970F7608C0CCFC0A9C23F353C0812837B4757E08C05C2F49A26DF253C080419095F58108C0CCD37E40E7F153C081FDC676758508C0B447F8A98DF153C07FED40DF0E8B08C0C8CBBAAFE5F053C0800FD6FC818D08C02007EEB3A9F053C000F8082E1E9108C014A4B9189AF053C001C1D0A10E9208C04476D4E756F053C0FFD04E63019F08C09C1426ECD8EF53C081D2D751A7AC08C0E02A532282EF53C081A01DB933B808C05CD56C5AF3EE53C07FD87AF30CC308C079592F604BEE53C001DA03E2B2D008C0847817347CED53C001A19ED165D808C028CE9FD677EC53C081E6F0DE8BE208C00C5F7F42D8EB53C080F8FF6498EA08C004F6424830EB53C080077E268BF708C0D0FEFDE5B7EA53C081E671F7BD0209C08CE00C1F0DEA53C000EB8BAA7D0B09C004C9542473E953C0014BC85D3D1409C074B19C29D9E853C0FF5CD7E3491C09C094149764F6E753C0804C514CE32109C0B43963D21EE753C0FF2ED6E12F2809C040AACFA55DE653C0803E54A3223509C06C171043F3E553C001CF1A47A23F09C0C054E9DDCEE553C0813602723B4C09C0D4E61484D5E553C000E8BC12BD6209C0DCE3614124E653C080EB2549B47909C0F44B2E4047E653C081D1429C638D09C0E4703BA128E653C07F3926DC42A309C0FC0C6E1F5DE653C000807FE2B1BF09C018C8477910E753C001C66A3AD5D209C048220794A9E753C081A9FAB324E209C078B3DF7005E853C08110DEF303F809C078CD92300EE853C0FF950D172B110AC06CBB86CF2CE853C0FF5E4C35DE2A0AC09832ACEC7FE853C08041BD83193F0AC0B07D12E9E8E853C07F48D2BE84550AC0CC6F05055FE953C0802C6238D4640AC0EC3F9E02A5E953C0803477733F7B0AC0D8BA6B01C8E953C001764818A3850AC0D8BA6B01C8E953C001FA098D7E950AC0D4BD1E4479E953C000DFB831E29F0AC0A4635F29E0E853C07F9C3610B6A30AC0802353CE4FE853C0819D553BCA9E0AC0684B1372E2E753C0FFBDC049269D0AC0304AC7373CE753C07FBE2EF871A60AC0000ABBDCABE653C07F1DFDFCE5A50AC0DC3CD52117E653C000DFB831E29F0AC0B4C0BBE84DE553C000FE23403E9E0AC088F3D52DB9E453C0FFDA9E7E22970AC0687409B23EE453C000F99BDE328C0AC01864645968E353C0FF98CDD9BE8C0AC0CC8AD8C254E253C001DA30D0D68D0AC09467326A7EE153C0FF3672FBEA880AC0709A4CAFE9E053C000F4812B73830AC0501B80336FE053C001F70E05D3870AC00CCC1ABAAEDF53C0FF1994C6EE8E0AC0D4740EE2C6DE53C0FF9A5AB31E910AC0B04EB5463FDE53C0FF9A5AB31E910AC0905CC22AC9DD53C000FC9666DE990AC0682367F98BDD53C001C61CDB9DAB0AC0C8123BA781DD53C0FF743B95E5B30AC09006028D87DD53C07FC129801DB40AC09093DBEC8BDD53C07F876D1625C00AC00103000000010000002000000018A8C707DD0E54C0FF275E058C190BC090143C2A5B0E54C0800A4368033A0BC04C7B7422E00D54C080ECACBF7F540BC058DC70F06B0D54C0803A9D9A4B670BC070ED246F570D54C081630B9FA77C0BC0F04758A61D0E54C000AD8A57827D0BC0BCD5A759A60E54C00084975E216E0BC06019EBE7870F54C0803A9D9A4B670BC0F8FB31A8DD1054C080CE1617FC6E0BC030AB5CEC701254C080F313F966720BC0149AA86D851254C07F81A1472B620BC0E42DC3EC541254C0007319C180550BC0C0C788BF4E1254C07FA1B2FBA94D0BC0B0EF2CE71E1254C0007ABF02493E0BC0F488F4EE991254C07F9CC6CDBD350BC0B0DDEBFB661354C0FF4ED6F2F1220BC088F4DBA44B1354C001B8665F4B0F0BC054337075001354C07F44FE9619F30AC0C03EE8C9F21254C081658A5693E40AC0C49FE4977E1254C000611934A2D20AC05CA6AD2E441154C08082A5F31BC40AC0647E0907741154C080AE090F6EE50AC0D089815B661154C07F44FE9619F30AC0D0122251C21054C080D581FCD3EE0AC0784002A38B1054C0FFF60DBC4DE00AC0DC731E1F4E1054C001A0C090A4A30AC07452438E430F54C000C4426714A10AC0E05DBBE2350F54C081EDB06B70B60AC0A43B53E55E0F54C080CE1AC3ECD00AC038B97B86C80E54C080D581FCD3EE0AC0AC9C4FB3EA0E54C080B4F53C5AFD0AC018A8C707DD0E54C0FF275E058C190BC001030000000100000034000000A0D97AD9750154C001D110DAE2DC0AC0286D06B7F70154C0816A76847FFC0AC028E465C19B0254C0FF02612321160BC088054152A60354C0809B4BC2C22F0BC0C03D0C8C950454C07FC33EBB233F0BC0300F9FCDFF0554C000A137F0AE470BC08CCF7D907E0754C000EB31B4844E0BC0BC2FEDF13D0854C0FF0C397FF9450BC0A46DF455260954C00035B16C5F4F0BC07C72A313530A54C000A6231E9B5F0BC020B6E6A1340B54C07FED27CB7A5A0BC0ECE23987310C54C07FC82AE90F570BC070395E26BF0C54C0007D344F714B0BC070395E26BF0C54C0802DC968AA320BC0DCFF1ACEC60C54C0FFEEBDBF79210BC0E88A678B150D54C080413AA63A070BC0FC7FDAE85F0D54C00102B25C73F20AC06C7C80C4DE0D54C08124BBBC83E70AC010B79980500E54C0006F029074CF0AC0CCA4D95F660E54C0FF900BF084C40AC068125A24E30D54C000E8772E69BD0AC058DC70F06B0D54C0003730244BB70AC0EC599991D50C54C0003730244BB70AC06C9E698C830C54C000CBA9A0FBBE0AC034DDFD5C380C54C000CBA9A0FBBE0AC0E86BDA7C8D0B54C000CBA9A0FBBE0AC034EF3E48F00A54C000CBA9A0FBBE0AC07CFB4309AF0954C001A5ACBE90BB0AC06CAC8826DB0854C001A5ACBE90BB0AC068BEC911930754C08132BF015AA50AC08480C2ADAA0654C0FF09CC08F9950AC0D00327790D0654C00075D7804D880AC098CB5B3F1E0554C0FFDD67EDA6740AC0CC156864C50454C07F907712DB610AC0AC8D54DB350454C081CF1E6FDD320AC0802DE579760354C07FC73C2AFB0E0AC094663D20320354C0012DD77F5EEF09C080B6856FD20254C08025F53A7CCB09C01434AE103C0254C0808C8F90DFAB09C028F6A6AC530154C07FFA0B2B25B009C0F0343B7D080154C00093F6C9C6C909C0C84B2B26ED0054C0012A665D6DDD09C0948ABFF6A10054C081BFD5F013F109C010CF8FF14F0054C001343EB9450D0AC0DC0D24C2040054C081142D05C7210AC0F0467C68C0FF53C0013D20FE27310AC02491888D67FF53C080AF0DBB5E470AC09C745CBA89FF53C080DB71D6B0680AC0D435C8E9D4FF53C081065BE607840AC080DA0746420054C0017BC3AE39A00AC0546857F9CA0054C000132959D6BF0AC0A0D97AD9750154C001D110DAE2DC0AC00103000000010000001B01000070C61251F22554C081C1410C0ACF03C0C051DE43732754C0807694574FA903C0F45CEA1B5B2854C000CF4551E08C03C010FECF53472954C0010D23FE307903C0B4C335CD072A54C0005135BE516303C014EC8E688F2A54C08187DD57D25103C060AAC1631B2B54C080EBB3BC564603C0EC9BDA9CE42B54C080FF52F6C63F03C0FCB17317822C54C0018A22137F3C03C0C42A00B4E62C54C0005DF4477B3603C0D861BF4BD72D54C0813D30A3172C03C06853D884A02E54C080D469E66F2403C024ED8A3E582F54C0FFE2D30C102003C0B0FFC994743054C081E90820E01D03C0847B6AAC683154C080F4F396FE1B03C0C8B8AF0EE13154C000307801B21503C014AE96D66F3254C07FCC67A8580E03C0547D739FE23254C080AA80D6180903C0A84E2B9A7C3354C0FFC45423590003C00C0F39C72F3454C001FF6A2573F402C0505F0329B63454C0FF7773FAD9E702C0B01F1156693554C0002CC98527D202C0D47EAA53AF3554C00067163C0EC902C000DE4351F53554C080C2DC5B9BBF02C0380804B45F3654C000BBC9D69BB102C0647A22B1B33654C080B624BA35A902C08C10707BFC3654C001329BF735A202C0C871E4AA693754C080EE0308839A02C0FC2D3C74CE3754C0010D46BD5C9702C0485AD708603854C001ADDA80699802C08C29B4D1D23854C000316443699F02C094B842882B3954C0FFA86F58D8A202C0C48102266D3954C08047DEAE009902C06C0093789E3954C08046C0ADFE8902C01412A72FC93954C080DFDDFD837E02C034956FFA033A54C000785F3C917102C0700969297F3A54C000EB8B40C55902C0A0B23BF3D53A54C07FC091E9854602C0EC263522513B54C0FFF3CB1A6D2F02C060E91D812B3C54C07FA47C89541102C0B8CD5A7BD33C54C080D9ED6E08FD01C0E0D5BDBE033E54C0013F2D30DED701C068EECAAA6B3E54C0FF40AAA7DCC801C02CEA4B8CDC3E54C08023407514BA01C09C56D9186A3F54C0008E399B31AC01C008FCB5DAF53F54C000EB6B10849C01C05C314FD1544054C0FFD9C88E868F01C0A0BD55C7884054C0802FA2BBA78301C034F76DDC764054C07FF7BE47B27A01C0584F6D9B2B4054C001133889DF7401C0CC547E799A3F54C0813CE6E3707601C0103BDFCD523F54C080D17E55BA7E01C058060FB7E33E54C0FF91338A2E8E01C0E099812A563E54C000B6F604289901C074F4A468CA3D54C080141A6B159E01C068A56CC6233D54C0802BA8CCAAA101C01470D3CFC43C54C08139DDE50EA901C038040F23273C54C0006A6711D3B501C0446655B6F03B54C08035E1E33DBB01C0E0A547893D3B54C00019D6E230C101C08853A2F58F3A54C00059C8B57DC001C0304B362EF33954C0FFB4C589D7B901C0F068D465723954C0810F8CA964B001C0B43E1403083954C000CCF4B9B1A801C0706F373A953854C000A7D633A5A001C0F04F900F9C3754C081FDF736CC8E01C0A8367A7A183754C07F796E74CC8701C050F759E6783654C080155E1B738001C014F1C850033654C080909DA4A67601C0D00E6788823554C081A7CCD4806501C09C9C488B2E3554C000FF248C745601C068A93CF5C63454C080F71107754801C00C336894243454C00035CD25F54401C0ACCD3D01693354C000B24363F53D01C0600F0B06DD3254C000EB59650F3201C0302F846F833254C000A68BC18F2701C0D0DCDEDBD53154C000DE6A0FDD1801C07C798F7A413154C081D420D6100801C0488683E4D93054C080290B256BF300C00CEE5AE8693054C00060B3BEEBE100C0D0C39A85FF2F54C0809524A49FCD00C0AC9BB554BC2F54C080497A2FEDB700C0A4E313EFA52F54C0004267AAEDA900C08CAA84F07B2F54C0FFF11719D58B00C06C27BC25412F54C08028C0B2557A00C0684BEBF2352F54C0003EEFE22F6900C0646F1AC02A2F54C081551E130A5800C068DD8259302F54C0FFAB3F16314600C0804DC6245D2F54C001241137CB3600C0A475AB55A02F54C0807DA0A28B2A00C0D0B01586F12F54C07F950687321C00C0F0D8FAB6343054C07F2D88C53F0F00C00CEE5AE8693054C080871731000300C0204B19B4883054C0FFC284ED4DF0FFBF30A8D77FA73054C002B8CC4BE8D9FFBF3C29C518BB3054C00167B46E9CBEFFBF30A8D77FA73054C0009849831D9FFFBF08A4211C593054C0FF0BAD3B1E8AFFBFB440D2BAC42F54C0FF411E21D275FFBF8497FFF06D2F54C0FF77C6BA5264FFBF58B7785A142F54C001A65BCFD344FFBF2069892AB52E54C001171A6B6E27FFBF041D752C7D2E54C0FF3B2E9256F4FEBFFC09F02C6F2E54C002DCB8F63EBAFEBF14437F2B992E54C0FFC82484A698FEBF48C82228FB2E54C0FFF54B308E73FEBFA43DBE3F352F54C00172556DA803FEBF38ED8A3E582F54C001ED0FC749DCFDBF24A48ABBAF2F54C0FF4116246497FDBFFC863DF80F3054C0021DB78A6651FDBF7083E3D38E3054C0FE7AF2FA500AFDBF6CA409F1E13054C000F201B87BBAFCBFE47F89AF0D3154C00291C5712D88FCBF4487BC2D423154C001D961A8A747FCBFA48EEFAB763154C000D7B60B311FFCBFE4C1D5E9B33154C001DD40828AF4FBBFA43A6286183254C0FEE7FF0BB4C7FBBFA4BAB8015B3354C0FE8D4B9BC265FBBFBCD084DDC93354C0FE04573A1722FBBF4C189592D93354C000FD355AD71AFBBF3C894E1D2B3354C0FF28D332C905FBBF600010C69B3254C0FF9995FC6EFBFABFC07A2C48D63154C0FE3143660BF9FABFB47855C0ED3054C0FFF13063F3E1FABF50E94AAB513054C0FEFAA09635D5FABF78C332A0D82F54C0FE944E00D2D2FABF40E77323692F54C0FE4F2FF0C3DEFABFB41A5BCD2F2F54C0017DB67FACF2FABFD8DA28D6FC2E54C0FF9995FC6EFBFABF08325103542E54C000683A293600FBBF1CC9AB27DE2D54C0009D4D1610F5FABFCCFFEDAA6E2D54C0025F3B13F8DDFABFCCB6E14A122D54C0FE35507301D6FABF8D847EF22C2C54C000786F830FCAFABF80E5CDB65A2B54C001CEFDDC9DD3FABF506C3586012B54C0005A83F956E4FABF74461D7B882A54C0024D77D622E5FABF00748595EF2954C0022DFC696ED0FABFF81DE1B9792954C001AE8270E9BEFABFA861BBB8232954C00131097764ADFABF10CF55CABD2854C0FFFA11B439A6FABF70AC98980E2854C0FE34C19005A7FABF9C235A417F2754C0FFB33A8A8AB8FABF28170FF4122754C001D76D10E0C6FABF98E7CF51C32654C000D4B5F63ECDFABF6888510D242654C0FF62F32C99D7FABF9CC55F4EC12554C00120D41C8BE3FABF8082D27DC42554C001A7A11FA3FAFABF184FEBD3FD2554C0FE7AA972B615FBBF2C9278A4FA2554C002ECFA1E583AFBBF4072DF28E12554C0FFBDE647BC67FBBF4072DF28E12554C0004B17712095FBBF8082D27DC42554C000F15FE0ECC0FBBF203CD4C8842554C001FF1610CCDCFBBF08A130791A2554C0023807F092F7FBBF583D81BFDE2454C000EAD4D9EC17FCBFA8D9D105A32454C0FFEE0D41B249FCBF24A915D1CF2454C000B22E4ADD91FCBF08A130791A2554C00169D4F2ECBAFCBF08A130791A2554C0FF890CAD79E6FCBF1075A5B9E32454C0FE6EA31F1208FDBFC80D421D8F2454C002267EE57123FDBFE0E99BB50D2454C0001890B82564FDBFE4BD10F6D62354C001DB4F194183FDBFEC1E895F7D2354C000E0888006B5FDBF5036BBD4192354C0FEC5EAD54EE4FDBFEC6E5C61A22254C001B224EA4C1CFEBFFDA3490B122254C00062BDB6564AFEBF7CEFEB979A2154C0007510D62772FEBF64F0682A1E2154C0FF2A8161E7A8FEBFD4949EC8972054C0FE36FCC102C8FEBFB8B001B3D01F54C00211E3B62FD8FEBF48EA1FD2DC1E54C0FF2AE209F7D1FEBF08FF1AF7E31D54C000E3F1ECA6DFFEBFBCB29DB2441D54C000CD953B45FCFEBFACB31A45C81C54C002FBE7ADDD1DFFBFC061CEFC731C54C0FFBC103C9243FFBFDCEF6FB4691C54C0FF9D9BDF2B48FFBFEC40252D031C54C0027E4CFE366AFFBF94CB3404211B54C000B136B46B94FFBF389F503B9B1A54C00196024454A8FFBF00A121BB291954C0FEF4E4A675B7FFBF242565D43A1854C00145BBE662C7FFBFB46CE7DA5B1754C00266365317DCFFBF4417902D931654C0FFDF8554210700C08C972B3F2D1654C001921A84002300C0F404C650C71554C07F6E84757E3A00C038856162611554C000C228AD645000C0743EAA31C61454C0812668776E6000C0181EB3CD7C1454C0FFAD93D9A46B00C0D8AF5CEB821454C08044A2B45D7700C0D4C5B9C2451454C081CACE1C3E8B00C0C00BE9F0B01354C0804E4265D39C00C0A073BDEE461354C000CFFC8D1DAC00C088009393CA1254C080DD992C95B700C08C0EC01A481254C08059E10F9FB900C0A0EC1A4B1D1254C0FFA2AE5786B400C01826CB5DEC1154C080A1F43191A900C040F8DD95591154C0808AE75FD7AA00C03C0A23C5F91054C0FFA2AE5786B400C05C0D7F9CBC1054C080E20C72D5C400C0F087B02B771054C0009CF84939CC00C0945BCC62F10F54C07F5D9153CCD100C0BC35B457780F54C0FFAB8B06E9E400C01489347D580F54C080F8A92C35FB00C084A2013B650F54C0004A806C220B01C0B0B8731FA80F54C0803C581F3F1E01C040858C75E10F54C07F5A0594FA2C01C05465F3F9C70F54C080150AF71B3C01C04C9FA6619B0F54C0003B190A424701C0581CE7996B0F54C0802B23C5655401C0DC925B142F0F54C07F7841EBB16A01C0D42F35C8180F54C0FF9C7471077901C08C1F4273350F54C080BA21E6C28701C030CCC14D550F54C0FF79D0CDAD9901C08C1F4273350F54C001BE8C558FB301C00053291DFC0E54C0FFB41C224DC001C0F029B638B90E54C07FD681B0A9C801C014EA8341860E54C080CD117D67D501C0184DAA8D9C0E54C0807DD8B44DEB01C0A0FFA8F71B0F54C08004B44C3DF901C0A03B33E7D70F54C08196CD0F680002C070E40ABA801054C000C63EC1F80702C0F4EAD6778D1054C0FF125DE7441E02C018ABA4805A1054C0FF99387F342C02C044E8B2C1F70F54C000B7E5F3EF3A02C0106F1A919E0F54C0FF12FA5E184402C018260E31420F54C0803909723E4F02C00053291DFC0E54C07F31993EFC5B02C048631C72DF0E54C0801FC76C4F6C02C0E0F58160450F54C08002B76F678302C064455A7EAE0F54C08092F4A5C18D02C08C41B276371054C080B27DA74D9902C0042E64488A1054C081D4D4A0D2AA02C02CC795F4FC1054C07FC202CF25BB02C0E8A9202F791154C080B030FD78CB02C04446ADB4B51154C0FF6D11ED6AD702C0B4B51E4E381254C000F5EC845AE502C00865C2DEED1254C07F5E1BA88EE402C0E4ED00367D1354C08004E3C936D802C0C4905979C61354C000794F18A6D002C00C26E31DC21454C0814702DA44CC02C0B0711334B41554C0FFDDD3B610CD02C0B0305DEB9F1654C080D0B9FE04D702C034803509091754C0FF2716508CE602C0B0CF0D27721754C0FF1368F10EFA02C08492FFE5D41754C0003039D9F90B03C048D8B06C671854C081F57B67561403C0CC7095EA2C1954C00125FBADBE1203C02020397BE21954C00125FBADBE1203C0343C2AEF841A54C00125FBADBE1203C0AC71E820341B54C0FFBD9A82831903C09407BFF3DC1B54C0FF44761A732703C01CBABD5D5C1C54C081D2D7C3FC3403C0A409967BC51C54C0005C8FE8BC3F03C02CBC94E5441D54C080B5C7C6144C03C0243F54AD741D54C0803AC7D1335D03C0B82587EF671D54C0FF5498B91E6F03C0E0487B444B1D54C0FF4E0413AD7803C0F0C5BB7C1B1D54C081DA97C43D8003C054967CDACB1C54C001FFCA4A938E03C054967CDACB1C54C0804FA18A809E03C048B61556E51C54C0813ECFB8D3AE03C0F0C5BB7C1B1D54C0FFC954D58CBF03C0243F54AD741D54C0FF835938AECE03C04CF29F45A11D54C07F12BBE137DC03C0A88E2CCBDD1D54C080FC3E8BC1E903C0207BDE9C301E54C080C181191EF203C044B1E9FC8C1E54C0FFB4676112FC03C0B88381E2251F54C001117CCC3A0504C0355619C8BE1F54C080ADD3BAA00504C0F038A4023B2054C081E7902C44FD03C01835FCFAC32054C00056776919F603C09884D4182D2154C080C181191EF203C0485AC7D78F2154C0812D8CC922EE03C00CA0785E222254C080FE1A1892E603C0646936DB912254C07F9110688DEA03C09C45F557012354C07F8B7CC11BF403C01C32A729542354C0FFB4676112FC03C078CE33AF902354C081D89AE7670A04C0CC74D457EC2354C081EF2D41931004C0AC2C60973A2554C0FF1F8EFA34EE03C070C61251F22554C081C1410C0ACF03C0
2	Costa Norte	operational_zone	1	Z1	t	2026-07-24 10:51:50	2026-07-24 10:51:50	0106000020E61000000600000001030000000100000067020000903807DC0EA053C000628204D903F33F7C53EB0C52A053C0016001ECA6E3F23FB4EB39D79AA053C001430569C1C9F23F60EC8E09B4A053C002B2BDAC0F9FF23F20D2FF0A8AA053C000301C849086F23FE8FB82734CA053C001AB99F27768F23FECDABAA811A053C001119FE8784CF23FA4C02BAAE79F53C0FFD4A6E2AD18F23F38395C0E28A053C0002C875DAE0AF23FB408A0D954A053C0FF5F49CC95ECF13FA0807B0B7CA053C002D8B45D31B3F13FBC4CB24041A053C0FE7F53CAFEA0F13F78CD4810F09F53C0FE414B184C92F13F28F1E7DEBA9F53C0001FBED04C7DF13F74EAAE12AA9F53C0006567F30062F13F445CA6AAD99F53C000CB6CE90146F13F3CFB2D4133A053C0FFB6A4CC9B3DF13FC0501409C2A053C0FF5821B03535F13F889FC10440A153C011E4D5766924F13F54CDA63583A153C0026FF9788318F13FF84BBB33BBA153C0FFE3C3991D09F13F54D108FE03A253C001C136521EF4F03F4C7090945DA253C0FFF589851FD1F03FB839F0C592A253C001551D4E6DB4F03FD4A4AE91B1A253C0FEBD22446E98F03FB45AB890CDA253C0008B5EA42276F03F58B804C4CAA253C000A0A5A8565EF03F4C4FA671B2A253C001BEA3E5912EF03F34404D5382A253C00274BD05C30DF03F204BA7F45AA253C0FC5107BFC8CCEF3F1CBECD9456A253C0FEB14EDF7C54EF3F34960DF1C3A253C0FE7D4D9342AEEE3F3C574DD0D9A253C00172EE4CF47BEE3F4C4FA671B2A253C00166022D4645EE3F0CFD8DB540A253C0FDBF26148AD3ED3FD0711B5E47A153C002A24ED42D66ED3F6CDA022BCF9F53C001F62D28E3CAEC3F44D10F92019F53C004EACEE19498EC3FF019DE191E9E53C0046A7B1B0592EC3FB41B4522299D53C0016EF7C7557EEC3FC4FB5012F79C53C0FD49AA0CA562EC3F1434115C239D53C00208F49CD608EC3F0CAFFBF91C9D53C002903D958257EB3FE826824F2B9D53C0FE0B3D24471DEB3FA0F90D5A229D53C0042C8C053CFBEA3FC8D571F7D79C53C004C2910E49CCEA3F6850222CC49C53C0015827817CA2EA3F7C1AF9E7829C53C0FCCD55DD376FEA3F841252895B9C53C0FFBF4F0ACA2FEA3F7C1AF9E7829C53C004368CD0DCDEE93F9CEA91E5C89C53C0031E7D77BEAEE93FAC74B8021C9D53C0031438E42F85E93FB8C2D141369D53C0FF05BFEA214AE93FD027EBFDA79D53C000761D0B5329E93FF8F783FBED9D53C0FE7165512404E93F20ABB6F6799E53C002681738E5E9E83F3C443632FD9E53C003DA1CE535D6E83F5CFF0F8CB09F53C004E63F1EA6CFE83F744A768819A053C0FD69A41145EEE83FA08A82E3A9A053C0037A0CDE4311E93FD0350E800EA153C0FDF945F1130FE93FF8CE8DBB91A153C0FEE1C37155E3E83FF8244E59D3A153C0025C2B1837B3E83F080041F8F1A153C000D005E5B87EE83FF8CE8DBB91A153C0FE3BAC4BBB38E83FD86974FF1FA153C003A463DFCC0AE83FB8B38EC1E2A053C000183EAC4ED6E73FA8310F03B7A053C0FE01914CC189E73F94005CC656A053C00068F21F351AE73F7C9B420AE59F53C000DC59C616EAE63F5C1C768E6A9F53C0FE53EC4CC7DAE63F485EE9F1059F53C0FDBF92B3C994E63F2CC2B673D19E53C003A4CBA07C3FE63F18CD1015AA9E53C0FD9927C79FE3E53F10D0C3575B9E53C0FC6F016E045CE53FE836441CD89D53C0014EDB1469D4E43FCC2A9E40599D53C002AE22351D5CE43F74736CC8759C53C00382F355D1E3E33F549EDFAEB99B53C000704F7CF487E33F30CE46B1739B53C003D2A7C9B727E33F30CE46B1739B53C004B242B0FBB5E23F50842CEFB09B53C0FE1DCF633E67E23F6C761F0B279C53C0FD7F4164C10FE23F84DB38C7989C53C00166940434C3E13F9C0CEC03F99C53C000D8541EF685E13FC4BF1EFF849D53C001D282B10758E13FF84D44992F9E53C0FD4B2FEB7751E13F20017794BB9E53C0FFD9B6178769E13F4C4183EF4B9F53C004604F71A599E13F5CE55CCCA79F53C001E8A23735A0E13F84CFA889F69F53C00260C2974595E13F88E6A8064EA053C0FE6197B77674E13FA4175C43AEA053C0FCC3C1712842E13FD86974FF1FA153C0FE3F43CBC91AE13FF0630E7ABDA153C002389C3EAA0DE13F1CD880545FA253C0043068D82AFCE03FC8609C2AC5A253C0FFFFBDEB9EE2E03F2007B2BF48A353C05CF8993107ACE03F54FEF621C1A353C0FEDD2C42D74CE03F3476D253E8A353C0FB1F99DF1AECDF3F202CDC5204A453C0FFCF740ABA49DF3F08A4B7842BA453C0FCD7327A24D4DE3FA443944D9EA453C0FF030595F390DE3FF8A5977B35A553C0067061739477DE3F24005796CEA553C001644A731720DE3F44480A5086A653C00148241A7C98DD3F74D9E22CE2A653C0FC0B798EDF33DD3F80B9C9E776A753C0FABBA2B58BD1DB3F9094BC8695A753C05D8BB375B20CDB3FA8BDC864CEA753C005700043B780DA3FD817887F67A853C0FA37FFF67CDAD93F00B107BBEAA853C00810F350A15BD93F14C554F590A953C006E83F1EA6CFD83F5414BA6E51AA53C002DC8191096BD83F88FB52E9EEAA53C002BC3ED26B29D83FC0FC9E2395AB53C0F8BFFF114B3FD83FE00845FF13AC53C0FBCFDA04EA5DD83FF453ABFB7CAC53C007E8989186C2D83F04123898E1AC53C00500185E023DD93F3CA05D328CAD53C009282404DEBBD93F5892504E02AE53C0F937A6839CE7D93F78111DCA7CAE53C0084867C37BFDD93FC8070F634AAF53C0FF2FAE2AFB0EDA3FDC350F5DF9AF53C0FA33E2907A20DA3FFCB4DBD873B053C00154F1E99850DA3F1C34A854EEB053C0F96F1AF67689DA3F58DC80AEA1B153C0037C4BA9B3E9DA3F88A9666936B253C0068C269C5208DB3FA8B50C45B5B253C0F77BBECF53E5DA3FE4D00B3F64B353C0FE6359B69773DA3F152BCB59FDB353C00248F49CDB01DA3F40C19752CFB453C0F9FF3111C245D93F681B576D68B553C0FBF3E6AAC5DCD83FA8FF3CA554B653C0FBCFDA04EA5DD83FECF52E3E22B753C005CC19C50A48D83F2433885601B853C005AC7D928C13D83F6031214EF6B853C005B4E811CEE7D73FACB4EC46C8B953C00594A55230A6D73F20AAA6DA5DBD53C0043000AD96A7D73F2813E3D405BE53C0FEABCB8E9953D73F8C7BCA9C94BE53C000945C6E05B4D63F4486653126BF53C0F7DF95E5D70ED63F44AB8FC4E1BF53C0F90B208C775ED53F88C9808B8CC053C0FF0F603C16CAD43F88EEAA1E48C153C0F843CD7CB35FD43F3877057FF8C153C0FC2FC33651E7D33FE016E2476BC253C0F8770010ECC2D33F5807EEDDD2C253C0F8330749B8D3D33F249AAD403DC353C00818A0ECB435D43FCC18C23E75C353C0FF637C4DE66AD43F3CC5BB6DF0C353C005D88D21470DD53F749F9ACDAEC453C0070041544299D53F38EE47C92CC553C0F87B10980DC6D53F4C1956F6DFC553C0FCEFD9F73EFBD53F9498BF2631C653C009248FAC0BFED53FC02A2A5782C653C003186800A7CBD53F74D0EAB9ECC653C003186800A7CBD53FD076004F70C753C002987B56D9E4D53F5CEF30B3B0C753C0000C89C87106D63FE4A5AA8251C853C0FEB3FA86363ED63FE4D3E324F8C853C007C407324C57D63F0C7AC0E683C953C001302F505779D63FC45D04F3FBC953C0FC4749A682ABD63F9CD9973472CA53C0FCCBA38E6DBDD63FF01499B608CB53C007B40B3F38BFD63F389E9E90A0CB53C00028F8E805A6D63FE4818DC0FFCB53C00130D7203B6BD63F60346B8972CC53C00130D7203B6BD63F0C3922840CCD53C00468AD9DD2A8D63F083D844C8DCD53C0F84363A7D1C4D63F34CFEE7CDECD53C00264EBCB9F9DD63FDCB2DDAC3DCE53C0FB1BD13CA173D63FEC99D97204CF53C009146C626F4CD63FB0F04AFF83D053C0088814FAD546D63FECCA295F42D153C00288580C3D33D63F0457B0F59BD153C0FDE3D595767AD53F384A938F93D153C0FC3B0F0D49D5D43F1C05C78697D153C0F86B6F073193D43F0457B0F59BD153C0FA135CDA4D49D43F20C26EC1BAD153C0FB83DF472188D33FE1AB418B11D253C0FDF362B5F4C6D23F68453ABA8CD253C001EC5E532C46D23FBC690F1B2FD353C007F09E03CBB1D13FF843EE7AEDD353C00704DFB3691DD13F20F7207679D453C0FEB75F4A39CCD03FB452EBD7FFD453C0014CD418D58BD03F6C5D866C91D553C003A817D6095FD03F101E2B003FD653C0FFAF784E7305D03FC4C74D2B2AD753C0FD8F1C4DEE2ACF3FE8761E5E35D753C0F437324492FCCD3FD42EAA2EC8D653C0EF6FBE6C03C3CC3F58FA8B3174D653C00D8804013C26CC3F81A5FA9BFED553C0103016777735CB3F942D1F6AD7D553C001A0E1587AE1CA3F2C53A35542D553C010383B045B13CA3FF8FB967D5AD453C00CC0040667B5C83FF0FE49C00BD453C0F69F10D2717AC73FE05F64FF25D453C00608F087C0CDC53F0C2D4ABABAD453C021972156CB92C43F241F3DD630D553C00A500F7099F7C23F3CA1BC945CD553C00CE0D871A599C13F44BB6F5465D553C0F09F2E587221C03F4CB8BC11B4D553C02050F0B3FC86BD3F8CB161ED32D653C0FE2F4B521862BA3FA8167BA9A4D653C0F75F8A5336F7B63FA8F914A7EAD653C0F9FF2954C541B53F0819A1FB36D753C0F73FBEA55BE2B43FD0AC47A276D753C0F1BF2156CB92B43F70EC382FA2D953C00BC0EDEF4B81B43F444E84DFF6D953C0FF0FB3EDB435B43F380ED4408BDA53C0EDFF49B1BA8DB33F700519A303DB53C016A0E3C8894AB33F88919F395DDB53C0F3BF6F308062B43F94D91369CADB53C02100DE59077CB63F1CD0039929DC53C01D70319F5D52B83F2C1878C896DC53C0E03FA576EC8BB93F805D15F473DD53C0ED3F77EFE0DBBA3F685B9322FDDD53C0ED3F77EFE0DBBA3F6C5FF5EA7DDE53C01500952D50DAB93FB45C1EE7EDDE53C0106077B05B8AB83FCCE8A47D47DF53C0E2EF1B69342FB73F88D277479EDF53C0EC3FEEA2A32DB63F1C2E42A924E053C003AEAAE56E5AB63F68ADABD975E053C0059003D9CC50B73FA8C73AD89FE053C0F19F7FF726B7B83F5C8A613DC4E053C008C0368CEAC3B93F04EC0F3942E153C020907CDC6D4DBC3F984D7FAA75E153C0E50F508201FBBC3FCCDBA44420E253C01690F4B279DEBD3FF4742480A3E253C00650241A7C98BD3F245CBDFA40E353C0022054817E52BD3F54B67C15DAE353C0DF5F8CE67ABBBD3F58B3C9D228E453C01980801A70F6BE3F7869AF1066E453C007A0480B322AC03FDC5176A0C7E453C0F5AFC65B5332C03F90B4150DCFE453C0FA9F62BEF132C03F907DFC4A0CE553C0E2EFBC7EE9B6BF3FC40B22E5B6E553C01EB050B36D3CBF3FDCE3614124E653C012A07C71B13BC03F04CEADFE72E653C00DB028F2ECBEC03F2CDA53DAF1E653C0F5EF94BD6839C13F2830147833E753C012008F57E3D6C13F50566D13BBE753C0F0378DF0DACBC23F78B3DF7005E853C0FC6723BDD39DC33F7C3D068E58E853C019A9F7544E3BC43F946EB9CAB8E853C0F6B755BC4AA4C43FB4ED854633E953C0069807A30B8AC43FD4BD1E4479E953C0FBA7A93B0F21C43FEC088540E2E953C0F587F355D1E3C33F14D91D3E28EA53C0EFA7C3EECE29C43F08E1C49C4FEA53C001B88922CAB5C43F088851BC5CEA53C0F917E039037FC53F14A2047C65EA53C003300E3AFD2DC63F3BFF76D9AFEA53C00940EE20B8C2C63F5064909521EB53C00058228737D4C63F5861DD5270EB53C0F13FD46DF8B9C63F8CBB9C6D09EC53C005487606FC50C63FB4FBA8C899EC53C00068F885BA7CC63FBC12A945F1EC53C00C60F21F351AC73FF4305B8251ED53C010A0DC6BF268C73FF8BA819FA4ED53C0FDEF281E2978C83FF813F57F97ED53C0F3176B6B5DCDC93F987EFBCD73ED53C011E0184E7BC5CA3F405E883552ED53C00420B97F7651CB3FE4D83A6B09ED53C0F31F9A97A220CC3FC84CB4D4AFEC53C00C500F9CD0B7CC3F481896D75BEC53C0EF4F78D8CA5FCD3F4435FCD915EC53C0025059F0F62ECE3F1C82C9DE89EB53C010483A0823FECE3F5054E4AD46EB53C0F5D7BC7EE9B6CF3F944DABE135EB53C0FABFC0C2A272D03F7403B5E051EB53C0013CB1CE38DAD03F48F36B44A0EB53C002B0A1DACE41D13FB821A6A7FCEB53C08374CFBFFF84D13F3CD483706FEC53C0FC37B992C9DBD13F24D2019FF8EC53C0FDF3BFCB95ECD13F0C6BA59B5AED53C0FFC3AB2031BAD13FA0C66FFDE0ED53C002E47757667FD13F28DE27F87AEE53C0FFC3AB2031BAD13FF00B0D29BEEE53C0F8E37BB92E00D23F94A78729B0EE53C00470B0D72B54D23F28DE27F87AEE53C0002890A31D7DD23F38F033595CEE53C00740347DFAD8D23F1006E89B0DEE53C0FA5F91EF5723D33F08B8CE5CF3ED53C0FE83802F31E8D33F205401DB27EE53C002AC8CD50C67D43F30128E778CEE53C000CC7621CAB5D43F5077A733FEEE53C006AC4D15EC7CD43F6C699A4F74EF53C0F89B3EBCCD4CD43F94A9A6AA04F053C0FA8F9AE2F0F0D33FD0C4A5A4B3F053C0077C9D9533A2D33F001F65BF4CF153C0FA572670164FD33F383A64B9FBF153C0F9535D89D811D33F6821FD3399F253C0F9535D89D811D33F6C5A57CF20F353C0025C4023D657D33FA41F962B8EF353C00274186332C5D33FB8F7D587FBF353C008B46A7BEE36D43FFC12D581AAF453C000CC7621CAB5D43F08F3BB3C3FF553C005D88D21470DD53F3C0EBB36EEF553C008E86814E62BD53F641A61126DF653C004D43F0808F3D43F7CF2A06EDAF653C0F8BB817B6B8ED43F988B20AA5DF753C0049CCB952D51D43FDC6A12C6D3F753C002AC8CD50C67D43F0004920157F853C005BC67C8AB85D43F1418DF3BFDF853C008D090D489BED43F3475519947F953C0FDBB9B2E2B97D43F4C33DE35ACF953C0FEA3C3EECE29D43F4C33DE35ACF953C008748B89D2C0D33F54302BF3FAF953C0FF5FABA2172CD33F844EDD2F5BFA53C0C03785497CA4D23F9C0C6ACCBFFA53C0FEFFDC7022F1D13FA89690E912FB53C008DC7FFEC4A6D13FC84C762750FB53C003C48D0BA930D13FC0BF9CC74BFB53C0F9BB51FECAF7D03FD8F04F04ACFB53C002B079BE6E8AD03FF8C0E801F2FB53C0FCABE931CCD4D03F00315C5F3CFC53C0FFBBC4246BF3D03F1C76997097FC53C0FFBBC4246BF3D03FB0B95BDC93FC53C0FC03CDB18A00D13F5C5E9B3801FD53C0FBA328F163C5D13F40AB74155DFD53C00560163143DBD13F38EDC04F03FE53C004FC2F24E2F9D13F586D806A9CFE53C0059C6A3D9E6BD23F64F8CC27EBFE53C00804FDBCD9EED23F107CE66605FF53C00274F962B56DD33FDCD34CE616FF53C0032829EFCE29D43FDCD34CE616FF53C0FF2738D400C5D53FF01C4D69BFFE53C0015443E0D8ACD63FD427DA0B75FE53C0F84B852C1353D73F68D7A60A98FE53C0F84FC7784DF9D73F64F8CC27EBFE53C0FE8F85AB4885D83FB895D90524FF53C008ECAD04E40CD93FD08A4C636EFF53C000E4EF501EB3D93F18285941A7FF53C0F98F94907A20DA3F68E68B3C330054C003D8C776B85DDA3FC00EE5D7BA0054C0FF834B90F777DA3F6CB32434280154C001600D1D1785DA3FC8DB7DCFAF0154C0FD836CB614CBDA3F48424A4B2A0254C0FA6B23B69122DB3F5C37BDA8740254C00228321C8E8BDB3F48EEBC25CC0254C0F90B7FF56AE7DB3F8C21A363090354C001C88D5B6750DC3FEC28D6E13D0354C002A0DA3444ACDC3F1CF2957F7F0354C0FCAF658101FBDC3F94CD153EAB0354C0FE274101C026DD3F0CA995FCD60354C0FB73DE0D9E5FDD3F888415BB020454C0FDFFAE00BAD5DD3FF4D448BCDF0354C001907FF3D54BDE3FE4BEAF41420354C00584571970F6DE3F204623A5DD0254C0FE575BF2C9A9DF3F7C0B0AE96B0254C0FF97E4F8612CE03F40B7FD8DDB0154C002088B65505AE03F20373E73420154C0FD47BE4B8E97E03F6828D876D90054C0FC5B7EAB1BE4E03FB019727A700054C001148D11184DE13FB883981A6C0054C0FEB9FC3DA4BCE13F20D4CB1B490054C0018CDFF0E01CE23FDC36BF3D100054C000A09F506E69E23FE8A0E5DD0B0054C0FDD79D23DCA8E23F88BAD87C2A0054C0FDEB929639F3E23FB019727A700054C003D61483E64CE33FA0D071F7C70054C0FFD135A903A0E33F9CF197141B0154C001FE944201E6E33F5400FE10840154C00482DAE85F0DE43F00C6638A440254C0FD8330224D5EE43FF07C63079C0254C0000876C8AB85E43FD0EA62014B0354C0004EA9AEE9C2E43FD475AFBE990354C0FDF1F7B458DFE43F78B0C87A0B0454C00282726E8704E53FB404D5D59B0454C000302B9B961CE53F386BA151160554C00028C174F620E53F4C813ACCB30554C0FEFD8201162EE53FD0E706482E0654C0FE1178747378E53F28EF39C6620654C004400C2141BCE53F14A63943BA0654C002666BBA3E02E63F4C4ED3C3A80654C00272F606FC50E63F4C2DADA6550654C0FC754C40E9A1E63F0CFAC668180654C0048A0CA076EEE63F0CFAC668180654C001AE6B397434E73F5C97D346510654C003C460ACD17EE73FCC082D65810654C0002ED205F0AEE73FB034E0248A0654C0FF49FC8B1DF7E73F48C386065A0654C0010A0BF21960E83FD8512DE8290654C0011E006577AAE83FA8886D4AE80554C0FD4B941145EEE83FF079074E7F0554C0027A28BE1232E93FAC462110420554C000A8F17DB073E93FE4CD9473DD0454C0FEFFC39D5EAAE93F843B15385A0454C001368D5DFCEBE93F881AEF1A070454C0018E94907A20EA3F6C257CBDBC0354C003FE05EA9850EA3FE8BEAF41420354C0038880A3C775EA3FFC07B0C4EA0254C001DE319D5859EA3F44F949C8810254C0FE1F0F4AA945EA3FC0927D4C070254C0FFE566B02857EA3F843E71F1760154C0FE77167D277AEA3F5CBEB1D6DD0054C000A254F0076DEA3F9824FF1C260054C00210A523094AEA3FCC2026C372FF53C0004A4DBD8938EA3FC474B3E8D0FE53C00018DA36D947EA3FD89C8D4E26FE53C0FFDBFC89885BEA3F3C414E7561FD53C0FC7F4B90F777EA3FF0821B7AD5FC53C002EABCE915A8EA3FD86C82FF37FC53C0FD47C41C94DCEA3FC856E9849AFB53C0004C1A56812DEB3FE4E8E98AEBFA53C0048C4D3CBF6AEB3FBCDDDDB203FA53C0040C5ECF4D94EB3F906EC86551F953C00302B08C0CB9EB3F5C578D02F5F853C0018A15203FCBEB3FE0EF873D12F853C00194CDC1A4E1EB3F94FAA07583F753C00320FCA00AF1EB3F58992C4616F753C004A0BC17D7FAEB3F3003DF7BCDF653C000267D8EA304EC3F005A0CB276F653C004363530091BEC3FCCD468B514F653C003BE082CD532EC3F8C606F8699F553C001D065EAA051EC3F48B5C18A1BF553C0FFE1C2A86C70EC3F009CABF597F453C0FC713BC19E90EC3FB0A6C42D09F453C0FD0722426AB6EC3F70A0339893F353C0049AD10E69D9EC3F482E159B3FF353C003AC9C35CEFDEC3F18611304F4F253C0004828D3FF2BED3FF0B7403A9DF253C002DE7CBC6457ED3FB8A005D740F253C000046EEDC897ED3F841B62DADEF153C00124F1B593D2ED3F508339DE6EF153C0FE3DCF61F804EE3F10B45C15FCF053C0FEDB6D842941EE3FBC500DB467F053C003002801C17EEE3F7CDC1385ECEF53C0FD15CFF858AEEE3F40B2532282EF53C00332088857D8EE3FECE09B27E8EE53C001C425BDEF00EF3F64E523CAE3ED53C004D01413221AEF3FD00DDB39D4EC53C0FDE7DF39873EEF3F20EA7DAB8CEB53C0FF11AD3B1E8AEF3F7823DFE863EA53C000B24B5E4FC6EF3F38417D20E3E953C0FCBFDFD0E7E7EF3FD812075A2AE953C002AA909AA602F03F7889ADF979E853C0FFABFE024008F03F24B8F5FEDFE753C002EAB921C004F03FD41DF2D048E753C0FD41C47681E6EF3F70EF7B0A90E653C001329E6C82CAEF3FFC0864DEC0E553C002B482121CC9EF3FA4C9434A21E553C003B4F07AB5CEEF3F600B114F95E453C004C071684EE2EF3F0403A587F8E353C001699EC75903F03F88F6825C0DE353C0FF2AE3A8D906F03F3CA6B8FA86E253C000379B4A3F1DF03FD809DA9AC8E153C0FF438AA07136F03F88DD3E0637E153C0001019BBBD4AF03F448D74A4B0E053C0001A9AA8565EF03F6087C018D6DF53C0009A3A324F7DF03F00B3F4A2ACDE53C001FE76789DAFF03F40F81BCCA1DD53C00200221514D8F03F1C573694B5DC53C00193D1E112FBF03FB0396A9BE3DB53C000AF50CBC91AF13F645A118304DB53C0FF506ABE6839F13F6C18C5485EDA53C000138D11184DF13FA87E128FA6D953C001F183B10758F13F00B9AC15E6D853C0FF5F7F817F5DF13F607E935974D853C0FEA39141A047F13F8C7ABAFFC0D753C0FE72731E792EF13F2CC714A7EAD653C00104784E0129F13F3485C86C44D653C0025ED4E40835F13F10E4E23458D553C0FF1FF737B848F13F48BFE3BD51D453C0FE7C53CEBF54F13F5CCDED7AEDD353C002E4198B675CF13F3C4A25B0B2D353C000A69520B462F13FDC891783FFD253C002A327B81A5DF13FB072DC1FA3D253C000E2AB22CE56F13F6C3597BD2AD253C002A4F0034E5AF13F38793FF4C5D153C0FEE8F55B9A67F13F10515AC382D153C00172ED863374F13FD04AC92D0DD153C000B5BB2AB37EF13F98B2A0319DD053C00172243B0077F13F6040823449D053C000277AC64D61F13F2871A56BD6CF53C000E2AB22CE56F13FFC353B3B85CF53C00009FD5E784FF13F4C045883C5CE53C001849906934EF13FD8B5E8C00ECE53C0FFDFD18CE85CF13F4CBBF99E7DCD53C0FFDEC27D8371F13F686A665D07CD53C002F265FF807EF13FE472649A25CC53C0FEBA737C268AF13F80EE920120CB53C0FF875DCAFEA0F13F58BC26339CCA53C0004AA2AB7EA4F13FC8C0AED597C953C00018D6E230C1F13F701326A8F2C853C001AE85AF2FE4F13F1CB0D6465EC853C001C2878A610BF23FC4024E19B9C753C001D652B1C62FF23F5C666FB9FAC653C0FF2CB5C7DE5BF23F088232BF52C653C000874E92C38AF23FB8E72E91BBC553C0011C35138FB0F23F703C81953DC553C000F00D67A7D5F23F3C5CFAFEE3C453C00185F4E772FBF23F20D93134A9C453C00013FF970B16F33FF89DC70358C453C001A81CCDA33EF33FD81AFF381DC453C001F76B5EBC5CF33FB04DFDA1D1C353C001C6312DD573F33F68A24FA653C353C0020C00D1547EF33F30788F43E9C253C0008AE476EE7CF33FFCF2EB4687C253C0FE7D2CD58866F33FB854A61FE6C153C001DE4996B64AF33FF4BAF3652EC153C000EC0820E01DF33F64EA004AB8C053C0025E8E66B1F8F23F9C7174AD53C053C001D313AD82D3F23FDCF8E710EFBF53C0FFBCC9D69BB1F23FA42F2873ADBF53C002718203ABC9F23F2875CED1D4BF53C0FF2E1BE00008F33F446A412F1FC053C000B560865F2FF33F446A412F1FC053C0FE8B22137F3CF33F7CF1B492BABF53C0000933A60D66F33FB87828F655BF53C0FEBDEBD21C7EF33FBC36DCBBAFBE53C0028743399C8FF33FA420434112BE53C0013CFC65ABA7F33F940AAAC674BD53C0FFFF1EB95ABBF33FE4656A6A07BD53C0FFBA615CC3A8F33FDCB9F78F65BC53C00059D0B2EB9EF33F044CF895B6BB53C0013CFC65ABA7F33FA4239FFA2EBB53C0007C84AF72BCF33FD0F6B2F1BDBA53C0FEBE691AEBDEF33F78CA175D2CBA53C00107A62604EFF33F009AC6644CB953C0024D74CA83F9F33FB4C80E6AB2B853C0FF1803E5CF0DF43F78D502D44AB853C0FEE6FF67B527F43F3498BD71D2B753C00139BD61674BF43FB8C3885C52B753C001C9ED7EE470F43FC02DAFFC4DB753C000BE2EF5BA9DF43F48522F3E22B753C0FF50DEC1B9C0F43FD8558962A3B653C0FE90660B81D5F43FB4D5C9470AB653C001226B3B09D0F43F0CEF3DB1F6B453C0007592BE40DEF43F241718174CB453C0FEE38D8EB8E3F43F6CE78BFD8FB353C0FE5ABE7100E7F43F38FDA542FBB253C0004E544B60EBF43F7463F38843B253C001A8B0E167F7F43F7463F38843B253C0FF4CFFE7D613F53F788419A696B253C0025534FBA611F53F4488F2FF49B353C0009311A8F7FDF43F40EB645743B453C0010F779E0FFFF43F0CEF3DB1F6B453C0FF4CFFE7D613F53FC8DC7D900CB553C000E7E3C7A534F53FBC937D0D64B553C0FEDB243E7C61F53FE0F2160BAAB553C002080E4ED37CF53F98017D0713B653C000861EE161A6F53F448596462DB653C0009533A478CAF53F14BCD6A8EBB553C002AB7D7A5FECF53F00A63D2E4EB553C0FECE3177E609F63F7C6097CF26B553C0006F4B6A8528F63FCCFDA3AD5FB553C0005722BABB59F63FBC937D0D64B553C0025E026A0280F63F04851711FBB453C00215BB961198F63F8C8871357CB453C000F0B13601A3F63FAC3B985820B453C000B5D489B0B6F63F88DCFE5ADAB353C0FE78F7DC5FCAF63FD837BFFE6CB353C0FE78F7DC5FCAF63F644BF607CAB253C0FE623CC8929AF63FE0A634D527B253C002FA61718879F63F1C35E3BAD3B153C0FECD7683FF5CF63F6045CF9C73B153C0FE1C6A677949F63FA816DA7C0DB153C002AFCEF1702EF63F08AD7E5389B053C0017D61C6EB1DF63F6882042C0BB053C0FF43337C6813F63FA892F00DABAF53C0018B6541E405F63F10ABD2E01AAF53C0FE96E77EE0F9F53F643DFCBEAEAE53C0FE96E77EE0F9F53FB0CF259D42AE53C0008AA422E60BF63FF41EF380E8AD53C00086E303E811F63F1027E971B8AD53C000C0D26C6916F63F8882273F16AD53C0020283F4E814F63FCCD1F422BCAC53C0FE47F49A660DF63F14A3FF0256AC53C0015537F760FBF53F1C253DFF49AC53C002DA58255EF2F53F30EAD6F52BAC53C000F5DEDD52CEF53F402D33F019AC53C002D0B40EC8ABF53F5CB3EBE4F5AB53C0FF242A303E8CF53F78BBE1D5C5AB53C002362EAB3674F53FA84515C389AB53C0FF05829EAF5DF53FE8D3C3A835AB53C00213C5FAA94BF53F2462728EE1AA53C0009BE628A742F53F542F027693AA53C000200857A439F53F903B735F4BAA53C000F35B4A1D23F53FB804884E15AA53C000C7705C9406F53FB804884E15AA53C0FEDC35F68AE8F43FC4080347FDA953C001F3FA8F81CAF43FEC10F937CDA953C001C24E83FAB3F43F2C60C61B73A953C00159742CF092F43F5029DB0A3DA953C0FF2F893E6776F43F7CB30EF800A953C0FE334A5D6570F43FB0FE60E3BEA853C0FFB86B8B6267F43FC002DCDBA6A853C0FFBD2CAA6061F43FA02F4ED333A853C0FF96D385F452F43F781DC4F0CEA753C0FFBC17B8A73EF43F205B4C1F85A753C0018CF7FFE427F43FC898D44D3BA753C0004D6B8CE617F43FF8EA34E1D8A653C000C2A7EDD30CF43FFC5BD98B51A653C00099B4F472FDF33F88122495F1A553C002FE849A24F9F33FD48D34F25DA553C00103C496FEEAF33F0411637F3BA553C0FE49CE02B1DEF33FE45C66F81DA553C00144E03F29C9F33FF02B98FEDDA453C0FE94566717B6F33F30D876558AA453C0FE3804BA199EF33F307AE9F942A453C002207D7CF487F33FE8B36290C0A353C0FE792063447CF33FCCCE970F63A353C0FED8C3499470F33FB0E9CC8E05A353C000F19BC00B63F33F284699D496A253C0027144DD3451F33FE8ACD1CC1BA253C0FF068674FB3FF33F805F0D3E83A153C0014E90E0AD33F33F80A3F286F4A053C0FEC7F900FD2FF33F881497316DA053C00056BD9F0F3BF33FC093B62612A053C0009A880FE83CF33F90A31800C69F53C0009A880FE83CF33F700B77DDE49F53C0FE6494E1241FF33F903807DC0EA053C000628204D903F33F01030000000100000016000000B48BE681A4C153C0005E86163A9FF33FF0230F7E14C253C001E9591206B7F33F3C875EDFA8C253C0007CD22A38D7F33F54C0EDDDD2C253C0FF44614584EBF33F38AB8DAC9DC253C000D5A2A9E908F43F04B8811636C253C00161083D1C1BF43F90D169EA66C153C00175D363813FF43F4000B2EFCCC053C0017F8B05E755F43F040DA65965C053C000D1114BCC76F43FC80615C4EFBF53C0FF457503CD61F43FA0CBAA939EBF53C000B8A107014AF43F5857B16423BF53C000A97BFD012EF43F1062CA9C94BE53C0025C9AD48215F43FDCEFAB9F40BE53C00147CFAD1DF1F33FECA74D0557BE53C000772D0ED2CEF33F14AC0369A5BE53C0FEAA9EF385BAF33F786C119658BF53C00220CBF7B9A2F33FB4E00AC5D3BF53C00211A5EDBA86F33FF065AEC135C053C0FE87ADC2217AF33F3C5B9589C4C053C0FE87760E5577F33F7C2A725237C153C00211DCA18789F33FB48BE681A4C153C0005E86163A9FF33F0103000000010000001E00000044717642EFBD53C0FE76C6FBAC62F43FA803F67D72BE53C000E03755CB92F43F1454297F4FBE53C002F7812BB2B4F43FD820434112BE53C0FF959B1E51D3F43FDCFF1C24BFBD53C001A8B0E167F7F43F6003774840BD53C0FF8C87319E28F53FBC5E37ECD2BC53C001A4D107854AF53FE47B84AF72BC53C0FF43EBFA2369F53F90532B14EBBB53C0015A35D10A8BF53FC8DA9E7786BB53C00064158151B1F53F4474D2FB0BBB53C0FF5D8B0AF8DBF53F2C5E39816EBA53C001F96FEAC6FCF53FE09F0686E2B953C000C2C750460EF63F8898D307AEB953C0FE676BBA3E02F63FBC406D889CB953C0FFA248678FEEF53FF4E806098BB953C0009533A478CAF53F7C0D874A5FB953C002392C71FA95F53F601814ED14B953C0022F4CC1B36FF53F187B070FDCB853C0008AFDBA4453F53F903561B0B4B853C00273B3E45D31F53FD44721D19EB853C0028BDC942700F53F7840EE526AB853C000AB3A58C1CCF43F88AA14F365B853C0FFA88FBB4AA4F43FFC8594B191B853C0FEBB83584475F43FA84BFA2A52B953C0FE31099F1550F43FE84B796084BA53C0019724BF462FF43FE8393875CCBB53C0FEE16B923717F43F50EDDDCDA2BC53C0028D440F0009F43FE8481DA767BD53C0005B4712F642F43F44717642EFBD53C0FE76C6FBAC62F43F01030000000100000011000000003393DE16B753C0FE9F228CFA06F53F54044BD9B0B753C0FE6E1F0FE020F53F7C9A98A3F9B753C0028221EA1148F53F8C65BF081EB853C0FE9B912DDD74F53F909C73D520B853C0012E41FADB97F53F742C300AF4B753C0017E59D727B3F53F4CF1C5D9A2B753C0FFC595E340C3F53F2400957562B753C002C9034CDAC8F53FFCFBDE1114B753C0FE082DD3F3CAF53FD089C014C0B653C0FEF461AC8EA6F53F9C96B47E58B653C0FE20C00C4384F53F5CA3A8E8F0B553C001D5A72FF768F53F38683EB89FB553C00106ABAC114FF53F284234B983B553C000718D777926F53F58596F1CE0B553C0FE9F228CFA06F53F90BAE34B4DB653C0005DC2501402F53F003393DE16B753C0FE9F228CFA06F53F0103000000010000001300000084C0A2A215B853C002059C74D638F63F70E2F63DE3B753C0024F0F35BC4BF63F28C9E0A85FB753C0005CFE8AEE64F63FE41D33ADE1B653C0FEAD4D1C0783F63FC02C0249A1B653C0007A4A9FEC9CF63FA07285B163B653C0FE86CB8C85B0F63F80EFBCE628B653C00093832EEBC6F63F5C35404FEBB553C0FEDF64576ADFF63F3CB27784B0B553C000F12F7ECF03F73F281E05EC8EB553C0013CA33EB516F73FBC6EA18CC2B453C000F6D49A350CF73FA4A37A279EB453C0029F72841DE0F63FC4EF8E25D6B453C0FF0CC3B71EBDF63F10D2F0ED56B553C0FEB705BE6C99F63F3CB27784B0B553C00263DA5B2170F63F805D25802EB653C0FE85B7CE3C3AF63FD89C4514CEB653C0FFF7AC1EA41FF63F44835D409DB753C0023B440E5727F63F84C0A2A215B853C002059C74D638F63F01030000000100000014000000F4019E68DCB853C0FEAD84D0D385F63FDCFFC236B5B853C000845D24ECAAF63FB832C19F69B853C0FED51A1E9ECEF63FAC56F06C5EB853C0026425CE36E9F63FBCA029396FB853C000C0F54CE81AF73F98E6ACA131B853C0FF52DCCDB340F73F6806260BD8B753C001A086426656F73F403924748CB753C0FF61CB23E659F73F186C22DD40B753C0FE20D950995AF73FDCE67EE0DEB653C0005AB89EE64BF73FA417A2176CB653C000CAADEE4D31F73F78DC37E71AB653C0FF74828C0208F73F8439F6B239B653C0FEDF64576ADFF63FC063B615A4B653C0010A554F85B7F63F040F641122B753C001F6C0DCEC95F63F4C96E23FABB753C000AB16683A80F63F882E0B3C1BB853C0FFD5CFAB8855F63FD44721D19EB853C0004733648940F63FF8A6BACEE4B853C001DDE2308863F63FF4019E68DCB853C0FEAD84D0D385F63F
3	Guayas	operational_zone	1	Z2	t	2026-07-24 10:51:50	2026-07-24 10:51:50	0106000020E6100000130000000103000000010000000A0000000C4C8E08FC1B54C08023671CA56109C0D0F781AD6B1B54C081A211CE694D09C0A02EC20F2A1B54C0FF93A7A7C95109C0BC020F50211B54C080729E47B95C09C0D4D65B90181B54C0002E8C87987209C044D3016C971B54C07FA8ACC2038909C07CBDE7262C1C54C08010737FAB9009C04CA09A638C1C54C080A177AF338B09C06C74E7A3831C54C081275774C87409C00C4C8E08FC1B54C08023671CA56109C00103000000010000000F00000044CD0821FA0654C081AB7598986F07C03CBA8321EC0654C081C4DB7C3F6107C02881F422C20654C081FF2833265807C010486524980654C001BDC8F73F5307C0DCD54627440654C081D79C44804A07C0A03D1E2BD40554C0015AEF52B34E07C070EF2EFB740554C0011FA29CCC5707C04C35B263370554C08184E9A9F26107C050A31AFD3C0554C0002D91F2FE7007C088F1092D9C0554C00092D8FF247B07C0B063282AF00554C08135DB2BCB8107C0F80ED6256E0654C0FF58C2FD0A8707C02C5DC555CD0654C07FD66FEFD78207C0384C1B88E60654C08130360F657907C044CD0821FA0654C081AB7598986F07C001030000000100000010000000C44ED17C270554C000595FA6A75A07C08483A193960554C0016EFC16A24907C0F449897EA80554C000A5EE99FC3D07C0C04BE41D780554C00079D2D6D13607C0A0502C1CF70454C07F9F12C9C93207C0386F13C6BD0454C080C9C0235B3407C084FE061BA10454C00079D2D6D13607C060C71285720454C001BC7CFB914107C0D490E7CE330454C0016EFC16A24907C09004E1D8FF0354C080349C2BAE4F07C014774823EC0354C081D669B65B5F07C02420DB23170454C0001A14DB1B6A07C010563DFA650454C07F8B573A056D07C0B01ACA45A80454C07F75C9D86F6907C0703469F1EF0454C001A46213996107C0C44ED17C270554C000595FA6A75A07C00103000000010000001C000000B8EF003A220454C07FF37091C04107C0F03DF069810454C0806A42B25A3207C01C795A9AD20454C000C39A694E2307C044465C311E0554C07FA1EA4BDB2007C07802B4FA820554C07F063259012B07C0D88B0D5B330654C07F063259012B07C0046C94F18C0654C07FBCBE981B1807C000FE2B58870654C0001417500F0907C0E4E8CB26520654C0FF8D1F2576FC06C0B8084590F80554C080461ACD29EF06C09CF3E45EC30554C000BDB439F7DC06C098857CC5BD0554C00095284B51CF06C088BA5560990554C001CF3E4D6BC306C03C7D10FE200554C0800D3120B8C206C0FC9AAE35A00454C081EEB7B611C306C0D496F8D1510454C081B1334C5EC906C0A47FBD6EF50354C001F6CA3B11D106C070FA1972930354C080FA6F5877D906C0203CE776070354C081FDDDC010DF06C0D8B468487E0254C0000283DD76E706C0BC9F0817490254C081475181F6F106C0BC9F0817490254C000AFCF42E9FE06C0D40F4CE2750254C08058AE3FC21007C0F4DC4D79C10254C001C163B5812007C0284F6C76150354C0802C8793DA3507C0545322DA630354C07F75C39FF34507C09422FFA2D60354C07F75C39FF34507C0B8EF003A220454C07FF37091C04107C00103000000010000000F00000034C04278B40854C080C4C7BEF6EA06C00C2AF5AD6B0854C081FDDDC010DF06C0D0FF344B010854C000B80F1D91D406C084AF6AE97A0754C00095284B51CF06C040F137EEEE0654C08173782DDECC06C004C7778B840654C000F5938744CE06C0E00CFBF3460654C0007A54FE10D806C0F0C49C595D0654C0FF20C59250E406C00CDAFC8A920654C0FF2A4680E9F706C02C02E2BBD50654C001B23DAB820407C08C54874F830754C08018BC6C751107C0DC8022E4140854C000D9C999281207C0202CD0DF920854C07F9532AA750A07C044E64C77D00854C081EA1CF9CFF506C034C04278B40854C080C4C7BEF6EA06C0010300000001000000830000007419740F0CFE53C000835085BF5F06C058877309BBFE53C080C80DE2567206C038F572036AFF53C000999A5BA68106C070497F5EFAFF53C081ABF4D9699006C08C3EF2BB440054C00182B666899D06C06021A5F8A40054C080BA099D80B406C0B828D876D90054C0008B9616D0C306C074586490950154C0004EB9697FD706C0F8BE300C100254C07FC3E94CC7DA06C05C51B047930254C08105B7513BDA06C064FD2222350354C080688DB6BFCE06C0F47988184D0454C07F91CB29A0C106C05C4E548E760554C001F6A18E24B606C064FAC668180654C001EF6C7B54B806C00C9F06C5850654C07F563338FCBF06C0B4434621F30654C0FF1B9B4658BE06C03040ECFC710754C000303A80C8B706C074FE1EF8FD0754C0FFB3D489B0B606C0340D85F4660854C0FFB3D489B0B606C044231E6F040954C081D3982E14C106C02070F74B600954C080D7888637D406C06CA3DD899D0954C080E9E204FBE206C01827F7C8B70954C080B33A6B7AF406C040656AA9AA0954C001F9F7C7110707C0E45D372B760954C07F61BE84B90E07C0CC68C4CD2B0954C07F0B5246D51507C04802F851B10854C001CD7499842907C0701F4515510854C001E6032B183607C0602AD2B7060854C0804795D4EF3F07C07073D23AAF0754C0009CBC57274E07C098B1451BA20754C07F6C49D1765D07C0EC2D2CDC870754C080E6690CE27307C09C901FFE4E0754C0007C5E948D8107C008C02CE2D80654C001DDEF3D658B07C078EF39C6620654C080FCB3E2C89507C0B876AD29FE0554C0FF5D458CA09F07C0D04AFA69F50554C0819698C297B607C044267A28210654C0FF51860277CC07C0B0B8F963A40654C00056765A9ADF07C02C1FC6DF1E0754C081A368CA01F007C07465311D6A0754C07F1C89056D0608C09C566281AA0754C08087752FF91808C0CC36E917040854C0004F96E1AB2708C0F49582154A0854C08192F61C922C08C024E47145A90854C08051044A452D08C050569042FD0854C000AF011E9F2608C078B52940430954C080AA5C01391E08C0D462B26DE80954C001A6B7E4D21508C01C589935770A54C08047835CAC1908C040A4AD33AF0A54C000EDBC3C1F2308C0602776FEE90A54C0000B9568733508C0B44FCF99710B54C08065F1FE7A4108C0DCCF8EB40A0C54C081011B9AF64C08C030F8E74F920C54C0FFF3B073565108C0C000C881730D54C0008648DA505108C0EC72E67EC70D54C08003F6CB1D4D08C014779CE2150E54C000C19590374808C0606C83AAA40E54C0013F4382044408C0CC894FA3760F54C07FDDA091444208C010C79405EF0F54C0805B4E83113E08C0549671CE611054C0804C2879122208C060619833861054C001A6B7E4D21508C07C2CBF98AA1054C000A0DB13A00A08C07CF50ACCA71054C0807618712DFA07C06806B5998E1054C0FF6A60CFC7E307C0549671CE611054C0FFA5AD85AEDA07C04439B302431054C0013953F388C207C0481584354E1054C07FEF16E76FB207C04C4C3802511054C001C75344FDA107C0883E0B4F501054C0804C852C135307C0706ABE0E591054C000FEE71F351A07C0F0AF646D801054C00042FADF550407C06C8BE42BAC1054C0FF6A385336F706C098337EAC9A1054C081A7150087E306C02458FEED6E1054C0004EB9697FD706C058754BB10E1054C08084610300C606C0E099CBF2E20F54C0FFB3D489B0B606C080929874AE0F54C0FF1DE00105A906C050C9D8D66C0F54C000CBB87ECD9A06C0FC2BCCF8330F54C081ABF4D9699006C09083BE0D010F54C00104A6D3FA7306C064A33777A70E54C0FF1AD503D56206C02442C3473A0E54C0008F38BCD54D06C0F0E04E18CD0D54C07F86EE82093D06C0C8B869E7890D54C001BECDD0562E06C0C000C881730D54C00172235CA41806C0D8DE73E6A50D54C0010DDC4E7E0E06C0EC72E67EC70D54C081C70DABFE0306C0D883904CAE0D54C080DF738FA5F505C0A07DFFB6380D54C0003A3AAF32EC05C0508818EFA90C54C0FFB6B0EC32E505C0DC0F695CE00B54C080D04D85A6D905C0A4E5A8F9750B54C0816C3D2C4DD205C06C8434CA080B54C08028A63C9ACA05C0187CC8026C0A54C07FE54501B4C505C0A0822BD78E0954C08063F3F280C105C0489EEEDCE60854C0FF7FFEF38DBB05C00C06C6E0760854C081FA3D7DC1B105C0A4A09B4DBB0754C0FF93BFBBCEA405C038BA8321EC0654C000CDD5BDE89805C0C841D48E220654C0816657FCF58B05C040EB7897260554C000C11D1C838205C0B48198A01C0454C0015F4477F67D05C028F488DC1D0354C0FF173F1FAA7005C030F2164A4D0254C081995739086205C09475B153350154C07F7019C6276F05C000A5BE37BF0054C0815C7A8CB77505C0C0C5651FE0FF53C07F6ED40A7B8405C0246A26461BFF53C080AD5C54429905C0F87F408B86FE53C0803C1CC91DA905C0688E2752BDFD53C001D8456499B405C0E80635B9EFFC53C080880E3985B905C0E05AC2DE4DFC53C0012C6DE7D0C205C0F8829C44A3FB53C00180946A08D105C0D402DD290AFB53C08064C01DC8D905C06C41892EB6FA53C08164E6F6EFE105C04846D12C35FA53C0FFD897BE72EA05C068D71F21E8F953C000FBECD0D2EF05C014A2862A89F953C08165D7E78AF605C09814EE7475F953C0815FEC07F3FF05C0206937F58AF953C0FF78E8D1210906C018846860B2F953C001D32058771706C0CCD65641F8F953C08093D58CEB2606C07077BF006CFA53C0FF464C9F583B06C0805AB664B5FA53C080AB51DC3A4306C090ACDB650BFB53C07F622071D54C06C03CDA908C62FB53C000700ADA935506C0FCC3FF27ECFB53C0FF0F4B0D995B06C0C443DA4F99FC53C0FFD638D52B5C06C0245B411480FD53C0001455B5475A06C07419740F0CFE53C000835085BF5F06C001030000000100000009000000A4B0CF5E9A0B54C081BEA554C54105C0783EB161460B54C0815BCCAF383D05C05CBBE8960B0B54C0011E1191B84005C048CC9264F20A54C07F8121EA114805C0600522631C0B54C07F06E260DE5105C0948AC55F7E0B54C081081915AB5405C0C4339829D50B54C080A77624EB5205C0C4A100C3DA0B54C07F8121EA114805C0A4B0CF5E9A0B54C081BEA554C54105C00103000000010000000A000000F8131FC02E0C54C0018F06E11F2605C0C4C52F90CF0B54C0018F06E11F2605C0B08CA091A50B54C080D02F68392805C0AC55ECC4A20B54C00016FE0BB93205C0B40D8E2AB90B54C0805A95FB6B3A05C0F09231271B0C54C0805D0364054005C014F2CA24610C54C0007D7CCDAB3F05C02C99C2BC900C54C0FF1635C0853505C0204F89F07F0C54C00194ABFD852E05C0F8131FC02E0C54C0018F06E11F2605C00103000000010000000D000000682C329B5A0054C001BD94D684DB04C038424CE0C5FF53C00113011569D404C0446A26461BFF53C081D86823C5D204C0681D4D69BFFE53C000F72CC828DD04C05C9200AC70FE53C07F60F384D0E404C0A0A4C0CC5AFE53C081B31A0808F304C0C02480E7F3FE53C080E148D30BF904C084BE32A1ABFF53C00042DA7CE30205C0F0DBFE997D0054C0819601001B1105C094161856EF0054C07FA36B26BB0C05C038300BF50D0154C0006B18F0C3F504C0C8BEB1D6DD0054C0FF935663A4E804C0682C329B5A0054C001BD94D684DB04C0010300000001000000230000000CF5F3CD37FE53C07F42749B19C504C07CF199A9B6FE53C00092ABC62DC004C054D44CE616FF53C08045B956C6AF04C0F40E66A288FF53C001752CDD76A004C0B01DCC9EF1FF53C0FF325FD802A104C07C007FDB510054C000D088737EAC04C0644D58B8AD0054C0816BB20EFAB704C0788417509E0154C00092ABC62DC004C0C06370687D0254C00151DEC1B9C004C02CA2627EA20354C0801C7BE3E5BC04C04097D5DBEC0354C07FF6812BB2B404C0E4B0C87A0B0454C0802C2AC532A304C0AC3B9602280354C000F4D68E3B8C04C078308A2A400254C001F0E636187904C0780F640DED0154C07F958AA0106D04C03CBB57B25C0154C081E0D173015504C01C5CBEB4160154C0801045FAB14504C0C8BEB1D6DD0054C0800B55A28E3204C0A85F18D9970054C00084CA40832004C07C007FDB510054C000BA72DA030F04C0B01DCC9EF1FF53C001A2E348700204C070C9BF4361FF53C0802BB36528FF03C03075B3E8D0FE53C07F59E1302C0504C048490029C8FE53C0809F9E8DC31704C0FCCC1968E2FE53C0FF118AB55E3004C004374008DEFE53C0FFDBE11BDE4104C04C28DA0B75FE53C0016AA190B95104C0C436C1D2ABFD53C0814FCD43795A04C03845A899E2FC53C000205ABDC86904C088A0683D75FC53C000997AF8338004C09CE968C01DFC53C000B7F9E1EA9F04C09CE968C01DFC53C00023B0F6B5BA04C0E8A79BBBA9FC53C0812ED561A9CB04C09CD727D565FD53C07FF33C7005CA04C00CF5F3CD37FE53C07F42749B19C504C00103000000010000000A000000FC233444CFFA53C07F3A7DD6545B05C074ED088E90FA53C0009E8B1CDA5605C0EC7D8EA253FA53C0006916117E5305C0100FDD9606FA53C081DB5970675605C0D849876BD4F953C0015964801B5B05C060BCEEB5C0F953C080A7D555A66705C0B4D65641F8F953C001C1D11FD57005C0C07CFCE273FA53C0001C871D297005C0EC5C8379CDFA53C07F690702196805C0FC233444CFFA53C07F3A7DD6545B05C00103000000010000000F000000C02480E7F3FE53C0807A2DB3DA1905C028EA662B82FE53C001199C09031005C0A4839AAF07FE53C0813BA569130505C078788ED71FFD53C080A6B0E167F704C0C8D34E7BB2FC53C0FFACE5F437F504C0A874B57D6CFC53C0FF5DAEC923FA04C0309935BF40FC53C080619E21470D05C09CE968C01DFC53C00174F89F0A1C05C0788ACFC2D7FB53C0004485195A2B05C09CE968C01DFC53C0008A4276F13D05C0E4C8C1D8FCFC53C001F20833994505C05007B4EE21FE53C001F20833994505C0605F99A365FF53C08056DF971D3A05C050F572036AFF53C001C81F23422A05C0C02480E7F3FE53C0807A2DB3DA1905C001030000000100000022000000A42C983D81F153C0FF5679B653FC04C0780F4B7AE1F153C0FFC57486CB0105C064E770148CF253C0009D3613EB0E05C0FC218AD0FDF253C0009601001B1105C0288123CE43F353C0FF67D334170B05C0A05CA38C6FF353C0FFE77DE6DBF604C0C49A166D62F353C08158BE7100E704C0FC218AD0FDF253C001D13310F5D404C0441324D494F253C080CD43B8D1C104C0000164B3AAF253C08003EC5152B004C0000164B3AAF253C08040C9FEA29C04C0A8F9303576F253C0802F6F80DF8D04C0E0A1CAB564F253C001F71B4AE87604C07430719734F253C001F22BF2C46304C01C0818FCACF153C0005D376A195604C07CACD822E8F053C07FB9D8BBCD4C04C07075198BF7EF53C0FF167A0D824304C0144DC0EF6FEF53C0FF9914176A4204C068A8809302EF53C0011EAF20524104C038DFC0F5C0EE53C0803D73C5B54B04C0C86D67D790EE53C081F96005956104C02C54743872EE53C08038E94E5C7604C05492E71865EE53C07FFA0BA20B8A04C02C54743872EE53C0FFF7C6E65E9F04C0F0ABDAB783EE53C0018EBB6E0AAD04C0C003413795EE53C001E2E2F141BB04C0F0ABDAB783EE53C07F5B032DADD104C0F0ABDAB783EE53C080A1C08944E404C04049E795BCEE53C07F714D0394F304C0182C9AD21CEF53C080490F90B30005C098B38C6BEAEF53C08120D11CD30D05C090F5D8A590F053C07FE5382B2F0C05C0105CA5210BF153C0800E779E0FFF04C0A42C983D81F153C0FF5679B653FC04C001030000000100000030000000F055840F7BF753C0011E1191B84005C034A64E7101F853C0805D0364054005C08088B03982F853C0803A1C92C53A05C0B40D5436E4F853C0803577755F3205C0ACFACE36D6F853C07FED3A69462205C07CBF640685F853C00180E0D6200A05C05884FAD533F853C0FF3336626EF404C034CA7D3EF6F753C0FFE9C2A188E104C034CA7D3EF6F753C00127470C3CDB04C044F0873D12F853C000C1FFFE15D104C04CA829A328F853C0FF3A08D47CC404C048CC58701DF853C000F2CBC763B404C028DB270CDDF753C0FFC6D17024A104C00421AB749FF753C000E03755CB9204C0F08C38DC7DF753C00056D2C1988004C0ECB067A972F753C0802E46D3F27204C0D84024DE45F753C0807D54511A5304C0BC62787913F753C000D37554414104C0A0F234AEE6F653C0FF87CBDF8E2B04C0A04D1848DEF653C0FF3D581FA91804C0949576E2C7F653C0FF13957C360804C0949576E2C7F653C07FAF4D6F10FE03C088A620B0AEF653C000A9719EDDF203C06891C07E79F653C000831C6404E803C048A08F1A39F653C000BE691AEBDE03C0E897F0F1CAF553C0001373784BD103C0D034485C4CF553C07F42975A45E303C024B12E1D32F553C07F96BEDD7CF103C024B12E1D32F553C0FFE2B04DE40104C068C3EE3D1CF553C0006B3BAFEF1304C068A2C820C9F453C0002E5E029F2704C0FC306F0299F453C0FF9E046F8D5504C0286FE2E28BF453C0001925AAF86B04C0780CEFC0C4F453C0009E6A50579304C0841F74C0D2F453C080CDAD4157AC04C094EA9A25F7F453C000778C3E30BE04C0B05ADEF023F553C07F80D677FCCE04C0D0DDA6BB5EF553C0004ED3FAE1E804C0D895482175F553C07FF1D52688EF04C0F0606F8699F553C001687AF2791805C0F81811ECAFF553C080F584A2123305C00C76CFB7CEF553C080BFDC08924405C030D568B514F653C0FF081915AB5405C0487C604D44F653C0002AC9321E5705C084A620B0AEF653C0FFC826425E5505C0B0AAD613FDF653C080848F52AB4D05C0D06453AB3AF753C0801F4845854305C0F055840F7BF753C0011E1191B84005C001030000000100000018000000C8F9792C23F453C07F8CC76E690504C09CAF6D077CF453C081D05AF957EE03C01C6B9D0CCEF453C001A6ECF4FBD803C0E82091E726F553C08034FF37C5C203C0B0D684C27FF553C080790DCEAEB103C0E897F0F1CAF553C07F759CABBD9F03C0C8863C73DFF553C0004C2EA7618A03C0E897F0F1CAF553C0FFD9BBF5257A03C090C5D04394F553C080B2C8FCC46A03C0F0F8ECBF56F553C0FFAFD2E5CE5E03C088761561C0F453C00165D821F95703C0B8C0218667F453C00045C76D7A6C03C0101CE229FAF353C07F02AFEE868903C094380EFDD7F353C000511AD54DA203C0D85A76FAAEF353C081107D6155C503C0147DDEF785F353C07F39EB65B1DA03C0348E927671F353C08161DE5E12EA03C06CD89E9B18F353C001D4CB1B490004C00C2E2315B2F253C001B63573C51A04C0C4335F3FABF253C0814D2012673404C06CD89E9B18F353C0009B10ED324704C0D0821A227FF353C0814F9B1D623A04C06C4FFEA5BCF353C0FF252D19062504C0C8F9792C23F453C07F8CC76E690504C0010300000001000000640000005461F986B9F753C081FCD9FDADD003C070566CE403F853C000218EFA34EE03C0040639E326F853C001A2E348700204C05C0D6C615BF853C080F2C510FB2504C05C0D6C615BF853C07FA1492A3A4004C0582E927EAEF853C080479830A95C04C0F868AB3A20F953C00032B43B8C7804C0C0E137D784F953C0FFB2098AC78C04C078F09DD3EDF953C000F9C6E65E9F04C0DC821D0F71FA53C08003EC5152B004C00403DD290AFB53C00092ABC62DC004C068955C658DFB53C0FFB8A47E61C804C0B8326943C6FB53C00151DEC1B9C004C0A8C842A3CAFB53C07FC21E4DDEB004C07420A922DCFB53C000BE2EF5BA9D04C0300EE901F2FB53C0FF703C85538D04C00C5BC2DE4DFC53C080BB8358447504C07CCC1BFD7DFC53C07F268FD0986704C04045A899E2FC53C0018330224D5E04C0986D01356AFD53C080229F78755404C05C07B4EE21FE53C0807F40CA294B04C014161AEB8AFE53C081314E5AC23A04C014161AEB8AFE53C000D1BCB0EA3004C03C3367AE2AFE53C081B1F80B872604C004DF5A539AFD53C0FF0030379B2104C0C88A4EF809FD53C000D3016C971B04C0F486759E56FC53C0FF3D0DE4EB0D04C078FF820589FB53C0819AAE35A00404C0F498B6890EFB53C0806D806A9CFE03C064A79D5045FA53C081821FA40CF803C0F489D15773F953C07F4787B268F603C090F7511CF0F853C0FFC921BC50F503C0846C055FA1F853C0FFB8C73D8DE603C0A01F2C8245F853C0018EDE2D36CB03C02844ACC319F853C080B9615CC3A803C0A01F2C8245F853C000AA4C99AC8403C0986178BCEBF853C07F26B28FC48503C08C18783943F953C001810E26CC9103C018E96A55B9F953C0FF35C752DBA903C0ACB95D712FFA53C080D1F0ED56B503C0182BB78F5FFA53C0005CC00A0FB203C018D7296A01FB53C000E05A14F7B003C08CD3CF4580FB53C07FFF1EB95ABB03C0544C5CE2E4FB53C0FF4B1129C2CB03C080ABF5DF2AFC53C07F42975A45E303C0C0DEDB1D68FC53C08032E878F8FC03C00C9D0E19F4FC53C0FFE2B04DE40104C0F8530E964BFD53C0010CEFC0C4F403C0DC1AB6EF8FFD53C0003E5C88A2EC03C0EC6971D263FE53C00038705AB6D403C0940EB12ED1FE53C081107D6155C503C0709C00E259FF53C080C5829D7FBE03C0603B0414CEFF53C0007FF9FB9AC903C0F0CE8FF14F0054C000F361C4CCE503C070011F01460154C0814348B68E0404C0287EBA35E30154C0001FC6DF1E0704C03C2E72E6420254C001F657DBC2F103C0882836BC490254C081F06BADD6D903C02C56160E130254C00058810E35C003C0F894AADEC70154C0007892C2B3AB03C064A02233BA0154C08005A5057D9503C0F0BC4E06980154C0FFDB3601218003C08812D37F310154C080464279757203C018B89F486B0054C0FFAFD2E5CE5E03C0E0F63319200054C0001ADE5D235103C024199C16F7FF53C00015F22F373903C038C953C7560054C07FEA0820E01D03C09024146BE9FF53C001521E813E0403C0280339DADEFE53C07F292B88DDF402C06CAE41CD11FE53C000B933E29CEA02C04C262E4482FD53C00146CB196BCE02C0EC7BB2BD1BFD53C000AF5B86C4BA02C0406013570AFC53C080A8F44CDD9C02C0484AB01AF2FA53C081A67941E29602C0C8AED0CE79FA53C07FED8118F98C02C0F0CB1D9219FA53C001A8C4BB617A02C070867733F2F953C0FF4C68255A6E02C04827DE35ACF953C07FBEA8B07E5E02C070442BF94BF953C08156E2F3D65602C0742305DCF8F853C000644C1A775202C098D62BFF9CF853C081AC4E32BB4F02C014705F8322F853C0FF361E4F734C02C0184F3966CFF753C07FA029C7C73E02C03002608973F753C001826522643402C02C7713CC24F753C001826522643402C0DCD906EEEBF653C0806DC6E8F33A02C06C68ADCFBBF653C0FF5827AF834102C018617A5187F653C07FFB855DCF4A02C0901BD4F25FF653C0FFD87CFDBE5502C0EC2B2D4C67F653C08089FDD6F55F02C0F8B982B957F653C001284DDF557602C05C9327465CF653C07FB0B5B2909802C0B83518065EF653C00016CAEAFDBA02C090D7B75180F653C08085A66CADE002C0C03C6E7AF7F653C080E0287099F702C0C886A74608F753C0FF202F012F6D03C0D0992C4616F753C00190C047218803C000E81B7675F753C0FFD7FC533A9803C01821AB749FF753C00141B2C9F9A703C05461F986B9F753C081FCD9FDADD003C00103000000010000001500000018D4CDB0E4FD53C0009FE40B1B5402C05807B4EE21FE53C0019BF4B3F74002C0B00EE76C56FE53C001826522643402C0D84C5A4D49FE53C0003573B2FC2302C06071DA8E1DFE53C081A6B33D211402C0B8CC9A32B0FD53C07FA2C3E5FD0002C0CC159BB558FD53C0FF12047122F101C048AFCE39DEFC53C07F70A5C2D6E701C0309935BF40FC53C00028A3AA92EA01C034780FA2EDFB53C001E6D5A51EEB01C0A8A71C8677FB53C000069A4A82F501C0D82E90E912FB53C0FFD526C4D10402C0D4C4694917FB53C081BF42CFB42002C090B2A9282DFB53C07F40981DF03402C03C36C36747FB53C0813D5362434A02C0101976A4A7FB53C0807CDBAB0A5F02C0309935BF40FC53C0FFBB63F5D17302C020715B59EBFC53C0FF65F7B6ED7A02C09CD727D565FD53C00040FEFEB97202C0682F8E5477FD53C081F840A2226002C018D4CDB0E4FD53C0009FE40B1B5402C00103000000010000001100000010A64E7101F853C0014162D1D6CE01C018821FA40CF853C07FF725C5BDBE01C0F0593A73C9F753C07FADB204D8AB01C0C855840F7BF753C0FFE59152259D01C088D0E01219F753C081405872B29301C0444962E48FF653C000FDC082FF8B01C00C56564E28F653C07FA331173F9801C0E88854B7DCF553C0818ACB3298A601C0C473F485A7F553C08011C35D31B301C0A8B977EE69F553C000DB1AC4B0C401C0A0A6F2EE5BF553C07FCBFE18D6E301C0B0CCFCED77F553C08036EB4262F601C0EC6425EAE7F553C0FFBCE26DFB0202C0382358E573F653C0817A823215FE01C09C8882782FF753C0FFB02ACC95EC01C0D40D267591F753C001CBC76409E101C010A64E7101F853C0014162D1D6CE01C001030000000100000095030000CCFC0A9C23F353C0812837B4757E08C044ED16328BF353C0806F91970F7608C0902E5295E7F353C08027AEC5CF7008C0A8BAD82B41F453C08119B9F2827108C01C67D25ABCF453C0FFA2D41E297808C0B0C29CBC42F553C07FAA7F96027C08C08438F61CF3F553C00017282E697608C0E0BD43E73BF653C0FF85618AE96B08C058AE4F7DA3F653C081A4DCF49C6508C04CC0116F11F753C000B6080ABE6208C0CCBE9D6207F753C000FAD701E05D08C0E8057555DDF653C00164E28A9B4F08C02494233B89F653C07F75E605943708C058A0942441F653C07FE4B1AD4D2308C068E3F01E2FF653C0802EE472C91508C06CA40F1D29F653C00040E8EDC1FD07C06022D22035F653C001AAF2767DEF07C02494233B89F653C0003A96E276DA07C018CF8944A7F653C001B1E3C72CBA07C03C989E3371F653C081B213FADD8A07C028D3043D8FF653C0FF120B59505F07C06822D22035F653C0FFAA3002463E07C094AC050EF9F553C0011EBDC8FD2307C0108A81D74AF553C0FFAC6034F70E07C08024A1A6AEF453C00041C5BEEEF306C0C8348D884EF453C0002D3057A9E206C004C33B6EFAF353C07F5F0C96E1C906C02049F462D6F353C081ADFF795BB606C02049F462D6F353C0007E536DD49F06C02049F462D6F353C0008E57E8CC8706C028CB315FCAF353C080E10BEB446E06C05C98C1467CF353C08050D792FE5906C08822F53340F353C0009ECA76784606C0105439E11CF353C08051DC79DE3406C0A04A1785DBF253C0008E07A0692706C07004B75096F253C0FF00F6871C1606C0144EFCC78AF253C0813F3B87400606C02CEE8D5564F253C0FF503F0239EE05C0ECD7645A32F253C08095D28C27D705C058DB499DE1F153C0013936AB37C905C004F557DBC2F153C000B1721EB5B005C0787BDB2ABBF153C08056F0155EA005C068AB1264CEF153C0FFFEA1BF388B05C0FC248F14D6F153C081411B718E7605C078F83C1E72F153C07F85AEFB7C5F05C0009CB3EEFAF053C0818E3039795305C0F8420F0233F053C0005DBB021C5005C0B49E2ED8E8EE53C0FF0C73EF5E2805C028394EA74CEE53C0809C165B581305C06C493A89ECED53C080D774D78CEE04C064881B8BF2ED53C0804A019E44D404C05C45BF9004EE53C000AAF8FCB6A804C0B459266B8CED53C000C0BD96AD8A04C024F4453AF0EC53C07F46DFC4AA8104C0884B090F66EC53C0000EB17A277704C090CD460B5AEC53C0002476141E5904C07CC9CB1272EC53C07FA70656CE2604C014F0CA4108ED53C081A1B44A830304C0804DB581D4ED53C07F69860000F903C0AC1CF1DBF4EE53C0806004C3030504C0D0A8D03B27F053C07FD060570A1A04C02CC35E8105F153C0010E50C08B1E04C0CC6B9BAC8FF153C000B90AD1C60E04C03C8AA4EA55F253C0003158B67CEE03C0DCF3FF13DAF253C000471D5073D003C0A8E78E2A22F353C0FF60A30868AC03C098E313323AF353C08130F7FBE09503C06C1AFF4270F353C000FC89D05B8503C0384D6F5BBEF353C081F276A6126803C0F8FDA17718F453C0FF1E92C64C5503C098281C9F96F453C080D3CE14843903C0641CABB5DEF453C081E011717E2703C04014B5C40EF553C0818CCC81B91703C0541830BDF6F453C0FF9DD0FCB1FF02C08824A1A6AEF453C000520D4BE9E302C0AC2C97977EF453C081A4C14D61CA02C0AC2C97977EF453C07FBA86E757AC02C05C5B8CB7E4F453C0FFF4E4638C8702C0405396C614F553C080C9F975036B02C07CE144ACC0F453C080081911364002C090E5BFA4A8F453C0FF7AA5D7ED2502C06C9EE8B1D2F453C08040E6A01DF201C0405396C614F553C0FF5E2D7810C801C00004C9E26EF553C07F9E4C13439D01C0ACB08006E1F553C0004EC8427C8701C05C1E57284DF653C0FF3A33DB367601C0381661377DF653C00150F8742D5801C078652E1B23F653C000FCB285684801C0BCF3DC00CFF553C0804E6788E02E01C0BCF3DC00CFF553C0FF9B5A6C5A1B01C0BCF3DC00CFF553C0000765F5150D01C088E76B1717F653C0019608610FF800C07022D22035F653C080A34BBD09E600C0A82E430AEDF553C081739FB082CF00C0DC3AB4F3A4F553C0807C21EE7EC300C07C2026AEC6F453C0807C21EE7EC300C02488D564DCF353C0807C21EE7EC300C08861D63546F353C080FE81FD7DC000C0C86D471FFEF253C080C553B3FAB500C008BD1403A4F253C081503600F6A600C0D471C217E6F253C081218AF36E9000C08861D63546F353C000AC6C406A8100C01845796AEEF353C0811CC9D4709600C0C4B24F8C5AF453C000B77F6AB39E00C0304F1BCE2CF553C08096A7A6739F00C07022D22035F653C0FF9A68C5719900C0F4445657E3F653C081305E3CB6A700C094AEB18067F753C00144F3A3FBB800C094AEB18067F753C081739FB082CF00C0AC346A7543F753C00021EBAD0AE900C0C8BA226A1FF753C081716F7ED1FE00C0D8FD7E640DF753C000606B03D91601C0C4F9036C25F753C001B0EFD39F2C01C090ED92826DF753C08141242CE64001C0481C88A2D3F753C0017A5276694B01C00C4FF8BA21F853C0808DE7DDAE5C01C004CDBABE2DF853C0FF3A33DB367601C0D05136229FF853C0810F7B1A8CA001C088D7A59CF3F853C080D0386C4ECE01C0D05136229FF853C0FF91F6BD10FC01C0B0D9D64441F853C07F4FC563171E02C020CCC6A74AF853C081BF95ABF13E02C0D06A25B43EF953C0008E8BDFFB4502C06C66C363A3FA53C000DB893D284702C03C4BA329B6FA53C080D4ABE5B02F02C0C89C03D87DFA53C08016DD3FAA0D02C09C81E39D90FA53C0FF91F6BD10FC01C02CA8E2CC26FB53C0018B186699E401C00462611308FC53C07F6E24D462DC01C014370094D6FC53C07FEC2CFE84D601C0C4BC6F0E2BFD53C0006B3528A7D001C0A876EE540CFE53C0007213801EE801C054FC5DCF60FE53C07FFDD7592F1102C0EC225DFEF6FE53C001F09F77E73702C0C8C3ECB238FF53C000457C2D8B5002C0049BBCDB54FF53C0FF4A5A85026802C0C8C3ECB238FF53C07FBB2ACDDC8802C0C8C3ECB238FF53C0800F078380A102C0F410EB10650054C000DFFCB68AA802C0185EE96E910154C0007CE81E9FB602C07C66CA8CFE0154C00130609BADF202C0905B3DEA480254C0813F755EC41603C00858E3C5C70254C07F6A5E6E1B3203C0087909E31A0354C0812C81C1CA4503C0E4C5E2BF760354C0FFCC9AB4696403C0C012BC9CD20354C0FF59156E988903C074B7FBF83F0454C081DE5A14F7B003C0B00B0854D00454C0000A44244ECC03C0C821A1CE6D0554C0002DF820D5E903C00CE0D3C9F90554C0804342F7BB0B04C04C34E0248A0654C0805A8CCDA22D04C0B4E7857D600754C0FF540257495804C0F05CB8F5430854C081E8B123487B04C0CCEBDD0C460954C0011AD0466F9404C00CEC5C42780A54C0FF9A2595AAA804C0BC909C9EE50A54C080E7170512B904C054CBB55A570B54C0801446D015BF04C088D6C1323F0C54C07F07DCA975C304C0CC94F42DCB0C54C001F33C7005CA04C01C532729570D54C0FF30C5B9CCDE04C014957363FD0D54C0009846BBC7FB04C094133C2A5B0E54C0FF34EDF6D90A05C038B87B86C80E54C0FFA55FA8151B05C05C408F0F580F54C0FF14DC425B1F05C0A0D95617D30F54C0FF7C6CAFB40B05C02095861C251054C08031F7DFE3FE04C05856F24B701054C0FF79FB8CC3F904C06C06AAFCCF1054C0010A04E782EF04C09CC7152C1B1154C0009A0C4142E504C0B877CDDC7A1154C000BA1DF5C0D004C03833FDE1CC1154C080DBA9B43AC204C074CCC4E9471254C00148AB4385C004C0D4764070AE1254C001039DAD9BD104C04CE3B4922C1254C081E110EE21E004C0007291B2811154C000C1842EA8EE04C0B8006ED2D61054C0817A7698BEFF04C014348A4E991054C0805AEAD8440E05C058CD5156141154C00016574E562505C0CC27858DDA1154C080634729223805C09866195E8F1154C0808ABF16884105C0180CE626C91054C0803E4A47B73405C0B8890EC8321054C0013B5430C12805C06C8F4AF22B1054C00042BB69A84605C084A0FE70171054C0806D1F85FA6705C0A0D95617D30F54C000E40259278A05C0201E2712810F54C00159E62C54AC05C0D823633C7A0F54C081F24BD7F0CB05C080C8A298E70F54C00042B7BDB7E405C0180CE626C91054C080B03358FDE805C0A4B5D440631254C001AE3D4107DD05C0640ACC4D301354C08139D578D5C005C0E43C5B5D261454C0010FEC687EA505C0445E36EE301554C001777CD5D79105C0EC79D554421654C080058F18A17B05C0C0A6283A3F1754C0FF91A15B6A6505C07CFB1F470C1854C07F1FB49E334F05C0A45B8FA8CB1854C00162CC1D273205C0D834F722FA1854C07F0F223B862705C05C7A9D81211954C07F658E796A2005C088D9367F671954C07F658E796A2005C0D497697AF31954C000C0EA0F722C05C0541F5C13C11A54C0016A7ED18D3305C060561BABB11B54C001D48949E22505C0BC9F9A638C1C54C081DD03185F0E05C05C8626FA9F1D54C0004B544B60EB04C00C2B66560D1E54C0FFC9FEFC24D704C0A4657F127F1E54C0001C7BE3E5BC04C0A0A7CB4C251F54C000DCF2991EA804C03C030B26EA1F54C080767198238B04C0944C8ADEC42054C07F4B8888CC6F04C070BA89D8732154C08105CB2B355D04C0482889D2222254C0814ADDEB554704C0488BFB291C2354C080F2C510FB2504C0CC74D457EC2354C081EF2D41931004C078CE33AF902354C081D89AE7670A04C01C32A729542354C0FFB4676112FC03C09C45F557012354C07F8B7CC11BF403C0646936DB912254C07F9110688DEA03C00CA0785E222254C080FE1A1892E603C0485AC7D78F2154C0812D8CC922EE03C09884D4182D2154C080C181191EF203C01835FCFAC32054C00056776919F603C0F038A4023B2054C081E7902C44FD03C0355619C8BE1F54C080ADD3BAA00504C0B88381E2251F54C001117CCC3A0504C044B1E9FC8C1E54C0FFB4676112FC03C0207BDE9C301E54C080C181191EF203C0A88E2CCBDD1D54C080FC3E8BC1E903C04CF29F45A11D54C07F12BBE137DC03C0243F54AD741D54C0FF835938AECE03C0F0C5BB7C1B1D54C0FFC954D58CBF03C048B61556E51C54C0813ECFB8D3AE03C054967CDACB1C54C0804FA18A809E03C054967CDACB1C54C001FFCA4A938E03C0F0C5BB7C1B1D54C081DA97C43D8003C0E0487B444B1D54C0FF4E0413AD7803C0B82587EF671D54C0FF5498B91E6F03C0243F54AD741D54C0803AC7D1335D03C02CBC94E5441D54C080B5C7C6144C03C0A409967BC51C54C0005C8FE8BC3F03C01CBABD5D5C1C54C081D2D7C3FC3403C09407BFF3DC1B54C0FF44761A732703C0AC71E820341B54C0FFBD9A82831903C0343C2AEF841A54C00125FBADBE1203C02020397BE21954C00125FBADBE1203C0CC7095EA2C1954C00125FBADBE1203C048D8B06C671854C081F57B67561403C08492FFE5D41754C0003039D9F90B03C0B0CF0D27721754C0FF1368F10EFA02C034803509091754C0FF2716508CE602C0B0305DEB9F1654C080D0B9FE04D702C0B0711334B41554C0FFDDD3B610CD02C00C26E31DC21454C0814702DA44CC02C0C4905979C61354C000794F18A6D002C0E4ED00367D1354C08004E3C936D802C00865C2DEED1254C07F5E1BA88EE402C0B4B51E4E381254C000F5EC845AE502C04446ADB4B51154C0FF6D11ED6AD702C0E8A9202F791154C080B030FD78CB02C02CC795F4FC1054C07FC202CF25BB02C0042E64488A1054C081D4D4A0D2AA02C08C41B276371054C080B27DA74D9902C064455A7EAE0F54C08092F4A5C18D02C0E0F58160450F54C08002B76F678302C048631C72DF0E54C0801FC76C4F6C02C00053291DFC0E54C07F31993EFC5B02C018260E31420F54C0803909723E4F02C0106F1A919E0F54C0FF12FA5E184402C044E8B2C1F70F54C000B7E5F3EF3A02C018ABA4805A1054C0FF99387F342C02C0F4EAD6778D1054C0FF125DE7441E02C070E40ABA801054C000C63EC1F80702C0A03B33E7D70F54C08196CD0F680002C0A0FFA8F71B0F54C08004B44C3DF901C0184DAA8D9C0E54C0807DD8B44DEB01C014EA8341860E54C080CD117D67D501C0F029B638B90E54C07FD681B0A9C801C00053291DFC0E54C0FFB41C224DC001C08C1F4273350F54C001BE8C558FB301C030CCC14D550F54C0FF79D0CDAD9901C08C1F4273350F54C080BA21E6C28701C0D42F35C8180F54C0FF9C7471077901C0DC925B142F0F54C07F7841EBB16A01C0581CE7996B0F54C0802B23C5655401C04C9FA6619B0F54C0003B190A424701C05465F3F9C70F54C080150AF71B3C01C040858C75E10F54C07F5A0594FA2C01C0B0B8731FA80F54C0803C581F3F1E01C084A2013B650F54C0004A806C220B01C01489347D580F54C080F8A92C35FB00C0BC35B457780F54C0FFAB8B06E9E400C0945BCC62F10F54C07F5D9153CCD100C0F087B02B771054C0009CF84939CC00C05C0D7F9CBC1054C080E20C72D5C400C03C0A23C5F91054C0FFA2AE5786B400C040F8DD95591154C0808AE75FD7AA00C01826CB5DEC1154C080A1F43191A900C0A0EC1A4B1D1254C0FFA2AE5786B400C08C0EC01A481254C08059E10F9FB900C088009393CA1254C080DD992C95B700C0A073BDEE461354C000CFFC8D1DAC00C0C00BE9F0B01354C0804E4265D39C00C0D4C5B9C2451454C081CACE1C3E8B00C0D8AF5CEB821454C08044A2B45D7700C0181EB3CD7C1454C0FFAD93D9A46B00C0743EAA31C61454C0812668776E6000C038856162611554C000C228AD645000C0F404C650C71554C07F6E84757E3A00C08C972B3F2D1654C001921A84002300C04417902D931654C0FFDF8554210700C0B46CE7DA5B1754C00266365317DCFFBF242565D43A1854C00145BBE662C7FFBF00A121BB291954C0FEF4E4A675B7FFBF389F503B9B1A54C00196024454A8FFBF94CB3404211B54C000B136B46B94FFBFEC40252D031C54C0027E4CFE366AFFBFDCEF6FB4691C54C0FF9D9BDF2B48FFBFC061CEFC731C54C0FFBC103C9243FFBFC063E91D101C54C000C71E259F1CFFBF4494A552E31B54C0FFE8948E0CF6FEBF4494A552E31B54C0020B0BF879CFFEBFE0975935FC1B54C0FF2B4C4497B6FEBF142CC5230B1C54C0FE1CD1E37B97FEBF4494A552E31B54C0FE322D95DD7AFEBF9C30F698A71B54C0025439C4AA6FFEBF80D0FAC1841B54C0016F6D34C25BFEBF18D4AEA49D1B54C0FE7CBC091E44FEBF3034AA7BC01B54C00069FFAFAC37FEBF94CF7D2F011C54C0FE6E41A90225FEBF789B0D18151C54C000C0A8DCF8F6FDBFAC2F7906241C54C0FFE05363B6C2FDBF78281141F21B54C0FF1D335A8B7AFDBF84A46F024E1B54C0FE247553E167FDBF747961D59A1A54C0001C9D942B5FFDBFD0E8A9C9A41A54C0003F13FE9838FDBFB4E0C471EF1A54C0FF536FAFFA1BFDBFECA0BB1F351B54C0014D012BE5F7FCBF9C046BD9701B54C00170779452D1FCBF50E47854081B54C000BFDEC748A3FCBFA85DA0C5CE1954C0FFACC0C5C76DFCBF649E26AA0C1954C002E15DC34638FCBF1C52A9656D1854C002241579D1F8FBBF3C8F7B67921754C0010BB57DFAD5FBBFE06F0675AD1654C0FE2CF6C917BDFBBF80D1DEA6001654C0FEB621212591FBBFB0ABC69B871554C0FE192DBBEB6AFBBF2C5CEE7D1E1554C0004E959B1A43FBBF1089096AD81454C00040DE6B3B27FBBFB4EC7CE49B1454C002DE43EF781EFBBF504358E3451454C0009FDCF80B24FBBF6CA0FF9FFC1354C0FF2A6215C534FBBF987AE794831354C002D0C6AE404EFBBFAC1142B90D1354C0FEF9B14E3756FBBF8CDB3659B11254C00025AAFB233BFBBFAC38DE15681254C000DA8BD5D724FBBFB4B51E4E381254C0FF28D332C905FBBFD8F05507ED1054C0FF3A976F9EFEFABFE0F58160450F54C00296DDE2CD01FBBFA4B69C97BF0E54C000BA10692310FBBF74A02AB37C0E54C001072F8F6F26FBBF40279282230E54C0016D8125D328FBBFA8942C94BD0D54C00076F158151CFBBF741B9463640D54C0FF28D332C905FBBF84FBFAE74A0D54C00276627619EDFABF885E2134610D54C0020AADB969D4FABF28F18622C70D54C0FF543CFDB9BBFABFE4D3115D430E54C00055AD1ABE8CFABFFC091DBD9F0E54C000E35B6E1C68FABF1CB0D0D9B20E54C0FE9EAD7B1245FABF6823EA7AAC0E54C000EF49CC5809FABF6823EA7AAC0E54C000E1929C79EDF9BF4000F625C90E54C0FF1E16BD95D5F9BFF4D5E8E42B0F54C0028B206D9AD1F9BF60E23332980F54C0FE81B03958DEF9BF2C084C3D111054C000A7E3BFADECF9BF5804A4359A1054C0FF3E91294AEAF9BF881A161ADD1054C0FFC9876307CCF9BF587AE18C291154C0010CA77315C0F9BF54C3EDEC851154C001F69B3AA39EF9BFC84C7972C21154C00058A7D46978F9BFF0E5AA1E351254C0024FA8BE2B56F9BF5CC5C4746E1254C0FF44A9A8ED33F9BFE4686AE6641254C0012AE655DA18F9BF1C6CC5BF2E1254C001A5B442B40DF9BF981CEDA1C51154C002CF9FE2AA15F9BFB0166E12661154C0FE5FDD180520F9BF84B7EFCDC61054C0FF8B80D29C21F9BF2C084C3D111054C0010A4FBF7616F9BF609927D23B0F54C0FF0497A5D51CF9BFA4B69C97BF0E54C000EB6235BE30F9BFE4C5AD752E0E54C0FEE20749C73EF9BFACD92B08B20D54C0FEE20749C73EF9BF04D7F4B71C0D54C00011F9125037F9BF087FDE38AF0C54C0FF173B0CA624F9BF90830FAE4B0C54C000479610CF01F9BF282FAD11F70B54C0004D0D2775E1F8BF10CFB13AD40B54C0FF827507A4B9F8BF08EDD812F60B54C002A5EB701193F8BFB85FA585420C54C001E26E912D7BF8BF10296302B20C54C00221D6879A75F8BFFC9108DE270D54C0FE919851406BF8BF24455476540D54C000D4B7614E5FF8BF18AAEC65620D54C001BA85D15324F8BFD06E1489440D54C000F6C5703805F8BF4C12CD943A0D54C0FF173CDAA5DEF7BF4C3E5854710D54C000F8CE02C9C0F7BF4C12CD943A0D54C00018104FE6A7F7BF844E2204DC0C54C002531BD17A96F7BFB4B60233B40C54C0026D845EE274F7BFB4B60233B40C54C0024F4CA45549F7BFF01EE3618C0C54C0008B8C433A2AF7BF0C535379780C54C0007D11E31E0BF7BF2487C390640C54C0FEC46B3A0FE2F6BFC893D95DB60B54C0FF7F5AF0C8C6F6BF20F4DBF3360B54C0FE913A574DADF6BFC871695AB40A54C000DDC99A9D94F6BFE0DB92870B0A54C001386501227BF6BF609595D0C40954C000C573C0F25BF6BFC4C3B9BB8B0954C0020FB75C6023F6BF8C3BEE59AC0954C0FE8889EED506F6BFF43D5896ED0954C0FEEB94889CE0F5BFC0C7D163AE0954C002509F1CB9B1F5BF48492D99A50954C00217BB177487F5BF00F02DE4650954C0FF8F4208B153F5BF54D9B8AA1E0954C002032B6A0A2EF5BFACEA864FD50854C00099329DC11AF5BFF0F8CC780C0854C0FFD7CB7E2910F5BFC0B98C1C5B0754C0005613623312F5BF30E4985FFF0654C001F804B66E1EF5BF98513371990654C0FF85A2573B2EF5BF6CD37CEE140654C0FE81A4638F3FF5BFD43CFF578C0554C0FEE72349402FF5BF0CDB27912E0554C0FF744A8D240FF5BF880CA853B80454C0FE6AF0B6B9DEF4BFE4AD2C641D0454C0FF48443A34C3F4BF0C25593B550354C0FE41D3DF399EF4BFE0F165B6EC0254C0005B0750518AF4BF84FE7B833E0254C0FE872D372A75F4BF9832EC9A2A0254C0016AC05F4D57F4BFD49ACCC9020254C0028529EDB435F4BF701ADF6D770154C0FFB891CDE30DF4BF581B5C00FB0054C0FFBFD3C639FBF3BF902B26B0650054C0FFF570C4B8C5F3BFFCFBE60D160054C0FE1886851676F3BF749F9F190C0054C0FE253F951243F3BFC8677B1F070054C0FF4EC2DA8517F3BFB4AF69C976FF53C0FE95E71426FCF2BF1CACB5E65DFF53C00199866C16D3F2BFCC0F65A099FF53C00293E3CAB0BCF2BF3064C73CEEFF53C0FEB22417CEA3F2BF606B2F02200054C0FFE757DAAC89F2BFFC2772CD4C0054C0FFC1DD26CA70F2BF78CB2AD9420054C000CF2CFC2559F2BF606B2F02200054C001F16D484340F2BF98A78471C1FF53C001FE87004F36F2BFA0DC711B31FF53C0FE0495DC5431F2BF28898C1160FE53C0FFE388AD873CF2BFE0C912F69DFD53C001F74507F948F2BFE471FC7630FD53C000E31E73E757F2BF1C82C6269BFC53C000CDC2C18574F2BF549290D605FC53C0FFB3C36EBE7AF2BF0CD316BB43FB53C000E9F6319D60F2BFFCD3934DC7FA53C0010B387EBA47F2BF208DC41048F953C0024D245195FAF1BFEC74B7E394F853C0FF3AD131C4D2F1BFACE1C88709F853C0027DE98F5EBCF1BF0026034F60F753C001914541C09FF1BF84A6928558F653C001771A63396FF1BF54739F00F0F553C0009A90CCA648F1BFD8EACC4CAFF553C000F546D5F802F1BF44BB8DAA5FF553C0FE02CBC7A4DDF0BF7CCB575ACAF453C0010500E5F4CFF0BFD00F922121F453C0002D4E0D18B2F0BFB4100FB4A4F353C00054D1528B86F0BF98CB78217EF353C002072ED09A61F0BF942AF0CC66F353C000B0B55ED613F0BF6C5A57CF20F353C0FCB908CF5BA7EFBF542285EFB3F253C0032C3D2A967CEFBF2CCEC99F10F253C0FDA55EF1B355EFBF181158DBC2F153C0020E0558B60FEFBF10F56E6B8CF153C0017A69AD0F9BEEBFFC96745227F153C0FC5BE5F7A041EEBFBC2F92C98BF053C0FC453B1AF9EFEDBF981DE82217F053C000A66620E08AEDBF9C739D97C1EF53C0FF097F92AA29EDBF68E692D52DEF53C004EEA53776A5ECBF44D4E82EB9EE53C003DE894E066FECBF20C23E8844EE53C0FFD79CE2226BECBFF46D8338A1ED53C0FEE376BAE972ECBFE00F891F3CED53C0FFF392A359A9ECBFB02307B2BFEC53C004FCC120E6DBECBF848D3AB9EDEB53C0FD7525F9ACE3ECBF54A1B84B71EB53C0FCF5332CAEC0ECBF240BEC529FEA53C0FC7971DC3BD0ECBFFC15A8AEE4E953C0017C126590E7ECBFD06B37EA96E953C0FFF392A359A9ECBFB0D4ED5E41E953C0FFD79CE2226BECBF8CDFA9BA86E853C0FD4F1D21EC2CECBF602C77BFFAE753C0FD333AF4D1EAEBBF387944C46EE753C002AABA329BACEBBF2036B5C909E753C0FEA773A8B266EBBFF454111892E653C00336FD1AF562EBBFE49B46F005E653C00306DA9B1A43EBBF3C43946973E553C0FD555AC2B119EBBFC47D7EF47AE453C0FDBF809C6503EBBFF0BA8C3518E453C0041464E948F0EABF00EFC00D8CE353C0FD513CFDB9BBEABF24D62A73B3E253C004B6F2A32BB2EABF484DEC1B24E253C0FDD76D10E0C6EABF58CA2C54F4E153C002EA6B3C5C0BEBBFC4603A4AD1E153C0FF9BC0CE5C36EBBF90847BCD61E153C0005ABDE8FD2FEBBF20150A34DFE053C00430D2480728EBBFDCBB0A7F9FE053C000225508CF57EBBFDCBB0A7F9FE053C0FC2FE30009A9EBBF1CB2E3E7C8E053C0FD8F544626E7EBBFACE1228A18E153C000F228B28F3BECBF58F1C8B04EE153C0FC798597A381ECBF88073B9591E153C0046CFB4975D4ECBF28B4BA6FB1E153C0FEF1572F891AEDBF7827D410ABE153C001226EA16D5DEDBF882155814BE153C0040E812DF399EDBF786DA8ABEAE053C0FECB57CBC8D9EDBF3CF72179ABE053C002924451FB18EEBF9C295E0C95E053C001EEDDB19BA3EEBF18375470DEE053C0FF273CCFA20EEFBF6045D24354E153C004D49985BA3BEFBF78D158DAADE153C0FE9B5D304B9AEFBF446978ABD5E153C000A641181214F0BFA4044C5F16E253C0005002266639F0BF88FC660761E253C0017D5498FE5AF0BFBC64473639E253C0002DED640889F0BF4095036B0CE253C001059F3CE5A6F0BF749C6B303EE253C0FF11E57FB0D3F0BF3C8CA180D3E253C001F06E1643FAF0BFCC3F8261C7E353C000CF2DCA2513F1BF88D682C5FEE553C000D50589DB1BF1BF1029EB3C4CE753C000DBDD479124F1BF6C1CD56FFAE753C0009E9DA8AC43F1BF04A42A91B7E853C0FE6F0D873374F1BF00FC401025E953C000563ABF2BB1F1BF6850A3AC79E953C00041DE0DCACDF1BFC4438DDF27EA53C000618002F7DDF1BFF4959C4D26EB53C0010418E987F1F1BFAC15013C8CEB53C001BB5EF5DB02F2BFE88B876ECBEB53C001ACF2D94132F2BF2CE4807902EC53C000DD81CF494EF2BF14513EFD9AEC53C001DCB5F1186FF2BF9C9394AA63ED53C0013998543A7EF2BF28469314E3ED53C0018C6E94278EF2BF1CC952DC12EE53C001F6072728B9F2BF8C5F60D2EFED53C00172C9060CD1F2BF7C7FF94D09EE53C00053DD7C53EBF2BF801EAA89DBEE53C000B0BFDF74FAF2BFDC4A8E5261EF53C00092D355BC14F3BF38E71AD89DEF53C0FF9BD26BFA36F3BFBCEDE695AAEF53C002FA5FDBC662F3BF9C7625ED39F053C0FE0036BA5FBAF3BF703917AC9CF053C001731649FD0DF4BF04CC7C9A02F153C0FF9A90CBEF44F4BF2CCEC99F10F253C0FEFCC46BD8B3F4BF90E8DE2338F353C0FEDCBC9ED33FF5BFB4A4D35502F453C0FFFA40544299F5BF00C927A3EBF453C0010CFEC506E7F5BF44B42C7EE4F553C0009DB6D6AF15F6BF503EB25680F653C0020A2C822A5EF6BFD0C6840AC1F653C0FFEF58BA229BF6BF8456BF8333F753C0FEDAC7EB70C5F6BF65C1D602A1F753C002AB02ADA703F7BF24A10D23B1F753C000F64D5FA4D7F7BFC84D8DFDD0F753C0FEA9AEFC5FF9F7BF581AA6530AF853C000870A59061AF8BF581AA6530AF853C0012E53C8D245F8BFC84D8DFDD0F753C00165F597A869F8BF5CD199F3ADF753C0028570045D7EF8BF2804346FC7F753C001CDD610089BF8BF1824CDEAE0F753C001743BAA83B4F8BF203EE7D69AF753C0FE6F1273DEE9F8BFB4319C892EF753C0FE6B0566E80CF9BF5432E9B7DBF653C0005A25FF6326F9BFE856419FF7F653C0017879CDBA4DF9BFB8B400BE32F753C0007AED18A563F9BFEC2A87F071F753C0028845E3BB82F9BF78304D0476F753C00116E48A329BF9BF48A0515251F753C0FFA18232A9B3F9BFC4ACD06DEDF653C0FFEC4D71F4F7F9BFD08E4346E5F653C00175EE24BF21FABF005A9D76BAF653C000EC381AC73DFABFF8896FCD62F653C0FF8148FB2952FABFA8614819D4F553C0001BCA1B236BFABF2493C8DB5DF553C0000E5CF43489FABF4869F3BBEDF453C0FF4CCE62BFA5FABF84F1BE1DCDF453C0FFC41858C7C1FABF60C3720215F553C002E9A08A9CDFFABFE04B45B655F553C002AD2BCE670CFBBF145C0F66C0F453C0029158066049FBBFE44302390DF453C0029D0884CB5AFBBF54BCAC1750F353C0FE5AF0253171FBBFC8EDE5DEA6F253C000479474CF8DFBBFE09DB4B7EEF153C0016F0E28B2A6FBBF84AACA8440F153C0FE2CF6C917BDFBBFA45A995D88F053C0FE38A64783CEFBBFC036F3F506F053C0FF31644E2DE1FBBF78FB1A19E9EF53C001E909F73C0AFCBF609B1F42C6EF53C0FEB1F92C8D9FFCBF744BEE1A0EEF53C0FF96266585DCFCBF4C448655DCEE53C0FE5AB1A85009FDBFA088C01C33EE53C0FE380622933DFDBF3C345E80DEED53C000399CE7F258FDBFD8988ACC9DED53C00210E4842F92FDBF78FDB6185DED53C001BAA49283B7FDBFA8390C88FEEC53C0009F3B051CD9FDBFE07561F79FEC53C0FEC5EAD54EE4FDBFCCBD4FA10FEC53C000A3A98931FDFDBFB8BECC3393EB53C001B224EA4C1CFEBF88FED5854DEB53C002700C8CB232FEBFD89A26CC11EB53C0FE54D81B9B46FEBF78FF5218D1EA53C000417C6A3963FEBF240BEC529FEA53C0015FE9411681FEBF94DBACB04FEA53C0FE328E3DEDA3FEBFE04B7237DDE953C0FF04685614B9FEBF5C9714C465E953C001033339C4C6FEBFE0C7D0F838E953C0FF1018D47FCAFEBF380C0BC08FE853C0021EFD6E3BCEFEBF8C7CD0461DE853C0FF1E328C8BC0FEBF885DB45D87E753C00075AD4DFB97FEBFF02D75BB37E753C0FF868DB47F7EFEBF00D2515062E653C0003E0B7E2574FEBF646688BE56E553C0FE0714BBFA6CFEBFEC30CA8CA7E453C000B83D7B0D5DFEBF24EB180615E453C0FE6A1F55C146FEBF00EFC00D8CE353C000505C02AE2BFEBF9CFC8FACD9E253C0FFA43F4F9118FEBF20EE6DD784E153C0FEADAF82D30BFEBF8CE5CA918FE053C001D59A22CA13FEBF40ED1AA17DDF53C000F25D75DD2EFEBF349776C507DF53C0FE930AF5B74EFEBFACE4775B88DE53C0026CAE37BD75FEBF84E81F63FFDD53C0FE15CBEAD988FEBF1CF6EE014DDD53C0016C3D1AB9A4FEBF8C29D6AB13DD53C00183647DDAB3FEBF544D172FA4DC53C001B196196EE4FEBF8C0766A811DC53C0007B832C94EFFEBFB08BA9C122DB53C0FE38641C86FBFEBF80C904316DDA53C001893A5C730BFFBF0CBDB9E300DA53C000827535DC34FFBF40FAC7249ED953C002C52328E657FFBF4C3B7E6DB2D853C0007A94E49570FFBFE0E526C0E9D753C00091BB47B77FFFBFE8195B985DD753C0FF010DF458A4FFBF38FD1CF60DD753C00110A8F988D2FFBF1401C5FD84D653C00135868C89FDFFBF28FB456E25D653C07F37E2A5A81600C0F481AD3DCCD553C08150D700C32B00C0B0C5873C76D553C0009DF5260F4200C0948F7CDC19D553C0FF876B3BC15800C07CD6B1B48DD453C0817875F6E46500C088F0CBA047D453C07FF6EEEF697700C0F0C08CFEF7D353C001CAE8ADA59B00C0C0AA1A1AB5D353C00029CB10C7AA00C0589ECFCC48D353C081A820971CB900C078159175B9D253C081BF396566D100C080CC84155DD253C080857CF3C2D900C00C5D137CDAD153C0807A3EC887E000C0D8E37A4B81D153C0FFB4EDA453E100C02064165D1BD153C07F542FB561D500C0F467BE6492D053C0019ED4D609C900C00CFF18891CD053C081CD531D72C700C06C79350B57CF53C0008A340D64D300C00CEA2AF6BACE53C0FFAB8B06E9E400C02847D2B271CE53C000A14DDBADEB00C084514678F5CD53C00000303ECFFA00C01C45FB2A89CD53C000EE6B01FA0101C040BCBCD3F9CC53C080253F51F50501C0444B65F673CC53C07F630853DE0D01C0A999FFA14ACC53C07F119F874F1001C0F826332FFECB53C0FF9F0031D91D01C08C1AE8E191CB53C000C8EBD0CF2501C0543E296522CB53C081969E926E2101C0B80EEAC2D2CA53C000E31F41E71101C0E44BF80370CA53C080BEECBA910301C06499F999F0C953C0FFCB06739DF900C0A0B66E5F74C953C07F2EAF8437F900C080BA1667EBC853C07F2EAF8437F900C0F86A3E4982C853C080C5806103FA00C03C88B30E06C853C00000303ECFFA00C0501F0E3390C753C001F4F112940101C018EF816293C753C07FE7D75A880B01C0B838DBF09CC753C0803F34AC0F1B01C004ACF49196C753C081996C8A672701C0E86867C199C753C0FFB619FF223601C01CE2FFF1F2C753C000D970F8A74701C0280B73D635C853C0FF294738955701C0280B73D635C853C08111EF544E6801C048681A93ECC753C080D731E3AA7001C004C7405FF9C753C0FFC1A021238501C0045E03760EC853C0003F494EAC8A01C01CF47F8320C853C080E32B72698F01C010333CA294C853C08104BF4A949E01C0040AEF8454C953C08077F440DD9C01C0A83B05AF8CCA53C0800DC61DA99D01C0405EC2E03BCB53C0803F21F1E19801C008A47367CECB53C08086EA85B98F01C0346618F883CC53C000B669CC218E01C09C58495936CD53C000E7B60A839201C02081851A45CE53C0817E88E74E9301C0006DEABDEACE53C0FF50E52DB79101C0F0C80D29C0CF53C000B48D3F519101C0E4AEF33C06D053C0803F21F1E19801C088F84CCB0FD053C07F6CB615A2A301C08095267FF9CF53C0FF90E99BF7B101C0E04BCDF0EFCF53C0FFE39B68B5BE01C0A86F0E7480CF53C0817891B8B0C201C09CD05D38AECE53C0FF4AEEFE18C101C0C8471FE11ECE53C081E8538256B801C07CFBA19C7FCD53C07FBF68E25FB001C07CBF17ADC3CC53C07FFCF34BFCAD01C0E846CCAA17CC53C001BE8C558FB301C01421B49F9ECB53C081E8538256B801C0104850FCF8CA53C0FFECFD0620BB01C0F46512F029CA53C081E8538256B801C0E8C661B457C953C0FF5808B724B701C0D0905654FBC853C0FFECFD0620BB01C08837579FBBC853C0803DD4460DCB01C0A835EBD9C3C853C080F24403BDE301C03047FDC5F1C853C080F24403BDE301C028CABC8D21C953C00014AA9119EC01C0F08CAE4C84C953C000CCD2676AFE01C084AE8907BFC953C000B7F6CE000C02C068A6A4AF09CA53C0018FDDC32D1C02C06CFEBA2E77CA53C001198753163002C034C265BFD5CA53C0FF11455AC04202C02C356296F8CA53C000018AA5095602C0E0C49C0F6BCB53C081D9709A366602C0283DA51341CC53C081E2B438477302C070A408B095CC53C000529492B87F02C0549C2358E0CC53C0015CD830C98C02C088308F46EFCC53C0014EBE78BD9602C0EC734C7BC2CC53C07FAAAB5B6DA402C0A064FF5DDBCC53C001B3EFF97DB102C034C0C9BF61CD53C080964FAA0BC102C0C0BA1BB841CE53C0811F2E5744C702C0B4B0C4BC94CE53C07F72C9060CD102C0E4C636A1D7CE53C0FFC0C3B928E402C0B8EC4EAC50CF53C081128C643EFD02C09C8FA7EF99CF53C000C60AB6C50C03C0B871E5FB68D053C0011AAFEDAB2203C01CFEDD12EBD053C0FFD8F832A23303C090EAEA7769D153C081195647473B03C0D0309F5300D253C080D187F9B53703C004839B27FFD253C0804FCED6153103C04C5D198434D453C08176C358D42B03C07459717CBDD453C08017D360DB2503C0481C633B20D553C0018A71B7511803C0ECBB60A59FD553C07F9967FC2D0B03C0C4E178B018D653C080DE62990CFC02C03CB41096B1D653C0801BFC9780F002C0B023822F34D753C00053DD7C53EB02C0BC2559B71CD853C000F5EC845AE502C0287BB064E5D853C000002BB095DE02C0E45D3B9F61D953C07FA5F2D13DD202C0644AED70B4D953C080189128B4C402C0E099C58E1DDA53C0FF5F5ABD8BBB02C05C093728A0DA53C001F0A588BDBC02C0D1E8507ED9DA53C07F52400580C502C0E0580F4609DB53C0809AB4A602D902C048D502502CDB53C000BEE72C58E702C0C04474E9AEDB53C0FFD7DC8772FC02C0C4A79A35C5DB53C07F90055EC30E03C02CDB81DF8BDB53C0FF8B4D44221503C05438299C42DB53C0011AAFEDAB2203C04472DC0316DB53C0FF3B147C082B03C06E32AA0CE3DA53C07F9370CD8F3A03C0087C039BECDA53C080819EFBE24A03C074884EE858DB53C0806DF09C655E03C07CC4D8D714DC53C0FF8B9D11216D03C044D0D6F6D3DC53C080487E01137903C0D4E5FBAC69DD53C00001A7D7638B03C08085F916E9DD53C081C055BF4E9D03C0E4C036D8F7DE53C0809807972BBB03C0209073E4C6DF53C07F184F88A9D203C0F0FE974F9CE053C080D353EBCAE103C030CED45B6BE153C001EC4846E5F603C0D0172EEA74E153C000CF3849FD0D04C0882155814BE153C07F23DD80E32304C0D81E31CBB5E053C001E0BD70D52F04C07C2C006A03E053C0FF9AC2D3F63E04C054E79B111EDF53C0813CD2DBFD3804C0980411D7A1DE53C0FFB7D2D0DE2704C0884B46AF15DE53C07F9C01E9F31504C0506F8732A6DD53C0FF3B43F9010A04C03C5396BE03DD53C07FDF2E8ED90004C02CDB81DF8BDB53C001813E96E0FA03C0F02388378ED953C080E10A1BAAFD03C05CAB3C35E2D853C00042C90A9C0904C0505598596CD853C080C7C815BB1A04C0ACA8187F4CD853C0FF63BD7BF44004C070B23F1623D853C0FFE4046D725804C03054220FB8D753C000D46E93086B04C084E361F07CD753C0808C5B71167B04C090DB31A037D753C081E937970B8604C04C3CD5FAD4D653C00072D668168A04C05C4D424224D753C0FF4B81B8EA8F04C08C54AA0756D753C000DB3724D99E04C02084E9A9A5D753C0804776819FB404C0047C0452F0D753C080B755DB10C104C0F82C2FF607D853C080079A5AACDC04C008E1DE8317D853C0FFAC18E300F404C0F4CDB74A1FD853C000126F49800505C02CBA39B89BD853C0FFB3A6D7380F05C050AF7D5C56D953C0FFAE8C24790605C09C3B0B8C66DA53C080090E9C24EF04C0D460DC6BD3DA53C0FF47C27C81E204C0005620108EDB53C001E1985DDED504C0101392D4DBDB53C08084A3A4BADA04C02468CAB602DC53C080090E9C24EF04C02409530B1ADC53C0FF2C6927ABFF04C040FF134258DC53C000D3BA68231205C040FF134258DC53C0FF99203B862705C020718CED40DC53C0FF809A9ED33F05C02468CAB602DC53C08063FA4E614F05C010720980C4DB53C000EA37FFEE5E05C00439BA0DD4DB53C001908940677105C040FF134258DC53C0FFF4DFA6E68205C06CF457E612DD53C0FF71E9F0F48005C0848BA17168DD53C081B09DD1517405C08C6E3B6FAEDD53C0018C4246CB6305C0B8B9348813DE53C08064CD07854A05C0BCFB453142DE53C001A281E8E13D05C0C03D57DA70DE53C0003D2B82622C05C0DC6C67839FDE53C0FF96D940EA1905C0E44F0181E5DE53C0FFB3A6D7380F05C00488D36052DF53C0FF3183DA6A0805C014E6CD79B7DF53C0FF3183DA6A0805C040903E3E05E053C081F4CEF90D1505C0287D17050DE053C001BC0785942505C03457EFCB14E053C0007D80EB133705C038F877202CE053C080C29579CC4005C068E4F98DA8E053C001A90FDD195905C07C42F4A60DE153C0FF0C938A756F05C088A0EEBF72E153C0FFEFC5F3267A05C0CCA8599D25E253C0FF71E9F0F48005C0D823BAB844E253C000D4F85CD88405C0BC2DF98106E253C000596354429905C0AC2E76148AE153C0FF7D9198ECA405C094972C8934E153C0FF60C4019EAF05C094972C8934E153C080A4331E0FC305C0BC4A5F84C0E153C081C86162B9CE05C0CCA8599D25E253C001E975F3A3D105C0E83FA3287BE253C07F2CE50F15E505C0E0E02B7D92E253C08017A66DFE0A06C0D823BAB844E253C001C13EA9122B06C0B4B29866E7E153C0000D0F73DF5406C0B4A11758E1E153C000D585B0FE8506C0D877423871E153C07F84472F2B8F06C058BB072A9BE053C0000C7391619A06C00C7D839E49E053C080223C9564B506C064B3D7D955E053C0017962AD0CD806C07C7FEDDA8AE053C081B7C0C75BE806C048CB67CA25E153C00012E4CD05F106C0602C4DF601E253C080FD8F1B97F406C0CC9CC4398DE253C0FF981036E60407C0B47BA76C92E353C0802672DF6F1207C01C6ED8CD44E453C0FFAF2904301D07C0385016DA13E553C0004243C75A2407C05CE9478686E553C080324D827E3107C0E03820A4EFE553C001C0AE2B083F07C03465046D75E653C0000823CD8A5207C0344BEA80BBE653C00069E1BC7C5E07C0CC311DC3AEE653C0011C600E046E07C004EC6B3C1CE653C0004CD1BF947507C0202FF90C19E653C08067A2A77F8707C024921F592FE653C00058AC62A39407C0482B5105A2E653C000EAC525CE9B07C0DC5A90A7F1E653C081175B4A8EA607C070DE9C9DCEE653C08003BB80E8B007C0482B5105A2E653C0811CB0DB02C607C0DC11844795E653C00112641BF0D507C03C97AD4B06E753C080E00D0171E707C074FBEE4EA5E753C001ECF17F9DF007C0A079A5D129E853C0005E0F0A70F407C0C011D1D393E853C07FA22438B6F507C0C8E1FE7CEBE853C080EEAA9FE8F207C0E06E9E574DE953C080A423320CED07C0B0CC5D7688E953C0804F726BF8E807C06C48AABCCBE953C0815B9BBE85DE07C0A4BE30EF0AEA53C081D5287C9AD507C004DF275354EA53C0000F5A2BB4CD07C0F0EA6F4BBCEA53C0000F5A2BB4CD07C06CCF4C60F5EA53C0FF41D4C6D6D407C0EC99B4F548EB53C000CFB742AED907C09437A60BB7EB53C0004FB73F59D507C020020EA10AEC53C07F14CC6A4AD207C010F8F8C1AFEC53C0004FB73F59D507C078FE7AA613ED53C0FF12CD70F4DA07C0AC62BCA9B2ED53C0800C5C3708DF07C0709B7A2100EE53C0015A9CC42FE707C0F8A0403504EE53C08198FADE7EF707C0E8D42A34CFED53C0012698804B0708C05CE5C1F78DED53C0002EC4E5D61608C0BC2ED2AAE7ED53C08139A864032008C044E3DC6878EE53C081B5EF470D2208C0900F1CC529EF53C0FF31372B172408C02C880C34AAEF53C000BE1AA7EE2808C0FCE5CB52E5EF53C0005170625C3208C0EC03597AEDEF53C0819BB2FBD74B08C010C42683BAEF53C000A69780AE5D08C054327D65B4EF53C0012B0AC3996608C05C1C208EF1EF53C080ED20FADE7408C084B033E838F053C000C1D2C3477D08C00C7783D569F053C000EDDB257E8808C02007EEB3A9F053C000F8082E1E9108C0C8CBBAAFE5F053C0800FD6FC818D08C0B447F8A98DF153C07FED40DF0E8B08C0CCD37E40E7F153C081FDC676758508C05C2F49A26DF253C080419095F58108C0CCFC0A9C23F353C0812837B4757E08C0
9	Amazonia Norte	operational_zone	1	Z8	t	2026-07-24 10:51:50	2026-07-24 10:51:50	0106000020E610000001000000010300000001000000F50300002C7D4FAFCB5253C00820C7E81BF9A9BF14E11C31975253C0FE9FA61B351AA7BFF42A37F3595253C02680EDEF4B81A4BFE0F983B6F95153C03480A5B95C97A2BFD0C8D079995153C022E0E4F151D2A3BFB8D32A1B725153C0C1DF951F41BCA5BFB87D6A7D305153C019E00DBD3260A7BF885FB840D05053C048E0BEEA214AA9BF68FA9E845E5053C0E7DF6F181134ABBF44476C89D24F53C0F61F2819F9EFADBF2472DF6F164F53C017A090BEEBE1B0BF00663994974E53C0F79FE8BF62E8B1BFD8B206990B4E53C021405D89D811B3BFA894545CAB4D53C0E05FB989CC6FB4BF98D6C7BF464D53C0ECAFE522BE13B6BF74CA21E4C74C53C0E13F8A5336F7B6BF5C7FBBE75E4C53C00990FA1D2FC9B7BF3C00EF6BE44B53C01CB09650ADFDB7BFE848BDF3004B53C010507E872B32B8BFC8E6567A404A53C0F8BF62EA2DECB7BFACF4635ECA4953C01620EE20B8C2B6BF9C1971BFAB4953C001403252BFF0B5BF6C4C8B04174953C0F5FFC5864376B5BF3C0F32EC374853C0F8DF9120C464B5BF201D3FD0C14753C0EC9F255548EAB4BFE03D4DB44B4753C02400FAECC287B5BFE00140D6124753C0F35F2686B42BB7BFC829007AA54653C0FFAF521FA6CFB8BF987E74DD404653C0F74F2FB51A1CBABF8C9E8D22AC4553C0DD2FB71D94DCBABF5C44CE07134553C02250EB8313EEBABF40C5018C984453C0DD2FB71D94DCBABFF85BE952CF4353C01C70BB1C1134BBBFC4AB699AF44253C01C70BB1C1134BBBF8C039140414253C019F04A521862BABF44410527854153C0DCEF8A84A238B9BF181E5FCEAE4053C0E69FC6B7AFB7B7BFDC92EC76B53F53C0F8DF9120C464B5BFA455935ED63E53C01500F1BD5C97B2BF689307451A3E53C01A805C586CD0B0BF3092BB0A743D53C0BD1FA0B6EA93AFBF10305591B33C53C0F05F90E5F712AEBFDCBBE2B6113C53C0DE9F4F8201FBACBFC48A2F7AB13B53C0FE1FF0B3FC86ADBF9C8630FD593B53C0045088C0F132B0BF9C30705F183B53C022C0508C610BB2BF74B1A3E39D3A53C0F23F29235900B3BF4857E4C8043A53C0F79F6587D2C0B3BF18C60BECA83953C005A0F1EEC8D8B4BF30F2CA0C933953C00990FA1D2FC9B7BF1022320F4D3953C0F74F2FB51A1CBABF000B3292F53853C0DFAF27E88CAEBBBFD4CA2537653853C018502819F9EFBDBFBDD8321BEF3753C00FA0ECE5EB70BFBF9C224DDDB13753C0F06F720CAF81C0BF94B2D97F673753C0EFF75EF0E01CC2BF683BB462143753C0FC27A7A39AD4C2BF6872CD24D73653C0F637A13D1572C3BF38180E0A3E3653C0EE07E039037FC5BF180C682EBF3553C0F647DED2FA73C6BFACEF1CFA693453C0F7F7F250A15BC9BF6C25EA81863353C00458EB8313EECABF50FF90E6FE3253C0F70F54817E52CDBF20A5D1CB653253C00660EE4CF47BCEBFF4812B738F3153C00998ECE5EB70CFBFB44C79B9D73053C005846A65505AD0BFB8106CDB9E3053C0FAB3C4246BF3D0BF80D806DF353053C0000067973F44D2BF609053257E2F53C0056435C9347FD3BF0C2AEE2E662E53C0029C19AF6C6BD4BFF451AED2F82D53C003EC9C7A653DD5BFEC1D4853E72D53C0FE0F36FAA0C0D5BFDC5FBBB6822D53C0FD270E3AFD2DD6BF90F6A27DB92C53C0FE37B213DA89D6BF60F55643132C53C0005431E05504D7BF48E109096D2B53C00474B0ACD17ED7BF1C874AEED32A53C0FD8B15C68DF0D7BFE485FEB32D2A53C001B86F85A889D8BFA0A9BFDA682953C0FEDF0805E40CD9BF704F00C0CF2853C00400BFEA214AD9BF505D0DA4592853C0F91B586A5DCDD9BF64AB26E3732853C0012CC8DDBA17DABF60380043782853C009648D1C1785DABF442C5A67F92753C0FB731490F126DBBF2C6ECDCA942753C0058462A93041DBBFF06F34D39F2653C008988BB50E7ADBBFC0889B58022653C0F8837C5CF049DBBF7892A9BF342553C0FA6370B614CBDABF5C7E5C858E2453C0FD4F9876B85DDABF1CBCD06BD22353C0012CC8DDBA17DABFDCDF91920D2353C0053416F7F931DABFC0B191985E2253C0046C31F6F3E0DABF64FD12632C2153C0FAB3BC684BDADBBF243B8749702053C003D0E5742913DCBFFC87544EE41F53C003E8BDB48580DCBFE800E173421F53C005284927DD79DDBF98807AC1141F53C008A4D9A33AB4DDBF90F1C8B5C71E53C009544BB7DB04DEBF2C48A4B4711E53C0011C1F255D70DEBF34B6C733311E53C00258CE9F48ADDEBFF4941CDDCC1D53C0FA2BC82C94EFDEBFF8F4B2CFFE1C53C0037C67D1F41FDFBF6088306CF71B53C004C8846F5F1CDFBF24E57E1F5F1B53C0081830DD5EF1DEBFD4B628B3E11A53C0035050A63EE1DEBF10C63991501A53C0F893FF202A1EDFBFE4EC3CA8061A53C0F88B81272052DFBF145A7D459C1953C0F9731ACB1CB4DFBF7C1F7BAE501953C003A456C53F0FE0BF189A2DE4071953C0FD3FB3500A51E0BF24DADD82731853C0007EAB56D584E0BF24B5B3EFB71753C0003ED418D58BE0BFB88217C4DA1653C001C8C6A63C6AE0BFF0B5AAFC3D1653C0FFE951BDD73EE0BFAC97B935931553C0F92F2104E9C4DFBFB093576D121553C0F8CF7AEE5341DFBFAC8FF5A4911453C0F7A3E88323F0DEBFE81F80DED81353C003DCBA9EF2ACDEBFC8CDC54CF31253C00640809C5B61DEBF0CA262ED261253C001B4076CF720DEBFC43F5FBF8F1153C0086C0A43FBB0DDBF3C0B41C23B1153C00530CFEB314CDDBF9CEDA42DAA1053C0FE3B0F9CD0B7DCBFD8BFBFFC661053C004E0894E066FDCBF08711201E90F53C00674C0EED439DCBF30B7A6394C0F53C0FC135C69D52BDCBF38F756D8B70E53C00028C727A14ADCBF71C971A7740E53C0FC3FEED3057DDCBF9074E011FF0D53C0FE3B0F9CD0B7DCBF984FB67E430D53C0FF133F03D371DCBFB4954AB7A60C53C0F9CB62A2A13CDCBF203A8055200C53C006B8B9B50829DCBF90BDED285F0B53C0FC575530091BDCBF0CEA4795B10A53C0FB1BA07B3C18DCBFD80F6935F30953C0FEABF7E3D51DDCBF54BA826D640953C005380B3A0837DCBFB058D471E60853C003E8CD606D5BDCBF08541D774C0853C0FDFBF40CD28DDCBF64B440AED90753C0FEC3012A3896DCBF60CD44E8120753C00028C727A14ADCBFA8C2A953810653C0F8C7FDC76F15DCBF0040338DC80553C002FCCFE23ED2DBBF74A63A5E4D0553C00140C9A972C1DBBF884BC52EE00453C0FA173BA10AF1DBBF24C67764970453C002A8B3D16E31DCBFF8B1CCFF640453C0FC3FEED3057DDCBFACD56BCE2F0453C0FE2BEC513406DDBF001345690B0453C0FB3FF697967EDDBF6456029EDE0353C001B4076CF720DEBF10368F05BD0353C0FC0749A75A7DDEBF1C59D9A16E0353C001C05342EF0EDFBF10322D3D3C0353C0F8038F99B873DFBFEC61943FF60253C0FEB37B404001E0BF5C6BA40F970253C00212018E0A4AE0BF38B871140B0253C0007EAB56D584E0BF14E8D816C50153C0FCCB09F83A9BE0BF88D0201C2B0153C0FFEF77A8D3B5E0BF84CCBE53AA0053C00338B4C005D6E0BF78844A243D0053C001A45E89D010E1BF9086CCF5B3FF52C002D431149B52E1BF0CD4EE2C41FF52C002B4C8863374E1BF34412FCAD6FE52C003A862EB9891E1BF5087C3023AFE52C0FEB5CAB797B4E1BFF81EDC3AABFD52C0017290D0C9D4E1BF94B6F4721CFD52C002921D18C9E9E1BF609A857DE8FB52C0025246DAC8F0E1BF0011D6EA1EFB52C0008A1A26FCEDE1BF14342087D0FA52C0043098CAFEA0E1BF90036452FDFA52C0045423E19975E1BFEC2C4C6F57FB52C0FFCF293E2765E1BFFC073F0E76FB52C00338E1D13837E1BFE49F720F53FB52C000AA03E58BDDE0BFC0EC3F14C7FA52C004968165CDB1E0BFB4D28C54BEFA52C0FF8350B29051E0BFC0791974CBFA52C004FC4432D225E0BFE0A2255204FB52C0FFD7F0E468C8DFBFE485BF4F4AFB52C006988419ED4DDFBFFC21F2CD7EFB52C007781F0031DCDEBFF4434CECAEFB52C007546CCD3550DEBF9870021526FC52C0FC0F85F53068DDBF9870021526FC52C006649DA43888DCBFF412B6E128FC52C0F963787AA5CCDBBF248458473FFC52C006C0F503DF13DBBFF8D4871434FC52C0049842D1E387DABF5073D918B6FB52C006AC651B8039DABF8441921FF2FA52C005B04453B5FED9BF5C8E5F2466FA52C0FB6BAC04EBB5D9BFA483C48FD4F952C00348FD33B8AAD9BFD00D6B2F24F952C00348FD33B8AAD9BFF49711CF73F852C005CC108AEAC3D9BFA45274A396F752C0FDA3828182F3D9BFC09808DCF9F652C008307971B252DABF600F594930F652C003ECA4D4111FDBBFA02124B758F552C000F08BD0D7E5DBBFB0400C8B89F452C000AC9209A4F6DBBF3C0E705FACF352C0051458070DABDBBFD440AE65F6F252C0FD8B23E90F57DBBFA8DBD49E84F252C003A494E1BC3BDBBFDCDD3A67DAF152C0FB0B4ACF5C36DBBF1052D19A57F152C000A006122863DBBF1CDC9343C8F052C000D49B36E86DDBBF58EBA42137F052C0FDD71930F239DBBFF424FF7FBBEF52C0FA9B0530B1EEDABFC80DD4C97CEF52C00758490AB098DABFD06E4C3323EF52C0FF7F6CFE047CDABFCC5D9431A2EE52C0FDB30ECEDA9FDABFB0E1E32555EE52C000F022CE1BEBDABFFC6FD08404EE52C0039C16E8B26FDBBFE4E349EEAAED52C000840D4A89BEDBBF487CB6ED7FED52C0032CF4B80A2ADCBF50887F8C24ED52C007982C8F17CDDCBF247154D6E5EC52C0F9C3D26BD958DDBF50E8157F56EC52C003187FBB4FA2DDBF6CFE5EBE20EC52C0FE7BB6AFE5D0DDBF7CDDD03193EB52C0FE7BB6AFE5D0DDBF74DCEEBA1EEB52C0FABFEFEC797EDDBF483612F992EA52C0FCD35D10F93DDDBF1890353707EA52C000F8F15242D4DCBF9C3140608DE952C005D44C58F7BCDCBF5C82C57450E952C0FEC73FADE1A3DCBFA8AB2C7EF1E852C0008C1FE401B4DCBFD8B19F32AFE852C007501C9CC2E9DCBF3CF55C6782E852C0FFA3C8EB3833DDBF9CFE175B0AE852C0F973447F7AA9DDBFC4925AA4A0E752C008503E0CC6EBDDBF7CE2FD41EFE652C0FC5FCA925C45DEBFB073151692E652C0F8032250D263DEBF58381494FBE552C0093046269EBBDEBF98ACAAC778E552C004C8846F5F1CDFBF801BFB2239E552C001C0EF78236BDFBFB0BE41AE06E552C0FF7743B2C4A6DFBF9892175FD5E452C0049894DDBAC5DFBF90CABE7297E452C001C453A5198ADFBFF87D53E673E452C009B00BFAF661DFBF34856BD434E452C0FFEFF6EBA457DFBF880CD6F8DFE352C0FA3B4FE5AF8EDFBF547CDA46BBE352C001A886394B0DE0BFA0D9335393E352C0FE6984AA7052E0BF808BDB892EE352C0FF1D283A6F7CE0BF5CBB428CE8E252C0FF67668305DDE0BFF835F5C19FE252C00280F2099C36E1BF3025769316E252C003E0568F9B44E1BF50D0E4FDA0E152C0FC6968B4691DE1BF703741013FE152C0FD93390ED01EE1BFEC022304EBE052C0FC45DD9DCE48E1BF8418FB077BE052C0FED955CE3289E1BF5CCAA23E16E052C0021E51C6CAB8E1BF887511A9A0DF52C004C8EF3298A6E1BFF01947471ADF52C000E258C0FF84E1BFD88DC0B0C0DE52C0FF6D8C6E0154E1BFDC6CF8E585DE52C002D431149B52E1BF647CEC4F1EDE52C004B2A6FDFF7DE1BFAC7151BB8CDD52C001AA8474CC87E1BF48096AF3FDDC52C0FE65897C3458E1BFAC698D2A8BDC52C0FFAB82436847E1BF140EC3C804DC52C0043AB822CE56E1BF140A610084DB52C0024C20EFCC79E1BFDC121C9E0BDB52C004C8EF3298A6E1BF089DC23D5BDA52C002DE7988CABFE1BFC09B37796AD952C0FD03E83863DAE1BF5409F109F8D852C0038EE28B12EEE1BF58E8283FBDD852C000F2D3EA7100E2BF40BF1C6184D852C004A2F496BC9BE2BF489DC24254D852C004449C49F9FBE2BF20B3768505D852C0FCD7F5E2F641E3BFFC33AA098BD752C004D8AD9C2567E3BFD40D516E03D752C001D04E56D734E3BFDCD14390CAD652C0FF47E1DC8725E3BFB401AB9284D652C004508869A732E3BFAC1E11953ED652C00050B3497653E3BF8834C5D7EFD552C0FD5F1B167576E3BF8037781AA1D552C0FD6F692FB490E3BF58111F7F19D552C0006E940F83B1E3BF44AC05C3A7D452C0036C7A5CC3A8E3BF1CF9D2C71BD452C003EC1569248AE3BFF49B606AD1D352C0FD6F692FB490E3BFDC50FA6D68D352C0FE6D073623ADE3BFC441A14F38D352C001F612B6E1D8E3BFA01B48B4B0D252C0030E220F0009E4BF4496FAE967D252C0023A2EF51C06E4BF6CA6438619D252C0035C78EB1DEAE3BF2427DA55C8D152C000B0F815B7F6E3BF306BECBCB4D152C0FD115FCC1A45E4BF306BECBCB4D152C0FE65C290B197E4BF344A24F279D152C004B6203217AEE4BF3CAB9C5B20D152C000824CE6E3B0E4BF84839BC4D4D052C0FD3F3257E586E4BFCCFEA22CA5D052C003629ED61961E4BFA44B703119D052C0FD69C05F4D57E4BF94E7F1F179CF52C0FC072F4EBD6CE4BFC81C62221AD052C0016E9F6762A8E4BF78B90E6D44D052C001B0B5905DDAE4BF743CAD798DD052C0014C1A107E21E5BF1086F2F081D052C0FC21AAB5295BE5BF7C89D73331D052C0027090A7EB79E5BF9CA6CAB4C1CF52C0FC7DE30EBFAFE5BF7C30334769CF52C0015CDB18CEDFE5BFBCC3BD3552CF52C00338D322DD0FE6BF349DA85880CF52C0038251B03B38E6BFC81C62221AD052C001F2C236FB6FE6BF30A9228BA4D052C0FE99F77EE2A3E6BF8012B3590CD152C001C06D1650FCE6BF88E27B20F9D052C0FD5D3AFAD339E7BFB452D674BFD052C004086F42BB6DE7BF68E945A657D052C003A2D3C1DBB4E7BF30A3E57112D052C0FD55D8D289D5E7BF9CA6CAB4C1CF52C00204757FD4FFE7BFD8E6EDCF74CF52C002468BA8CF31E8BFFCD9E63084CF52C002B094CA2B73E8BFACF93188F7CF52C0FC6399DBD993E8BFFC62C2565FD052C001E2DA2A60B8E8BF2056BBB76ED052C0FDD9F564090BE9BFE88CBC76E0CF52C0FE55CF4F2C39E9BFDC634FC32BCF52C0FD6DF27FC65BE9BFF8804244BCCE52C0011227C8AD8FE9BFB46A19498ACE52C001AE8B47CED6E9BFB4EDB755D3CE52C0FF1595692A18EABFCC9386FC3ECF52C00356432EC253EABF9C91E3D23CCF52C004285B595AB1EABFC4DC35BEFACE52C00478AFF76FF6EABF20F19C9882CE52C0FF41A386863EEBBF7CC6227104CE52C0FF2FDEEC8F5CEBBF9C0DFA63DACD52C0FE0715D8A092EBBFD0196B4D92CD52C0FE4365FBBDEFEBBFDC1DE6457ACD52C00386763DD946ECBFDC1DE6457ACD52C0FD3123F5FCB8ECBFB093B258B6CD52C000E851EA1C1FEDBF7CC6227104CE52C0034E2C412740EDBF34F517916ACE52C002A6021D3979EDBF34F517916ACE52C0FD7978E94BB5EDBF60406A7C28CE52C0FFD50FE45BE8EDBF948BBC67E6CD52C003B407EE6A18EEBFDC5CC74780CD52C004A203737230EEBF34712E2208CD52C000005C8C805DEEBF70C0FB05AECC52C0FC71B8208772EEBFC8D462E035CC52C004D4D1589399EEBFE85A1BD511CC52C0041AA4B9ACEAEEBFB40FC9E953CC52C001FA9BC3BB1AEFBF503CEF8340CE52C00204DF1FB608EFBF84CC49DC5ACF52C0FE09A03EB402EFBFA858293C8DD052C000663739C435EFBF4883A3630BD152C0034CB180CF59EFBFBCA1ACA1D1D152C0FEB38BD7D97AEFBFC0E6B40E2ED352C004D654ECC844EFBF28449F4EFAD352C0FEFF1D01B80EEFBF9C62A88CC0D452C0FC416DCE9BB4EEBF20464BC168D552C0FC0F9FE87A4BEEBFB0AB2BF204D652C002466C7862FDEDBF4893491F95D652C004EE959C50C4EDBFD4F8295031D752C0FEA141FE3A7FEDBF60DCCC84D9D752C0002E244B3670EDBF004628AE5DD852C0036E358D51C7EDBF285E854BEED952C0FE4B42B41966F0BF40F6505FF9DC52C0007C6CEC450CF3BF28B74C4AE8DF52C00208CD64E68CF5BF3CC54CE25EE352C0FF5BFDC444A2F8BF4818B4B594E352C001D0A2FD35D5F8BF489B52C2DDE352C002E6917B9EFCF8BF0C5B2FA72AE452C0FFDCF564090BF9BF0CDECDB373E452C0FE4EE44CBCF9F8BFEC3D3C269AE452C0FF9D13EE3FD4F8BF24849C5ADFE452C0FEA47B52A3CAF8BF0CC2C5A413E552C0FE1D976807D1F8BF781EF73B21E552C002D30A4A06CDF8BF2C31BAAF6FE552C0014CFC8B7FC3F8BF88AD737BA5E552C000EEF66F4AB8F8BFC080229FC2E552C0FEFB8B51EBA6F8BF14E5FCC19EE552C001E0662B0E83F8BF0476EA34ACE552C0FE65ED4E2868F8BFC080229FC2E552C0017BD59F044BF8BF24FDDB6AF8E552C0FF876A81A539F8BFFC17687430E652C00207AF325A24F8BF7C81204066E652C0FFEC4F44E716F8BFB8CB6CFAADE652C001C79911D10CF8BF34821EE109E752C002FCE4258805F8BF6CA2C61F4DE752C000478F28B20BF8BFA863B070BFE752C0FFBD42CD2D10F8BFB87B8F1919E852C0FE988C9A1706F8BF50F59B8470E852C0FEF5E05020FDF7BFC45F907DFBE852C0004A1C6083E9F7BFCC4DCBAA50E952C0FF73639FD2D9F7BFF475FEF2CBE952C0FF50AD6CBCCFF7BFDC5B708A37EA52C001D6F5F2D8C2F7BF283F734D76EA52C0FF523AA48DADF7BF302DAE7ACBEA52C0FF88C3554298F7BF40458D2325EB52C0FF51B2092189F7BF7C301BF09BEB52C00075B7D60A7FF7BF08E7CCD6F7EB52C0FE26F801A376F7BF286EBE0C44EC52C000D4492A1168F7BF1CC34231A2EC52C0022885397454F7BFCC4CA33B1BED52C002BE28D99B4CF7BF1438310892ED52C0FF152A20694FF7BFE0150F8FC7ED52C0FEF09930BD3CF7BFF0C135EE42EE52C0006DE3A5541FF7BFC444B54E9DEE52C000E51599CA04F7BF00BD054CDFEE52C0FFBB7DE845EFF6BF189DA5C40BEF52C001244529F6D7F6BF8480EFA824EF52C0FFEFAA133FBAF6BF5C9B7BB25CEF52C0FF59AC017A9CF6BF283ACDC0B0EF52C000985F935688F6BF640979D735F052C0FF8A19883582F6BF5495C9E589F052C0FE18AFFAD584F6BF985CEAF2D6F052C0010C69EFB47EF6BF64BD9E0339F152C0FF8C57253374F6BF2C647B1BC5F152C0FF624766D26FF6BFBCF22AAF38F252C001718D71F375F6BFC0A9A941A5F252C0FF8BB856347BF6BF900A5E5207F352C0FEF0DCD87272F6BFF0BE7D5F54F352C000CB0AB70F60F6BF34869E6CA1F352C0FF23E92D2D51F6BFF072A38B57F452C0009B30278939F6BF2404B2A4EAF452C001E429C4862BF6BF648D35B445F552C0FF30C22F8316F6BF541986C299F552C0028098387DF3F5BF584C3F50EAF552C0FEBF896757D1F5BF901BEB666FF652C0FF6EA78693BAF5BF54842A8109F752C0FFFF7A9631AFF5BF8C53D6978EF752C0FFC924CCAFA4F5BF289C5D24D8F752C0FEBF1C5E8C90F5BFBCA647B32FF852C0FEFD6EBE6775F5BFC41F2948AAF852C000D7FDCD056AF5BF006B0F5A13F952C00155AE66866DF5BFF034FD6559F952C0FE984A3C297EF5BF00E4F0EE8DF952C00159F8DB4D99F5BF001F358616FA52C0FF659F1870A6F5BFB892581052FA52C0FEF195BC11B0F5BFFC1BDC1FADFA52C0FF64004A71ADF5BF5854C13116FB52C00149D56430A8F5BF901BE23E63FB52C0FEF195BC11B0F5BF88A7324DB7FB52C002FDDBC732B6F5BF882014E231FC52C0FF0AC1A152B5F5BF242BFE7089FC52C00181CAFDB0ABF5BF8812D70B27FD52C001B237846C91F5BFCC9B5A1B82FD52C0017D8088E97FF5BF602A0AAFF5FD52C0FF649340A66CF5BF28423D52C4FE52C002311AE2204DF5BF88FEE76849FF52C0FE98DD325E3DF5BFC0CD937FCEFF52C000DACE61381BF5BFC0467514490053C0007DA67553FEF4BFF499E62FEA0053C0018DC9EC70EFF4BFCC6BF1CB8E0153C0018DC9EC70EFF4BFF04D0C5CED0153C0007DA67553FEF4BFF880C5E93D0253C0007FE41251F0F4BF904D127BA30253C000E7A7638EE0F4BFF8728813330353C000897F77A9C3F4BFF03C761F790353C001F2E196E5ACF4BF586DD027AA0353C0FFD9F44EA299F4BFC8D0E3BD2B0453C0023134F7C091F4BF943198CE8D0453C0FED75580A3A0F4BF88FB85DAD30453C00200C77005ACF4BF90F0A16A320553C00165EBF243A3F4BF207F51FEA50553C00233D3C5BF8AF4BF989C3C8DFD0553C0FE7C6B31BC75F4BF3069891E630653C0FF80A9CEB967F4BF60BCFA39040753C0FE7363C39861F4BF940F6C55A50753C0FED649A8D966F4BFC8DE176C2A0853C0FFE38FB3FA6CF4BF60AB64FD8F0853C0008AB13CDD7BF4BFF077B18EF50853C001337294BE83F4BFF82E3021620953C000B1E48F4195F4BF248D85ACA40953C0FF7231FE64A9F4BF942E3640180A53C00025999268BEF4BFF4661B52810A53C0FF1615EA49C6F4BF9820F9690D0B53C0018E5CE3A5AEF4BF6005737F8B0B53C0FE72D0CC63A2F4BF30A4C48DDF0B53C00165EBF243A3F4BFCCEC4B1A290C53C001F2E196E5ACF4BF24A9F630AE0C53C002FF27A206B3F4BF2C559153790D53C000E4FCBCC5ADF4BF60243D6AFE0D53C001F2E196E5ACF4BF28CB19828A0E53C0FE7BD83A87B6F4BF0021EA224B0F53C0FF0B6EAD27B9F4BF2CF82043081053C000B52E0509C1F4BFF060605DA21053C0FF3E86DAABD1F4BF544839F83F1153C0FED6C2896EE1F4BF8C17E50EC51153C00156D453F0EBF4BF60B6361D191253C0007DA67553FEF4BF646DB5AF851253C0FF0A3CE8F300F5BF60E69644001353C001F24EA0B0EDF4BF30CB105A7E1353C0025BB1BFECD6F4BF5C1E82751F1453C0025BB1BFECD6F4BFB418CA89961453C001C9DDAF4EE2F4BFFCDFEA96E31453C000E7A7638EE0F4BFC486C7AE6F1553C0FECB7C7E4DDBF4BF902519BDC31553C001976451C9C2F4BF64FFAE62A01653C002654C2445AAF4BFF48D5EF6131753C0023134F7C091F4BF5CBEB8FE441753C0010BA0725B71F4BFF8C01784641753C001CA039DB860F4BF507DC29AE91753C001661DB8775BF4BF5C72DE2A481853C000CB413AB652F4BF24575840C61853C0008B4433123BF4BF58E86659591953C0FEE222AA2F2CF4BF20CDE06ED71953C0FF7F9DF6EF2DF4BFEC6B327D2B1A53C00027BF7FD23CF4BF30F5B58C861A53C002149C08B54BF4BFFC17CD9FF61A53C0023EACC71550F4BF8CA67C336A1B53C0020956FD9345F4BF548BF648E81B53C0FE187974B136F4BF2C68E5542E1C53C001988A3E3341F4BF905AA25F6D1C53C0FF2181E2D44AF4BF5CBB5670CF1C53C001FC0FF2723FF4BFBCAD137B0E1D53C001FDAEC07138F4BF900EC88B701D53C00201ED5D6F2AF4BF5831DF9EE01D53C000BD5088CC19F4BF947CC5B0491E53C00108E9F3C804F4BF681B17BF9D1E53C001D66F9543E5F3BF90796C4AE01E53C001087CEAFDC3F3BFBC9924D8301F53C0008D09EF7AB2F3BFC40A7B63731F53C0FE4BABB6D593F3BFBC12066DAB1F53C00033BE6E9280F3BF30B4B6001F2053C000648C264F6DF3BFCC751F22E32053C0FE4DDD7B094CF3BF88622441992153C002E50D530222F3BF2CA320C4AA2153C0017D3E2AFBF7F2BFF40EB944AE2153C001E38899A36DF2BFE8199DB44F2153C000E4BA5ED725F2BFC0F9E426FF2053C0FE31F298D209F2BFC0F9E426FF2053C0001805518FF6F1BFBC3F0D2E292153C001253F84E6C2F1BFC0BB47290D2153C000E67F1A409DF1BF8CE1B7A2E62053C0020C8401D767F1BF8CE1B7A2E62053C0FF4C7530B145F1BFE8A0BB1FD52053C0020D17F80B27F1BF941F55A0D82053C0FE16B25C64FAF0BF2C68DC2C222153C001644AC860E5F0BF981118CACD2153C0FF56A38B3ED8F0BFB48BF1E0352253C001A192D01CDDF0BFA469D86E692253C0FF4C57C1B9F0F0BF6C1552EBAE2253C0FFD96954A802F1BF74038D18042353C001D616E56C0EF1BF9C2BC0607F2353C000E26D29100BF1BF9C2186970C2453C0FFD96954A802F1BFA8865E5B8C2453C0FE4C0827E604F1BFB0A6C80D1E2553C0015F6340F109F1BFF0B4AB79B62553C0025E25A3F317F1BF046ECC343F2653C000D9DC1CD724F1BF18D3A4F8BE2653C0003C35A84724F1BFB0220DE8112753C0FEED75D3DF1BF1BF30D9BECE6D2753C0012C182C3A11F1BF704DAF04BA2753C000CE12100506F1BF3870C6172A2853C00165B6AF2CFEF0BF142C9433912853C0015499331FEBF0BF586E55E4A02853C0012EF99A4394F0BF680F97F6CF2853C0012D7100D76FF0BFE4C548DD2B2953C000650F84C95CF0BF2887322E9E2953C00223A7F30451F0BFBCD69A1DF12953C0003451A7E341F0BFD465175D752A53C0FF11D911CB29F0BF102701AEE72A53C0FF706B65D112F0BFA476699D3A2B53C000580C775E05F0BF7022E319802B53C001DC5F2D0CFBEFBF4433355A452C53C0FFCD42B1FEE7EFBF54980D1EC52C53C001DC5F2D0CFBEFBFBC3E6B65FF2C53C001FCB7C0550EF0BFE4E7750D182D53C002517B6A251FF0BFF4B25B9B4B2D53C0FE7B3572A331F0BFE89042297F2D53C0024FEE325441F0BFFC76F24C9C2D53C001B50CF62E57F0BFCCC3ADDB102E53C002BAD22D996DF0BF688AB3618E2E53C0FF0B81052B7CF0BFCCFC3264512F53C0FE8134AAA680F0BF08BE1CB5C32F53C0FF75DD650384F0BFD857D15E5E3053C000373B0DA98EF0BF18905846FB3053C0012EF99A4394F0BFECDC13D56F3153C002EF5642E99EF0BF6CE0BED6F13153C0FEE903D3ADAAF0BFAC976E5EF13253C0FE8A717FA7C1F0BFB4A5133ED83353C0019A8EFBB4D4F0BFE41006D8063553C0FFCE9F47D6E3F0BF388B10E4013653C0000AEF30F5E4F0BF64003D47A33653C0FF0FF3055DEDF0BF1C013BE8463753C0FE85A6AAD8F1F0BF14806388A93753C0FF4C57C1B9F0F0BFB0CFCB77FC3753C0019901C4E3F6F0BF34867D5E583853C0015F6340F109F1BFE49840D2A63853C0007446F46833F1BFC0DD7057E33853C0FF8314D6A25AF1BF7CD6E3EE4E3953C001308A2C6C82F1BFBC2030A9963953C002665DDB8F9FF1BF74AA90B30F3A53C0FEF1E236ADD3F1BF54665ECF763A53C0FE28F482CEE2F1BF30A1548B403B53C0FF5901FA87E9F1BFC85D20484B3C53C00148A6E07CE4F1BFF4FCF026F13C53C00050E852E2DEF1BF78009C28733D53C002619206C1CFF1BFECBED818073E53C00297A91146C0F1BF54ECD9BACE3E53C002C9B566009FF1BFECEBDFD9843F53C0013018863C88F1BFF4DDA2037A4053C00125D27A1B82F1BF34A26AAA5D4153C002A382139C85F1BFF00AAAC4F74153C000BEADF8DC8AF1BFF045EE5B804253C0FFAFC81EBD8BF1BF5C2DC7F61D4353C002FEFF58B86FF1BF8C04FE16DB4353C002CC86FA3250F1BF8C7DDFAB554453C0FF7EE2B66C2BF1BFFC1E903FC94453C000F0406C02EFF0BF8CF6C040D04453C001E18D5716A8F0BFFC1E903FC94453C001A4CEED6F82F0BF581C31BAA94453C0FE7F3A690A62F0BFF82974AF6A4453C0FF2FF7564544F0BF50B9FEB77B4453C0FEFE74213230F0BFAC7DB2761C4553C00070DE2D0035F0BFB414BABFD84553C000FD3F5BC232F0BFD091712CB24653C002EBE441B72DF0BF24E2D7BCA84753C000FD3F5BC232F0BF5481A89B4E4853C0015B4577F73DF0BF3C671A33BA4853C0FF72A4656A4BF0BFE8C6D6C12E4953C0015F0BAF6154F0BF88B780C3B04953C0021965819F56F0BF2C584DE49D4B53C0FE455D261B5BF0BFD08BB637D34C53C001EC1D425066F0BF20DC1CC8C94D53C0FF847247A472F0BFAC096C45504E53C0019B9398198EF0BF849B95E5B24E53C00219114A67B1F0BF4C470F62F84E53C0FF74D8C89ECAF0BF60DB2806364F53C0FFF21DD8FED9F0BF24446820D04F53C002722FA280E4F0BF847169C2975053C002722FA280E4F0BF84258FEE9A5153C0FF7E75ADA1EAF0BF2060D9A4D95253C0FF24973684F9F0BFF4770C48A85353C002A4A8000604F1BF1C90BEBBC85453C0029070B7AA10F1BFE090BC5C6C5553C000A2CBD0B515F1BF7C81665EEE5553C0FF559496BA31F1BFD85CDE17F55553C002260FBA6D4FF1BF7C81665EEE5553C0FFB4D2B28875F1BF68BE0BDAF25553C0FF1CF175638BF1BF3858C0838D5653C002D3F7D86599F1BFE8E1208E065753C002D3F7D86599F1BFB87BD537A15753C0013BA3D3118DF1BF64E31CD04D5853C0010ED4F95578F1BF98AC912AF85853C00201CC4F8667F1BF347397B0755953C002030AED8359F1BF883E9EE42E5A53C00023C6A25148F1BF5056D187FD5A53C001C1DFBD1043F1BFF0D99CABCF5B53C0FF4BD661B24CF1BF603DB041515C53C0FED96BD4524FF1BFF809FDD2B65C53C0012710181974F1BFFCC07B65235D53C0015989769E93F1BF90444789F55D53C0026491E4C1A7F1BF641EDD2ED25E53C0029848E044B9F1BFF8A1A852A45F53C002CB600DC9D1F1BFF460B2EE486053C000E44D550CE5F1BF9460B80DFF6053C0FF0920776FF7F1BFB837EF2DBC6153C0FFD9B2F0B311F2BFEC8A60495D6253C0007CF70D9A35F2BFB46FDA5EDB6253C002BE55463F54F2BF58EB1A79756353C0FE8CE8BF836EF2BFF8EA20982B6453C0000C99580472F2BF8CDEA3109E6453C0FE978BC2A560F2BF6C3C8F1FE46453C0FFC09EA17850F2BF544CEE75676553C0FE794D815F32F2BF9005D41A116653C0FF7802F15223F2BF784174A3D06653C0FECB43CE442EF2BF00A84CAB2D6753C000CC8E5E513DF2BF3C613250D76753C0011C6777A149F2BF848F8FE3D56853C0001634BD5C45F2BF280BD0FD6F6953C0002557347A36F2BFF0B1AC15FC6953C0FE088D803A38F2BFBC1261265E6A53C0001634BD5C45F2BFBCC9DFB8CA6A53C0FF67B56C1F55F2BFC8BEFB48296B53C002BFF4143E4DF2BFFC4F0A62BC6B53C0FFCCD9EE5D4CF2BF5888EF73256C53C0FFCCD9EE5D4CF2BF0042CD8BB16C53C0008041836161F2BF948A5418FB6C53C0FF992ECBA474F2BFFC3E7425486D53C001B17C44E98EF2BF20218FB5A66D53C0028C55C94EAFF2BFE843A6C8166E53C0FF32D88332C5F2BF2CCD29D8716E53C0FF33775231BEF2BFC0997669D76E53C0FF0BA530CEABF2BFF8A6BF7D4E6F53C0007FAE8C2CA2F2BF2C766B94D36F53C000712AE40DAAF2BFBC88E02C637053C001194C6DF0B8F2BFC43F5FBFCF7053C0FE24F3A912C6F2BFB8FE685B747153C000CB7564F6DBF2BFF0CD1472F97153C0000B736B9AF3F2BF9049558C937253C001AF56577F10F3BFC45E29AA427353C0FF8DCEAAE329F3BFBCA1F84A037453C00033B296C846F3BFECF46966A47453C00073AF9D6C5EF3BFC8C67402497553C0FE7EB70B9072F3BF84F1161FF17553C0010C4D7E3075F3BFBCFE5F33687653C0FE5784B82B59F3BF8C217746D87653C002B301FE4743F3BF24E3DF679C7753C0FE7E4A02C531F3BF9846F3FD1D7853C0000BE0746534F3BFF0029E14A37853C0FFBEA83A6A50F3BF8CC75F9CD07853C0006ED2317073F3BFFCB1919DD77853C001490CE8D69AF3BFC45BC71BCD7853C0FE7C85465CBAF3BF64E2EBA5087953C0FE4A79F1A1DBF3BF641D303D917953C0FFE6F33D62DDF3BFECF107D82E7A53C0FF22080140D0F3BF2CB928E57B7A53C0020B1BB9FCBCF3BF600C9A001D7B53C0006537CD17A0F3BF28F113169B7B53C002A4EA5EF48BF3BF905CB2B5547C53C0FFF25F36ED61F3BF8C97F64CDD7C53C00240F8A1E94CF3BF2026A6E0507D53C0FEB0C3604A51F3BF281BC270AF7D53C000652BF54D66F3BF2C10DE000E7E53C002B26E071384F3BF60634F1CAF7E53C0FE56F1C1F699F3BF8CB6C037507F53C001490CE8D69AF3BF3474BFB2EE7F53C00291BC299B90F3BFA0EAF610CF8053C00193707E499EF3BFB0E68AFC418153C0FF3AF3382DB4F3BFE89F70A1EB8153C0FEDC0C2F6FCBF3BF0C3D746ADC8253C00287F8ADF4DFF3BFA8739F2B708353C0FF89617296DEF3BFD48873491F8453C002D9EEFAD9DBF3BFD80C37E0D38453C0FEE3DEB7B2C8F3BF04220BFE828553C000368A748BB5F3BFD01588784D8653C0FF395D181496F3BF1C737FA4F18653C0FF3D7B4CA985F3BF24B587A2CA8753C0FF7C5B9FCA86F3BF94F5F4D4D48753C0FE7CE6E14151F3BF14E2A6A6278853C000B24EC27029F3BF00E82536878853C00092D355BC14F3BF10A1F05D138953C0000C0653A4FDF2BF94F0C87B7C8953C0024E2563B2F1F2BFD02FAE44028A53C001A96BD6E1F4F2BF449F1FDE848A53C00138A90C3CFFF2BFEC3E1D48048B53C0FF7058E90700F3BF005B0EBCA68B53C0FF137686E6F0F2BF00A41A1C038C53C0FEA7C0C936D8F2BF7890CCED558C53C0023EDF50D7A6F2BF00E0A40BBF8C53C001F2C02A8B90F2BF38BC63882E8D53C0014C5C910F77F2BFA4658889848D53C000FF3D6BC360F2BF04653B5BD78D53C001471595724EF2BF60911F245D8E53C0FE8834A58042F2BF802A51D0CF8E53C0010D66B8A64DF2BF1C20DD0A4C8F53C0FF1ED5012763F2BF88C9010CA28F53C0FEE8C1144D6EF2BF4C58BFF2909053C0FF5014ABB070F2BFA884A3BB169153C0FF96EBD45F5EF2BFB43287286F9153C000CF9D501D45F2BF3CE791E6FF9153C0FE3F01B5FA3DF2BF8C0FB99A8E9253C002D39C4A733CF2BF643DA662219353C002C2BAD79A44F2BF385CEF5A899353C0025258796754F2BF24683753F19353C0026F92B6566BF2BF886EB937559453C001CE15B4AF7DF2BF3C70D743E29453C0FE50A38DAC9FF2BF54EFEE039B9553C0FE936DAA65B0F2BF64A8B92B279653C0012963FA60B4F2BF48AE38BB869653C0FFA631E73AA9F2BF8841EBD7999653C002CAD58A9488F2BFE4946BFD799653C0FF30993EFC5BF2BFDCA1ED6D1A9653C002A9CB3BE444F2BF440F887FB49553C00272296C0E21F2BF0019AF168B9553C002FE1FA6CB02F2BF508CC8B7849553C0005F2B4092DCF1BF8C82A120AE9553C0FE4368ED7EC1F1BF7425FA63F79553C00031F9A3FEABF1BF788820B00D9653C001AEE3BA878EF1BF38F56D93FA9553C0013ADAF44470F1BFF0D521468E9553C0FE520E655C5CF1BF68CF5588819553C0FED82EC080E6F0BFD4023D32489553C00248F18926DCF0BF58168B60F59453C000FBD263DAC5F0BFD8B930D2EB9453C00143AA8D89B3F0BF744C96C0519553C0FE39AB774B91F0BF0403523FC89553C0FE40A3BA0780F0BF6027614B349653C0FE24697D1869F0BF20A3AD91779653C0FFA6AC487A48F0BFD4F9F830CD9653C0FE8B7105E128F0BF8493D29E189753C00073A9078816F0BF08D397A8F59853C0FE0913DD18FAEFBFD0DF9B71BD9953C001F44ADFBFE7EFBF98ABADB5469A53C0FD732E23F7CEEFBF2464BAEC449A53C0FC59DB9710CCEFBFF0A3C33EFF9953C0FE67C9C45C8BEFBF40401485C39953C001C4E9074F2AEFBF40401485C39953C0023024034DBFEEBF3C982A04319A53C0035A46A0B06AEEBF3CC4B5C3679A53C001764E850820EEBF3CC4B5C3679A53C001EE38FE71C6EDBFECFBD9BD6C9A53C0FDD3AC77DB6CEDBFD0F3F465B79A53C0FF097F92AA29EDBF04B4EB13FD9A53C0FE67CB605CFFECBFB4179BCD389B53C0FF6909103DADECBF98B79FF6159B53C003AAF5E21760ECBF842B1960BC9A53C001ACC9575829ECBFF4DCF9134F9A53C0016669A62FDFEBBF800A622EB69953C0FF3753344B9CEBBF9404E39E569953C000225508CF57EBBF5C713082439953C0039488EF781EEBBF3C1489C58C9953C0003E4F893FF8EABF90EAC8B29C9953C0FD513CFDB9BBEABFA06709EB6C9953C0FED54F4BE868EABF10E19540249953C0000CBFDD8A4BEABFF8809A69019953C0FF59C56871F4E9BF7450DE342E9953C000FA93CF5D98E9BF48A18CEE699953C0FF0718C20973E9BFD8D0CB90B99953C0FCEF8B3B7319E9BF0C65377FC89953C0FF4BAC7E65B8E8BF9008F08ABE9953C0FC67B463BD6DE8BF140D21005B9953C004926CC68034E8BF64A971461F9953C00024217561E2E7BFE078B5114C9953C003E446C6A7A6E7BF5C74849CAF9953C001687782DC79E7BF24382F2D0E9A53C0FD8D2FE59F40E7BFECFBD9BD6C9A53C00140D1433A2AE7BF705821B2769A53C0FDF969E09DD5E6BF705821B2769A53C0FC4B0B0D18C0E6BF78E3C5D15B9A53C00126147D99C3E6BFB89D144BC99953C00360DF8314B2E6BF7CA73BE29F9953C0035433C6E202E6BFA48123D7269953C0016E906D9FB9E5BF74088BA6CD9853C00424C73AA886E5BF98E2729B549853C0FE811ABBCD66E5BF88C68127B29753C0FF11C90E2C42E5BFEC5AB895A69653C0FC97072F482AE5BF54EFEE039B9553C0FC012E09FC13E5BFBC5C8915359553C0043896E92AECE4BFA0247261C79453C0041E3ACF9B54E4BF4CD090FEB29453C00496107349A5E3BF0C8455D6659453C004322430CE46E3BF605593C6999353C0FD4F964FC6E0E2BFE801AEBCC89253C001FC7E6EBE7AE2BFA0B53078299253C0FCEDA2659332E2BFD0F185E7CA9153C00168F7189DBDE1BF082EDB566C9153C0FDB967DE234BE1BF2CC3C3D7FE9053C002AC8BD5F802E1BF2C973818C89053C0FFFB27263FC7E0BF4423BFAE219153C0FEFDFB9A7F90E0BF9006810CD29053C0005002266639E0BFC46E613BAA9053C003506C60061EE0BF8007FE9E559053C0F9F3A9FEFC6FDFBF9C0FE3F60A9053C0FC47EE38C4C6DEBFECAB333DCF8F53C000CCF2693963DEBF6479DCBF8B8F53C001F8E9D2CE0FDEBFEC99C269528F53C0040CE4533FB0DDBFE02904A2228F53C0F84B9EA2B81DDDBF2C9D1D431C8F53C0F9C34ECA9AB4DCBFA4C3827C428F53C000605C993902DCBFD03C1BAD9B8F53C0FACF4674836CDBBF0419DA290B9053C0FB47F79B6503DBBF68B566AF479053C0FE67544322BADABFACC559042B9053C0FFAB71B8E73DDABF303CCE7EEE8F53C006487F87868BD9BF88C9010CA28F53C0FCDB723C391FD9BF585069DB488F53C0FAA3967DBCAFD8BF60911F245D8E53C0FFDF07C0D5C0D7BFAC2BD521B18D53C0F887F5F5F8F4D6BF2479D6B7318D53C00244606C54F9D5BF4C9CCA0C158D53C0FC3F8708B153D5BFA029FE99C88C53C0FA1B288A6CB4D4BF5CD0FEE4888C53C001486598AD51D4BFD0E19B52508C53C0F7BB57D71531D3BF108B50B3FA8B53C0FDDF52039DAED2BF08A5C532E08B53C0FE6B806BB715D2BF64DF31160F8C53C0FE03B8E8B0D7D0BFB430017B098C53C0FE2BC765BB06D0BF1801C2D8B98B53C0F35FE99BABDBCEBF1801C2D8B98B53C0F9D75D399EB6CDBFE8608D4B068C53C0F0675E70C1EACCBF28BA8C00468C53C0F85FBFBF8518CCBF9C509AF6228C53C00718C70F9506CBBFF0DDCD83D68B53C0FA77AF135788C9BFDC0AE96F908B53C0FBFFE9FDE18FC8BF2C981CFD438B53C0F4071E32BA03C8BFC48BD1AFD78A53C0112818B32AA4C7BF894CECE6518A53C0F087581C450BC7BF60B3BA3ADF8953C008D80CEC2E19C6BF94F0C87B7C8953C010E833888B73C5BF5C77304B238953C0107807A4C2EDC4BFC847F1A8D38853C0F057818921F4C4BF24A8F33E548853C0EFAFE720524DC5BFA8D55B59BB8753C0EECF469F96ECC5BF80D90361328753C0F23FFF1C90CBC6BFA036AB1DE98653C00858641A64CAC7BF5CDDAB68A98653C0F43F43FD96CFC8BF78D72CD9498653C00B583D7E0770C8BF0068BB3FC78553C0FFC750CC351DC8BF94126492FE8453C0112818B32AA4C7BFFCEFA6604F8453C0F087581C450BC7BFF84374B4DC8353C00CD0FF53B3FFC5BFE4708FA0968353C0F20F288A6CB4C4BF74F49B96738353C00380D6DAC662C3BFB411115CF78253C0F99FF7F7935DC2BF2845F805BE8253C0FA2FCB13CBD7C1BFE82CAF99928153C008087FAC91B1C1BF08B1F2B2A38053C00C0072141698C1BF98D1D85C6A8053C006B03FB1BDB2C0BF7CFEF348248053C0FF2F29CEA20EBFBFFC114277D17F53C0044077065CC3BDBFDC15EA7E487F53C013C0C407F243BDBFACB66B3AA97E53C0203003A08C1CBEBF28046DD0297E53C0F16F1DD0834FBEBFCCD78807A47D53C011A0AAD7FA10BDBF8C00E8DC5F7D53C00290BFAECB95BBBFD08083EEF97C53C0FFDF5E00C3EDB9BF004CDD1ECF7C53C0FC8F4FD74597B8BF0886C454D27B53C006302FE0E14DB8BF7CBB5CBF7E7B53C0E29FDE917930B7BF049C212C957B53C0EE3F94FBBF98B5BF0886C454D27B53C01330999FB86FB0BF0C70677D0F7C53C02400AEA9C16EADBF5CAAD3603E7C53C04580BCF5AB4AA9BFCCFDF8F2F27B53C02BA0DE917930A7BF9499B7EF537B53C014009BEA9152A4BFD85CE1CFE37A53C0CD7F6B01D4E6A1BF10FB0909867A53C02EC094C906589FBFD09AE0AD097A53C01E402CCD31499CBFDC92B05DC47953C0D1FFAF854E3F9ABFE4E36BB3377953C07C3FAA130FA995BFC46FCA0F0E7853C0E60002744BEA85BFF8740B76E67653C00DFF22AB76DB72BF84A273904D7653C0FE0524C8FD58523F64F0D20EFE7553C04E0043173A9A823FE4DD3CD4F87553C0E91F23959A32A03F44D42F04C57553C0F1DF55905F72A03F2CFCEFA7577553C0C03FB2138902A33F54EE1749C17453C0FF9F3BB2EF13A43FE85F5041467453C0FF9F3BB2EF13A43FD47FC563C47353C0FFDF035274BAA13F085E0DB3647353C039607AB30DA9A03FD8A54279757253C07AFF7DAE95549E3FE0B2B69BF37153C07F00222B6CC49B3F583F3B158D7153C086BF3BB2EF13943F385A8796A17153C01B7F7469577C8A3FB4E1E26ED17153C018009AE3F1C17E3F0C848AC8157253C05CFC97E86916613FACDCB9CD677253C071FFDD1A4C8164BF245CCA24837253C0B900E0DC9EA179BF701252D0907253C0767F055739E78DBFACD46E4C537253C01100D636373993BF583A1274237253C070804DEFBC3696BFCC53C771DA7153C0DBFF7C2553AFA3BF98E2240CC47153C0DF3FD064342FA7BFA8263773B07153C0F31F8FBECD0BADBF68CE79A7917153C0F5EFFB196CD7B0BFECFE35DC647153C00D00CE926027B2BF640846AC057153C0EF2FA85220A4B3BFA8FDAA17747053C017B039681EDCB3BFCC8751B7C36F53C00DD0E074C0E5B2BFC43FDD87566F53C01D708D2F6A0FB1BF8C6960F0186F53C0BBBFF20D3B42ACBFDCA6398BF46E53C00D803E8EBB48A9BFA06BE2C18F6E53C0D51FA2DD287FA8BF586EB9C51F6E53C0CB9F2BF15532A9BF9C84E6FBC86D53C0D13FCD497BC5AABF080CB697886D53C021C0D72395A8ADBF0CEBEDCC4D6D53C0FEDF3929998AB1BF40BD089C0A6D53C0FB7FEB0F5577B3BFC8CCFC05A36C53C0E92FF6AAE908B4BFF456A3A5F26B53C01CB0E8B516BCB4BFB8992A48EE6A53C0F90F01467E9AB4BF7CBF4BE82F6A53C00FB0163D226CB3BFC893E888636953C0F28FAD0028C4B2BFEC3E57F3ED6853C0F57F82D35ACFB2BF18C9FD923D6853C0EF2FA85220A4B3BFD4687C361D6753C0FF1F4F9E47FFB4BF9088B93C676653C00610D3BE72EAB5BF7C40450DFA6553C0EF6F03D9CC50B7BF6893F6AB656553C0F11F4C838E95B8BFE07B3EB1CB6453C0F56F6C15C7F8B7BF5C6486B6316453C00610D3BE72EAB5BFC808BC54AB6353C0EE3F8D6EEF60B3BF901177F2326353C0E2AFEBD0CF25B1BF5C1A3290BA6253C040203E0CC6EBADBFAC74712D506253C01360565DA878ABBF0CD59464DD6153C0CF5F9781193FAABF542FD401736153C0D25F0B5F1DCFA9BF5CED436CFD6053C039E076EFE0DBAABFA4478309936053C0E13F13A073A5ABBF18CF52A5526053C0F19F64D47022A6BF1CCBF0DCD15F53C0C91F0107F948A2BFC889B579755F53C04480FA4E91189EBF003B087EF75E53C00200F38F309F97BF0C7BB81C635E53C04080A57AD74590BF781FEEBADC5D53C030FF0F07B0988ABFBC1453264B5D53C0AD7FA9A873A58BBF28B988C4C45C53C0E8FF4E9E47FF94BFACE944F9975C53C0C37F40A589F89EBFC4333BFA7B5C53C01640BDC7CE18A7BF606ADBC8465C53C0D43F41277F55AABF4C432F64145C53C0F5FFC4862F92ADBF28945E31095C53C01EB0D0EC9EE2B0BF606ADBC8465C53C00D00CE926027B2BFDC28E158A35C53C01500F1BD5C97B2BFDC7EA1F6E45C53C0FA5F85234D5EB4BFEC1D87B7CA5C53C001403252BFF0B5BFD084077C475C53C022605AEC333DB7BFC0A914DD285C53C01F904E202978B8BFD011E1DB4B5C53C0FD0FB31E1785BABFEC76FA97BD5C53C0F5AF8FB48BD1BBBFEC3FE1D5FA5C53C0EEDF1F1BFF40BDBFF40021B5105D53C015801C4DEE2ABFBFD4D714D7D75C53C0FA7FC025EE9BC0BFD467A1798D5C53C0F59F42A5ACC7C0BFC036EE3C2D5C53C006907C71B13BC0BF88A8C8A2825B53C01AE058B167EBBFBF583456C8E05A53C00CF08C17E7FCBFBF244DBD4D435A53C00060F08CF055C0BF0CC64973A15953C0FCAFDED72AFCC0BFCC03BE59E55853C010C8403EA4BCC1BFA46A3E1E625853C0F51715D61E5AC2BF80B70B23D65753C001082524DCA8C2BF585D4C083D5753C0EFF75EF0E01CC2BF3CF8324CCB5653C00CA05C586CD0C0BF046A0DB2205653C0F58F607EF558BEBFD4827437835553C0FB8FBF1B8E8BBBBFA0B841BF9F5453C00420FEEB3FDFB5BF781FC2831C5453C0016061885569B3BF606135E7B75353C00E100189E4B3B1BF3C21298C275353C0E69F171D0592ACBFB8FEB60AEE5253C0F2FF75E2C9F1AABF2C7D4FAFCB5253C00820C7E81BF9A9BF
84	Susudel	parish	82	011051	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
85	Chordeleg	canton	6	0111	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
86	Chordeleg	parish	85	011150	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
87	Principal	parish	85	011151	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
88	La Unión	parish	85	011152	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
89	Luis Galarza Orellana	parish	85	011153	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
90	San Martín De Puzhio	parish	85	011154	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
91	El Pan	canton	6	0112	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
92	El Pan	parish	91	011250	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
93	San Vicente	parish	91	011253	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
94	Sevilla De Oro	canton	6	0113	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
95	Sevilla De Oro	parish	94	011350	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
96	Amaluza	parish	94	011351	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
97	Palmas	parish	94	011352	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
98	Guachapala	canton	6	0114	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
99	Guachapala	parish	98	011450	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
100	Camilo Ponce Enríquez	canton	6	0115	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
101	Camilo Ponce Enríquez	parish	100	011550	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
102	Bolívar	province	1	02	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
103	Guaranda	canton	6	0201	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
104	Guaranda	parish	103	020150	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
105	Facundo Vela	parish	103	020151	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
106	Julio E. Moreno	parish	103	020153	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
107	Salinas	parish	103	020155	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
108	San Lorenzo	parish	103	020156	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
109	San Simón	parish	103	020157	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
110	Santa Fe	parish	103	020158	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
111	Simiátug	parish	103	020159	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
112	San Luis De Pambil	parish	103	020160	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
113	Chillanes	canton	6	0202	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
114	Chillanes	parish	113	020250	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
115	San José Del Tambo	parish	113	020251	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
116	Chimbo	canton	6	0203	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
117	San José De Chimbo	parish	116	020350	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
118	Asunción	parish	116	020351	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
119	La Magdalena	parish	116	020353	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
120	San Sebastián	parish	116	020354	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
121	Telimbela	parish	116	020355	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
122	Echeandía	canton	6	0204	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
123	Echeandía	parish	122	020450	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
124	San Miguel	canton	6	0205	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
125	San Miguel	parish	124	020550	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
126	Balsapamba	parish	124	020551	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
127	Bilován	parish	124	020552	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
128	Régulo De Mora	parish	124	020553	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
129	San Pablo	parish	124	020554	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
130	Santiago	parish	124	020555	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
131	San Vicente	parish	124	020556	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
132	Caluma	canton	6	0206	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
133	Caluma	parish	132	020650	t	2026-07-24 10:51:51	2026-07-24 10:51:51	\N
134	Las Naves	canton	6	0207	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
135	Las Naves	parish	134	020750	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
136	Cañar	province	1	03	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
137	Azogues	canton	6	0301	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
138	Azogues	parish	137	030150	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
139	Cojitambo	parish	137	030151	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
140	Guapán	parish	137	030153	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
141	Javier Loyola	parish	137	030154	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
142	Luis Cordero	parish	137	030155	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
143	Pindilig	parish	137	030156	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
144	Rivera	parish	137	030157	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
145	San Miguel	parish	137	030158	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
146	Taday	parish	137	030160	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
147	Biblián	canton	6	0302	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
148	Biblián	parish	147	030250	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
149	Nazón	parish	147	030251	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
150	San Francisco De Sageo	parish	147	030252	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
151	Turupamba	parish	147	030253	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
152	Jerusalén	parish	147	030254	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
153	Cañar	canton	6	0303	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
154	Cañar	parish	153	030350	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
155	Chontamarca	parish	153	030351	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
156	Chorocopte	parish	153	030352	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
157	General Morales	parish	153	030353	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
158	Gualleturo	parish	153	030354	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
159	Honorato Vásquez	parish	153	030355	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
160	Ingapirca	parish	153	030356	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
161	Juncal	parish	153	030357	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
162	San Antonio	parish	153	030358	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
163	Zhud	parish	153	030361	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
164	Ventura	parish	153	030362	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
165	Ducur	parish	153	030363	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
166	La Troncal	canton	6	0304	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
167	La Troncal	parish	166	030450	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
168	Manuel J. Calle	parish	166	030451	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
169	Pancho Negro	parish	166	030452	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
170	El Tambo	canton	6	0305	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
171	El Tambo	parish	170	030550	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
172	Déleg	canton	6	0306	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
173	Déleg	parish	172	030650	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
174	Solano	parish	172	030651	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
175	Suscal	canton	6	0307	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
176	Suscal	parish	175	030750	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
177	Carchi	province	1	04	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
178	Tulcán	canton	5	0401	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
179	Tulcán	parish	178	040150	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
180	El Carmelo	parish	178	040151	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
181	Julio Andrade	parish	178	040153	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
182	Maldonado	parish	178	040154	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
183	Pioter	parish	178	040155	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
184	Tobar Donoso	parish	178	040156	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
185	Tufiño	parish	178	040157	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
186	Urbina	parish	178	040158	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
187	El Chical	parish	178	040159	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
188	Santa Martha De Cuba	parish	178	040161	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
189	Bolívar	canton	5	0402	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
190	Bolívar	parish	189	040250	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
191	García Moreno	parish	189	040251	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
192	Los Andes	parish	189	040252	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
193	Monte Olivo	parish	189	040253	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
194	San Vicente De Pusir	parish	189	040254	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
195	San Rafael	parish	189	040255	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
196	Espejo	canton	5	0403	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
197	El Ángel	parish	196	040350	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
198	El Goaltal	parish	196	040351	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
199	La Libertad	parish	196	040352	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
200	San Isidro	parish	196	040353	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
201	Mira	canton	5	0404	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
202	Mira	parish	201	040450	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
203	Concepción	parish	201	040451	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
204	Jijón Y Caamaño	parish	201	040452	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
205	Juan Montalvo	parish	201	040453	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
206	Montúfar	canton	5	0405	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
207	San Gabriel	parish	206	040550	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
208	Cristóbal Colón	parish	206	040551	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
209	Chitán De Navarrete	parish	206	040552	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
210	Fernández Salvador	parish	206	040553	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
211	La Paz	parish	206	040554	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
212	Piartal	parish	206	040555	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
213	San Pedro De Huaca	canton	5	0406	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
214	Huaca	parish	213	040650	t	2026-07-24 10:51:52	2026-07-24 10:51:52	\N
215	Mariscal Sucre	parish	213	040651	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
216	Cotopaxi	province	1	05	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
217	Latacunga	canton	5	0501	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
218	Latacunga	parish	217	050150	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
219	Aláquez	parish	217	050151	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
220	Belisario Quevedo	parish	217	050152	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
221	Guaytacama	parish	217	050153	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
222	Joseguango Bajo	parish	217	050154	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
223	Mulaló	parish	217	050156	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
224	Once De Noviembre	parish	217	050157	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
225	Poaló	parish	217	050158	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
226	San Juan De Pastocalle	parish	217	050159	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
227	Tanicuchí	parish	217	050161	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
228	Toacaso	parish	217	050162	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
229	La Maná	canton	5	0502	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
230	La Maná	parish	229	050250	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
231	Guasaganda	parish	229	050251	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
232	Pucayacu	parish	229	050252	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
233	Pangua	canton	5	0503	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
234	El Corazón	parish	233	050350	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
235	Moraspungo	parish	233	050351	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
236	Pinllopata	parish	233	050352	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
237	Ramón Campaña	parish	233	050353	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
238	Pujilí	canton	5	0504	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
239	Pujilí	parish	238	050450	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
240	Angamarca	parish	238	050451	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
241	Guangaje	parish	238	050453	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
242	La Victoria	parish	238	050455	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
243	Pilaló	parish	238	050456	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
244	Tingo	parish	238	050457	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
245	Zumbahua	parish	238	050458	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
246	Salcedo	canton	5	0505	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
247	San Miguel	parish	246	050550	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
248	Antonio José Holguín	parish	246	050551	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
249	Cusubamba	parish	246	050552	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
250	Mulalillo	parish	246	050553	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
251	Mulliquindil	parish	246	050554	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
252	Pansaleo	parish	246	050555	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
253	Saquisilí	canton	5	0506	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
254	Saquisilí	parish	253	050650	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
255	Canchagua	parish	253	050651	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
256	Chantilín	parish	253	050652	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
257	Cochapamba	parish	253	050653	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
258	Sigchos	canton	5	0507	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
259	Sigchos	parish	258	050750	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
260	Chugchillán	parish	258	050751	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
261	Isinlivi	parish	258	050752	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
262	Las Pampas	parish	258	050753	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
263	Palo Quemado	parish	258	050754	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
264	Chimborazo	province	1	06	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
265	Riobamba	canton	6	0601	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
266	Riobamba	parish	265	060150	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
267	Cacha	parish	265	060151	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
268	Calpi	parish	265	060152	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
269	Cubijíes	parish	265	060153	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
270	Flores	parish	265	060154	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
271	Licán	parish	265	060155	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
272	Licto	parish	265	060156	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
273	Pungalá	parish	265	060157	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
274	Punín	parish	265	060158	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
275	Quimiag	parish	265	060159	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
276	San Juan	parish	265	060160	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
277	San Luis	parish	265	060161	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
278	Alausí	canton	6	0602	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
279	Alausí	parish	278	060250	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
280	Achupallas	parish	278	060251	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
281	Guasuntos	parish	278	060253	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
282	Huigra	parish	278	060254	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
283	Multitud	parish	278	060255	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
284	Pistishi	parish	278	060256	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
285	Pumallacta	parish	278	060257	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
286	Sevilla	parish	278	060258	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
287	Sibambe	parish	278	060259	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
288	Tixán	parish	278	060260	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
289	Colta	canton	6	0603	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
290	Villa La Unión	parish	289	060350	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
291	Cañi	parish	289	060351	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
292	Columbe	parish	289	060352	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
293	Juan De Velasco	parish	289	060353	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
294	Santiago De Quito	parish	289	060354	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
295	Chambo	canton	6	0604	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
296	Chambo	parish	295	060450	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
297	Chunchi	canton	6	0605	t	2026-07-24 10:51:53	2026-07-24 10:51:53	\N
298	Chunchi	parish	297	060550	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
299	Capzol	parish	297	060551	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
300	Compud	parish	297	060552	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
301	Gonzol	parish	297	060553	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
302	Llagos	parish	297	060554	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
303	Guamote	canton	6	0606	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
304	Guamote	parish	303	060650	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
305	Cebadas	parish	303	060651	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
306	Palmira	parish	303	060652	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
307	Guano	canton	6	0607	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
308	Guano	parish	307	060750	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
309	Guanando	parish	307	060751	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
310	Ilapo	parish	307	060752	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
311	La Providencia	parish	307	060753	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
312	San Andrés	parish	307	060754	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
313	San Gerardo	parish	307	060755	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
314	San Isidro De Patulú	parish	307	060756	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
315	San José Del Chazo	parish	307	060757	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
316	Santa Fé De Galán	parish	307	060758	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
317	Valparaiso	parish	307	060759	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
318	Pallatanga	canton	6	0608	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
319	Pallatanga	parish	318	060850	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
320	Penipe	canton	6	0609	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
321	Penipe	parish	320	060950	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
322	El Altar	parish	320	060951	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
323	Matus	parish	320	060952	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
324	Puela	parish	320	060953	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
325	San Antonio De Bayushig	parish	320	060954	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
326	La Candelaria	parish	320	060955	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
327	Bilbao	parish	320	060956	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
328	Cumandá	canton	6	0610	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
329	Cumandá	parish	328	061050	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
330	El Oro	province	1	07	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
331	Machala	canton	4	0701	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
332	Machala	parish	331	070150	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
333	El Retiro	parish	331	070152	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
334	Arenillas	canton	4	0702	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
335	Arenillas	parish	334	070250	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
336	Chacras	parish	334	070251	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
337	Palmales	parish	334	070254	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
338	Carcabón	parish	334	070255	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
339	La Cuca	parish	334	070256	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
340	Atahualpa	canton	4	0703	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
341	Paccha	parish	340	070350	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
342	Ayapamba	parish	340	070351	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
343	Cordoncillo	parish	340	070352	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
344	Milagro	parish	340	070353	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
345	San José	parish	340	070354	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
346	San Juan De Cerro Azul	parish	340	070355	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
347	Balsas	canton	4	0704	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
348	Balsas	parish	347	070450	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
349	Bellamaría	parish	347	070451	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
350	Chilla	canton	4	0705	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
351	Chilla	parish	350	070550	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
352	El Guabo	canton	4	0706	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
353	El Guabo	parish	352	070650	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
354	Barbones	parish	352	070651	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
355	La Iberia	parish	352	070652	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
356	Tendales	parish	352	070653	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
357	Río Bonito	parish	352	070654	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
358	Huaquillas	canton	4	0707	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
359	Huaquillas	parish	358	070750	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
360	Marcabelí	canton	4	0708	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
361	Marcabelí	parish	360	070850	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
362	El Ingenio	parish	360	070851	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
363	Pasaje	canton	4	0709	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
364	Pasaje	parish	363	070950	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
365	Buenavista	parish	363	070951	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
366	Casacay	parish	363	070952	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
367	La Peaña	parish	363	070953	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
368	Progreso	parish	363	070954	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
369	Uzhcurrumi	parish	363	070955	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
370	Cañaquemada	parish	363	070956	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
371	Piñas	canton	4	0710	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
372	Piñas	parish	371	071050	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
373	Capiro	parish	371	071051	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
374	La Bocana	parish	371	071052	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
375	Moromoro	parish	371	071053	t	2026-07-24 10:51:54	2026-07-24 10:51:54	\N
376	Piedras	parish	371	071054	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
377	San Roque	parish	371	071055	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
378	Saracay	parish	371	071056	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
379	Portovelo	canton	4	0711	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
380	Portovelo	parish	379	071150	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
381	Curtincapa	parish	379	071151	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
382	Morales	parish	379	071152	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
383	Salatí	parish	379	071153	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
384	Santa Rosa	canton	4	0712	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
385	Santa Rosa	parish	384	071250	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
386	Bellavista	parish	384	071251	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
387	Jambelí	parish	384	071252	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
388	La Avanzada	parish	384	071253	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
389	San Antonio	parish	384	071254	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
390	Torata	parish	384	071255	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
391	Victoria	parish	384	071256	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
392	Bellamaría	parish	384	071257	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
393	Zaruma	canton	4	0713	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
394	Zaruma	parish	393	071350	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
395	Abañín	parish	393	071351	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
396	Arcapamba	parish	393	071352	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
397	Guanazán	parish	393	071353	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
398	Guizhaguiña	parish	393	071354	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
399	Huertas	parish	393	071355	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
400	Malvas	parish	393	071356	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
401	Muluncay Grande	parish	393	071357	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
402	Sinsao	parish	393	071358	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
403	Salvias	parish	393	071359	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
404	Las Lajas	canton	4	0714	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
405	La Victoria	parish	404	071450	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
406	La Libertad	parish	404	071451	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
407	El Paraíso	parish	404	071452	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
408	San Isidro	parish	404	071453	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
409	Esmeraldas	province	1	08	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
410	Esmeraldas	canton	2	0801	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
411	Esmeraldas	parish	410	080150	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
412	Camarones	parish	410	080152	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
413	Coronel Carlos Concha Torres	parish	410	080153	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
414	Chinca	parish	410	080154	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
415	Majua	parish	410	080159	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
416	San Mateo	parish	410	080163	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
417	Tabiazo	parish	410	080165	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
418	Tachina	parish	410	080166	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
419	Vuelta Larga	parish	410	080168	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
420	Eloy Alfaro	canton	2	0802	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
421	Valdez	parish	420	080250	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
422	Anchayacu	parish	420	080251	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
423	Atahualpa	parish	420	080252	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
424	Borbón	parish	420	080253	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
425	La Tola	parish	420	080254	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
426	Luis Vargas Torres	parish	420	080255	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
427	Maldonado	parish	420	080256	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
428	Pampanal De Bolívar	parish	420	080257	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
429	San Francisco De Onzole	parish	420	080258	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
430	Santo Domingo De Onzole	parish	420	080259	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
431	Selva Alegre	parish	420	080260	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
432	Telembí	parish	420	080261	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
433	Colón Eloy Del María	parish	420	080262	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
434	San José De Cayapas	parish	420	080263	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
435	Timbiré	parish	420	080264	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
436	Santa Lucía De Las Peñas	parish	420	080265	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
437	Muisne	canton	2	0803	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
438	Muisne	parish	437	080350	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
439	Bolívar	parish	437	080351	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
440	Daule	parish	437	080352	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
441	Galera	parish	437	080353	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
442	Quingue	parish	437	080354	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
443	Sálima	parish	437	080355	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
444	San Francisco	parish	437	080356	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
445	San Gregorio	parish	437	080357	t	2026-07-24 10:51:55	2026-07-24 10:51:55	\N
446	San José De Chamanga	parish	437	080358	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
447	Quinindé	canton	2	0804	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
448	Rosa Zárate	parish	447	080450	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
449	Cube	parish	447	080451	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
450	Chura	parish	447	080452	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
451	Malimpia	parish	447	080453	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
452	Viche	parish	447	080454	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
453	La Unión	parish	447	080455	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
454	San Lorenzo	canton	2	0805	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
455	San Lorenzo	parish	454	080550	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
456	Alto Tambo	parish	454	080551	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
457	Ancón	parish	454	080552	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
458	Calderón	parish	454	080553	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
459	Carondelet	parish	454	080554	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
460	5 De Junio	parish	454	080555	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
461	Concepción	parish	454	080556	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
462	Mataje	parish	454	080557	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
463	San Javier De Cachaví	parish	454	080558	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
464	Santa Rita	parish	454	080559	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
465	Tambillo	parish	454	080560	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
466	Tululbí	parish	454	080561	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
467	Urbina	parish	454	080562	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
468	Atacames	canton	2	0806	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
469	Atacames	parish	468	080650	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
470	La Unión	parish	468	080651	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
471	Súa	parish	468	080652	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
472	Tonchigüe	parish	468	080653	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
473	Tonsupa	parish	468	080654	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
474	Rioverde	canton	2	0807	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
475	Rioverde	parish	474	080750	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
476	Chontaduro	parish	474	080751	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
477	Chumundé	parish	474	080752	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
478	Lagarto	parish	474	080753	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
479	Montalvo	parish	474	080754	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
480	Rocafuerte	parish	474	080755	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
481	Guayas	province	1	09	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
482	Guayaquil	canton	3	0901	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
483	Guayaquil	parish	482	090150	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
484	Juan Gómez Rendón	parish	482	090152	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
485	Morro	parish	482	090153	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
486	Posorja	parish	482	090156	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
487	Puná	parish	482	090157	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
488	Tenguel	parish	482	090158	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
489	Alfredo Baquerizo Moreno (Juján)	canton	3	0902	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
490	Alfredo Baquerizo Moreno (Juján)	parish	489	090250	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
491	Balao	canton	3	0903	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
492	Balao	parish	491	090350	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
493	Balzar	canton	3	0904	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
494	Balzar	parish	493	090450	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
495	Colimes	canton	3	0905	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
496	Colimes	parish	495	090550	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
497	San Jacinto	parish	495	090551	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
498	Daule	canton	3	0906	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
499	Daule	parish	498	090650	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
500	Juan Bautista Aguirre	parish	498	090652	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
501	Laurel	parish	498	090653	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
502	Limonal	parish	498	090654	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
503	Los Lojas	parish	498	090656	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
504	Durán	canton	3	0907	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
505	Eloy Alfaro	parish	504	090750	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
506	El Empalme	canton	3	0908	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
507	Velasco Ibarra	parish	506	090850	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
508	Guayas	parish	506	090851	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
509	El Rosario	parish	506	090852	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
510	El Triunfo	canton	3	0909	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
511	El Triunfo	parish	510	090950	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
512	Milagro	canton	3	0910	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
513	Milagro	parish	512	091050	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
514	Chobo	parish	512	091051	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
515	Mariscal Sucre	parish	512	091053	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
516	Roberto Astudillo	parish	512	091054	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
517	Naranjal	canton	3	0911	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
518	Naranjal	parish	517	091150	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
519	Jesús María	parish	517	091151	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
520	San Carlos	parish	517	091152	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
521	Santa Rosa De Flandes	parish	517	091153	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
522	Taura	parish	517	091154	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
523	Naranjito	canton	3	0912	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
524	Naranjito	parish	523	091250	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
525	Palestina	canton	3	0913	t	2026-07-24 10:51:56	2026-07-24 10:51:56	\N
526	Palestina	parish	525	091350	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
527	Pedro Carbo	canton	3	0914	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
528	Pedro Carbo	parish	527	091450	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
529	Valle De La Virgen	parish	527	091451	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
530	Sabanilla	parish	527	091452	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
531	Samborondón	canton	3	0916	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
532	Samborondón	parish	531	091650	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
533	Tarifa	parish	531	091651	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
534	Santa Lucía	canton	3	0918	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
535	Santa Lucía	parish	534	091850	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
536	Salitre	canton	3	0919	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
537	El Salitre	parish	536	091950	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
538	General Vernaza	parish	536	091951	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
539	La Victoria	parish	536	091952	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
540	Junquillal	parish	536	091953	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
541	San Jacinto De Yaguachi	canton	3	0920	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
542	San Jacinto De Yaguachi	parish	541	092050	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
543	General Pedro J. Montero	parish	541	092053	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
544	Yaguachi Viejo	parish	541	092055	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
545	Virgen De Fátima	parish	541	092056	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
546	Playas	canton	3	0921	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
547	General Villamil	parish	546	092150	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
548	Simón Bolívar	canton	3	0922	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
549	Simón Bolívar	parish	548	092250	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
550	Coronel Lorenzo De Garaycoa	parish	548	092251	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
551	Coronel Marcelino Maridueña	canton	3	0923	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
552	Coronel Marcelino Maridueña	parish	551	092350	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
553	Lomas De Sargentillo	canton	3	0924	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
554	Lomas De Sargentillo	parish	553	092450	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
555	Nobol	canton	3	0925	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
556	Narcisa De Jesús	parish	555	092550	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
557	General Antonio Elizalde	canton	3	0927	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
558	General Antonio Elizalde	parish	557	092750	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
559	Isidro Ayora	canton	3	0928	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
560	Isidro Ayora	parish	559	092850	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
561	Imbabura	province	1	10	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
562	Ibarra	canton	5	1001	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
563	San Miguel De Ibarra	parish	562	100150	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
564	Ambuquí	parish	562	100151	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
565	Angochagua	parish	562	100152	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
566	La Carolina	parish	562	100153	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
567	La Esperanza	parish	562	100154	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
568	Lita	parish	562	100155	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
569	Salinas	parish	562	100156	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
570	San Antonio	parish	562	100157	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
571	Antonio Ante	canton	5	1002	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
572	Atuntaqui	parish	571	100250	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
573	Imbaya	parish	571	100251	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
574	San Francisco De Natabuela	parish	571	100252	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
575	San José De Chaltura	parish	571	100253	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
576	San Roque	parish	571	100254	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
577	Cotacachi	canton	5	1003	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
578	Cotacachi	parish	577	100350	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
579	Apuela	parish	577	100351	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
580	García Moreno	parish	577	100352	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
581	Imantag	parish	577	100353	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
582	Peñaherrera	parish	577	100354	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
583	Plaza Gutiérrez	parish	577	100355	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
584	Quiroga	parish	577	100356	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
585	Seis De Julio De Cuellaje	parish	577	100357	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
586	Vacas Galindo	parish	577	100358	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
587	Otavalo	canton	5	1004	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
588	Otavalo	parish	587	100450	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
589	Dr. Miguel Egas Cabezas	parish	587	100451	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
590	Eugenio Espejo	parish	587	100452	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
591	González Suárez	parish	587	100453	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
592	Pataquí	parish	587	100454	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
593	San José De Quichinche	parish	587	100455	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
594	San Juan De Ilumán	parish	587	100456	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
595	San Pablo	parish	587	100457	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
596	San Rafael	parish	587	100458	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
597	Selva Alegre	parish	587	100459	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
598	Pimampiro	canton	5	1005	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
599	Pimampiro	parish	598	100550	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
600	Chugá	parish	598	100551	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
601	Mariano Acosta	parish	598	100552	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
602	San Francisco De Sigsipamba	parish	598	100553	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
603	San Miguel De Urcuquí	canton	5	1006	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
604	Urcuquí	parish	603	100650	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
605	Cahuasquí	parish	603	100651	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
606	La Merced De Buenos Aires	parish	603	100652	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
607	Pablo Arenas	parish	603	100653	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
608	San Blas	parish	603	100654	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
609	Tumbabiro	parish	603	100655	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
610	Loja	province	1	11	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
611	Loja	canton	6	1101	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
612	Loja	parish	611	110150	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
613	Chantaco	parish	611	110151	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
614	Chuquiribamba	parish	611	110152	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
615	El Cisne	parish	611	110153	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
616	Gualel	parish	611	110154	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
617	Jimbilla	parish	611	110155	t	2026-07-24 10:51:57	2026-07-24 10:51:57	\N
618	Malacatos	parish	611	110156	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
619	San Lucas	parish	611	110157	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
620	San Pedro De Vilcabamba	parish	611	110158	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
621	Santiago	parish	611	110159	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
622	Taquil	parish	611	110160	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
623	Vilcabamba	parish	611	110161	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
624	Yangana	parish	611	110162	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
625	Quinara	parish	611	110163	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
626	Calvas	canton	6	1102	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
627	Cariamanga	parish	626	110250	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
628	Colaisaca	parish	626	110251	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
629	El Lucero	parish	626	110252	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
630	Utuana	parish	626	110253	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
631	Sanguillín	parish	626	110254	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
632	Catamayo	canton	6	1103	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
633	Catamayo	parish	632	110350	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
634	El Tambo	parish	632	110351	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
635	Guayquichuma	parish	632	110352	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
636	San Pedro De La Bendita	parish	632	110353	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
637	Zambi	parish	632	110354	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
638	Celica	canton	6	1104	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
639	Celica	parish	638	110450	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
640	Cruzpamba	parish	638	110451	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
641	Pózul	parish	638	110455	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
642	Sabanilla	parish	638	110456	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
643	Teniente Maximiliano Rodríguez Loaiza	parish	638	110457	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
644	Chaguarpamba	canton	6	1105	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
645	Chaguarpamba	parish	644	110550	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
646	Buenavista	parish	644	110551	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
647	El Rosario	parish	644	110552	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
648	Santa Rufina	parish	644	110553	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
649	Amarillos	parish	644	110554	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
650	Espíndola	canton	6	1106	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
651	Amaluza	parish	650	110650	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
652	Bellavista	parish	650	110651	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
653	Jimbura	parish	650	110652	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
654	Santa Teresita	parish	650	110653	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
655	27 De Abril	parish	650	110654	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
656	El Ingenio	parish	650	110655	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
657	El Airo	parish	650	110656	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
658	Gonzanamá	canton	6	1107	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
659	Gonzanamá	parish	658	110750	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
660	Changaimina	parish	658	110751	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
661	Nambacola	parish	658	110753	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
662	Purunuma	parish	658	110754	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
663	Sacapalca	parish	658	110756	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
664	Macará	canton	6	1108	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
665	Macará	parish	664	110850	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
666	Larama	parish	664	110851	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
667	La Victoria	parish	664	110852	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
668	Sabiango	parish	664	110853	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
669	Paltas	canton	6	1109	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
670	Catacocha	parish	669	110950	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
671	Cangonamá	parish	669	110951	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
672	Guachanamá	parish	669	110952	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
673	Lauro Guerrero	parish	669	110954	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
674	Orianga	parish	669	110956	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
675	San Antonio	parish	669	110957	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
676	Casanga	parish	669	110958	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
677	Yamana	parish	669	110959	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
678	Puyango	canton	6	1110	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
679	Alamor	parish	678	111050	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
680	Ciano	parish	678	111051	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
681	El Arenal	parish	678	111052	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
682	El Limo	parish	678	111053	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
683	Mercadillo	parish	678	111054	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
684	Vicentino	parish	678	111055	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
685	Saraguro	canton	6	1111	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
686	Saraguro	parish	685	111150	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
687	El Paraíso De Celen	parish	685	111151	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
688	El Tablón	parish	685	111152	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
689	Lluzhapa	parish	685	111153	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
690	Manú	parish	685	111154	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
691	San Antonio De Qumbe	parish	685	111155	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
692	San Pablo De Tenta	parish	685	111156	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
693	San Sebastián De Yúluc	parish	685	111157	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
694	Selva Alegre	parish	685	111158	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
695	Urdaneta	parish	685	111159	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
696	Sumaypamba	parish	685	111160	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
697	Sozoranga	canton	6	1112	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
698	Sozoranga	parish	697	111250	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
699	Nueva Fátima	parish	697	111251	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
700	Tacamoros	parish	697	111252	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
701	Zapotillo	canton	6	1113	t	2026-07-24 10:51:58	2026-07-24 10:51:58	\N
702	Zapotillo	parish	701	111350	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
703	Mangahurco	parish	701	111351	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
704	Garzareal	parish	701	111352	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
705	Limones	parish	701	111353	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
706	Paletillas	parish	701	111354	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
707	Bolaspamba	parish	701	111355	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
708	Cazaderos	parish	701	111356	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
709	Pindal	canton	6	1114	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
710	Pindal	parish	709	111450	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
711	Chaquinal	parish	709	111451	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
712	12 De Diciembre	parish	709	111452	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
713	Milagros	parish	709	111453	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
714	Quilanga	canton	6	1115	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
715	Quilanga	parish	714	111550	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
716	Fundochamba	parish	714	111551	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
717	San Antonio De Las Aradas	parish	714	111552	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
718	Olmedo	canton	6	1116	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
719	Olmedo	parish	718	111650	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
720	La Tingue	parish	718	111651	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
721	Los Ríos	province	1	12	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
722	Babahoyo	canton	4	1201	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
723	Babahoyo	parish	722	120150	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
724	Caracol	parish	722	120152	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
725	Febres Cordero	parish	722	120153	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
726	Pimocha	parish	722	120154	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
727	La Unión	parish	722	120155	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
728	Baba	canton	4	1202	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
729	Baba	parish	728	120250	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
730	Guare	parish	728	120251	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
731	Isla De Bejucal	parish	728	120252	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
732	Montalvo	canton	4	1203	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
733	Montalvo	parish	732	120350	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
734	La Esmeralda	parish	732	120351	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
735	Puebloviejo	canton	4	1204	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
736	Puebloviejo	parish	735	120450	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
737	Puerto Pechiche	parish	735	120451	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
738	San Juan	parish	735	120452	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
739	Quevedo	canton	4	1205	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
740	Quevedo	parish	739	120550	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
741	San Carlos	parish	739	120553	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
742	La Esperanza	parish	739	120555	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
743	Urdaneta	canton	4	1206	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
744	Catarama	parish	743	120650	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
745	Ricaurte	parish	743	120651	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
746	Ventanas	canton	4	1207	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
747	Ventanas	parish	746	120750	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
748	Zapotal	parish	746	120752	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
749	Chacarita	parish	746	120753	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
750	Los Ángeles	parish	746	120754	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
751	Vinces	canton	4	1208	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
752	Vinces	parish	751	120850	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
753	Antonio Sotomayor	parish	751	120851	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
754	Palenque	canton	4	1209	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
755	Palenque	parish	754	120950	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
756	Buena Fe	canton	4	1210	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
757	San Jacinto De Buena Fe	parish	756	121050	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
758	Patricia Pilar	parish	756	121051	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
759	Valencia	canton	4	1211	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
760	Valencia	parish	759	121150	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
761	Mocache	canton	4	1212	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
762	Mocache	parish	761	121250	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
763	Quinsaloma	canton	4	1213	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
764	Quinsaloma	parish	763	121350	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
765	Manabí	province	1	13	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
766	Portoviejo	canton	2	1301	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
767	Portoviejo	parish	766	130150	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
768	Abdón Calderón	parish	766	130151	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
769	Alhajuela	parish	766	130152	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
770	Crucita	parish	766	130153	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
771	Pueblo Nuevo	parish	766	130154	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
772	Riochico	parish	766	130155	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
773	San Plácido	parish	766	130156	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
774	Chirijos	parish	766	130157	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
775	Bolívar	canton	2	1302	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
776	Calceta	parish	775	130250	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
777	Membrillo	parish	775	130251	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
778	Quiroga	parish	775	130252	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
779	Chone	canton	2	1303	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
780	Chone	parish	779	130350	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
781	Boyacá	parish	779	130351	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
782	Canuto	parish	779	130352	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
783	Convento	parish	779	130353	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
784	Chibunga	parish	779	130354	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
785	Eloy Alfaro	parish	779	130355	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
786	Ricaurte	parish	779	130356	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
787	San Antonio	parish	779	130357	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
788	El Carmen	canton	2	1304	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
789	El Carmen	parish	788	130450	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
790	Wilfrido Loor Moreira	parish	788	130451	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
791	San Pedro De Suma	parish	788	130452	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
792	Santa María	parish	788	130453	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
793	El Paraíso La 14	parish	788	130454	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
794	Flavio Alfaro	canton	2	1305	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
795	Flavio Alfaro	parish	794	130550	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
796	San Francisco De Novillo	parish	794	130551	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
797	Zapallo	parish	794	130552	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
798	Jipijapa	canton	2	1306	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
799	Jipijapa	parish	798	130650	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
800	América	parish	798	130651	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
801	El Anegado	parish	798	130652	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
802	Julcuy	parish	798	130653	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
803	La Unión	parish	798	130654	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
804	Membrillal	parish	798	130656	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
805	Pedro Pablo Gómez	parish	798	130657	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
806	Puerto Cayo	parish	798	130658	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
807	Junín	canton	2	1307	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
808	Junín	parish	807	130750	t	2026-07-24 10:51:59	2026-07-24 10:51:59	\N
809	Manta	canton	2	1308	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
810	Manta	parish	809	130850	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
811	San Lorenzo	parish	809	130851	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
812	Santa Marianita	parish	809	130852	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
813	Montecristi	canton	2	1309	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
814	Montecristi	parish	813	130950	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
815	La Pila	parish	813	130952	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
816	Paján	canton	2	1310	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
817	Paján	parish	816	131050	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
818	Campozano	parish	816	131051	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
819	Cascol	parish	816	131052	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
820	Guale	parish	816	131053	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
821	Lascano	parish	816	131054	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
822	Pichincha	canton	2	1311	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
823	Pichincha	parish	822	131150	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
824	Barraganete	parish	822	131151	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
825	San Sebastián	parish	822	131152	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
826	Rocafuerte	canton	2	1312	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
827	Rocafuerte	parish	826	131250	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
828	Sosote	parish	826	131251	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
829	Santa Ana	canton	2	1313	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
830	Santa Ana De Vuelta Larga	parish	829	131350	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
831	Ayacucho	parish	829	131351	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
832	Honorato Vásquez	parish	829	131352	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
833	La Unión	parish	829	131353	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
834	San Pablo	parish	829	131355	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
835	Sucre	canton	2	1314	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
836	Bahía De Caráquez	parish	835	131450	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
837	Charapotó	parish	835	131453	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
838	San Isidro	parish	835	131457	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
839	Tosagua	canton	2	1315	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
840	Tosagua	parish	839	131550	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
841	Bachillero	parish	839	131551	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
842	Ángel Pedro Giler	parish	839	131552	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
843	24 De Mayo	canton	2	1316	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
844	Sucre	parish	843	131650	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
845	Bellavista	parish	843	131651	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
846	Noboa	parish	843	131652	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
847	Arquitecto Sixto Durán Ballén	parish	843	131653	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
848	Pedernales	canton	2	1317	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
849	Pedernales	parish	848	131750	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
850	Cojimíes	parish	848	131751	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
851	Diez De Agosto	parish	848	131752	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
852	Atahualpa	parish	848	131753	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
853	Olmedo	canton	2	1318	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
854	Olmedo	parish	853	131850	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
855	Puerto López	canton	2	1319	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
856	Puerto López	parish	855	131950	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
857	Machalilla	parish	855	131951	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
858	Salango	parish	855	131952	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
859	Jama	canton	2	1320	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
860	Jama	parish	859	132050	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
861	Jaramijó	canton	2	1321	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
862	Jaramijó	parish	861	132150	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
863	San Vicente	canton	2	1322	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
864	San Vicente	parish	863	132250	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
865	Canoa	parish	863	132251	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
866	Morona Santiago	province	1	14	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
867	Morona	canton	7	1401	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
868	Macas	parish	867	140150	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
869	Alshi	parish	867	140151	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
870	General Proaño	parish	867	140153	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
871	San Isidro	parish	867	140156	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
872	Sinaí	parish	867	140158	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
873	Zuña	parish	867	140160	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
874	Cuchaentza	parish	867	140162	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
875	Río Blanco	parish	867	140164	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
876	Gualaquiza	canton	7	1402	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
877	Gualaquiza	parish	876	140250	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
878	Amazonas	parish	876	140251	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
879	Bermejos	parish	876	140252	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
880	Bomboíza	parish	876	140253	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
881	Chigüinda	parish	876	140254	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
882	El Rosario	parish	876	140255	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
883	Nueva Tarqui	parish	876	140256	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
884	San Miguel De Cuyes	parish	876	140257	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
885	El Ideal	parish	876	140258	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
886	Limón Indanza	canton	7	1403	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
887	General Leonidas Plaza Gutiérrez	parish	886	140350	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
888	Indanza	parish	886	140351	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
889	San Antonio	parish	886	140353	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
890	San Miguel De Conchay	parish	886	140356	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
891	Santa Susana De Chiviaza	parish	886	140357	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
892	Yunganza	parish	886	140358	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
893	Palora	canton	7	1404	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
894	Palora	parish	893	140450	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
895	Arapicos	parish	893	140451	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
896	Cumandá	parish	893	140452	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
897	Sangay	parish	893	140454	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
898	16 De Agosto	parish	893	140455	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
899	Santiago	canton	7	1405	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
900	Santiago De Méndez	parish	899	140550	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
901	Copal	parish	899	140551	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
902	Chupianza	parish	899	140552	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
903	Patuca	parish	899	140553	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
904	San Luis De El Acho	parish	899	140554	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
905	Tayuza	parish	899	140556	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
906	San Francisco De Chinimbimi	parish	899	140557	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
907	Sucúa	canton	7	1406	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
908	Sucúa	parish	907	140650	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
909	Asunción	parish	907	140651	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
910	Huambi	parish	907	140652	t	2026-07-24 10:52:00	2026-07-24 10:52:00	\N
911	Santa Marianita De Jesús	parish	907	140655	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
912	Huamboya	canton	7	1407	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
913	Huamboya	parish	912	140750	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
914	Chiguaza	parish	912	140751	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
915	San Juan Bosco	canton	7	1408	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
916	San Juan Bosco	parish	915	140850	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
917	Pan De Azúcar	parish	915	140851	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
918	San Carlos De Limón	parish	915	140852	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
919	San Jacinto De Wakambeis	parish	915	140853	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
920	Santiago De Pananza	parish	915	140854	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
921	Taisha	canton	7	1409	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
922	Taisha	parish	921	140950	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
923	Huasaga	parish	921	140951	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
924	Macuma	parish	921	140952	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
925	Tuutinentsa	parish	921	140953	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
926	Pumpuentsa	parish	921	140954	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
927	Logroño	canton	7	1410	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
928	Logroño	parish	927	141050	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
929	Yaupi	parish	927	141051	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
930	Shimpis	parish	927	141052	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
931	Pablo Sexto	canton	7	1411	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
932	Pablo Sexto	parish	931	141150	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
933	Tiwintza	canton	7	1412	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
934	Santiago	parish	933	141250	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
935	San José De Morona	parish	933	141251	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
936	Sevilla Don Bosco	canton	7	1413	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
937	Sevilla Don Bosco	parish	936	141350	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
938	Napo	province	1	15	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
939	Tena	canton	9	1501	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
940	Tena	parish	939	150150	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
941	Ahuano	parish	939	150151	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
942	Chontapunta	parish	939	150153	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
943	Pano	parish	939	150154	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
944	Puerto Misahuallí	parish	939	150155	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
945	Puerto Napo	parish	939	150156	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
946	Tálag	parish	939	150157	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
947	San Juan De Muyuna	parish	939	150158	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
948	Archidona	canton	9	1503	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
949	Archidona	parish	948	150350	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
950	Cotundo	parish	948	150352	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
951	San Pablo De Ushpayacu	parish	948	150354	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
952	Hatun Sumaku	parish	948	150356	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
953	El Chaco	canton	9	1504	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
954	El Chaco	parish	953	150450	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
955	Gonzalo Díaz De Pineda	parish	953	150451	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
956	Linares	parish	953	150452	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
957	Oyacachi	parish	953	150453	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
958	Santa Rosa	parish	953	150454	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
959	Sardinas	parish	953	150455	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
960	Quijos	canton	9	1507	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
961	Baeza	parish	960	150750	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
962	Cosanga	parish	960	150751	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
963	Cuyuja	parish	960	150752	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
964	Papallacta	parish	960	150753	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
965	San Francisco De Borja	parish	960	150754	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
966	Sumaco	parish	960	150756	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
967	Carlos Julio Arosemena Tola	canton	9	1509	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
968	Carlos Julio Arosemena Tola	parish	967	150950	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
969	Pastaza	province	1	16	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
970	Pastaza	canton	7	1601	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
971	Puyo	parish	970	160150	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
972	Canelos	parish	970	160152	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
973	Diez De Agosto	parish	970	160154	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
974	Fátima	parish	970	160155	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
975	Montalvo	parish	970	160156	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
976	Pomona	parish	970	160157	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
977	Río Corrientes	parish	970	160158	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
978	Río Tigre	parish	970	160159	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
979	Sarayacu	parish	970	160161	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
980	Simón Bolívar	parish	970	160162	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
981	Tarqui	parish	970	160163	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
982	Teniente Hugo Ortiz	parish	970	160164	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
983	Veracruz	parish	970	160165	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
984	El Triunfo	parish	970	160166	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
985	Mera	canton	7	1602	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
986	Mera	parish	985	160250	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
987	Madre Tierra	parish	985	160251	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
988	Shell	parish	985	160252	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
989	Santa Clara	canton	7	1603	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
990	Santa Clara	parish	989	160350	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
991	San José	parish	989	160351	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
992	Arajuno	canton	7	1604	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
993	Arajuno	parish	992	160450	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
994	Curaray	parish	992	160451	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
995	Pichincha	province	1	17	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
996	Distrito Metropolitano De Quito	canton	5	1701	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
997	Quito	parish	996	170150	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
998	Alangasí	parish	996	170151	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
999	Amaguaña	parish	996	170152	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
1000	Atahualpa	parish	996	170153	t	2026-07-24 10:52:01	2026-07-24 10:52:01	\N
1001	Calacalí	parish	996	170154	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1002	Calderón	parish	996	170155	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1003	Conocoto	parish	996	170156	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1004	Cumbayá	parish	996	170157	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1005	Chavezpamba	parish	996	170158	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1006	Checa	parish	996	170159	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1007	El Quinche	parish	996	170160	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1008	Gualea	parish	996	170161	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1009	Guangopolo	parish	996	170162	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1010	Guayllabamba	parish	996	170163	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1011	La Merced	parish	996	170164	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1012	Llano Chico	parish	996	170165	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1013	Lloa	parish	996	170166	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1014	Nanegal	parish	996	170168	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1015	Nanegalito	parish	996	170169	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1016	Nayón	parish	996	170170	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1017	Nono	parish	996	170171	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1018	Pacto	parish	996	170172	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1019	Perucho	parish	996	170174	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1020	Pifo	parish	996	170175	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1021	Píntag	parish	996	170176	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1022	Pomasqui	parish	996	170177	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1023	Puéllaro	parish	996	170178	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1024	Puembo	parish	996	170179	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1025	San Antonio	parish	996	170180	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1026	San José De Minas	parish	996	170181	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1027	Tababela	parish	996	170183	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1028	Tumbaco	parish	996	170184	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1029	Yaruquí	parish	996	170185	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1030	Zámbiza	parish	996	170186	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1031	Cayambe	canton	5	1702	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1032	Cayambe	parish	1031	170250	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1033	Ascázubi	parish	1031	170251	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1034	Cangahua	parish	1031	170252	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1035	Olmedo	parish	1031	170253	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1036	Otón	parish	1031	170254	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1037	Santa Rosa De Cuzubamba	parish	1031	170255	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1038	San José De Ayora	parish	1031	170256	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1039	Juan Montalvo	parish	1031	170257	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1040	Mejía	canton	5	1703	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1041	Machachi	parish	1040	170350	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1042	Aloag	parish	1040	170351	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1043	Aloasí	parish	1040	170352	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1044	Cutuglahua	parish	1040	170353	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1045	El Chaupi	parish	1040	170354	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1046	Manuel Cornejo Astorga	parish	1040	170355	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1047	Tambillo	parish	1040	170356	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1048	Uyumbicho	parish	1040	170357	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1049	Pedro Moncayo	canton	5	1704	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1050	Tabacundo	parish	1049	170450	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1051	La Esperanza	parish	1049	170451	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1052	Malchinguí	parish	1049	170452	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1053	Tocachi	parish	1049	170453	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1054	Tupigachi	parish	1049	170454	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1055	Rumiñahui	canton	5	1705	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1056	Sangolquí	parish	1055	170550	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1057	Cotogchoa	parish	1055	170551	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1058	Rumipamba	parish	1055	170552	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1059	San Miguel De Los Bancos	canton	5	1707	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1060	San Miguel De Los Bancos	parish	1059	170750	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1061	Mindo	parish	1059	170751	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1062	Pedro Vicente Maldonado	canton	5	1708	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1063	Pedro Vicente Maldonado	parish	1062	170850	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1064	Puerto Quito	canton	5	1709	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1065	Puerto Quito	parish	1064	170950	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1066	Tungurahua	province	1	18	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1067	Ambato	canton	5	1801	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1068	Ambato	parish	1067	180150	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1069	Ambatillo	parish	1067	180151	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1070	Atahualpa	parish	1067	180152	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1071	Augusto N. Martínez	parish	1067	180153	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1072	Constantino Fernández	parish	1067	180154	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1073	Huachi Grande	parish	1067	180155	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1074	Izamba	parish	1067	180156	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1075	Juan Benigno Vela	parish	1067	180157	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1076	Montalvo	parish	1067	180158	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1077	Pasa	parish	1067	180159	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1078	Picaihua	parish	1067	180160	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1079	Pilagüín	parish	1067	180161	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1080	Quisapincha	parish	1067	180162	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1081	San Bartolomé De Pinllo	parish	1067	180163	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1082	San Fernando	parish	1067	180164	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1083	Santa Rosa	parish	1067	180165	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1084	Totoras	parish	1067	180166	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1085	Cunchibamba	parish	1067	180167	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1086	Unamuncho	parish	1067	180168	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1087	Baños De Agua Santa	canton	5	1802	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1088	Baños	parish	1087	180250	t	2026-07-24 10:52:02	2026-07-24 10:52:02	\N
1089	Lligua	parish	1087	180251	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1090	Río Negro	parish	1087	180252	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1091	Río Verde	parish	1087	180253	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1092	Ulba	parish	1087	180254	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1093	Cevallos	canton	5	1803	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1094	Cevallos	parish	1093	180350	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1095	Mocha	canton	5	1804	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1096	Mocha	parish	1095	180450	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1097	Pinguilí	parish	1095	180451	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1098	Patate	canton	5	1805	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1099	Patate	parish	1098	180550	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1100	El Triunfo	parish	1098	180551	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1101	Los Andes	parish	1098	180552	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1102	Sucre	parish	1098	180553	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1103	Quero	canton	5	1806	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1104	Quero	parish	1103	180650	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1105	Rumipamba	parish	1103	180651	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1106	Yanayacu Mochapata	parish	1103	180652	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1107	San Pedro De Pelileo	canton	5	1807	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1108	Pelileo	parish	1107	180750	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1109	Benítez	parish	1107	180751	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1110	Bolívar	parish	1107	180752	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1111	Cotaló	parish	1107	180753	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1112	Chiquicha	parish	1107	180754	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1113	El Rosario	parish	1107	180755	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1114	García Moreno	parish	1107	180756	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1115	Guambaló	parish	1107	180757	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1116	Salasaca	parish	1107	180758	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1117	Santiago De Píllaro	canton	5	1808	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1118	Píllaro	parish	1117	180850	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1119	Baquerizo Moreno	parish	1117	180851	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1120	Emilio María Terán	parish	1117	180852	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1121	Marcos Espinel	parish	1117	180853	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1122	Presidente Urbina	parish	1117	180854	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1123	San Andrés	parish	1117	180855	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1124	San José De Poaló	parish	1117	180856	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1125	San Miguelito	parish	1117	180857	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1126	Tisaleo	canton	5	1809	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1127	Tisaleo	parish	1126	180950	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1128	Quinchicoto	parish	1126	180951	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1129	Zamora Chinchipe	province	1	19	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1130	Zamora	canton	7	1901	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1131	Zamora	parish	1130	190150	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1132	Cumbaratza	parish	1130	190151	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1133	Guadalupe	parish	1130	190152	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1134	Imbana	parish	1130	190153	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1135	Sabanilla	parish	1130	190155	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1136	Timbara	parish	1130	190156	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1137	San Carlos De Las Minas	parish	1130	190158	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1138	Chinchipe	canton	7	1902	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1139	Zumba	parish	1138	190250	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1140	Chito	parish	1138	190251	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1141	El Chorro	parish	1138	190252	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1142	La Chonta	parish	1138	190254	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1143	Pucapamba	parish	1138	190256	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1144	San Andrés	parish	1138	190259	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1145	Nangaritza	canton	7	1903	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1146	Guayzimi	parish	1145	190350	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1147	Zurmi	parish	1145	190351	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1148	Nuevo Paraíso	parish	1145	190352	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1149	Nankais	parish	1145	190353	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1150	Yacuambi	canton	7	1904	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1151	28 De Mayo	parish	1150	190450	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1152	La Paz	parish	1150	190451	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1153	Tutupali	parish	1150	190452	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1154	Yantzaza	canton	7	1905	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1155	Yantzaza	parish	1154	190550	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1156	Chicaña	parish	1154	190551	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1157	Los Encuentros	parish	1154	190553	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1158	El Pangui	canton	7	1906	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1159	El Pangui	parish	1158	190650	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1160	El Guisme	parish	1158	190651	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1161	Pachicutza	parish	1158	190652	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1162	Tundayme	parish	1158	190653	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1163	Centinela Del Cóndor	canton	7	1907	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1164	Zumbi	parish	1163	190750	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1165	Triunfo Dorado	parish	1163	190752	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1166	Panguintza	parish	1163	190753	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1167	Palanda	canton	7	1908	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1168	Palanda	parish	1167	190850	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1169	El Porvenir Del Carmen	parish	1167	190851	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1170	San Francisco Del Vergel	parish	1167	190852	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1171	Valladolid	parish	1167	190853	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1172	La Canela	parish	1167	190854	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1173	Paquisha	canton	7	1909	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1174	Paquisha	parish	1173	190950	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1175	Bellavista	parish	1173	190951	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1176	Nuevo Quito	parish	1173	190952	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1177	Galápagos	province	1	20	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1178	San Cristóbal	canton	8	2001	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1179	Puerto Baquerizo Moreno	parish	1178	200150	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1180	El Progreso	parish	1178	200151	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1181	Isla Santa María Floreana	parish	1178	200152	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1182	Isabela	canton	8	2002	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1183	Puerto Villamil	parish	1182	200250	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1184	Tomás De Berlanga	parish	1182	200251	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1185	Santa Cruz	canton	8	2003	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1186	Puerto Ayora	parish	1185	200350	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1187	Bella Vista	parish	1185	200351	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1188	Santa Rosa	parish	1185	200352	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1189	Sucumbíos	province	1	21	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1190	Lago Agrio	canton	9	2101	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1191	Nueva Loja	parish	1190	210150	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1192	Dureno	parish	1190	210152	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1193	General Farfán	parish	1190	210153	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1194	El Eno	parish	1190	210155	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1195	Pacayacu	parish	1190	210156	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1196	Jambelí	parish	1190	210157	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1197	Santa Cecilia	parish	1190	210158	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1198	10 De Agosto	parish	1190	210160	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1199	Gonzalo Pizarro	canton	9	2102	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1200	Lumbaquí	parish	1199	210250	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1201	El Reventador	parish	1199	210251	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1202	Gonzalo Pizarro	parish	1199	210252	t	2026-07-24 10:52:03	2026-07-24 10:52:03	\N
1203	Puerto Libre	parish	1199	210254	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1204	Putumayo	canton	9	2103	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1205	Puerto El Carmen De Putumayo	parish	1204	210350	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1206	Palma Roja	parish	1204	210351	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1207	Puerto Bolívar	parish	1204	210352	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1208	Puerto Rodríguez	parish	1204	210353	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1209	Santa Elena	parish	1204	210354	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1210	Sansahuari	parish	1204	210355	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1211	Shushufindi	canton	9	2104	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1212	Shushufindi	parish	1211	210450	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1213	Limoncocha	parish	1211	210451	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1214	Pañacocha	parish	1211	210452	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1215	San Roque	parish	1211	210453	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1216	San Pedro De Los Cofánes	parish	1211	210454	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1217	Siete De Julio	parish	1211	210455	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1218	La Magdalena	parish	1211	210456	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1219	La Primavera	parish	1211	210457	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1220	Sucumbíos	canton	9	2105	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1221	La Bonita	parish	1220	210550	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1222	El Playón De San Francisco	parish	1220	210551	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1223	La Sofía	parish	1220	210552	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1224	Rosa Florida	parish	1220	210553	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1225	Santa Bárbara	parish	1220	210554	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1226	Cascales	canton	9	2106	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1227	El Dorado De Cascales	parish	1226	210650	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1228	Santa Rosa De Sucumbíos	parish	1226	210651	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1229	Sevilla	parish	1226	210652	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1230	Nueva Troncal	parish	1226	210653	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1231	Cuyabeno	canton	9	2107	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1232	Tarapoa	parish	1231	210750	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1233	Cuyabeno	parish	1231	210751	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1234	Aguas Negras	parish	1231	210752	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1235	Orellana	province	1	22	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1236	Francisco De Orellana	canton	9	2201	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1237	El Coca	parish	1236	220150	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1238	Dayuma	parish	1236	220151	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1239	Taracoa	parish	1236	220152	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1240	Alejandro Labaka	parish	1236	220153	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1241	El Dorado	parish	1236	220154	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1242	El Edén	parish	1236	220155	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1243	García Moreno	parish	1236	220156	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1244	Inés Arango	parish	1236	220157	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1245	La Belleza	parish	1236	220158	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1246	Nuevo Paraíso	parish	1236	220159	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1247	San José De Guayusa	parish	1236	220160	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1248	San Luis De Armenia	parish	1236	220161	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1249	Aguarico	canton	9	2202	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1250	Nuevo Rocafuerte	parish	1249	220250	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1251	Capitán Augusto Rivadeneyra	parish	1249	220251	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1252	Cononaco	parish	1249	220252	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1253	Santa María De Huiririma	parish	1249	220253	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1254	Yasuní	parish	1249	220255	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1255	La Joya De Los Sachas	canton	9	2203	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1256	La Joya De Los Sachas	parish	1255	220350	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1257	Enokanqui	parish	1255	220351	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1258	Pompeya	parish	1255	220352	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1259	San Carlos	parish	1255	220353	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1260	San Sebastián Del Coca	parish	1255	220354	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1261	Lago San Pedro	parish	1255	220355	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1262	Rumipamba	parish	1255	220356	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1263	Tres De Noviembre	parish	1255	220357	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1264	Unión Milagreña	parish	1255	220358	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1265	Loreto	canton	9	2204	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1266	Loreto	parish	1265	220450	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1267	Ávila	parish	1265	220451	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1268	Puerto Murialdo	parish	1265	220452	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1269	San José De Payamino	parish	1265	220453	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1270	San José De Dahuano	parish	1265	220454	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1271	San Vicente De Huaticocha	parish	1265	220455	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1272	Santo Domingo De Los Tsáchilas	province	1	23	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1273	Santo Domingo	canton	2	2301	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1274	Santo Domingo De Los Colorados	parish	1273	230150	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1275	Alluriquín	parish	1273	230151	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1276	Puerto Limón	parish	1273	230152	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1277	Luz De América	parish	1273	230153	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1278	San Jacinto Del Búa	parish	1273	230154	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1279	Valle Hermoso	parish	1273	230155	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1280	El Esfuerzo	parish	1273	230156	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1281	Santa María Del Toachi	parish	1273	230157	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1282	La Concordia	canton	2	2302	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1283	La Concordia	parish	1282	230250	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1284	Monterrey	parish	1282	230251	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1285	La Villegas	parish	1282	230252	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1286	Plan Piloto	parish	1282	230253	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1287	Santa Elena	province	1	24	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1288	Santa Elena	canton	4	2401	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1289	Santa Elena	parish	1288	240150	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1290	Atahualpa	parish	1288	240151	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1291	Colonche	parish	1288	240152	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1292	Chanduy	parish	1288	240153	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1293	Manglaralto	parish	1288	240154	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1294	Simón Bolívar	parish	1288	240155	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1295	San José De Ancón	parish	1288	240156	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1296	La Libertad	canton	4	2402	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1297	La Libertad	parish	1296	240250	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1298	Salinas	canton	4	2403	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1299	Salinas	parish	1298	240350	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1300	Anconcito	parish	1298	240351	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
1301	José Luis Tamayo	parish	1298	240352	t	2026-07-24 10:52:04	2026-07-24 10:52:04	\N
6	Sierra Sur / Austro	operational_zone	1	Z5	t	2026-07-24 10:51:50	2026-07-24 10:51:50	0106000020E610000002000000010300000001000000F5030000DC64F5F040C653C07F3E6DFEA6060DC0D074CB7B4DC653C07F1E9F7448100DC07C4B6472ACC653C000334C6337240DC0344C291F4AC753C0FF925C0045390DC02C446D6C0DC853C080BA823061470DC024F4AC04E8C853C001FE8340154C0DC0009B33D5A5C953C00006A617D8520DC0E833D7D107CA53C0010AC0CA975B0DC0AC61BC024BCA53C0805A76E6F0690DC0BCA5CE6937CA53C07FDD47B723750DC0806A77A0D2C953C00108B01EB0800DC014A1176F9DC953C07FF0DF2BD68A0DC07043CB3BA0C953C0004196472F990DC0284E66D031CA53C000E1DAACA1B00DC01C1B0C6BC6CA53C001FC604B55B30DC09CEB31AD67CB53C07FDC92C1F6BC0DC01CAFACD9EFCB53C07F719F2EE8C30DC004C38F5064CC53C08144C75700D00DC07885280678CC53C000B5D4EB5DE20DC08075527B6BCC53C07F64FD3BE2F90DC0B0AF72F142CC53C0808E1616C5070EC034BF665BDBCB53C081853BF637110EC0DCFBEAC39DCB53C000573AF41D1D0EC058E8949184CB53C07FB12C4C6A2A0EC0D0D43E5F6BCB53C000D028CF4F440EC05405FB933ECB53C07FCE20F9DB560EC0A8210C64DFCA53C08199D59B4E670EC0A03E726699CA53C0FF6C655E4E6E0EC0309278371ECA53C0802E8B56DC7A0EC000912CFD77C953C080D444B3738D0EC0D0366DE2DEC853C07FFC32AB86AB0EC0C0752D03C9C853C0FFC2E4EFD9C00EC0CC1CBA22D6C853C081C76C51E5D20EC0B09A3A64AAC853C07FAE89A494E60EC09C3521A838C853C07F5097FCB7F90EC09C86ED2904C853C080B5ED62370B0FC0941B6EE82FC853C0FFBA75C4421D0FC0C4AC46C58BC853C0FF9D053E922C0FC0D05020A2E7C853C00062BCFA39340FC0D01907E024C953C081A51A79FD420FC0F04213BE5DC953C080CE279C245C0FC0F876793D6FC953C0812F644FE4640FC0F876793D6FC953C00199D468237F0FC0E845C6000FC953C0FF187C2A3F860FC0CC8FE0C2D1C853C0FFF97ECA2E910FC0DC6AD361F0C853C000E328F73DA90FC0A8A5460976C953C0001FA77DADAE0FC018876BFC9CC953C08041CF1F00B40FC018876BFC9CC953C080C655F58AC00FC0CC4C4CF17AC953C000543E6980C90FC0448DDEB05AC953C08111AFABFCDC0FC00C5D3F465EC953C0007AE34106F00FC00C5D3F465EC953C08152F1BEABFB0FC088AA273F3EC953C040E7A6F3FF0910C06C3F69731FC953C0C03E0C72EC1210C0A4118442DCC853C0401B5B95652010C0B05596A9C8C853C0C1D68D8B2B2D10C0402BBE0EEDC853C000C894CD243710C01C0290D843C953C0C0ACA63CD14110C0F456216EB9C953C08015A63BC44710C01CE98B9E0ACA53C080C3E35E3D5510C064031B9D34CA53C000DEC9191D5D10C0806ED96853CA53C08043246B566510C0C8CC7ACE69CA53C080AEB043A96F10C0A41DAA9B5ECA53C040DBA584957F10C0284E66D031CA53C04168DB63FB8E10C0BC84069FFCC953C0403AC678419810C01C06F2A0C4C953C000BB0A70149F10C04873323E5AC953C080DDB37627A410C050D4AAA700C953C0405C6B949AA610C0DCC2D6465EC853C0FF701FC860AC10C03823FA7DEBC753C0C0EC31381AB110C0E8E1BE1A8FC753C0C0CEB6CD66B710C040FECFEA2FC753C0C08F1F3600BD10C0AC07E0BAD0C653C0404493CB4CC310C0DC95E822A1C653C0406C6E5979CA10C0A0E033569EC653C000A9E931CCD410C0DC95E822A1C653C0C067C1D54BDF10C068D095DDD3C653C080FEBDEB9EE210C09C7265B3F7C653C0406DDD518CE710C098D7EA0806C753C0FF58C5BD27EE10C0A8628F28EBC653C040907185AAF610C0442B9B92BCC653C08078C7F447FE10C0442B9B92BCC653C000F806C97C0A11C058C71453F9C653C080C85E1F381111C04CCFBBB120C753C0C0CA22D03D1A11C04442E2511CC753C0C0AD449B412011C040B8BB34C9C653C04070A5552F2811C040B8BB34C9C653C041B13F23ED2D11C0400E7CD20AC753C081B176FA923211C064F8C78F59C753C040D5FBBBAE3911C05C8D484E85C753C080D53293543E11C06CDB618D9FC753C080B6FE5B9E4411C0709F54AF66C753C080185A3A724811C0C4D2C29035C753C040930CDD455011C02432D3F317C753C0003154149B5211C008285353F2C653C0411C3C80365911C06C42C648FBC653C00031EEEA7B5F11C0CC078A7302C753C0009C7B546B6511C0182528DEFEC653C04012BFB3546811C03CADA188F0C653C0C0CAC57D837111C0CC078A7302C753C0FF9FDBD40B8B11C0547648D12DC753C0C0DF155ED59B11C05C3788B043C753C0801278E83AA911C064A7FB0D8EC753C000153C9940B211C09C4FD46741C853C040266F6444B811C0E02B134106C953C0C0366B58A2B911C000E7EC9AB9C953C04039F83102BE11C028445FF803CA53C0C15A27F163C511C0289A1F9645CA53C0406EE795C7CF11C030B4D2554ECA53C000C07D57E3D611C0485005D482CA53C08052AEE6BCE311C06442F8EFF8CA53C08014D8C904E711C08C3138C9BDCB53C000F56CBBA8E811C0C8102AE533CC53C0404476A364EB11C08CE33BBC7DCC53C080F9638062EF11C0944816EEA4CC53C0C0E5383B42F711C0A46FC252D7CC53C0402E1C0D82FC11C0A0908A1D12CD53C040BC55D7A10212C0400F9F1B4ACD53C07F9EDA6CEE0812C0206430B1BFCD53C0804A8FA1C10812C0DC4D037B16CE53C07FCF7C31080412C0E051654397CE53C040414367E8FD11C09118EE703CCF53C0C06CB3A4E8F611C0546BFD343BD053C040F1A0342FF211C0184E999BEFD053C04068FB6480F211C024A1A6F67FD153C0C0C53C9094ED11C04CFB651119D253C0404476A364EB11C0A0B29789FCD253C040F8674354F611C024CE941A3DD353C000E002C96EFE11C084B8BC16ADD353C0808BB312880712C048A28FE003D453C04042CC558E0B12C010F13CDC81D453C08098A4FA1A1012C00890C472DBD453C0006FC1967A1B12C0D801BC0A0BD553C040F7C4EEC62812C08CC4E26F2FD553C081F18E7CF32F12C0D42284D545D553C0C00643B0B93512C010D838A248D553C0C04E2682F93A12C03C8709D553D553C0C0FD7B79CC4112C0500F2EA32CD553C00056E1F7B84A12C034A46FD70DD553C0C07A17D82B5412C044CB1B3C40D553C041008A6B5E6612C02481253B5CD553C0BF2C7FAC4A7612C014DC9A6AC9D553C04044C0B9708012C044F4A7977CD653C0C0BC4165108A12C074EBECF9F4D653C04075E396BC9B12C024B275279AD753C04054C37E4FA412C04C65A82226D853C000D5077622AB12C068B762B40BD953C000F7AC917BB912C044295A4C3BD953C0001CE371EEC212C0B0F2B97D70D953C080797A77F4CD12C02CC2FD489DD953C0C0D6117DFAD812C088474B13E6D953C0C0844FA073E612C0E4CC98DD2EDA53C04074C9080DEC12C05479920CAADA53C0000BC61E60EF12C01CC83F0828DB53C0C00203D32CF212C0D8B112D27EDB53C0004BE6A46CF712C0F4064DB3A6DB53C0C05949B21FF912C0D8E4F625AFDB53C0007759FEE4F612C05041805526DC53C0C0156F912AF012C010015D3A73DC53C0C08068A8ADE912C0743AB6CFC7DC53C040B9D2AF3AE212C048CA5B7B01DD53C0408C912B0FDA12C0DCC6763852DD53C080FD653A29CB12C0241152657FDD53C080B5C5C859B212C00C8B9970A3DD53C080716CBB34A212C0ACB5139821DE53C000CB8A62509412C030D897CECFDE53C00052AC904D8B12C0E0456EF03BDF53C0C07645738B8412C0B4BB3A0378DF53C040E14FFC467612C09CF6A00C96DF53C000FABD1BE36912C09CF6A00C96DF53C0FF5F0786A06112C0BC7C590172DF53C0C027D93B1D5712C01C13FED7EDDE53C0001CAE787B5112C060A527B681DE53C04092E3C4D84812C078E883B06FDE53C08065E03DF74312C04C5E50C3ABDE53C000EC016CF43A12C030D897CECFDE53C000119B4E323412C020953BD4E1DE53C00077E4B8EF2B12C0ECC7ABEC2FDF53C0C03EB66E6C2112C0BC7C590172DF53C0809413F7891912C0786C6D1FD2DF53C08157248E081512C0FC4F10547AE053C0C05BE5AC060F12C0B8004370D4E053C03F2B2107271012C07C33B38822E153C040D5C37E091812C04C27429F6AE153C00002C705EB1C12C0DC8C22D006E253C0C0B02A9CCB1E12C06831E402A9E253C0C0F1DA234B1D12C0907EE260D5E353C040EA707FA71112C040ECB88241E453C0808CA952E60D12C0D8D3D6AFD1E453C080547B08630312C09002CCCF37E553C07FAE99AF7EF511C04070A2F1A3E553C0805593A1BBEB11C0FC20D50DFEE553C0BFDBB4CFB8E211C0A84B4F357CE653C08052EA1B16DA11C05037E85AF4E653C080876FE0F3D211C020ADB46D30E753C0816B583BB2CD11C0B412959ECCE753C080A0DDFF8FC611C004EAC6E9BCE853C04084C65A4EC111C0347A2142D7E953C040223E0F8FC311C0800EF792D9EA53C0405F2D7810C811C00874D7C375EB53C040F9E30D53D011C0BCA2CCE3DBEB53C080E4360DB5D611C03843131E96EC53C03F5E15DFB7DF11C08098076D92ED53C000ABF029D9E311C0B46743C7B2EE53C040F8CB74FAE711C01482D10C91EF53C08114E3193CED11C09802ECE67FF053C0C0998A8DE5F211C08038603925F153C0C030AB4FFBF611C0689E0BC5DDF153C08061208658FA11C094670A066CF253C0012E040A96FA11C030BDC9AF84F353C0012F917662F911C0B46CBAB231F453C08067FB7DEFF111C00C29B254CFF453C0C03A476690E811C018FFB7344EF553C0C00E934E31DF11C024D5BD14CDF553C0C0146E46C8D611C01488935A29F653C0C0818136E4CD11C0C42440A553F653C0405440B2B8C511C04851929BB7F653C0C08EC492DEBB11C0D8D04B6551F753C040639DE74BB111C0D8D6887EE3F753C04068EB7216AA11C0C8895EC43FF853C04039901552A411C0A86C6B43AFF853C000D7183CCB9E11C0787FAFFB31F953C04040F879B59A11C084D853E8F9F953C080432C2CE79511C0A8980DB855FA53C080D11F2F9B9211C06C777B1EF8FA53C0FF8B79D0739211C0D066B25149FB53C000FA7635879511C03856E9849AFB53C0C0095AD2869911C0CC539B0218FC53C080DA4CEEFC9911C080D88AA5ABFC53C03F85C3F2D59511C08CC164BE41FD53C041E7B8A9389311C0B0624AF62DFE53C080533F2D888B11C0F8865EBBF7FE53C04047377FD78511C050A763E888FF53C0400847FE4D8211C000FF9329150054C080CC316C137D11C0E83371BB8D0054C080901CDAD87711C0D8950DAF0D0154C0C0FCA25D287011C010021655810154C0407BE76CC66A11C010BE300C100254C0008C2E17516211C028763C2B660254C07F698DEE025C11C0BC4146D85C0354C0404636FAA64B11C0C8174CB8DB0354C0C080BADACC4111C0885AC7A9710454C080B70A09C13C11C0589D429B070554C080537956A13911C0F8ECC42B8E0554C080241EF9DC3311C0D85270B7460654C0808BE35D2E3211C0E0287697C50654C080241EF9DC3311C070A82F615F0754C0C055209C063611C0F45720640C0854C0C0573A759F3311C004042C240A0954C0C0573A759F3311C0C4F33F426A0954C08088AFABFC3611C0C0C000B1B60954C04036F6547C3A11C0CC780CD00C0A54C08068DE27553811C08072AFB5510A54C000E44748A43411C014706133CF0A54C000E16C59553611C00047B169000B54C0C0F04FF6543A11C0047470CB070B54C0009E3DDCF14011C04CDC69D9420B54C041359247F14611C0A49EE1AA8C0B54C080CCE6B2F04C11C0E8D91B57C00B54C0409C75C1DB5911C028155603F40B54C0804688B8296211C0A08BCA5B5B0C54C0409836C5016811C074E304F1470E54C080E78F4AF78711C004E65CC72A0F54C08044B998B39411C0E4C869469A0F54C00072FA1CDF9C11C00CC29FC03B1054C000D5FE6232A111C080A1C7FCFB1054C040A0C80DD7A311C0A81D9C83E61154C0BF01B37A91AA11C048EA7F07241254C0002C4DB957B611C0484324F4EB1254C040F13B6C65C111C0703C5A6E8D1354C0C0818136E4CD11C06C4297871F1454C00049172F57D511C00C15B824EF1454C08043C9A38CDC11C0AC643AB5751554C0C0D8CF8C09E311C054072419321654C0003ABAF9C3E911C098238A2DF61654C000D04D4F0DEF11C00803B269B61754C0C00150F236F111C010DFF462C71854C0C1666E1123F311C040A8F3A3551954C000356C6EF9F011C0D027AD6DEF1954C0806FF04E1FE711C008F1ABAE7D1A54C0C0A9742F45DD11C060ADA3501B1B54C0804670E9F1D811C01C20567BC41B54C0C0E3F80F6BD311C0F0329A33471C54C000507F93BACB11C02479FA678C1C54C000587464EAC011C0D015A7B2B61C54C0009AED1540AC11C090FF7DB7841C54C0409F3BA10AA511C084AC16E44E1C54C0000A35B88D9E11C02479FA678C1C54C08044B998B39411C02C49C32E791C54C080B1CC88CF8B11C018A3F4870D1C54C080B834ED328211C04090B0CF8A1B54C08159F1C5DD7711C0343D49FC541B54C0C05DB2E4DB7111C0BC635ED9261B54C000FEE150BA6811C0602A0544D21A54C000D01360C26111C0F820E3E7901A54C0803A0D77455B11C0480198901D1A54C000430248755011C094118472BD1954C0C0AC6EF22B4B11C0E46E9A0E011954C0C01B9CBBE03F11C0D8452D5B4C1854C000F28EE9E63211C01856193DEC1754C0C028DF17DB2D11C04843D584691754C04094659B2A2611C0F0D944B6011754C040672417FF1D11C0204A9F0AC81654C04038C9B93A1811C0E4B0D7024D1654C0007133C1C71011C06084850CE91554C0BF779B252B0711C07CA1788D791554C0C07D761DC2FE10C0A48E34D5F61454C000EB890DDEF510C090E8652E8B1454C040899FA023EF10C04C4F9E26101454C0005DEB88C4E510C034A9CF7FA41354C0016453ED27DC10C07C3C5A6E8D1354C0C0CDBF97DED610C07C3C5A6E8D1354C040382C4295D110C0AC82BAA2D21354C040379FD5C8D210C0B458C082511454C04032514AFED910C01CE580EBDB1454C0406239148FDE10C0A011D3E13F1554C0406239148FDE10C0044B2C77941554C00163C6805BDD10C088777E6DF81554C000C8E49F47DF10C000D4079D6F1654C0802D902B00E010C0D463AD48A91654C0C0C9FE78E0DC10C04C3D986BD71654C0C0CE4C04ABD510C0A476F1002C1754C000069D329FD010C038F6AACAC51754C0800410C6D2D110C09C826B33501854C000CD322B12D810C0FC3E63D5ED1854C0C0933BB7B8E010C0948EE565741954C04091947153E410C09494227F061A54C03FC4B0ED15E410C08047F8C4621A54C0C0FE34CE3BDA10C0E480515AB71A54C0006A2EE5BED310C030EAE1281F1B54C0C09FF1A6E6CF10C0306D8035681B54C040382C4295D110C09876A291A91B54C0C0CDBF97DED610C00C56CACD691C54C0C0656DC6C0D910C0B0155A483C1C54C001C604F0C78F10C084349E5F171C54C04091A53B2B8710C024A3F4870D1C54C0805590A9F08110C0087A44BE3E1C54C0C1E3B7558E8010C0183250DD941C54C080E0DC663F8210C030EA5BFCEA1C54C0406B29248E8210C0141F398E631D54C0C0A4C7D4047D10C000927B39A11D54C000E35A4D637310C0689B9D95E21D54C000E8A8D82D6C10C0248BB1B3421E54C0C086BE6B736510C09C649CD6701E54C0C0C0424C995B10C008688119201E54C0C05D3E06465710C02CD8DB6DE61D54C0C09301C86D5310C0D42121E5DA1D54C00033A4C77F4B10C0C451581EEE1D54C040077D1CED4010C0843B2F23BC1D54C0C00D5814843810C0948859DD5F1D54C0C112A69F4E3110C07CE28A36F41C54C0417FB98F6A2810C0449C2A02AF1C54C001B9B003C41F10C080DC4D1D621C54C0BF8CFCEB641610C0A44CA871281C54C0402B127FAA0F10C02C73BD4EFA1B54C080CAB47EBC0710C02CF01E42B11B54C040683DA5350210C09C706578171B54C0C035AE953F0110C08C47F8C4621A54C000031F86490010C08CC459B8191A54C00070AAB649FB0FC0DCA40E61A61954C00111DA2228F20FC0C4FE3FBA3A1954C000DF64ECCAEE0FC0B0587113CF1854C00111DA2228F20FC06CBFA90B541854C08071C48FE2F80FC0BC9F5EB4E01754C080A66D7871F70FC0D069EA613B1754C0801528AEF2EA0FC04C3D986BD71654C0FF7C60A677EA0FC0D4E00E3C601654C08075F84114F40FC044615572C61554C0000292197D0110C0801EDA80301554C0C0637C86370810C02862E2DE921454C080C566F3F10E10C0B8528369BF1354C0808E16C5FD1310C0544324F4EB1254C0BF8CFCEB641610C0F8B6638B611254C0C0C13241C01310C0902AA322D71154C0005C87B5071310C0D4B7F0F72D1154C080C566F3F10E10C0ACBEBA7D8C1054C040960B962D0910C020C29FC03B1054C000CF759DBA0110C03862314E151054C080A66D7871F70FC048AF5B08B90F54C0014CEB6F1AE70FC01C39C49A600F54C001EE34B591DB0FC06849B07C000F54C00129460284D00FC000408E20BF0E54C08198003805C40FC06C4373636E0E54C07FA4B62733B30FC0BC23280CFB0D54C081755BCA6EAD0FC0387437094E0D54C08042CCBA78AC0FC0840185DEA40C54C0007DC32ED2A30FC0ACEE4026220C54C080EA638BBA990FC0F87B8EFB780B54C080C17092598A0FC008461AA9D30A54C07F9863C05F7D0FC01C10A6562E0A54C08038932C3E740FC0BC53AEB4900954C080728AA0976B0FC054C7ED4B060954C000AC8114F1620FC0EC3A2DE37B0854C080B51D2B86540FC0583E12262B0854C0815B9B222F440FC0C4C49575230854C08134C20267320FC068C3A96D7C0854C07F3266A49D280FC048E0D1B7060854C0FF1E5E7C76250FC02413ECFC710754C0FF3B3CB1721F0FC0FC796CC1EE0654C0007A12CE2A1C0FC0E8A12C65810654C0015BA7BFCE1D0FC0C8958689020654C0FF3B3CB1721F0FC088EDAD2F4F0554C0001A44C9B61C0FC04845D5D59B0454C0FF9C29E1FA190FC02CE36E5CDB0354C001BC94EF56180FC0F4FBD5E13D0354C0815A391183140FC0D02EF026A90254C08078367193090FC090F93D6DF10154C000D5779CA7040FC04C541856EF0054C07F5224D617FE0EC03CB03E79930054C08013E00A14F80EC01C3172FD180054C0800EC65754EF0EC0F02C7380C1FF53C0816C078368EA0EC0E82F26C372FF53C0808A04E378DF0EC0E04C8CC52CFF53C001699E4C71D30EC0A81427C9C3FE53C08003B6943DCB0EC08C7BA78D40FE53C0016316EB65C10EC0840B3430F6FD53C00180F41F62BB0EC06419411480FD53C00020B86CA2B20EC0449A749805FD53C0005C01B0FAAA0EC014EFE8FBA0FC53C0003A09C83EA80EC0F816A99F33FC53C07FFC32AB86AB0EC0C8BCE9849AFB53C000BBCFB46EAA0EC0B83576AAF8FA53C0809BF6F7C6A20EC07C1A77B049FA53C0FFB9610623A10EC05C9BAA34CFF953C000B942DB0EA60EC03C022BF94BF953C0009C64A612AC0EC01869ABBDC8F853C0005C01B0FAAA0EC0F0B578C23CF853C0FF5A9301AFA10EC0DC6A12C6D3F753C001777136AB9B0EC09C716DEA54F753C07F75E45C4B970EC0740F077194F653C000944F6BA7950EC05CAAEDB422F653C001F93723DB9D0EC030A6EE37CBF553C0819AD7CCB2A70EC0208FEEBA73F553C000BE5C8ECEAE0EC008B7AE5E06F553C0FF40B0545EB50EC0E09055C37EF453C000C157167ABC0EC0B4C36F08EAF353C0010448E6F1C10EC0A41F962B8EF353C00101BB0C92BD0EC091BA7C6F1CF353C00020261BEEBB0EC04CDB8A53A6F253C000A2EC071EBE0EC040E1F0D808F253C000A2EC071EBE0EC078C0735785F153C080DECD4BACBD0EC040FB34FB17F153C080DECD4BACBD0EC0E074B874B1F053C07F92D91621B50EC0A8AF791844F053C00048E5E195AC0EC084EB190EA0EF53C08059D5FF2AA90EC0A4D5F62DF5EE53C07F226B4750A80EC0009E1B9DEAED53C001345B65E5A40EC0FCBE6F1132ED53C07FD77612C59F0EC03C818C8DF4EC53C08167696C84950EC0B4155C88A2EC53C081F7FA9CB3880EC014BD2C8350EC53C0012B09A452790EC0BC22D0AA20EC53C00002948161670EC01CCAA0A5CEEB53C000FF98F9B5590EC07C7171A07CEB53C0004436F559440EC044B47DC523EB53C001304B4F193A0EC06CA6A5668DEA53C001E5561A8E310EC0F82BBEB0DBE953C080F64638232E0EC00031E75145E953C0FF635956B82A0EC0340F2FA1E5E853C00086D86852210EC0D08067996AE853C081A8577BEC170EC03028389418E853C0015D6346610F0EC0EC7E240B89E753C0FF126F11D6060EC00C69012BDEE653C07F4878A020050EC0FCD5545D9AE653C07F356DA8131A0EC00441D49E6EE653C07F97363533270EC0D42222620EE653C0815841ED662F0EC0BC4AE205A1E553C0807E5388E23A0EC0C081FBC763E553C000605628D2450EC090F022EB07E553C0014159C8C1500EC0880D89EDC1E453C0FF04108569580EC078DCD5B061E453C0FF68F83C9D600EC04C821696C8E353C001C8A716FD640EC00C67179C19E353C0FFA83C08A1660EC0E49931E184E253C001C8A716FD640EC0C073D845FDE153C001C5AC8E51570EC0A081E52987E153C0004505CD35500EC080753F4E08E153C001240DE5794D0EC030F2735536E053C00082BCBED9510EC0ECBF74DE2FDF53C081864420E5630EC0A88D756729DE53C0802D1DA890710EC078C08FAC94DD53C0810F2048807C0EC0505E2933D4DC53C08090E634B07E0EC024EAB65832DC53C0803118303C7F0EC0F48FF73D99DB53C0FFEDB9B178700EC0E4EB1D613DDB53C00068D91189650EC0C0C5C4C5B5DA53C00046737B81590EC0801DEC6B02DA53C0014159C8C1500EC0705F5FCF9DD953C000E11C1502480EC05CBB85F241D953C000DB94B3F6350EC0546D6CB327D953C08074B17317200EC058F792D07AD953C08151DD2EC40A0EC0886EB8EDCDD953C001CD1BBAE8FA0DC088379F2B0BDA53C000E98B4099EB0DC090DE2B4B18DA53C0008435DA19DA0DC0785CAC8CECD953C07F5C96653ECA0DC054C32C5169D953C08099FED3AABD0DC03CEBECF4FBD853C081F6D15073AF0DC0B87FBCEFA9D853C0FFFC303095A40DC058E9A9661AD853C0015658A8E9960DC058F61D8998D753C0FF89C7D8188A0DC0B8A539055BD753C00076DC32D87F0DC0ACB9195724D753C080A6EFB1CB620DC0ACB1CED50FD753C07FEA8CAD6F4D0DC0D882A20232D753C08155056DE93E0DC0B89DEE8346D753C0002D2F21682A0DC0C49159B391D753C000CDB06F2C1A0DC070CE5DE505D853C07FB9C5C9EB0F0DC0B87FBCEFA9D853C000C7593645FC0CC09C9A0871BED853C080455C726FF50CC07CB554F2D2D853C0800C585B79E90CC0A886281FF5D853C0FFE6DDC033E50CC0BC5E687B62D953C0014361EAC3E70CC05CAA235E36DA53C081796A790EE60CC0CC317F3666DA53C0009CE98BA8DC0CC08C6717398FDA53C0805F89C376C00CC0748263BAA3DA53C000C90183F0B10CC034C0463EE1DA53C081EB80958AA80CC014DB92BFF5DA53C0808F9C426AA30CC0B833C2C447DB53C0808F9C426AA30CC0ECE86A1E8CDB53C001228A24D5A60CC0B0264EA2C9DB53C0008108D610B70CC0309AC92830DC53C000E1E7B0DCC90CC0307975B4E8DC53C07F65E0FC5DDE0CC05051B51056DD53C081C45EAE99EE0CC06829F56CC3DD53C08134CD7D6AFB0CC06024CCCB59DE53C08101BF76CB0A0DC098E1BFA6B2DE53C081EF2F82C6100DC0045CA75C64DF53C0805D42A05B0D0DC0C4998AE0A1DF53C0005A4718B0FF0CC038199B37BDDF53C08020E2D729F10CC0C4998AE0A1DF53C0FF2ED76D13E00CC024415BDB4FDF53C00188FEE567D20CC0A4CDDF54E9DE53C0FF4CFACE71C60CC08CF59FF87BDE53C081EE7B1D36B60CC0B04EB5463FDE53C000903443A0AA0CC0A81A4FC72DDE53C0016CAF8184A30CC0A81A4FC72DDE53C0FF4949EB7C970CC0CCEAE7C473DE53C0FFE3D359E98A0CC0E052B4C396DE53C07F642C98CD830CC0DC8EC1A1CFDE53C08020CE190A750CC0E01B9B01D4DE53C0815D368876680CC0CC26F5A2ACDE53C001F9DF21F7560CC0B868680648DE53C0FF926A90634A0CC0B868680648DE53C0FF1036F5E73E0CC0C4435BA566DE53C001AC4D3DB4360CC0D8AB27A489DE53C000CDD77624300CC0E0DF8D239BDE53C0FF2A19A2382B0CC0D0049B847CDE53C080688110A51E0CC0B8460EE817DE53C080438EA03D0E0CC09820B54C90DD53C07FA0611D06000CC0786ACF0E53DD53C07FFDA2481AFB0BC0442D76F673DC53C001D42777A7D80BC00C68379A06DC53C000D3B9C85BCF0BC0EC75447E90DB53C001CE316750BD0BC0FC6D9D1F69DB53C081C8A90545AB0BC0F4A9AAFDA1DB53C08161C6C565950BC01CD0039929DC53C081FC6F5FE6830BC0444729B67CDC53C00037DD45A7690BC040DCA974A8DC53C0004F331998510BC070DDF5AE4EDD53C080A80B0EB5350BC0905CC22AC9DD53C07FE0EB1A16170BC08081CF8BAADD53C0FF7808DB36010BC088285CABB7DD53C001957861E7F10AC088285CABB7DD53C0006F66C66BE60AC080F4F52BA6DD53C0014B735604D60AC09093DBEC8BDD53C07F876D1625C00AC09006028D87DD53C07FC129801DB40AC0C8123BA781DD53C0FF743B95E5B30AC0682367F98BDD53C001C61CDB9DAB0AC0905CC22AC9DD53C000FC9666DE990AC0B04EB5463FDE53C0FF9A5AB31E910AC0D4740EE2C6DE53C0FF9A5AB31E910AC00CCC1ABAAEDF53C0FF1994C6EE8E0AC0501B80336FE053C001F70E05D3870AC0709A4CAFE9E053C000F4812B73830AC09467326A7EE153C0FF3672FBEA880AC0CC8AD8C254E253C001DA30D0D68D0AC01864645968E353C0FF98CDD9BE8C0AC0687409B23EE453C000F99BDE328C0AC088F3D52DB9E453C0FFDA9E7E22970AC0B4C0BBE84DE553C000FE23403E9E0AC0DC3CD52117E653C000DFB831E29F0AC0000ABBDCABE653C07F1DFDFCE5A50AC0304AC7373CE753C07FBE2EF871A60AC0684B1372E2E753C0FFBDC049269D0AC0802353CE4FE853C0819D553BCA9E0AC0A4635F29E0E853C07F9C3610B6A30AC0D4BD1E4479E953C000DFB831E29F0AC0D8BA6B01C8E953C001FA098D7E950AC0D8BA6B01C8E953C001764818A3850AC0EC3F9E02A5E953C0803477733F7B0AC0CC6F05055FE953C0802C6238D4640AC0B07D12E9E8E853C07F48D2BE84550AC09832ACEC7FE853C08041BD83193F0AC06CBB86CF2CE853C0FF5E4C35DE2A0AC078CD92300EE853C0FF950D172B110AC078B3DF7005E853C08110DEF303F809C048220794A9E753C081A9FAB324E209C018C8477910E753C001C66A3AD5D209C0FC0C6E1F5DE653C000807FE2B1BF09C0E4703BA128E653C07F3926DC42A309C0F44B2E4047E653C081D1429C638D09C0DCE3614124E653C080EB2549B47909C0D4E61484D5E553C000E8BC12BD6209C0C054E9DDCEE553C0813602723B4C09C06C171043F3E553C001CF1A47A23F09C040AACFA55DE653C0803E54A3223509C0B43963D21EE753C0FF2ED6E12F2809C094149764F6E753C0804C514CE32109C074B19C29D9E853C0FF5CD7E3491C09C004C9542473E953C0014BC85D3D1409C08CE00C1F0DEA53C000EB8BAA7D0B09C0D0FEFDE5B7EA53C081E671F7BD0209C004F6424830EB53C080077E268BF708C00C5F7F42D8EB53C080F8FF6498EA08C028CE9FD677EC53C081E6F0DE8BE208C0847817347CED53C001A19ED165D808C079592F604BEE53C001DA03E2B2D008C05CD56C5AF3EE53C07FD87AF30CC308C0E02A532282EF53C081A01DB933B808C09C1426ECD8EF53C081D2D751A7AC08C04476D4E756F053C0FFD04E63019F08C014A4B9189AF053C001C1D0A10E9208C02007EEB3A9F053C000F8082E1E9108C00C7783D569F053C000EDDB257E8808C084B033E838F053C000C1D2C3477D08C05C1C208EF1EF53C080ED20FADE7408C054327D65B4EF53C0012B0AC3996608C010C42683BAEF53C000A69780AE5D08C0EC03597AEDEF53C0819BB2FBD74B08C0FCE5CB52E5EF53C0005170625C3208C02C880C34AAEF53C000BE1AA7EE2808C0900F1CC529EF53C0FF31372B172408C044E3DC6878EE53C081B5EF470D2208C0BC2ED2AAE7ED53C08139A864032008C05CE5C1F78DED53C0002EC4E5D61608C0E8D42A34CFED53C0012698804B0708C0F8A0403504EE53C08198FADE7EF707C0709B7A2100EE53C0015A9CC42FE707C0AC62BCA9B2ED53C0800C5C3708DF07C078FE7AA613ED53C0FF12CD70F4DA07C010F8F8C1AFEC53C0004FB73F59D507C020020EA10AEC53C07F14CC6A4AD207C09437A60BB7EB53C0004FB73F59D507C0EC99B4F548EB53C000CFB742AED907C06CCF4C60F5EA53C0FF41D4C6D6D407C0F0EA6F4BBCEA53C0000F5A2BB4CD07C004DF275354EA53C0000F5A2BB4CD07C0A4BE30EF0AEA53C081D5287C9AD507C06C48AABCCBE953C0815B9BBE85DE07C0B0CC5D7688E953C0804F726BF8E807C0E06E9E574DE953C080A423320CED07C0C8E1FE7CEBE853C080EEAA9FE8F207C0C011D1D393E853C07FA22438B6F507C0A079A5D129E853C0005E0F0A70F407C074FBEE4EA5E753C001ECF17F9DF007C03C97AD4B06E753C080E00D0171E707C0DC11844795E653C00112641BF0D507C0482B5105A2E653C0811CB0DB02C607C070DE9C9DCEE653C08003BB80E8B007C0DC5A90A7F1E653C081175B4A8EA607C0482B5105A2E653C000EAC525CE9B07C024921F592FE653C00058AC62A39407C0202FF90C19E653C08067A2A77F8707C004EC6B3C1CE653C0004CD1BF947507C0CC311DC3AEE653C0011C600E046E07C0344BEA80BBE653C00069E1BC7C5E07C03465046D75E653C0000823CD8A5207C0E03820A4EFE553C001C0AE2B083F07C05CE9478686E553C080324D827E3107C0385016DA13E553C0004243C75A2407C01C6ED8CD44E453C0FFAF2904301D07C0B47BA76C92E353C0802672DF6F1207C0CC9CC4398DE253C0FF981036E60407C0602C4DF601E253C080FD8F1B97F406C048CB67CA25E153C00012E4CD05F106C07C7FEDDA8AE053C081B7C0C75BE806C064B3D7D955E053C0017962AD0CD806C00C7D839E49E053C080223C9564B506C058BB072A9BE053C0000C7391619A06C0D877423871E153C07F84472F2B8F06C0B4A11758E1E153C000D585B0FE8506C0B4B29866E7E153C0000D0F73DF5406C0D823BAB844E253C001C13EA9122B06C0E0E02B7D92E253C08017A66DFE0A06C0E83FA3287BE253C07F2CE50F15E505C0CCA8599D25E253C001E975F3A3D105C0BC4A5F84C0E153C081C86162B9CE05C094972C8934E153C080A4331E0FC305C094972C8934E153C0FF60C4019EAF05C0AC2E76148AE153C0FF7D9198ECA405C0BC2DF98106E253C000596354429905C0D823BAB844E253C000D4F85CD88405C0CCA8599D25E253C0FF71E9F0F48005C088A0EEBF72E153C0FFEFC5F3267A05C07C42F4A60DE153C0FF0C938A756F05C068E4F98DA8E053C001A90FDD195905C038F877202CE053C080C29579CC4005C03457EFCB14E053C0007D80EB133705C0287D17050DE053C001BC0785942505C040903E3E05E053C081F4CEF90D1505C014E6CD79B7DF53C0FF3183DA6A0805C00488D36052DF53C0FF3183DA6A0805C0E44F0181E5DE53C0FFB3A6D7380F05C0DC6C67839FDE53C0FF96D940EA1905C0C03D57DA70DE53C0003D2B82622C05C0BCFB453142DE53C001A281E8E13D05C0B8B9348813DE53C08064CD07854A05C08C6E3B6FAEDD53C0018C4246CB6305C0848BA17168DD53C081B09DD1517405C06CF457E612DD53C0FF71E9F0F48005C040FF134258DC53C0FFF4DFA6E68205C00439BA0DD4DB53C001908940677105C010720980C4DB53C000EA37FFEE5E05C02468CAB602DC53C08063FA4E614F05C020718CED40DC53C0FF809A9ED33F05C040FF134258DC53C0FF99203B862705C040FF134258DC53C000D3BA68231205C02409530B1ADC53C0FF2C6927ABFF04C02468CAB602DC53C080090E9C24EF04C0101392D4DBDB53C08084A3A4BADA04C0005620108EDB53C001E1985DDED504C0D460DC6BD3DA53C0FF47C27C81E204C09C3B0B8C66DA53C080090E9C24EF04C050AF7D5C56D953C0FFAE8C24790605C02CBA39B89BD853C0FFB3A6D7380F05C0F4CDB74A1FD853C000126F49800505C008E1DE8317D853C0FFAC18E300F404C0F82C2FF607D853C080079A5AACDC04C0047C0452F0D753C080B755DB10C104C02084E9A9A5D753C0804776819FB404C08C54AA0756D753C000DB3724D99E04C05C4D424224D753C0FF4B81B8EA8F04C04C3CD5FAD4D653C00072D668168A04C0F8F8DFA5CFD653C00166800BB28904C0AC39668A0DD653C07F5F732FAC8E04C0B0E14F0BA0D553C080ECF2D88F8B04C06C7AEC6E4BD553C080F3FFB4958604C088564607CAD453C080DCA15E798304C0F8CEF0E50CD453C080F3FFB4958604C0B0E3EB0A14D353C000E3791D2F8C04C0D820BE0C39D253C07F528E94F08A04C088A8B50863D153C080ECF2D88F8B04C0C84583E1AAD053C080CBE6A9C29604C0B0B9FC4A51D053C07FD2BE68789F04C0E021DD7929D053C081559039ABAA04C0042AC2D1DECF53C000BBF6D7BBB704C054C61218A3CF53C001C1997921CE04C0A08EEE1D9ECF53C0FF98806E4EDE04C0885A7E06B2CF53C0009CB73059F004C0D09556E3CFCF53C0000F036A250105C0042AC2D1DECF53C07F746908360E05C0042AC2D1DECF53C0007EADA6461B05C0E8C9C6FABBCF53C07FF0F8DF122C05C0BCC25E358ACF53C000F0C3C2C23905C008A620933ACF53C07F5896402E4B05C0D49EB8CD08CF53C080D1EE55005705C0A436D89E30CF53C0013148180B6905C0D8F6CE4C76CF53C07F4405727C7505C0C8CCB53037CF53C0FFBB9817748705C0D849F66807CF53C0FF4274AF639505C05CC06AE3CACE53C001D1D558EDA205C079BAEB536BCE53C080F7E46B13AE05C038DE2CD7FBCD53C0FF11B653FEBF05C0B08E54B992CD53C07F9D49058FC705C0205F151743CD53C0802F63C8B9CE05C0C432314EBDCC53C0806CEE3156CC05C000ED7FC72ACC53C081077828C3C605C074D75A1195CB53C081077828C3C605C0641E90E908CB53C000C45818B5D205C08895519279CA53C080241708A7DE05C0B06F398700CA53C07FB730CBD1E505C0CCCCE043B7C953C081E4D38469E705C09C5348135EC953C081EA672BDBDD05C0BCB0EFCF14C953C0806CEE3156CC05C0D4AA7040B5C853C080755E6598BF05C01CE2FFF1F2C753C0011592E0CEBC05C0BC9B013DB3C753C080755E6598BF05C02C86DC861DC753C0016ECABE26C905C01407C5C664C653C00001E48151D005C008B120EBEEC553C080C8029D7ED505C0846148CD85C553C0019121B8ABDA05C0047596FB32C553C0FF899BA611DB05C014A9CAD3A6C453C0FF36E9D953CE05C040E6D81444C453C07F4A9738D1BA05C0008DD95F04C453C0008EB648DFAE05C0CC13412FABC353C0FF345AF7579F05C0E00DC29F4BC353C0811303FED28D05C0006B695C02C353C000EDF3EAAC8205C098C1445BACC253C080F73116E87B05C0A8F5783320C253C000F65589177F05C0440348D26DC153C080B51206DA8705C01C50FC3941C153C080E2A72A9A9205C0C41696001BC153C0805E45974EA705C0909DFDCFC1C053C0017CE47632BF05C0202E8C363FC053C07F2D873BE9D105C0F4CE0DF29FBF53C000B0AAB937E605C0F0F5A94EFABE53C0810181F924F605C0DCD9B8DA57BE53C001C30B6EE00406C04CC49324C2BD53C081DEDC55CB1606C0A42496BA42BD53C0816E1A8C252106C01C0F7104ADBC53C080C1CC58E32D06C02C6A67007EBC53C0FF267F5AB93506C0149E51FF48BC53C0FFA73983034506C098BD8C9232BC53C08128F4AB4D5406C0346237B038BC53C07F74353F1F6506C02484DC7F63BC53C001B393596E7506C0A889A29367BC53C0817A62AA547D06C0E0116EF546BC53C0805F6A32809306C0BC7D5A9BFFBB53C081D7F9FBE89B06C0B8A9144A85BB53C00110E6D6A1A706C01C1397B3FCBA53C0FFE497A00AB006C0E8B26D5880BA53C001AC66F1F0B706C0D8F89C86EBB953C00060E089BEBA06C074EE02FA64B953C080B3D72ADDB306C014FAC544A1B853C081DC6C4129A906C08C45BB8610B853C0001C0F2A2F9D06C0B04B5D2A1DB753C081169DEA989806C04093DF303EB653C0FFE44FAC379406C05C8D60A1DEB553C080505A5C3C9006C024B1A1246FB553C080505A5C3C9006C01095B0B0CCB453C0811FFF88039506C0141F73593DB453C0005ABCFAA68C06C0D4289AF013B453C000368974517E06C09C88656360B453C0801AB88C666C06C04035E53D80B453C081C437C8AF5906C000DCE58840B453C001763D15934606C07C8C0D6BD7B353C0FFE7DB6B093906C0BCA982305BB353C000345D1A822906C0B86DF8409FB253C08049E705D01206C074225D7374B253C081684CC51CFD05C0C0EA38796FB253C001E6AF113AE405C09082584A97B253C081E6E42E8AD605C0747A73F2E1B253C000F4FEE695CC05C0544603DBF5B253C00005BA9B4CB905C07CDBEB5B88B253C0FF18E12F5EAA05C02CBBF9D61FB253C000120971A8A105C094B745F406B253C07F2665220A8505C02C8F6E17E9B153C080C70B60FF7205C04497536F9EB153C08041CEAF716305C0C09C0177BEB053C0803E62D0165F05C0105D9AFF70AF53C080CE183C056E05C018D9F8C0CCAE53C080AD0C0D387905C06C7EABF1C9AD53C080B3E4CBED8105C08802EF0ADBAC53C080AD0C0D387905C0E8FFB7BA45AC53C000443A8FCC6705C004089D12FBAB53C08047DB8B775E05C0EC4F8BBC6AAB53C000443A8FCC6705C0D8247D8FB7AA53C08033B4F7656D05C0DCCC66104AAA53C08054C026336205C060FD22451DAA53C080EC22C6174305C0F8A8C0A8C8A953C0007AD78C4B3205C048C16FB0E8A853C001F499DCBD2205C0E4EC652758A853C07FC5B87DB72205C0086427D0C8A753C00065ECF8ED1F05C0FC0D83F452A753C0FF0AB41A961305C05CC4296649A753C081B6014ED80605C09C57DC825CA753C08168079BBBF304C078970E7A8FA753C0FFA67C2600E504C0681ACE41BFA753C000E13998A3DC04C0086427D0C8A753C0812DBB461CCD04C05861031A33A753C0803E8D18C9BC04C0444512A690A653C0807D02A40DAE04C0BC92133C11A653C0805B9D15B1A504C0405D550A62A553C0808FD475BA9D04C088DDF01BFCA453C0FF016537599904C03C21CB1AA6A453C000A82C59018D04C02CA70DAC60A453C0FF500662BF8304C0581B4C8B46A453C000547A8C438004C08C1EA76410A453C00018EF22A78204C034E5402BEAA353C07FA098B28F9604C024A2B35AEDA353C0801F12AC14A804C0CCB1598123A453C0803E8D18C9BC04C0F4D44DD606A453C08160E4114ECE04C058A50E34B7A353C0017CB5F938E004C08CE21C7554A353C07F3B7276FBE804C03CC3D027E8A253C00095AA5453F504C0B410D2BD68A253C0805DC96F80FA04C0A4570796DCA153C001F49A4C4CFB04C070DE6E6583A153C081A0E87F8EEE04C0C8CEC83E4DA153C00051EECC71DB04C02C856FB043A153C07FF6B5EE19CF04C004D2231817A153C07F13C6EB01B804C080824BFAADA053C0811C361F44AB04C02C63FFAC41A053C001C5D9CDBC9B04C088C30143C29F53C081A3743F609304C00C8E4311139F53C08139461C2C9404C0A038EC634A9E53C001C5D9CDBC9B04C03CA9E14EAE9D53C080523B7746A904C04C4DBEE3D89C53C07F4169A599B904C020EE3F9F399C53C0013BD5FE27C304C0640BB564BD9B53C08055A6E612D504C0B498E8F1709B53C000762FE89EE004C0A0C503DE2A9B53C07FCBAFAC55F304C04CEFC3F01A9B53C00184D882A60505C010357577AD9B53C0FFCD1A1C221F05C07C8ACC24769C53C08048DCFB053705C0442622877E9D53C0813F6CC8C34305C080650750049E53C07F0005D2564905C02488C481B39E53C0FF0D1F8A623F05C09CBD82B3629F53C0FFD61932604105C0A296E65608A053C07F29F0714D5105C034294C456EA053C001AEEF7C6C6205C0D0588BE7BDA053C081397599257305C0E4747C5B60A153C001211DB6DE8305C0649DB81C6FA253C000F0C1E2A58805C020C94FB747A353C080E2A72A9A9205C02C6800F319A453C07F391211F99805C06444BF6F89A453C0805E45974EA705C07860B0E32BA553C07FD172D0C0C805C05C662F738BA553C0004E02A89DE605C0848C6448DBA553C000D9603CDEFB05C05424841903A653C000459F99A41106C02C8F9B9870A653C0804DE337B51E06C014B34100F2A653C000A3C33E5F3106C0F47ED1E805A753C0FF957469034906C0C84BDE639DA653C080950A2F636406C0985F5CF620A653C08080E39A517306C0040492949AA553C080F32ED41D8406C0C0441879D8A453C00076CB87009D06C0D84CFDD08DA453C07F626FD69EB906C0C0441879D8A453C000412E8A81D206C0D49BB165C2A553C0FF364B9480EE06C0C84BDE639DA653C08101E3B3511607C0943B14B432A753C07F007979B13107C02897DE15B9A753C0FF799C71334B07C038D6F0ED10A853C0814BCFA5CC4E07C0D4A3B45A27A853C001C9D0AECB5B07C06466EC9F35A853C0805CE08F2E7007C00434B00C4CA853C0006054DB188607C0F83BE05C91A853C07FE3C723AE9707C0ACA888D3A9A853C08081015E48AA07C0081E533589A853C001B6351F60BC07C094E08A7A97A853C0FFBF1AA436CE07C098B4D0CB11A953C001D4298244DE07C03C31D9E2B4A953C0FFA6DC5157EF07C0DCE83F7808AA53C0006CACA8E7FF07C0C08A921149AA53C00118488F602408C0FCC977DACEAA53C0FF0576BDB33408C0D4A68385EBAA53C0802C85D0D93F08C0002D9E26E5AA53C0004AC127917D08C0605982EF6AAB53C0019ABBDAAD9008C08C6FF4D3ADAB53C0004C500A8DAC08C09435416CDAAB53C0805BE3C63CC508C05418CCA656AC53C001E1D43C84DF08C03C817182CCAC53C07F07E44FAAEA08C06CB9536A11AE53C001C4C43F9CF608C080AEA88159AF53C0804F58F12CFE08C028FAD8974BB053C0FF0B39E11E0A09C060D69714BBB053C0816671BF761609C0349989D31DB153C00084109F5A2E09C06412220477B153C001C6F0996B4B09C040FE86A71CB253C08029288E017A09C078B3A9C731B353C081C71CF43AA009C0405C819ADAB353C081722B1280BC09C0E8FB7E045AB453C001FCD4A168D009C0888EE4F2BFB453C00183B03958DE09C0309108A955B553C0007C1C93E6E709C04CADF91CF8B553C080B4FD77B9E209C068B6D38521B653C080BD6DABFBD509C0E8A2855774B653C001FCD4A168D009C09C08D05920B753C000B9B5915ADC09C02058A87789B753C081A22BA60CF309C02094326745B853C0808E8BDC66FD09C07C09239027B953C0001A11F91F0E0AC050CC144F8AB953C0003A9AFAAB190AC0C03B86E80CBA53C000FD00FC37250AC0D8BA9DA8C5BA53C07F23100F5E300AC0C48B87227DBB53C0FF0446EC803C0AC06C3FD60FAEBB53C0FFB14E4B62430AC0C85FCD73F7BB53C080508885FC550AC0482A35094BBC53C0808A2E86AA6C0AC0F8DD83F67BBC53C00159293C1C840AC060F64A0A80BC53C0806EF23F1F9F0AC060F64A0A80BC53C0FF5DBFE3DCBF0AC0813137ECD2BC53C081279F11B1C00AC0949650A844BD53C081C6B1E128C60AC0BCBCA943CCBD53C081CBCB94E8CE0AC0D421C3FF3DBE53C07F6D8A69D4D30AC020FE01D902BF53C000511AE323E30AC0586FC170F3BF53C001163F4E17F40AC0B05BEBBBDDC053C07F4E8841DF0C0BC0F09AA44DC3C153C0816F1589DE210BC0F8A268DEC4C253C001C66E469D460BC0CC18C23E75C353C07F1F59C875660BC08CE1CC3D91C353C0001E51F201790BC0944245A737C353C00024F493678F0BC080B6BE10DEC253C001D12DCC26A60BC0E87BBC7992C253C0007A4D5126B40BC03054BBE246C253C0FF1601F27ED00BC0682A387A84C253C0812708A217EB0BC0D0F7F9733AC353C001E5C7713DFC0BC0484DE03BC9C353C000380F52B0050CC01037B30520C453C000A8C9C6621B0CC0F8AA2C6FC6C353C0819DE6D061370CC01012897264C353C000917AECBA450CC0944245A737C353C080A2819C53600CC004CA1443F7C253C080F54995F8890CC03C9C2F12B4C253C0000C73CEC49A0CC0502454E08CC253C0807EBE0791AB0CC0E85E5677D8C253C0015EB2D8C3B60CC0E47F1E4213C353C00062CC8B83BF0CC0A44829412FC353C0012AF069DCD40CC02C7D473E83C353C07F36DD66B5E60CC04802FF540FC453C0011B9C6770F40CC0A46AFC6EACC453C07F3BFD42BDF80CC00C01D69659C553C0FF1FBEDCBFFB0CC004D2647DE5C553C0013554C49DFE0CC0843AAC702BC653C080401FB80C000DC06C72A38341C653C0FFE452A1CB000DC0DC64F5F040C653C07F3E6DFEA6060DC00103000000010000007E01000098BD57A0E2A453C080510F1D775404C0FC667CA138A553C08028247D804C04C034433B1EA8A553C000C3AD73ED4604C064A2B96247A653C001381AC25C3F04C0CCAE04B0B3A653C081DB0557343604C040BB4FFD1FA753C081189F55A82A04C0245EA84069A753C001F46BCF521C04C020A7B4A0C5A753C0810186875E1204C09416263A48A853C000DD5201090404C0D0550B03CEA853C0FF4A393EDEFC03C07C582FB963A953C0FFBAFB0784F203C068C1D494D9A953C001095943CDDF03C0F48DEDEA12AA53C00146F24141D403C0D430462E5CAA53C0FFF8D31BF5BD03C0CCB305F68BAA53C000A8FDDB07AE03C09C13D168D8AA53C0FF56279C1A9E03C0709C0FC067AB53C000F836A4219803C0707573630DAC53C081301889F49203C0A0D4F1A7ACAC53C081CBA17F618D03C0C0D049A035AD53C080E5D5EF787903C0B8B08D5C9DAD53C0FF1D932FE26703C0D8B0036DE6AD53C07F4A40E4DE6003C00C1EF9C57DAE53C080609E30896803C0ECC26C88C5AE53C0006462831D7403C0188AF40819AF53C07F49530CA97903C0B88A67FEC8AF53C001B1AC24477803C0307719D01BB053C07F5EFA57896B03C04C930A44BEB053C080F5CB34556C03C0349989D31DB153C0001EB7D44B7403C0B8E861F186B153C0FF822DDEDE7903C09CEEE080E6B153C0FF1BDB477B7703C0586E456F4CB253C07F5EFA57896B03C06497B8538FB253C0806DF09C655E03C02C945D7AC5B253C0017EE6E1415103C0F463D1A9C8B253C0FFF8E6D6224003C08CE7DD9FA5B253C0FFCB51B2623503C05D1A781BBFB253C0FF779FE5A42803C070ED5C2F05B353C07FF29FDA851703C00CE3E86981B353C07F9967FC2D0B03C098253F174AB453C000CF6C54300903C03C1BCB51C6B453C080978B6F5D0E03C0ACB42C620FB553C080E9261F251803C05C4467DB81B553C07F627F34F72303C03C9498023AB653C0805C7258F12803C05078351801B753C0005FDE374C2D03C0B097AA0AE6B753C07FCFF2AE0D2C03C074FADC319EB853C001C8E5D2073103C0A4BAD3DFE3B853C0FFC1D8F6013603C0D0EDC6644CB953C080CB1C95124303C01C0EB9E9B4B953C080CE88746D4703C01C66CF6822BA53C07F3E9DEB2E4603C02C91DD95D5BA53C0FFCEBD91BD3903C028E9F31443BB53C0005C3D3BA13603C020B4066BD3BB53C0005FDE374C2D03C094AFD5F536BC53C000DC0C67192203C07CD37B5DB8BC53C0005DA775411B03C0B0EB888A6BBD53C080DC4184691403C058EEBFDA00BE53C07F00BA92910D03C0D041A5E4D1BE53C0018154A1B90603C0B491D60B8ABF53C0FFE5EF5C1A0603C07C810C5C1FC053C0018154A1B90603C0A8B4FFE087C053C07FEDFC38200103C0C0408677E1C053C0810E0968EDF502C0549C50D967C153C07F88CBB75FE602C0D0C3AA2302C253C000099BE3D7D102C030B79456B0C253C0011DF79439B502C0C0DBCEE711C353C000B065223A9A02C0508CC1FD7FC353C081FA3164778C02C0EC432893D3C353C000210E5B787F02C05C4692CF14C453C0005B3E04E86E02C08CC030AA76C453C00051597F115D02C0148B983FCAC453C000CF9F5C715602C0A4BEEF893CC553C000700ECA404D02C0D0D4616E7FC553C081DDF406164602C09C97532DE2C553C0FF58F5FBF63402C034646C831BC653C0FF9FCC25A62202C02CAD78E377C653C000E3EB35B41602C030A0F672D7C653C0805C109EC40802C0108C5B167DC753C0819F2FAED2FC01C08498A663E9C753C000E34EBEE0F001C048DE57EA7BC853C080F24403BDE301C0A835EBD9C3C853C080F24403BDE301C08837579FBBC853C0803DD4460DCB01C0D0905654FBC853C0FFECFD0620BB01C0E8C661B457C953C0FF5808B724B701C0F46512F029CA53C081E8538256B801C0104850FCF8CA53C0FFECFD0620BB01C01421B49F9ECB53C081E8538256B801C0E846CCAA17CC53C001BE8C558FB301C07CBF17ADC3CC53C07FFCF34BFCAD01C07CFBA19C7FCD53C07FBF68E25FB001C0C8471FE11ECE53C081E8538256B801C09CD05D38AECE53C0FF4AEEFE18C101C0A86F0E7480CF53C0817891B8B0C201C0E04BCDF0EFCF53C0FFE39B68B5BE01C08095267FF9CF53C0FF90E99BF7B101C088F84CCB0FD053C07F6CB615A2A301C0E4AEF33C06D053C0803F21F1E19801C0F0C80D29C0CF53C000B48D3F519101C0006DEABDEACE53C0FF50E52DB79101C02081851A45CE53C0817E88E74E9301C09C58495936CD53C000E7B60A839201C0346618F883CC53C000B669CC218E01C008A47367CECB53C08086EA85B98F01C0405EC2E03BCB53C0803F21F1E19801C0A83B05AF8CCA53C0800DC61DA99D01C0040AEF8454C953C08077F440DD9C01C010333CA294C853C08104BF4A949E01C01CF47F8320C853C080E32B72698F01C0045E03760EC853C0003F494EAC8A01C018EF816293C753C0014C3BA9ED8E01C07CF9F52717C753C000B669CC218E01C0EC53792E38C653C0FF2CB2A7618301C0846148CD85C553C000A8B29C427201C02C4F7EF0B9C453C0FF20E5992A5B01C0604380D1FAC353C0804833C24D3D01C0943782B23BC353C080CCA3EA701F01C0E0D137B08FC253C0FFB48A1C270701C024EFAC7513C253C000FD6146D6F400C040AF7A7EE0C153C0812968889AD000C0B0E26128A7C153C08146788582B900C0440348D26DC153C07F89979590AD00C094D987BF7DC153C07F5B0271D0A200C088BF6DD3C3C153C0809D45F40D9A00C02852D3C129C253C07F499327508D00C0B81EEC1763C253C07F862C26C48100C0801B913E99C253C000C2C524387600C090FBF7C27FC253C0803FA2A6E96100C0C09B2C5033C253C000C228AD645000C0581F394610C253C0016CA8E8AD3D00C0CCB5463CEDC153C0811DAE35912A00C0D8328774BDC153C0FF350619D81900C0440348D26DC153C0007B01B6B60A00C07806A3AB37C153C0002377A80B38FFBF80BD964BDBC053C0FF461B4C6517FFBF1414724A85C053C0FFB54E330FDEFEBF1414724A85C053C0FF3546578E9DFEBF344A7DAAE1C053C0FF8D52DB1655FEBF8804310840C153C000B966E3A209FEBFB437248DA8C153C0FEBF121799DBFDBF04000093A3C153C00209A28BD9A4FDBFBC989CF64EC153C0FFF64E6C087DFDBFF0007D2527C153C00230C4283D50FDBF50443A5AFAC053C0FF2349C82131FDBF8CAC1A89D2C053C0004ECC0D9505FDBF447142ACB4C053C0FE7C5C2F0ED5FCBF5818AF9AC3C053C0FF90EDFDBFAAFCBF7078AA71E6C053C001CC2D9DA48BFCBF8CAC1A89D2C053C001BAA5608371FCBFDC1CE00F60C053C002DBE6ACA058FCBF64F585C5C5BF53C0010335D5C33AFCBF042E27524EBF53C0FFEEAC98A220FCBF383EF101B9BE53C0FF0AE108BA0CFCBF607BC303DEBD53C00024E05B8106FCBF680084AF72BC53C0FF0AE108BA0CFCBF705057B197BB53C0FFFBC650AE16FCBFA43496A1CBBA53C0FED5AD45DB26FCBF00DA48D2C8B953C0FED5AD45DB26FCBF08FE9014B7B853C0FFF5EE91F80DFCBF5C6E569B44B853C002322F31DDEEFBBF0C337EBE26B853C0FE32CE88CDC5FBBF5CCFCE04EBB753C0004D6C338596FBBF940B24748CB753C0FE95C68A756DFBBF188351C04BB753C0019E72BE6B3FFBBF30B7C1D737B753C001D9E77AA012FBBF48EB31EF23B753C001DA86D290E9FABF64F31647D9B653C0FEF4EF5FF8C7FABFB863DCCD66B653C002F6599A98ACFABF845C740835B653C0FF03A96FF494FABFA490E41F21B653C00039DC32D37AFABF8888FFC76BB653C0FF5F5F78464FFABF9C5BF775B1B653C0007BC805AE2DFABFA422EA45DAB653C0FEB852092E02FABF84C5428923B753C0FF3E91294AEAF9BF64B1A72CC9B753C001B40B0D91D9F9BFD006FFD991B853C0FFDB4BA0DCC4F9BF1C537C1E31B953C0FE19CFC0F8ACF9BF0459FBAD90B953C0FFB0D11DEA8DF9BFA0057B88B0B953C0009F7EFE1866F9BF4469EE0274B953C0FFABFB3E5136F9BF8CE989140EB953C002B8787F8906F9BFE476BDA1C1B853C001E84470C6D2F8BFC0C2B83799B853C0027B9D48EEB0F8BF44F3746C6CB853C002772FC4D88CF8BF5C6E569B44B853C0FE8BC0928A62F8BF489B5EEDFEB753C0029F51613C38F8BFC0128C39BEB753C0FFE7769BDC1CF8BFAC6B1F4BAFB753C002F6FA8D88F7F7BF1407F3FEEFB753C00210641BF0D5F7BF40C7E9AC35B853C0024601196FA0F7BF24BF045580B853C0003F9394597CF7BF2008DC3783B853C0FF62B3E9487BF7BF94C719110CB853C001DA40FEF579F7BF30380FFC6FB753C00206E4B78D7BF7BF5C751D3D0DB753C0FE6D364EF17DF7BF98CC456A64B653C0003F9394597CF7BF84B054F6C1B553C000286C31386DF7BF3CF42EF56BB553C00031DC647A60F7BFD46424E0CFB453C000AC0E626249F7BFAC05A69B30B453C0020962E28729F7BF8CCF9A3BD4B353C002E9E675D314F7BF4813753A7EB353C001041BE6EA00F7BF149ADC0925B353C002A1806928F8F6BF14C178667FB253C0FFDFE75F95F2F6BFBC4B883D9DB153C0FF7895C931F0F6BF90EC09F9FDB053C00116DF22C0F9F6BFA8E68A699EB053C0FE274E6C400FF7BF38DA3F1C32B053C0013BBDB5C024F7BFB88A67FEC8AF53C0FF674445A938F7BF487E1CB15CAF53C0024004B25D4DF7BF94A829F2F9AE53C001F82C88AE5FF7BFC8E5373397AE53C0FF444BAEFA75F7BFF4BF1F281EAE53C000CD18B1128DF7BF8416FB26C8AD53C00208739A89AAF7BF687DC97A55AD53C002B72B3D98C9F7BFE02DF15CECAC53C000D2EE8FABE4F7BFB8CE72184DAC53C00290CF7F9DF0F7BFE0CFF6692EAB53C0FF110193C3FBF7BF1CDE123729AA53C0003EA44C5BFDF7BF10886E5BB3A953C0FFFAD92FA2ECF7BFE8EE3CAF40A953C00200924943E6F7BF683C3E45C1A853C002EECD0C6EEDF7BFC8A9D8565BA853C000688FEC5105F8BF30871B25ACA753C0015F1FB90F12F8BF54FEDCCD1CA753C0FEA9AEFC5FF9F7BFBC6B77DFB6A653C0029CF7CC80DDF7BF5086C8EEA4A553C0001AC6B95AD2F7BFD0500ABDF5A453C0FEEC3E2A72BEF7BFB0B7D81083A453C0FF727D4A8EA6F7BFC04E33350DA453C001B59C5A9C9AF7BF20C94FB747A353C000BB54743D94F7BF3860AADBD1A253C0FF844187639FF7BFE4B0064B1CA253C00041227755ABF7BFF847616FA6A153C0FF1DEFF0FF9CF7BF40C8FC8040A153C0FF768A578483F7BFBC782463D7A053C002C6D1B47564F7BFF0B532A474A053C0FF558008D43FF7BFACBF593B4BA053C0FFA6C765C520F7BF5023CDB50EA053C0FE4282DC57FBF6BF2C8A9B099C9F53C001BBB4D93FE4F6BF6CA710CF1F9F53C00085A1EC65EFF6BF9C81F8C3A69E53C0012D0686E108F7BFD43B473D149E53C002B68BA29A19F7BF00B308E6849D53C001989F18E233F7BF340A3113DC9C53C0019A2EFBDD62F7BFB81D7F41899C53C002A8E52ABD7EF7BF14989BC3C39B53C0FF1DEFF0FF9CF7BF4CEFC3F01A9B53C002C3538A7BB6F7BF045A3A4C1F9A53C0001AC6B95AD2F7BFFCBA89104D9953C0FE689CF947E2F7BFC8F8E47F979853C0FFFAD92FA2ECF7BF6CCC00B7119853C00051688930F6F7BFEC7C2899A89753C000353419190AF8BF400A5C265C9753C0FFAEF5F8FC21F8BFFC1383BD329753C0FF320BE2733FF8BF9431DD44039753C0FECEA63B4D43F8BFD0E7B3012D9753C0FE6BABA5F551F8BF707A19F0929753C0005ACB3E716BF8BF30F66536D69753C0FF63B1C9F185F8BF30E0085F139853C0011F6A15DC9BF8BF508E9138409853C0FF2650A05CB6F8BF30CAAB87509853C002B4EE47D3CEF8BFDC50C97D4E9853C000B6D8EAFB0BF9BFFC35F3C0349853C001F88A82A11DF9BF0C165A451B9853C0FE0E96BB133FF9BF0C165A451B9853C0001795D15161F9BFBCA240A4219853C0018D9E97947FF9BFD482A728089853C0FFC7F8800B9DF9BFA0090FF8AE9753C0016AA500E6BCF9BF9043C25F829753C002D4867945EEF9BFAC864F307F9753C0FF8A3E32922FFABFB4DCF30BF59753C000B7B8B48466FABFE89E989CAA9853C002A03C5E0E74FABF6064AE11A39953C0021446245192FABF58307A392F9A53C000C9B6E000ABFABF48B339015F9A53C0023FC0A643C9FABF7C2CD231B89A53C0024D77D622E5FABF18B2B5AF7D9B53C0FFFFE792D2FDFABF34CEA623209C53C0002E1A2F662EFBBFC8FDE5C56F9C53C001CD0E959F54FBBF945DB138BC9C53C0016193C79687FBBF6020A3F71E9D53C0016322AA92B6FBBF04162F329B9D53C000D3735634DBFBBF9CB503F7A19D53C00024E05B8106FCBF547A2B1A849D53C000049F0F641FFCBFA4EAF0A0119D53C0FFE83582FC40FCBFA892DA21A49C53C002EFD8236257FCBF5C72E89C3B9C53C0FFA57ECC7180FCBFFCAA8929C49B53C00176EEAAF8B0FCBF647B4A87749B53C00170779452D1FCBFB4179BCD389B53C000550E07EBF2FCBFE87F7BFC109B53C0FF3F7D38391DFDBFE453F03CDA9A53C0FE2414ABD13EFDBF84FF8DA0859A53C0FE0EB8F96F5BFDBFF0CF4EFE359A53C001EA69D14C79FDBFD8D0CB90B99953C001EFA23812ABFDBF5C74849CAF9953C000C61FF39ED6FDBF200CA46DD79953C0FE91B71270FEFDBFD49BDEE6499A53C0FE6E41A90225FEBF8057A41FF39A53C0FF7B52CF7D5FFEBF9867CCF4F09B53C0023AD0364391FEBFA8BE65E1DA9C53C0023866FCA2ACFEBF04B24F14899D53C002F71881B8D0FEBFCC75FAA4E79D53C000E25295B608FFBF946530F57C9E53C000E7C019CC2CFFBF9030434B0D9F53C002AB807AE74BFFBF74285EF3579F53C0029217ED7F6DFFBF74285EF3579F53C0019078958F96FFBF10B915FF4D9F53C00282F4A2E3BBFFBF1461FF7FE09E53C002328D6FEDE9FFBFB499A00C699E53C0014D228814FFFFBF30E54299F19D53C0FFAC8311680100C01C124BEBAB9D53C0012D8093E7EEFFBF84B68089259D53C0012D8093E7EEFFBFC4C64A39909C53C0FF9184BEA00700C03C3E78854F9C53C08095BB80AB1900C0E0CE2F91459C53C08174AF51DE2400C0742AFAF2CB9C53C081E7FA8AAA3500C0A4EAF0A0119D53C000672B5F324A00C05822159B169D53C0015304CB205900C0F0F93DBEF89C53C081D2349FA86D00C0DC264610B39C53C07FB7002F918100C0DCFABA507C9C53C0012A4C685D9200C0F402A0A8319C53C07FA36F60DFAB00C0C06E34BA229C53C08105350245C200C0A892DA21A49C53C0816DD26260E100C020BA346C3E9D53C07F818FBCD1ED00C0A80C9DE38B9E53C0007109256BF300C074285EF3579F53C000747504C6F700C004DC3ED44BA053C000D3CEC6D00901C07C03991EE6A053C000C213121A1D01C02C6748D821A153C001BBD118C42F01C02480ACF143A153C001F98E98DB3C01C0AC85720548A153C00136338D354201C0D02FE33652A153C0802EC359F34E01C0580C90FB45A153C0803F1918B65C01C030787CA1FEA053C08185E86BF16801C0BC8B6F3C80A053C0800C15D4D17C01C0802F5E8926A053C0FFD1E42A628D01C0B0101591BE9F53C081EC654806A201C02021AC547D9F53C080AAC465AAB601C0A040E7E7669F53C000BED343B8C601C048B9D756E79F53C07FD49C47BBE101C02C6748D821A153C00031EE3BC3EE01C05CF251DCF7A153C0802AE15FBDF301C0D8A6AF4F6FA253C080ADB230F0FE01C008AE1715A1A253C0FF284208CD1C02C054A27EDAD2A253C000018AA5095602C09409E27627A353C07F66F0431A6302C02C65ACD8ADA353C000566AACB36802C0782426F46FA453C081DF4859EC6E02C0DCA41350FBA453C00060AE4AC47502C0BCC8B9B77CA553C080C880C82F8702C054CC6D9A95A553C0FF376022A19302C0B89C2EF845A553C0FF47B19CB79B02C0D84CFDD08DA453C000311E294BA602C048991CF099A353C07FBD68B5DEB002C0200E13ECC3A253C0FFAF4EFDD2BA02C040BEE1C40BA253C08019217B3ECC02C048F3CE6E7BA153C081845FD804E202C0B097040DF5A053C0810124CD31F202C0807FF7DF41A053C000746F06FE0203C058F4EDDB6B9F53C001593B96E61603C02CC1FA56039F53C001C8E5D2073103C044C9DFAEB89E53C000C87B98674C03C0FC8B6C892A9E53C07F88FD84044F03C05CDFECAE0A9E53C07F14B8BE0D5203C0204C3A92F79D53C0FF069E06025C03C044E56B3E6A9E53C080F5CB34556C03C0140B8449E39E53C080AFD097767B03C0F4ADDC8C2C9F53C07F6AD5FA978A03C09CBD82B3629F53C07FC59CBBEBC503C0142DF44CE59F53C0016D9037630E04C0009699285BA053C0FF71D733003704C008EC3D04D1A053C0818BCC8E1A4C04C0E4B0064B1CA253C000A69D76055E04C054065EF8E4A253C0016FBC91326304C07802B6F06DA353C0019D2D43C36A04C084A1662C40A453C0FFFEF9C78C6D04C0C8C29C7F89A453C000718B50506E04C0B81AFF5C99A453C080CF8816FC6504C098BD57A0E2A453C080510F1D775404C0
7	Amazonia Sur	operational_zone	1	Z6	t	2026-07-24 10:51:50	2026-07-24 10:51:50	0106000020E610000001000000010300000001000000BC040000287C07DDEB9753C081548E7348420CC0B8FBC0A6859853C07FACDCC96D570CC008655175ED9853C0806FB1A3E2640CC014B8B848239953C07F2D38F28C790CC0A8B4D305749953C001A511DDAFA70CC0208EBE28A29953C0802BBB9099C20CC0ECCAFC00A69953C0FFB1644483DD0CC0103B57556C9953C080D1D5FFE7F80CC0706E73D12E9953C07FF59446170D0DC014B8B848239953C0807D58D399250DC0FC1727BB499953C0800A6AEBE6360DC0305E87EF8E9953C001922D78694F0DC0DC7DD246029A53C0817F0F24D8690DC00C47D187909A53C0FF41E4FD4C770DC04010D0C81E9B53C0803962C050830DC0C4B983B2399B53C07F2FC6A9BB910DC06403C9292E9B53C0818D7C64449D0DC008CA6F94D99A53C0FF83FA2648A90DC0A0C04D38989A53C07F165ACA5FB30DC018179A4E7D9A53C08172F6AB4FC10DC0A0C04D38989A53C0FF37E55E5DCC0DC0189A385BC69A53C080307DFAF9D50DC0189A385BC69A53C080553C4129EA0DC0BC60DFC5719A53C080B0BE4980FA0DC0F023A1ED6D9A53C081344E24D1170EC0CC30A88C5E9A53C0FF8B9C7AF62C0EC0707AED03539A53C07F1CE24475390EC0E853D826819A53C000DC826CB84B0EC0181DD7670F9B53C07FCA7EF1BF630EC014231481A19B53C0008A1F1903760EC0E4355839249C53C0017F83026E840EC044F24FDBC19C53C00073CD1240950EC028D55C5A319D53C0FF6831FCAAA30EC024DB9973C39D53C0FF89BC90A8BC0EC0E0470F85DA9D53C07F1C1C34C0C60EC08414F308189E53C080D888A9D1DD0EC0FCEDDD2B469E53C07F94F51EE3F40EC04CD4CFED649E53C0FF222110C9030FC0B4DDF149A69E53C0807A6F66EE180FC02CB7DC6CD49E53C08007817E3B2A0FC014174BDFFA9E53C08096AC6F21390FC0283A7B791D9F53C0808AF67FF3490FC00C9AE9EB439F53C07FE478884A5A0FC054B012E7759F53C080A9673B58650FC01870EFCBC29F53C000A419B08D6C0FC00053FC4A32A053C07F6D56EE65700FC0F4583964C4A053C0FF05041D48730FC014FF070B30A153C0006908639B770FC0942B5A0194A153C0FF61A0FE37810FC01088E3300BA253C07FF0CBEF1D900FC0C877F74E6BA253C001E3FB2657A30FC010E1871DD3A253C0003D7E2FAEB30FC010E7C43665A353C00098003805C40FC0A0667E00FFA353C000BED957CDD50FC08CC6EC7225A453C0014C4433FDE30FC008DFD36F45A453C0000CF0A4E8EC0FC06043BEE547A453C07F6D814EC0F60FC0E857964A2FA453C040EF7ACA4B0210C0E857964A2FA453C0C03D4EE8D40910C0100C93D14CA453C0C05C1422D41110C0246611955BA453C0806266F2E61A10C07CCAFB0A5EA453C000F6DF6E972210C0100C93D14CA453C08015A6A8962A10C054B87128F9A353C0C0966199F82F10C0FCC42B5D6FA353C07FE80FA6D03510C04C9EC91523A353C03F2425380B3B10C010638F69EFA253C00079AE33323F10C06C96ABE5B1A253C0BF9B4F5C804510C0C0CDD6F9ACA253C0404C18316C4A10C048710AB41BA353C0809AEB4EF55110C0DC6EBC3199A353C080D600E12F5710C06043BEE547A453C0C05006F4F35F10C0ACD876558AA453C040E57F70A46710C0C432F51899A453C040636072B76E10C0006E2FC5CCA453C0C0F6D9EE677610C0304FEBADF1A453C0BF2F1492537D10C000C63CF167A553C08065A7EFD98710C0E80BC03A9EA553C080D156D26A8B10C0E80BC03A9EA553C00033413F259210C0386F13F073A553C00095B818AC9710C00029B3BB2EA553C0C0F6A285669E10C02C990D10F5A453C0008B1C0217A610C0A8EF5926DAA453C0C01E967EC7AD10C0A8EF5926DAA453C0C01948F3FCB410C02C990D10F5A453C0C07A3260B7BB10C010F97B821BA553C0C175E4D4ECC210C01C4CE35551A553C0013F94A6F8C710C0C018C7D98EA553C080A298EC4BCC10C06C38123102A653C080059D329FD010C0F8B7CBFA9BA653C08034F88F63D610C030FE2B2FE1A653C08030377165DC10C058F12490F0A653C0412BE9E59AE310C098074E8B22A753C0C0259B5AD0EA10C064448C6326A753C000EEBDBF0FF110C0105E9AA107A753C04083C4A88CF710C040CEF4F5CDA653C0004C747A98FC10C05C6E8683A7A653C040130A730B0411C08C3148ABA3A653C04010D6C0D90811C0FC3A6A07E5A653C0C0A56916230E11C098074E8B22A753C0803BFD6B6C1311C0B42A7E2545A753C04038C9B93A1811C0988AEC976BA753C080349507091D11C0547A00B6CBA753C000FB9D93AF2511C0345D0D353BA853C04090A47C2C2C11C078F6D43CB6A853C040C08C46BD3011C004F3EFF906A953C040EFE7A3813611C0F4A5C53F63A953C080E5D8F9B84311C02CEC2574A8A953C0C1DA3CE3235211C090A2E0FCB3A953C0C0A0B802FE5B11C094F547D0E9A953C0000089961F6511C0D0B809F8E5A953C040FAAD9E886D11C0747FB06291A953C00026D5491B7811C0FCA5C53F63A953C040232E04B67B11C00CF3EFF906A953C08081E4BE3E8711C050867AE8EFA853C03F4B21FD168B11C05C5643AFDCA853C000AD0B6AD19111C000A08826D1A853C0004212534E9811C09CE9CD9DC5A853C000D5FE6232A111C0F44C21539BA853C0409EAE343EA611C0BC06C11E56A853C0C034CFF653AA11C0A060F277EAA753C0BF00260EC5AB11C090BA23D17EA753C0809C945BA5A811C098074E8B22A753C0C0D03D4434A711C014DBFB94BEA653C000D0B0D767A811C06C3E4F4A94A653C0003228B1EEAD11C0F06AA140F8A653C040C6A12D9FB511C01C34A08186A753C0005BA8161CBC11C0E8761B731CA853C040BAEB3D71C611C0041DEA1988A853C08019BCD192CF11C048331315BAA853C08178FFF8E7D911C0B8310FE9E9A853C0BF79B5C4F5E311C098DB9FBD13A953C040DE215D1CEC11C02021461C3BA953C040BB1C2743F211C088DFAE554CA953C04019D3E1CBFD11C00C2555B473A953C0C01B4AC38F0812C0FC86F1A7F3A953C080ACE850F11112C060D4B5368CAA53C0404C6A7B521F12C03CC8686DB9AA53C0FF0AFC13A52A12C014D56F0CAAAA53C07F9D5BB7BC3412C0C4EE7D4A8BAA53C0C1C90FCF1B3E12C0CCBE461178AA53C08029E0623D4712C0A84EECBCB1AA53C04088238A925112C0603E00DB11AB53C040B44A35255C12C03851449394AB53C040E18BB9506412C074EA0B9B0FAC53C08046AAD83C6612C0A0B30ADC9DAC53C080A821B2C36B12C034B02599EEAC53C0400B998B4A7112C08C19B66756AD53C04139677C427812C04009CA85B6AD53C080D1A117F17912C0401544B8DAAE53C04003A4BA1A7C12C0600E7A327CAF53C0C066A8006E8012C0485A3677FBB053C0C004D1452C8712C0A474C4BCD9B153C000C420BEAC8812C03CE0CB58CCB353C08031D4CC0D8C12C0606CABB8FEB453C000FC4E08309312C0C08639FEDCB553C040555516F39C12C020E0A845C1B653C040FB366FD7AA12C0B8C7C67251B753C080C1F08BFBB712C06CB7DA90B1B753C04057E60240C612C01C6492B423B853C000A0002F63D012C0B40CCFDFADB853C0406A7B6A85D712C07C7E20FA01B953C00046E28747DE12C034AD151A68B953C0403D604A4BEA12C0F03364C47CB953C0C034E04C8F0B13C0D4167143ECB953C080619464EE1413C0EC3FDEF6A0BA53C08090EFC1B21A13C0CC22EB7510BB53C0C0876D84B62613C03826D0B8BFBA53C0C0800520533013C0E0EC76236BBA53C080E496D2723313C078B31D8E16BA53C040489B18C63713C0F0B602D1C5B953C00077F6758A3D13C05C3D8620BEB953C040711B7EF34513C03C9DF492E4B953C0406AB319904F13C0C0C9468948BA53C000CB101A7E5713C01C03A01E9DBA53C0FFF8DE0A765E13C08C0CC27ADEBA53C0C058AF9E976713C0E8C27C03EABA53C000EC9BAE7B7013C08C89236E95BA53C00180152B2C7813C0E069D81622BA53C0407CE178FA7C13C0304A8DBFAEB953C00079ADC6C88113C0E42BB61377B953C0C04D8A607E8713C0100D72FC9BB953C03FCF4551E08C13C0F014902C0DBA53C04183E9141B9013C008E7435E39BB53C0803D43B6F38F13C09CBEC73D54BD53C0809C5D7E078F13C0745541C34CBE53C00063BFCD909413C0B01FD7C407BF53C0803904BA199E13C0B07D64204FBF53C0C018766504AF13C008E24E9651BF53C03F7A070FDCB813C0ECB89ECC82BF53C000B241B2C7BF13C00C098EC8ACBF53C040A7182F66CF13C080E278EBDABF53C080D23FDAF8D913C0BC28D91F20C053C000342A47B3E013C0B8AB772C69C053C0006051F245EB13C05CF110D287C053C08018B5690AF313C0C8F40157B2C053C0800E2F680BF913C010B63D02E0C053C080AE4D6F10FE13C0D0CDC9D91BC153C000B98321EC0614C074A3A0D75AC153C0807AF6C3BE0B14C02C57233ACCC153C00059A228F10B14C00C4D5B763AC253C000579935770A14C05CE75EA4D1C253C0C08273D2430414C0F082DB0A5BC353C0C03F500AFDFA13C068CC9001BBC353C040A245C15FF813C044D4AE312CC453C080F17CEC73F313C0ACC3E5647DC453C040FB0DB960EE13C0C8A8B0E5DAC453C0407D2DB74DE713C01C9CF6B064C553C0C057B19FB0E213C04839CD5018C653C0C086BE833AE213C0704B57337DC653C0C08008A69CE513C080036352D3C653C080D86C9012E813C0242ED43158C753C0007A52C8FEE813C0FC083300C2C753C080AC3A9BD7E613C074B0755269C853C000120B4189E213C05C43E03F29C953C000A7E8CAC4DD13C0A881DF2DE3C953C0C0D3CC46C5D813C0BC57E50D62CA53C0C0D3CC46C5D813C0505400CBB2CA53C0803978D27DD913C0AC8D596007CB53C040A0B0CA02D913C06083AA97F9CB53C0C06D21BB0CD813C028C625898FCC53C0C0D3CC46C5D813C024CC62A221CD53C0809D09859DDC13C020D29FBBB3CD53C0809C7C18D1DD13C0404E74429ECE53C0809C7C18D1DD13C0DCA333ECB6CF53C08068D32F42DF13C0CC56093213D053C0C066B956A9E113C000200873A1D053C000659F7D10E413C01CC6D6190DD153C000010ECBF0E013C078FF2FAF61D153C0803A053F4AD813C0D0BB2751FFD153C04043877C46CC13C0088526928DD253C000B127D92EC213C030FBBDFFE5D253C0C0EB382621B713C0C4F7D8BC36D353C080C0117B8EAC13C04CA18CA651D353C040F8EE154FA613C0B4AAAE0293D353C000CBAD91239E13C0B0B0EB1B25D453C0C0363415739613C0183DAC84AFD453C000053272499413C08C9935B426D553C0806E11B0339013C080CFA906CCD553C000D97D5AEA8A13C0B4150A3B11D653C0C00DB4AF458813C094F816BA80D653C0004504DE398313C0E8DE087C9FD653C0801850C6DA7913C074DB2339F0D653C0C0870AFC5B6D13C0802E8B0C26D753C0C05AC977306513C024FB6E9063D753C040C64FFB7F5D13C09857F8BFDAD753C000FE2C96405713C0908D6C1280D853C0009B2850ED5213C034B3F48285D953C03F9C4229865013C0C432AE4C1FDA53C0406B40865C4E13C0206C07E273DA53C000A10348844A13C058B26716B9DA53C0C175DC9CF13F13C028420DC2F2DA53C0C0AF607D173613C0944B2F1E34DB53C0011B5A949A2F13C0A89E96F169DB53C040EB71CA092B13C0705E73D6B6DB53C040EF32E9072513C08881A370D9DB53C0818BA136E82113C0F40727C0D1DB53C0405DD345F01A13C07C2E3C9DA3DB53C0806221D1BA1313C0BCC1C68B8CDB53C000D0C12DA30913C0BCC1C68B8CDB53C040D72992060013C0F4064DB3A6DB53C0C05949B21FF912C0D8B112D27EDB53C0004BE6A46CF712C01CC83F0828DB53C0C00203D32CF212C05479920CAADA53C0000BC61E60EF12C0E4CC98DD2EDA53C04074C9080DEC12C088474B13E6D953C0C0844FA073E612C02CC2FD489DD953C0C0D6117DFAD812C0B0F2B97D70D953C080797A77F4CD12C044295A4C3BD953C0001CE371EEC212C068B762B40BD953C000F7AC917BB912C04C65A82226D853C000D5077622AB12C024B275279AD753C04054C37E4FA412C074EBECF9F4D653C04075E396BC9B12C044F4A7977CD653C0C0BC4165108A12C014DC9A6AC9D553C04044C0B9708012C02481253B5CD553C0BF2C7FAC4A7612C044CB1B3C40D553C041008A6B5E6612C034A46FD70DD553C0C07A17D82B5412C0500F2EA32CD553C00056E1F7B84A12C03C8709D553D553C0C0FD7B79CC4112C010D838A248D553C0C04E2682F93A12C0D42284D545D553C0C00643B0B93512C08CC4E26F2FD553C081F18E7CF32F12C0D801BC0A0BD553C040F7C4EEC62812C00890C472DBD453C0006FC1967A1B12C010F13CDC81D453C08098A4FA1A1012C048A28FE003D453C04042CC558E0B12C084B8BC16ADD353C0808BB312880712C024CE941A3DD353C000E002C96EFE11C0A0B29789FCD253C040F8674354F611C04CFB651119D253C0404476A364EB11C024A1A6F67FD153C0C0C53C9094ED11C0184E999BEFD053C04068FB6480F211C0546BFD343BD053C040F1A0342FF211C09118EE703CCF53C0C06CB3A4E8F611C0E051654397CE53C040414367E8FD11C0DC4D037B16CE53C07FCF7C31080412C0206430B1BFCD53C0804A8FA1C10812C0400F9F1B4ACD53C07F9EDA6CEE0812C0A0908A1D12CD53C040BC55D7A10212C0A46FC252D7CC53C0402E1C0D82FC11C0944816EEA4CC53C0C0E5383B42F711C08CE33BBC7DCC53C080F9638062EF11C0C8102AE533CC53C0404476A364EB11C08C3138C9BDCB53C000F56CBBA8E811C06442F8EFF8CA53C08014D8C904E711C0485005D482CA53C08052AEE6BCE311C030B4D2554ECA53C000C07D57E3D611C0289A1F9645CA53C0406EE795C7CF11C028445FF803CA53C0C15A27F163C511C000E7EC9AB9C953C04039F83102BE11C0E02B134106C953C0C0366B58A2B911C09C4FD46741C853C040266F6444B811C064A7FB0D8EC753C000153C9940B211C05C3788B043C753C0801278E83AA911C0547648D12DC753C0C0DF155ED59B11C0CC078A7302C753C0FF9FDBD40B8B11C03CADA188F0C653C0C0CAC57D837111C0182528DEFEC653C04012BFB3546811C0CC078A7302C753C0009C7B546B6511C06C42C648FBC653C00031EEEA7B5F11C008285353F2C653C0411C3C80365911C02432D3F317C753C0003154149B5211C0C4D2C29035C753C040930CDD455011C0709F54AF66C753C080185A3A724811C06CDB618D9FC753C080B6FE5B9E4411C05C8D484E85C753C080D53293543E11C064F8C78F59C753C040D5FBBBAE3911C0400E7CD20AC753C081B176FA923211C040B8BB34C9C653C041B13F23ED2D11C040B8BB34C9C653C04070A5552F2811C04442E2511CC753C0C0AD449B412011C04CCFBBB120C753C0C0CA22D03D1A11C058C71453F9C653C080C85E1F381111C0442B9B92BCC653C000F806C97C0A11C0442B9B92BCC653C08078C7F447FE10C0A8628F28EBC653C040907185AAF610C098D7EA0806C753C0FF58C5BD27EE10C09C7265B3F7C653C0406DDD518CE710C068D095DDD3C653C080FEBDEB9EE210C0DC95E822A1C653C0C067C1D54BDF10C0A0E033569EC653C000A9E931CCD410C0DC95E822A1C653C0406C6E5979CA10C0AC07E0BAD0C653C0404493CB4CC310C040FECFEA2FC753C0C08F1F3600BD10C0E8E1BE1A8FC753C0C0CEB6CD66B710C03823FA7DEBC753C0C0EC31381AB110C0DCC2D6465EC853C0FF701FC860AC10C050D4AAA700C953C0405C6B949AA610C04873323E5AC953C080DDB37627A410C01C06F2A0C4C953C000BB0A70149F10C0BC84069FFCC953C0403AC678419810C0284E66D031CA53C04168DB63FB8E10C0A41DAA9B5ECA53C040DBA584957F10C0C8CC7ACE69CA53C080AEB043A96F10C0806ED96853CA53C08043246B566510C064031B9D34CA53C000DEC9191D5D10C01CE98B9E0ACA53C080C3E35E3D5510C0F456216EB9C953C08015A63BC44710C01C0290D843C953C0C0ACA63CD14110C0402BBE0EEDC853C000C894CD243710C0B05596A9C8C853C0C1D68D8B2B2D10C0A4118442DCC853C0401B5B95652010C06C3F69731FC953C0C03E0C72EC1210C088AA273F3EC953C040E7A6F3FF0910C00C5D3F465EC953C08152F1BEABFB0FC00C5D3F465EC953C0007AE34106F00FC0448DDEB05AC953C08111AFABFCDC0FC0CC4C4CF17AC953C000543E6980C90FC018876BFC9CC953C080C655F58AC00FC018876BFC9CC953C08041CF1F00B40FC0A8A5460976C953C0001FA77DADAE0FC0DC6AD361F0C853C000E328F73DA90FC0CC8FE0C2D1C853C0FFF97ECA2E910FC0E845C6000FC953C0FF187C2A3F860FC0F876793D6FC953C00199D468237F0FC0F876793D6FC953C0812F644FE4640FC0F04213BE5DC953C080CE279C245C0FC0D01907E024C953C081A51A79FD420FC0D05020A2E7C853C00062BCFA39340FC0C4AC46C58BC853C0FF9D053E922C0FC0941B6EE82FC853C0FFBA75C4421D0FC09C86ED2904C853C080B5ED62370B0FC09C3521A838C853C07F5097FCB7F90EC0B09A3A64AAC853C07FAE89A494E60EC0CC1CBA22D6C853C081C76C51E5D20EC0C0752D03C9C853C0FFC2E4EFD9C00EC0D0366DE2DEC853C07FFC32AB86AB0EC000912CFD77C953C080D444B3738D0EC0309278371ECA53C0802E8B56DC7A0EC0A03E726699CA53C0FF6C655E4E6E0EC0A8210C64DFCA53C08199D59B4E670EC05405FB933ECB53C07FCE20F9DB560EC0D0D43E5F6BCB53C000D028CF4F440EC058E8949184CB53C07FB12C4C6A2A0EC0DCFBEAC39DCB53C000573AF41D1D0EC034BF665BDBCB53C081853BF637110EC0B0AF72F142CC53C0808E1616C5070EC08075527B6BCC53C07F64FD3BE2F90DC07885280678CC53C000B5D4EB5DE20DC004C38F5064CC53C08144C75700D00DC01CAFACD9EFCB53C07F719F2EE8C30DC09CEB31AD67CB53C07FDC92C1F6BC0DC01C1B0C6BC6CA53C001FC604B55B30DC0284E66D031CA53C000E1DAACA1B00DC07043CB3BA0C953C0004196472F990DC014A1176F9DC953C07FF0DF2BD68A0DC0806A77A0D2C953C00108B01EB0800DC0BCA5CE6937CA53C07FDD47B723750DC0AC61BC024BCA53C0805A76E6F0690DC0E833D7D107CA53C0010AC0CA975B0DC0009B33D5A5C953C00006A617D8520DC024F4AC04E8C853C001FE8340154C0DC02C446D6C0DC853C080BA823061470DC0344C291F4AC753C0FF925C0045390DC07C4B6472ACC653C000334C6337240DC0D074CB7B4DC653C07F1E9F7448100DC0DC64F5F040C653C07F3E6DFEA6060DC06C72A38341C653C0FFE452A1CB000DC0843AAC702BC653C080401FB80C000DC004D2647DE5C553C0013554C49DFE0CC00C01D69659C553C0FF1FBEDCBFFB0CC0A46AFC6EACC453C07F3BFD42BDF80CC04802FF540FC453C0011B9C6770F40CC02C7D473E83C353C07F36DD66B5E60CC0A44829412FC353C0012AF069DCD40CC0E47F1E4213C353C00062CC8B83BF0CC0E85E5677D8C253C0015EB2D8C3B60CC0502454E08CC253C0807EBE0791AB0CC03C9C2F12B4C253C0000C73CEC49A0CC004CA1443F7C253C080F54995F8890CC0944245A737C353C080A2819C53600CC01012897264C353C000917AECBA450CC0F8AA2C6FC6C353C0819DE6D061370CC01037B30520C453C000A8C9C6621B0CC0484DE03BC9C353C000380F52B0050CC0D0F7F9733AC353C001E5C7713DFC0BC0682A387A84C253C0812708A217EB0BC03054BBE246C253C0FF1601F27ED00BC0E87BBC7992C253C0007A4D5126B40BC080B6BE10DEC253C001D12DCC26A60BC0944245A737C353C00024F493678F0BC08CE1CC3D91C353C0001E51F201790BC0CC18C23E75C353C07F1F59C875660BC0F8A268DEC4C253C001C66E469D460BC0F09AA44DC3C153C0816F1589DE210BC0B05BEBBBDDC053C07F4E8841DF0C0BC0586FC170F3BF53C001163F4E17F40AC020FE01D902BF53C000511AE323E30AC0D421C3FF3DBE53C07F6D8A69D4D30AC0BCBCA943CCBD53C081CBCB94E8CE0AC0949650A844BD53C081C6B1E128C60AC0813137ECD2BC53C081279F11B1C00AC060F64A0A80BC53C0FF5DBFE3DCBF0AC060F64A0A80BC53C0806EF23F1F9F0AC0F8DD83F67BBC53C00159293C1C840AC0482A35094BBC53C0808A2E86AA6C0AC0C85FCD73F7BB53C080508885FC550AC06C3FD60FAEBB53C0FFB14E4B62430AC0C48B87227DBB53C0FF0446EC803C0AC0D8BA9DA8C5BA53C07F23100F5E300AC0C03B86E80CBA53C000FD00FC37250AC050CC144F8AB953C0003A9AFAAB190AC07C09239027B953C0001A11F91F0E0AC02094326745B853C0808E8BDC66FD09C02058A87789B753C081A22BA60CF309C09C08D05920B753C000B9B5915ADC09C0E8A2855774B653C001FCD4A168D009C068B6D38521B653C080BD6DABFBD509C04CADF91CF8B553C080B4FD77B9E209C0309108A955B553C0007C1C93E6E709C0888EE4F2BFB453C00183B03958DE09C0E8FB7E045AB453C001FCD4A168D009C0405C819ADAB353C081722B1280BC09C078B3A9C731B353C081C71CF43AA009C040FE86A71CB253C08029288E017A09C06412220477B153C001C6F0996B4B09C0349989D31DB153C00084109F5A2E09C060D69714BBB053C0816671BF761609C028FAD8974BB053C0FF0B39E11E0A09C080AEA88159AF53C0804F58F12CFE08C06CB9536A11AE53C001C4C43F9CF608C03C817182CCAC53C07F07E44FAAEA08C05418CCA656AC53C001E1D43C84DF08C09435416CDAAB53C0805BE3C63CC508C08C6FF4D3ADAB53C0004C500A8DAC08C0605982EF6AAB53C0019ABBDAAD9008C0002D9E26E5AA53C0004AC127917D08C0D4A68385EBAA53C0802C85D0D93F08C0FCC977DACEAA53C0FF0576BDB33408C0C08A921149AA53C00118488F602408C0DCE83F7808AA53C0006CACA8E7FF07C03C31D9E2B4A953C0FFA6DC5157EF07C098B4D0CB11A953C001D4298244DE07C094E08A7A97A853C0FFBF1AA436CE07C0081E533589A853C001B6351F60BC07C0ACA888D3A9A853C08081015E48AA07C0F83BE05C91A853C07FE3C723AE9707C00434B00C4CA853C0006054DB188607C06466EC9F35A853C0805CE08F2E7007C0D4A3B45A27A853C001C9D0AECB5B07C038D6F0ED10A853C0814BCFA5CC4E07C02897DE15B9A753C0FF799C71334B07C0943B14B432A753C07F007979B13107C0C84BDE639DA653C08101E3B3511607C0D49BB165C2A553C0FF364B9480EE06C0C0441879D8A453C000412E8A81D206C0D84CFDD08DA453C07F626FD69EB906C0C0441879D8A453C00076CB87009D06C0040492949AA553C080F32ED41D8406C0985F5CF620A653C08080E39A517306C0C84BDE639DA653C080950A2F636406C0F47ED1E805A753C0FF957469034906C014B34100F2A653C000A3C33E5F3106C02C8F9B9870A653C0804DE337B51E06C05424841903A653C000459F99A41106C0848C6448DBA553C000D9603CDEFB05C05C662F738BA553C0004E02A89DE605C07860B0E32BA553C07FD172D0C0C805C06444BF6F89A453C0805E45974EA705C02C6800F319A453C07F391211F99805C020C94FB747A353C080E2A72A9A9205C0649DB81C6FA253C000F0C1E2A58805C0E4747C5B60A153C001211DB6DE8305C0D0588BE7BDA053C081397599257305C034294C456EA053C001AEEF7C6C6205C0A296E65608A053C07F29F0714D5105C09CBD82B3629F53C0FFD61932604105C02488C481B39E53C0FF0D1F8A623F05C080650750049E53C07F0005D2564905C0442622877E9D53C0813F6CC8C34305C07C8ACC24769C53C08048DCFB053705C010357577AD9B53C0FFCD1A1C221F05C04CEFC3F01A9B53C00184D882A60505C0A0C503DE2A9B53C07FCBAFAC55F304C0B498E8F1709B53C000762FE89EE004C0640BB564BD9B53C08055A6E612D504C020EE3F9F399C53C0013BD5FE27C304C04C4DBEE3D89C53C07F4169A599B904C03CA9E14EAE9D53C080523B7746A904C0A038EC634A9E53C001C5D9CDBC9B04C00C8E4311139F53C08139461C2C9404C088C30143C29F53C081A3743F609304C02C63FFAC41A053C001C5D9CDBC9B04C080824BFAADA053C0811C361F44AB04C004D2231817A153C07F13C6EB01B804C02C856FB043A153C07FF6B5EE19CF04C0C8CEC83E4DA153C00051EECC71DB04C070DE6E6583A153C081A0E87F8EEE04C0A4570796DCA153C001F49A4C4CFB04C0B410D2BD68A253C0805DC96F80FA04C03CC3D027E8A253C00095AA5453F504C08CE21C7554A353C07F3B7276FBE804C058A50E34B7A353C0017CB5F938E004C0F4D44DD606A453C08160E4114ECE04C0CCB1598123A453C0803E8D18C9BC04C024A2B35AEDA353C0801F12AC14A804C034E5402BEAA353C07FA098B28F9604C08C1EA76410A453C00018EF22A78204C0581B4C8B46A453C000547A8C438004C02CA70DAC60A453C0FF500662BF8304C0C8C29C7F89A453C000718B50506E04C084A1662C40A453C0FFFEF9C78C6D04C07802B6F06DA353C0019D2D43C36A04C054065EF8E4A253C0016FBC91326304C0E4B0064B1CA253C000A69D76055E04C008EC3D04D1A053C0818BCC8E1A4C04C0009699285BA053C0FF71D733003704C0142DF44CE59F53C0016D9037630E04C09CBD82B3629F53C07FC59CBBEBC503C0F4ADDC8C2C9F53C07F6AD5FA978A03C0140B8449E39E53C080AFD097767B03C044E56B3E6A9E53C080F5CB34556C03C0204C3A92F79D53C0FF069E06025C03C05CDFECAE0A9E53C07F14B8BE0D5203C0FC8B6C892A9E53C07F88FD84044F03C044C9DFAEB89E53C000C87B98674C03C02CC1FA56039F53C001C8E5D2073103C058F4EDDB6B9F53C001593B96E61603C0807FF7DF41A053C000746F06FE0203C0B097040DF5A053C0810124CD31F202C048F3CE6E7BA153C081845FD804E202C040BEE1C40BA253C08019217B3ECC02C0200E13ECC3A253C0FFAF4EFDD2BA02C048991CF099A353C07FBD68B5DEB002C0D84CFDD08DA453C000311E294BA602C0B89C2EF845A553C0FF47B19CB79B02C054CC6D9A95A553C0FF376022A19302C0BCC8B9B77CA553C080C880C82F8702C0DCA41350FBA453C00060AE4AC47502C0782426F46FA453C081DF4859EC6E02C02C65ACD8ADA353C000566AACB36802C09409E27627A353C07F66F0431A6302C054A27EDAD2A253C000018AA5095602C008AE1715A1A253C0FF284208CD1C02C0D8A6AF4F6FA253C080ADB230F0FE01C05CF251DCF7A153C0802AE15FBDF301C02C6748D821A153C00031EE3BC3EE01C048B9D756E79F53C07FD49C47BBE101C0A040E7E7669F53C000BED343B8C601C02021AC547D9F53C080AAC465AAB601C0B0101591BE9F53C081EC654806A201C0802F5E8926A053C0FFD1E42A628D01C0BC8B6F3C80A053C0800C15D4D17C01C030787CA1FEA053C08185E86BF16801C0580C90FB45A153C0803F1918B65C01C0D02FE33652A153C0802EC359F34E01C0AC85720548A153C00136338D354201C02480ACF143A153C001F98E98DB3C01C02C6748D821A153C001BBD118C42F01C07C03991EE6A053C000C213121A1D01C004DC3ED44BA053C000D3CEC6D00901C074285EF3579F53C000747504C6F700C0A80C9DE38B9E53C0007109256BF300C020BA346C3E9D53C07F818FBCD1ED00C0A892DA21A49C53C0816DD26260E100C0C06E34BA229C53C08105350245C200C0F402A0A8319C53C07FA36F60DFAB00C0DCFABA507C9C53C0012A4C685D9200C0DC264610B39C53C07FB7002F918100C0F0F93DBEF89C53C081D2349FA86D00C05822159B169D53C0015304CB205900C0A4EAF0A0119D53C000672B5F324A00C0742AFAF2CB9C53C081E7FA8AAA3500C0E0CE2F91459C53C08174AF51DE2400C03C3E78854F9C53C08095BB80AB1900C0C4C64A39909C53C0FF9184BEA00700C084B68089259D53C0012D8093E7EEFFBF1C124BEBAB9D53C0012D8093E7EEFFBF30E54299F19D53C0FFAC8311680100C0B499A00C699E53C0014D228814FFFFBF1461FF7FE09E53C002328D6FEDE9FFBF10B915FF4D9F53C00282F4A2E3BBFFBF74285EF3579F53C0019078958F96FFBF74285EF3579F53C0029217ED7F6DFFBF9030434B0D9F53C002AB807AE74BFFBF946530F57C9E53C000E7C019CC2CFFBFCC75FAA4E79D53C000E25295B608FFBF04B24F14899D53C002F71881B8D0FEBFA8BE65E1DA9C53C0023866FCA2ACFEBF9867CCF4F09B53C0023AD0364391FEBF8057A41FF39A53C0FF7B52CF7D5FFEBFD49BDEE6499A53C0FE6E41A90225FEBF200CA46DD79953C0FE91B71270FEFDBF5C74849CAF9953C000C61FF39ED6FDBFD8D0CB90B99953C001EFA23812ABFDBFF0CF4EFE359A53C001EA69D14C79FDBF84FF8DA0859A53C0FE0EB8F96F5BFDBFE453F03CDA9A53C0FE2414ABD13EFDBFE87F7BFC109B53C0FF3F7D38391DFDBFB4179BCD389B53C000550E07EBF2FCBF647B4A87749B53C00170779452D1FCBFFCAA8929C49B53C00176EEAAF8B0FCBF5C72E89C3B9C53C0FFA57ECC7180FCBFA892DA21A49C53C002EFD8236257FCBFA4EAF0A0119D53C0FFE83582FC40FCBF547A2B1A849D53C000049F0F641FFCBF9CB503F7A19D53C00024E05B8106FCBF04162F329B9D53C000D3735634DBFBBF6020A3F71E9D53C0016322AA92B6FBBF945DB138BC9C53C0016193C79687FBBFC8FDE5C56F9C53C001CD0E959F54FBBF34CEA623209C53C0002E1A2F662EFBBF18B2B5AF7D9B53C0FFFFE792D2FDFABF7C2CD231B89A53C0024D77D622E5FABF48B339015F9A53C0023FC0A643C9FABF58307A392F9A53C000C9B6E000ABFABF6064AE11A39953C0021446245192FABFE89E989CAA9853C002A03C5E0E74FABFB4DCF30BF59753C000B7B8B48466FABFAC864F307F9753C0FF8A3E32922FFABF9043C25F829753C002D4867945EEF9BFA0090FF8AE9753C0016AA500E6BCF9BFD482A728089853C0FFC7F8800B9DF9BFBCA240A4219853C0018D9E97947FF9BF0C165A451B9853C0001795D15161F9BF0C165A451B9853C0FE0E96BB133FF9BFFC35F3C0349853C001F88A82A11DF9BFDC50C97D4E9853C000B6D8EAFB0BF9BF30CAAB87509853C002B4EE47D3CEF8BF508E9138409853C0FF2650A05CB6F8BF30E0085F139853C0011F6A15DC9BF8BF30F66536D69753C0FF63B1C9F185F8BF707A19F0929753C0005ACB3E716BF8BFD0E7B3012D9753C0FE6BABA5F551F8BF9431DD44039753C0FECEA63B4D43F8BFF0BDDEE1BC9653C0FF86993B0249F8BF6C6E06C4539653C0FF320BE2733FF8BFDCA1ED6D1A9653C0FEF214090B16F8BFAC28553DC19553C0FFB20206F3FEF7BF58168B60F59453C0015420A3D1EFF7BF20B8C5ED519453C0FEEE57EC22E1F7BF10E5CD3F0C9453C000FEA6C17EC9F7BF7C8903DE859353C00019DB3196B5F7BF98655D76049353C00137E76063AAF7BF3C727343569253C0FF03E9BAD4B6F7BF40EED104B29153C002F022CFD2EEF7BFF4866E685D9153C0020AED044AF6F7BF48CBA82FB49053C000C809C4FFFEF7BF18B39B02019053C002F6FA8D88F7F7BFD41FADA6758F53C000FC3C87DEE4F7BFBC202A39F98E53C001F18C0973D3F7BF2CC55FD7728E53C00019DB3196B5F7BFAC100264FB8D53C0004D0EF5749BF7BF9CE5F336488D53C0FF606AA6D67EF7BF3C1E95C3D08C53C0005BC7047168F7BF2066836D408C53C002633E1B1748F7BF0CAE7117B08B53C0FE837F67342FF7BFB0366245348B53C0FFBCE6AF8A20F7BF98131BF6F28A53C0FF7CDCC5CE18F7BF51C79DB1538A53C001B244A6FDF0F6BF0434AF55C88953C001A7FE6232C4F6BF303A220A868953C001079910E5AEF6BFA833564C798953C0FF283DB43E8EF6BF6C3D7DE34F8953C001910068A661F6BF68914A37DD8853C0024B52759C3EF6BF24A8F33E548853C002B8CD42A50BF6BF107F805A118853C002F1ED3C75DDF5BF481FB5E7C48753C001880CC415ACF5BF4059684F988753C0FF8F4208B153F5BF9CACE874788753C0FF818BD8D137F5BFF4E54EAE9E8753C001474D190A08F5BF2C7901CBB18753C0007F6D13DAD9F4BF00C6B532858753C0FFFCAC1DB89FF4BFC8320316728753C00152AC944A7AF4BFA472350DA58753C0018BCC8E1A4CF4BF24B587A2CA8753C0FF7C5B9FCA86F3BF1C737FA4F18653C0FF3D7B4CA985F3BFD01588784D8653C0FF395D181496F3BF04220BFE828553C000368A748BB5F3BFD80C37E0D38453C0FEE3DEB7B2C8F3BFD48873491F8453C002D9EEFAD9DBF3BFA8739F2B708353C0FF89617296DEF3BF0C3D746ADC8253C00287F8ADF4DFF3BFE89F70A1EB8153C0FEDC0C2F6FCBF3BFB0E68AFC418153C0FF3AF3382DB4F3BFA0EAF610CF8053C00193707E499EF3BF3474BFB2EE7F53C00291BC299B90F3BF8CB6C037507F53C001490CE8D69AF3BF60634F1CAF7E53C0FE56F1C1F699F3BF2C10DE000E7E53C002B26E071384F3BF281BC270AF7D53C000652BF54D66F3BF2026A6E0507D53C0FEB0C3604A51F3BF8C97F64CDD7C53C00240F8A1E94CF3BF905CB2B5547C53C0FFF25F36ED61F3BF28F113169B7B53C002A4EA5EF48BF3BF600C9A001D7B53C0006537CD17A0F3BF2CB928E57B7A53C0020B1BB9FCBCF3BFECF107D82E7A53C0FF22080140D0F3BF641D303D917953C0FFE6F33D62DDF3BF64E2EBA5087953C0FE4A79F1A1DBF3BFC45BC71BCD7853C0FE7C85465CBAF3BFFCB1919DD77853C001490CE8D69AF3BF8CC75F9CD07853C0006ED2317073F3BFF0029E14A37853C0FFBEA83A6A50F3BF9846F3FD1D7853C0000BE0746534F3BF24E3DF679C7753C0FE7E4A02C531F3BF8C217746D87653C002B301FE4743F3BFBCFE5F33687653C0FE5784B82B59F3BF84F1161FF17553C0010C4D7E3075F3BFC8C67402497553C0FE7EB70B9072F3BFECF46966A47453C00073AF9D6C5EF3BFBCA1F84A037453C00033B296C846F3BFC45E29AA427353C0FF8DCEAAE329F3BF9049558C937253C001AF56577F10F3BFF0CD1472F97153C0000B736B9AF3F2BFB8FE685B747153C000CB7564F6DBF2BFC43F5FBFCF7053C0FE24F3A912C6F2BFBC88E02C637053C001194C6DF0B8F2BF2C766B94D36F53C000712AE40DAAF2BFF8A6BF7D4E6F53C0007FAE8C2CA2F2BFC0997669D76E53C0FF0BA530CEABF2BF2CCD29D8716E53C0FF33775231BEF2BFE843A6C8166E53C0FF32D88332C5F2BF20218FB5A66D53C0028C55C94EAFF2BFFC3E7425486D53C001B17C44E98EF2BF948A5418FB6C53C0FF992ECBA474F2BF0042CD8BB16C53C0008041836161F2BF5888EF73256C53C0FFCCD9EE5D4CF2BFFC4F0A62BC6B53C0FFCCD9EE5D4CF2BFC8BEFB48296B53C002BFF4143E4DF2BFBCC9DFB8CA6A53C0FF67B56C1F55F2BFBC1261265E6A53C0001634BD5C45F2BFF0B1AC15FC6953C0FE088D803A38F2BF280BD0FD6F6953C0002557347A36F2BF848F8FE3D56853C0001634BD5C45F2BF3C613250D76753C0011C6777A149F2BF00A84CAB2D6753C000CC8E5E513DF2BF784174A3D06653C0FECB43CE442EF2BF9005D41A116653C0FF7802F15223F2BF544CEE75676553C0FE794D815F32F2BF6C3C8F1FE46453C0FFC09EA17850F2BF8CDEA3109E6453C0FE978BC2A560F2BFF8EA20982B6453C0000C99580472F2BF58EB1A79756353C0FE8CE8BF836EF2BFB46FDA5EDB6253C002BE55463F54F2BFEC8A60495D6253C0007CF70D9A35F2BFB837EF2DBC6153C0FFD9B2F0B311F2BF9460B80DFF6053C0FF0920776FF7F1BFF460B2EE486053C000E44D550CE5F1BFF8A1A852A45F53C002CB600DC9D1F1BF641EDD2ED25E53C0029848E044B9F1BF90444789F55D53C0026491E4C1A7F1BFFCC07B65235D53C0015989769E93F1BFF809FDD2B65C53C0012710181974F1BF603DB041515C53C0FED96BD4524FF1BFF0D99CABCF5B53C0FF4BD661B24CF1BF5056D187FD5A53C001C1DFBD1043F1BF883E9EE42E5A53C00023C6A25148F1BF347397B0755953C002030AED8359F1BF98AC912AF85853C00201CC4F8667F1BF64E31CD04D5853C0010ED4F95578F1BFB87BD537A15753C0013BA3D3118DF1BFE8E1208E065753C002D3F7D86599F1BF3858C0838D5653C002D3F7D86599F1BF68BE0BDAF25553C0FF1CF175638BF1BF7C81665EEE5553C0FFB4D2B28875F1BFD85CDE17F55553C002260FBA6D4FF1BF7C81665EEE5553C0FF559496BA31F1BFE090BC5C6C5553C000A2CBD0B515F1BF1C90BEBBC85453C0029070B7AA10F1BFF4770C48A85353C002A4A8000604F1BF2060D9A4D95253C0FF24973684F9F0BF84258FEE9A5153C0FF7E75ADA1EAF0BF847169C2975053C002722FA280E4F0BF24446820D04F53C002722FA280E4F0BF60DB2806364F53C0FFF21DD8FED9F0BF4C470F62F84E53C0FF74D8C89ECAF0BF849B95E5B24E53C00219114A67B1F0BFAC096C45504E53C0019B9398198EF0BF20DC1CC8C94D53C0FF847247A472F0BFD08BB637D34C53C001EC1D425066F0BF2C584DE49D4B53C0FE455D261B5BF0BF88B780C3B04953C0021965819F56F0BFE8C6D6C12E4953C0015F0BAF6154F0BF3C671A33BA4853C0FF72A4656A4BF0BF5481A89B4E4853C0015B4577F73DF0BF24E2D7BCA84753C000FD3F5BC232F0BFD091712CB24653C002EBE441B72DF0BFB414BABFD84553C000FD3F5BC232F0BFAC7DB2761C4553C00070DE2D0035F0BF50B9FEB77B4453C0FEFE74213230F0BFF82974AF6A4453C0FF2FF7564544F0BF581C31BAA94453C0FE7F3A690A62F0BFFC1E903FC94453C001A4CEED6F82F0BF8CF6C040D04453C001E18D5716A8F0BFFC1E903FC94453C000F0406C02EFF0BF8C7DDFAB554453C0FF7EE2B66C2BF1BF8C04FE16DB4353C002CC86FA3250F1BF5C2DC7F61D4353C002FEFF58B86FF1BFF045EE5B804253C0FFAFC81EBD8BF1BFF00AAAC4F74153C000BEADF8DC8AF1BF34A26AAA5D4153C002A382139C85F1BFF4DDA2037A4053C00125D27A1B82F1BFECEBDFD9843F53C0013018863C88F1BF54ECD9BACE3E53C002C9B566009FF1BFECBED818073E53C00297A91146C0F1BF78009C28733D53C002619206C1CFF1BFF4FCF026F13C53C00050E852E2DEF1BFC85D20484B3C53C00148A6E07CE4F1BF30A1548B403B53C0FF5901FA87E9F1BF54665ECF763A53C0FE28F482CEE2F1BF74AA90B30F3A53C0FEF1E236ADD3F1BFBC2030A9963953C002665DDB8F9FF1BF7CD6E3EE4E3953C001308A2C6C82F1BFC0DD7057E33853C0FF8314D6A25AF1BFE49840D2A63853C0007446F46833F1BF34867D5E583853C0015F6340F109F1BFB0CFCB77FC3753C0019901C4E3F6F0BF14806388A93753C0FF4C57C1B9F0F0BF1C013BE8463753C0FE85A6AAD8F1F0BF64003D47A33653C0FF0FF3055DEDF0BF388B10E4013653C0000AEF30F5E4F0BFE41006D8063553C0FFCE9F47D6E3F0BFB4A5133ED83353C0019A8EFBB4D4F0BFAC976E5EF13253C0FE8A717FA7C1F0BF6CE0BED6F13153C0FEE903D3ADAAF0BFECDC13D56F3153C002EF5642E99EF0BF18905846FB3053C0012EF99A4394F0BFD857D15E5E3053C000373B0DA98EF0BF08BE1CB5C32F53C0FF75DD650384F0BFCCFC3264512F53C0FE8134AAA680F0BF688AB3618E2E53C0FF0B81052B7CF0BFCCC3ADDB102E53C002BAD22D996DF0BFFC76F24C9C2D53C001B50CF62E57F0BFE89042297F2D53C0024FEE325441F0BFF4B25B9B4B2D53C0FE7B3572A331F0BFE4E7750D182D53C002517B6A251FF0BFBC3E6B65FF2C53C001FCB7C0550EF0BF54980D1EC52C53C001DC5F2D0CFBEFBF4433355A452C53C0FFCD42B1FEE7EFBF7022E319802B53C001DC5F2D0CFBEFBFA476699D3A2B53C000580C775E05F0BF102701AEE72A53C0FF706B65D112F0BFD465175D752A53C0FF11D911CB29F0BFBCD69A1DF12953C0003451A7E341F0BF2887322E9E2953C00223A7F30451F0BFE4C548DD2B2953C000650F84C95CF0BF680F97F6CF2853C0012D7100D76FF0BF586E55E4A02853C0012EF99A4394F0BF142C9433912853C0015499331FEBF0BF3870C6172A2853C00165B6AF2CFEF0BF704DAF04BA2753C000CE12100506F1BF30D9BECE6D2753C0012C182C3A11F1BFB0220DE8112753C0FEED75D3DF1BF1BF18D3A4F8BE2653C0003C35A84724F1BF046ECC343F2653C000D9DC1CD724F1BFF0B4AB79B62553C0025E25A3F317F1BFB0A6C80D1E2553C0015F6340F109F1BFA8865E5B8C2453C0FE4C0827E604F1BF9C2186970C2453C0FFD96954A802F1BF9C2BC0607F2353C000E26D29100BF1BF74038D18042353C001D616E56C0EF1BF6C1552EBAE2253C0FFD96954A802F1BFA469D86E692253C0FF4C57C1B9F0F0BFB48BF1E0352253C001A192D01CDDF0BF981118CACD2153C0FF56A38B3ED8F0BF2C68DC2C222153C001644AC860E5F0BF941F55A0D82053C0FE16B25C64FAF0BFE8A0BB1FD52053C0020D17F80B27F1BF8CE1B7A2E62053C0FF4C7530B145F1BF8CE1B7A2E62053C0020C8401D767F1BFC0BB47290D2153C000E67F1A409DF1BFBC3F0D2E292153C001253F84E6C2F1BFC0F9E426FF2053C0001805518FF6F1BFC0F9E426FF2053C0FE31F298D209F2BFE8199DB44F2153C000E4BA5ED725F2BFF40EB944AE2153C001E38899A36DF2BF2CA320C4AA2153C0017D3E2AFBF7F2BF88622441992153C002E50D530222F3BFCC751F22E32053C0FE4DDD7B094CF3BF30B4B6001F2053C000648C264F6DF3BFBC12066DAB1F53C00033BE6E9280F3BFC40A7B63731F53C0FE4BABB6D593F3BFBC9924D8301F53C0008D09EF7AB2F3BF90796C4AE01E53C001087CEAFDC3F3BF681B17BF9D1E53C001D66F9543E5F3BF947CC5B0491E53C00108E9F3C804F4BF5831DF9EE01D53C000BD5088CC19F4BF900EC88B701D53C00201ED5D6F2AF4BFBCAD137B0E1D53C001FDAEC07138F4BF5CBB5670CF1C53C001FC0FF2723FF4BF905AA25F6D1C53C0FF2181E2D44AF4BF2C68E5542E1C53C001988A3E3341F4BF548BF648E81B53C0FE187974B136F4BF8CA67C336A1B53C0020956FD9345F4BFFC17CD9FF61A53C0023EACC71550F4BF30F5B58C861A53C002149C08B54BF4BFEC6B327D2B1A53C00027BF7FD23CF4BF20CDE06ED71953C0FF7F9DF6EF2DF4BF58E86659591953C0FEE222AA2F2CF4BF24575840C61853C0008B4433123BF4BF5C72DE2A481853C000CB413AB652F4BF507DC29AE91753C001661DB8775BF4BFF8C01784641753C001CA039DB860F4BF5CBEB8FE441753C0010BA0725B71F4BFF48D5EF6131753C0023134F7C091F4BF64FFAE62A01653C002654C2445AAF4BF902519BDC31553C001976451C9C2F4BFC486C7AE6F1553C0FECB7C7E4DDBF4BFFCDFEA96E31453C000E7A7638EE0F4BFB418CA89961453C001C9DDAF4EE2F4BF5C1E82751F1453C0025BB1BFECD6F4BF30CB105A7E1353C0025BB1BFECD6F4BF60E69644001353C001F24EA0B0EDF4BF646DB5AF851253C0FF0A3CE8F300F5BF60B6361D191253C0007DA67553FEF4BF8C17E50EC51153C00156D453F0EBF4BF544839F83F1153C0FED6C2896EE1F4BFF060605DA21053C0FF3E86DAABD1F4BF2CF82043081053C000B52E0509C1F4BF0021EA224B0F53C0FF0B6EAD27B9F4BF28CB19828A0E53C0FE7BD83A87B6F4BF60243D6AFE0D53C001F2E196E5ACF4BF2C559153790D53C000E4FCBCC5ADF4BF24A9F630AE0C53C002FF27A206B3F4BFCCEC4B1A290C53C001F2E196E5ACF4BF30A4C48DDF0B53C00165EBF243A3F4BF6005737F8B0B53C0FE72D0CC63A2F4BF9820F9690D0B53C0018E5CE3A5AEF4BFF4661B52810A53C0FF1615EA49C6F4BF942E3640180A53C00025999268BEF4BF248D85ACA40953C0FF7231FE64A9F4BFF82E3021620953C000B1E48F4195F4BFF077B18EF50853C001337294BE83F4BF60AB64FD8F0853C0008AB13CDD7BF4BFC8DE176C2A0853C0FFE38FB3FA6CF4BF940F6C55A50753C0FED649A8D966F4BF60BCFA39040753C0FE7363C39861F4BF3069891E630653C0FF80A9CEB967F4BF989C3C8DFD0553C0FE7C6B31BC75F4BF207F51FEA50553C00233D3C5BF8AF4BF90F0A16A320553C00165EBF243A3F4BF88FB85DAD30453C00200C77005ACF4BF943198CE8D0453C0FED75580A3A0F4BFC8D0E3BD2B0453C0023134F7C091F4BF586DD027AA0353C0FFD9F44EA299F4BFF03C761F790353C001F2E196E5ACF4BFF8728813330353C000897F77A9C3F4BF904D127BA30253C000E7A7638EE0F4BFF880C5E93D0253C0007FE41251F0F4BFF04D0C5CED0153C0007DA67553FEF4BFCC6BF1CB8E0153C0018DC9EC70EFF4BFF499E62FEA0053C0018DC9EC70EFF4BFC0467514490053C0007DA67553FEF4BFC0CD937FCEFF52C000DACE61381BF5BF88FEE76849FF52C0FE98DD325E3DF5BF28423D52C4FE52C002311AE2204DF5BF602A0AAFF5FD52C0FF649340A66CF5BFCC9B5A1B82FD52C0017D8088E97FF5BF8812D70B27FD52C001B237846C91F5BF242BFE7089FC52C00181CAFDB0ABF5BF882014E231FC52C0FF0AC1A152B5F5BF88A7324DB7FB52C002FDDBC732B6F5BF901BE23E63FB52C0FEF195BC11B0F5BF5854C13116FB52C00149D56430A8F5BFFC1BDC1FADFA52C0FF64004A71ADF5BFB892581052FA52C0FEF195BC11B0F5BF001F358616FA52C0FF659F1870A6F5BF00E4F0EE8DF952C00159F8DB4D99F5BFF034FD6559F952C0FE984A3C297EF5BF006B0F5A13F952C00155AE66866DF5BFC41F2948AAF852C000D7FDCD056AF5BFBCA647B32FF852C0FEFD6EBE6775F5BF289C5D24D8F752C0FEBF1C5E8C90F5BF8C53D6978EF752C0FFC924CCAFA4F5BF54842A8109F752C0FFFF7A9631AFF5BF901BEB666FF652C0FF6EA78693BAF5BF584C3F50EAF552C0FEBF896757D1F5BF541986C299F552C0028098387DF3F5BF648D35B445F552C0FF30C22F8316F6BF2404B2A4EAF452C001E429C4862BF6BFF072A38B57F452C0009B30278939F6BF34869E6CA1F352C0FF23E92D2D51F6BFF0BE7D5F54F352C000CB0AB70F60F6BF900A5E5207F352C0FEF0DCD87272F6BFC0A9A941A5F252C0FF8BB856347BF6BFBCF22AAF38F252C001718D71F375F6BF2C647B1BC5F152C0FF624766D26FF6BF64BD9E0339F152C0FF8C57253374F6BF985CEAF2D6F052C0010C69EFB47EF6BF5495C9E589F052C0FE18AFFAD584F6BF640979D735F052C0FF8A19883582F6BF283ACDC0B0EF52C000985F935688F6BF5C9B7BB25CEF52C0FF59AC017A9CF6BF8480EFA824EF52C0FFEFAA133FBAF6BF189DA5C40BEF52C001244529F6D7F6BF00BD054CDFEE52C0FFBB7DE845EFF6BFC444B54E9DEE52C000E51599CA04F7BFF0C135EE42EE52C0006DE3A5541FF7BFE0150F8FC7ED52C0FEF09930BD3CF7BF1438310892ED52C0FF152A20694FF7BFCC4CA33B1BED52C002BE28D99B4CF7BF1CC34231A2EC52C0022885397454F7BF286EBE0C44EC52C000D4492A1168F7BF08E7CCD6F7EB52C0FE26F801A376F7BF7C301BF09BEB52C00075B7D60A7FF7BF40458D2325EB52C0FF51B2092189F7BF302DAE7ACBEA52C0FF88C3554298F7BF283F734D76EA52C0FF523AA48DADF7BFDC5B708A37EA52C001D6F5F2D8C2F7BFF475FEF2CBE952C0FF50AD6CBCCFF7BFCC4DCBAA50E952C0FF73639FD2D9F7BFC45F907DFBE852C0004A1C6083E9F7BF50F59B8470E852C0FEF5E05020FDF7BFB87B8F1919E852C0FE988C9A1706F8BFA863B070BFE752C0FFBD42CD2D10F8BF6CA2C61F4DE752C000478F28B20BF8BF34821EE109E752C002FCE4258805F8BFB8CB6CFAADE652C001C79911D10CF8BF7C81204066E652C0FFEC4F44E716F8BFFC17687430E652C00207AF325A24F8BF24FDDB6AF8E552C0FF876A81A539F8BFC080229FC2E552C0017BD59F044BF8BF0476EA34ACE552C0FE65ED4E2868F8BF14E5FCC19EE552C001E0662B0E83F8BFC080229FC2E552C0FEFB8B51EBA6F8BF88AD737BA5E552C000EEF66F4AB8F8BF2C31BAAF6FE552C0014CFC8B7FC3F8BF781EF73B21E552C002D30A4A06CDF8BF0CC2C5A413E552C0FE1D976807D1F8BFA8338D5D8CE552C000FCC9A8C8DFF8BF7CC33209C6E552C0020B51C2CD10F9BF6C76084F22E652C0015803025E34F9BF64E7A0A032E952C0020BC5A0632BFABF500B0F389FEC52C00238602A8C50FBBF70B017B1F7F152C0FEAA62819B1AFDBF4CB8C77BB1F752C0020AA03EB402FFBFFC354459A7FD52C0805FA98EA16500C0E080501E4F0353C07FFF73A4664201C074B7F5086F0953C07F975BC293D201C068C94737671053C0FF0028C0867502C0882EBF2EE21953C081432BA98A4E03C0A82FB9EDA72453C0815C99E4EE4E04C078A62B6F5D2853C0FF0533BDABAD04C068DC9FC1022953C001FA7CCD7DBE04C00885C63E512A53C0001E3C14ADD204C048A7696CA72B53C0007E0CA8CEDB04C04C020C0A8F2C53C0808AABDD0EE304C08427A33D3E2D53C081DA35F68AE804C0446492A6BF3153C0FF71BC591C2005C08418B46ED53D53C08133FE7885A305C0BCD654871E4E53C0009548397C5206C0701CAC16E55953C080660287B1C906C028B7927E626053C080C5AB40880507C040813CB6AC6453C0FF20664EA33507C00003348C8A6A53C0FF190CC4D27307C0C0FD7E56A97053C080126C13ECB707C0C40B799FC47453C07F929CF039E407C098441023697653C001DE5FA2020008C0C85854EAE57853C080EA03B9984608C00C7113AA4A7B53C0801C41B26C8608C0A4DC1A463D7D53C0801A1180BBB508C0187D6180F77D53C0802524AA04D308C0E470F0963F7E53C07F9A415D09E208C0605018D3FF7E53C0FFC9ED6990F808C03C0941E0297F53C000A19368540509C0047B92FA7D7F53C07F8F8FED5B1D09C0D8F05E0DBA7F53C0FFC7BD37DF2709C0785ABA363E8053C0FF7D8B72633509C05091A547748053C08095E1F8A64009C02C4ACE549E8053C081EA26E86B5009C0444E494D868053C0803F6CD7306009C068175E3C508053C0FF19D3F4F26609C07CDCF732328053C07F52013F767109C05813E343688053C0006F18E4B77609C01C46535CB68053C08108CF79FA7E09C0DCF68578108153C000CCDF10797A09C0C0AFAE853A8153C0008FF0A7F77509C05458EBB0C48153C0008FF0A7F77509C0248B5BC9128253C081E8F6B5BA7F09C0F07EEADF5A8253C07FDF7478BE8B09C0B4F03BFAAE8253C081756AEF029A09C0645E121C1B8353C0FFC9AFDEC7A909C00C0BCA3F8D8353C0FF9F55DD8BB609C0BCB78163FF8353C07F76FBDB4FC309C074E39B93A38453C001C45F676DC609C0B01ED63FD78453C07F8094F794C409C04CEBB9C3148553C0005B18E0F7BF09C0C007B0586D8553C0000A6AD31FBA09C0382097558D8553C07F20034EBDBA09C060D493DCAA8553C080ADC6ECCFC509C060D493DCAA8553C0FFD5B9E530D509C0CCBFBB77C38553C081EEC94192E009C0205574E7058653C081A109F841F009C01059837F3E8653C080F52EE6DD000AC06C1BFB50888653C08033BB59DC100AC08800C6D1E58653C000AD5C5F15260AC018732B92148753C07F4A039B27350AC06808E401578753C080CA5A7EFE460AC0B0CE6A6BD98753C07FCF4841865C0AC0BCB744846F8853C0FF751C3CFA720AC05813845D348953C07FCCB80B5A8E0AC068291DD8D18953C08113723EBAA50AC048313B08438A53C0003C65371BB50AC0C8A7AF60AA8A53C07FACD97DF2C20AC088595E65458B53C0FFBD33FCB5D10AC06C8E3BF7BD8B53C0FFF9488EF0D60AC0C08181C2478C53C0014CF79AC8DC0AC0F88FFC0C748C53C0801B86A9B3E90AC02C40EAFB588C53C000086410DAF30AC0A0CD843B2A8C53C07F5C89FE75040BC0C023F466008C53C080837CF7D6130BC0205710E3C28B53C080F5F03DAE210BC0C067D9AF718B53C07FA830F45D310BC0504BE31A198B53C0010AC29D353B0BC008855CB1968A53C0FF6A53470D450BC0840EE8582F8A53C0005EE78BD14B0BC0940AD9C0F68953C000DCC78DE4520BC064FC5D76CA8953C08172B8EB58650BC0E4E37679AA8953C001EC59F1917A0BC0B0D5FB2E7E8953C07FFEB36F55890BC03CEAD393658953C07F922DEC05910BC0100918AB408953C0FFDF9CFC03A50BC05C4043BF3B8953C0FF66AABD78B30BC0481793F56C8953C0FFC08589B2C00BC00C987300C88953C0808A5EBAFFD00BC070E5378F608A53C0819CB838C3DF0BC068768BB5698B53C000A6ED467DED0BC0F01A4DE80B8C53C07FDE1B9100F80BC05C783728D88C53C07F94E9CB84050CC0E05BDA5C808D53C0012FA061C70D0CC080C53586048E53C0014F7825070D0CC03C7668A25E8E53C08037229FC3010CC018EC34B59A8E53C081C204ECBEF20BC0F4E33EC4CA8E53C000DEBAD6649F0BC0C8590BD7068F53C000F9408F597B0BC08C8C7BEF548F53C08187E4FA52660BC044BB700FBB8F53C0017910B20B4F0BC0ECA60935339053C0FFE21A3BC7400BC0CC66BABD089253C0808475F2762D0BC0B4A26B29409353C08124A55E55240BC0B8A8A842D29353C0005C82F9151E0BC0B4AEE55B649453C08063EA5D79140BC088C12914E79453C000CF70E1C80C0BC0E07D21B6849553C080D4BE6C93050BC02417E9BDFF9553C080D4BE6C93050BC0545D49F2449653C000CD5608300F0BC080504253549653C0FF8ADD56DA230BC054E0E7FE8D9653C001E77938CA310BC0F8ACCB82CB9653C0804864A584380BC0E8DC02BCDE9653C07F3EC88EEF460BC0A8C6D9C0AC9653C0008960F5E66C0BC030EDEE9D7E9653C00046CD6AF8830BC008FAF53C6F9653C080610A742BA40BC0047D9449B89653C000BA72A3E9B60BC0E00C3AF5F19653C080D7C985B5D40BC0F42F6A8F149753C07FF2ECB54FF70BC0F4B2089C5D9753C081A6F1C6FD170CC038C931978F9753C07FFE3F1D232D0CC0CC9C72DAB29753C001261BDC37350CC0287C07DDEB9753C081548E7348420CC0
\.


--
-- Data for Name: cache; Type: TABLE DATA; Schema: public; Owner: user_im
--

COPY public.cache (key, value, expiration) FROM stdin;
\.


--
-- Data for Name: cache_locks; Type: TABLE DATA; Schema: public; Owner: user_im
--

COPY public.cache_locks (key, owner, expiration) FROM stdin;
\.


--
-- Data for Name: failed_jobs; Type: TABLE DATA; Schema: public; Owner: user_im
--

COPY public.failed_jobs (id, uuid, connection, queue, payload, exception, failed_at) FROM stdin;
\.


--
-- Data for Name: job_batches; Type: TABLE DATA; Schema: public; Owner: user_im
--

COPY public.job_batches (id, name, total_jobs, pending_jobs, failed_jobs, failed_job_ids, options, cancelled_at, created_at, finished_at) FROM stdin;
\.


--
-- Data for Name: jobs; Type: TABLE DATA; Schema: public; Owner: user_im
--

COPY public.jobs (id, queue, payload, attempts, reserved_at, available_at, created_at) FROM stdin;
\.


--
-- Data for Name: migrations; Type: TABLE DATA; Schema: public; Owner: user_im
--

COPY public.migrations (id, migration, batch) FROM stdin;
1	0001_01_01_000000_create_schemas_and_extensions	1
2	0001_01_01_000001_create_auth_users_table	1
3	0001_01_01_000002_create_auth_roles_and_permissions_tables	1
4	0001_01_01_000003_create_auth_personal_access_tokens_table	1
5	0001_01_01_000004_create_cache_table	1
6	0001_01_01_000005_create_jobs_table	1
7	0001_01_02_000000_create_core_geographic_tables	1
8	0001_01_02_000001_create_core_classification_tables	1
9	0001_01_02_000002_create_core_workflow_tables	1
10	0001_01_02_000003_create_core_incidencias_table	1
11	0001_01_02_000004_create_core_incidencia_detail_tables	1
12	0001_01_02_000005_create_core_support_tables	1
13	0001_01_03_000000_create_audit_tables	1
14	0001_01_04_000000_create_triggers_and_functions	1
15	2026_06_19_000001_add_username_to_auth_users_table	1
16	2026_06_19_000002_create_auth_user_identities_table	1
17	2026_06_21_000001_enforce_single_role_per_user	1
18	2026_06_23_145939_add_two_factor_columns_to_auth_users_table	1
19	2026_06_23_200526_insert_dashboard_view_permission	1
20	2026_06_23_202810_grant_dashboard_view_to_all_roles	1
21	2026_06_29_000001_create_core_territorial_units_table	1
22	2026_06_29_000002_add_territorial_unit_id_to_core_incidents_table	1
23	2026_06_30_000001_make_incident_city_nullable_for_territorial_units	1
24	2026_06_30_000002_add_address_reference_to_core_incidents_table	1
25	2026_06_30_000003_remove_legacy_geographic_tables	1
26	2026_07_01_000001_allow_duplicate_territorial_unit_names	1
27	2026_07_01_000002_drop_coordinates_from_territorial_units_table	1
28	2026_07_02_000001_make_incident_priority_nullable	1
29	2026_07_02_000002_expand_territorial_hierarchy_for_operational_zones	1
30	2026_07_02_000003_create_operational_structure_tables	1
31	2026_07_02_000004_add_operator_workload_controls	1
32	2026_07_02_000005_add_active_to_supervisor_profiles	1
33	2026_07_02_000006_expand_incident_assignments_for_multi_operator_support	1
34	2026_07_02_000007_add_coverage_area_to_territorial_units	1
35	2026_07_02_000008_add_incident_id_to_notifications	1
36	2026_07_05_000001_align_navigation_permissions_with_database	1
37	2026_07_05_000002_create_auth_navigation_items_table	1
38	2026_07_09_000001_expand_password_reset_tokens_for_codes	1
39	2026_07_16_000001_create_state_change_requests_table	1
40	2026_07_16_000002_correct_closed_incident_reopening_transition	1
41	2026_07_16_000003_align_reopening_state_catalog	1
42	2026_07_16_000004_align_supervisor_team_permissions	1
43	2026_07_16_171551_add_reopen_dates_to_core_incidents_table	1
44	2026_07_16_173216_add_rejected_at_to_core_incidents_table	1
45	2026_07_17_000001_add_resolved_by_to_core_incidents	1
46	2026_07_17_000002_drop_resolved_by_add_resolved_at_to_assignments	1
47	2026_07_17_000003_add_resolved_by_supervisor_to_core_incidents	1
48	2026_07_17_000004_add_resolution_snapshots_to_core_incidents	1
49	2026_07_17_000005_create_incident_cycles_table	1
50	2026_07_17_000006_add_current_cycle_id_to_incidents	1
51	2026_07_17_000007_add_incident_cycle_id_to_tables	1
52	2026_07_17_000008_backfill_incident_cycles_for_existing_data	1
53	2026_07_19_080949_restrict_supervisor_reopening_closed_incidents	1
54	2026_07_19_083050_restore_resuelta_to_reabierta_transition	1
55	2026_07_23_000001_add_incident_classification_workflow	1
56	2026_07_24_000001_drop_due_date_trigger	2
\.


--
-- Data for Name: spatial_ref_sys; Type: TABLE DATA; Schema: public; Owner: user_im
--

COPY public.spatial_ref_sys (srid, auth_name, auth_srid, srtext, proj4text) FROM stdin;
\.


--
-- Data for Name: state_change_requests; Type: TABLE DATA; Schema: public; Owner: user_im
--

COPY public.state_change_requests (id, incident_id, requested_by_user_id, requested_state_id, reason, status, reviewed_by_user_id, reviewer_comment, created_at, reviewed_at) FROM stdin;
\.


--
-- Name: access_logs_id_seq; Type: SEQUENCE SET; Schema: audit; Owner: user_im
--

SELECT pg_catalog.setval('audit.access_logs_id_seq', 2, true);


--
-- Name: audit_logs_id_seq; Type: SEQUENCE SET; Schema: audit; Owner: user_im
--

SELECT pg_catalog.setval('audit.audit_logs_id_seq', 1, true);


--
-- Name: navigation_items_id_seq; Type: SEQUENCE SET; Schema: auth; Owner: user_im
--

SELECT pg_catalog.setval('auth.navigation_items_id_seq', 18, true);


--
-- Name: operator_profiles_id_seq; Type: SEQUENCE SET; Schema: auth; Owner: user_im
--

SELECT pg_catalog.setval('auth.operator_profiles_id_seq', 40, true);


--
-- Name: permission_role_id_seq; Type: SEQUENCE SET; Schema: auth; Owner: user_im
--

SELECT pg_catalog.setval('auth.permission_role_id_seq', 71, true);


--
-- Name: permissions_id_seq; Type: SEQUENCE SET; Schema: auth; Owner: user_im
--

SELECT pg_catalog.setval('auth.permissions_id_seq', 32, true);


--
-- Name: personal_access_tokens_id_seq; Type: SEQUENCE SET; Schema: auth; Owner: user_im
--

SELECT pg_catalog.setval('auth.personal_access_tokens_id_seq', 2, true);


--
-- Name: role_user_id_seq; Type: SEQUENCE SET; Schema: auth; Owner: user_im
--

SELECT pg_catalog.setval('auth.role_user_id_seq', 55, true);


--
-- Name: roles_id_seq; Type: SEQUENCE SET; Schema: auth; Owner: user_im
--

SELECT pg_catalog.setval('auth.roles_id_seq', 4, true);


--
-- Name: supervisor_operator_assignments_id_seq; Type: SEQUENCE SET; Schema: auth; Owner: user_im
--

SELECT pg_catalog.setval('auth.supervisor_operator_assignments_id_seq', 40, true);


--
-- Name: supervisor_profiles_id_seq; Type: SEQUENCE SET; Schema: auth; Owner: user_im
--

SELECT pg_catalog.setval('auth.supervisor_profiles_id_seq', 8, true);


--
-- Name: user_identities_id_seq; Type: SEQUENCE SET; Schema: auth; Owner: user_im
--

SELECT pg_catalog.setval('auth.user_identities_id_seq', 3, true);


--
-- Name: user_territories_id_seq; Type: SEQUENCE SET; Schema: auth; Owner: user_im
--

SELECT pg_catalog.setval('auth.user_territories_id_seq', 48, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: auth; Owner: user_im
--

SELECT pg_catalog.setval('auth.users_id_seq', 55, true);


--
-- Name: categories_id_seq; Type: SEQUENCE SET; Schema: core; Owner: user_im
--

SELECT pg_catalog.setval('core.categories_id_seq', 7, true);


--
-- Name: incident_assignments_id_seq; Type: SEQUENCE SET; Schema: core; Owner: user_im
--

SELECT pg_catalog.setval('core.incident_assignments_id_seq', 412, true);


--
-- Name: incident_attachments_id_seq; Type: SEQUENCE SET; Schema: core; Owner: user_im
--

SELECT pg_catalog.setval('core.incident_attachments_id_seq', 1, false);


--
-- Name: incident_classification_history_id_seq; Type: SEQUENCE SET; Schema: core; Owner: user_im
--

SELECT pg_catalog.setval('core.incident_classification_history_id_seq', 1, false);


--
-- Name: incident_comments_id_seq; Type: SEQUENCE SET; Schema: core; Owner: user_im
--

SELECT pg_catalog.setval('core.incident_comments_id_seq', 1, false);


--
-- Name: incident_cycles_id_seq; Type: SEQUENCE SET; Schema: core; Owner: user_im
--

SELECT pg_catalog.setval('core.incident_cycles_id_seq', 1, false);


--
-- Name: incident_states_id_seq; Type: SEQUENCE SET; Schema: core; Owner: user_im
--

SELECT pg_catalog.setval('core.incident_states_id_seq', 1, true);


--
-- Name: incidents_id_seq; Type: SEQUENCE SET; Schema: core; Owner: user_im
--

SELECT pg_catalog.setval('core.incidents_id_seq', 1000, true);


--
-- Name: notifications_id_seq; Type: SEQUENCE SET; Schema: core; Owner: user_im
--

SELECT pg_catalog.setval('core.notifications_id_seq', 1, true);


--
-- Name: priorities_id_seq; Type: SEQUENCE SET; Schema: core; Owner: user_im
--

SELECT pg_catalog.setval('core.priorities_id_seq', 4, true);


--
-- Name: settings_id_seq; Type: SEQUENCE SET; Schema: core; Owner: user_im
--

SELECT pg_catalog.setval('core.settings_id_seq', 8, true);


--
-- Name: state_transitions_id_seq; Type: SEQUENCE SET; Schema: core; Owner: user_im
--

SELECT pg_catalog.setval('core.state_transitions_id_seq', 10, true);


--
-- Name: states_id_seq; Type: SEQUENCE SET; Schema: core; Owner: user_im
--

SELECT pg_catalog.setval('core.states_id_seq', 7, true);


--
-- Name: subcategories_id_seq; Type: SEQUENCE SET; Schema: core; Owner: user_im
--

SELECT pg_catalog.setval('core.subcategories_id_seq', 24, true);


--
-- Name: territorial_units_id_seq; Type: SEQUENCE SET; Schema: core; Owner: user_im
--

SELECT pg_catalog.setval('core.territorial_units_id_seq', 1301, true);


--
-- Name: failed_jobs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: user_im
--

SELECT pg_catalog.setval('public.failed_jobs_id_seq', 1, false);


--
-- Name: jobs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: user_im
--

SELECT pg_catalog.setval('public.jobs_id_seq', 1, false);


--
-- Name: migrations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: user_im
--

SELECT pg_catalog.setval('public.migrations_id_seq', 56, true);


--
-- Name: state_change_requests_id_seq; Type: SEQUENCE SET; Schema: public; Owner: user_im
--

SELECT pg_catalog.setval('public.state_change_requests_id_seq', 1, false);


--
-- Name: access_logs access_logs_pkey; Type: CONSTRAINT; Schema: audit; Owner: user_im
--

ALTER TABLE ONLY audit.access_logs
    ADD CONSTRAINT access_logs_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: audit; Owner: user_im
--

ALTER TABLE ONLY audit.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: navigation_items auth_navigation_items_code_unique; Type: CONSTRAINT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.navigation_items
    ADD CONSTRAINT auth_navigation_items_code_unique UNIQUE (code);


--
-- Name: operator_profiles auth_operator_profiles_user_id_unique; Type: CONSTRAINT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.operator_profiles
    ADD CONSTRAINT auth_operator_profiles_user_id_unique UNIQUE (user_id);


--
-- Name: permissions auth_permissions_code_unique; Type: CONSTRAINT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.permissions
    ADD CONSTRAINT auth_permissions_code_unique UNIQUE (code);


--
-- Name: personal_access_tokens auth_personal_access_tokens_token_unique; Type: CONSTRAINT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.personal_access_tokens
    ADD CONSTRAINT auth_personal_access_tokens_token_unique UNIQUE (token);


--
-- Name: roles auth_roles_code_unique; Type: CONSTRAINT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.roles
    ADD CONSTRAINT auth_roles_code_unique UNIQUE (code);


--
-- Name: supervisor_profiles auth_supervisor_profiles_user_id_unique; Type: CONSTRAINT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.supervisor_profiles
    ADD CONSTRAINT auth_supervisor_profiles_user_id_unique UNIQUE (user_id);


--
-- Name: users auth_users_email_unique; Type: CONSTRAINT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT auth_users_email_unique UNIQUE (email);


--
-- Name: users auth_users_username_unique; Type: CONSTRAINT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT auth_users_username_unique UNIQUE (username);


--
-- Name: navigation_items navigation_items_pkey; Type: CONSTRAINT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.navigation_items
    ADD CONSTRAINT navigation_items_pkey PRIMARY KEY (id);


--
-- Name: operator_profiles operator_profiles_pkey; Type: CONSTRAINT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.operator_profiles
    ADD CONSTRAINT operator_profiles_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (email);


--
-- Name: permission_role permission_role_pkey; Type: CONSTRAINT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.permission_role
    ADD CONSTRAINT permission_role_pkey PRIMARY KEY (id);


--
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);


--
-- Name: personal_access_tokens personal_access_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.personal_access_tokens
    ADD CONSTRAINT personal_access_tokens_pkey PRIMARY KEY (id);


--
-- Name: role_user role_user_pkey; Type: CONSTRAINT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.role_user
    ADD CONSTRAINT role_user_pkey PRIMARY KEY (id);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: supervisor_operator_assignments supervisor_operator_assignments_pkey; Type: CONSTRAINT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.supervisor_operator_assignments
    ADD CONSTRAINT supervisor_operator_assignments_pkey PRIMARY KEY (id);


--
-- Name: supervisor_profiles supervisor_profiles_pkey; Type: CONSTRAINT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.supervisor_profiles
    ADD CONSTRAINT supervisor_profiles_pkey PRIMARY KEY (id);


--
-- Name: user_identities uniq_user_identities_provider_uid; Type: CONSTRAINT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.user_identities
    ADD CONSTRAINT uniq_user_identities_provider_uid UNIQUE (provider, provider_uid);


--
-- Name: user_identities uniq_user_identities_user_provider; Type: CONSTRAINT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.user_identities
    ADD CONSTRAINT uniq_user_identities_user_provider UNIQUE (user_id, provider);


--
-- Name: permission_role uq_permission_role; Type: CONSTRAINT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.permission_role
    ADD CONSTRAINT uq_permission_role UNIQUE (permission_id, role_id);


--
-- Name: role_user uq_role_user_single_role; Type: CONSTRAINT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.role_user
    ADD CONSTRAINT uq_role_user_single_role UNIQUE (user_id);


--
-- Name: user_identities user_identities_pkey; Type: CONSTRAINT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.user_identities
    ADD CONSTRAINT user_identities_pkey PRIMARY KEY (id);


--
-- Name: user_territories user_territories_pkey; Type: CONSTRAINT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.user_territories
    ADD CONSTRAINT user_territories_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: categories core_categories_name_unique; Type: CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.categories
    ADD CONSTRAINT core_categories_name_unique UNIQUE (name);


--
-- Name: incidents core_incidents_code_unique; Type: CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incidents
    ADD CONSTRAINT core_incidents_code_unique UNIQUE (code);


--
-- Name: priorities core_priorities_level_unique; Type: CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.priorities
    ADD CONSTRAINT core_priorities_level_unique UNIQUE (level);


--
-- Name: settings core_settings_key_unique; Type: CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.settings
    ADD CONSTRAINT core_settings_key_unique UNIQUE (key);


--
-- Name: states core_states_name_unique; Type: CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.states
    ADD CONSTRAINT core_states_name_unique UNIQUE (name);


--
-- Name: incident_assignments incident_assignments_pkey; Type: CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incident_assignments
    ADD CONSTRAINT incident_assignments_pkey PRIMARY KEY (id);


--
-- Name: incident_attachments incident_attachments_pkey; Type: CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incident_attachments
    ADD CONSTRAINT incident_attachments_pkey PRIMARY KEY (id);


--
-- Name: incident_classification_history incident_classification_history_pkey; Type: CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incident_classification_history
    ADD CONSTRAINT incident_classification_history_pkey PRIMARY KEY (id);


--
-- Name: incident_comments incident_comments_pkey; Type: CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incident_comments
    ADD CONSTRAINT incident_comments_pkey PRIMARY KEY (id);


--
-- Name: incident_cycles incident_cycles_pkey; Type: CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incident_cycles
    ADD CONSTRAINT incident_cycles_pkey PRIMARY KEY (id);


--
-- Name: incident_states incident_states_pkey; Type: CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incident_states
    ADD CONSTRAINT incident_states_pkey PRIMARY KEY (id);


--
-- Name: incidents incidents_pkey; Type: CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incidents
    ADD CONSTRAINT incidents_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: priorities priorities_pkey; Type: CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.priorities
    ADD CONSTRAINT priorities_pkey PRIMARY KEY (id);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (id);


--
-- Name: state_transitions state_transitions_pkey; Type: CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.state_transitions
    ADD CONSTRAINT state_transitions_pkey PRIMARY KEY (id);


--
-- Name: states states_pkey; Type: CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.states
    ADD CONSTRAINT states_pkey PRIMARY KEY (id);


--
-- Name: subcategories subcategories_pkey; Type: CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.subcategories
    ADD CONSTRAINT subcategories_pkey PRIMARY KEY (id);


--
-- Name: territorial_units territorial_units_pkey; Type: CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.territorial_units
    ADD CONSTRAINT territorial_units_pkey PRIMARY KEY (id);


--
-- Name: incident_cycles uq_incident_cycles_number; Type: CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incident_cycles
    ADD CONSTRAINT uq_incident_cycles_number UNIQUE (incident_id, cycle_number);


--
-- Name: subcategories uq_subcategories_name; Type: CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.subcategories
    ADD CONSTRAINT uq_subcategories_name UNIQUE (category_id, name);


--
-- Name: territorial_units uq_territorial_units_code; Type: CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.territorial_units
    ADD CONSTRAINT uq_territorial_units_code UNIQUE (code);


--
-- Name: state_transitions uq_transicion_estado; Type: CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.state_transitions
    ADD CONSTRAINT uq_transicion_estado UNIQUE (source_state_id, target_state_id);


--
-- Name: cache_locks cache_locks_pkey; Type: CONSTRAINT; Schema: public; Owner: user_im
--

ALTER TABLE ONLY public.cache_locks
    ADD CONSTRAINT cache_locks_pkey PRIMARY KEY (key);


--
-- Name: cache cache_pkey; Type: CONSTRAINT; Schema: public; Owner: user_im
--

ALTER TABLE ONLY public.cache
    ADD CONSTRAINT cache_pkey PRIMARY KEY (key);


--
-- Name: failed_jobs failed_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: user_im
--

ALTER TABLE ONLY public.failed_jobs
    ADD CONSTRAINT failed_jobs_pkey PRIMARY KEY (id);


--
-- Name: failed_jobs failed_jobs_uuid_unique; Type: CONSTRAINT; Schema: public; Owner: user_im
--

ALTER TABLE ONLY public.failed_jobs
    ADD CONSTRAINT failed_jobs_uuid_unique UNIQUE (uuid);


--
-- Name: job_batches job_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: user_im
--

ALTER TABLE ONLY public.job_batches
    ADD CONSTRAINT job_batches_pkey PRIMARY KEY (id);


--
-- Name: jobs jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: user_im
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_pkey PRIMARY KEY (id);


--
-- Name: migrations migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: user_im
--

ALTER TABLE ONLY public.migrations
    ADD CONSTRAINT migrations_pkey PRIMARY KEY (id);


--
-- Name: state_change_requests state_change_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: user_im
--

ALTER TABLE ONLY public.state_change_requests
    ADD CONSTRAINT state_change_requests_pkey PRIMARY KEY (id);


--
-- Name: idx_access_logs_created_at; Type: INDEX; Schema: audit; Owner: user_im
--

CREATE INDEX idx_access_logs_created_at ON audit.access_logs USING btree (created_at);


--
-- Name: idx_access_logs_email; Type: INDEX; Schema: audit; Owner: user_im
--

CREATE INDEX idx_access_logs_email ON audit.access_logs USING btree (email);


--
-- Name: idx_access_logs_ip; Type: INDEX; Schema: audit; Owner: user_im
--

CREATE INDEX idx_access_logs_ip ON audit.access_logs USING btree (ip_address);


--
-- Name: idx_access_logs_session; Type: INDEX; Schema: audit; Owner: user_im
--

CREATE INDEX idx_access_logs_session ON audit.access_logs USING btree (session_id);


--
-- Name: idx_audit_auditable; Type: INDEX; Schema: audit; Owner: user_im
--

CREATE INDEX idx_audit_auditable ON audit.audit_logs USING btree (auditable_type, auditable_id);


--
-- Name: idx_audit_created_at; Type: INDEX; Schema: audit; Owner: user_im
--

CREATE INDEX idx_audit_created_at ON audit.audit_logs USING btree (created_at);


--
-- Name: idx_audit_event; Type: INDEX; Schema: audit; Owner: user_im
--

CREATE INDEX idx_audit_event ON audit.audit_logs USING btree (event);


--
-- Name: idx_audit_user; Type: INDEX; Schema: audit; Owner: user_im
--

CREATE INDEX idx_audit_user ON audit.audit_logs USING btree (user_id);


--
-- Name: auth_personal_access_tokens_tokenable_type_tokenable_id_index; Type: INDEX; Schema: auth; Owner: user_im
--

CREATE INDEX auth_personal_access_tokens_tokenable_type_tokenable_id_index ON auth.personal_access_tokens USING btree (tokenable_type, tokenable_id);


--
-- Name: auth_sessions_last_activity_index; Type: INDEX; Schema: auth; Owner: user_im
--

CREATE INDEX auth_sessions_last_activity_index ON auth.sessions USING btree (last_activity);


--
-- Name: auth_sessions_user_id_index; Type: INDEX; Schema: auth; Owner: user_im
--

CREATE INDEX auth_sessions_user_id_index ON auth.sessions USING btree (user_id);


--
-- Name: idx_navigation_items_active_sort; Type: INDEX; Schema: auth; Owner: user_im
--

CREATE INDEX idx_navigation_items_active_sort ON auth.navigation_items USING btree (active, sort_order);


--
-- Name: idx_navigation_items_parent_sort; Type: INDEX; Schema: auth; Owner: user_im
--

CREATE INDEX idx_navigation_items_parent_sort ON auth.navigation_items USING btree (parent_id, sort_order);


--
-- Name: idx_permissions_modulo; Type: INDEX; Schema: auth; Owner: user_im
--

CREATE INDEX idx_permissions_modulo ON auth.permissions USING btree (module);


--
-- Name: idx_sup_op_assign_operator_active; Type: INDEX; Schema: auth; Owner: user_im
--

CREATE INDEX idx_sup_op_assign_operator_active ON auth.supervisor_operator_assignments USING btree (operator_user_id, is_active);


--
-- Name: idx_sup_op_assign_supervisor_active; Type: INDEX; Schema: auth; Owner: user_im
--

CREATE INDEX idx_sup_op_assign_supervisor_active ON auth.supervisor_operator_assignments USING btree (supervisor_user_id, is_active);


--
-- Name: idx_user_identities_provider_email; Type: INDEX; Schema: auth; Owner: user_im
--

CREATE INDEX idx_user_identities_provider_email ON auth.user_identities USING btree (provider, provider_email);


--
-- Name: idx_user_territories_territory_active; Type: INDEX; Schema: auth; Owner: user_im
--

CREATE INDEX idx_user_territories_territory_active ON auth.user_territories USING btree (territorial_unit_id, is_active);


--
-- Name: idx_user_territories_user_active; Type: INDEX; Schema: auth; Owner: user_im
--

CREATE INDEX idx_user_territories_user_active ON auth.user_territories USING btree (user_id, is_active);


--
-- Name: idx_users_activo; Type: INDEX; Schema: auth; Owner: user_im
--

CREATE INDEX idx_users_activo ON auth.users USING btree (is_active);


--
-- Name: idx_users_email; Type: INDEX; Schema: auth; Owner: user_im
--

CREATE INDEX idx_users_email ON auth.users USING btree (email);


--
-- Name: uq_sup_op_assignments_active_operator; Type: INDEX; Schema: auth; Owner: user_im
--

CREATE UNIQUE INDEX uq_sup_op_assignments_active_operator ON auth.supervisor_operator_assignments USING btree (operator_user_id) WHERE (is_active = true);


--
-- Name: uq_sup_op_assignments_active_pair; Type: INDEX; Schema: auth; Owner: user_im
--

CREATE UNIQUE INDEX uq_sup_op_assignments_active_pair ON auth.supervisor_operator_assignments USING btree (supervisor_user_id, operator_user_id) WHERE (is_active = true);


--
-- Name: uq_user_territories_active_pair; Type: INDEX; Schema: auth; Owner: user_im
--

CREATE UNIQUE INDEX uq_user_territories_active_pair ON auth.user_territories USING btree (user_id, territorial_unit_id) WHERE (is_active = true);


--
-- Name: uq_user_territories_active_user; Type: INDEX; Schema: auth; Owner: user_im
--

CREATE UNIQUE INDEX uq_user_territories_active_user ON auth.user_territories USING btree (user_id) WHERE (is_active = true);


--
-- Name: core_incident_assignments_incident_cycle_id_index; Type: INDEX; Schema: core; Owner: user_im
--

CREATE INDEX core_incident_assignments_incident_cycle_id_index ON core.incident_assignments USING btree (incident_cycle_id);


--
-- Name: core_incident_attachments_incident_cycle_id_index; Type: INDEX; Schema: core; Owner: user_im
--

CREATE INDEX core_incident_attachments_incident_cycle_id_index ON core.incident_attachments USING btree (incident_cycle_id);


--
-- Name: core_incident_comments_incident_cycle_id_index; Type: INDEX; Schema: core; Owner: user_im
--

CREATE INDEX core_incident_comments_incident_cycle_id_index ON core.incident_comments USING btree (incident_cycle_id);


--
-- Name: core_incident_cycles_closed_at_index; Type: INDEX; Schema: core; Owner: user_im
--

CREATE INDEX core_incident_cycles_closed_at_index ON core.incident_cycles USING btree (closed_at);


--
-- Name: core_incident_cycles_cycle_number_index; Type: INDEX; Schema: core; Owner: user_im
--

CREATE INDEX core_incident_cycles_cycle_number_index ON core.incident_cycles USING btree (cycle_number);


--
-- Name: core_incident_cycles_incident_id_index; Type: INDEX; Schema: core; Owner: user_im
--

CREATE INDEX core_incident_cycles_incident_id_index ON core.incident_cycles USING btree (incident_id);


--
-- Name: core_incident_cycles_opened_at_index; Type: INDEX; Schema: core; Owner: user_im
--

CREATE INDEX core_incident_cycles_opened_at_index ON core.incident_cycles USING btree (opened_at);


--
-- Name: core_incident_cycles_resolved_at_index; Type: INDEX; Schema: core; Owner: user_im
--

CREATE INDEX core_incident_cycles_resolved_at_index ON core.incident_cycles USING btree (resolved_at);


--
-- Name: core_incident_states_incident_cycle_id_index; Type: INDEX; Schema: core; Owner: user_im
--

CREATE INDEX core_incident_states_incident_cycle_id_index ON core.incident_states USING btree (incident_cycle_id);


--
-- Name: idx_inc_assignments_incident; Type: INDEX; Schema: core; Owner: user_im
--

CREATE INDEX idx_inc_assignments_incident ON core.incident_assignments USING btree (incident_id);


--
-- Name: idx_inc_assignments_user; Type: INDEX; Schema: core; Owner: user_im
--

CREATE INDEX idx_inc_assignments_user ON core.incident_assignments USING btree (user_id);


--
-- Name: idx_inc_attachments_incident; Type: INDEX; Schema: core; Owner: user_im
--

CREATE INDEX idx_inc_attachments_incident ON core.incident_attachments USING btree (incident_id);


--
-- Name: idx_inc_comments_timeline; Type: INDEX; Schema: core; Owner: user_im
--

CREATE INDEX idx_inc_comments_timeline ON core.incident_comments USING btree (incident_id, created_at);


--
-- Name: idx_inc_states_timeline; Type: INDEX; Schema: core; Owner: user_im
--

CREATE INDEX idx_inc_states_timeline ON core.incident_states USING btree (incident_id, created_at);


--
-- Name: idx_incident_classification_history; Type: INDEX; Schema: core; Owner: user_im
--

CREATE INDEX idx_incident_classification_history ON core.incident_classification_history USING btree (incident_id, created_at);


--
-- Name: idx_incidents_active; Type: INDEX; Schema: core; Owner: user_im
--

CREATE INDEX idx_incidents_active ON core.incidents USING btree (state_id, priority_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_incidents_assigned; Type: INDEX; Schema: core; Owner: user_im
--

CREATE INDEX idx_incidents_assigned ON core.incidents USING btree (current_assigned_id);


--
-- Name: idx_incidents_classification_status; Type: INDEX; Schema: core; Owner: user_im
--

CREATE INDEX idx_incidents_classification_status ON core.incidents USING btree (classification_status);


--
-- Name: idx_incidents_code; Type: INDEX; Schema: core; Owner: user_im
--

CREATE INDEX idx_incidents_code ON core.incidents USING btree (code);


--
-- Name: idx_incidents_created_at; Type: INDEX; Schema: core; Owner: user_im
--

CREATE INDEX idx_incidents_created_at ON core.incidents USING btree (created_at);


--
-- Name: idx_incidents_location; Type: INDEX; Schema: core; Owner: user_im
--

CREATE INDEX idx_incidents_location ON core.incidents USING gist (location);


--
-- Name: idx_incidents_priority; Type: INDEX; Schema: core; Owner: user_im
--

CREATE INDEX idx_incidents_priority ON core.incidents USING btree (priority_id);


--
-- Name: idx_incidents_reported_by; Type: INDEX; Schema: core; Owner: user_im
--

CREATE INDEX idx_incidents_reported_by ON core.incidents USING btree (reported_by_id);


--
-- Name: idx_incidents_state; Type: INDEX; Schema: core; Owner: user_im
--

CREATE INDEX idx_incidents_state ON core.incidents USING btree (state_id);


--
-- Name: idx_incidents_territorial_unit; Type: INDEX; Schema: core; Owner: user_im
--

CREATE INDEX idx_incidents_territorial_unit ON core.incidents USING btree (territorial_unit_id);


--
-- Name: idx_notifications_unread; Type: INDEX; Schema: core; Owner: user_im
--

CREATE INDEX idx_notifications_unread ON core.notifications USING btree (user_id) WHERE (is_read = false);


--
-- Name: idx_subcategories_category; Type: INDEX; Schema: core; Owner: user_im
--

CREATE INDEX idx_subcategories_category ON core.subcategories USING btree (category_id);


--
-- Name: idx_territorial_units_active; Type: INDEX; Schema: core; Owner: user_im
--

CREATE INDEX idx_territorial_units_active ON core.territorial_units USING btree (is_active);


--
-- Name: idx_territorial_units_coverage_area; Type: INDEX; Schema: core; Owner: user_im
--

CREATE INDEX idx_territorial_units_coverage_area ON core.territorial_units USING gist (coverage_area);


--
-- Name: idx_territorial_units_parent; Type: INDEX; Schema: core; Owner: user_im
--

CREATE INDEX idx_territorial_units_parent ON core.territorial_units USING btree (parent_id);


--
-- Name: idx_territorial_units_type; Type: INDEX; Schema: core; Owner: user_im
--

CREATE INDEX idx_territorial_units_type ON core.territorial_units USING btree (type);


--
-- Name: uq_categories_single_fallback; Type: INDEX; Schema: core; Owner: user_im
--

CREATE UNIQUE INDEX uq_categories_single_fallback ON core.categories USING btree (is_fallback) WHERE (is_fallback = true);


--
-- Name: uq_estado_inicial; Type: INDEX; Schema: core; Owner: user_im
--

CREATE UNIQUE INDEX uq_estado_inicial ON core.states USING btree (is_initial_state) WHERE (is_initial_state = true);


--
-- Name: uq_incident_assignments_single_active_operator; Type: INDEX; Schema: core; Owner: user_im
--

CREATE UNIQUE INDEX uq_incident_assignments_single_active_operator ON core.incident_assignments USING btree (incident_id, user_id) WHERE (active = true);


--
-- Name: uq_incident_assignments_single_active_primary; Type: INDEX; Schema: core; Owner: user_im
--

CREATE UNIQUE INDEX uq_incident_assignments_single_active_primary ON core.incident_assignments USING btree (incident_id) WHERE ((active = true) AND ((assignment_role)::text = 'primary'::text));


--
-- Name: uq_territorial_units_root_name; Type: INDEX; Schema: core; Owner: user_im
--

CREATE UNIQUE INDEX uq_territorial_units_root_name ON core.territorial_units USING btree (name) WHERE (parent_id IS NULL);


--
-- Name: jobs_queue_index; Type: INDEX; Schema: public; Owner: user_im
--

CREATE INDEX jobs_queue_index ON public.jobs USING btree (queue);


--
-- Name: incidents trg_actualizar_ubicacion; Type: TRIGGER; Schema: core; Owner: user_im
--

CREATE TRIGGER trg_actualizar_ubicacion BEFORE INSERT OR UPDATE ON core.incidents FOR EACH ROW EXECUTE FUNCTION core.actualizar_ubicacion();


--
-- Name: incident_assignments trg_sincronizar_asignacion; Type: TRIGGER; Schema: core; Owner: user_im
--

CREATE TRIGGER trg_sincronizar_asignacion AFTER INSERT OR DELETE OR UPDATE ON core.incident_assignments FOR EACH ROW EXECUTE FUNCTION core.sincronizar_asignacion_actual();


--
-- Name: access_logs audit_access_logs_user_id_foreign; Type: FK CONSTRAINT; Schema: audit; Owner: user_im
--

ALTER TABLE ONLY audit.access_logs
    ADD CONSTRAINT audit_access_logs_user_id_foreign FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: audit_logs audit_audit_logs_user_id_foreign; Type: FK CONSTRAINT; Schema: audit; Owner: user_im
--

ALTER TABLE ONLY audit.audit_logs
    ADD CONSTRAINT audit_audit_logs_user_id_foreign FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: navigation_items auth_navigation_items_parent_id_foreign; Type: FK CONSTRAINT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.navigation_items
    ADD CONSTRAINT auth_navigation_items_parent_id_foreign FOREIGN KEY (parent_id) REFERENCES auth.navigation_items(id) ON DELETE CASCADE;


--
-- Name: navigation_items auth_navigation_items_permission_code_foreign; Type: FK CONSTRAINT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.navigation_items
    ADD CONSTRAINT auth_navigation_items_permission_code_foreign FOREIGN KEY (permission_code) REFERENCES auth.permissions(code) ON DELETE SET NULL;


--
-- Name: operator_profiles auth_operator_profiles_user_id_foreign; Type: FK CONSTRAINT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.operator_profiles
    ADD CONSTRAINT auth_operator_profiles_user_id_foreign FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: permission_role auth_permission_role_permission_id_foreign; Type: FK CONSTRAINT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.permission_role
    ADD CONSTRAINT auth_permission_role_permission_id_foreign FOREIGN KEY (permission_id) REFERENCES auth.permissions(id) ON DELETE CASCADE;


--
-- Name: permission_role auth_permission_role_role_id_foreign; Type: FK CONSTRAINT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.permission_role
    ADD CONSTRAINT auth_permission_role_role_id_foreign FOREIGN KEY (role_id) REFERENCES auth.roles(id) ON DELETE CASCADE;


--
-- Name: role_user auth_role_user_assigned_by_foreign; Type: FK CONSTRAINT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.role_user
    ADD CONSTRAINT auth_role_user_assigned_by_foreign FOREIGN KEY (assigned_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: role_user auth_role_user_role_id_foreign; Type: FK CONSTRAINT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.role_user
    ADD CONSTRAINT auth_role_user_role_id_foreign FOREIGN KEY (role_id) REFERENCES auth.roles(id) ON DELETE CASCADE;


--
-- Name: role_user auth_role_user_user_id_foreign; Type: FK CONSTRAINT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.role_user
    ADD CONSTRAINT auth_role_user_user_id_foreign FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: sessions auth_sessions_user_id_foreign; Type: FK CONSTRAINT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT auth_sessions_user_id_foreign FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: supervisor_operator_assignments auth_supervisor_operator_assignments_assigned_by_foreign; Type: FK CONSTRAINT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.supervisor_operator_assignments
    ADD CONSTRAINT auth_supervisor_operator_assignments_assigned_by_foreign FOREIGN KEY (assigned_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: supervisor_operator_assignments auth_supervisor_operator_assignments_operator_user_id_foreign; Type: FK CONSTRAINT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.supervisor_operator_assignments
    ADD CONSTRAINT auth_supervisor_operator_assignments_operator_user_id_foreign FOREIGN KEY (operator_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: supervisor_operator_assignments auth_supervisor_operator_assignments_supervisor_user_id_foreign; Type: FK CONSTRAINT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.supervisor_operator_assignments
    ADD CONSTRAINT auth_supervisor_operator_assignments_supervisor_user_id_foreign FOREIGN KEY (supervisor_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: supervisor_profiles auth_supervisor_profiles_user_id_foreign; Type: FK CONSTRAINT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.supervisor_profiles
    ADD CONSTRAINT auth_supervisor_profiles_user_id_foreign FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_identities auth_user_identities_user_id_foreign; Type: FK CONSTRAINT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.user_identities
    ADD CONSTRAINT auth_user_identities_user_id_foreign FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_territories auth_user_territories_assigned_by_foreign; Type: FK CONSTRAINT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.user_territories
    ADD CONSTRAINT auth_user_territories_assigned_by_foreign FOREIGN KEY (assigned_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: user_territories auth_user_territories_territorial_unit_id_foreign; Type: FK CONSTRAINT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.user_territories
    ADD CONSTRAINT auth_user_territories_territorial_unit_id_foreign FOREIGN KEY (territorial_unit_id) REFERENCES core.territorial_units(id) ON DELETE CASCADE;


--
-- Name: user_territories auth_user_territories_user_id_foreign; Type: FK CONSTRAINT; Schema: auth; Owner: user_im
--

ALTER TABLE ONLY auth.user_territories
    ADD CONSTRAINT auth_user_territories_user_id_foreign FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: incident_assignments core_incident_assignments_assigned_by_id_foreign; Type: FK CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incident_assignments
    ADD CONSTRAINT core_incident_assignments_assigned_by_id_foreign FOREIGN KEY (assigned_by_id) REFERENCES auth.users(id);


--
-- Name: incident_assignments core_incident_assignments_incident_cycle_id_foreign; Type: FK CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incident_assignments
    ADD CONSTRAINT core_incident_assignments_incident_cycle_id_foreign FOREIGN KEY (incident_cycle_id) REFERENCES core.incident_cycles(id) ON DELETE RESTRICT;


--
-- Name: incident_assignments core_incident_assignments_incident_id_foreign; Type: FK CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incident_assignments
    ADD CONSTRAINT core_incident_assignments_incident_id_foreign FOREIGN KEY (incident_id) REFERENCES core.incidents(id) ON DELETE CASCADE;


--
-- Name: incident_assignments core_incident_assignments_user_id_foreign; Type: FK CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incident_assignments
    ADD CONSTRAINT core_incident_assignments_user_id_foreign FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: incident_attachments core_incident_attachments_incident_cycle_id_foreign; Type: FK CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incident_attachments
    ADD CONSTRAINT core_incident_attachments_incident_cycle_id_foreign FOREIGN KEY (incident_cycle_id) REFERENCES core.incident_cycles(id) ON DELETE RESTRICT;


--
-- Name: incident_attachments core_incident_attachments_incident_id_foreign; Type: FK CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incident_attachments
    ADD CONSTRAINT core_incident_attachments_incident_id_foreign FOREIGN KEY (incident_id) REFERENCES core.incidents(id) ON DELETE CASCADE;


--
-- Name: incident_attachments core_incident_attachments_user_id_foreign; Type: FK CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incident_attachments
    ADD CONSTRAINT core_incident_attachments_user_id_foreign FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: incident_classification_history core_incident_classification_history_changed_by_foreign; Type: FK CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incident_classification_history
    ADD CONSTRAINT core_incident_classification_history_changed_by_foreign FOREIGN KEY (changed_by) REFERENCES auth.users(id);


--
-- Name: incident_classification_history core_incident_classification_history_incident_id_foreign; Type: FK CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incident_classification_history
    ADD CONSTRAINT core_incident_classification_history_incident_id_foreign FOREIGN KEY (incident_id) REFERENCES core.incidents(id) ON DELETE CASCADE;


--
-- Name: incident_classification_history core_incident_classification_history_new_category_id_foreign; Type: FK CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incident_classification_history
    ADD CONSTRAINT core_incident_classification_history_new_category_id_foreign FOREIGN KEY (new_category_id) REFERENCES core.categories(id);


--
-- Name: incident_classification_history core_incident_classification_history_new_subcategory_id_foreign; Type: FK CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incident_classification_history
    ADD CONSTRAINT core_incident_classification_history_new_subcategory_id_foreign FOREIGN KEY (new_subcategory_id) REFERENCES core.subcategories(id) ON DELETE SET NULL;


--
-- Name: incident_classification_history core_incident_classification_history_previous_category_id_forei; Type: FK CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incident_classification_history
    ADD CONSTRAINT core_incident_classification_history_previous_category_id_forei FOREIGN KEY (previous_category_id) REFERENCES core.categories(id) ON DELETE SET NULL;


--
-- Name: incident_classification_history core_incident_classification_history_previous_subcategory_id_fo; Type: FK CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incident_classification_history
    ADD CONSTRAINT core_incident_classification_history_previous_subcategory_id_fo FOREIGN KEY (previous_subcategory_id) REFERENCES core.subcategories(id) ON DELETE SET NULL;


--
-- Name: incident_comments core_incident_comments_incident_cycle_id_foreign; Type: FK CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incident_comments
    ADD CONSTRAINT core_incident_comments_incident_cycle_id_foreign FOREIGN KEY (incident_cycle_id) REFERENCES core.incident_cycles(id) ON DELETE RESTRICT;


--
-- Name: incident_comments core_incident_comments_incident_id_foreign; Type: FK CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incident_comments
    ADD CONSTRAINT core_incident_comments_incident_id_foreign FOREIGN KEY (incident_id) REFERENCES core.incidents(id) ON DELETE CASCADE;


--
-- Name: incident_comments core_incident_comments_user_id_foreign; Type: FK CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incident_comments
    ADD CONSTRAINT core_incident_comments_user_id_foreign FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: incident_cycles core_incident_cycles_closed_by_foreign; Type: FK CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incident_cycles
    ADD CONSTRAINT core_incident_cycles_closed_by_foreign FOREIGN KEY (closed_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: incident_cycles core_incident_cycles_incident_id_foreign; Type: FK CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incident_cycles
    ADD CONSTRAINT core_incident_cycles_incident_id_foreign FOREIGN KEY (incident_id) REFERENCES core.incidents(id) ON DELETE CASCADE;


--
-- Name: incident_cycles core_incident_cycles_opened_by_foreign; Type: FK CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incident_cycles
    ADD CONSTRAINT core_incident_cycles_opened_by_foreign FOREIGN KEY (opened_by) REFERENCES auth.users(id) ON DELETE RESTRICT;


--
-- Name: incident_cycles core_incident_cycles_resolved_by_foreign; Type: FK CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incident_cycles
    ADD CONSTRAINT core_incident_cycles_resolved_by_foreign FOREIGN KEY (resolved_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: incident_states core_incident_states_incident_cycle_id_foreign; Type: FK CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incident_states
    ADD CONSTRAINT core_incident_states_incident_cycle_id_foreign FOREIGN KEY (incident_cycle_id) REFERENCES core.incident_cycles(id) ON DELETE RESTRICT;


--
-- Name: incident_states core_incident_states_incident_id_foreign; Type: FK CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incident_states
    ADD CONSTRAINT core_incident_states_incident_id_foreign FOREIGN KEY (incident_id) REFERENCES core.incidents(id) ON DELETE CASCADE;


--
-- Name: incident_states core_incident_states_new_state_id_foreign; Type: FK CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incident_states
    ADD CONSTRAINT core_incident_states_new_state_id_foreign FOREIGN KEY (new_state_id) REFERENCES core.states(id);


--
-- Name: incident_states core_incident_states_previous_state_id_foreign; Type: FK CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incident_states
    ADD CONSTRAINT core_incident_states_previous_state_id_foreign FOREIGN KEY (previous_state_id) REFERENCES core.states(id);


--
-- Name: incident_states core_incident_states_user_id_foreign; Type: FK CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incident_states
    ADD CONSTRAINT core_incident_states_user_id_foreign FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: incidents core_incidents_category_id_foreign; Type: FK CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incidents
    ADD CONSTRAINT core_incidents_category_id_foreign FOREIGN KEY (category_id) REFERENCES core.categories(id);


--
-- Name: incidents core_incidents_classified_by_foreign; Type: FK CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incidents
    ADD CONSTRAINT core_incidents_classified_by_foreign FOREIGN KEY (classified_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: incidents core_incidents_current_assigned_id_foreign; Type: FK CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incidents
    ADD CONSTRAINT core_incidents_current_assigned_id_foreign FOREIGN KEY (current_assigned_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: incidents core_incidents_current_cycle_id_foreign; Type: FK CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incidents
    ADD CONSTRAINT core_incidents_current_cycle_id_foreign FOREIGN KEY (current_cycle_id) REFERENCES core.incident_cycles(id) ON DELETE SET NULL;


--
-- Name: incidents core_incidents_priority_id_foreign; Type: FK CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incidents
    ADD CONSTRAINT core_incidents_priority_id_foreign FOREIGN KEY (priority_id) REFERENCES core.priorities(id);


--
-- Name: incidents core_incidents_reported_by_id_foreign; Type: FK CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incidents
    ADD CONSTRAINT core_incidents_reported_by_id_foreign FOREIGN KEY (reported_by_id) REFERENCES auth.users(id);


--
-- Name: incidents core_incidents_resolved_by_supervisor_id_foreign; Type: FK CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incidents
    ADD CONSTRAINT core_incidents_resolved_by_supervisor_id_foreign FOREIGN KEY (resolved_by_supervisor_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: incidents core_incidents_state_id_foreign; Type: FK CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incidents
    ADD CONSTRAINT core_incidents_state_id_foreign FOREIGN KEY (state_id) REFERENCES core.states(id);


--
-- Name: incidents core_incidents_subcategory_id_foreign; Type: FK CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incidents
    ADD CONSTRAINT core_incidents_subcategory_id_foreign FOREIGN KEY (subcategory_id) REFERENCES core.subcategories(id) ON DELETE SET NULL;


--
-- Name: incidents core_incidents_territorial_unit_id_foreign; Type: FK CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.incidents
    ADD CONSTRAINT core_incidents_territorial_unit_id_foreign FOREIGN KEY (territorial_unit_id) REFERENCES core.territorial_units(id) ON DELETE SET NULL;


--
-- Name: notifications core_notifications_incident_id_foreign; Type: FK CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.notifications
    ADD CONSTRAINT core_notifications_incident_id_foreign FOREIGN KEY (incident_id) REFERENCES core.incidents(id) ON DELETE SET NULL;


--
-- Name: notifications core_notifications_user_id_foreign; Type: FK CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.notifications
    ADD CONSTRAINT core_notifications_user_id_foreign FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: state_transitions core_state_transitions_source_state_id_foreign; Type: FK CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.state_transitions
    ADD CONSTRAINT core_state_transitions_source_state_id_foreign FOREIGN KEY (source_state_id) REFERENCES core.states(id) ON DELETE CASCADE;


--
-- Name: state_transitions core_state_transitions_target_state_id_foreign; Type: FK CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.state_transitions
    ADD CONSTRAINT core_state_transitions_target_state_id_foreign FOREIGN KEY (target_state_id) REFERENCES core.states(id) ON DELETE CASCADE;


--
-- Name: subcategories core_subcategories_category_id_foreign; Type: FK CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.subcategories
    ADD CONSTRAINT core_subcategories_category_id_foreign FOREIGN KEY (category_id) REFERENCES core.categories(id) ON DELETE CASCADE;


--
-- Name: territorial_units core_territorial_units_parent_id_foreign; Type: FK CONSTRAINT; Schema: core; Owner: user_im
--

ALTER TABLE ONLY core.territorial_units
    ADD CONSTRAINT core_territorial_units_parent_id_foreign FOREIGN KEY (parent_id) REFERENCES core.territorial_units(id) ON DELETE SET NULL;


--
-- Name: state_change_requests state_change_requests_incident_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: user_im
--

ALTER TABLE ONLY public.state_change_requests
    ADD CONSTRAINT state_change_requests_incident_id_foreign FOREIGN KEY (incident_id) REFERENCES core.incidents(id) ON DELETE CASCADE;


--
-- Name: state_change_requests state_change_requests_requested_by_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: user_im
--

ALTER TABLE ONLY public.state_change_requests
    ADD CONSTRAINT state_change_requests_requested_by_user_id_foreign FOREIGN KEY (requested_by_user_id) REFERENCES auth.users(id);


--
-- Name: state_change_requests state_change_requests_requested_state_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: user_im
--

ALTER TABLE ONLY public.state_change_requests
    ADD CONSTRAINT state_change_requests_requested_state_id_foreign FOREIGN KEY (requested_state_id) REFERENCES core.states(id);


--
-- Name: state_change_requests state_change_requests_reviewed_by_user_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: user_im
--

ALTER TABLE ONLY public.state_change_requests
    ADD CONSTRAINT state_change_requests_reviewed_by_user_id_foreign FOREIGN KEY (reviewed_by_user_id) REFERENCES auth.users(id);


--
-- PostgreSQL database dump complete
--

