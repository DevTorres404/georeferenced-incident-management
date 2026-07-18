<?php

namespace Database\Seeders;

use App\Auth\Infrastructure\Persistence\Models\User;
use Faker\Factory as Faker;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class DemoUserIdentitySeeder extends Seeder
{
    public function run(): void
    {
        $faker = Faker::create('es_ES');
        // Let's get some demo users
        $users = User::whereIn('email', ['ciudadano1@incidents.local', 'operador1@incidents.local'])->get();

        if ($users->isEmpty()) {
            $this->command->warn('Target demo users not found. Skipping DemoUserIdentitySeeder.');

            return;
        }

        $identities = [];

        foreach ($users as $user) {
            DB::table('auth.user_identities')->updateOrInsert(
                [
                    'user_id' => $user->id,
                    'provider' => 'google',
                ],
                [
                    'provider_uid' => $faker->numerify('1##########'),
                    'provider_email' => $user->email,
                    'verified_at' => now(),
                    'last_used_at' => now(),
                    'provider_data' => json_encode([
                        'avatar_url' => $faker->imageUrl(200, 200, 'people', true, 'avatar'),
                        'provider_token' => Str::random(60),
                    ]),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]
            );

            $identities[] = $user->id;
        }

        $this->command->info('DemoUserIdentitySeeder: '.count($identities).' fake user identities inserted successfully.');
    }
}
