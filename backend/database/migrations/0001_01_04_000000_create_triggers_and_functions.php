<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Triggers y funciones de PostgreSQL.
 *
 * Esta migración crea toda la lógica del lado de la base de datos:
 *
 * 1. trg_actualizar_ubicacion — Sincroniza lat/lng ↔ geometría PostGIS
 * 2. trg_calcular_fecha_limite — Calcula fecha_limite automáticamente desde SLA
 * 3. trg_sincronizar_asignacion — Mantiene asignado_actual_id sincronizado
 *    con la tabla incident_asignaciones
 */
return new class extends Migration
{
    public function up(): void
    {
        // ══════════════════════════════════════════════
        // TRIGGER 1: Sincronización geoespacial
        // Convierte latitude/longitude a GEOMETRY(Point,4326)
        // y viceversa para mantener consistencia biaddressal
        // ══════════════════════════════════════════════
        DB::statement('
            CREATE OR REPLACE FUNCTION core.actualizar_ubicacion()
            RETURNS TRIGGER AS $$
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
            $$ LANGUAGE plpgsql;
        ');

        DB::statement('
            CREATE TRIGGER trg_actualizar_ubicacion
            BEFORE INSERT OR UPDATE ON core.incidents
            FOR EACH ROW
            EXECUTE FUNCTION core.actualizar_ubicacion();
        ');

        // ══════════════════════════════════════════════
        // TRIGGER 2: Cálculo automático de fecha_limite
        // Se ejecuta al crear incident o cambiar prioridad.
        // Formula: created_at + prioridad.sla_horas
        // ══════════════════════════════════════════════
        DB::statement("
            CREATE OR REPLACE FUNCTION core.calcular_fecha_limite()
            RETURNS TRIGGER AS \$\$
            DECLARE
                v_sla_horas SMALLINT;
            BEGIN
                -- Solo calcular en INSERT o cuando cambia la prioridad
                IF (TG_OP = 'INSERT')
                   OR (TG_OP = 'UPDATE' AND OLD.priority_id IS DISTINCT FROM NEW.priority_id)
                THEN
                    SELECT sla_hours INTO v_sla_horas
                    FROM core.priorities
                    WHERE id = NEW.priority_id;

                    NEW.due_date := COALESCE(NEW.created_at, NOW())
                                        + (v_sla_horas || ' hours')::INTERVAL;
                END IF;

                RETURN NEW;
            END;
            \$\$ LANGUAGE plpgsql;
        ");

        DB::statement('
            CREATE TRIGGER trg_calcular_fecha_limite
            BEFORE INSERT OR UPDATE ON core.incidents
            FOR EACH ROW
            EXECUTE FUNCTION core.calcular_fecha_limite();
        ');

        // ══════════════════════════════════════════════
        // TRIGGER 3: Sincronización de asignación actual
        // Mantiene incidents.asignado_actual_id sincronizado
        // con la última asignación activa en incident_asignaciones.
        //
        // Flujo:
        //   INSERT nueva asignación → cierra la anterior → actualiza campo
        //   UPDATE fecha_desasignacion → busca siguiente activa → actualiza campo
        // ══════════════════════════════════════════════
        DB::statement("
            CREATE OR REPLACE FUNCTION core.sincronizar_asignacion_actual()
            RETURNS TRIGGER AS \$\$
            DECLARE
                v_incident_id BIGINT;
            BEGIN
                -- Determinar el ID de la incident afectada
                IF TG_OP = 'DELETE' THEN
                    v_incident_id := OLD.incident_id;
                ELSE
                    v_incident_id := NEW.incident_id;
                END IF;

                -- Si es un INSERT de una asignación activa (fecha_desasignacion IS NULL)
                IF TG_OP = 'INSERT' AND NEW.unassignment_date IS NULL THEN
                    -- Cerrar asignación anterior (si existe)
                    UPDATE core.incident_assignments
                    SET unassignment_date = NOW()
                    WHERE incident_id = NEW.incident_id
                      AND unassignment_date IS NULL
                      AND id != NEW.id;
                END IF;

                -- Sincronizar el campo desnormalizado 'asignado_actual_id'
                -- con el user_id de la asignación activa más reciente
                UPDATE core.incidents
                SET current_assigned_id = (
                    SELECT user_id
                    FROM core.incident_assignments
                    WHERE incident_id = v_incident_id
                      AND unassignment_date IS NULL
                    ORDER BY assignment_date DESC, id DESC
                    LIMIT 1
                )
                WHERE id = v_incident_id;

                IF TG_OP = 'DELETE' THEN
                    RETURN OLD;
                ELSE
                    RETURN NEW;
                END IF;
            END;
            \$\$ LANGUAGE plpgsql;
        ");

        DB::statement('
            CREATE TRIGGER trg_sincronizar_asignacion
            AFTER INSERT OR UPDATE OR DELETE ON core.incident_assignments
            FOR EACH ROW
            EXECUTE FUNCTION core.sincronizar_asignacion_actual();
        ');
    }

    public function down(): void
    {
        // Eliminar triggers (en orden inverso)
        DB::statement('DROP TRIGGER IF EXISTS trg_sincronizar_asignacion ON core.incident_assignments');
        DB::statement('DROP FUNCTION IF EXISTS core.sincronizar_asignacion_actual()');

        DB::statement('DROP TRIGGER IF EXISTS trg_calcular_fecha_limite ON core.incidents');
        DB::statement('DROP FUNCTION IF EXISTS core.calcular_fecha_limite()');

        DB::statement('DROP TRIGGER IF EXISTS trg_actualizar_ubicacion ON core.incidents');
        DB::statement('DROP FUNCTION IF EXISTS core.actualizar_ubicacion()');
    }
};
