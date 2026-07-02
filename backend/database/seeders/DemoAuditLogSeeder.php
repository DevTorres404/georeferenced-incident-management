<?php

namespace Database\Seeders;

use App\Audit\Infrastructure\Persistence\Models\AuditLog;
use App\Auth\Infrastructure\Persistence\Models\User;
use App\Incidents\Infrastructure\Persistence\Models\Incident;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Faker\Factory as Faker;

class DemoAuditLogSeeder extends Seeder
{
    public function run(): void
    {
        $faker = Faker::create('es_ES');
        $users = User::pluck('id')->toArray();
        $incidents = Incident::pluck('id')->toArray();

        if (empty($users) || empty($incidents)) {
            $this->command->warn('No users or incidents found. Skipping DemoAuditLogSeeder.');
            return;
        }

        DB::table('audit.audit_logs')
            ->whereRaw("tags->>'source' = ?", ['demo'])
            ->delete();

        $events = ['created', 'updated', 'deleted', 'restored'];
        $models = [
            User::class => $users,
            Incident::class => $incidents,
        ];

        $logs = [];

        for ($i = 0; $i < 50; $i++) {
            $modelClass = $faker->randomElement(array_keys($models));
            $modelId = $faker->randomElement($models[$modelClass]);
            $event = $faker->randomElement($events);
            
            $oldValues = null;
            $newValues = null;

            if ($event === 'created') {
                $newValues = json_encode(['name' => $faker->word(), 'status' => 'active']);
            } elseif ($event === 'updated') {
                $oldValues = json_encode(['status' => 'pending']);
                $newValues = json_encode(['status' => 'active']);
            } elseif ($event === 'deleted') {
                $oldValues = json_encode(['deleted_at' => null]);
                $newValues = json_encode(['deleted_at' => now()->toDateTimeString()]);
            }

            $logs[] = [
                'auditable_type' => $modelClass,
                'auditable_id'   => $modelId,
                'event'          => $event,
                'old_values'     => $oldValues,
                'new_values'     => $newValues,
                'url'            => '/api/' . ($modelClass === User::class ? 'users' : 'incidents') . '/' . $modelId,
                'user_id'        => $faker->randomElement($users),
                'ip_address'     => $faker->ipv4(),
                'user_agent'     => $faker->userAgent(),
                'tags'           => json_encode(['source' => 'demo']),
                'created_at'     => $faker->dateTimeBetween('-1 year', 'now'),
            ];
        }

        DB::table('audit.audit_logs')->insert($logs);
        
        $this->command->info('DemoAuditLogSeeder: 50 fake audit logs inserted successfully.');
    }
}
