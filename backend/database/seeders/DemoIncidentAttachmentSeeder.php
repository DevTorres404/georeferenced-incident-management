<?php

namespace Database\Seeders;

use App\Auth\Infrastructure\Persistence\Models\User;
use App\Incidents\Infrastructure\Persistence\Models\Incident;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Faker\Factory as Faker;

class DemoIncidentAttachmentSeeder extends Seeder
{
    public function run(): void
    {
        $faker = Faker::create('es_ES');
        $incidents = Incident::pluck('id')->toArray();
        $users = User::pluck('id')->toArray();

        if (empty($incidents) || empty($users)) {
            $this->command->warn('No incidents or users found. Skipping DemoIncidentAttachmentSeeder.');
            return;
        }

        DB::table('core.incident_attachments')
            ->where('file_path', 'like', 'attachments/demo/%')
            ->delete();

        $attachments = [];

        // Seed 20 attachments across random incidents
        for ($i = 0; $i < 20; $i++) {
            $extensions = ['jpg', 'png', 'pdf'];
            $ext = $faker->randomElement($extensions);
            $mime = $ext === 'pdf' ? 'application/pdf' : 'image/' . ($ext === 'jpg' ? 'jpeg' : 'png');
            
            $attachments[] = [
                'incident_id' => $faker->randomElement($incidents),
                'user_id' => $faker->randomElement($users),
                'original_name' => $faker->word() . '.' . $ext,
                'file_path' => 'attachments/demo/' . $faker->uuid() . '.' . $ext,
                'mime_type' => $mime,
                'file_size_bytes' => $faker->numberBetween(1024, 5242880), // 1KB to 5MB
                'file_hash' => hash('sha256', $faker->sentence()),
                'created_at' => $faker->dateTimeBetween('-6 months', 'now'),
            ];
        }

        DB::table('core.incident_attachments')->insert($attachments);
        
        $this->command->info('DemoIncidentAttachmentSeeder: 20 fake attachments inserted successfully.');
    }
}
