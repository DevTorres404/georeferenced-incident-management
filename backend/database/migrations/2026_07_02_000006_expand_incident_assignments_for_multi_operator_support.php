<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('core.incident_assignments', function (Blueprint $table) {
            $table->string('assignment_role', 20)
                ->default('primary')
                ->after('assigned_by_id');
            $table->boolean('active')
                ->default(true)
                ->after('assignment_role');
        });

        DB::statement("
            UPDATE core.incident_assignments
            SET assignment_role = 'primary',
                active = CASE
                    WHEN unassignment_date IS NULL THEN true
                    ELSE false
                END
        ");

        DB::statement("
            CREATE UNIQUE INDEX uq_incident_assignments_single_active_primary
            ON core.incident_assignments (incident_id)
            WHERE active = true AND assignment_role = 'primary'
        ");

        DB::statement("
            CREATE UNIQUE INDEX uq_incident_assignments_single_active_operator
            ON core.incident_assignments (incident_id, user_id)
            WHERE active = true
        ");

        DB::statement("
            CREATE OR REPLACE FUNCTION core.sincronizar_asignacion_actual()
            RETURNS TRIGGER AS \$\$
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
            \$\$ LANGUAGE plpgsql;
        ");
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS core.uq_incident_assignments_single_active_operator');
        DB::statement('DROP INDEX IF EXISTS core.uq_incident_assignments_single_active_primary');

        DB::statement("
            CREATE OR REPLACE FUNCTION core.sincronizar_asignacion_actual()
            RETURNS TRIGGER AS \$\$
            DECLARE
                v_incident_id BIGINT;
            BEGIN
                IF TG_OP = 'DELETE' THEN
                    v_incident_id := OLD.incident_id;
                ELSE
                    v_incident_id := NEW.incident_id;
                END IF;

                IF TG_OP = 'INSERT' AND NEW.unassignment_date IS NULL THEN
                    UPDATE core.incident_assignments
                    SET unassignment_date = NOW()
                    WHERE incident_id = NEW.incident_id
                      AND unassignment_date IS NULL
                      AND id != NEW.id;
                END IF;

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
                END IF;

                RETURN NEW;
            END;
            \$\$ LANGUAGE plpgsql;
        ");

        Schema::table('core.incident_assignments', function (Blueprint $table) {
            $table->dropColumn(['assignment_role', 'active']);
        });
    }
};
