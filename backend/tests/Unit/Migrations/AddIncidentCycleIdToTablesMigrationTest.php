<?php

namespace Tests\Unit\Migrations;

use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

final class AddIncidentCycleIdToTablesMigrationTest extends TestCase
{
    private const CONNECTION = 'incident_cycle_migration_isolation';

    private const ADMIN_CONNECTION = 'incident_cycle_migration_admin';

    private array $tables = [
        'core.incident_states',
        'core.incident_comments',
        'core.incident_attachments',
        'core.incident_assignments',
    ];

    private string $database;

    private string $originalDefaultConnection;

    private bool $connectionConfigExisted;

    private mixed $originalConnectionConfig;

    private bool $adminConnectionConfigExisted;

    private mixed $originalAdminConnectionConfig;

    protected function setUp(): void
    {
        parent::setUp();

        $this->originalDefaultConnection = config('database.default');
        $this->connectionConfigExisted = Config::has('database.connections.'.self::CONNECTION);
        $this->originalConnectionConfig = Config::get('database.connections.'.self::CONNECTION);
        $this->adminConnectionConfigExisted = Config::has('database.connections.'.self::ADMIN_CONNECTION);
        $this->originalAdminConnectionConfig = Config::get('database.connections.'.self::ADMIN_CONNECTION);

        $connection = config('database.connections.pgsql');
        $adminConnection = $connection;
        $adminConnection['database'] = 'postgres';

        Config::set('database.connections.'.self::ADMIN_CONNECTION, $adminConnection);
        DB::purge(self::ADMIN_CONNECTION);

        try {
            DB::connection(self::ADMIN_CONNECTION)->getPdo();
        } catch (\Exception $e) {
            $this->markTestSkipped('PostgreSQL is not available: '.$e->getMessage());
        }

        $this->database = sprintf('incident_cycle_migration_%d_%s', getmypid(), bin2hex(random_bytes(4)));

        DB::connection(self::ADMIN_CONNECTION)->unprepared(sprintf('CREATE DATABASE "%s"', $this->database));

        $connection['database'] = $this->database;
        Config::set('database.connections.'.self::CONNECTION, $connection);
        DB::purge(self::CONNECTION);
        Config::set('database.default', self::CONNECTION);

        $schema = DB::connection(self::CONNECTION);
        $schema->unprepared('CREATE SCHEMA core');
        $schema->unprepared('CREATE TABLE core.incident_cycles (id BIGINT PRIMARY KEY)');

        foreach ($this->tables as $table) {
            $schema->unprepared(sprintf('CREATE TABLE %s (id BIGINT PRIMARY KEY, incident_id BIGINT NOT NULL)', $table));
        }
    }

    protected function tearDown(): void
    {
        try {
            DB::purge(self::CONNECTION);
        } finally {
            try {
                if (isset($this->database)) {
                    try {
                        DB::connection(self::ADMIN_CONNECTION)->unprepared(sprintf('DROP DATABASE IF EXISTS "%s"', $this->database));
                    } catch (\Exception) {
                        // Nothing to clean up — connection never established.
                    }
                }
            } finally {
                try {
                    DB::purge(self::ADMIN_CONNECTION);
                } finally {
                    $this->restoreConnectionConfig(
                        self::CONNECTION,
                        $this->connectionConfigExisted,
                        $this->originalConnectionConfig
                    );
                    $this->restoreConnectionConfig(
                        self::ADMIN_CONNECTION,
                        $this->adminConnectionConfigExisted,
                        $this->originalAdminConnectionConfig
                    );
                    Config::set('database.default', $this->originalDefaultConnection);

                    parent::tearDown();
                }
            }
        }
    }

    public function test_up_and_down_apply_and_remove_cycle_columns_foreign_keys_and_indexes_in_postgresql(): void
    {
        $migration = require base_path('database/migrations/2026_07_17_000007_add_incident_cycle_id_to_tables.php');

        $migration->up();

        foreach ($this->tables as $table) {
            $this->assertTrue($this->columnExists($table), "{$table} should contain incident_cycle_id after up().");
            $this->assertTrue($this->foreignKeyExists($table), "{$table} should reference core.incident_cycles after up().");
            $this->assertTrue($this->indexExists($table), "{$table} should index incident_cycle_id after up().");
        }

        $migration->down();

        foreach ($this->tables as $table) {
            $this->assertFalse($this->columnExists($table), "{$table} should not contain incident_cycle_id after down().");
            $this->assertFalse($this->foreignKeyExists($table), "{$table} should not reference core.incident_cycles after down().");
            $this->assertFalse($this->indexExists($table), "{$table} should not index incident_cycle_id after down().");
        }
    }

    private function columnExists(string $table): bool
    {
        return (bool) DB::connection(self::CONNECTION)->scalar(
            'SELECT EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = ? AND table_name = ? AND column_name = ?
            )',
            [...explode('.', $table), 'incident_cycle_id']
        );
    }

    private function foreignKeyExists(string $table): bool
    {
        return (bool) DB::connection(self::CONNECTION)->scalar(
            "SELECT EXISTS (
                SELECT 1
                FROM pg_constraint
                WHERE contype = 'f'
                    AND conrelid = ?::regclass
                    AND confrelid = 'core.incident_cycles'::regclass
                    AND confdeltype = 'r'
                    AND pg_get_constraintdef(oid) LIKE '%FOREIGN KEY (incident_cycle_id)%'
            )",
            [$table]
        );
    }

    private function indexExists(string $table): bool
    {
        return (bool) DB::connection(self::CONNECTION)->scalar(
            "SELECT EXISTS (
                SELECT 1
                FROM pg_index
                INNER JOIN pg_attribute ON pg_attribute.attrelid = pg_index.indrelid
                    AND pg_attribute.attnum = ANY(pg_index.indkey)
                WHERE pg_index.indrelid = ?::regclass
                    AND pg_index.indisprimary = false
                    AND pg_index.indnatts = 1
                    AND pg_attribute.attname = 'incident_cycle_id'
            )",
            [$table]
        );
    }

    private function restoreConnectionConfig(string $connection, bool $existed, mixed $value): void
    {
        $key = 'database.connections.'.$connection;

        if ($existed) {
            Config::set($key, $value);

            return;
        }

        Config::offsetUnset($key);
    }
}
