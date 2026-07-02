<?php

namespace Database\Seeders;

use App\Incidents\Infrastructure\Persistence\Models\Configuration;
use Illuminate\Database\Seeder;

/**
 * Seeder de configuraciones iniciales del sistema.
 */
class ConfigurationSeeder extends Seeder
{
    public function run(): void
    {
        $configs = [
            [
                'key'         => 'app.nombre',
                'value'       => 'Sistema de Gestión de Incidencias Ciudadanas',
                'type'        => 'string',
                'description' => 'Nombre de la aplicación mostrado en la UI',
            ],
            [
                'key'         => 'incident.codigo_prefijo',
                'value'       => 'INC',
                'type'        => 'string',
                'description' => 'Prefijo para el código de incidencias (ej: INC-2026-00001)',
            ],
            [
                'key'         => 'incident.adjunto_max_mb',
                'value'       => '10',
                'type'        => 'integer',
                'description' => 'Tamaño máximo de archivo adjunto en megabytes',
            ],
            [
                'key'         => 'incident.adjuntos_max_cantidad',
                'value'       => '5',
                'type'        => 'integer',
                'description' => 'Cantidad máxima de adjuntos por incidencia',
            ],
            [
                'key'         => 'notificacion.email_activo',
                'value'       => 'true',
                'type'        => 'boolean',
                'description' => 'Habilitar notificaciones por correo electrónico',
            ],
            [
                'key'         => 'mapa.latitud_centro',
                'value'       => '-1.8312',
                'type'        => 'string',
                'description' => 'Latitud del centro del mapa por defecto (Ecuador)',
            ],
            [
                'key'         => 'mapa.longitud_centro',
                'value'       => '-78.4678',
                'type'        => 'string',
                'description' => 'Longitud del centro del mapa por defecto (Ecuador)',
            ],
            [
                'key'         => 'mapa.zoom_default',
                'value'       => '6',
                'type'        => 'integer',
                'description' => 'Nivel de zoom inicial del mapa',
            ],
        ];

        foreach ($configs as $config) {
            Configuration::updateOrCreate(
                ['key' => $config['key']],
                $config
            );
        }
    }
}

