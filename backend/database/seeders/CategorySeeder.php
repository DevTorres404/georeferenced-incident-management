<?php

namespace Database\Seeders;

use App\Incidents\Infrastructure\Persistence\Models\Category;
use App\Incidents\Infrastructure\Persistence\Models\Subcategory;
use Illuminate\Database\Seeder;

/**
 * Seeder de categorías y subcategorías de incidents.
 */
class CategorySeeder extends Seeder
{
    public function run(): void
    {
        $unusedFallback = Category::query()
            ->where('is_fallback', true)
            ->whereDoesntHave('incidents')
            ->first();
        $unusedFallback?->delete();

        $categories = [
            [
                'name' => 'Vialidad',
                'description' => 'Problemas relacionados con calles, carreteras y vías públicas',
                'icon' => 'fa-road',
                'color' => '#6366F1',
                'subcategories' => [
                    ['name' => 'Bache', 'description' => 'Agujero, rotura o desnivel peligroso en el pavimento'],
                    ['name' => 'Semáforo dañado', 'description' => 'Semáforo apagado, intermitente, girado o desincronizado'],
                    ['name' => 'Señalización vial', 'description' => 'Falta de señalización, o señales en mal estado o ilegibles'],
                    ['name' => 'Hundimiento', 'description' => 'Socavón o hundimiento significativo de la vía pública'],
                    ['name' => 'Pavimento deteriorado', 'description' => 'Desgaste general, grietas extensas o pérdida de asfalto'],
                ],
            ],
            [
                'name' => 'Servicios Públicos',
                'description' => 'Agua potable, alcantarillado y drenaje',
                'icon' => 'fa-water',
                'color' => '#0EA5E9',
                'subcategories' => [
                    ['name' => 'Fuga de agua', 'description' => 'Pérdida de agua potable en tuberías de la vía pública'],
                    ['name' => 'Alcantarilla tapada', 'description' => 'Obstrucción del flujo de agua por acumulación de basura o escombros'],
                    ['name' => 'Falta de agua', 'description' => 'Corte o baja presión del servicio de agua potable'],
                    ['name' => 'Drenaje colapsado', 'description' => 'Desbordamiento de aguas negras o daños en la red de alcantarillado'],
                ],
            ],
            [
                'name' => 'Alumbrado Público',
                'description' => 'Luminarias, postes y cableado eléctrico público',
                'icon' => 'fa-lightbulb',
                'color' => '#F59E0B',
                'subcategories' => [
                    ['name' => 'Luminaria apagada', 'description' => 'Foco o lámpara fundida o que no enciende durante la noche'],
                    ['name' => 'Poste dañado', 'description' => 'Poste chocado, inclinado, oxidado o a punto de caer'],
                    ['name' => 'Cable caído', 'description' => 'Cables eléctricos o de servicios desprendidos y peligrosos'],
                    ['name' => 'Zona sin iluminación', 'description' => 'Área pública extensa o calle completa que carece de alumbrado'],
                ],
            ],
            [
                'name' => 'Espacios Públicos',
                'description' => 'Parques, plazas, áreas verdes y mobiliario urbano',
                'icon' => 'fa-tree',
                'color' => '#22C55E',
                'subcategories' => [
                    ['name' => 'Parque descuidado', 'description' => 'Falta de mantenimiento general, maleza alta o suciedad'],
                    ['name' => 'Mobiliario dañado', 'description' => 'Bancas, botes de basura o mesas rotas en espacios públicos'],
                    ['name' => 'Juegos infantiles rotos', 'description' => 'Estructuras recreativas oxidadas, astilladas o peligrosas para niños'],
                    ['name' => 'Área verde sin mantenimiento', 'description' => 'Jardines, camellones o plazas con pasto crecido o plantas secas'],
                ],
            ],
            [
                'name' => 'Recolección de Residuos',
                'description' => 'Basura, residuos y limpieza urbana',
                'icon' => 'fa-trash',
                'color' => '#A855F7',
                'subcategories' => [
                    ['name' => 'Basura acumulada', 'description' => 'Montículos de basura o escombros abandonados en la vía pública'],
                    ['name' => 'Contenedor lleno', 'description' => 'Contenedores públicos desbordados que requieren vaciado urgente'],
                    ['name' => 'Residuos peligrosos', 'description' => 'Presencia de material tóxico, biológico o riesgoso sin control'],
                    ['name' => 'Falta de recolección', 'description' => 'Incumplimiento de la ruta programada del camión recolector'],
                ],
            ],
            [
                'name' => 'Seguridad',
                'description' => 'Situaciones que afectan la seguridad ciudadana',
                'icon' => 'fa-shield-alt',
                'color' => '#EF4444',
                'subcategories' => [
                    ['name' => 'Vandalismo', 'description' => 'Grafitis, daños intencionados a infraestructura o mobiliario'],
                    ['name' => 'Zona insegura', 'description' => 'Lugar propenso a delitos, reportes de actividad sospechosa o falta de vigilancia'],
                    ['name' => 'Obstrucción de vía', 'description' => 'Escombros, vehículos abandonados o barricadas que impiden el tránsito'],
                ],
            ],
        ];

        foreach ($categories as $catData) {
            $subcategories = $catData['subcategories'];
            unset($catData['subcategories']);

            $categoria = Category::updateOrCreate(
                ['name' => $catData['name']],
                $catData
            );

            foreach ($subcategories as $subData) {
                Subcategory::updateOrCreate(
                    [
                        'category_id' => $categoria->id,
                        'name' => $subData['name'],
                    ],
                    ['description' => $subData['description']]
                );
            }
        }

        Category::updateOrCreate(
            ['name' => 'Sin clasificar'],
            [
                'description' => 'Clasificación temporal para incidencias que no están cubiertas por el catálogo.',
                'icon' => 'fa-question-circle',
                'color' => '#6B7280',
                'is_active' => true,
                'is_fallback' => true,
            ]
        );
    }
}
