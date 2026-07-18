<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE core.incidents ALTER COLUMN priority_id DROP NOT NULL');

        DB::statement("
            CREATE OR REPLACE FUNCTION core.calcular_fecha_limite()
            RETURNS TRIGGER AS \$\$
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
            \$\$ LANGUAGE plpgsql;
        ");
    }

    public function down(): void
    {
        DB::statement('
            UPDATE core.incidents
            SET priority_id = (
                SELECT id
                FROM core.priorities
                ORDER BY level DESC, id ASC
                LIMIT 1
            )
            WHERE priority_id IS NULL
        ');

        DB::statement('ALTER TABLE core.incidents ALTER COLUMN priority_id SET NOT NULL');

        DB::statement("
            CREATE OR REPLACE FUNCTION core.calcular_fecha_limite()
            RETURNS TRIGGER AS \$\$
            DECLARE
                v_sla_horas SMALLINT;
            BEGIN
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
    }
};
