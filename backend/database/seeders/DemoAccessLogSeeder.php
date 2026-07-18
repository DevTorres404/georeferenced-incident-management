<?php

namespace Database\Seeders;

use App\Auth\Infrastructure\Persistence\Models\User;
use Faker\Factory as Faker;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class DemoAccessLogSeeder extends Seeder
{
    public function run(): void
    {
        $faker = Faker::create('es_ES');
        $users = User::all();

        if ($users->isEmpty()) {
            $this->command->warn('No users found. Skipping DemoAccessLogSeeder.');

            return;
        }

        DB::table('audit.access_logs')
            ->where('session_id', 'like', 'demo-%')
            ->orWhere('failure_reason', 'like', 'Demo:%')
            ->delete();

        $logs = [];

        // Seed 50 access logs
        for ($i = 0; $i < 50; $i++) {
            $isSuccess = $faker->boolean(80); // 80% success rate
            $user = $faker->randomElement($users);

            $logs[] = [
                'email' => $isSuccess ? $user->email : $faker->safeEmail(),
                'user_id' => $isSuccess ? $user->id : null,
                'login_type' => $faker->randomElement(['email', 'google', '2fa']),
                'is_success' => $isSuccess,
                'failure_reason' => $isSuccess ? null : 'Demo: '.$faker->randomElement(['Credenciales incorrectas', 'Usuario no encontrado', 'Cuenta bloqueada']),
                'session_id' => $isSuccess ? 'demo-'.Str::random(35) : null,
                'ip_address' => $faker->ipv4(),
                'user_agent' => $faker->userAgent(),
                'created_at' => $faker->dateTimeBetween('-1 year', 'now'),
            ];
        }

        DB::table('audit.access_logs')->insert($logs);

        $this->command->info('DemoAccessLogSeeder: 50 fake access logs inserted successfully.');
    }
}
