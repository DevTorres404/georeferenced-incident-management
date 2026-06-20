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
        $categories = [
            [
                'name'        => 'Vialidad',
                'description' => 'Problemas relacionados con calles, carreteras y vías públicas',
                'icon'        => 'fa-road',
                'color'       => '#6366F1',
                'subcategories' => [
                    'Bache',
                    'Semáforo dañado',
                    'Señalización vial',
                    'Hundimiento',
                    'Pavimento deteriorado',
                ],
            ],
            [
                'name'        => 'Servicios Públicos',
                'description' => 'Agua potable, alcantarillado y drenaje',
                'icon'        => 'fa-faucet-drip',
                'color'       => '#0EA5E9',
                'subcategories' => [
                    'Fuga de agua',
                    'Alcantarilla tapada',
                    'Falta de agua',
                    'Drenaje colapsado',
                ],
            ],
            [
                'name'        => 'Alumbrado Público',
                'description' => 'Luminarias, postes y cableado eléctrico público',
                'icon'        => 'fa-lightbulb',
                'color'       => '#F59E0B',
                'subcategories' => [
                    'Luminaria apagada',
                    'Poste dañado',
                    'Cable caído',
                    'Zona sin iluminación',
                ],
            ],
            [
                'name'        => 'Espacios Públicos',
                'description' => 'Parques, plazas, áreas verdes y mobiliario urbano',
                'icon'        => 'fa-tree',
                'color'       => '#22C55E',
                'subcategories' => [
                    'Parque descuidado',
                    'Mobiliario dañado',
                    'Juegos infantiles rotos',
                    'Área verde sin mantenimiento',
                ],
            ],
            [
                'name'        => 'Recolección de Residuos',
                'description' => 'Basura, residuos y limpieza urbana',
                'icon'        => 'fa-trash',
                'color'       => '#A855F7',
                'subcategories' => [
                    'Basura acumulada',
                    'Contenedor lleno',
                    'Residuos peligrosos',
                    'Falta de recolección',
                ],
            ],
            [
                'name'        => 'Seguridad',
                'description' => 'Situaciones que afectan la seguridad ciudadana',
                'icon'        => 'fa-shield-halved',
                'color'       => '#EF4444',
                'subcategories' => [
                    'Vandalismo',
                    'Zona insegura',
                    'Obstrucción de vía',
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

            foreach ($subcategories as $subNombre) {
                Subcategory::updateOrCreate(
                    [
                        'category_id' => $categoria->id,
                        'name'       => $subNombre,
                    ],
                    ['description' => null]
                );
            }
        }
    }
}

