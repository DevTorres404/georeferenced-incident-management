<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        DB::statement('DROP TRIGGER IF EXISTS trg_calcular_fecha_limite ON core.incidents');
        DB::statement('DROP TRIGGER IF EXISTS trigger_calcular_fecha_limite ON core.incidents');
        DB::statement('UPDATE core.incidents SET due_date = NULL');
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
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

        DB::statement("
            CREATE OR REPLACE TRIGGER trg_calcular_fecha_limite
            BEFORE INSERT OR UPDATE OF priority_id ON core.incidents
            FOR EACH ROW
            EXECUTE FUNCTION core.calcular_fecha_limite();
        ");
    }
};
